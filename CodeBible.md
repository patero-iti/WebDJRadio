# WebDJRadio — System Architecture & CodeBible Specification

> **Version:** `2.0.0`  
> **Classification:** Comprehensive Technical Manual, Architecture Reference & Operating Specification  
> **Engine:** Zero-Latency Web Audio API Dual-Deck DJ Workstation, Broadcast CART Wall, Studio Hub, Zero-Scroll Tabbed Workspace & Radio Console

---

## 1. Executive Summary & System Overview

**WebDJRadio** is a browser-native, studio-grade dual-deck DJ mixing console and live radio broadcast workstation. Engineered strictly with vanilla JavaScript and the standard **Web Audio API**, the application delivers sample-accurate scheduling, zero-perceived latency, real-time 3-band EQ, dual-filter sweeping, a studio software FX rack, automated continuous relay playback, a 4-slot broadcast CART Wall pad controller with dedicated audio routing, a Universal Design **Zero-Scroll Tabbed Workspace** with primary views (**🎙️ On-Air Studio** and **🗃️ Music Management**), layout customization (**Radio A**, **Radio B**, **Radio C**, and **DJ Console**), USB MIDI controller hardware integration, live microphone & external audio input mixing with talkover ducking, and multi-protocol live radio streaming (WebRTC WHIP, Icecast 2, Shoutcast, and B.U.T.T. virtual soundcard routing).

---

## 2. Complete Web Audio Graph Architecture

Each deck operates an independent Web Audio DSP chain, while live microphone & auxiliary inputs feed through a dedicated gain and analysis stage directly into the master bus and live broadcast stream:

```
                            ┌────────────────────────────────────────────────────────────────────────┐
                            │                             WebDJRadio UI                              │
                            └───────────┬───────────────────────────────┬────────────────┬───────────┘
                                        │                               │                │
                                        ▼                               ▼                ▼
                        ┌───────────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────────┐
                        │         Deck A Audio          │ │   Live Microphone / Input │ │         Deck B Audio          │
                        │    (BufferSourceNode)         │ │   (MediaStreamAudioSource)│ │    (BufferSourceNode)         │
                        └───────────────┬───────────────┘ └─────────────┬─────────────┘ └───────────────┬───────────────┘
                                        │                               │                               │
                                        ▼                               ▼                               ▼
                        ┌───────────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────────┐
                        │ 3-Band Equalizer (Low/Mid/Hi) │ │ Mic Gain Node (0% - 150%) │ │ 3-Band Equalizer (Low/Mid/Hi) │
                        └───────────────┬───────────────┘ └─────────────┬─────────────┘ └───────────────┬───────────────┘
                                        │                               │                               │
                                        ▼                               ▼                               ▼
                        ┌───────────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────────┐
                        │ Dual Filter (HPF / LPF Sweep) │ │ Mic Analyser (VU Peak)    │ │ Dual Filter (HPF / LPF Sweep) │
                        └───────────────┬───────────────┘ └─────────────┬─────────────┘ └───────────────┬───────────────┘
                                        │                               │                               │
                                        ▼                               │                               ▼
                        ┌───────────────────────────────┐               │               ┌───────────────────────────────┐
                        │ Studio Software FX Unit:      │               │               │ Studio Software FX Unit:      │
                        │ - BPM-Synced Delay            │               │               │ - BPM-Synced Delay            │
                        │ - Algorithmic Reverb          │               │               │ - Algorithmic Reverb          │
                        │ - Flanger / Phaser            │               │               │ - Flanger / Phaser            │
                        │ - Lo-Fi Bitcrusher            │               │               │ - Lo-Fi Bitcrusher            │
                        └───────────────┬───────────────┘               │               └───────────────┬───────────────┘
                                        │                               │                               │
                                        ▼                               │                               ▼
                        ┌───────────────────────────────┐               │               ┌───────────────────────────────┐
                        │ Volume Gain & Peak Analyser   │               │               │ Volume Gain & Peak Analyser   │
                        └───────────────┬───────────────┘               │               └───────────────┬───────────────┘
                                        │                               │                               │
                                        ▼                               │                               ▼
                        ┌───────────────────────────────────────────────┴───────────────────────────────┐
                        │             Equal-Power Crossfader (cos/sin Gain + Talkover Ducking)          │
                        └───────────────────────────────────────────────┬───────────────────────────────┘
                                                                        │
                                                                        ▼
                        ┌───────────────────────────────────────────────────────────────────────────────┐
                        │           Local Audio Output          │       │        Radio Broadcast Stream     │
                        │  - AudioContext.destination           │       │  - WebRTC WHIP / P2P Mesh         │
                        │  - AudioContext.setSinkId (B.U.T.T.)  │       │  - Icecast 2 & Shoutcast Streams  │
                        └───────────────────────────────────────┘       │  - Live Broadcast Ingestion Tap   │
                                                                        └───────────────────────────────────┘
```

