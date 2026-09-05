/**
 * midi.js - WebDJRadio USB MIDI Controller Support
 * Uses the Web MIDI API to detect controllers and map messages
 * to WebRadioDecksEngine actions.
 *
 * Built-in presets: Pioneer DDJ-200, DDJ-400, Numark Party Mix,
 * Behringer CMD Studio/Micro. Falls back to generic learn mode.
 */

const MIDI_ACTIONS = {
  play:          { deck: true,  type: 'trigger', desc: 'Play / Pause' },
  cue:           { deck: true,  type: 'trigger', desc: 'Cue' },
  sync:          { deck: true,  type: 'trigger', desc: 'Sync BPM' },
  loop_toggle:   { deck: true,  type: 'trigger', desc: 'Loop Toggle' },
  loop_1:        { deck: true,  type: 'trigger', desc: 'Loop 1 Beat' },
  loop_2:        { deck: true,  type: 'trigger', desc: 'Loop 2 Beats' },
  loop_4:        { deck: true,  type: 'trigger', desc: 'Loop 4 Beats' },
  loop_8:        { deck: true,  type: 'trigger', desc: 'Loop 8 Beats' },
  hot_cue_1:     { deck: true,  type: 'trigger', desc: 'Hot Cue 1' },
  hot_cue_2:     { deck: true,  type: 'trigger', desc: 'Hot Cue 2' },
  hot_cue_3:     { deck: true,  type: 'trigger', desc: 'Hot Cue 3' },
  hot_cue_4:     { deck: true,  type: 'trigger', desc: 'Hot Cue 4' },
  pitch:         { deck: true,  type: 'cc',      desc: 'Pitch / Tempo Fader' },
  volume:        { deck: true,  type: 'cc',      desc: 'Channel Volume' },
  eq_high:       { deck: true,  type: 'cc',      desc: 'EQ High' },
  eq_mid:        { deck: true,  type: 'cc',      desc: 'EQ Mid' },
  eq_low:        { deck: true,  type: 'cc',      desc: 'EQ Low' },
  filter:        { deck: true,  type: 'cc',      desc: 'Dual Filter (LPF/HPF)' },
  jog_scratch:   { deck: true,  type: 'cc',      desc: 'Jog Wheel (Scratch)' },
  crossfader:    { deck: false, type: 'cc',      desc: 'Crossfader' },
  master_volume: { deck: false, type: 'cc',      desc: 'Master Volume' },
  beat_roll_1_8: { deck: true,  type: 'trigger', desc: 'Beat Roll 1/8 (Slip)' },
  beat_roll_1_4: { deck: true,  type: 'trigger', desc: 'Beat Roll 1/4 (Slip)' },
  beat_roll_1_2: { deck: true,  type: 'trigger', desc: 'Beat Roll 1/2 (Slip)' },
  beat_roll_1:   { deck: true,  type: 'trigger', desc: 'Beat Roll 1 Beat (Slip)' },
  beat_roll_2:   { deck: true,  type: 'trigger', desc: 'Beat Roll 2 Beats (Slip)' },
  fx_delay_toggle:    { deck: true,  type: 'trigger', desc: 'FX Delay Toggle' },
  fx_delay_feedback:  { deck: true,  type: 'cc',      desc: 'FX Delay Feedback' },
  fx_reverb_toggle:   { deck: true,  type: 'trigger', desc: 'FX Reverb Toggle' },
  fx_reverb_mix:      { deck: true,  type: 'cc',      desc: 'FX Reverb Wet/Dry' },
  fx_flanger_toggle:  { deck: true,  type: 'trigger', desc: 'FX Flanger Toggle' },
  fx_flanger_feedback:{ deck: true,  type: 'cc',      desc: 'FX Flanger Feedback' },
  fx_bitcrush_toggle: { deck: true,  type: 'trigger', desc: 'FX Bitcrush Toggle' },
  fx_bitcrush_mix:    { deck: true,  type: 'cc',      desc: 'FX Bitcrush Wet/Dry' },
  auto_relay:         { deck: false, type: 'trigger', desc: 'Toggle Auto-Deck Relay' },
  cart_play_1:        { deck: false, type: 'trigger', desc: 'CART Pad 1 (Play / Retrigger)' },
  cart_play_2:        { deck: false, type: 'trigger', desc: 'CART Pad 2 (Play / Retrigger)' },
  cart_play_3:        { deck: false, type: 'trigger', desc: 'CART Pad 3 (Play / Retrigger)' },
  cart_play_4:        { deck: false, type: 'trigger', desc: 'CART Pad 4 (Play / Retrigger)' },
  cart_stop_all:      { deck: false, type: 'trigger', desc: 'CART Wall (Stop All Carts)' },
  cart_volume:        { deck: false, type: 'cc',      desc: 'CART Master Volume Fader' },
  mic_toggle:         { deck: false, type: 'trigger', desc: 'Live Mic ON AIR / Mute Toggle' },
  mic_talkover:       { deck: false, type: 'trigger', desc: 'Live Mic Talkover Ducking Toggle' },
  mic_volume:         { deck: false, type: 'cc',      desc: 'Live Mic Gain / Volume Fader' },
};

