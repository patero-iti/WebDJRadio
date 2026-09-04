# WebDJRadio - Architecture & Implementation Summary

[WebDJRadio](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio) is a professional dual-deck Web Audio DJ application built strictly according to the [`codebible.md`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/codebible.md) architecture and specification.

---

## 1. Web Audio Engine Architecture

The audio pipeline is managed by [`WebRadioDecksEngine.js`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/WebRadioDecksEngine.js):

```
                       ┌────────────────────────────────────────────────────────┐
                       │                   WebRadioDecks UI                     │
                       └───────────┬────────────────────────────────┬───────────┘
                                   │                                │
                                   ▼                                ▼
                   ┌───────────────────────────────┐  ┌───────────────────────────────┐
                   │       Deck A Audio Graph      │  │       Deck B Audio Graph      │
                   │  ┌─────────────────────────┐  │  │  ┌─────────────────────────┐  │
                   │  │ AudioBufferSourceNode   │  │  │  │ AudioBufferSourceNode   │  │
                   │  └────────────┬────────────┘  │  │  └────────────┬────────────┘  │
                   │               ▼               │  │               ▼               │
                   │  ┌─────────────────────────┐  │  │  ┌─────────────────────────┐  │
                   │  │ 3-Band BiquadFilter EQ  │  │  │  │ 3-Band BiquadFilter EQ  │  │
                   │  └────────────┬────────────┘  │  │  └────────────┬────────────┘  │
                   │               ▼               │  │               ▼               │
                   │  ┌─────────────────────────┐  │  │  ┌─────────────────────────┐  │
                   │  │ GainNode (Deck Volume)  │  │  │  │ GainNode (Gain Volume)  │  │
                   │  └────────────┬────────────┘  │  │  └────────────┬────────────┘  │
                   └───────────────┼───────────────┘  └───────────────┼───────────────┘
                                   │                                  │
                                   ▼                                  ▼
                      ┌────────────────────────────────────────────────────────┐
                      │          Crossfader Control (GainNode Pair)            │
                      │       Gain A = cos(pos * 0.5 * PI) (Equal-Power)      │
                      │       Gain B = sin(pos * 0.5 * PI) (Equal-Power)      │
                      └───────────────────────────┬────────────────────────────┘
                                                  │
                                                  ▼
                      ┌────────────────────────────────────────────────────────┐
                      │            AudioContext.destination (Output)           │
                      └────────────────────────────────────────────────────────┘
```

---

## 2. Key Features Implemented

1. **Web Audio Core & Equal-Power Crossfader**
   - Sub-millisecond scheduling with `AudioContext` (`latencyHint: 'interactive'`).
   - 3-Band BiquadFilter EQ per deck:
     - Low-Shelf filter @ 320 Hz
     - Peaking filter @ 1000 Hz (Q = 1.0)
     - High-Shelf filter @ 3200 Hz
   - Equal-power crossfader response curve ($A = \cos(\theta), B = \sin(\theta)$).

2. **Music Library Integration Modes**
   - **Local Files**: Support for MP3, WAV, FLAC, OGG, M4A via file picker and Drag & Drop directly onto Deck A or Deck B.
   - **File System Access API**: Folder scanning via `window.showDirectoryPicker()`.
   - **Out-of-the-box Synth Beats**: Built-in Web Audio synthesis producing House, Techno, and Disco tracks so music plays immediately without needing initial files.

