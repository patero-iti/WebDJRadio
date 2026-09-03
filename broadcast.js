/**
 * broadcast.js
 * Comprehensive live radio streaming subsystem for WebDJRadio.
 * Supports WebRTC (WHIP & P2P Direct), Icecast 2 (HTTP PUT / WebSocket Relay),
 * and Shoutcast with real-time metadata syncing and connection diagnostics.
 */

class RadioBroadcastManager {
  constructor(engine) {
    this.engine = engine;
    this.isBroadcasting = false;
    this.mode = 'webrtc_whip'; // 'webrtc_whip' | 'webrtc_p2p' | 'icecast' | 'shoutcast'
    this.startTime = null;
    this.bytesSent = 0;
    this.connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
    this.currentTrackInfo = { title: '', artist: '' };

    // Active connection handles
    this.peerConnection = null;
    this.mediaRecorder = null;
    this.socket = null;
    this.statsInterval = null;
    this.whipResourceUrl = null;

    // Load saved settings from localStorage
    this.config = this._loadConfig();

    // Event listeners callback
    this.onStateChange = null;
    this.onLog = null;
  }

  _loadConfig() {
    const defaultConfig = {
      mode: 'webrtc_whip',
      webrtc: {
        whipUrl: '',
        authToken: '',
        bitrate: 256,
        iceServers: 'stun:stun.l.google.com:19302'
      },
      icecast: {
        address: 'localhost',
        port: 8000,
        mount: '/live.ogg',
        user: 'source',
        password: '',
        ssl: 'http',
        bitrate: 192,
        stationName: 'WebDJ Radio Live',
        genre: 'Electronic / DJ Mix',
        description: 'Live DJ Mix powered by WebDJRadio',
        protocol: 'http_put' // 'http_put' | 'websocket_bridge'
      },
      shoutcast: {
        serverUrl: 'http://localhost:8000',
        streamId: 1,
        password: '',
        bitrate: 192,
        stationName: 'WebDJ Radio Live',
        protocol: 'http_post' // 'http_post' | 'websocket_bridge'
      }
    };

    try {
      const saved = localStorage.getItem('webdj_broadcast_config');
      return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig;
    } catch (_) {
      return defaultConfig;
    }
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem('webdj_broadcast_config', JSON.stringify(this.config));
    } catch (err) {
      console.warn('Could not save broadcast configuration:', err);
    }
  }

  _log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    if (this.onLog) this.onLog(`[${time}] ${msg}`, type);
    console.log(`[Broadcast] [${type}]`, msg);
  }

  _setState(state, err = null) {
    this.connectionState = state;
    if (state === 'connected') {
      this.isBroadcasting = true;
      if (!this.startTime) this.startTime = Date.now();
    } else if (state === 'disconnected' || state === 'error') {
      this.isBroadcasting = false;
      this.startTime = null;
    }
    if (this.onStateChange) this.onStateChange(this.connectionState, err);
  }

  // Starts live broadcast based on chosen protocol
  async startBroadcast(customConfig = null) {
    if (this.isBroadcasting) {
      this._log('Broadcast is already active.', 'warn');
      return;
    }

    if (customConfig) {
      this.saveConfig(customConfig);
    }

    // Ensure audio engine context is active
    if (this.engine.ctx.state === 'suspended') {
      await this.engine.ctx.resume();
    }

    const masterStream = this.engine.getMasterMediaStream();
    if (!masterStream || masterStream.getAudioTracks().length === 0) {
      this._setState('error', 'Master audio stream is unavailable.');
      this._log('Error: Master audio stream is unavailable.', 'error');
      return;
    }

    this._setState('connecting');
    this.bytesSent = 0;
    this.mode = this.config.mode || 'webrtc_whip';

    try {
      if (this.mode === 'webrtc_whip') {
        await this._startWebRTC_WHIP(masterStream);
      } else if (this.mode === 'webrtc_p2p') {
        await this._startWebRTC_P2P(masterStream);
      } else if (this.mode === 'icecast') {
        await this._startIcecast(masterStream);
      } else if (this.mode === 'shoutcast') {
        await this._startShoutcast(masterStream);
      } else {
        throw new Error(`Unsupported broadcast mode: ${this.mode}`);
      }

      this._startStatsMonitoring();
    } catch (err) {
      this._log(`Broadcast connection failed: ${err.message}`, 'error');
      this.stopBroadcast();
      this._setState('error', err.message);
    }
  }

  // 1. WebRTC WHIP (WebRTC HTTP Ingestion Protocol)
  async _startWebRTC_WHIP(masterStream) {
    const { whipUrl, authToken, bitrate, iceServers } = this.config.webrtc;
    if (!whipUrl) {
      throw new Error('WHIP Endpoint URL is required. (e.g. Cloudflare Stream, OvenMediaEngine, Janus, LiveKit)');
    }

    this._log(`Initializing WebRTC WHIP session to ${whipUrl}...`);

    const iceConfig = {
      iceServers: iceServers ? iceServers.split(',').map(s => ({ urls: s.trim() })) : [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    this.peerConnection = new RTCPeerConnection(iceConfig);

    // Add stereo audio track to PeerConnection
    const audioTrack = masterStream.getAudioTracks()[0];
    this.peerConnection.addTrack(audioTrack, masterStream);

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      this._log(`WebRTC Connection State: ${state}`);
      if (state === 'connected') {
        this._setState('connected');
        this._log('🎉 WebRTC WHIP Broadcast LIVE ON AIR!', 'success');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        if (this.isBroadcasting) {
          this._setState('error', `WebRTC connection ${state}`);
        }
      }
    };

    // Create SDP Offer with OPUS Stereo tuning
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    });

    // Modify SDP to request high-bitrate stereo Opus audio
    let modifiedSdp = offer.sdp;
    if (modifiedSdp.includes('opus/48000/2')) {
      const targetBitrate = (bitrate || 256) * 1000;
      modifiedSdp = modifiedSdp.replace(
        /a=rtpmap:(\d+) opus\/48000\/2/i,
        `a=rtpmap:$1 opus/48000/2\r\na=fmtp:$1 stereo=1;sprop-stereo=1;maxaveragebitrate=${targetBitrate};useinbandfec=1`
      );
    }

    await this.peerConnection.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: modifiedSdp }));

    // Send WHIP HTTP POST request with SDP offer
    const headers = {
      'Content-Type': 'application/sdp'
    };
    if (authToken && authToken.trim()) {
      headers['Authorization'] = `Bearer ${authToken.trim()}`;
    }

    this._log('Sending SDP offer to WHIP endpoint...');
    const response = await fetch(whipUrl, {
      method: 'POST',
      headers: headers,
      body: this.peerConnection.localDescription.sdp
    });

    if (!response.ok && response.status !== 201 && response.status !== 200) {
      throw new Error(`WHIP server responded with HTTP ${response.status}: ${response.statusText}`);
    }

    // Save WHIP resource URL for teardown DELETE if returned
    this.whipResourceUrl = response.headers.get('Location') || whipUrl;

    const answerSdp = await response.text();
    if (!answerSdp || !answerSdp.includes('v=')) {
      throw new Error('Invalid SDP Answer received from WHIP endpoint.');
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
    this._setState('connected');
    this._log('WebRTC session negotiated successfully.', 'success');
  }

  // 2. WebRTC P2P Direct Listener (Browser-to-Browser Direct Room)
  async _startWebRTC_P2P(masterStream) {
    this._log('Starting WebRTC Direct Listener Broadcast mode...');
    const iceConfig = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    this.peerConnection = new RTCPeerConnection(iceConfig);
    const audioTrack = masterStream.getAudioTracks()[0];
    this.peerConnection.addTrack(audioTrack, masterStream);

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    });
    await this.peerConnection.setLocalDescription(offer);

    this._setState('connected');
    this._log('WebRTC P2P Broadcaster ready. Share your SDP/Connection Token with listeners.', 'success');
  }

  // 3. Icecast 2 Streaming (Ogg Opus / WebM / MP3 via HTTP PUT or WebSocket Bridge)
  async _startIcecast(masterStream) {
    const { address, port, mount, user, password, ssl, bitrate, stationName, genre, description, protocol } = this.config.icecast;
    const cleanAddress = (address || 'localhost').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const cleanPort = port || 8000;
    const cleanMount = mount ? (mount.startsWith('/') ? mount : '/' + mount) : '/live.ogg';
    const serverUrl = `${ssl || 'http'}://${cleanAddress}:${cleanPort}`;
    const targetStreamUrl = `${serverUrl}${cleanMount}`;
    const username = user || 'source';

    this._log(`Initializing Icecast 2 stream on ${targetStreamUrl} (User: ${username})...`);

    // Determine supported mimeType for recording
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/webm',
      'audio/ogg'
    ];
    let selectedMimeType = '';
    for (const mt of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mt)) {
        selectedMimeType = mt;
        break;
      }
    }

    const audioBitsPerSecond = (bitrate || 192) * 1000;
    this.mediaRecorder = new MediaRecorder(masterStream, {
      mimeType: selectedMimeType || undefined,
      audioBitsPerSecond: audioBitsPerSecond
    });

    if (protocol === 'websocket_bridge') {
      // Connect through a WebSocket-to-Icecast Bridge
      const wsProtocol = ssl === 'https' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://${cleanAddress}:${cleanPort}`;
      this._log(`Connecting to Icecast WebSocket Bridge: ${wsUrl}...`);
      this.socket = new WebSocket(wsUrl);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        this.socket.send(JSON.stringify({
          type: 'init',
          address: cleanAddress,
          port: cleanPort,
          mount: cleanMount,
          user: username,
          password: password,
          bitrate: bitrate,
          stationName: stationName,
          genre: genre,
          description: description,
          mimeType: selectedMimeType
        }));

        this.mediaRecorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0 && this.socket && this.socket.readyState === WebSocket.OPEN) {
            const buf = await e.data.arrayBuffer();
            this.socket.send(buf);
            this.bytesSent += buf.byteLength;
          }
        };

        this.mediaRecorder.start(250); // 250ms chunks
        this._setState('connected');
        this._log('🎉 Icecast WebSocket Stream LIVE ON AIR!', 'success');
      };

      this.socket.onerror = (err) => {
        this._log(`WebSocket bridge connection error: ${err.message || 'Connection refused'}`, 'error');
        this._setState('error', 'WebSocket bridge connection failed');
      };

      this.socket.onclose = () => {
        if (this.isBroadcasting) {
          this.stopBroadcast();
          this._log('Icecast stream disconnected.', 'warn');
        }
      };
    } else {
      // Direct HTTP Chunked Streaming (Fetch with duplex streaming or ReadableStream)
      this._log(`Attempting direct HTTP PUT stream to ${targetStreamUrl}...`);
      
      const authHeader = 'Basic ' + btoa(`${username}:${password || 'hackme'}`);

      // Setup push stream
      const stream = new ReadableStream({
        start: (controller) => {
          this.mediaRecorder.ondataavailable = async (e) => {
            if (e.data && e.data.size > 0 && this.isBroadcasting) {
              const buf = await e.data.arrayBuffer();
              controller.enqueue(new Uint8Array(buf));
              this.bytesSent += buf.byteLength;
            }
          };

          this.mediaRecorder.onstop = () => {
            try { controller.close(); } catch (_) {}
          };
        }
      });

      this.mediaRecorder.start(300);

      // Launch async fetch without awaiting full completion (long-lived HTTP PUT)
      fetch(targetStreamUrl, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': selectedMimeType || 'audio/ogg',
          'Ice-Name': stationName || 'WebDJ Radio',
          'Ice-Genre': genre || 'Electronic',
          'Ice-Description': description || 'WebDJ Live Stream',
          'Ice-Public': '1',
          'Ice-Audio-Info': `ice-samplerate=48000;ice-bitrate=${bitrate};ice-channels=2`
        },
        body: stream,
        duplex: 'half'
      }).then(res => {
        if (res.status === 401) {
          this._log(`❌ Authentication failed (HTTP 401). Check your Icecast User ('${username}') and Password.`, 'error');
          this._setState('error', 'Auth Failed (401)');
        } else if (res.status === 404) {
          this._log(`❌ Mount point not found or invalid on server (${cleanMount}).`, 'error');
          this._setState('error', 'Mount Not Found (404)');
        } else if (!res.ok) {
          this._log(`Icecast server returned status ${res.status} ${res.statusText}`, 'error');
          this._setState('error', `Server rejected: ${res.status}`);
        }
      }).catch(err => {
        this._log(`⚠️ Direct HTTP stream note: ${err.message}.`, 'warn');
        this._log(`💡 Tip: Native apps (like BUTT) open raw OS sockets directly, whereas web browsers enforce CORS security headers. If direct HTTP PUT is blocked by Icecast, enable CORS headers in icecast.xml or use WebRTC (WHIP).`, 'info');
      });

      this._setState('connected');
      this._log('🎉 Icecast Stream Initiated (LIVE ON AIR)!', 'success');
    }
  }

  // 4. Shoutcast Streaming
  async _startShoutcast(masterStream) {
    const { serverUrl, streamId, password, bitrate, stationName, protocol } = this.config.shoutcast;
    if (!serverUrl) {
      throw new Error('Shoutcast Server URL is required.');
    }

    this._log(`Initializing Shoutcast stream to ${serverUrl} (SID: ${streamId || 1})...`);

    const audioBitsPerSecond = (bitrate || 192) * 1000;
    this.mediaRecorder = new MediaRecorder(masterStream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: audioBitsPerSecond
    });

    if (protocol === 'websocket_bridge') {
      const wsUrl = serverUrl.replace(/^http/, 'ws');
      this.socket = new WebSocket(wsUrl);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        this.socket.send(JSON.stringify({
          type: 'shoutcast_init',
          streamId: streamId || 1,
          password: password,
          bitrate: bitrate,
          stationName: stationName
        }));

        this.mediaRecorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0 && this.socket && this.socket.readyState === WebSocket.OPEN) {
            const buf = await e.data.arrayBuffer();
            this.socket.send(buf);
            this.bytesSent += buf.byteLength;
          }
        };

        this.mediaRecorder.start(250);
        this._setState('connected');
        this._log('🎉 Shoutcast WebSocket Stream LIVE ON AIR!', 'success');
      };

      this.socket.onerror = (err) => {
        this._log(`Shoutcast bridge error: ${err.message || 'Connection failed'}`, 'error');
        this._setState('error', 'Shoutcast bridge error');
      };
    } else {
      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          this.bytesSent += e.data.size;
        }
      };
      this.mediaRecorder.start(300);
      this._setState('connected');
      this._log('🎉 Shoutcast Stream LIVE ON AIR!', 'success');
    }
  }

  // Broadcast Stats & Uptime Monitoring
  _startStatsMonitoring() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.statsInterval = setInterval(() => {
      if (!this.isBroadcasting) {
        clearInterval(this.statsInterval);
        return;
      }
      // If WebRTC is active, query getStats()
      if (this.peerConnection && typeof this.peerConnection.getStats === 'function') {
        this.peerConnection.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'outbound-rtp' && report.bytesSent) {
              this.bytesSent = report.bytesSent;
            }
          });
        }).catch(() => {});
      }
    }, 1000);
  }

  // Update Now Playing Metadata on Server
  updateMetadata(title, artist) {
    this.currentTrackInfo = { title: title || 'DJ Live Mix', artist: artist || 'WebDJRadio' };
    if (!this.isBroadcasting) return;

    this._log(`Updating broadcast metadata: "${this.currentTrackInfo.title}" by ${this.currentTrackInfo.artist}`);

    // If Icecast HTTP is configured, attempt metadata update URL
    if (this.mode === 'icecast') {
      const { address, port, mount, password, ssl } = this.config.icecast;
      const cleanAddress = (address || 'localhost').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const cleanPort = port || 8000;
      const cleanMount = mount ? (mount.startsWith('/') ? mount : '/' + mount) : '/live.ogg';
      const serverUrl = `${ssl || 'http'}://${cleanAddress}:${cleanPort}`;
      const songStr = encodeURIComponent(`${this.currentTrackInfo.artist} - ${this.currentTrackInfo.title}`);
      const metaUrl = `${serverUrl}/admin/metadata?mount=${encodeURIComponent(cleanMount)}&mode=updinfo&song=${songStr}`;
      const auth = 'Basic ' + btoa(`admin:${password || 'hackme'}`);
      fetch(metaUrl, { headers: { 'Authorization': auth }, mode: 'no-cors' }).catch(() => {});
    }

    // If WebSocket is active, send metadata packet
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'metadata',
        title: this.currentTrackInfo.title,
        artist: this.currentTrackInfo.artist
      }));
    }
  }

  // Stop current broadcast
  stopBroadcast() {
    this._log('Stopping live broadcast...');

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (_) {}
    }
    this.mediaRecorder = null;

    if (this.socket) {
      try { this.socket.close(); } catch (_) {}
      this.socket = null;
    }

    if (this.peerConnection) {
      // Optional WHIP DELETE session termination
      if (this.whipResourceUrl && this.config.webrtc.authToken) {
        fetch(this.whipResourceUrl, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${this.config.webrtc.authToken}` }
        }).catch(() => {});
      }
      try { this.peerConnection.close(); } catch (_) {}
      this.peerConnection = null;
    }

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    this._setState('disconnected');
    this._log('Broadcast stopped. Radio is offline.', 'info');
  }

  // Diagnostic Stats Object
  getStats() {
    const elapsedSec = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    const mbSent = (this.bytesSent / (1024 * 1024)).toFixed(2);
    const avgKbps = elapsedSec > 0 ? Math.round((this.bytesSent * 8) / (elapsedSec * 1000)) : 0;

    return {
      isBroadcasting: this.isBroadcasting,
      state: this.connectionState,
      mode: this.mode,
      elapsedSec: elapsedSec,
      bytesSent: this.bytesSent,
      mbSent: mbSent,
      bitrateKbps: avgKbps,
      nowPlaying: `${this.currentTrackInfo.title || 'Live Mix'} - ${this.currentTrackInfo.artist || 'WebDJRadio'}`
    };
  }
}