const MIDI_PRESETS = [
  {
    name: 'Pioneer DDJ-200',
    match: ['ddj-200', 'ddj200'],
    mappings: [
      { channel: 1, type: 'note', number: 11, action: 'play',       deck: 'A' },
      { channel: 1, type: 'note', number: 12, action: 'cue',        deck: 'A' },
      { channel: 1, type: 'note', number: 13, action: 'sync',       deck: 'A' },
      { channel: 1, type: 'note', number: 16, action: 'hot_cue_1',  deck: 'A' },
      { channel: 1, type: 'note', number: 17, action: 'hot_cue_2',  deck: 'A' },
      { channel: 1, type: 'note', number: 18, action: 'hot_cue_3',  deck: 'A' },
      { channel: 1, type: 'note', number: 19, action: 'hot_cue_4',  deck: 'A' },
      { channel: 1, type: 'cc',   number: 0,  action: 'pitch',      deck: 'A' },
      { channel: 1, type: 'cc',   number: 32, action: 'volume',     deck: 'A' },
      { channel: 1, type: 'cc',   number: 7,  action: 'jog_scratch',deck: 'A' },
      { channel: 2, type: 'note', number: 11, action: 'play',       deck: 'B' },
      { channel: 2, type: 'note', number: 12, action: 'cue',        deck: 'B' },
      { channel: 2, type: 'note', number: 13, action: 'sync',       deck: 'B' },
      { channel: 2, type: 'note', number: 16, action: 'hot_cue_1',  deck: 'B' },
      { channel: 2, type: 'note', number: 17, action: 'hot_cue_2',  deck: 'B' },
      { channel: 2, type: 'note', number: 18, action: 'hot_cue_3',  deck: 'B' },
      { channel: 2, type: 'note', number: 19, action: 'hot_cue_4',  deck: 'B' },
      { channel: 2, type: 'cc',   number: 0,  action: 'pitch',      deck: 'B' },
      { channel: 2, type: 'cc',   number: 32, action: 'volume',     deck: 'B' },
      { channel: 2, type: 'cc',   number: 7,  action: 'jog_scratch',deck: 'B' },
      { channel: 1, type: 'cc',   number: 8,  action: 'crossfader', deck: null },
    ]
  },
  {
    name: 'Pioneer DDJ-400',
    match: ['ddj-400', 'ddj400'],
    mappings: [
      { channel: 1, type: 'note', number: 11, action: 'play',       deck: 'A' },
      { channel: 1, type: 'note', number: 12, action: 'cue',        deck: 'A' },
      { channel: 1, type: 'note', number: 13, action: 'sync',       deck: 'A' },
      { channel: 1, type: 'note', number: 16, action: 'hot_cue_1',  deck: 'A' },
      { channel: 1, type: 'note', number: 17, action: 'hot_cue_2',  deck: 'A' },
      { channel: 1, type: 'note', number: 18, action: 'hot_cue_3',  deck: 'A' },
      { channel: 1, type: 'note', number: 19, action: 'hot_cue_4',  deck: 'A' },
      { channel: 1, type: 'cc',   number: 0,  action: 'pitch',      deck: 'A' },
      { channel: 1, type: 'cc',   number: 32, action: 'volume',     deck: 'A' },
      { channel: 1, type: 'cc',   number: 7,  action: 'jog_scratch',deck: 'A' },
      { channel: 1, type: 'cc',   number: 10, action: 'eq_high',    deck: 'A' },
      { channel: 1, type: 'cc',   number: 11, action: 'eq_mid',     deck: 'A' },
      { channel: 1, type: 'cc',   number: 12, action: 'eq_low',     deck: 'A' },
      { channel: 2, type: 'note', number: 11, action: 'play',       deck: 'B' },
      { channel: 2, type: 'note', number: 12, action: 'cue',        deck: 'B' },
      { channel: 2, type: 'note', number: 13, action: 'sync',       deck: 'B' },
      { channel: 2, type: 'note', number: 16, action: 'hot_cue_1',  deck: 'B' },
      { channel: 2, type: 'note', number: 17, action: 'hot_cue_2',  deck: 'B' },
      { channel: 2, type: 'note', number: 18, action: 'hot_cue_3',  deck: 'B' },
      { channel: 2, type: 'note', number: 19, action: 'hot_cue_4',  deck: 'B' },
      { channel: 2, type: 'cc',   number: 0,  action: 'pitch',      deck: 'B' },
      { channel: 2, type: 'cc',   number: 32, action: 'volume',     deck: 'B' },
      { channel: 2, type: 'cc',   number: 7,  action: 'jog_scratch',deck: 'B' },
      { channel: 2, type: 'cc',   number: 10, action: 'eq_high',    deck: 'B' },
      { channel: 2, type: 'cc',   number: 11, action: 'eq_mid',     deck: 'B' },
      { channel: 2, type: 'cc',   number: 12, action: 'eq_low',     deck: 'B' },
      { channel: 1, type: 'cc',   number: 8,  action: 'crossfader',    deck: null },
      { channel: 1, type: 'cc',   number: 9,  action: 'master_volume', deck: null },
    ]
  },
  {
    name: 'Numark Party Mix',
    match: ['party mix', 'partymix', 'numark'],
    mappings: [
      { channel: 1, type: 'note', number: 0,  action: 'play',      deck: 'A' },
      { channel: 1, type: 'note', number: 1,  action: 'cue',       deck: 'A' },
      { channel: 1, type: 'note', number: 2,  action: 'sync',      deck: 'A' },
      { channel: 1, type: 'cc',   number: 0,  action: 'volume',    deck: 'A' },
      { channel: 1, type: 'cc',   number: 1,  action: 'pitch',     deck: 'A' },
      { channel: 2, type: 'note', number: 0,  action: 'play',      deck: 'B' },
      { channel: 2, type: 'note', number: 1,  action: 'cue',       deck: 'B' },
      { channel: 2, type: 'note', number: 2,  action: 'sync',      deck: 'B' },
      { channel: 2, type: 'cc',   number: 0,  action: 'volume',    deck: 'B' },
      { channel: 2, type: 'cc',   number: 1,  action: 'pitch',     deck: 'B' },
      { channel: 1, type: 'cc',   number: 3,  action: 'crossfader',   deck: null },
    ]
  },
  {
    name: 'Behringer CMD Studio / Micro',
    match: ['behringer', 'cmd studio', 'cmd micro', 'cmd'],
    mappings: [
      { channel: 1, type: 'note', number: 0,  action: 'play',      deck: 'A' },
      { channel: 1, type: 'note', number: 1,  action: 'cue',       deck: 'A' },
      { channel: 1, type: 'note', number: 2,  action: 'sync',      deck: 'A' },
      { channel: 1, type: 'cc',   number: 0,  action: 'pitch',     deck: 'A' },
      { channel: 1, type: 'cc',   number: 2,  action: 'volume',    deck: 'A' },
      { channel: 2, type: 'note', number: 0,  action: 'play',      deck: 'B' },
      { channel: 2, type: 'note', number: 1,  action: 'cue',       deck: 'B' },
      { channel: 2, type: 'note', number: 2,  action: 'sync',      deck: 'B' },
      { channel: 2, type: 'cc',   number: 0,  action: 'pitch',     deck: 'B' },
      { channel: 2, type: 'cc',   number: 2,  action: 'volume',    deck: 'B' },
      { channel: 1, type: 'cc',   number: 1,  action: 'crossfader',   deck: null },
    ]
  },
];