3. **Performance & DJ Deck Controls**
   - **Real-Time Scrolling Waveform Display**: 60fps zoomed scrolling waveform moving smoothly under a fixed center playhead marker.
   - **Beat Grid Overlay & Hot Cue Flags**: Visual beat markers synced with BPM and Hot Cue tags rendered on the scrolling waveform.
   - **Overview Strip & Dual Scrubbing**: Full track preview bar with progress fill and dual scrubbing (macro-seek on overview + micro-seek on scrolling canvas).
   - **Turntable / Jog Wheel**: Rotating platter animation with mouse drag-scratching.
   - **Pitch / Playback Rate**: $\pm 8\%$ pitch slider with double-click reset and BPM sync.
   - **4 Hot Cues**: Store timestamp, instant recall, right-click clear.
   - **Beat Loops**: Instant 1, 2, 4, 8 beat loops and manual loop toggle.
   - **Stereo VU Meters**: Animated green $\rightarrow$ yellow $\rightarrow$ red peak meters for Deck A, Deck B, and Master output.
   - **Separate Deck A & Deck B Cued Playlists**:
     - Dedicated playlist queues built, curated, and ordered per deck.
     - Re-ordering (▲ / ▼), direct loading (⚡ Load Now), individual item removal, shuffle, and clear.
     - Nested Tab bar allowing seamless toggling between the **Track Library** and **Cued Playlists** with live track counters.
     - Quick `+Q A` / `+Q B` action buttons in the library table for rapid playlist building.
     - **Duplicate Track Detection & Highlighting**: Automatically detects and visually highlights songs that are cued in both decks (amber warning tag) or queued multiple times within the same deck (red warning tag).
     - **Playlist Saving & JSON Export/Import**: Save setlists locally, manage saved setlists in a dedicated modal, export complete queues to structured `.json` files, and import setlist files directly back into active queues.
     - **Track & Cumulative Playlist Durations**: Automatic duration extraction for all imported/dropped files, with live cumulative playlist runtimes for Deck A, Deck B, and total setlist time.
   - **Live Radio Broadcasting & Streaming**:
     - **WebRTC WHIP Streaming**: Ultra-low latency broadcast ingestion to Cloudflare Stream, OvenMediaEngine, Janus, LiveKit, MediaSoup, and Restream.
     - **Icecast 2 Streaming**: High-fidelity Ogg Opus/WebM HTTP chunked PUT and WebSocket bridge streaming with mount point and source password authentication.
     - **Shoutcast Streaming**: Direct Shoutcast streaming with SID and password authentication.
     - **WebRTC P2P Direct Stream**: Zero-server peer-to-peer broadcast mode for direct browser-to-browser listening.
     - **Master Audio Live Tapping**: Real-time stereo capture of console mix, crossfader, EQs, and filters.
     - **ON AIR Console & Diagnostics**: Neon pulsing ON AIR badge, broadcast timer, live bitrate, MBs sent, and stream event logs.
   - **Auto-Deck Relay Play (Continuous Playback)**:
     - Automatically starts the opposite deck (Deck A $\leftrightarrow$ Deck B) when the active track reaches the end.
     - **Auto-Crossfade**: Smoothly animates the equal-power crossfader to the active deck.
     - **Auto-Queue**: Automatically draws next tracks from each deck's dedicated cued playlist first, or unplayed library tracks, so broadcast music never stops.

---

## 3. Project Structure

- [`version.json`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/version.json): Central version number, release metadata, and structured changelog history.
- [`index.html`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/index.html): HTML5 structure for dual-deck DJ console, central mixer, waveforms, jog wheels, nested tabbed library & cued playlists, broadcasting console, version badges, modal dialog, and track library.
- [`style.css`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/style.css): Custom dark high-tech styling for hardware UI, rotary knobs, sliders, tab navigation, dual playlist queues, broadcasting badges, version tags, modal popups, and LED meters.
- [`WebRadioDecksEngine.js`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/WebRadioDecksEngine.js): Core Web Audio engine complying with [`codebible.md`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/codebible.md), equipped with master MediaStream capture.
- [`broadcast.js`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/broadcast.js): Live radio broadcasting manager supporting WebRTC WHIP, Icecast 2, Shoutcast, and P2P direct streaming.
- [`app.js`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/app.js): DOM controller, scrolling canvas rendering, gesture interactions, tab switcher, cued playlists manager, broadcast UI controller, version modal loader, folder scanner, and keyboard bindings.
- [`midi.js`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/midi.js): Web MIDI API controller manager, presets, and MIDI learn subsystem.

---

## 4. Keyboard Shortcuts

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Play / Pause Deck A |
| <kbd>Enter</kbd> | Play / Pause Deck B |
| <kbd>P</kbd> | Toggle Auto-Deck Relay Play (Continuous Mode) |
| <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd> | Trigger Hot Cues 1..4 (Deck A) |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> | Trigger Hot Cues 1..4 (Deck B) |
| <kbd>←</kbd> / <kbd>→</kbd> | Shift Crossfader Left / Right |

---

## 5. Versioning Protocol & Update Procedure

When major features or structural changes are made to **WebDJRadio**, follow these steps:

1. **Update [`version.json`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/version.json)**:
   - Increment the Semantic Version number (`MAJOR.MINOR.PATCH`).
   - Update `releaseDate` (`YYYY-MM-DD`).
   - Append a new release object to the `changelog` array listing major changes.

2. **Update Application Metadata**:
   - The UI automatically fetches `version.json` and updates the header badge (`v1.6.2`), footer readout, and interactive **Version Notes** modal.