---

## 3. Core Functions & Technical Features

### 3.1. Dual-Deck Web Audio Playback Engine (`WebRadioDecksEngine.js`)
* **Interactive Latency Initialization**: Instantiates `AudioContext` with `{ latencyHint: 'interactive' }`.
* **Zero-Latency Instant Triggers**: Uses dynamic `AudioBufferSourceNode` creation and sub-millisecond scheduling on play, cue, loop, and hot cue triggers.
* **Equal-Power Crossfader Curve**: Maintains constant acoustic power across the transition sweep:
  $$\text{Gain}_A = \cos\left(\text{position} \times \frac{\pi}{2}\right), \quad \text{Gain}_B = \sin\left(\text{position} \times \frac{\pi}{2}\right)$$
* **3-Band Frequency Equalizer**:
  * **Low-Shelf Filter**: Corner frequency $320\text{ Hz}$ ($-24\text{ dB} \dots +6\text{ dB}$).
  * **Peaking Filter (Mid)**: Center frequency $1000\text{ Hz}$, $Q = 1.0$ ($-24\text{ dB} \dots +6\text{ dB}$).
  * **High-Shelf Filter**: Corner frequency $3200\text{ Hz}$ ($-24\text{ dB} \dots +6\text{ dB}$).
  * **True Center Detent**: Center knob position ($12\text{ o'clock}$ / $0^\circ$) is calibrated to exactly $0\text{ dB}$ (flat/unity gain).

### 3.2. Studio Software FX Engine & On-Deck Quick Strips
* **1. Bi-directional High-Pass / Low-Pass Dual Filter**:
  * Sweeps between Low-Pass ($-100\% \dots 0$) and High-Pass ($0 \dots +100\%$) with dynamic resonant $Q$ scaling ($0.7 \dots 4.2$).
  * Center detent ($0.0$) completely bypasses the filter ($20\text{ Hz} \dots 20\text{ kHz}$).
* **2. Echo & BPM-Synced Delay**:
  * Tempo-locked delay divisions ($1/16, 1/8, 1/4, 1/2, 3/4, 1, 2\text{ beats}$) calculated dynamically from deck BPM:
    $$\text{DelayTime (s)} = \left(\frac{60}{\text{BPM}}\right) \times \text{Beats}$$
  * Built-in analog tape low-pass damping filter ($4000\text{ Hz}$) inside the feedback loop.
  * Feedback repeat scaling ($0 \dots 92\%$) and dry/wet mix slider.
* **3. Studio Reverb**:
  * Convolver-based stereo algorithmic impulse response generator with exponential decay envelope:
    $$\text{Envelope}(t) = (1 - t)^{\text{decay}}$$
  * Acoustic space presets: **Small Room**, **Club / Studio**, **Cathedral Hall**, and **Cosmic Arena**.
* **4. Flanger / Phaser Modulator**:
  * Modulated short delay line ($3\text{ ms}$) driven by a sine-wave LFO ($0.1\text{ Hz} \dots 8.0\text{ Hz}$) with variable feedback resonance ($0 \dots 88\%$).
* **5. Lo-Fi Bitcrusher & Distortion**:
  * Curve-based amplitude step quantization into $2^{\text{bits}}$ discrete levels ($2\text{ to }16\text{ bits}$):
    $$y = \frac{\text{round}(x \times 2^{\text{bits}-1})}{2^{\text{bits}-1}}$$
* **6. Performance Beat Roll (Instant Momentary Loop)**:
  * Instant slip-mode loop for $1/16, 1/8, 1/4, 1/2, 1, 2, 4\text{ beats}$.
  * Loops the selected beat window on press/hold, and upon release immediately disengages the loop to seamlessly continue normal forward playback.
* **7. On-Deck Hardware Quick FX Strips (Deck A & B)**:
  * Mini control strip integrated into Deck A and Deck B panels for immediate performance manipulation.
  * 4 rotary dials: **Echo/Delay**, **Reverb**, **Flanger**, and **Lo-Fi Bitcrusher**.
  * **Right-Click Parameter Assignment**: Right-click any dial (or left-click its sublabel) to switch the active parameter:
    * **Delay**: Feedback (`FDBK`), Dry/Wet Mix (`W/D`), Delay Timing (`TIME`), or Tape Damping (`DAMP`).
    * **Reverb**: Dry/Wet Mix (`W/D`) or Decay Time (`DECAY`).
    * **Flanger**: Feedback Resonance (`FDBK`), Dry/Wet Mix (`W/D`), LFO Speed (`RATE`), or Modulation Depth (`DEPTH`).
    * **Bitcrusher**: Dry/Wet Mix (`W/D`) or Bit Depth Crush (`BITS`).
  * 4 dedicated ON/OFF toggle buttons with active glowing LED status indicators.
  * Auto-recalibrating knob angles matching each parameter's range, with persistent preferences in `localStorage`.
  * Real-time bi-directional synchronization between on-deck dials, the Software FX rack modal, and USB MIDI controllers.

### 3.3. Performance Deck & Visual Controls
* **Real-Time Scrolling Waveform Display (60 FPS)**: Zoomed multi-channel audio slice rendering smoothly under a fixed center playhead marker.
* **Beat Grid & Hot Cue Markers**: Visual beat lines synchronized to BPM and colored cue point flags drawn directly on the scrolling canvas.
* **Overview Track Strip & Dual Scrubbing**: Macro-seek across the full track overview combined with micro-jog scrubbing.
* **Turntable Platter & Jog Wheel**: Inertial rotational animation with mouse/touch drag-scratching.
* **Pitch & Tempo Fader**: $\pm 8\%$ pitch adjustment range ($0.001$ resolution), live percentage readouts, and double-click center reset.
* **BPM & Key Displays**: Dedicated hardware-style readouts for live BPM and Camelot Key on Deck A and Deck B faceplates.
* **Deck Album Artwork Badges**: Dedicated illuminated cover art display frames in Deck A and Deck B headers with dynamic deck glow accents.
* **BPM Sync**: One-click instantaneous tempo and phase alignment between Deck A and Deck B.
* **Hot Cues**: 4 dedicated hot cue slots per deck (click to store/jump, right-click context menu to clear).
* **Peak Stereo VU Meters**: 60 FPS hardware-style LED level meters (green $\rightarrow$ amber $\rightarrow$ red clipping) for Deck A, Deck B, and Master output.
* **End-of-Track Red Alert (10s EOTW Warning)**: When an active playing track reaches $\le 10\text{ seconds}$ remaining audio, the track title, TIME badge, overview progress bar, and deck perimeter pulse in glowing alert red to signal the DJ/presenter to prepare the next transition.

### 3.4. Track Library, Audio Analysis & Metadata Management (`audio-analysis.js`)
* **Binary Metadata Tag Parser (`AudioMetadataParser`)**:
  * Client-side binary parsing for ID3v2.2, ID3v2.3, ID3v2.4, ID3v1, MP4/M4A atoms, FLAC Vorbis comments, and WAV RIFF INFO chunks.
  * Ingests real Artist (`TPE1`), Title (`TIT2`), Album (`TALB`), BPM (`TBPM` / `tmpo`), Musical Key (`TKEY` / `initialkey`), and embedded Album Artwork (`APIC`, `PIC`, `covr`, and FLAC Picture blocks).
* **Interactive Metadata & Artwork Editor**:
  * Dedicated modal window (triggered via `✏️` button on track rows, double-clicking any track row, or clicking `✏️ Edit Info` in the toolbar).
  * Direct editing for Track Title, Artist Name, Album Name, BPM, and Camelot Key dropdown.
  * Built-in cover art replacement (upload custom JPEG/PNG/WebP/GIF) or removal with instant visual preview.
  * On-demand `⚡ DSP` re-analysis trigger.
  * Immediate live propagation to active Deck A/B headers, overview strips, and playlist queues.
* **DSP Beat & Tempo Detector (`AudioDSPAnalyzer.analyzeBPM`)**:
  * Downsampled signal path with $150\text{ Hz}$ low-pass bass filtering to isolate kick drum onsets.
  * Autocorrelation across lag windows ($65 \dots 180\text{ BPM}$) with double/half-time harmonic scaling to calculate real tempo when ID3 tags are omitted.
* **DSP Harmonic Key Estimator (`AudioDSPAnalyzer.analyzeKey`)**:
  * 12-semitone Pitch Class Profile (Chromagram) accumulated across musical octave frequency bands.
  * Correlated against standard Krumhansl-Kessler 12 Major and 12 Minor harmonic key profiles.
  * Normalizes musical keys into Camelot wheel DJ notation (e.g. `8A (Am)`, `8B (C)`, `11B (A)`).
* **Track Artwork Display**: Dedicated `ART` column in the Track Library table and miniature cover art badges in Deck A and Deck B Cued Playlists.
* **Local Media Support**: Ingests MP3, WAV, FLAC, OGG, and AAC/M4A via drag-and-drop or file pickers.
* **File System Access API Directory Scanning**: Full folder scanning via `window.showDirectoryPicker()` with automatic metadata and duration parsing.
* **Separate Deck A & Deck B Cued Playlists**:
  * Dedicated playlist queues with re-ordering ($\blacktriangle / \blacktriangledown$), instant load (⚡ Load Now), individual removal, shuffle, and clear.
  * **Duplicate Detection**: Amber warning badge for cross-deck duplicate tracks; red warning badge for same-deck duplicate entries.
  * **Setlist Persistence & JSON Export/Import**: Save setlists locally in `localStorage`, export queues to `.json` files, and import setlist files directly into active queues.
  * **Live Cumulative Durations**: Displays individual track durations and real-time cumulative playlist runtimes.

### 3.5. Automated Continuous Playback (Auto-Deck Relay)
* **Continuous Auto-Relay**: Automatically triggers playback on the opposite deck when the active song finishes.
* **Smooth Auto-Crossfade**: Smooth cubic ease-in-out animation of the physical crossfader slider over the transition duration:
  $$\text{Progress}(t) = \begin{cases} 4t^3 & \text{if } t < 0.5 \\ 1 - \frac{(-2t + 2)^3}{2} & \text{if } t \ge 0.5 \end{cases}$$
* **Auto-Queue**: Automatically pulls upcoming tracks from each deck's dedicated cued playlist (or library) to ensure 24/7 continuous broadcast play.

### 3.6. Live Microphone, Host & Audio Input Subsystem (`WebRadioDecksEngine.js`)
* **Hardware Input Enumeration**: Dynamically queries and populates `navigator.mediaDevices.enumerateDevices()` (`kind === 'audioinput'`) for USB audio interfaces (Behringer UMC, Focusrite, PreSonus, Rode), Bluetooth headsets/AirPods, and internal mics.
* **Input Channel Routing & Mono Centering Matrix**:
  * Solves single-ear panning issues on 2-channel audio interfaces (such as Behringer UMC202HD, Focusrite Scarlett 2i2) where microphone input 1 is hardwired to Left and input 2 to Right.
  * Real-time `ChannelSplitterNode(2)` $\rightarrow$ Gain Matrix $\rightarrow$ `ChannelMergerNode(2)` routing with 4 selectable modes:
    * **Mono — Input 1 / Left (Centered)**: Directs Channel 1 to both Left & Right headphone/broadcast channels equally.
    * **Mono — Sum L+R (Centered Mix)**: Sums both inputs with $-3\text{ dB}$ headroom protection.
    * **Mono — Input 2 / Right (Centered)**: Directs Channel 2 to both Left & Right channels equally.
    * **Stereo**: True unmixed separate Left and Right channel passthrough.
* **Dedicated Mixer Channel Strip (`.mic-strip`)**:
  * Precision vertical gain fader ($0\% \dots 150\%$) with persistent volume memory.
  * Real-time 60 FPS LED peak VU meter bar isolated to incoming voice amplitude.
  * Illuminated **MIC ON / ON AIR** toggle button with glowing pulsating broadcast red indicator.
* **Talkover Auto-Ducking Engine**:
  * Smooth $-9\text{ dB}$ (gain factor $0.35$) automatic attenuation of music channels (Deck A & Deck B) whenever the presenter speaks.
  * Instantaneous ramp-restoration when the microphone is muted or released.
* **Full Stream & Soundcard Distribution**:
  * Taps microphone audio directly into `masterGain` and `masterStreamDest`, broadcasting host voice across all active output targets (Local Speakers, B.U.T.T. virtual soundcards, WebRTC WHIP, Icecast, Shoutcast, and P2P).
* **Hotplug & Permission Handling**:
  * Automatic soundcard re-enumeration on USB connect/disconnect via `devicechange` events.
  * One-click permission prompt and test signal trigger in the B.U.T.T. / Audio Routing modal.

### 3.7. Live Radio Broadcasting Subsystem (`broadcast.js`)
* **1. WebRTC WHIP Streaming**: Ultra-low latency broadcast ingestion to WHIP endpoints (Cloudflare Stream, OvenMediaEngine, Janus, LiveKit, MediaSoup).
* **2. Icecast 2 Streaming**: High-fidelity Ogg Opus/WebM audio chunked streaming with mountpoint and source password authentication. Includes companion WebSocket TCP bridge relay (`icecast-bridge.js`).
* **3. Shoutcast v1/v2 Streaming**: Direct Shoutcast ingestion with SID and admin password authentication.
* **4. WebRTC P2P Direct Broadcasting**: Serverless peer-to-peer broadcast streaming using SDP exchange.
* **5. Master Audio Hardware Routing (B.U.T.T. Direct)**:
  * Integrates with **BlackHole 2ch**, **Loopback**, **VB-Cable**, and external USB audio interfaces using `AudioContext.setSinkId()`.
  * Bypasses browser CORS restrictions by piping clean console audio straight into B.U.T.T. for commercial servers (e.g. Myriad Cloud).
  * Dynamic hotplug detection via `navigator.mediaDevices.ondevicechange`.
* **Live Broadcast Diagnostics**: Real-time elapsed timer, live bitrate readout, MBs sent counter, pulsing ON AIR indicator, and diagnostic log terminal.

### 3.8. USB MIDI Controller Hardware Support (`midi.js`)
* **Web MIDI API Integration**: Automatic device detection, connection status badges, and message parsing.
* **Controller Presets**: Out-of-the-box mappings for **Pioneer DDJ-200**, **Pioneer DDJ-400**, **Numark Party Mix**, and **Behringer CMD Studio/Micro**.
* **Interactive MIDI Learn**: Click "Start Learn", move any physical control, and automatically bind to any mixer function.
* **Portable JSON Export & Import**:
  * **💾 Export JSON**: Downloads a structured `.json` configuration file containing all current mapping definitions, CC/Note channels, actions, and connected hardware info.
  * **📂 Import JSON**: One-click file picker to load, validate, and restore saved MIDI mappings across any workstation or browser instance.
* **1:1 Graphic Mirroring**: Bi-directional visual synchronization for crossfader, volume faders, master volume, 3-band EQ, dual filter knobs, pitch faders, and performance pads.

### 3.9. Quad Layout Subsystem & Visibility Customizer (Radio A, Radio B, Radio C, DJ)
* **Top Banner Switcher Sequence**: `[ 🎙️ Radio A ] -> [ 📻 Radio B ] -> [ 📻 Radio C (Hidden by Default) ] -> [ 🎧 DJ ] -> [ ⚙️ ]`.
* **Layout Visibility Manager (`⚙️`)**:
  * An interactive configuration popover on the top switcher bar that allows hosts to toggle the visibility of any layout (`Radio A`, `Radio B`, `Radio C`, `DJ`).
  * **Radio C** is hidden by default to keep the interface focused, but remains completely intact in the codebase and can be restored or hidden instantly at any time.
  * Preferences persist in `localStorage` (`webdj_layout_visibility`).
* **1. Radio A Studio Hub & On-Air Trivia Layout (`mode-radio-c`)**:
  * Flagship live radio console featuring two vertically stacked studio information panels directly to the left of the Web Radio Mixer (together matching the full height of the Mixer and CART Wall):
    * **Top Panel ("Studio Hub")**: Real-time dual digital clocks for Local Host Time (with dynamic timezone city detection) and Perth Western Australia Time (AWST / UTC+8); live temperature and weather condition feeds for Perth Station and Local broadcast venue via Open-Meteo.
    * **Bottom Panel ("Now Playing & Trivia")**: High-visibility album artwork, title, artist, year, label, BPM, and musical key tags; live real-world artist biographies and discography lore fetched from **TheAudioDB**, **MusicBrainz**, and **Wikipedia** combined with procedural presenter liner notes and harmonic mixing tips, complete with a live `↺ Next Fact` cycle button.
    * **Web Radio Mixer & CART Wall Integration**: Full 5-strip broadcast mixer (`[ MST ] -> [ MIC ] -> [ CH A ] -> [ CH B ] -> [ CARTS ]`) with 160px faders, peak VU meters, and 4-slot square CART wall.
* **2. Radio B Pure Mixer + CART Wall Layout (`mode-radio-b`)**:
  * Dedicated pure presenter workstation centered around the Web Radio Mixer and the 4-slot square Broadcast CART Wall.
  * Displays real-time metadata badges and precision `-MM:SS.d` playback countdowns on CH A & CH B strips.
  * Flashes high-visibility red ending warning across the entire channel strip at 10 seconds remaining.
* **3. Radio C Dual-Deck Broadcast Layout (`mode-radio`)**:
  * Designed for station presenters wanting dual deck faceplates (`Deck A` and `Deck B`) alongside the mixer console, with scrolling and overview waveforms, transport strips, pitch sliders, and mic voiceover strip.
  * Hides performance DJ controls (loops, roll bars, quick FX, 3-band EQ rack, crossfader).
* **4. DJ Console Layout (`mode-dj`)**:
  * Comprehensive club DJ controller interface with dual performance decks, 4 Hot Cues, Beat Loops (1–8 beats), Beat Rolls, On-Deck Quick FX strips, 3-band rotary EQ, dual-filter sweeps, pitch tempo sliders, equal-power crossfader, and 4-channel broadcast mixer.

---

## 4. Operational Workflows

### 4.1. Standard DJ Mixing Workflow
1. **Unlock Audio**: Click **⚡ Unlock Engine** (or press <kbd>Space</kbd>) to initialize the Web Audio context.
2. **Load Tracks**: Drag audio files onto Deck A / Deck B, scan a local music folder, or click **🎹 Generate Demo Beat**.
3. **Set Cue Points & Loops**: Use Hot Cues (<kbd>Q/W/E/R</kbd> or <kbd>1/2/3/4</kbd>) and Beat Loop buttons to prepare drop points.
4. **Beatmatch & Sync**: Adjust pitch sliders or click **SYNC** to match tempos.
5. **Mix & Transition**: Sweep EQ knobs, turn the **FILTER** knob, apply **Echo/Reverb**, and slide the **CROSSFADER** (<kbd>←</kbd> / <kbd>→</kbd>).

### 4.2. Live Radio Broadcasting Workflow (Myriad Cloud & B.U.T.T.)
1. Open **📡 Broadcast** $\rightarrow$ **🎧 B.U.T.T. / Audio Routing**.
2. Click **🔄 Refresh** and allow browser audio permissions to reveal soundcards (**BlackHole 2ch** / Audio Interface).
3. Select **BlackHole 2ch** as the *Master Audio Output Device*.
4. In **B.U.T.T.**, set Audio Device to **BlackHole 2ch**, configure your Myriad Cloud / Icecast credentials, and click **Play / Connect**.
5. Enable **AUTO-DECK RELAY** (<kbd>P</kbd>) and populate Cued Playlists for unattended continuous broadcasting.

### 4.3. Presenter Voiceover & Live Host Workflow
1. Open **📡 Broadcast** $\rightarrow$ **🎧 B.U.T.T. / Audio Routing** and choose your preferred *Live Microphone / Audio Input Device* (e.g. Focusrite USB, Bluetooth Headset, or Internal Mic).
2. Click **🎙️ Connect / Test Mic** to grant microphone access.
3. On the central mixer, adjust the **MIC** vertical fader to set your voice level.
4. Enable **TALK** if you want automatic $-9\text{ dB}$ music ducking while speaking over tracks.
5. Press <kbd>M</kbd> (or click the glowing **MIC** button) to go live on air!

### 4.4. Zero-Scroll Tabbed Workspace & Mini On-Air Monitor Workflow
1. Use the top **Primary View Switcher** (`🎙️ ON-AIR STUDIO` vs. `🗃️ MUSIC`) or press <kbd>Tab</kbd> / <kbd>`</kbd> to toggle between your live performance console and your music library workspace.
2. In **MUSIC** view, the console expands to full height (`58vh` table container) for effortless searching, tag editing, playlist cueing, and CART Wall assignment.
3. The **Sticky Mini On-Air Monitor Bar** at the top of Music view keeps live broadcast status in view:
   - Live Deck A & Deck B track titles, artist names, and album art thumbnails.
   - Real-time `-MM:SS.d` countdown time remaining gauges and 10s flashing ending alerts.
   - 1-click Deck A / Deck B play/pause controls and active CART counters with master stop.
   - Immediate **↩ Return to Studio** button (<kbd>Esc</kbd>).

---

## 5. Keyboard Shortcuts Reference

| Key / Combination | Scope | Action |
| :--- | :--- | :--- |
| <kbd>Tab</kbd> or <kbd>`</kbd> | Global | Toggle between **On-Air Studio** and **Music** views |
| <kbd>Esc</kbd> | Global | Return to **On-Air Studio** view / Close active modal dialog |
| <kbd>Space</kbd> | Deck A | Play / Pause Deck A |
| <kbd>Enter</kbd> | Deck B | Play / Pause Deck B |
| <kbd>M</kbd> | Mixer | Toggle Live Microphone On / Mute |
| <kbd>Shift</kbd> + <kbd>M</kbd> | Header | Open MIDI Controller Mapping Panel |
| <kbd>C</kbd> | Deck A | Trigger / Hold Cue Point Deck A |
| <kbd>V</kbd> | Deck B | Trigger / Hold Cue Point Deck B |
| <kbd>Q</kbd> / <kbd>W</kbd> / <kbd>E</kbd> / <kbd>R</kbd> | Deck A | Trigger Hot Cue Slots 1, 2, 3, 4 (Deck A) |
| <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> / <kbd>4</kbd> | Deck B | Trigger Hot Cue Slots 1, 2, 3, 4 (Deck B) |
| <kbd>←</kbd> (Left Arrow) | Mixer | Nudge Crossfader towards Deck A |
| <kbd>→</kbd> (Right Arrow) | Mixer | Nudge Crossfader towards Deck B |
| <kbd>P</kbd> | Global | Toggle Auto-Deck Continuous Relay Play |
| <kbd>B</kbd> | Header | Open Live Radio Broadcasting Modal |
| <kbd>X</kbd> | Header | Open Studio Software FX Rack |

---

## 6. Project Structure & Code Organization

```
WebDJRadio/
├── index.html                  # HTML5 layout, DJ console, mixer, waveforms, modals, and library
├── style.css                   # High-tech cyber styling, responsive grid, rotary knobs, and LED meters
├── WebRadioDecksEngine.js      # Core Web Audio DSP graph, filters, EQ, FX algorithms, and synthesis
├── broadcast.js                # Live streaming subsystem (WebRTC WHIP, Icecast 2, Shoutcast, P2P)
├── midi.js                     # USB MIDI controller manager, device scanner, presets, and MIDI Learn
├── app.js                      # Main application controller, UI bindings, waveform canvas, and queues
├── version.json                # Single source of truth for semantic versioning and release notes
├── icecast-bridge.js           # Companion Node.js WebSocket-to-TCP Icecast relay bridge
├── CodeBible.md                # System Architecture, Technical Manual & Operating Specification
└── Bak/                        # Release snapshots and immutable version archives
    ├── V1.2.0/
    ├── V1.3.0/
    ├── V1.6.2/
    └── V1.7.0/
```

---

## 7. Versioning Protocols & Governance

WebDJRadio adheres to strict **Semantic Versioning 2.0.0 (`MAJOR.MINOR.PATCH`)**:

1. **MAJOR (`X.0.0`)**: Incompatible architectural overhauls, engine rewrites, or breaking audio graph changes.
2. **MINOR (`1.X.0`)**: Substantial new features, new audio DSP effects, new streaming protocols, or UI additions (backward-compatible).
3. **PATCH (`1.7.X`)**: Bug fixes, performance optimizations, calibration adjustments, and documentation improvements.

### Version Release & Synchronization Rules
* **Single Source of Truth (`version.json`)**: All version numbers and structured changelogs originate from `version.json`.
* **Runtime Version Ingestion**: `app.js` dynamically fetches `version.json` on startup, updating header badges (`#app-version-tag`), footer labels, and rendering the interactive **📜 Version Notes** modal.
* **Release Archive Protocol**: Prior to merging major/minor updates, a full frozen snapshot of the application state is created under `/Bak/V{version}/` to ensure historical rollback reliability.

---
*Maintained by the WebDJRadio Project • Built with Web Audio API & Modern Web Standards.*