// -----------------------------------------------------------------------
// MIDIMapper – stores and resolves CC/Note → action mappings
// -----------------------------------------------------------------------
class MIDIMapper {
  constructor() {
    this.mappings = [];
    this.learnMode = false;
    this.learnCallback = null;
    this._load();
  }

  _load() {
    try {
      const stored = localStorage.getItem('wdjr_midi_map');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.mappings = parsed.mappings || [];
      }
    } catch (_) {
      this.mappings = [];
    }
  }

  save() {
    try {
      localStorage.setItem('wdjr_midi_map', JSON.stringify({ mappings: this.mappings }));
    } catch (_) {}
  }

  applyPreset(preset) {
    this.mappings = [...preset.mappings];
    this.save();
  }

  exportMappings(deviceName = '') {
    return {
      version: '1.9.2',
      generator: 'WebDJRadio Console',
      exportedAt: new Date().toISOString(),
      device: deviceName || 'Generic MIDI Controller',
      mappings: [...this.mappings]
    };
  }

  importMappings(importedData) {
    let list = [];
    if (Array.isArray(importedData)) {
      list = importedData;
    } else if (importedData && Array.isArray(importedData.mappings)) {
      list = importedData.mappings;
    } else {
      throw new Error('Invalid MIDI mappings file format. Expected a mappings array.');
    }

    const valid = list.filter(m =>
      m &&
      typeof m.channel === 'number' &&
      typeof m.type === 'string' &&
      typeof m.number === 'number' &&
      typeof m.action === 'string'
    );

    if (valid.length === 0) {
      throw new Error('No valid MIDI mapping definitions found in file.');
    }

    this.mappings = valid;
    this.save();
    return valid.length;
  }

  addMapping(mapping) {
    // Replace any existing entry for the same channel+type+number
    this.mappings = this.mappings.filter(m =>
      !(m.channel === mapping.channel && m.type === mapping.type && m.number === mapping.number)
    );
    this.mappings.push(mapping);
    this.save();
  }

  removeMapping(index) {
    this.mappings.splice(index, 1);
    this.save();
  }

  clearAll() {
    this.mappings = [];
    this.save();
  }

  resolve(channel, type, number) {
    return this.mappings.find(m =>
      m.channel === channel && m.type === type && m.number === number
    ) || null;
  }

  startLearn(callback) {
    this.learnMode = true;
    this.learnCallback = callback;
  }

  stopLearn() {
    this.learnMode = false;
    this.learnCallback = null;
  }

  handleLearnMessage(channel, type, number) {
    if (this.learnMode && this.learnCallback) {
      this.learnCallback({ channel, type, number });
    }
  }
}