3. **Update Documentation ([`web_dj_radio_guide.md`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/web_dj_radio_guide.md))**:
   - Log major architecture changes in Section 6 below and sync changes across the workspace and artifact directories.

---

## 6. Version History & Changelog

### **v1.6.2** (Release Date: `2026-08-20`)
- **Myriad Cloud Streaming Support & B.U.T.T. Audio Output Routing**
  - **B.U.T.T. Master Audio Routing**: Direct soundcard output routing to Virtual Audio Cables (such as BlackHole 2ch or Loopback) so DJs can route their mix straight into B.U.T.T. and stream to Myriad Cloud with zero browser restrictions.
  - **Local Companion Relay**: Added `icecast-bridge.js` for optional direct WebSocket-to-TCP Icecast relay.
  - **Dedicated Setup Walkthrough**: Added an interactive B.U.T.T. & Myriad Cloud tab in the Broadcast modal with real-time soundcard switching.

### **v1.6.1** (Release Date: `2026-08-20`)
- **B.U.T.T.-Aligned Icecast Configuration & Stream Diagnostics**
  - **B.U.T.T. Settings Parity**: Replaced monolithic URL input with standard individual BUTT fields: Address/Host, Port, Icecast User, Password, Mountpoint, and SSL/HTTPS.
  - **Custom Source Authentication**: Added explicit Icecast User field (defaulting to `source`) for servers with custom administrator or DJ source credentials.
  - **Diagnostic Error Categorization**: Detailed diagnostic logs in the broadcast console identifying HTTP 401 (Auth Failed), HTTP 404 (Mount Not Found), and browser CORS preflight restrictions.

### **v1.6.0** (Release Date: `2026-08-20`)
- **Live Radio Broadcasting & Streaming (WebRTC WHIP, Icecast 2, Shoutcast & P2P)**
  - **WebRTC WHIP Streaming**: Ultra-low latency broadcast ingestion to Cloudflare Stream, OvenMediaEngine, Janus, LiveKit, MediaSoup, and WHIP-compatible distribution networks.
  - **Icecast 2 Streaming**: Direct HTTP chunked PUT and WebSocket bridge streaming in high-fidelity Ogg Opus/WebM audio (up to 320 kbps) with custom mount points and source authentication.
  - **Shoutcast v1/v2 Streaming**: Dedicated Shoutcast streaming client with SID and password authentication.
  - **WebRTC P2P Direct Stream**: Zero-server peer broadcast mode allowing direct browser-to-browser listening.
  - **Master Audio Live Tapping**: Real-time stereo capture of console mix, crossfader, EQs, and filters via Web Audio `createMediaStreamDestination`.
  - **Mixer & Header ON AIR Console**: Dynamic `🔴 ON AIR` flashing status indicator, uptime timer, live bitrate, MBs sent, and stream diagnostics modal.

### **v1.5.1** (Release Date: `2026-08-18`)
- **Instant Track Duration Extraction & Cumulative Cued Playlist Times**
  - **Instant Audio Metadata Reading**: Automatically reads duration for scanned folders, uploaded files, and dropped tracks upon addition to the Track Library.
  - **Individual Queue Durations**: Real-time duration pill badges on Deck A and Deck B headers showing exact playlist runtime.
  - **Combined Total Setlist Time**: Prominent total duration readout (`Total: MM:SS (A: MM:SS | B: MM:SS)`) on the playlist toolbar.
  - **Dynamic Queue Syncing**: Track durations update seamlessly across all library and queue instances.

### **v1.5.0** (Release Date: `2026-08-18`)
- **Cued Playlist Saving, Saved Setlists Manager & JSON Export/Import**
  - **Local Setlist Storage**: Save active Deck A and Deck B queues to browser storage with custom setlist names and timestamps.
  - **Saved Setlists Manager Modal**: Dedicated modal dialog allowing one-click setlist loading (`⚡ Load Both`, `A` only, `B` only), single setlist JSON exporting, and deletion.
  - **JSON File Export**: One-click download of clean, structured `.json` playlist files.
  - **JSON File Import**: Import any previously saved JSON setlist back into active queues with automatic local library matching.

