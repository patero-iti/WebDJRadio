/**
 * WebRadioDecksEngine.js
 * Implementation strictly adhering to WebRadioDecks.MD Codebible & Architecture Specification.
 * Handles dual-deck Web Audio graph, EQ filtering, volume gain, equal-power crossfader,
 * pitch scaling, looping, hot cues, metering analysers, and sample generation.
 */

class WebRadioDecksEngine {
  constructor() {
    // Standard AudioContext initialization with interactive latency
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: 'interactive' });
    
    // Master Output & Master Gain Node
    this.masterGain = this.ctx.createGain();
    
    // Master Analyser Node for VU Meter
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterAnalyser.smoothingTimeConstant = 0.8;
    
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
    
    // Live Microphone / Audio Input Node Chain
    this.micStream = null;
    this.micSourceNode = null;
    this.micGain = this.ctx.createGain();
    this.micGain.gain.value = 0.0; // starts muted/inactive
    this.micVolume = 1.0;
    this.isMicActive = false;
    this.micDeviceId = '';
    this.talkoverDucking = false;
    this.duckingGain = 0.35; // -9dB music ducking when talkover is active
    
    // Analyser Node for Mic VU Meter
    this.micAnalyser = this.ctx.createAnalyser();
    this.micAnalyser.fftSize = 256;
    this.micAnalyser.smoothingTimeConstant = 0.7;

    this.micGain.connect(this.micAnalyser);
    this.micAnalyser.connect(this.masterGain);

    // Crossfader position: 0.0 (Deck A full) to 1.0 (Deck B full)
    this.crossfaderPosition = 0.5;

    // Instantiate Deck A and Deck B
    this.decks = {
      A: this._createDeck('A'),
      B: this._createDeck('B')
    };

    // Track finish event callback for auto-relay/continuous play
    this.onTrackEnd = null;

    this.setCrossfader(0.5); // Centered equal-power crossfade
  }

  // Resume AudioContext on first user gesture
  async unlockAudio() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  _createDeck(id) {
    // 3-Band BiquadFilter EQ Nodes
    const lowEQ = this.ctx.createBiquadFilter();
    lowEQ.type = 'lowshelf';
    lowEQ.frequency.value = 320; // Hz

    const midEQ = this.ctx.createBiquadFilter();
    midEQ.type = 'peaking';
    midEQ.frequency.value = 1000; // Hz
    midEQ.Q.value = 1.0;

    const highEQ = this.ctx.createBiquadFilter();
    highEQ.type = 'highshelf';
    highEQ.frequency.value = 3200; // Hz

    // --- FX 1: Bi-directional High-Pass / Low-Pass Dual Filter ---
    const hpfNode = this.ctx.createBiquadFilter();
    hpfNode.type = 'highpass';
    hpfNode.frequency.value = 20; // 20 Hz default (off)
    hpfNode.Q.value = 0.7;

    const lpfNode = this.ctx.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = 20000; // 20 kHz default (off)
    lpfNode.Q.value = 0.7;

    // --- FX 2: Echo & Delay (BPM-synced) ---
    const delayInput = this.ctx.createGain();
    const delayDry = this.ctx.createGain();
    const delayWet = this.ctx.createGain();
    const delayNode = this.ctx.createDelay(5.0);
    delayNode.delayTime.value = 0.375;
    const delayFeedback = this.ctx.createGain();
    delayFeedback.gain.value = 0.4;
    const delayDampFilter = this.ctx.createBiquadFilter();
    delayDampFilter.type = 'lowpass';
    delayDampFilter.frequency.value = 4000;

    delayDry.gain.value = 1.0;
    delayWet.gain.value = 0.0;

    const delayOutput = this.ctx.createGain();
    delayInput.connect(delayDry);
    delayDry.connect(delayOutput);
    delayInput.connect(delayNode);
    delayNode.connect(delayDampFilter);
    delayDampFilter.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayDampFilter.connect(delayWet);
    delayWet.connect(delayOutput);

    // --- FX 3: Reverb (Convolver) ---
    const reverbInput = this.ctx.createGain();
    const reverbDry = this.ctx.createGain();
    const reverbWet = this.ctx.createGain();
    const reverbConvolver = this.ctx.createConvolver();
    reverbConvolver.buffer = this._generateReverbImpulse(2.0, 2.0);
    reverbDry.gain.value = 1.0;
    reverbWet.gain.value = 0.0;

    const reverbOutput = this.ctx.createGain();
    reverbInput.connect(reverbDry);
    reverbDry.connect(reverbOutput);
    reverbInput.connect(reverbConvolver);
    reverbConvolver.connect(reverbWet);
    reverbWet.connect(reverbOutput);

    // --- FX 4: Flanger / Phaser ---
    const flangerInput = this.ctx.createGain();
    const flangerDry = this.ctx.createGain();
    const flangerWet = this.ctx.createGain();
    const flangerDelay = this.ctx.createDelay(0.05);
    flangerDelay.delayTime.value = 0.003; // 3ms base delay
    const flangerFeedback = this.ctx.createGain();
    flangerFeedback.gain.value = 0.5;

    const flangerLFO = this.ctx.createOscillator();
    flangerLFO.type = 'sine';
    flangerLFO.frequency.value = 0.5;
    const flangerLFOGain = this.ctx.createGain();
    flangerLFOGain.gain.value = 0.002;
    flangerLFO.connect(flangerLFOGain);
    flangerLFOGain.connect(flangerDelay.delayTime);
    try { flangerLFO.start(); } catch (_) {}

    flangerDry.gain.value = 1.0;
    flangerWet.gain.value = 0.0;

    const flangerOutput = this.ctx.createGain();
    flangerInput.connect(flangerDry);
    flangerDry.connect(flangerOutput);
    flangerInput.connect(flangerDelay);
    flangerDelay.connect(flangerFeedback);
    flangerFeedback.connect(flangerDelay);
    flangerDelay.connect(flangerWet);
    flangerWet.connect(flangerOutput);

    // --- FX 5: Bitcrusher (Lo-Fi WaveShaper) ---
    const bitcrushInput = this.ctx.createGain();
    const bitcrushDry = this.ctx.createGain();
    const bitcrushWet = this.ctx.createGain();
    const bitcrushShaper = this.ctx.createWaveShaper();
    bitcrushShaper.curve = this._generateBitcrushCurve(4);
    bitcrushShaper.oversample = 'none';

    bitcrushDry.gain.value = 1.0;
    bitcrushWet.gain.value = 0.0;

    const bitcrushOutput = this.ctx.createGain();
    bitcrushInput.connect(bitcrushDry);
    bitcrushDry.connect(bitcrushOutput);
    bitcrushInput.connect(bitcrushShaper);
    bitcrushShaper.connect(bitcrushWet);
    bitcrushWet.connect(bitcrushOutput);

    // Volume & Crossfade Gain Nodes
    const volumeGain = this.ctx.createGain();
    const xfadeGain = this.ctx.createGain();

    // Analyser Node for Deck Level Metering
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;

    // Audio Graph Chain: low -> mid -> high -> HPF -> LPF -> Delay -> Reverb -> Flanger -> Bitcrusher -> volume -> xfade -> analyser -> master
    lowEQ.connect(midEQ);
    midEQ.connect(highEQ);
    highEQ.connect(hpfNode);
    hpfNode.connect(lpfNode);
    lpfNode.connect(delayInput);
    delayOutput.connect(reverbInput);
    reverbOutput.connect(flangerInput);
    flangerOutput.connect(bitcrushInput);
    bitcrushOutput.connect(volumeGain);
    volumeGain.connect(xfadeGain);
    xfadeGain.connect(analyser);
    analyser.connect(this.masterGain);

    return {
      id,
      buffer: null,
      source: null,
      nodes: {
        lowEQ, midEQ, highEQ,
        hpfNode, lpfNode,
        delayInput, delayDry, delayWet, delayNode, delayFeedback, delayDampFilter, delayOutput,
        reverbInput, reverbDry, reverbWet, reverbConvolver, reverbOutput,
        flangerInput, flangerDry, flangerWet, flangerDelay, flangerFeedback, flangerLFO, flangerLFOGain, flangerOutput,
        bitcrushInput, bitcrushDry, bitcrushWet, bitcrushShaper, bitcrushOutput,
        volumeGain, xfadeGain, analyser
      },
      isPlaying: false,
      startTime: 0,
      pauseOffset: 0,
      playbackRate: 1.0,
      pitchNudge: 0,
      bpm: 120,
      title: `Deck ${id} Track`,
      artist: 'Unknown Artist',
      cuePoint: 0,
      hotCues: [null, null, null, null], // 4 Hot Cue markers (seconds)
      isLooping: false,
      loopStart: 0,
      loopEnd: 0,
      isRolling: false,
      rollStartRealTime: 0,
      rollStartTrackTime: 0,
      priorLoopState: null,
      eqGains: { low: 0, mid: 0, high: 0 },
      fx: {
        filter: 0,
        delay: { beats: 0.5, feedback: 0.4, damping: 4000, mix: 0.5, active: false },
        reverb: { decay: 2.0, mix: 0.4, active: false },
        flanger: { mode: 'flanger', rate: 0.5, depth: 0.002, feedback: 0.5, mix: 0.5, active: false },
        bitcrusher: { bits: 4, mix: 0.5, active: false }
      },
      volume: 1.0
    };
  }

  // Load track from File object, URL string, ArrayBuffer, or AudioBuffer
  async loadTrack(deckId, audioSource, metadata = {}) {
    let decodedBuffer;

    // Handle nested buffer properties if passed
    if (audioSource && audioSource.audioSource) {
      audioSource = audioSource.audioSource;
    }
    if (audioSource && audioSource.buffer && !(audioSource instanceof AudioBuffer)) {
      audioSource = audioSource.buffer;
    }

    // Check if audioSource is already a decoded AudioBuffer
    if (audioSource && (audioSource instanceof AudioBuffer || (typeof audioSource.numberOfChannels === 'number' && typeof audioSource.getChannelData === 'function'))) {
      decodedBuffer = audioSource;
    } else {
      let arrayBuffer;
      if (audioSource instanceof File || audioSource instanceof Blob) {
        arrayBuffer = await audioSource.arrayBuffer();
        if (!metadata.title && audioSource.name) metadata.title = audioSource.name.replace(/\.[^/.]+$/, "");
      } else if (typeof audioSource === 'string') {
        const response = await fetch(audioSource);
        arrayBuffer = await response.arrayBuffer();
      } else if (audioSource instanceof ArrayBuffer) {
        arrayBuffer = audioSource;
      } else if (audioSource && audioSource.buffer instanceof ArrayBuffer) {
        arrayBuffer = audioSource.buffer;
      } else {
        throw new Error(`Unsupported audio source format: ${typeof audioSource}`);
      }

      decodedBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    }

    const deck = this.decks[deckId];

    this.stop(deckId);
    deck.buffer = decodedBuffer;
    deck.pauseOffset = 0;
    deck.cuePoint = 0;
    deck.hotCues = [null, null, null, null];
    deck.isLooping = false;
    deck.title = metadata.title || 'Loaded Track';
    deck.artist = metadata.artist || 'WebDJ Collection';
    deck.bpm = (metadata.bpm && metadata.bpm > 0) ? metadata.bpm : this._estimateBPM(decodedBuffer);
    deck.key = metadata.key || this._estimateKey(decodedBuffer);

    return deck;
  }

  // Zero-latency instant trigger playback
  play(deckId) {
    const deck = this.decks[deckId];
    if (!deck.buffer || deck.isPlaying) return;

    this.unlockAudio();

    deck.source = this.ctx.createBufferSource();
    deck.source.buffer = deck.buffer;
    deck.source.playbackRate.value = deck.playbackRate + deck.pitchNudge;

    // Loop configuration
    if (deck.isLooping && deck.loopEnd > deck.loopStart) {
      deck.source.loop = true;
      deck.source.loopStart = deck.loopStart;
      deck.source.loopEnd = deck.loopEnd;
    }

    deck.source.connect(deck.nodes.lowEQ);

    // Precise sub-millisecond scheduling
    const offset = deck.pauseOffset % deck.buffer.duration;
    deck.startTime = this.ctx.currentTime - (offset / deck.source.playbackRate.value);
    deck.source.start(0, offset);
    deck.isPlaying = true;

    deck.source.onended = () => {
      if (!deck.isLooping && (this.getCurrentTime(deckId) >= deck.buffer.duration - 0.15)) {
        deck.isPlaying = false;
        deck.pauseOffset = 0;
        if (deck.source) {
          try { deck.source.disconnect(); } catch (_) {}
          deck.source = null;
        }
        if (typeof this.onTrackEnd === 'function') {
          this.onTrackEnd(deckId);
        }
      }
    };
  }

  pause(deckId) {
    const deck = this.decks[deckId];
    if (!deck.isPlaying) return;

    deck.pauseOffset = this.getCurrentTime(deckId);
    if (deck.source) {
      try { deck.source.stop(0); } catch (_) {}
      deck.source.disconnect();
      deck.source = null;
    }
    deck.isPlaying = false;
  }

  stop(deckId) {
    const deck = this.decks[deckId];
    if (deck.source) {
      try { deck.source.stop(0); } catch (_) {}
      deck.source.disconnect();
      deck.source = null;
    }
    deck.isPlaying = false;
    deck.pauseOffset = 0;
  }

  // Jump to Cue point or preview Cue on hold
  cue(deckId) {
    const deck = this.decks[deckId];
    if (deck.isPlaying) {
      // Return to Cue point & pause
      this.pause(deckId);
      deck.pauseOffset = deck.cuePoint;
    } else {
      // Set Cue point to current position
      deck.cuePoint = deck.pauseOffset;
      this.play(deckId);
    }
  }

  // Jump to specific time position in seconds
  seek(deckId, targetTime) {
    const deck = this.decks[deckId];
    if (!deck.buffer) return;

    const clampedTime = Math.max(0, Math.min(targetTime, deck.buffer.duration));
    const wasPlaying = deck.isPlaying;

    if (wasPlaying) {
      this.pause(deckId);
      deck.pauseOffset = clampedTime;
      this.play(deckId);
    } else {
      deck.pauseOffset = clampedTime;
    }
  }

  // Get current elapsed playback time in seconds
  getCurrentTime(deckId) {
    const deck = this.decks[deckId];
    if (!deck.buffer) return 0;

    if (deck.isPlaying && deck.source) {
      const elapsed = (this.ctx.currentTime - deck.startTime) * deck.source.playbackRate.value;
      if (deck.isLooping && deck.loopEnd > deck.loopStart) {
        const loopLen = deck.loopEnd - deck.loopStart;
        if (elapsed >= deck.loopStart) {
          return deck.loopStart + ((elapsed - deck.loopStart) % loopLen);
        }
      }
      return Math.min(elapsed, deck.buffer.duration);
    }
    return deck.pauseOffset;
  }

  // Equalizer Controls (dB gain: -24dB to +6dB)
  setEQ(deckId, band, gainValue) {
    const val = parseFloat(gainValue);
    const nodeMap = {
      low: this.decks[deckId].nodes.lowEQ,
      mid: this.decks[deckId].nodes.midEQ,
      high: this.decks[deckId].nodes.highEQ
    };
    if (nodeMap[band]) {
      this.decks[deckId].eqGains[band] = val;
      nodeMap[band].gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
    }
  }

  // Deck Volume Fader (0.0 to 1.0)
  setDeckVolume(deckId, volume) {
    const val = Math.max(0, Math.min(1, parseFloat(volume)));
    this.decks[deckId].volume = val;
    this.decks[deckId].nodes.volumeGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
  }

  // Master Volume (0.0 to 1.0)
  setMasterVolume(volume) {
    const val = Math.max(0, Math.min(1, parseFloat(volume)));
    this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
  }

  // Live Master Audio Stream for Broadcasting / Streaming (WebRTC, Icecast, Shoutcast)
  getMasterMediaStream() {
    if (!this.masterStreamDest) {
      this.masterStreamDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.masterStreamDest);
    }
    return this.masterStreamDest.stream;
  }

  // Set audio output device (e.g. Speakers, BlackHole 2ch, Loopback, or Virtual Cable for B.U.T.T.)
  async setOutputDevice(deviceId) {
    try {
      if (typeof this.ctx.setSinkId === 'function') {
        await this.ctx.setSinkId(deviceId || '');
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Could not set AudioContext sinkId:', err);
      return false;
    }
  }

  static async getAudioOutputDevices(requestPermission = false) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      if (requestPermission && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (permErr) {
          console.warn('Audio output device permission prompt declined:', permErr);
        }
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audiooutput');
    } catch (_) {
      return [];
    }
  }

  // Set and connect Live Microphone / Audio Input Device (Bluetooth, Interface, Line-In)
  async setAudioInputDevice(deviceId) {
    this.micDeviceId = deviceId || '';

    // Stop active stream tracks if any
    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach(t => t.stop());
      } catch (_) {}
      this.micStream = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (_) {}
      this.micSourceNode = null;
    }

    try {
      const constraints = {
        audio: this.micDeviceId
          ? { deviceId: { exact: this.micDeviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true }
      };
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micSourceNode = this.ctx.createMediaStreamSource(this.micStream);
      this.micSourceNode.connect(this.micGain);

      // If mic is active, apply gain
      if (this.isMicActive) {
        this.micGain.gain.setTargetAtTime(this.micVolume, this.ctx.currentTime, 0.02);
      }
      return true;
    } catch (err) {
      console.warn('Could not connect audio input device:', err);
      return false;
    }
  }

  // Set Microphone Volume / Gain (0.0 to 1.5)
  setMicVolume(volume) {
    this.micVolume = Math.max(0, Math.min(2.0, parseFloat(volume) || 0));
    if (this.isMicActive) {
      this.micGain.gain.setTargetAtTime(this.micVolume, this.ctx.currentTime, 0.02);
    }
  }

  // Toggle or Set Microphone Active State (Mute / Unmute / ON AIR)
  async setMicActive(active) {
    this.isMicActive = !!active;

    // Connect stream on first activation if needed
    if (this.isMicActive && !this.micStream) {
      const ok = await this.setAudioInputDevice(this.micDeviceId);
      if (!ok) {
        this.isMicActive = false;
        return false;
      }
    }

    const targetGain = this.isMicActive ? this.micVolume : 0.0;
    this.micGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.03);

    // Apply auto-ducking to music if talkover is enabled
    this._applyTalkoverDucking();
    return this.isMicActive;
  }

  // Toggle Talkover Ducking
  setTalkoverDucking(enabled) {
    this.talkoverDucking = !!enabled;
    this._applyTalkoverDucking();
  }

  _applyTalkoverDucking() {
    const duckFactor = (this.talkoverDucking && this.isMicActive) ? this.duckingGain : 1.0;
    const gainA = Math.cos(this.crossfaderPosition * 0.5 * Math.PI) * duckFactor;
    const gainB = Math.sin(this.crossfaderPosition * 0.5 * Math.PI) * duckFactor;

    this.decks.A.nodes.xfadeGain.gain.setTargetAtTime(gainA, this.ctx.currentTime, 0.04);
    this.decks.B.nodes.xfadeGain.gain.setTargetAtTime(gainB, this.ctx.currentTime, 0.04);
  }

  getMicPeakLevel() {
    if (!this.isMicActive || !this.micStream) return 0;
    const data = new Uint8Array(this.micAnalyser.frequencyBinCount);
    this.micAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return Math.min(1.0, (sum / data.length) / 180 * (this.micVolume || 1.0));
  }

  static async getAudioInputDevices(requestPermission = false) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      if (requestPermission && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (permErr) {
          console.warn('Audio input device permission prompt declined:', permErr);
        }
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audioinput');
    } catch (_) {
      return [];
    }
  }

  // Equal-Power Crossfader Curve (0.0 = Deck A, 1.0 = Deck B)
  setCrossfader(position) {
    this.crossfaderPosition = Math.max(0, Math.min(1, parseFloat(position)));
    this._applyTalkoverDucking();
  }

  // Pitch / Playback Rate slider setting (e.g., rate = 1.0 for 100%, 1.08 for +8%)
  setPlaybackRate(deckId, rate) {
    const deck = this.decks[deckId];
    deck.playbackRate = parseFloat(rate);
    if (deck.source) {
      deck.source.playbackRate.setTargetAtTime(deck.playbackRate + deck.pitchNudge, this.ctx.currentTime, 0.02);
    }
  }

  // Temporary Pitch Nudge (+/- for beatmatching)
  setPitchNudge(deckId, nudgeVal) {
    const deck = this.decks[deckId];
    deck.pitchNudge = parseFloat(nudgeVal);
    if (deck.source) {
      deck.source.playbackRate.setTargetAtTime(deck.playbackRate + deck.pitchNudge, this.ctx.currentTime, 0.01);
    }
  }

  // Hot Cue trigger: slot index 0..3
  triggerHotCue(deckId, slotIndex) {
    const deck = this.decks[deckId];
    if (deck.hotCues[slotIndex] === null) {
      // Store current position
      deck.hotCues[slotIndex] = this.getCurrentTime(deckId);
      return { action: 'set', time: deck.hotCues[slotIndex] };
    } else {
      // Jump to stored position
      this.seek(deckId, deck.hotCues[slotIndex]);
      if (!deck.isPlaying) this.play(deckId);
      return { action: 'jump', time: deck.hotCues[slotIndex] };
    }
  }

  clearHotCue(deckId, slotIndex) {
    this.decks[deckId].hotCues[slotIndex] = null;
  }

  // Auto Beat Loop setup (beats: 1, 2, 4, 8, 16)
  setBeatLoop(deckId, beats) {
    const deck = this.decks[deckId];
    if (!deck.buffer) return;

    const secondsPerBeat = 60 / deck.bpm;
    const loopDuration = beats * secondsPerBeat;
    const current = this.getCurrentTime(deckId);

    deck.loopStart = current;
    deck.loopEnd = Math.min(deck.buffer.duration, current + loopDuration);
    deck.isLooping = true;

    if (deck.isPlaying) {
      this.pause(deckId);
      deck.pauseOffset = current;
      this.play(deckId);
    }
  }

  toggleLoop(deckId) {
    const deck = this.decks[deckId];
    deck.isLooping = !deck.isLooping;
    if (deck.isPlaying) {
      this.pause(deckId);
      this.play(deckId);
    }
  }

  // BPM Synchronization (Sync Deck A to Deck B or vice-versa)
  syncBPM(targetDeckId, sourceDeckId) {
    const target = this.decks[targetDeckId];
    const source = this.decks[sourceDeckId];
    if (!target.bpm || !source.bpm) return;

    const targetBaseBpm = target.bpm;
    const sourceEffectiveBpm = source.bpm * (source.playbackRate + source.pitchNudge);
    const newRate = sourceEffectiveBpm / targetBaseBpm;

    this.setPlaybackRate(targetDeckId, newRate);
  }

  getDeck(deckId) {
    return (this.decks && this.decks[deckId]) ? this.decks[deckId] : null;
  }

  // Audio Level Metering (returns 0.0 to 1.0 peak amplitude)
  getDeckPeakLevel(deckId) {
    const analyser = this.decks[deckId].nodes.analyser;
    if (!this.decks[deckId].isPlaying) return 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return (sum / data.length) / 255;
  }

  getMasterPeakLevel() {
    const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return (sum / data.length) / 255;
  }

  _estimateBPM(audioBuffer) {
    if (typeof AudioDSPAnalyzer !== 'undefined' && AudioDSPAnalyzer.analyzeBPM) {
      return AudioDSPAnalyzer.analyzeBPM(audioBuffer);
    }
    return 124.0;
  }

  _estimateKey(audioBuffer) {
    if (typeof AudioDSPAnalyzer !== 'undefined' && AudioDSPAnalyzer.analyzeKey) {
      return AudioDSPAnalyzer.analyzeKey(audioBuffer);
    }
    return '8A (Am)';
  }

  /**
   * Synthesizes high quality DJ synth beat tracks directly in Web Audio
   * to allow instant DJing out-of-the-box.
   */
  async generateDemoTrack(type = 'house') {
    const sampleRate = 44100;
    const bpm = type === 'techno' ? 130 : type === 'disco' ? 120 : 126;
    const durationSec = 32; // 32-second loop track
    const length = sampleRate * durationSec;
    const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
    
    const secondsPerBeat = 60 / bpm;
    const totalBeats = Math.floor(durationSec / secondsPerBeat);

    // Master Gain for offline bounce
    const master = offlineCtx.createGain();
    master.gain.value = 0.8;
    master.connect(offlineCtx.destination);

    // Kick Drum Generator
    for (let b = 0; b < totalBeats; b++) {
      const time = b * secondsPerBeat;
      // Kick on every beat (4-on-the-floor)
      const kickOsc = offlineCtx.createOscillator();
      const kickGain = offlineCtx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(140, time);
      kickOsc.frequency.exponentialRampToValueAtTime(38, time + 0.08);
      kickGain.gain.setValueAtTime(1.0, time);
      kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

      kickOsc.connect(kickGain);
      kickGain.connect(master);
      kickOsc.start(time);
      kickOsc.stop(time + 0.25);

      // Off-beat Hi-Hat
      const hatTime = time + secondsPerBeat * 0.5;
      const hatBuffer = offlineCtx.createBuffer(1, sampleRate * 0.05, sampleRate);
      const hatData = hatBuffer.getChannelData(0);
      for (let i = 0; i < hatData.length; i++) {
        hatData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.008));
      }
      const hatNode = offlineCtx.createBufferSource();
      hatNode.buffer = hatBuffer;
      const hatFilter = offlineCtx.createBiquadFilter();
      hatFilter.type = 'highpass';
      hatFilter.frequency.value = 7000;
      hatNode.connect(hatFilter);
      hatFilter.connect(master);
      hatNode.start(hatTime);

      // Clap / Snare on beats 2 and 4
      if (b % 2 === 1) {
        const snareBuffer = offlineCtx.createBuffer(1, sampleRate * 0.15, sampleRate);
        const snareData = snareBuffer.getChannelData(0);
        for (let i = 0; i < snareData.length; i++) {
          snareData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.03));
        }
        const snareNode = offlineCtx.createBufferSource();
        snareNode.buffer = snareBuffer;
        const snareFilter = offlineCtx.createBiquadFilter();
        snareFilter.type = 'bandpass';
        snareFilter.frequency.value = 1200;
        snareNode.connect(snareFilter);
        snareFilter.connect(master);
        snareNode.start(time);
      }
    }

    // Bassline Synthesis
    const bassNotes = type === 'techno' ? [36, 36, 38, 36] : [40, 43, 45, 43];
    for (let b = 0; b < totalBeats; b++) {
      const time = b * secondsPerBeat + secondsPerBeat * 0.25;
      const note = bassNotes[b % bassNotes.length];
      const freq = 440 * Math.pow(2, (note - 69) / 12);

      const bassOsc = offlineCtx.createOscillator();
      const bassGain = offlineCtx.createGain();
      const bassFilter = offlineCtx.createBiquadFilter();

      bassOsc.type = type === 'techno' ? 'sawtooth' : 'triangle';
      bassOsc.frequency.setValueAtTime(freq, time);

      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(800, time);
      bassFilter.frequency.exponentialRampToValueAtTime(150, time + 0.2);

      bassGain.gain.setValueAtTime(0.6, time);
      bassGain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(master);

      bassOsc.start(time);
      bassOsc.stop(time + 0.25);
    }

    const renderedBuffer = await offlineCtx.startRendering();
    return {
      buffer: renderedBuffer,
      bpm: bpm,
      title: `${type.toUpperCase()} Groove (${bpm} BPM)`,
      key: type === 'techno' ? '5A (Cm)' : type === 'disco' ? '8B (C)' : '9A (Em)'
    };
  }

  // -------------------------------------------------------------------------
  // Software FX Engine Methods
  // -------------------------------------------------------------------------

  _generateReverbImpulse(duration = 2.0, decay = 2.0) {
    const sampleRate = this.ctx.sampleRate || 44100;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return impulse;
  }

  _generateBitcrushCurve(bits = 4) {
    const samples = 4096;
    const curve = new Float32Array(samples);
    const step = Math.pow(2, bits - 1);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.round(x * step) / step;
    }
    return curve;
  }

  // 1. Dual Filter: val = -1.0 (LPF Cut) to +1.0 (HPF Cut), 0.0 = Off
  setFilter(deckId, val) {
    const deck = this.decks[deckId];
    if (!deck) return;
    const value = Math.max(-1, Math.min(1, parseFloat(val) || 0));
    deck.fx.filter = value;

    const hpf = deck.nodes.hpfNode;
    const lpf = deck.nodes.lpfNode;

    if (value < 0) {
      // LPF engaged: sweep cutoff from 20000Hz down to 100Hz
      const cutoff = 20000 * Math.pow(100 / 20000, -value);
      lpf.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.015);
      hpf.frequency.setTargetAtTime(20, this.ctx.currentTime, 0.015);
      lpf.Q.setTargetAtTime(0.7 + Math.abs(value) * 3.5, this.ctx.currentTime, 0.015);
    } else if (value > 0) {
      // HPF engaged: sweep cutoff from 20Hz up to 8000Hz
      const cutoff = 20 * Math.pow(8000 / 20, value);
      hpf.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.015);
      lpf.frequency.setTargetAtTime(20000, this.ctx.currentTime, 0.015);
      hpf.Q.setTargetAtTime(0.7 + Math.abs(value) * 3.5, this.ctx.currentTime, 0.015);
    } else {
      // Flat bypass
      lpf.frequency.setTargetAtTime(20000, this.ctx.currentTime, 0.015);
      hpf.frequency.setTargetAtTime(20, this.ctx.currentTime, 0.015);
      lpf.Q.setTargetAtTime(0.7, this.ctx.currentTime, 0.015);
      hpf.Q.setTargetAtTime(0.7, this.ctx.currentTime, 0.015);
    }
  }

  // 2. Echo & Delay (BPM-synced or time-based)
  setDelay(deckId, opts = {}) {
    const deck = this.decks[deckId];
    if (!deck) return;
    const fx = deck.fx.delay;
    if (opts.beats !== undefined) fx.beats = parseFloat(opts.beats);
    if (opts.feedback !== undefined) fx.feedback = Math.max(0, Math.min(0.92, parseFloat(opts.feedback)));
    if (opts.damping !== undefined) fx.damping = parseFloat(opts.damping);
    if (opts.mix !== undefined) fx.mix = Math.max(0, Math.min(1, parseFloat(opts.mix)));
    if (opts.active !== undefined) fx.active = !!opts.active;

    const delayTime = opts.time !== undefined ? parseFloat(opts.time) : ((60 / deck.bpm) * fx.beats);
    deck.nodes.delayNode.delayTime.setTargetAtTime(Math.max(0.01, Math.min(4.0, delayTime)), this.ctx.currentTime, 0.02);
    deck.nodes.delayFeedback.gain.setTargetAtTime(fx.feedback, this.ctx.currentTime, 0.02);
    deck.nodes.delayDampFilter.frequency.setTargetAtTime(fx.damping || 4000, this.ctx.currentTime, 0.02);
    deck.nodes.delayWet.gain.setTargetAtTime(fx.active ? fx.mix : 0, this.ctx.currentTime, 0.02);
  }

  // 3. Reverb
  setReverb(deckId, opts = {}) {
    const deck = this.decks[deckId];
    if (!deck) return;
    const fx = deck.fx.reverb;
    if (opts.decay !== undefined && opts.decay !== fx.decay) {
      fx.decay = Math.max(0.5, Math.min(6.0, parseFloat(opts.decay)));
      deck.nodes.reverbConvolver.buffer = this._generateReverbImpulse(fx.decay, fx.decay);
    }
    if (opts.mix !== undefined) fx.mix = Math.max(0, Math.min(1, parseFloat(opts.mix)));
    if (opts.active !== undefined) fx.active = !!opts.active;

    deck.nodes.reverbWet.gain.setTargetAtTime(fx.active ? fx.mix : 0, this.ctx.currentTime, 0.02);
  }

  // 4. Flanger / Phaser
  setFlanger(deckId, opts = {}) {
    const deck = this.decks[deckId];
    if (!deck) return;
    const fx = deck.fx.flanger;
    if (opts.mode !== undefined) fx.mode = opts.mode;
    if (opts.rate !== undefined) fx.rate = Math.max(0.05, Math.min(8.0, parseFloat(opts.rate)));
    if (opts.depth !== undefined) fx.depth = Math.max(0.0005, Math.min(0.01, parseFloat(opts.depth)));
    if (opts.feedback !== undefined) fx.feedback = Math.max(0, Math.min(0.88, parseFloat(opts.feedback)));
    if (opts.mix !== undefined) fx.mix = Math.max(0, Math.min(1, parseFloat(opts.mix)));
    if (opts.active !== undefined) fx.active = !!opts.active;

    deck.nodes.flangerLFO.frequency.setTargetAtTime(fx.rate, this.ctx.currentTime, 0.02);
    deck.nodes.flangerLFOGain.gain.setTargetAtTime(fx.depth, this.ctx.currentTime, 0.02);
    deck.nodes.flangerFeedback.gain.setTargetAtTime(fx.feedback, this.ctx.currentTime, 0.02);
    deck.nodes.flangerWet.gain.setTargetAtTime(fx.active ? fx.mix : 0, this.ctx.currentTime, 0.02);
  }

  // 5. Bitcrusher
  setBitcrusher(deckId, opts = {}) {
    const deck = this.decks[deckId];
    if (!deck) return;
    const fx = deck.fx.bitcrusher;
    if (opts.bits !== undefined && opts.bits !== fx.bits) {
      fx.bits = Math.max(2, Math.min(16, parseInt(opts.bits)));
      deck.nodes.bitcrushShaper.curve = this._generateBitcrushCurve(fx.bits);
    }
    if (opts.mix !== undefined) fx.mix = Math.max(0, Math.min(1, parseFloat(opts.mix)));
    if (opts.active !== undefined) fx.active = !!opts.active;

    deck.nodes.bitcrushWet.gain.setTargetAtTime(fx.active ? fx.mix : 0, this.ctx.currentTime, 0.02);
  }

  // 6. Performance Beat Roll (Instant Momentary Loop)
  startBeatRoll(deckId, beats = 0.5) {
    const deck = this.decks[deckId];
    if (!deck || !deck.buffer || !deck.isPlaying) return;

    const current = this.getCurrentTime(deckId);
    const secondsPerBeat = 60 / (deck.bpm || 120);
    const loopDuration = Math.max(0.02, parseFloat(beats) * secondsPerBeat);

    if (!deck.isRolling) {
      deck.isRolling = true;
      deck.rollStartRealTime = this.ctx.currentTime;
      deck.rollStartTrackTime = current;
      deck.priorLoopState = {
        isLooping: deck.isLooping,
        loopStart: deck.loopStart,
        loopEnd: deck.loopEnd
      };
    }

    deck.loopStart = current;
    deck.loopEnd = Math.min(deck.buffer.duration, current + loopDuration);
    deck.isLooping = true;

    // Instantly anchor the playback buffer into the tight loop cycle
    this.pause(deckId);
    deck.pauseOffset = current;
    this.play(deckId);
  }

  stopBeatRoll(deckId) {
    const deck = this.decks[deckId];
    if (!deck) return;

    deck.isRolling = false;

    // Disengage roll loop immediately so the track seamlessly continues playback forward as normal
    if (deck.priorLoopState && deck.priorLoopState.isLooping) {
      deck.isLooping = true;
      deck.loopStart = deck.priorLoopState.loopStart;
      deck.loopEnd = deck.priorLoopState.loopEnd;
      if (deck.source) {
        deck.source.loop = true;
        deck.source.loopStart = deck.loopStart;
        deck.source.loopEnd = deck.loopEnd;
      }
    } else {
      deck.isLooping = false;
      if (deck.source) {
        deck.source.loop = false;
      }
    }
    deck.priorLoopState = null;
  }
}