// -----------------------------------------------------------------------
// MIDIControllerManager – owns MIDI access, scans devices, dispatches
// -----------------------------------------------------------------------
class MIDIControllerManager {
  constructor(engine, uiCallbacks) {
    this.engine     = engine;
    this.ui         = uiCallbacks;
    this.mapper     = new MIDIMapper();
    this.midiAccess = null;
    this.supported  = !!navigator.requestMIDIAccess;
    this.connected  = false;
    this.devices    = [];
  }

  async init() {
    if (!this.supported) {
      this.ui.onStatusChange('unsupported');
      return false;
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.connected  = true;
      this._scanDevices();
      this.midiAccess.onstatechange = () => this._scanDevices();
      this.ui.onStatusChange('connected');
      return true;
    } catch (err) {
      console.warn('[MIDI] Access denied:', err);
      this.ui.onStatusChange('denied');
      return false;
    }
  }

  _scanDevices() {
    if (!this.midiAccess) return;
    this.devices = [];

    for (const input of this.midiAccess.inputs.values()) {
      this.devices.push({
        id: input.id,
        name: input.name || 'Unknown Device',
        manufacturer: input.manufacturer || '',
        type: 'input'
      });
      input.onmidimessage = (e) => this._onMessage(e);
      this._tryAutoPreset(input.name);
    }

    this.ui.onDeviceChange(this.devices);
  }