### **v1.4.1** (Release Date: `2026-08-18`)
- **Duplicate Track Detection & Highlighting in Cued Playlists**
  - **Cross-Deck Detection**: Highlights tracks present in both Deck A and Deck B with an amber warning badge (`⚠️ In Deck B` / `⚠️ In Deck A`).
  - **Intra-Deck Detection**: Highlights duplicates within the same deck with a red warning badge (`⚠️ Duplicate (2x)`).
  - **Live Tab Badge Alert**: The Cued Playlists tab badge displays a warning icon (⚠️) and tooltip when duplicates are present.
  - **Immediate Status Toast**: Alerts user immediately upon queueing a track that already exists in the other deck.

### **v1.4.0** (Release Date: `2026-08-17`)
- **Separate Deck A & Deck B Cued Playlists & Tabbed Library**
  - **Dedicated Deck Queues**: Build, curate, and reorder separate playlist queues for Deck A and Deck B independently.
  - **Nested Tab Navigation**: Seamlessly switch between the full **Track Library** and the dual **Cued Playlists** view with live count badges (`A: X | B: Y`).
  - **Queue Control Actions**: Move Up/Down (▲ / ▼), Instant Load (⚡ Load Now), remove item (✕), playlist shuffle (🔀), and clear queue (🗑).
  - **Quick Table Queue Buttons**: Direct `+Q A` and `+Q B` buttons in the library table rows and header.
  - **Auto-Deck Relay Integration**: Automatically advances and consumes each deck's dedicated cued playlist during continuous relay playback.

### **v1.3.0** (Release Date: `2026-08-17`)
- **Continuous Auto-Deck Relay Play & Auto-Queue**
  - **Automatic Deck Handoff**: When a track finishes on Deck A, Deck B starts playing automatically (and vice versa).
  - **Zero Dead Air**: Accurate Web Audio `onended` lifecycle event hook for sample-accurate track transitions.
  - **Smooth Auto-Crossfade**: Animated cubic ease-in-out crossfader gliding to the active deck.
  - **Continuous Auto-Queue**: Automatically loads the next unplayed track from the library into the idle deck so radio playback continues indefinitely.
  - **Mixer Relay Console**: Dedicated toggle button with active neon LED indicator, Auto-XFade, and Auto-Queue controls on central mixer.
  - **MIDI & Keyboard Shortcuts**: MIDI learn action (`auto_relay`) and keyboard shortcut (<kbd>P</kbd>).

### **v1.2.0** (Release Date: `2026-08-13`)
- **USB MIDI Controller Support**
  - Web MIDI API : `navigator.requestMIDIAccess()` with hot-plug detection (devices shown live as you plug in).
  - Built-in presets : Pioneer DDJ-200, DDJ-400, Numark Party Mix, Behringer CMD Studio/Micro.
  - Auto-detect : Matches device name automatically and loads the right preset.
  - MIDI Learn : Select any action → click Start Learn → move a knob/button on controller → mapping saved.
  - Persistence : Mappings stored in `localStorage` and survive page reloads.
  - Mapped controls : Play/Pause, Cue, Sync, Loop, Hot Cues 1–4, Pitch, Volume, EQ High/Mid/Low, Jog Wheel, Crossfader, Master Volume.
  - Activity log : Live monitor showing every incoming MIDI message with action name and deck.
  - UI sync : CC changes mirror back to on-screen sliders (volume, pitch, crossfader).
  - Access it via the 🎛 MIDI Controller button in the header.
- **✅ Knob Rotation Fix** 
  - The pointer indicator now pivots correctly from the centre of the knob circle using CSS `transform-origin: 50% 17px` on `.rotary-pointer`.

### **v1.1.0** (Release Date: `2026-08-11`)
- **Real-Time Dynamic Scrolling Waveform**
  - Implemented 60fps smooth scrolling zoomed waveform display centered at the active playhead position.
  - Added BPM beat grid lines overlay and Hot Cue flag tags on the waveform.
  - Added full-track overview strip with shaded progress overlay.
  - Dual scrubbing support: Micro-nudge on scrolling canvas + Macro-seek on overview bar.

### **v1.0.1** (Release Date: `2026-08-11`)
- **AudioBuffer & Demo Synth Fix**
  - Updated `loadTrack` in [`WebRadioDecksEngine.js`](file:///Users/denniscollins/Library/CloudStorage/OneDrive-MurdochUniversity/PhD/research/WebDJRadio/WebRadioDecksEngine.js) to accept pre-rendered `AudioBuffer` instances directly.

### **v1.0.0** (Release Date: `2026-08-11`)
- **Initial Production Release**
  - Dual-deck Web Audio engine, 3-band EQ, equal-power crossfader, and file system scanner.