  _tryAutoPreset(deviceName) {
    if (!deviceName || this.mapper.mappings.length > 0) return;
    const lc = deviceName.toLowerCase();
    for (const preset of MIDI_PRESETS) {
      if (preset.match.some(m => lc.includes(m))) {
        this.mapper.applyPreset(preset);
        this.ui.onStatusChange(`preset:${preset.name}`);
        console.log(`[MIDI] Auto-applied preset: ${preset.name}`);
        return;
      }
    }
  }

  _onMessage(event) {
    const [status, number, value] = event.data;
    const channel = (status & 0x0F) + 1;
    const msgType = status & 0xF0;

    let type = null;
    let isNoteOn = false;

    if      (msgType === 0x90 && value > 0) { type = 'note'; isNoteOn = true; }
    else if (msgType === 0x90 && value === 0){ type = 'note'; isNoteOn = false;}
    else if (msgType === 0x80)               { type = 'note'; isNoteOn = false;}
    else if (msgType === 0xB0)               { type = 'cc'; }

    if (!type) return;

    // MIDI Learn capture
    if (this.mapper.learnMode) {
      if (isNoteOn || type === 'cc') {
        this.mapper.handleLearnMessage(channel, type, number);
      }
      return;
    }

    const mapping = this.mapper.resolve(channel, type, number);
    if (!mapping) return;

    // Filter out note-off for standard triggers, BUT preserve note-off for momentary actions (e.g. beat rolls, cue hold)
    const isMomentaryAction = mapping.action && (mapping.action.startsWith('beat_roll_') || mapping.action === 'cue');
    if (type === 'note' && !isNoteOn && !isMomentaryAction) return;

    this.ui.onActivity(mapping.action, mapping.deck, value);
    this._dispatch(mapping.action, mapping.deck, type, value, isNoteOn);
  }

  _dispatch(action, deck, type, value, isNoteOn) {
    const eng = this.engine;
    const normCC = value / 127;
    const isPressed = type === 'note' ? isNoteOn : (value > 0);

    switch (action) {
      case 'play':
        if (isNoteOn) {
          eng.decks[deck].isPlaying ? eng.pause(deck) : eng.play(deck);
          this.ui.onTrigger('play', deck);
        }
        break;
      case 'cue':
        if (isNoteOn) { eng.cue(deck); this.ui.onTrigger('cue', deck); }
        break;
      case 'sync':
        if (isNoteOn) {
          eng.syncBPM(deck, deck === 'A' ? 'B' : 'A');
          this.ui.onTrigger('sync', deck);
        }
        break;
      case 'loop_toggle':
        if (isNoteOn) { eng.toggleLoop(deck); this.ui.onTrigger('loop_toggle', deck); }
        break;
      case 'loop_1': if (isNoteOn) eng.setBeatLoop(deck, 1); break;
      case 'loop_2': if (isNoteOn) eng.setBeatLoop(deck, 2); break;
      case 'loop_4': if (isNoteOn) eng.setBeatLoop(deck, 4); break;
      case 'loop_8': if (isNoteOn) eng.setBeatLoop(deck, 8); break;
      case 'hot_cue_1': if (isNoteOn) { eng.triggerHotCue(deck, 0); this.ui.onTrigger('hot_cue_1', deck); } break;
      case 'hot_cue_2': if (isNoteOn) { eng.triggerHotCue(deck, 1); this.ui.onTrigger('hot_cue_2', deck); } break;
      case 'hot_cue_3': if (isNoteOn) { eng.triggerHotCue(deck, 2); this.ui.onTrigger('hot_cue_3', deck); } break;
      case 'hot_cue_4': if (isNoteOn) { eng.triggerHotCue(deck, 3); this.ui.onTrigger('hot_cue_4', deck); } break;

      case 'pitch':
        eng.setPlaybackRate(deck, 1.0 + (normCC - 0.5) * 0.16); // ±8%
        this.ui.onCCChange('pitch', deck, normCC);
        break;
      case 'volume':
        eng.setDeckVolume(deck, normCC);
        this.ui.onCCChange('volume', deck, normCC);
        break;
      case 'eq_high': {
        const gain = normCC <= 0.5 ? ((normCC / 0.5) * 24 - 24) : (((normCC - 0.5) / 0.5) * 6);
        eng.setEQ(deck, 'high', gain);
        this.ui.onCCChange('eq_high', deck, normCC);
        break;
      }
      case 'eq_mid': {
        const gain = normCC <= 0.5 ? ((normCC / 0.5) * 24 - 24) : (((normCC - 0.5) / 0.5) * 6);
        eng.setEQ(deck, 'mid', gain);
        this.ui.onCCChange('eq_mid', deck, normCC);
        break;
      }
      case 'eq_low': {
        const gain = normCC <= 0.5 ? ((normCC / 0.5) * 24 - 24) : (((normCC - 0.5) / 0.5) * 6);
        eng.setEQ(deck, 'low', gain);
        this.ui.onCCChange('eq_low', deck, normCC);
        break;
      }
      case 'filter': {
        const filterVal = (normCC - 0.5) * 2.0; // -1.0 to +1.0
        eng.setFilter(deck, filterVal);
        this.ui.onCCChange('filter', deck, normCC);
        break;
      }
      case 'beat_roll_1_8':
        if (isPressed) eng.startBeatRoll(deck, 0.125); else eng.stopBeatRoll(deck);
        if (this.ui.onRollChange) this.ui.onRollChange('beat_roll_1_8', deck, isPressed);
        break;
      case 'beat_roll_1_4':
        if (isPressed) eng.startBeatRoll(deck, 0.25); else eng.stopBeatRoll(deck);
        if (this.ui.onRollChange) this.ui.onRollChange('beat_roll_1_4', deck, isPressed);
        break;
      case 'beat_roll_1_2':
        if (isPressed) eng.startBeatRoll(deck, 0.5); else eng.stopBeatRoll(deck);
        if (this.ui.onRollChange) this.ui.onRollChange('beat_roll_1_2', deck, isPressed);
        break;
      case 'beat_roll_1':
        if (isPressed) eng.startBeatRoll(deck, 1); else eng.stopBeatRoll(deck);
        if (this.ui.onRollChange) this.ui.onRollChange('beat_roll_1', deck, isPressed);
        break;
      case 'beat_roll_2':
        if (isPressed) eng.startBeatRoll(deck, 2); else eng.stopBeatRoll(deck);
        if (this.ui.onRollChange) this.ui.onRollChange('beat_roll_2', deck, isPressed);
        break;
      case 'fx_delay_toggle':
        if (isNoteOn && deck) {
          const active = !eng.decks[deck].fx.delay.active;
          eng.setDelay(deck, { active });
          if (this.ui.onTrigger) this.ui.onTrigger('fx_delay_toggle', deck);
        }
        break;
      case 'fx_delay_feedback':
        if (deck) {
          eng.setDelay(deck, { feedback: normCC * 0.9 });
          if (this.ui.onCCChange) this.ui.onCCChange('fx_delay_feedback', deck, normCC);
        }
        break;
      case 'fx_reverb_toggle':
        if (isNoteOn && deck) {
          const active = !eng.decks[deck].fx.reverb.active;
          eng.setReverb(deck, { active });
          if (this.ui.onTrigger) this.ui.onTrigger('fx_reverb_toggle', deck);
        }
        break;
      case 'fx_reverb_mix':
        if (deck) {
          eng.setReverb(deck, { mix: normCC });
          if (this.ui.onCCChange) this.ui.onCCChange('fx_reverb_mix', deck, normCC);
        }
        break;
      case 'fx_flanger_toggle':
        if (isNoteOn && deck) {
          const active = !eng.decks[deck].fx.flanger.active;
          eng.setFlanger(deck, { active });
          if (this.ui.onTrigger) this.ui.onTrigger('fx_flanger_toggle', deck);
        }
        break;
      case 'fx_flanger_feedback':
        if (deck) {
          eng.setFlanger(deck, { feedback: normCC * 0.85 });
          if (this.ui.onCCChange) this.ui.onCCChange('fx_flanger_feedback', deck, normCC);
        }
        break;
      case 'fx_bitcrush_toggle':
        if (isNoteOn && deck) {
          const active = !eng.decks[deck].fx.bitcrusher.active;
          eng.setBitcrusher(deck, { active });
          if (this.ui.onTrigger) this.ui.onTrigger('fx_bitcrush_toggle', deck);
        }
        break;
      case 'fx_bitcrush_mix':
        if (deck) {
          eng.setBitcrusher(deck, { mix: normCC });
          if (this.ui.onCCChange) this.ui.onCCChange('fx_bitcrush_mix', deck, normCC);
        }
        break;
      case 'jog_scratch': {
        // Relative jog: 1–63 = forward, 65–127 = backward
        const delta = value < 64 ? value : value - 128;
        eng.seek(deck, eng.getCurrentTime(deck) + delta * 0.03);
        this.ui.onCCChange('jog_scratch', deck, normCC);
        break;
      }
      case 'crossfader':
        eng.setCrossfader(normCC);
        this.ui.onCCChange('crossfader', null, normCC);
        break;
      case 'master_volume':
        eng.setMasterVolume(normCC);
        this.ui.onCCChange('master_volume', null, normCC);
        break;
      case 'auto_relay':
        if (isNoteOn) {
          const btn = document.getElementById('btn-auto-relay');
          if (btn) btn.click();
          this.ui.onTrigger('auto_relay', null);
        }
        break;
      case 'cart_play_1':
        if (isNoteOn) {
          eng.playCart(0);
          this.ui.onTrigger('cart_play_1', null);
        }
        break;
      case 'cart_play_2':
        if (isNoteOn) {
          eng.playCart(1);
          this.ui.onTrigger('cart_play_2', null);
        }
        break;
      case 'cart_play_3':
        if (isNoteOn) {
          eng.playCart(2);
          this.ui.onTrigger('cart_play_3', null);
        }
        break;
      case 'cart_play_4':
        if (isNoteOn) {
          eng.playCart(3);
          this.ui.onTrigger('cart_play_4', null);
        }
        break;
      case 'cart_stop_all':
        if (isNoteOn) {
          eng.stopAllCarts();
          this.ui.onTrigger('cart_stop_all', null);
        }
        break;
      case 'cart_volume':
        eng.setCartVolume(normCC);
        this.ui.onCCChange('cart_volume', null, normCC);
        break;
      case 'mic_toggle':
        if (isNoteOn) {
          const btn = document.getElementById('btn-mic-toggle');
          if (btn) btn.click();
          this.ui.onTrigger('mic_toggle', null);
        }
        break;
      case 'mic_talkover':
        if (isNoteOn) {
          const btn = document.getElementById('btn-talkover-toggle');
          if (btn) btn.click();
          this.ui.onTrigger('mic_talkover', null);
        }
        break;
      case 'mic_volume': {
        const micGain = normCC * 1.5;
        eng.setMicVolume(micGain);
        this.ui.onCCChange('mic_volume', null, normCC);
        break;
      }
      default:
        break;
    }
  }

  getMapper()     { return this.mapper; }
  getDevices()    { return this.devices; }
  getPresets()    { return MIDI_PRESETS; }
  getActions()    { return MIDI_ACTIONS; }
}
