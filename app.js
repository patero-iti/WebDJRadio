/**
 * app.js - WebDJRadio Application Controller & UI Binder
 * Connects WebRadioDecksEngine to DOM controls, canvas visualizers,
 * file system scanners, drag & drop, and rotary gesture controllers.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Audio Engine
  const engine = new WebRadioDecksEngine();
  
  // Track Library Data Array
  let libraryTracks = [];
  let selectedTrackId = null;

  // DOM Elements - Status & Header
  const audioStatusDot = document.getElementById('audio-status-dot');
  const audioStatusText = document.getElementById('audio-status-text');
  const btnUnlockAudio = document.getElementById('btn-unlock-audio');
  const btnScanFolder = document.getElementById('btn-scan-folder');
  const btnGenDemo = document.getElementById('btn-gen-demo');
  const fileInputGlobal = document.getElementById('file-input-global');
  const searchLibrary = document.getElementById('search-library');
  const libraryTbody = document.getElementById('library-tbody');

  // DOM Elements - Tabs & Cued Playlists
  const tabBtnLibrary = document.getElementById('tab-btn-library');
  const tabBtnQueues = document.getElementById('tab-btn-queues');
  const tabContentLibrary = document.getElementById('tab-content-library');
  const tabContentQueues = document.getElementById('tab-content-queues');
  const libraryCountBadge = document.getElementById('library-count-badge');
  const queuesCountBadge = document.getElementById('queues-count-badge');
  const queueACount = document.getElementById('queue-a-count');
  const queueBCount = document.getElementById('queue-b-count');
  const queueListA = document.getElementById('queue-list-a');
  const queueListB = document.getElementById('queue-list-b');

  // Deck Cued Playlist Queue Arrays
  const deckQueues = { A: [], B: [] };

  // DOM Elements - Decks
  const deckAElements = {
    title: document.getElementById('deck-a-title'),
    artist: document.getElementById('deck-a-artist'),
    bpm: document.getElementById('deck-a-bpm'),
    key: document.getElementById('deck-a-key'),
    time: document.getElementById('deck-a-time'),
    artImg: document.getElementById('deck-a-art'),
    artPlaceholder: document.getElementById('deck-a-art-placeholder'),
    waveformScrolling: document.getElementById('waveform-scrolling-a'),
    waveformOverview: document.getElementById('waveform-overview-a'),
    overviewProgress: document.getElementById('overview-progress-a'),
    overviewStrip: document.getElementById('overview-strip-a'),
    waveformBox: document.getElementById('waveform-container-a'),
    jog: document.getElementById('jog-a'),
    btnPlay: document.getElementById('btn-play-a'),
    btnCue: document.getElementById('btn-cue-a'),
    btnSync: document.getElementById('btn-sync-a'),
    pitchSlider: document.getElementById('pitch-a'),
    pitchVal: document.getElementById('deck-a-pitch-val'),
    volSlider: document.getElementById('vol-a'),
    vuFill: document.getElementById('vu-a'),
    panel: document.getElementById('panel-deck-a'),
    loopToggle: document.getElementById('btn-loop-toggle-a')
  };

  const deckBElements = {
    title: document.getElementById('deck-b-title'),
    artist: document.getElementById('deck-b-artist'),
    bpm: document.getElementById('deck-b-bpm'),
    key: document.getElementById('deck-b-key'),
    time: document.getElementById('deck-b-time'),
    artImg: document.getElementById('deck-b-art'),
    artPlaceholder: document.getElementById('deck-b-art-placeholder'),
    waveformScrolling: document.getElementById('waveform-scrolling-b'),
    waveformOverview: document.getElementById('waveform-overview-b'),
    overviewProgress: document.getElementById('overview-progress-b'),
    overviewStrip: document.getElementById('overview-strip-b'),
    waveformBox: document.getElementById('waveform-container-b'),
    jog: document.getElementById('jog-b'),
    btnPlay: document.getElementById('btn-play-b'),
    btnCue: document.getElementById('btn-cue-b'),
    btnSync: document.getElementById('btn-sync-b'),
    pitchSlider: document.getElementById('pitch-b'),
    pitchVal: document.getElementById('deck-b-pitch-val'),
    volSlider: document.getElementById('vol-b'),
    vuFill: document.getElementById('vu-b'),
    panel: document.getElementById('panel-deck-b'),
    loopToggle: document.getElementById('btn-loop-toggle-b')
  };

  const crossfader = document.getElementById('crossfader');
  const vuMaster = document.getElementById('vu-master');

  // DOM Elements - Auto-Deck Relay
  const btnAutoRelay = document.getElementById('btn-auto-relay');
  const chkAutoCrossfade = document.getElementById('chk-auto-crossfade');
  const chkAutoQueue = document.getElementById('chk-auto-queue');
  let autoRelayEnabled = false;

  // Jog Rotation Angles
  const jogAngles = { A: 0, B: 0 };

  // -------------------------------------------------------------
  // 2. Audio Engine Unlock & Readiness
  // -------------------------------------------------------------
  async function unlockAudioContext() {
    await engine.unlockAudio();
    if (engine.ctx.state === 'running') {
      audioStatusDot.classList.add('active');
      audioStatusText.textContent = 'Audio Engine Active (44.1kHz / Interactive)';
      btnUnlockAudio.style.display = 'none';
    }
  }

  window.addEventListener('click', unlockAudioContext, { once: true });
  btnUnlockAudio.addEventListener('click', unlockAudioContext);

  // -------------------------------------------------------------
  // 3. Demo Beat Generator & Initial Tracks
  // -------------------------------------------------------------
  async function addDemoTrack(type) {
    audioStatusText.textContent = `Synthesizing ${type.toUpperCase()} demo beat...`;
    try {
      const demoData = await engine.generateDemoTrack(type);
      const trackObj = {
        id: crypto.randomUUID(),
        title: demoData.title,
        artist: demoData.artist,
        bpm: demoData.bpm,
        key: demoData.key,
        duration: demoData.buffer.duration,
        audioSource: demoData.buffer
      };
      libraryTracks.push(trackObj);
      renderLibraryTable();
      audioStatusText.textContent = 'Audio Engine Active';
      return trackObj;
    } catch (err) {
      console.error('Demo generation error:', err);
    }
  }

  // Generate initial set of demo tracks on load so user can play music immediately
  async function initDemoTracks() {
    const trackHouse = await addDemoTrack('house');
    const trackTechno = await addDemoTrack('techno');
    await addDemoTrack('disco');

    // Auto-load Track House into Deck A and Track Techno into Deck B
    if (trackHouse) loadTrackToDeck('A', trackHouse);
    if (trackTechno) loadTrackToDeck('B', trackTechno);
  }

  if (btnGenDemo) {
    btnGenDemo.addEventListener('click', () => {
      const genres = ['house', 'techno', 'disco'];
      const genre = genres[Math.floor(Math.random() * genres.length)];
      addDemoTrack(genre);
    });
  }

  // -------------------------------------------------------------
  // 4. Track Library Management, Cued Playlists & File Scanning
  // -------------------------------------------------------------

  // Tab switching: Library vs Cued Playlists
  function switchPanelTab(tabName) {
    if (tabName === 'library') {
      tabBtnLibrary.classList.add('active');
      tabBtnQueues.classList.remove('active');
      tabContentLibrary.style.display = 'flex';
      tabContentQueues.style.display = 'none';
    } else {
      tabBtnLibrary.classList.remove('active');
      tabBtnQueues.classList.add('active');
      tabContentLibrary.style.display = 'none';
      tabContentQueues.style.display = 'flex';
      renderQueue('A');
      renderQueue('B');
    }
  }

  if (tabBtnLibrary && tabBtnQueues) {
    tabBtnLibrary.addEventListener('click', () => switchPanelTab('library'));
    tabBtnQueues.addEventListener('click', () => switchPanelTab('queues'));
  }

  // --- Cued Playlist Queue Operations ---
  function isSameTrack(t1, t2) {
    if (!t1 || !t2) return false;
    if (t1.id && t2.id && t1.id === t2.id) return true;
    if (t1.audioSource && t2.audioSource && t1.audioSource === t2.audioSource) return true;
    const title1 = (t1.title || t1.name || '').trim().toLowerCase();
    const title2 = (t2.title || t2.name || '').trim().toLowerCase();
    const artist1 = (t1.artist || '').trim().toLowerCase();
    const artist2 = (t2.artist || '').trim().toLowerCase();
    if (title1 && title2 && title1 === title2) {
      if (!artist1 || !artist2 || artist1 === artist2) return true;
    }
    return false;
  }

  function getTrackDuplicateInfo(deckId, track) {
    const otherDeckId = deckId === 'A' ? 'B' : 'A';
    const inOtherDeck = deckQueues[otherDeckId].some(t => isSameTrack(t, track));
    const sameDeckCount = deckQueues[deckId].filter(t => isSameTrack(t, track)).length;
    return {
      inOtherDeck,
      otherDeckId,
      isSelfDuplicate: sameDeckCount > 1,
      sameDeckCount
    };
  }

  function updateQueueBadges() {
    if (libraryCountBadge) libraryCountBadge.textContent = libraryTracks.length;
    
    // Calculate total durations for Deck A, Deck B, and Combined
    const durA = deckQueues.A.reduce((sum, t) => sum + (t.duration && !isNaN(t.duration) ? t.duration : 0), 0);
    const durB = deckQueues.B.reduce((sum, t) => sum + (t.duration && !isNaN(t.duration) ? t.duration : 0), 0);
    const durTotal = durA + durB;

    const formattedDurA = formatDuration(durA);
    const formattedDurB = formatDuration(durB);
    const formattedDurTotal = formatDuration(durTotal);

    // Update queue duration headers and toolbar elements
    const queueADuration = document.getElementById('queue-a-duration');
    const queueBDuration = document.getElementById('queue-b-duration');
    const queueCombinedDuration = document.getElementById('queue-combined-duration');
    const queueADurTag = document.getElementById('queue-a-dur-tag');
    const queueBDurTag = document.getElementById('queue-b-dur-tag');

    if (queueADuration) queueADuration.textContent = formattedDurA;
    if (queueBDuration) queueBDuration.textContent = formattedDurB;
    if (queueCombinedDuration) queueCombinedDuration.textContent = formattedDurTotal;
    if (queueADurTag) queueADurTag.textContent = formattedDurA;
    if (queueBDurTag) queueBDurTag.textContent = formattedDurB;

    // Count cross-deck and self duplicate occurrences across queues
    let dupCount = 0;
    const allQueueTracks = [...deckQueues.A, ...deckQueues.B];
    allQueueTracks.forEach(track => {
      const inA = deckQueues.A.some(t => isSameTrack(t, track));
      const inB = deckQueues.B.some(t => isSameTrack(t, track));
      const countA = deckQueues.A.filter(t => isSameTrack(t, track)).length;
      const countB = deckQueues.B.filter(t => isSameTrack(t, track)).length;
      if ((inA && inB) || countA > 1 || countB > 1) {
        dupCount++;
      }
    });

    if (queuesCountBadge) {
      queuesCountBadge.textContent = `A: ${deckQueues.A.length} | B: ${deckQueues.B.length}${dupCount > 0 ? ' ⚠️' : ''}`;
      queuesCountBadge.classList.toggle('has-duplicates', dupCount > 0);
      queuesCountBadge.title = dupCount > 0 ? `${dupCount} duplicate queue occurrences detected` : 'No duplicate tracks';
    }
    if (queueACount) queueACount.textContent = `${deckQueues.A.length} track${deckQueues.A.length === 1 ? '' : 's'}`;
    if (queueBCount) queueBCount.textContent = `${deckQueues.B.length} track${deckQueues.B.length === 1 ? '' : 's'}`;
  }

  function updateQueueUI() {
    updateQueueBadges();
    renderQueue('A');
    renderQueue('B');
  }

  function addToQueue(deckId, track) {
    if (!track) return;
    const isDupInOther = deckQueues[deckId === 'A' ? 'B' : 'A'].some(t => isSameTrack(t, track));
    deckQueues[deckId].push({ ...track, queueId: crypto.randomUUID() });
    updateQueueUI();
    if (isDupInOther) {
      audioStatusText.textContent = `Added "${track.title}" to Deck ${deckId} (Note: already in Deck ${deckId === 'A' ? 'B' : 'A'} queue)`;
    } else {
      audioStatusText.textContent = `Added "${track.title}" to Deck ${deckId} Playlist Queue`;
    }
  }

  function removeFromQueue(deckId, index) {
    if (index >= 0 && index < deckQueues[deckId].length) {
      const removed = deckQueues[deckId].splice(index, 1);
      updateQueueUI();
      if (removed.length > 0) {
        audioStatusText.textContent = `Removed "${removed[0].title}" from Deck ${deckId} Queue`;
      }
    }
  }

  function moveQueueItem(deckId, fromIndex, toIndex) {
    const q = deckQueues[deckId];
    if (fromIndex < 0 || fromIndex >= q.length || toIndex < 0 || toIndex >= q.length) return;
    const [item] = q.splice(fromIndex, 1);
    q.splice(toIndex, 0, item);
    renderQueue(deckId);
  }

  function clearQueue(deckId) {
    deckQueues[deckId] = [];
    updateQueueUI();
    audioStatusText.textContent = `Cleared Deck ${deckId} Playlist Queue`;
  }

  function shuffleQueue(deckId) {
    const q = deckQueues[deckId];
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    renderQueue(deckId);
    audioStatusText.textContent = `Shuffled Deck ${deckId} Playlist Queue`;
  }

  async function popAndLoadNextFromQueue(deckId) {
    if (deckQueues[deckId].length === 0) return null;
    const nextTrack = deckQueues[deckId].shift();
    updateQueueUI();
    await loadTrackToDeck(deckId, nextTrack);
    return nextTrack;
  }

  async function loadFromQueueIndex(deckId, index) {
    if (index >= 0 && index < deckQueues[deckId].length) {
      const [track] = deckQueues[deckId].splice(index, 1);
      updateQueueUI();
      await loadTrackToDeck(deckId, track);
    }
  }

  function renderQueue(deckId) {
    const listElem = deckId === 'A' ? queueListA : queueListB;
    if (!listElem) return;
    const q = deckQueues[deckId];
    listElem.innerHTML = '';

    if (q.length === 0) {
      listElem.innerHTML = `
        <div class="queue-empty-state">
          <div class="empty-icon">🎵</div>
          <div class="empty-text">No tracks cued for Deck ${deckId}</div>
          <div class="empty-hint">Click <strong>+Q ${deckId}</strong> in the Track Library tab to build your playlist.</div>
        </div>
      `;
      return;
    }

    q.forEach((track, idx) => {
      const dupInfo = getTrackDuplicateInfo(deckId, track);

      let dupBadgeHtml = '';
      if (dupInfo.inOtherDeck && dupInfo.isSelfDuplicate) {
        dupBadgeHtml = `<span class="badge-dup badge-dup-cross" title="Also in Deck ${dupInfo.otherDeckId} and ${dupInfo.sameDeckCount}x in this queue">⚠️ In Deck ${dupInfo.otherDeckId} + ${dupInfo.sameDeckCount}x</span>`;
      } else if (dupInfo.inOtherDeck) {
        dupBadgeHtml = `<span class="badge-dup badge-dup-cross" title="This track is also in Deck ${dupInfo.otherDeckId}'s cued playlist">⚠️ In Deck ${dupInfo.otherDeckId}</span>`;
      } else if (dupInfo.isSelfDuplicate) {
        dupBadgeHtml = `<span class="badge-dup badge-dup-self" title="This track is queued ${dupInfo.sameDeckCount} times in Deck ${deckId}">⚠️ Duplicate (${dupInfo.sameDeckCount}x)</span>`;
      }

      const dupClass = dupInfo.inOtherDeck ? 'is-duplicate-cross' : (dupInfo.isSelfDuplicate ? 'is-duplicate-self' : '');

      const artHtml = track.artworkUrl 
        ? `<img class="queue-track-art" src="${escapeHtml(track.artworkUrl)}" alt="Art" />`
        : `<div class="queue-track-placeholder">🎵</div>`;

      const item = document.createElement('div');
      item.className = `queue-item ${dupClass}`;
      item.innerHTML = `
        <div class="queue-item-idx">${idx + 1}</div>
        ${artHtml}
        <div class="queue-item-meta">
          <div class="queue-item-title" style="display: flex; align-items: center; gap: 6px;">
            <span>${escapeHtml(track.title)}</span>
            ${dupBadgeHtml}
          </div>
          <div class="queue-item-sub">
            <span>${escapeHtml(track.artist)}</span>
            ${track.bpm ? `<span>• ${track.bpm.toFixed(1)} BPM</span>` : ''}
            ${track.key ? `<span class="badge-key" style="font-size:9px; padding:1px 4px;">${escapeHtml(track.key)}</span>` : ''}
            <span>• ${formatDuration(track.duration || 0)}</span>
          </div>
        </div>
        <div class="queue-item-duration">${formatDuration(track.duration || 0)}</div>
        <div class="queue-item-actions">
          <button class="btn-queue-ctrl btn-queue-up" data-deck="${deckId}" data-index="${idx}" title="Move Up" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn-queue-ctrl btn-queue-down" data-deck="${deckId}" data-index="${idx}" title="Move Down" ${idx === q.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="btn-queue-ctrl btn-queue-load" data-deck="${deckId}" data-index="${idx}" title="Load to Deck ${deckId} Now">⚡ Load</button>
          <button class="btn-queue-ctrl btn-queue-del" data-deck="${deckId}" data-index="${idx}" title="Remove from Queue">✕</button>
        </div>
      `;
      listElem.appendChild(item);
    });

    listElem.querySelectorAll('.btn-queue-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        moveQueueItem(deckId, idx, idx - 1);
      });
    });

    listElem.querySelectorAll('.btn-queue-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        moveQueueItem(deckId, idx, idx + 1);
      });
    });

    listElem.querySelectorAll('.btn-queue-load').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        loadFromQueueIndex(deckId, idx);
      });
    });

    listElem.querySelectorAll('.btn-queue-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        removeFromQueue(deckId, idx);
      });
    });
  }

  // Deck Queue Header Control Buttons
  const btnQueueALoadNext = document.getElementById('btn-queue-a-loadnext');
  const btnQueueAShuffle = document.getElementById('btn-queue-a-shuffle');
  const btnQueueAClear = document.getElementById('btn-queue-a-clear');

  const btnQueueBLoadNext = document.getElementById('btn-queue-b-loadnext');
  const btnQueueBShuffle = document.getElementById('btn-queue-b-shuffle');
  const btnQueueBClear = document.getElementById('btn-queue-b-clear');

  if (btnQueueALoadNext) btnQueueALoadNext.addEventListener('click', () => popAndLoadNextFromQueue('A'));
  if (btnQueueAShuffle) btnQueueAShuffle.addEventListener('click', () => shuffleQueue('A'));
  if (btnQueueAClear) btnQueueAClear.addEventListener('click', () => clearQueue('A'));

  if (btnQueueBLoadNext) btnQueueBLoadNext.addEventListener('click', () => popAndLoadNextFromQueue('B'));
  if (btnQueueBShuffle) btnQueueBShuffle.addEventListener('click', () => shuffleQueue('B'));
  if (btnQueueBClear) btnQueueBClear.addEventListener('click', () => clearQueue('B'));

  // --- Playlist Save, Export & Import System ---
  const STORAGE_KEY_SETLISTS = 'webdj_saved_setlists';
  const btnSavePlaylist = document.getElementById('btn-save-playlist');
  const btnSavedPlaylistsModal = document.getElementById('btn-saved-playlists-modal');
  const savedSetlistsCount = document.getElementById('saved-setlists-count');
  const btnExportPlaylist = document.getElementById('btn-export-playlist');
  const importPlaylistFile = document.getElementById('import-playlist-file');
  const btnImportPlaylist = document.getElementById('btn-import-playlist');

  const setlistsModal = document.getElementById('setlists-modal');
  const btnCloseSetlistsModal = document.getElementById('btn-close-setlists-modal');
  const savedSetlistsList = document.getElementById('saved-setlists-list');

  function getSavedSetlists() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETLISTS);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveSavedSetlists(list) {
    try {
      localStorage.setItem(STORAGE_KEY_SETLISTS, JSON.stringify(list));
      updateSavedSetlistsCount();
    } catch (err) {
      console.warn('Could not save setlists to localStorage:', err);
    }
  }

  function updateSavedSetlistsCount() {
    const list = getSavedSetlists();
    if (savedSetlistsCount) savedSetlistsCount.textContent = list.length;
  }

  function cleanTrackForExport(t) {
    return {
      id: t.id || crypto.randomUUID(),
      title: t.title,
      artist: t.artist || 'Unknown Artist',
      bpm: t.bpm || 120,
      key: t.key || '12A',
      duration: t.duration || 0
    };
  }

  function matchTrackWithLibrary(trackData) {
    const match = libraryTracks.find(t => isSameTrack(t, trackData));
    if (match) {
      return { ...match, queueId: crypto.randomUUID() };
    }
    return { ...trackData, queueId: crypto.randomUUID() };
  }

  function saveCurrentSetlist() {
    if (deckQueues.A.length === 0 && deckQueues.B.length === 0) {
      audioStatusText.textContent = 'Both Deck A and Deck B queues are empty. Add tracks before saving.';
      return;
    }

    const defaultName = `Setlist ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const name = prompt('Enter a name for this Cued Playlist Setlist:', defaultName);
    if (!name) return;

    const newSetlist = {
      id: crypto.randomUUID(),
      name: name.trim(),
      savedAt: new Date().toISOString(),
      deckA: deckQueues.A.map(cleanTrackForExport),
      deckB: deckQueues.B.map(cleanTrackForExport)
    };

    const list = getSavedSetlists();
    list.unshift(newSetlist);
    saveSavedSetlists(list);

    audioStatusText.textContent = `Saved setlist "${newSetlist.name}" (${newSetlist.deckA.length + newSetlist.deckB.length} tracks)`;
  }

  function exportSetlistAsJSON(setlistObj = null) {
    const data = setlistObj || {
      name: `WebDJRadio Setlist - ${new Date().toLocaleDateString()}`,
      exportedAt: new Date().toISOString(),
      version: "1.5.0",
      generator: "WebDJRadio Console",
      deckA: deckQueues.A.map(cleanTrackForExport),
      deckB: deckQueues.B.map(cleanTrackForExport)
    };

    if (data.deckA.length === 0 && data.deckB.length === 0) {
      audioStatusText.textContent = 'No tracks in queues to export.';
      return;
    }

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const safeName = (data.name || 'playlist').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const filename = `${safeName}_${new Date().toISOString().slice(0, 10)}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    audioStatusText.textContent = `Exported "${filename}" successfully`;
  }

  function handleImportJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || (!Array.isArray(data.deckA) && !Array.isArray(data.deckB))) {
          alert('Invalid playlist JSON format. Expected deckA or deckB arrays.');
          return;
        }

        const importedDeckA = Array.isArray(data.deckA) ? data.deckA.map(matchTrackWithLibrary) : [];
        const importedDeckB = Array.isArray(data.deckB) ? data.deckB.map(matchTrackWithLibrary) : [];

        // Replace active queues
        deckQueues.A = importedDeckA;
        deckQueues.B = importedDeckB;
        updateQueueUI();

        // Also save to saved setlists
        const savedList = getSavedSetlists();
        const setlistName = data.name || file.name.replace(/\.[^/.]+$/, "");
        savedList.unshift({
          id: crypto.randomUUID(),
          name: setlistName,
          savedAt: new Date().toISOString(),
          deckA: importedDeckA.map(cleanTrackForExport),
          deckB: importedDeckB.map(cleanTrackForExport)
        });
        saveSavedSetlists(savedList);

        // Switch to Cued Playlists tab to view
        switchPanelTab('queues');
        audioStatusText.textContent = `Imported setlist "${setlistName}" (${importedDeckA.length} for Deck A, ${importedDeckB.length} for Deck B)`;
      } catch (err) {
        console.error('Failed to import JSON playlist:', err);
        alert('Could not parse JSON file. Please verify it is a valid playlist JSON.');
      }
    };
    reader.readAsText(file);
  }

  function loadSavedSetlist(setlist, mode = 'both') {
    if (mode === 'both' || mode === 'A') {
      deckQueues.A = (setlist.deckA || []).map(matchTrackWithLibrary);
    }
    if (mode === 'both' || mode === 'B') {
      deckQueues.B = (setlist.deckB || []).map(matchTrackWithLibrary);
    }
    updateQueueUI();
    if (setlistsModal) setlistsModal.style.display = 'none';
    switchPanelTab('queues');
    audioStatusText.textContent = `Loaded setlist "${setlist.name}"`;
  }

  function deleteSavedSetlist(id) {
    const list = getSavedSetlists().filter(s => s.id !== id);
    saveSavedSetlists(list);
    renderSavedSetlistsList();
    audioStatusText.textContent = 'Deleted setlist from local storage';
  }

  function renderSavedSetlistsList() {
    if (!savedSetlistsList) return;
    const list = getSavedSetlists();
    savedSetlistsList.innerHTML = '';

    if (list.length === 0) {
      savedSetlistsList.innerHTML = `
        <div class="queue-empty-state">
          <div class="empty-icon">📂</div>
          <div class="empty-text">No Saved Setlists Yet</div>
          <div class="empty-hint">Build your Deck A and Deck B queues and click <strong>💾 Save Setlist</strong> or <strong>⬇️ Export JSON</strong>.</div>
        </div>
      `;
      return;
    }

    list.forEach(setlist => {
      const countA = (setlist.deckA || []).length;
      const countB = (setlist.deckB || []).length;
      const dateStr = setlist.savedAt ? new Date(setlist.savedAt).toLocaleString() : 'Saved';

      const card = document.createElement('div');
      card.className = 'saved-setlist-card';
      card.innerHTML = `
        <div class="setlist-info">
          <div class="setlist-name">${escapeHtml(setlist.name)}</div>
          <div class="setlist-meta">
            <span>📅 ${dateStr}</span>
            <span class="setlist-meta-tag" style="color: var(--deck-a-primary);">Deck A: ${countA}</span>
            <span class="setlist-meta-tag" style="color: var(--deck-b-primary);">Deck B: ${countB}</span>
            <span>Total: ${countA + countB} tracks</span>
          </div>
        </div>
        <div class="setlist-actions">
          <button class="btn btn-sm btn-primary btn-load-both" title="Load tracks into both Deck A and Deck B queues">⚡ Load Both</button>
          <button class="btn btn-sm btn-accent-a btn-load-a" title="Load Deck A tracks only">A</button>
          <button class="btn btn-sm btn-accent-b btn-load-b" title="Load Deck B tracks only">B</button>
          <button class="btn btn-sm btn-export-one" title="Export this setlist as a JSON file">⬇️ JSON</button>
          <button class="btn btn-sm btn-danger btn-del-setlist" title="Delete from saved list">🗑</button>
        </div>
      `;

      card.querySelector('.btn-load-both').addEventListener('click', () => loadSavedSetlist(setlist, 'both'));
      card.querySelector('.btn-load-a').addEventListener('click', () => loadSavedSetlist(setlist, 'A'));
      card.querySelector('.btn-load-b').addEventListener('click', () => loadSavedSetlist(setlist, 'B'));
      card.querySelector('.btn-export-one').addEventListener('click', () => exportSetlistAsJSON(setlist));
      card.querySelector('.btn-del-setlist').addEventListener('click', () => {
        if (confirm(`Delete saved setlist "${setlist.name}"?`)) {
          deleteSavedSetlist(setlist.id);
        }
      });

      savedSetlistsList.appendChild(card);
    });
  }

  // Event Listeners for Toolbar & Modal
  if (btnSavePlaylist) btnSavePlaylist.addEventListener('click', saveCurrentSetlist);
  if (btnExportPlaylist) btnExportPlaylist.addEventListener('click', () => exportSetlistAsJSON());

  if (btnImportPlaylist && importPlaylistFile) {
    btnImportPlaylist.addEventListener('click', () => importPlaylistFile.click());
    importPlaylistFile.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImportJSON(e.target.files[0]);
        e.target.value = '';
      }
    });
  }

  if (btnSavedPlaylistsModal && setlistsModal) {
    btnSavedPlaylistsModal.addEventListener('click', () => {
      renderSavedSetlistsList();
      setlistsModal.style.display = 'flex';
    });
  }

  if (btnCloseSetlistsModal && setlistsModal) {
    btnCloseSetlistsModal.addEventListener('click', () => {
      setlistsModal.style.display = 'none';
    });
    setlistsModal.addEventListener('click', (e) => {
      if (e.target === setlistsModal) setlistsModal.style.display = 'none';
    });
  }

  updateSavedSetlistsCount();

  // --- Track Library Table ---
  function renderLibraryTable() {
    const query = searchLibrary.value.toLowerCase().trim();
    libraryTbody.innerHTML = '';
    updateQueueBadges();

    const filtered = libraryTracks.filter(t => {
      if (!t) return false;
      const title = (t.title || '').toLowerCase();
      const artist = (t.artist || '').toLowerCase();
      const key = (t.key || '').toLowerCase();
      return title.includes(query) || artist.includes(query) || key.includes(query);
    });

    if (filtered.length === 0) {
      libraryTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">
            No tracks found. Use 'Scan Local Folder' or 'Add Files' to import music.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach((track, index) => {
      const tr = document.createElement('tr');
      if (selectedTrackId === track.id) tr.classList.add('selected');

      const artCell = track.artworkUrl 
        ? `<img class="track-art-thumb" src="${escapeHtml(track.artworkUrl)}" alt="Art" />`
        : `<div class="track-art-placeholder">🎵</div>`;

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${artCell}</td>
        <td><strong>${escapeHtml(track.title)}</strong></td>
        <td>${escapeHtml(track.artist)}</td>
        <td>${track.bpm ? track.bpm.toFixed(1) : '--'}</td>
        <td><span class="badge-key">${escapeHtml(track.key || '12A')}</span></td>
        <td>${formatDuration(track.duration || 0)}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-accent-a btn-table-load" data-id="${track.id}" data-deck="A" title="Load to Deck A">A</button>
            <button class="btn btn-accent-b btn-table-load" data-id="${track.id}" data-deck="B" title="Load to Deck B">B</button>
            <button class="btn-table-queue queue-btn-a btn-table-queue-add" data-id="${track.id}" data-deck="A" title="Add to Deck A Cued Playlist">+Q A</button>
            <button class="btn-table-queue queue-btn-b btn-table-queue-add" data-id="${track.id}" data-deck="B" title="Add to Deck B Cued Playlist">+Q B</button>
            <button class="btn btn-table-edit" data-id="${track.id}" title="Edit Metadata (Title, Artist, BPM, Key, Cover Art)" style="padding: 2px 7px; font-size: 11px;">✏️</button>
          </div>
        </td>
      `;

      tr.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') {
          selectedTrackId = track.id;
          document.querySelectorAll('.track-table tbody tr').forEach(r => r.classList.remove('selected'));
          tr.classList.add('selected');
        }
      });

      tr.addEventListener('dblclick', () => {
        openMetadataEditor(track.id);
      });

      libraryTbody.appendChild(tr);
    });

    // Action buttons inside table (Load Deck)
    document.querySelectorAll('.btn-table-load').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const deckId = btn.getAttribute('data-deck');
        const track = libraryTracks.find(t => t.id === id);
        if (track) loadTrackToDeck(deckId, track);
      });
    });

    // Action buttons inside table (Add to Queue)
    document.querySelectorAll('.btn-table-queue-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const deckId = btn.getAttribute('data-deck');
        const track = libraryTracks.find(t => t.id === id);
        if (track) addToQueue(deckId, track);
      });
    });

    // Action buttons inside table (Edit Metadata)
    document.querySelectorAll('.btn-table-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        openMetadataEditor(id);
      });
    });
  }

  searchLibrary.addEventListener('input', renderLibraryTable);

  // Quick Load buttons above table
  document.getElementById('btn-quick-load-a').addEventListener('click', () => {
    if (!selectedTrackId) return;
    const track = libraryTracks.find(t => t.id === selectedTrackId);
    if (track) loadTrackToDeck('A', track);
  });

  document.getElementById('btn-quick-load-b').addEventListener('click', () => {
    if (!selectedTrackId) return;
    const track = libraryTracks.find(t => t.id === selectedTrackId);
    if (track) loadTrackToDeck('B', track);
  });

  // Quick Queue buttons above table
  const btnQuickQueueA = document.getElementById('btn-quick-queue-a');
  const btnQuickQueueB = document.getElementById('btn-quick-queue-b');
  if (btnQuickQueueA) {
    btnQuickQueueA.addEventListener('click', () => {
      if (!selectedTrackId) {
        audioStatusText.textContent = 'Please select a track from the library first to queue for Deck A';
        return;
      }
      const track = libraryTracks.find(t => t.id === selectedTrackId);
      if (track) addToQueue('A', track);
    });
  }

  if (btnQuickQueueB) {
    btnQuickQueueB.addEventListener('click', () => {
      if (!selectedTrackId) {
        audioStatusText.textContent = 'Please select a track from the library first to queue for Deck B';
        return;
      }
      const track = libraryTracks.find(t => t.id === selectedTrackId);
      if (track) addToQueue('B', track);
    });
  }

  // Quick Edit button above table
  const btnQuickEditTrack = document.getElementById('btn-quick-edit-track');
  if (btnQuickEditTrack) {
    btnQuickEditTrack.addEventListener('click', () => {
      if (!selectedTrackId) {
        audioStatusText.textContent = 'Please select a track from the library table first to edit';
        return;
      }
      openMetadataEditor(selectedTrackId);
    });
  }

  // -------------------------------------------------------------
  // Track Metadata Editor Modal Subsystem
  // -------------------------------------------------------------
  const metadataModal = document.getElementById('metadata-modal');
  const btnCloseMetadataModal = document.getElementById('btn-close-metadata-modal');
  const btnCancelMetadataEdit = document.getElementById('btn-cancel-metadata-edit');
  const btnSaveMetadataEdit = document.getElementById('btn-save-metadata-edit');
  const editTrackId = document.getElementById('edit-track-id');
  const editTrackTitle = document.getElementById('edit-track-title');
  const editTrackArtist = document.getElementById('edit-track-artist');
  const editTrackAlbum = document.getElementById('edit-track-album');
  const editTrackBpm = document.getElementById('edit-track-bpm');
  const editTrackKey = document.getElementById('edit-track-key');
  const editTrackArtPreview = document.getElementById('edit-track-art-preview');
  const editTrackArtPlaceholder = document.getElementById('edit-track-art-placeholder');
  const btnEditUploadArt = document.getElementById('btn-edit-upload-art');
  const btnEditRemoveArt = document.getElementById('btn-edit-remove-art');
  const editArtFileInput = document.getElementById('edit-art-file-input');
  const btnEditDspBpm = document.getElementById('btn-edit-dsp-bpm');

  let currentEditingArtUrl = null;
  let currentEditingArtBlob = null;

  function openMetadataEditor(trackId) {
    const track = libraryTracks.find(t => t.id === trackId);
    if (!track) return;

    editTrackId.value = track.id;
    editTrackTitle.value = track.title || '';
    editTrackArtist.value = track.artist || '';
    editTrackAlbum.value = track.album || '';
    editTrackBpm.value = track.bpm ? track.bpm.toFixed(1) : '124.0';
    editTrackKey.value = track.key || '8A (Am)';

    if (track.artworkUrl) {
      editTrackArtPreview.src = track.artworkUrl;
      editTrackArtPreview.style.display = 'block';
      editTrackArtPlaceholder.style.display = 'none';
      currentEditingArtUrl = track.artworkUrl;
    } else {
      editTrackArtPreview.src = '';
      editTrackArtPreview.style.display = 'none';
      editTrackArtPlaceholder.style.display = 'flex';
      currentEditingArtUrl = null;
    }
    currentEditingArtBlob = track.artworkBlob || null;

    metadataModal.style.display = 'flex';
    setTimeout(() => editTrackTitle.focus(), 100);
  }

  function closeMetadataEditor() {
    metadataModal.style.display = 'none';
  }

  if (btnCloseMetadataModal) btnCloseMetadataModal.addEventListener('click', closeMetadataEditor);
  if (btnCancelMetadataEdit) btnCancelMetadataEdit.addEventListener('click', closeMetadataEditor);
  if (metadataModal) {
    metadataModal.addEventListener('click', (e) => {
      if (e.target === metadataModal) closeMetadataEditor();
    });
  }

  // Artwork upload handling
  if (btnEditUploadArt && editArtFileInput) {
    btnEditUploadArt.addEventListener('click', () => editArtFileInput.click());
    editArtFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        const url = URL.createObjectURL(file);
        currentEditingArtUrl = url;
        currentEditingArtBlob = file;
        editTrackArtPreview.src = url;
        editTrackArtPreview.style.display = 'block';
        editTrackArtPlaceholder.style.display = 'none';
      }
    });
  }

  // Artwork removal handling
  if (btnEditRemoveArt) {
    btnEditRemoveArt.addEventListener('click', () => {
      currentEditingArtUrl = null;
      currentEditingArtBlob = null;
      editTrackArtPreview.src = '';
      editTrackArtPreview.style.display = 'none';
      editTrackArtPlaceholder.style.display = 'flex';
    });
  }

  // DSP Beat & Key Re-Analysis inside editor
  if (btnEditDspBpm) {
    btnEditDspBpm.addEventListener('click', async () => {
      const trackId = editTrackId.value;
      const track = libraryTracks.find(t => t.id === trackId);
      if (!track || !track.audioSource) return;

      btnEditDspBpm.textContent = '⏳ Analyzing...';
      btnEditDspBpm.disabled = true;

      try {
        if (track.audioSource instanceof AudioBuffer) {
          const bpm = AudioDSPAnalyzer.analyzeBPM(track.audioSource);
          const key = AudioDSPAnalyzer.analyzeKey(track.audioSource);
          editTrackBpm.value = bpm.toFixed(1);
          editTrackKey.value = key;
        } else if (track.audioSource instanceof File || track.audioSource instanceof Blob) {
          const arrayBuf = await track.audioSource.slice(0, Math.min(track.audioSource.size, 5 * 1024 * 1024)).arrayBuffer();
          const decoded = await engine.ctx.decodeAudioData(arrayBuf.slice(0));
          const bpm = AudioDSPAnalyzer.analyzeBPM(decoded);
          const key = AudioDSPAnalyzer.analyzeKey(decoded);
          editTrackBpm.value = bpm.toFixed(1);
          editTrackKey.value = key;
        }
      } catch (err) {
        console.warn('DSP analysis in modal failed:', err);
      } finally {
        btnEditDspBpm.textContent = '⚡ DSP';
        btnEditDspBpm.disabled = false;
      }
    });
  }

  // Save metadata modifications
  if (btnSaveMetadataEdit) {
    btnSaveMetadataEdit.addEventListener('click', () => {
      const trackId = editTrackId.value;
      const track = libraryTracks.find(t => t.id === trackId);
      if (!track) {
        closeMetadataEditor();
        return;
      }

      const newTitle = editTrackTitle.value.trim();
      const newArtist = editTrackArtist.value.trim();
      const newAlbum = editTrackAlbum.value.trim();
      const newBpm = parseFloat(editTrackBpm.value);
      const newKey = editTrackKey.value;

      if (newTitle) track.title = newTitle;
      if (newArtist) track.artist = newArtist;
      track.album = newAlbum;
      if (!isNaN(newBpm) && newBpm > 40 && newBpm < 260) track.bpm = newBpm;
      if (newKey) track.key = newKey;
      track.artworkUrl = currentEditingArtUrl;
      track.artworkBlob = currentEditingArtBlob;

      // Update Deck A if this track is currently loaded
      const deckA = (engine.getDeck ? engine.getDeck('A') : (engine.decks ? engine.decks['A'] : null));
      const isDeckALoaded = deckA && (deckA.loadedTrackId === track.id || deckA.title === track.title || (deckAElements.title && deckAElements.title.textContent === track.title));
      if (isDeckALoaded) {
        deckA.title = track.title;
        deckA.artist = track.artist;
        deckA.bpm = track.bpm;
        deckA.key = track.key;
        deckAElements.title.textContent = track.title;
        deckAElements.artist.textContent = track.artist;
        deckAElements.bpm.textContent = track.bpm ? track.bpm.toFixed(1) : '124.0';
        if (deckAElements.key) deckAElements.key.textContent = track.key || '--';
        if (track.artworkUrl) {
          if (deckAElements.artImg) {
            deckAElements.artImg.src = track.artworkUrl;
            deckAElements.artImg.style.display = 'block';
          }
          if (deckAElements.artPlaceholder) deckAElements.artPlaceholder.style.display = 'none';
        } else {
          if (deckAElements.artImg) {
            deckAElements.artImg.src = '';
            deckAElements.artImg.style.display = 'none';
          }
          if (deckAElements.artPlaceholder) deckAElements.artPlaceholder.style.display = 'flex';
        }
      }

      // Update Deck B if this track is currently loaded
      const deckB = (engine.getDeck ? engine.getDeck('B') : (engine.decks ? engine.decks['B'] : null));
      const isDeckBLoaded = deckB && (deckB.loadedTrackId === track.id || deckB.title === track.title || (deckBElements.title && deckBElements.title.textContent === track.title));
      if (isDeckBLoaded) {
        deckB.title = track.title;
        deckB.artist = track.artist;
        deckB.bpm = track.bpm;
        deckB.key = track.key;
        deckBElements.title.textContent = track.title;
        deckBElements.artist.textContent = track.artist;
        deckBElements.bpm.textContent = track.bpm ? track.bpm.toFixed(1) : '124.0';
        if (deckBElements.key) deckBElements.key.textContent = track.key || '--';
        if (track.artworkUrl) {
          if (deckBElements.artImg) {
            deckBElements.artImg.src = track.artworkUrl;
            deckBElements.artImg.style.display = 'block';
          }
          if (deckBElements.artPlaceholder) deckBElements.artPlaceholder.style.display = 'none';
        } else {
          if (deckBElements.artImg) {
            deckBElements.artImg.src = '';
            deckBElements.artImg.style.display = 'none';
          }
          if (deckBElements.artPlaceholder) deckBElements.artPlaceholder.style.display = 'flex';
        }
      }

      // Update matching items in Deck A & B Queues
      ['A', 'B'].forEach(d => {
        deckQueues[d].forEach(qTrack => {
          if (isSameTrack(qTrack, track)) {
            qTrack.title = track.title;
            qTrack.artist = track.artist;
            qTrack.album = track.album;
            qTrack.bpm = track.bpm;
            qTrack.key = track.key;
            qTrack.artworkUrl = track.artworkUrl;
          }
        });
      });

      renderLibraryTable();
      updateQueueUI();
      closeMetadataEditor();
      audioStatusText.textContent = `Metadata updated for "${track.title}"`;
    });
  }

  // Helper to create track object with extracted ID3 / file tags
  async function createTrackObjectFromFile(file) {
    let meta = null;
    if (typeof AudioMetadataParser !== 'undefined') {
      meta = await AudioMetadataParser.parseFile(file);
    }
    
    return {
      id: crypto.randomUUID(),
      title: (meta && meta.title) ? meta.title : file.name.replace(/\.[^/.]+$/, ""),
      artist: (meta && meta.artist) ? meta.artist : 'Unknown Artist',
      bpm: (meta && meta.bpm) ? meta.bpm : null,
      key: (meta && meta.key) ? meta.key : null,
      artworkUrl: (meta && meta.artworkUrl) ? meta.artworkUrl : null,
      artworkBlob: (meta && meta.artworkBlob) ? meta.artworkBlob : null,
      duration: 0,
      audioSource: file
    };
  }

  // Local Directory Scanner using File System Access API (Mode B in codebible.md)
  async function scanLocalMusicFolder() {
    try {
      if (!('showDirectoryPicker' in window)) {
        alert('File System Access API is not supported in this browser version. Please click "Add Files" instead.');
        fileInputGlobal.click();
        return;
      }

      const dirHandle = await window.showDirectoryPicker();
      let addedCount = 0;

      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.match(/\.(mp3|wav|flac|ogg|m4a)$/i)) {
          const file = await entry.getFile();
          const trackObj = await createTrackObjectFromFile(file);
          libraryTracks.push(trackObj);
          populateTrackAnalysis(trackObj);
          addedCount++;
        }
      }

      renderLibraryTable();
      audioStatusText.textContent = `Scanned ${addedCount} tracks from directory with metadata`;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error scanning local folder:', err);
      }
    }
  }

  btnScanFolder.addEventListener('click', scanLocalMusicFolder);

  // Global File Input handler
  fileInputGlobal.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const trackObj = await createTrackObjectFromFile(file);
      libraryTracks.push(trackObj);
      populateTrackAnalysis(trackObj);
    }
    renderLibraryTable();
  });

  // Drag & Drop File handling on Decks
  [deckAElements.panel, deckBElements.panel].forEach(panel => {
    const deckId = panel.id === 'panel-deck-a' ? 'A' : 'B';
    
    panel.addEventListener('dragover', (e) => {
      e.preventDefault();
      panel.classList.add('drag-over');
    });

    panel.addEventListener('dragleave', () => {
      panel.classList.remove('drag-over');
    });

    panel.addEventListener('drop', async (e) => {
      e.preventDefault();
      panel.classList.remove('drag-over');

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const trackObj = await createTrackObjectFromFile(file);
        libraryTracks.push(trackObj);
        populateTrackAnalysis(trackObj);
        renderLibraryTable();
        loadTrackToDeck(deckId, trackObj);
      }
    });
  });

  // -------------------------------------------------------------
  // 5. Deck Track Loading & Dual Waveform Drawing (Scrolling + Overview)
  // -------------------------------------------------------------
  async function loadTrackToDeck(deckId, trackObj) {
    const deckElem = deckId === 'A' ? deckAElements : deckBElements;
    deckElem.title.textContent = 'Loading track...';

    try {
      const deck = await engine.loadTrack(deckId, trackObj.audioSource, {
        title: trackObj.title,
        artist: trackObj.artist,
        bpm: trackObj.bpm,
        key: trackObj.key
      });

      deck.loadedTrackId = trackObj.id;
      deckElem.title.textContent = deck.title;
      deckElem.artist.textContent = deck.artist;
      deckElem.bpm.textContent = deck.bpm ? deck.bpm.toFixed(1) : '124.0';
      if (deckElem.key) deckElem.key.textContent = deck.key || '--';
      
      // Update Album Artwork on Deck Faceplate
      if (trackObj.artworkUrl) {
        if (deckElem.artImg) {
          deckElem.artImg.src = trackObj.artworkUrl;
          deckElem.artImg.style.display = 'block';
        }
        if (deckElem.artPlaceholder) deckElem.artPlaceholder.style.display = 'none';
      } else {
        if (deckElem.artImg) {
          deckElem.artImg.src = '';
          deckElem.artImg.style.display = 'none';
        }
        if (deckElem.artPlaceholder) deckElem.artPlaceholder.style.display = 'flex';
      }

      // Update track duration, BPM and Key in library object and all queue instances
      if (deck.buffer && deck.buffer.duration) {
        trackObj.duration = deck.buffer.duration;
        if (deck.bpm) trackObj.bpm = deck.bpm;
        if (deck.key) trackObj.key = deck.key;
        ['A', 'B'].forEach(d => {
          deckQueues[d].forEach(qTrack => {
            if (isSameTrack(qTrack, trackObj)) {
              qTrack.duration = deck.buffer.duration;
              if (deck.bpm) qTrack.bpm = deck.bpm;
              if (deck.key) qTrack.key = deck.key;
              if (trackObj.artworkUrl) qTrack.artworkUrl = trackObj.artworkUrl;
            }
          });
        });
      }
      renderLibraryTable();
      updateQueueUI();

      // Draw Overview Waveform Strip
      drawOverviewWaveform(deckId, deck.buffer);
    } catch (err) {
      console.error(`Failed to load track into Deck ${deckId}:`, err);
      deckElem.title.textContent = 'Load Failed';
    }
  }

  // Draws full-track overview waveform inside bottom strip
  function drawOverviewWaveform(deckId, audioBuffer) {
    const deckElem = deckId === 'A' ? deckAElements : deckBElements;
    const canvas = deckElem.waveformOverview;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth * 2;
    const height = canvas.height = canvas.parentElement.clientHeight * 2;

    ctx.clearRect(0, 0, width, height);

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    const colorPrimary = deckId === 'A' ? '#00f0ff' : '#ff6b00';
    const colorDark = deckId === 'A' ? '#002b33' : '#331500';

    ctx.fillStyle = colorDark;
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.strokeStyle = colorPrimary;
    ctx.lineWidth = 2;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();
  }

  // Renders 60fps real-time scrolling zoomed waveform centered at current playhead position
  function renderScrollingWaveform(deckId) {
    const deckElem = deckId === 'A' ? deckAElements : deckBElements;
    const canvas = deckElem.waveformScrolling;
    if (!canvas || !canvas.parentElement) return;

    const deck = engine.decks[deckId];
    if (!deck || !deck.buffer) return;

    const width = canvas.width = canvas.parentElement.clientWidth * 2;
    const height = canvas.height = canvas.parentElement.clientHeight * 2;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);

    // Background fill
    ctx.fillStyle = '#06080c';
    ctx.fillRect(0, 0, width, height);

    const currentTime = engine.getCurrentTime(deckId);
    const duration = deck.buffer.duration;

    // Update Overview progress bar
    if (deckElem.overviewProgress) {
      const pct = (currentTime / duration) * 100;
      deckElem.overviewProgress.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }

    const WINDOW_SEC = 5.0; // 5-second visible window (2.5s left, 2.5s right)
    const startTime = currentTime - (WINDOW_SEC / 2);
    const endTime = currentTime + (WINDOW_SEC / 2);

    const sampleRate = deck.buffer.sampleRate;
    const channelData = deck.buffer.getChannelData(0);
    const totalSamples = channelData.length;
    const amp = height / 2;

    // 1. Draw Beat Grid Lines
    const bpm = deck.bpm || 120;
    const secondsPerBeat = 60 / bpm;
    const firstBeatIndex = Math.floor(startTime / secondsPerBeat);
    const lastBeatIndex = Math.ceil(endTime / secondsPerBeat);

    ctx.lineWidth = 1;
    for (let b = firstBeatIndex; b <= lastBeatIndex; b++) {
      const beatTime = b * secondsPerBeat;
      if (beatTime < 0 || beatTime > duration) continue;

      const x = ((beatTime - startTime) / WINDOW_SEC) * width;
      if (x >= 0 && x <= width) {
        ctx.strokeStyle = (b % 4 === 0) ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // 2. Draw Scrolling Waveform Audio Peaks
    const colorPrimary = deckId === 'A' ? '#00f0ff' : '#ff6b00';
    ctx.beginPath();
    ctx.strokeStyle = colorPrimary;
    ctx.lineWidth = 2.5;

    const samplesPerPixel = (WINDOW_SEC * sampleRate) / width;

    for (let x = 0; x < width; x++) {
      const colTime = startTime + (x / width) * WINDOW_SEC;
      if (colTime < 0 || colTime > duration) continue;

      const startSample = Math.floor(colTime * sampleRate);
      const endSample = Math.min(totalSamples, Math.floor(startSample + samplesPerPixel));

      let min = 1.0;
      let max = -1.0;
      for (let s = startSample; s < endSample; s += 2) {
        const datum = channelData[s];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      if (min <= max) {
        ctx.moveTo(x, (1 + min) * amp);
        ctx.lineTo(x, (1 + max) * amp);
      }
    }
    ctx.stroke();

    // 3. Draw Hot Cue Markers on Scrolling Waveform
    deck.hotCues.forEach((cueTime, index) => {
      if (cueTime !== null && cueTime >= startTime && cueTime <= endTime) {
        const cueX = ((cueTime - startTime) / WINDOW_SEC) * width;
        ctx.strokeStyle = '#ffd600';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cueX, 0);
        ctx.lineTo(cueX, height);
        ctx.stroke();

        ctx.fillStyle = '#ffd600';
        ctx.font = 'bold 18px "JetBrains Mono", monospace';
        ctx.fillText(`H${index + 1}`, cueX + 4, 20);
      }
    });
  }

  // Waveform Click / Scrubbing Handlers (Scrolling canvas + Overview strip)
  [deckAElements, deckBElements].forEach(deckElem => {
    const deckId = deckElem === deckAElements ? 'A' : 'B';

    // Click on Main Scrolling Waveform -> Nudge/Seek relative to center playhead
    deckElem.waveformScrolling.addEventListener('click', (e) => {
      const deck = engine.decks[deckId];
      if (!deck.buffer) return;
      const rect = deckElem.waveformScrolling.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = clickX / rect.width;
      const WINDOW_SEC = 5.0;
      const currentTime = engine.getCurrentTime(deckId);
      const seekTime = currentTime + (pct - 0.5) * WINDOW_SEC;
      engine.seek(deckId, seekTime);
    });

    // Click on Overview Strip -> Seek to absolute percentage across full song
    deckElem.overviewStrip.addEventListener('click', (e) => {
      const deck = engine.decks[deckId];
      if (!deck.buffer) return;
      const rect = deckElem.overviewStrip.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = clickX / rect.width;
      const seekTime = pct * deck.buffer.duration;
      engine.seek(deckId, seekTime);
    });
  });

  // -------------------------------------------------------------
  // 6. Transport Controls & Sliders Setup
  // -------------------------------------------------------------
  function bindDeckControls(deckId, deckElem) {
    // Play/Pause button
    deckElem.btnPlay.addEventListener('click', () => {
      const deck = engine.decks[deckId];
      if (deck.isPlaying) {
        engine.pause(deckId);
      } else {
        engine.play(deckId);
      }
    });

    // Cue button
    deckElem.btnCue.addEventListener('click', () => {
      engine.cue(deckId);
    });

    // Sync button (Match BPM of other deck)
    deckElem.btnSync.addEventListener('click', () => {
      const otherDeckId = deckId === 'A' ? 'B' : 'A';
      engine.syncBPM(deckId, otherDeckId);
      const newPitchPct = ((engine.decks[deckId].playbackRate - 1.0) * 100).toFixed(1);
      deckElem.pitchSlider.value = engine.decks[deckId].playbackRate - 1.0;
      deckElem.pitchVal.textContent = `${newPitchPct >= 0 ? '+' : ''}${newPitchPct}%`;
    });

    // Pitch Slider
    deckElem.pitchSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      engine.setPlaybackRate(deckId, 1.0 + val);
      const pct = (val * 100).toFixed(1);
      deckElem.pitchVal.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
    });

    // Double click pitch slider to reset
    deckElem.pitchSlider.addEventListener('dblclick', () => {
      deckElem.pitchSlider.value = 0;
      engine.setPlaybackRate(deckId, 1.0);
      deckElem.pitchVal.textContent = '0.0%';
    });

    // Volume Slider
    deckElem.volSlider.addEventListener('input', (e) => {
      engine.setDeckVolume(deckId, e.target.value);
    });

    // Loop Toggle
    deckElem.loopToggle.addEventListener('click', () => {
      engine.toggleLoop(deckId);
      const isLooping = engine.decks[deckId].isLooping;
      deckElem.loopToggle.classList.toggle('active', isLooping);
      deckElem.loopToggle.textContent = isLooping ? 'LOOP ON' : 'LOOP OFF';
    });

    // Beat Loop Preset Buttons
    document.querySelectorAll(`.btn-loop[data-deck="${deckId}"][data-beats]`).forEach(btn => {
      btn.addEventListener('click', () => {
        const beats = parseInt(btn.getAttribute('data-beats'));
        engine.setBeatLoop(deckId, beats);
        deckElem.loopToggle.classList.add('active');
        deckElem.loopToggle.textContent = 'LOOP ON';
      });
    });

    // Hot Cue Buttons
    for (let slot = 0; slot < 4; slot++) {
      const cueBtn = document.getElementById(`deck-${deckId.toLowerCase()}-cue-${slot}`);
      cueBtn.addEventListener('click', () => {
        const res = engine.triggerHotCue(deckId, slot);
        cueBtn.classList.add('active-cue');
        cueBtn.textContent = `CUE ${slot + 1} (${res.time.toFixed(1)}s)`;
      });

      // Right click to clear hot cue
      cueBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        engine.clearHotCue(deckId, slot);
        cueBtn.classList.remove('active-cue');
        cueBtn.textContent = `HOT ${slot + 1}`;
      });
    }

    // Jog Wheel Drag-Scratch Gesture
    let isJogDragging = false;
    let lastMouseX = 0;

    deckElem.jog.addEventListener('mousedown', (e) => {
      isJogDragging = true;
      lastMouseX = e.clientX;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isJogDragging) return;
      const deltaX = e.clientX - lastMouseX;
      lastMouseX = e.clientX;
      
      const deck = engine.decks[deckId];
      if (deck.buffer) {
        const scratchAmount = (deltaX / 200); // Scratch sensitivity
        engine.seek(deckId, engine.getCurrentTime(deckId) + scratchAmount);
        jogAngles[deckId] += deltaX * 2;
        deckElem.jog.style.transform = `rotate(${jogAngles[deckId]}deg)`;
      }
    });

    window.addEventListener('mouseup', () => {
      isJogDragging = false;
    });
  }

  bindDeckControls('A', deckAElements);
  bindDeckControls('B', deckBElements);

  // Crossfader
  crossfader.addEventListener('input', (e) => {
    engine.setCrossfader(e.target.value);
  });

  // -------------------------------------------------------------
  // 6.1. Auto-Deck Relay Play & Auto-Queue Controller
  // -------------------------------------------------------------
  let crossfadeAnimId = null;
  function animateCrossfader(targetVal, durationMs = 1000) {
    if (crossfadeAnimId) cancelAnimationFrame(crossfadeAnimId);
    const startVal = parseFloat(crossfader.value);
    const diff = targetVal - startVal;
    if (Math.abs(diff) < 0.005) return;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Smooth cubic ease-in-out
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const cur = startVal + diff * ease;
      crossfader.value = cur;
      engine.setCrossfader(cur);

      if (progress < 1) {
        crossfadeAnimId = requestAnimationFrame(step);
      }
    }
    crossfadeAnimId = requestAnimationFrame(step);
  }

  async function queueNextLibraryTrack(targetDeckId) {
    if (!libraryTracks || libraryTracks.length === 0) return null;
    const otherDeckId = targetDeckId === 'A' ? 'B' : 'A';
    const otherDeck = engine.decks[otherDeckId];

    const currentEndedTitle = engine.decks[targetDeckId].title;
    const currentTrackIdx = libraryTracks.findIndex(t => t.title === currentEndedTitle);
    let nextTrack = null;

    if (currentTrackIdx >= 0) {
      for (let i = 1; i <= libraryTracks.length; i++) {
        const candidate = libraryTracks[(currentTrackIdx + i) % libraryTracks.length];
        if (candidate.title !== otherDeck.title) {
          nextTrack = candidate;
          break;
        }
      }
    }

    if (!nextTrack) {
      nextTrack = libraryTracks.find(t => t.title !== otherDeck.title) || libraryTracks[0];
    }

    if (nextTrack) {
      await loadTrackToDeck(targetDeckId, nextTrack);
      return nextTrack;
    }
    return null;
  }

  function toggleAutoRelay(forceState = null) {
    autoRelayEnabled = typeof forceState === 'boolean' ? forceState : !autoRelayEnabled;
    if (btnAutoRelay) {
      btnAutoRelay.classList.toggle('active', autoRelayEnabled);
    }
    audioStatusText.textContent = autoRelayEnabled
      ? 'Auto-Deck Relay: Active (Deck A ⇄ Deck B Continuous)'
      : 'Auto-Deck Relay: Disabled';
  }

  if (btnAutoRelay) {
    btnAutoRelay.addEventListener('click', () => toggleAutoRelay());
  }

  // Web Audio track finish listener for automatic relay handoff
  engine.onTrackEnd = async (endedDeckId) => {
    if (!autoRelayEnabled) return;

    const nextDeckId = endedDeckId === 'A' ? 'B' : 'A';
    const nextDeck = engine.decks[nextDeckId];

    audioStatusText.textContent = `Auto-Deck Relay: Deck ${endedDeckId} finished → Transitioning to Deck ${nextDeckId}`;

    const playNext = () => {
      if (nextDeck.pauseOffset >= nextDeck.buffer.duration - 0.15) {
        nextDeck.pauseOffset = nextDeck.cuePoint || 0;
      }
      engine.play(nextDeckId);

      if (chkAutoCrossfade && chkAutoCrossfade.checked) {
        animateCrossfader(nextDeckId === 'A' ? 0.0 : 1.0, 1000);
      }

      // Auto-advance / pre-load next song into the finished deck
      if (chkAutoQueue && chkAutoQueue.checked) {
        setTimeout(async () => {
          if (deckQueues[endedDeckId].length > 0) {
            await popAndLoadNextFromQueue(endedDeckId);
          } else {
            await queueNextLibraryTrack(endedDeckId);
          }
        }, 500);
      }
    };

    // Check if next deck has a cued playlist item to pop first
    if (deckQueues[nextDeckId].length > 0 && (!nextDeck.buffer || nextDeck.pauseOffset >= nextDeck.buffer.duration - 0.15)) {
      await popAndLoadNextFromQueue(nextDeckId);
      setTimeout(playNext, 120);
    } else if (nextDeck.buffer) {
      playNext();
    } else if (chkAutoQueue && chkAutoQueue.checked && libraryTracks.length > 0) {
      const loaded = await queueNextLibraryTrack(nextDeckId);
      if (loaded && engine.decks[nextDeckId].buffer) {
        setTimeout(playNext, 120);
      }
    } else {
      audioStatusText.textContent = `Auto-Deck Relay: Deck ${nextDeckId} has no track ready`;
    }
  };

  // -------------------------------------------------------------
  // 7. Custom Rotary Knob Gestures (EQ, Filter, FX & Master)
  // -------------------------------------------------------------
  const DECK_FX_PARAMS = {
    delay: {
      feedback: { label: 'FDBK', name: 'Feedback / Repeats', min: 0, max: 0.9, default: 0.4, step: 0.01, unit: '%' },
      mix:      { label: 'W/D',  name: 'Dry / Wet Mix',       min: 0, max: 1.0, default: 0.5, step: 0.01, unit: '%' },
      beats:    { label: 'TIME', name: 'Delay Timing (Beats)', min: 0.125, max: 2.0, default: 0.5, step: 0.125, unit: 'beats' },
      damping:  { label: 'DAMP', name: 'Tape Low-Pass Damping', min: 500, max: 12000, default: 4000, step: 100, unit: 'Hz' }
    },
    reverb: {
      mix:      { label: 'W/D',   name: 'Dry / Wet Mix',       min: 0, max: 1.0, default: 0.4, step: 0.01, unit: '%' },
      decay:    { label: 'DECAY', name: 'Decay Time',          min: 0.5, max: 8.0, default: 2.0, step: 0.1, unit: 's' }
    },
    flanger: {
      feedback: { label: 'FDBK',  name: 'Feedback Resonance',  min: 0, max: 0.85, default: 0.5, step: 0.01, unit: '%' },
      mix:      { label: 'W/D',   name: 'Dry / Wet Mix',       min: 0, max: 1.0, default: 0.5, step: 0.01, unit: '%' },
      rate:     { label: 'RATE',  name: 'LFO Speed / Rate',    min: 0.1, max: 5.0, default: 0.5, step: 0.05, unit: 'Hz' },
      depth:    { label: 'DEPTH', name: 'Modulation Depth',    min: 0.0005, max: 0.005, default: 0.002, step: 0.0001, unit: 's' }
    },
    bitcrush: {
      mix:      { label: 'W/D',   name: 'Dry / Wet Mix',       min: 0, max: 1.0, default: 0.5, step: 0.01, unit: '%' },
      bits:     { label: 'BITS',  name: 'Bit Depth (Crush)',   min: 2, max: 16, default: 4, step: 1, unit: 'bit' }
    }
  };

  function updateRotaryKnobUI(knob, val) {
    if (!knob) return;
    const isMaster = knob.id === 'knob-master';
    const isFilter = knob.getAttribute('data-type') === 'filter';
    const isDeckFx = knob.classList.contains('knob-deck-fx');
    let angle = 0;

    if (isMaster) {
      const clamped = Math.max(0, Math.min(1, parseFloat(val)));
      knob.setAttribute('data-val', clamped);
      angle = -135 + (clamped * 270);
    } else if (isDeckFx) {
      const fxType = knob.getAttribute('data-fx');
      const param = knob.getAttribute('data-param') || 'mix';
      const pDef = DECK_FX_PARAMS[fxType]?.[param] || { min: 0, max: 1, default: 0.5 };
      const rawVal = parseFloat(val);
      const clamped = Math.max(pDef.min, Math.min(pDef.max, isNaN(rawVal) ? pDef.default : rawVal));
      knob.setAttribute('data-val', clamped);
      const norm = (pDef.max === pDef.min) ? 0.5 : (clamped - pDef.min) / (pDef.max - pDef.min);
      angle = -135 + (norm * 270);
    } else if (isFilter) {
      // Filter: -1.0 (LPF) to +1.0 (HPF), 0 is center (12 o'clock)
      const clamped = Math.max(-1, Math.min(1, parseFloat(val)));
      knob.setAttribute('data-val', clamped);
      angle = clamped * 135;
    } else {
      // EQ knobs: val is dB (-24dB to +6dB). Center 0dB = 12 o'clock (0deg).
      const clamped = Math.max(-24, Math.min(6, parseFloat(val)));
      knob.setAttribute('data-val', clamped);
      if (clamped <= 0) {
        // -24dB -> -135deg, 0dB -> 0deg
        angle = (clamped / 24) * 135;
      } else {
        // 0dB -> 0deg, +6dB -> +135deg
        angle = (clamped / 6) * 135;
      }
    }
    const pointer = knob.querySelector('.rotary-pointer');
    if (pointer) pointer.style.transform = `translateX(-50%) rotate(${angle}deg)`;
  }

  document.querySelectorAll('.rotary-knob').forEach(knob => {
    let isDragging = false;
    let startY = 0;
    let startVal = 0;

    const isMaster = knob.id === 'knob-master';
    const isFilter = knob.getAttribute('data-type') === 'filter';
    const isDeckFx = knob.classList.contains('knob-deck-fx');

    function getKnobBounds() {
      if (isMaster) return { min: 0, max: 1, def: 1.0 };
      if (isFilter) return { min: -1, max: 1, def: 0 };
      if (isDeckFx) {
        const fxType = knob.getAttribute('data-fx');
        const param = knob.getAttribute('data-param') || 'mix';
        const pDef = DECK_FX_PARAMS[fxType]?.[param] || { min: 0, max: 1, default: 0.5 };
        return { min: pDef.min, max: pDef.max, def: pDef.default };
      }
      return { min: -24, max: 6, def: 0 };
    }

    // Initialize pointer visual rotation
    const initBounds = getKnobBounds();
    const curVal = knob.getAttribute('data-val') !== null ? parseFloat(knob.getAttribute('data-val')) : initBounds.def;
    updateRotaryKnobUI(knob, curVal);

    knob.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only left click drags
      isDragging = true;
      startY = e.clientY;
      const b = getKnobBounds();
      startVal = knob.getAttribute('data-val') !== null ? parseFloat(knob.getAttribute('data-val')) : b.def;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const b = getKnobBounds();
      const deltaY = startY - e.clientY; // Move up increases value
      const range = b.max - b.min;
      const valChange = (deltaY / 150) * range;
      let newVal = Math.max(b.min, Math.min(b.max, startVal + valChange));

      updateRotaryKnobUI(knob, newVal);

      // Update Audio Engine
      if (isMaster) {
        engine.setMasterVolume(newVal);
      } else if (isFilter) {
        const deckId = knob.getAttribute('data-deck');
        engine.setFilter(deckId, newVal);
      } else if (isDeckFx) {
        const deckId = knob.getAttribute('data-deck');
        const fxType = knob.getAttribute('data-fx');
        const param = knob.getAttribute('data-param') || 'mix';
        if (fxType === 'delay') {
          engine.setDelay(deckId, { [param]: newVal });
        } else if (fxType === 'reverb') {
          engine.setReverb(deckId, { [param]: newVal });
        } else if (fxType === 'flanger') {
          engine.setFlanger(deckId, { [param]: newVal });
        } else if (fxType === 'bitcrush') {
          engine.setBitcrusher(deckId, { [param]: newVal });
        }
      } else {
        const deckId = knob.getAttribute('data-deck');
        const band = knob.getAttribute('data-band');
        engine.setEQ(deckId, band, newVal);
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Double click knob to reset
    knob.addEventListener('dblclick', () => {
      const b = getKnobBounds();
      updateRotaryKnobUI(knob, b.def);
      if (isMaster) {
        engine.setMasterVolume(b.def);
      } else if (isFilter) {
        const deckId = knob.getAttribute('data-deck');
        engine.setFilter(deckId, b.def);
      } else if (isDeckFx) {
        const deckId = knob.getAttribute('data-deck');
        const fxType = knob.getAttribute('data-fx');
        const param = knob.getAttribute('data-param') || 'mix';
        if (fxType === 'delay') {
          engine.setDelay(deckId, { [param]: b.def });
        } else if (fxType === 'reverb') {
          engine.setReverb(deckId, { [param]: b.def });
        } else if (fxType === 'flanger') {
          engine.setFlanger(deckId, { [param]: b.def });
        } else if (fxType === 'bitcrush') {
          engine.setBitcrusher(deckId, { [param]: b.def });
        }
      } else {
        const deckId = knob.getAttribute('data-deck');
        const band = knob.getAttribute('data-band');
        engine.setEQ(deckId, band, b.def);
      }
    });
  });

  // -------------------------------------------------------------
  // 8. Keyboard Shortcuts
  // -------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    // Ignore keyboard shortcuts when typing in search input
    if (document.activeElement.tagName === 'INPUT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        deckAElements.btnPlay.click();
        break;
      case 'Enter':
        e.preventDefault();
        deckBElements.btnPlay.click();
        break;
      case 'KeyQ':
        document.getElementById('deck-a-cue-0').click();
        break;
      case 'KeyW':
        document.getElementById('deck-a-cue-1').click();
        break;
      case 'KeyE':
        document.getElementById('deck-a-cue-2').click();
        break;
      case 'KeyR':
        document.getElementById('deck-a-cue-3').click();
        break;
      case 'Digit1':
        document.getElementById('deck-b-cue-0').click();
        break;
      case 'Digit2':
        document.getElementById('deck-b-cue-1').click();
        break;
      case 'Digit3':
        document.getElementById('deck-b-cue-2').click();
        break;
      case 'Digit4':
        document.getElementById('deck-b-cue-3').click();
        break;
      case 'ArrowLeft':
        crossfader.value = Math.max(0, parseFloat(crossfader.value) - 0.05);
        engine.setCrossfader(crossfader.value);
        break;
      case 'ArrowRight':
        crossfader.value = Math.min(1, parseFloat(crossfader.value) + 0.05);
        engine.setCrossfader(crossfader.value);
        break;
      case 'KeyP':
        toggleAutoRelay();
        break;
      case 'KeyB': {
        const bm = document.getElementById('broadcast-modal');
        if (bm) bm.style.display = (bm.style.display === 'none' || !bm.style.display) ? 'flex' : 'none';
        break;
      }
      case 'KeyX': {
        const fx = document.getElementById('fx-modal');
        if (fx) fx.style.display = (fx.style.display === 'none' || !fx.style.display) ? 'flex' : 'none';
        break;
      }
      case 'KeyM': {
        const mm = document.getElementById('midi-modal');
        if (mm) mm.style.display = (mm.style.display === 'none' || !mm.style.display) ? 'flex' : 'none';
        break;
      }
      case 'Escape':
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
        break;
    }
  });

  // -------------------------------------------------------------
  // 9. Real-Time UI Render Loop (VU Meters, Timers, Waveforms, Jog Spin)
  // -------------------------------------------------------------
  function updateUIRefresh() {
    requestAnimationFrame(updateUIRefresh);

    // Update Deck A status & scrolling waveform
    const deckA = engine.decks.A;
    const curA = engine.getCurrentTime('A');
    const durA = deckA.buffer ? deckA.buffer.duration : 0;
    const remA = durA > 0 ? (durA - curA) : 999;
    const isEndingA = deckA.isPlaying && durA > 0 && remA <= 10.0 && remA >= 0;

    deckAElements.btnPlay.classList.toggle('playing', deckA.isPlaying);
    deckAElements.time.textContent = formatTime(curA);
    deckAElements.title.classList.toggle('track-ending-flash', isEndingA);
    if (deckAElements.time.parentElement) {
      deckAElements.time.parentElement.classList.toggle('time-ending-flash', isEndingA);
    }
    if (deckAElements.panel) {
      deckAElements.panel.classList.toggle('track-ending-warning', isEndingA);
    }
    if (deckAElements.overviewProgress) {
      deckAElements.overviewProgress.classList.toggle('ending-alert', isEndingA);
    }
    renderScrollingWaveform('A');

    if (deckA.isPlaying) {
      jogAngles.A += (1.5 * (deckA.playbackRate + deckA.pitchNudge));
      deckAElements.jog.style.transform = `rotate(${jogAngles.A}deg)`;
    }

    // Update Deck B status & scrolling waveform
    const deckB = engine.decks.B;
    const curB = engine.getCurrentTime('B');
    const durB = deckB.buffer ? deckB.buffer.duration : 0;
    const remB = durB > 0 ? (durB - curB) : 999;
    const isEndingB = deckB.isPlaying && durB > 0 && remB <= 10.0 && remB >= 0;

    deckBElements.btnPlay.classList.toggle('playing', deckB.isPlaying);
    deckBElements.time.textContent = formatTime(curB);
    deckBElements.title.classList.toggle('track-ending-flash', isEndingB);
    if (deckBElements.time.parentElement) {
      deckBElements.time.parentElement.classList.toggle('time-ending-flash', isEndingB);
    }
    if (deckBElements.panel) {
      deckBElements.panel.classList.toggle('track-ending-warning', isEndingB);
    }
    if (deckBElements.overviewProgress) {
      deckBElements.overviewProgress.classList.toggle('ending-alert', isEndingB);
    }
    renderScrollingWaveform('B');

    if (deckB.isPlaying) {
      jogAngles.B += (1.5 * (deckB.playbackRate + deckB.pitchNudge));
      deckBElements.jog.style.transform = `rotate(${jogAngles.B}deg)`;
    }

    // VU Level Meters
    const levelA = engine.getDeckPeakLevel('A');
    const levelB = engine.getDeckPeakLevel('B');
    const levelMaster = engine.getMasterPeakLevel();

    deckAElements.vuFill.style.height = `${Math.min(100, levelA * 150)}%`;
    deckBElements.vuFill.style.height = `${Math.min(100, levelB * 150)}%`;
    vuMaster.style.height = `${Math.min(100, levelMaster * 150)}%`;
  }

  // Start UI animation loop
  requestAnimationFrame(updateUIRefresh);

  // Initialize demo tracks
  initDemoTracks();

  // -------------------------------------------------------------
  // 10. Version Tracking & Changelog Modal Handler
  // -------------------------------------------------------------
  const btnChangelog = document.getElementById('btn-changelog');
  const changelogModal = document.getElementById('changelog-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const changelogModalBody = document.getElementById('changelog-modal-body');
  const appVersionTag = document.getElementById('app-version-tag');
  const footerVersionTag = document.getElementById('footer-version-tag');

  async function loadVersionData() {
    try {
      const res = await fetch('version.json');
      if (!res.ok) return;
      const verData = await res.json();

      if (appVersionTag) appVersionTag.textContent = `v${verData.version}`;
      if (footerVersionTag) footerVersionTag.textContent = `v${verData.version}`;

      if (changelogModalBody && verData.changelog) {
        changelogModalBody.innerHTML = verData.changelog.map(item => `
          <div class="changelog-card">
            <div class="changelog-card-header">
              <span class="changelog-ver">v${escapeHtml(item.version)} - ${escapeHtml(item.title)}</span>
              <span class="changelog-date">${escapeHtml(item.date)}</span>
            </div>
            <ul class="changelog-list">
              ${item.changes.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
            </ul>
          </div>
        `).join('');
      }
    } catch (err) {
      console.warn('Could not load version.json metadata:', err);
    }
  }

  loadVersionData();

  if (btnChangelog && changelogModal) {
    btnChangelog.addEventListener('click', () => {
      changelogModal.style.display = 'flex';
    });
  }

  if (btnCloseModal && changelogModal) {
    btnCloseModal.addEventListener('click', () => {
      changelogModal.style.display = 'none';
    });
  }

  if (changelogModal) {
    changelogModal.addEventListener('click', (e) => {
      if (e.target === changelogModal) {
        changelogModal.style.display = 'none';
      }
    });
  }

  // -------------------------------------------------------------
  // Helper Utilities
  // -------------------------------------------------------------
  function formatTime(sec) {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const tenths = Math.floor((sec % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }

  function formatDuration(sec) {
    if (!sec || isNaN(sec) || sec <= 0) return '--:--';
    const totalSecs = Math.round(sec);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = Math.floor(totalSecs % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function getAudioFileDuration(file) {
    return new Promise((resolve) => {
      try {
        const audio = new Audio();
        const url = URL.createObjectURL(file);
        audio.src = url;
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          const dur = audio.duration;
          URL.revokeObjectURL(url);
          resolve(isFinite(dur) && dur > 0 ? dur : 0);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(0);
        };
        setTimeout(() => {
          URL.revokeObjectURL(url);
          resolve(0);
        }, 3000);
      } catch (_) {
        resolve(0);
      }
    });
  }

  async function populateTrackAnalysis(trackObj) {
    if (!trackObj) return;

    if (trackObj.audioSource instanceof File || trackObj.audioSource instanceof Blob) {
      // 1. If metadata (artist, title, bpm, key, artwork) hasn't been parsed, extract binary tags
      if (typeof AudioMetadataParser !== 'undefined' && (!trackObj.artist || trackObj.artist === 'Unknown Artist' || !trackObj.bpm || !trackObj.key || !trackObj.artworkUrl)) {
        try {
          const meta = await AudioMetadataParser.parseFile(trackObj.audioSource);
          if (meta) {
            if (meta.title && (!trackObj.title || trackObj.title === trackObj.audioSource.name)) trackObj.title = meta.title;
            if (meta.artist && (trackObj.artist === 'Unknown Artist' || !trackObj.artist)) trackObj.artist = meta.artist;
            if (meta.bpm && !trackObj.bpm) trackObj.bpm = meta.bpm;
            if (meta.key && !trackObj.key) trackObj.key = meta.key;
            if (meta.artworkUrl && !trackObj.artworkUrl) trackObj.artworkUrl = meta.artworkUrl;
          }
        } catch (_) {}
      }

      // 2. Obtain duration
      if (!trackObj.duration || trackObj.duration <= 0) {
        const dur = await getAudioFileDuration(trackObj.audioSource);
        if (dur > 0) trackObj.duration = dur;
      }

      // 3. Fallback DSP analysis for missing BPM or Key
      if ((!trackObj.bpm || !trackObj.key) && typeof AudioDSPAnalyzer !== 'undefined' && engine && engine.ctx) {
        try {
          const arrayBuf = await trackObj.audioSource.slice(0, Math.min(trackObj.audioSource.size, 4 * 1024 * 1024)).arrayBuffer();
          const decoded = await engine.ctx.decodeAudioData(arrayBuf.slice(0));
          if (decoded) {
            if (!trackObj.bpm) trackObj.bpm = AudioDSPAnalyzer.analyzeBPM(decoded);
            if (!trackObj.key) trackObj.key = AudioDSPAnalyzer.analyzeKey(decoded);
            if (!trackObj.duration) trackObj.duration = decoded.duration;
          }
        } catch (_) {
          if (!trackObj.bpm) trackObj.bpm = 124.0;
          if (!trackObj.key) trackObj.key = '8A (Am)';
        }
      }

      // Sync with matching items in queues and refresh table
      ['A', 'B'].forEach(d => {
        deckQueues[d].forEach(qTrack => {
          if (isSameTrack(qTrack, trackObj)) {
            if (trackObj.duration) qTrack.duration = trackObj.duration;
            if (trackObj.bpm) qTrack.bpm = trackObj.bpm;
            if (trackObj.key) qTrack.key = trackObj.key;
            if (trackObj.artworkUrl) qTrack.artworkUrl = trackObj.artworkUrl;
          }
        });
      });
      renderLibraryTable();
      updateQueueUI();
    } else if (trackObj.audioSource && typeof trackObj.audioSource.duration === 'number') {
      trackObj.duration = trackObj.audioSource.duration;
    }
  }

  // Alias for backward compatibility
  const populateTrackDuration = populateTrackAnalysis;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  // =======================================================================
  // MIDI Controller Integration
  // =======================================================================
  (function initMIDIPanel() {
    const midiModal        = document.getElementById('midi-modal');
    const btnMidiPanel     = document.getElementById('btn-midi-panel');
    const btnCloseMidi     = document.getElementById('btn-close-midi-modal');
    const btnMidiConnect   = document.getElementById('btn-midi-connect');
    const btnMidiRefresh   = document.getElementById('btn-midi-refresh');
    const midiDevicesList  = document.getElementById('midi-devices-list');
    const midiPresetsRow   = document.getElementById('midi-presets-row');
    const midiStatusDot    = document.getElementById('midi-status-dot');
    const midiStatusText   = document.getElementById('midi-status-text');
    const midiActivityLog  = document.getElementById('midi-activity-log');
    const midiMappingTbody = document.getElementById('midi-mapping-tbody');
    const btnMidiLearnStart= document.getElementById('btn-midi-learn-start');
    const btnMidiLearnStop = document.getElementById('btn-midi-learn-stop');
    const midiLearnStatus  = document.getElementById('midi-learn-status');
    const midiLearnAction  = document.getElementById('midi-learn-action');
    const midiLearnDeck    = document.getElementById('midi-learn-deck');
    const btnMidiClear     = document.getElementById('btn-midi-clear');

    if (!btnMidiPanel) return; // guard if HTML not updated

    let midiManager = null;
    let activePresetName = null;
    const MAX_ACTIVITY_LINES = 30;

    // ------------------------------------------------------------------
    // Modal open / close
    // ------------------------------------------------------------------
    btnMidiPanel.addEventListener('click', () => {
      midiModal.style.display = 'flex';
    });
    btnCloseMidi.addEventListener('click', () => {
      midiModal.style.display = 'none';
    });
    midiModal.addEventListener('click', (e) => {
      if (e.target === midiModal) midiModal.style.display = 'none';
    });

    // Click status badge to open modal
    document.getElementById('midi-status-badge').addEventListener('click', () => {
      midiModal.style.display = 'flex';
    });

    // ------------------------------------------------------------------
    // Build action select options
    // ------------------------------------------------------------------
    const ACTIONS = (typeof MIDI_ACTIONS !== 'undefined') ? MIDI_ACTIONS : {};
    Object.entries(ACTIONS).forEach(([key, meta]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = meta.desc;
      midiLearnAction.appendChild(opt);
    });

    // ------------------------------------------------------------------
    // Status helpers
    // ------------------------------------------------------------------
    function setMidiStatus(state, label) {
      midiStatusText.textContent = label;
      midiStatusDot.className = 'status-dot';
      if (state === 'connected') midiStatusDot.classList.add('active');
      if (state === 'error')     midiStatusDot.style.background = 'var(--accent-red)';
    }

    // ------------------------------------------------------------------
    // Device list renderer
    // ------------------------------------------------------------------
    function renderDevices(devices) {
      midiDevicesList.innerHTML = '';
      if (!devices || devices.length === 0) {
        midiDevicesList.innerHTML = '<div class="midi-no-device">No MIDI input devices found. Plug in your controller and click Refresh.</div>';
        return;
      }
      devices.forEach(dev => {
        const card = document.createElement('div');
        card.className = 'midi-device-card midi-device-active';
        card.innerHTML = `
          <span class="midi-device-icon">🎛</span>
          <div>
            <div class="midi-device-name">${escapeHtml(dev.name)}</div>
            <div class="midi-device-sub">${dev.manufacturer ? escapeHtml(dev.manufacturer) + ' · ' : ''}ID: ${dev.id}</div>
          </div>`;
        midiDevicesList.appendChild(card);
      });
    }

    // ------------------------------------------------------------------
    // Preset buttons renderer
    // ------------------------------------------------------------------
    function renderPresets() {
      midiPresetsRow.innerHTML = '';
      if (typeof MIDI_PRESETS === 'undefined') return;
      MIDI_PRESETS.forEach(preset => {
        const btn = document.createElement('button');
        btn.className = 'btn-midi-preset' + (activePresetName === preset.name ? ' active-preset' : '');
        btn.textContent = preset.name;
        btn.addEventListener('click', () => {
          if (!midiManager) return;
          midiManager.getMapper().applyPreset(preset);
          activePresetName = preset.name;
          renderPresets();
          renderMappingTable();
          addActivityLine(`Preset loaded: ${preset.name}`, 'trigger');
        });
        midiPresetsRow.appendChild(btn);
      });
    }

    // ------------------------------------------------------------------
    // Mapping table renderer
    // ------------------------------------------------------------------
    function renderMappingTable() {
      if (!midiManager) { midiMappingTbody.innerHTML = ''; return; }
      const mapper = midiManager.getMapper();
      midiMappingTbody.innerHTML = '';

      if (mapper.mappings.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="6" style="text-align:center;color:var(--text-dim);padding:12px;">No mappings. Load a preset or use MIDI Learn.</td>';
        midiMappingTbody.appendChild(tr);
        return;
      }

      mapper.mappings.forEach((m, idx) => {
        const ACTIONS_REF = (typeof MIDI_ACTIONS !== 'undefined') ? MIDI_ACTIONS : {};
        const actionMeta  = ACTIONS_REF[m.action];
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-family:var(--font-mono)">${m.channel}</td>
          <td><span style="text-transform:uppercase;font-size:10px;font-weight:700;color:var(--text-muted)">${m.type}</span></td>
          <td style="font-family:var(--font-mono)">${m.number}</td>
          <td>${actionMeta ? actionMeta.desc : m.action}</td>
          <td>${m.deck || 'Global'}</td>
          <td><button class="btn" style="padding:2px 8px;font-size:11px;" data-idx="${idx}">✕</button></td>`;
        tr.querySelector('button').addEventListener('click', () => {
          mapper.removeMapping(idx);
          renderMappingTable();
        });
        midiMappingTbody.appendChild(tr);
      });
    }

    // ------------------------------------------------------------------
    // Activity log
    // ------------------------------------------------------------------
    function addActivityLine(text, cls = '') {
      // Clear empty state
      const empty = midiActivityLog.querySelector('.midi-activity-empty');
      if (empty) empty.remove();

      const line = document.createElement('div');
      line.className = `midi-activity-line ${cls}`;
      line.textContent = text;
      midiActivityLog.appendChild(line);

      // Keep log trimmed
      while (midiActivityLog.children.length > MAX_ACTIVITY_LINES) {
        midiActivityLog.removeChild(midiActivityLog.firstChild);
      }
      midiActivityLog.scrollTop = midiActivityLog.scrollHeight;
    }

    // ------------------------------------------------------------------
    // MIDI Manager UI callbacks
    // ------------------------------------------------------------------
    const uiCallbacks = {
      onStatusChange(state) {
        if (state === 'unsupported') {
          setMidiStatus('error', 'MIDI: Not Supported in this browser');
          btnMidiConnect.disabled = true;
        } else if (state === 'connected') {
          setMidiStatus('connected', 'MIDI: Connected');
          btnMidiConnect.style.display = 'none';
          btnMidiRefresh.style.display = '';
        } else if (state === 'denied') {
          setMidiStatus('error', 'MIDI: Permission Denied');
        } else if (state.startsWith('preset:')) {
          const pname = state.replace('preset:', '');
          activePresetName = pname;
          setMidiStatus('connected', `MIDI: Connected · ${pname}`);
          addActivityLine(`Auto-preset: ${pname}`, 'trigger');
          renderPresets();
          renderMappingTable();
        }
      },

      onDeviceChange(devices) {
        renderDevices(devices);
        if (devices.length > 0) {
          setMidiStatus('connected', `MIDI: ${devices.length} device${devices.length > 1 ? 's' : ''} connected`);
        }
      },

      onActivity(action, deck, value) {
        const ACTIONS_REF = (typeof MIDI_ACTIONS !== 'undefined') ? MIDI_ACTIONS : {};
        const meta = ACTIONS_REF[action];
        const label = meta ? meta.desc : action;
        const deckStr = deck ? ` [Deck ${deck}]` : ' [Global]';
        const valStr  = ` val:${value}`;
        addActivityLine(`${label}${deckStr}${valStr}`, meta && meta.type === 'trigger' ? 'trigger' : 'cc');

        // Flash the MIDI status badge
        const badge = document.getElementById('midi-status-badge');
        badge.classList.remove('midi-indicator-flash');
        void badge.offsetWidth;
        badge.classList.add('midi-indicator-flash');
      },

      onTrigger(action, deck) {
        // Briefly animate the corresponding button in the UI
        const suffix = (deck || '').toLowerCase();
        const map = {
          play:  `btn-play-${suffix}`,
          cue:   `btn-cue-${suffix}`,
          sync:  `btn-sync-${suffix}`,
          loop_toggle: `loop-toggle-${suffix}`,
          auto_relay: 'btn-auto-relay'
        };
        let btnId = map[action];
        if (!btnId && action && action.startsWith('hot_cue_')) {
          const slot = parseInt(action.replace('hot_cue_', '')) - 1;
          btnId = `deck-${suffix}-cue-${slot}`;
        }
        if (btnId) {
          const el = document.getElementById(btnId);
          if (el) {
            el.classList.add('midi-indicator-flash');
            setTimeout(() => el.classList.remove('midi-indicator-flash'), 300);
          }
        }

        // Sync button updates pitch display
        if (action === 'sync' && deck) {
          const slider = document.getElementById(`pitch-${suffix}`);
          const valBadge = document.getElementById(`pitch-val-${suffix}`);
          if (slider && engine.decks[deck]) {
            const pitchVal = engine.decks[deck].playbackRate - 1.0;
            slider.value = pitchVal;
            if (valBadge) {
              const pct = (pitchVal * 100).toFixed(1);
              valBadge.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
            }
          }
        }

        // Loop state updates
        if (action && action.startsWith('loop') && deck) {
          const loopBtn = document.getElementById(`loop-toggle-${suffix}`);
          if (loopBtn && engine.decks[deck]) {
            const isLooping = engine.decks[deck].isLooping;
            loopBtn.classList.toggle('active', isLooping);
            loopBtn.textContent = isLooping ? 'LOOP ON' : 'LOOP OFF';
          }
        }

        // Hot cue updates
        if (action && action.startsWith('hot_cue_') && deck) {
          const slot = parseInt(action.replace('hot_cue_', '')) - 1;
          const cueBtn = document.getElementById(`deck-${suffix}-cue-${slot}`);
          if (cueBtn && engine.decks[deck] && engine.decks[deck].hotCues[slot] !== null) {
            cueBtn.classList.add('active-cue');
            cueBtn.textContent = `CUE ${slot + 1} (${engine.decks[deck].hotCues[slot].toFixed(1)}s)`;
          }
        }

        // Quick FX Toggle updates
        if (action && action.startsWith('fx_') && action.endsWith('_toggle') && deck) {
          const fxType = action.replace('fx_', '').replace('_toggle', '');
          const btn = document.getElementById(`btn-fx-toggle-${fxType}-${suffix}`);
          if (btn && engine.decks[deck]) {
            const isActive = fxType === 'bitcrush' ? !!engine.decks[deck].fx.bitcrusher.active : !!engine.decks[deck].fx[fxType].active;
            btn.classList.toggle('active', isActive);
          }
        }
      },

      onRollChange(action, deck, isPressed) {
        const rollMap = {
          beat_roll_1_8: '0.125',
          beat_roll_1_4: '0.25',
          beat_roll_1_2: '0.5',
          beat_roll_1: '1',
          beat_roll_2: '2'
        };
        const rollVal = rollMap[action];
        if (rollVal && deck) {
          const pad = document.querySelector(`.roll-bar .btn-roll[data-deck="${deck}"][data-roll="${rollVal}"]`);
          if (pad) pad.classList.toggle('active-roll', isPressed);

          const loopBtn = document.getElementById(`btn-loop-toggle-${deck.toLowerCase()}`);
          if (loopBtn && engine.decks[deck]) {
            const isLooping = engine.decks[deck].isLooping;
            loopBtn.classList.toggle('active', isLooping);
            loopBtn.textContent = isLooping ? 'LOOP ON' : 'LOOP OFF';
          }
        }
      },

      onCCChange(action, deck, normValue) {
        const deckKey = deck ? deck.toLowerCase() : '';
        // 1. Crossfader (min: 0, max: 1)
        if (action === 'crossfader') {
          const cf = document.getElementById('crossfader');
          if (cf) cf.value = normValue;
        }
        // 2. Channel Volume (vol-a, vol-b: min: 0, max: 1)
        else if (action === 'volume' && deck) {
          const slider = document.getElementById(`vol-${deckKey}`);
          if (slider) slider.value = normValue;
        }
        // 3. Master Volume Rotary Knob (knob-master: 0.0 to 1.0)
        else if (action === 'master_volume') {
          const knob = document.getElementById('knob-master');
          if (knob) updateRotaryKnobUI(knob, normValue);
        }
        // 4. Deck EQ HI, MID, LOW Rotary Knobs (-24dB to +6dB)
        else if ((action === 'eq_high' || action === 'eq_mid' || action === 'eq_low') && deck) {
          const band = action === 'eq_high' ? 'high' : (action === 'eq_mid' ? 'mid' : 'low');
          const knob = document.getElementById(`knob-eq-${band}-${deckKey}`);
          if (knob) {
            const gainDb = normValue <= 0.5 ? ((normValue / 0.5) * 24 - 24) : (((normValue - 0.5) / 0.5) * 6);
            updateRotaryKnobUI(knob, gainDb);
          }
        }
        // 5. Pitch / Tempo Slider & Badge (-0.08 to +0.08)
        else if (action === 'pitch' && deck) {
          const slider = document.getElementById(`pitch-${deckKey}`);
          const valBadge = document.getElementById(`pitch-val-${deckKey}`);
          const pitchVal = (normValue - 0.5) * 0.16; // -0.08 to +0.08
          if (slider) slider.value = pitchVal;
          if (valBadge) {
            const pct = (pitchVal * 100).toFixed(1);
            valBadge.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
          }
        }
        // 6. Dual Filter Knob (-1.0 to +1.0)
        else if (action === 'filter' && deck) {
          const knob = document.getElementById(`knob-filter-${deckKey}`);
          const filterVal = (normValue - 0.5) * 2.0; // -1.0 to +1.0
          if (knob) updateRotaryKnobUI(knob, filterVal);
        }
        // 7. On-Deck Quick FX Knobs
        else if (action === 'fx_delay_feedback' && deck) {
          const knob = document.getElementById(`knob-fx-delay-${deckKey}`);
          if (knob) updateRotaryKnobUI(knob, normValue * 0.9);
        }
        else if (action === 'fx_reverb_mix' && deck) {
          const knob = document.getElementById(`knob-fx-reverb-${deckKey}`);
          if (knob) updateRotaryKnobUI(knob, normValue);
        }
        else if (action === 'fx_flanger_feedback' && deck) {
          const knob = document.getElementById(`knob-fx-flanger-${deckKey}`);
          if (knob) updateRotaryKnobUI(knob, normValue * 0.85);
        }
        else if (action === 'fx_bitcrush_mix' && deck) {
          const knob = document.getElementById(`knob-fx-bitcrush-${deckKey}`);
          if (knob) updateRotaryKnobUI(knob, normValue);
        }
      }
    };

    // ------------------------------------------------------------------
    // Connect button
    // ------------------------------------------------------------------
    btnMidiConnect.addEventListener('click', async () => {
      btnMidiConnect.disabled = true;
      btnMidiConnect.textContent = '⏳ Connecting…';

      midiManager = new MIDIControllerManager(engine, uiCallbacks);
      const ok = await midiManager.init();

      if (ok) {
        renderDevices(midiManager.getDevices());
        renderPresets();
        renderMappingTable();
      } else {
        btnMidiConnect.disabled = false;
        btnMidiConnect.textContent = '⚡ Connect MIDI';
      }
    });

    // Refresh
    btnMidiRefresh.addEventListener('click', () => {
      if (!midiManager) return;
      renderDevices(midiManager.getDevices());
      renderMappingTable();
    });

    // Clear all mappings
    btnMidiClear.addEventListener('click', () => {
      if (!midiManager) return;
      midiManager.getMapper().clearAll();
      activePresetName = null;
      renderPresets();
      renderMappingTable();
      addActivityLine('All mappings cleared.');
    });

    // ------------------------------------------------------------------
    // MIDI Learn
    // ------------------------------------------------------------------
    btnMidiLearnStart.addEventListener('click', () => {
      const action = midiLearnAction.value;
      const deckRaw = midiLearnDeck.value;

      if (!action) {
        midiLearnStatus.textContent = '⚠ Please select an action first.';
        return;
      }
      if (!midiManager) {
        midiLearnStatus.textContent = '⚠ Connect a MIDI device first.';
        return;
      }

      const meta = MIDI_ACTIONS[action];
      const requiresDeck = meta ? meta.deck : false;
      const deck = requiresDeck ? deckRaw : null;

      midiLearnStatus.innerHTML = `Listening for <strong>${meta ? meta.desc : action}</strong>${deck ? ` [Deck ${deck}]` : ''}… Move a knob or press a button.`;
      btnMidiLearnStart.style.display = 'none';
      btnMidiLearnStop.style.display  = '';

      midiManager.getMapper().startLearn((captured) => {
        midiManager.getMapper().addMapping({
          channel: captured.channel,
          type:    captured.type,
          number:  captured.number,
          action,
          deck
        });
        midiManager.getMapper().stopLearn();

        btnMidiLearnStart.style.display = '';
        btnMidiLearnStop.style.display  = 'none';
        midiLearnStatus.textContent = `Mapped CH${captured.channel} ${captured.type.toUpperCase()} #${captured.number} → ${meta ? meta.desc : action}`;

        renderMappingTable();
      });
    });

    btnMidiLearnStop.addEventListener('click', () => {
      if (midiManager) midiManager.getMapper().stopLearn();
      btnMidiLearnStart.style.display = '';
      btnMidiLearnStop.style.display  = 'none';
      midiLearnStatus.textContent = 'Learn cancelled.';
    });

    // Initial table render
    const tmpMapper = new MIDIMapper();
    const rows = tmpMapper.mappings.map((m, i) => {
      const meta = MIDI_ACTIONS[m.action];
      const desc = meta ? meta.desc : m.action;
      const deckBadge = m.deck ? `<span class="badge ${m.deck === 'A' ? 'badge-a' : 'badge-b'}">Deck ${m.deck}</span>` : '<span class="badge" style="color:var(--text-dim);">Global</span>';
      return `<tr>
        <td>CH${m.channel}</td>
        <td>${m.type.toUpperCase()}</td>
        <td>${m.number}</td>
        <td>${desc}</td>
        <td>${deckBadge}</td>
        <td></td>
      </tr>`;
    }).join('');
    midiMappingTbody.innerHTML = rows || '<tr><td colspan="6" style="color:var(--text-dim); text-align:center; padding:16px;">No mappings configured.</td></tr>';
  })();

  // -------------------------------------------------------------
  // 13. Software FX Unit Controller (Filter, Delay, Reverb, Flanger, Bitcrusher, Beat Roll)
  // -------------------------------------------------------------
  (function initSoftwareFXUnit() {
    const btnFxPanel = document.getElementById('btn-fx-panel');
    const fxModal = document.getElementById('fx-modal');
    const btnCloseFxModal = document.getElementById('btn-close-fx-modal');

    let currentTarget = 'A'; // 'A', 'B', or 'BOTH'

    function getTargetDecks() {
      return currentTarget === 'BOTH' ? ['A', 'B'] : [currentTarget];
    }

    if (btnFxPanel && fxModal) {
      btnFxPanel.addEventListener('click', () => {
        fxModal.style.display = 'flex';
        syncAllFXUI();
      });
    }

    if (btnCloseFxModal && fxModal) {
      btnCloseFxModal.addEventListener('click', () => fxModal.style.display = 'none');
      fxModal.addEventListener('click', (e) => {
        if (e.target === fxModal) fxModal.style.display = 'none';
      });
    }

    // Target Deck Switcher
    const targetBtns = document.querySelectorAll('.fx-target-btn');
    targetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        targetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTarget = btn.getAttribute('data-target');
        syncAllFXUI();
      });
    });

    // 1. Dual Filter Controls
    const fxFilterSlider = document.getElementById('fx-filter-slider');
    const fxFilterVal = document.getElementById('fx-filter-val');
    const btnFilterLpf = document.getElementById('btn-filter-lpf-dive');
    const btnFilterReset = document.getElementById('btn-filter-reset');
    const btnFilterHpf = document.getElementById('btn-filter-hpf-sweep');
    const btnFilterPower = document.getElementById('btn-fx-filter-power');

    function applyFilter(val) {
      getTargetDecks().forEach(d => {
        engine.setFilter(d, val);
        const knob = document.getElementById(`knob-filter-${d.toLowerCase()}`);
        if (knob) updateRotaryKnobUI(knob, val);
      });
      updateFilterReadout(val);
    }

    function updateFilterReadout(val) {
      if (!fxFilterVal) return;
      const num = parseFloat(val);
      if (Math.abs(num) < 0.02) {
        fxFilterVal.textContent = 'OFF';
        fxFilterVal.style.color = 'var(--text-muted)';
      } else if (num < 0) {
        fxFilterVal.textContent = `LPF ${(num * 100).toFixed(0)}%`;
        fxFilterVal.style.color = '#ff9100';
      } else {
        fxFilterVal.textContent = `HPF +${(num * 100).toFixed(0)}%`;
        fxFilterVal.style.color = '#00f0ff';
      }
    }

    if (fxFilterSlider) {
      fxFilterSlider.addEventListener('input', (e) => applyFilter(e.target.value));
    }
    if (btnFilterLpf) btnFilterLpf.addEventListener('click', () => {
      if (fxFilterSlider) fxFilterSlider.value = -0.7;
      applyFilter(-0.7);
    });
    if (btnFilterReset) btnFilterReset.addEventListener('click', () => {
      if (fxFilterSlider) fxFilterSlider.value = 0;
      applyFilter(0);
    });
    if (btnFilterHpf) btnFilterHpf.addEventListener('click', () => {
      if (fxFilterSlider) fxFilterSlider.value = 0.7;
      applyFilter(0.7);
    });
    if (btnFilterPower) {
      btnFilterPower.addEventListener('click', () => {
        const isOff = fxFilterSlider && Math.abs(parseFloat(fxFilterSlider.value)) < 0.02;
        if (!isOff) {
          if (fxFilterSlider) fxFilterSlider.value = 0;
          applyFilter(0);
        }
      });
    }

    // 2. Echo & Delay Controls
    const btnDelayPower = document.getElementById('btn-fx-delay-power');
    const delayBeatsBtns = document.querySelectorAll('#fx-delay-beats-bar .fx-beat-btn');
    const delayFeedbackSlider = document.getElementById('fx-delay-feedback');
    const delayMixSlider = document.getElementById('fx-delay-mix');
    const delayFbVal = document.getElementById('fx-delay-fb-val');
    const delayMixVal = document.getElementById('fx-delay-mix-val');

    let delayState = { beats: 0.5, feedback: 0.4, mix: 0.5, active: false };

    function applyDelay() {
      getTargetDecks().forEach(d => engine.setDelay(d, delayState));
    }

    if (btnDelayPower) {
      btnDelayPower.addEventListener('click', () => {
        delayState.active = !delayState.active;
        btnDelayPower.classList.toggle('active', delayState.active);
        btnDelayPower.textContent = delayState.active ? 'ACTIVE' : 'OFF';
        applyDelay();
      });
    }

    delayBeatsBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        delayBeatsBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        delayState.beats = parseFloat(btn.getAttribute('data-beats'));
        applyDelay();
      });
    });

    if (delayFeedbackSlider) {
      delayFeedbackSlider.addEventListener('input', (e) => {
        delayState.feedback = parseFloat(e.target.value);
        if (delayFbVal) delayFbVal.textContent = `${(delayState.feedback * 100).toFixed(0)}%`;
        applyDelay();
      });
    }

    if (delayMixSlider) {
      delayMixSlider.addEventListener('input', (e) => {
        delayState.mix = parseFloat(e.target.value);
        if (delayMixVal) delayMixVal.textContent = `${(delayState.mix * 100).toFixed(0)}%`;
        applyDelay();
      });
    }

    // 3. Studio Reverb Controls
    const btnReverbPower = document.getElementById('btn-fx-reverb-power');
    const reverbPresetBtns = document.querySelectorAll('#fx-reverb-presets-bar .fx-preset-btn');
    const reverbDecaySlider = document.getElementById('fx-reverb-decay');
    const reverbMixSlider = document.getElementById('fx-reverb-mix');
    const reverbDecayVal = document.getElementById('fx-reverb-decay-val');
    const reverbMixVal = document.getElementById('fx-reverb-mix-val');

    let reverbState = { decay: 2.0, mix: 0.4, active: false };

    function applyReverb() {
      getTargetDecks().forEach(d => engine.setReverb(d, reverbState));
    }

    if (btnReverbPower) {
      btnReverbPower.addEventListener('click', () => {
        reverbState.active = !reverbState.active;
        btnReverbPower.classList.toggle('active', reverbState.active);
        btnReverbPower.textContent = reverbState.active ? 'ACTIVE' : 'OFF';
        applyReverb();
      });
    }

    reverbPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        reverbPresetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        reverbState.decay = parseFloat(btn.getAttribute('data-decay'));
        if (reverbDecaySlider) reverbDecaySlider.value = reverbState.decay;
        if (reverbDecayVal) reverbDecayVal.textContent = `${reverbState.decay.toFixed(1)}s`;
        applyReverb();
      });
    });

    if (reverbDecaySlider) {
      reverbDecaySlider.addEventListener('input', (e) => {
        reverbState.decay = parseFloat(e.target.value);
        if (reverbDecayVal) reverbDecayVal.textContent = `${reverbState.decay.toFixed(1)}s`;
        applyReverb();
      });
    }

    if (reverbMixSlider) {
      reverbMixSlider.addEventListener('input', (e) => {
        reverbState.mix = parseFloat(e.target.value);
        if (reverbMixVal) reverbMixVal.textContent = `${(reverbState.mix * 100).toFixed(0)}%`;
        applyReverb();
      });
    }

    // 4. Flanger / Phaser Controls
    const btnFlangerPower = document.getElementById('btn-fx-flanger-power');
    const flangerRateSlider = document.getElementById('fx-flanger-rate');
    const flangerFeedbackSlider = document.getElementById('fx-flanger-feedback');
    const flangerMixSlider = document.getElementById('fx-flanger-mix');
    const flangerRateVal = document.getElementById('fx-flanger-rate-val');
    const flangerFbVal = document.getElementById('fx-flanger-fb-val');
    const flangerMixVal = document.getElementById('fx-flanger-mix-val');

    let flangerState = { rate: 0.5, depth: 0.002, feedback: 0.5, mix: 0.5, active: false };

    function applyFlanger() {
      getTargetDecks().forEach(d => engine.setFlanger(d, flangerState));
    }

    if (btnFlangerPower) {
      btnFlangerPower.addEventListener('click', () => {
        flangerState.active = !flangerState.active;
        btnFlangerPower.classList.toggle('active', flangerState.active);
        btnFlangerPower.textContent = flangerState.active ? 'ACTIVE' : 'OFF';
        applyFlanger();
      });
    }

    if (flangerRateSlider) {
      flangerRateSlider.addEventListener('input', (e) => {
        flangerState.rate = parseFloat(e.target.value);
        if (flangerRateVal) flangerRateVal.textContent = `${flangerState.rate.toFixed(1)} Hz`;
        applyFlanger();
      });
    }

    if (flangerFeedbackSlider) {
      flangerFeedbackSlider.addEventListener('input', (e) => {
        flangerState.feedback = parseFloat(e.target.value);
        if (flangerFbVal) flangerFbVal.textContent = `${(flangerState.feedback * 100).toFixed(0)}%`;
        applyFlanger();
      });
    }

    if (flangerMixSlider) {
      flangerMixSlider.addEventListener('input', (e) => {
        flangerState.mix = parseFloat(e.target.value);
        if (flangerMixVal) flangerMixVal.textContent = `${(flangerState.mix * 100).toFixed(0)}%`;
        applyFlanger();
      });
    }

    // 5. Lo-Fi Bitcrusher Controls
    const btnBitcrushPower = document.getElementById('btn-fx-bitcrush-power');
    const bitcrushBitsBtns = document.querySelectorAll('#fx-bitcrush-bits-bar .fx-bit-btn');
    const bitcrushBitsSlider = document.getElementById('fx-bitcrush-bits');
    const bitcrushMixSlider = document.getElementById('fx-bitcrush-mix');
    const bitcrushBitsVal = document.getElementById('fx-bitcrush-val');
    const bitcrushMixVal = document.getElementById('fx-bitcrush-mix-val');

    let bitcrushState = { bits: 4, mix: 0.5, active: false };

    function applyBitcrusher() {
      getTargetDecks().forEach(d => engine.setBitcrusher(d, bitcrushState));
    }

    if (btnBitcrushPower) {
      btnBitcrushPower.addEventListener('click', () => {
        bitcrushState.active = !bitcrushState.active;
        btnBitcrushPower.classList.toggle('active', bitcrushState.active);
        btnBitcrushPower.textContent = bitcrushState.active ? 'ACTIVE' : 'OFF';
        applyBitcrusher();
      });
    }

    bitcrushBitsBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        bitcrushBitsBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        bitcrushState.bits = parseInt(btn.getAttribute('data-bits'));
        if (bitcrushBitsSlider) bitcrushBitsSlider.value = bitcrushState.bits;
        if (bitcrushBitsVal) bitcrushBitsVal.textContent = `${bitcrushState.bits}-Bit`;
        applyBitcrusher();
      });
    });

    if (bitcrushBitsSlider) {
      bitcrushBitsSlider.addEventListener('input', (e) => {
        bitcrushState.bits = parseInt(e.target.value);
        if (bitcrushBitsVal) bitcrushBitsVal.textContent = `${bitcrushState.bits}-Bit`;
        applyBitcrusher();
      });
    }

    if (bitcrushMixSlider) {
      bitcrushMixSlider.addEventListener('input', (e) => {
        bitcrushState.mix = parseFloat(e.target.value);
        if (bitcrushMixVal) bitcrushMixVal.textContent = `${(bitcrushState.mix * 100).toFixed(0)}%`;
        applyBitcrusher();
      });
    }

    // 6. Beat Roll Pads (Momentary Slip-Mode Loop)
    function attachRollPadListeners(pad, deckTarget, beats) {
      const startRoll = (e) => {
        e.preventDefault();
        pad.classList.add('active-roll', 'active-pad');
        const decks = deckTarget === 'TARGET' ? getTargetDecks() : [deckTarget];
        decks.forEach(d => engine.startBeatRoll(d, beats));
      };

      const endRoll = (e) => {
        e.preventDefault();
        pad.classList.remove('active-roll', 'active-pad');
        const decks = deckTarget === 'TARGET' ? getTargetDecks() : [deckTarget];
        decks.forEach(d => engine.stopBeatRoll(d));
      };

      pad.addEventListener('mousedown', startRoll);
      pad.addEventListener('touchstart', startRoll, { passive: false });
      pad.addEventListener('mouseup', endRoll);
      pad.addEventListener('mouseleave', endRoll);
      pad.addEventListener('touchend', endRoll);
      pad.addEventListener('touchcancel', endRoll);
    }

    // Deck A & B direct roll buttons
    document.querySelectorAll('.btn-roll').forEach(btn => {
      const deck = btn.getAttribute('data-deck');
      const roll = parseFloat(btn.getAttribute('data-roll'));
      attachRollPadListeners(btn, deck, roll);
    });

    // FX Modal Roll Pads
    document.querySelectorAll('.btn-roll-pad').forEach(pad => {
      const roll = parseFloat(pad.getAttribute('data-roll'));
      attachRollPadListeners(pad, 'TARGET', roll);
    });

    // Simplified On-Deck Quick FX Toggle Buttons
    document.querySelectorAll('.btn-deck-fx-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const deckId = btn.getAttribute('data-deck');
        const fxType = btn.getAttribute('data-fx');
        const deck = engine.decks[deckId];
        if (!deck) return;

        if (fxType === 'delay') {
          const nextState = !deck.fx.delay.active;
          engine.setDelay(deckId, { active: nextState });
        } else if (fxType === 'reverb') {
          const nextState = !deck.fx.reverb.active;
          engine.setReverb(deckId, { active: nextState });
        } else if (fxType === 'flanger') {
          const nextState = !deck.fx.flanger.active;
          engine.setFlanger(deckId, { active: nextState });
        } else if (fxType === 'bitcrush') {
          const nextState = !deck.fx.bitcrusher.active;
          engine.setBitcrusher(deckId, { active: nextState });
        }
        syncAllFXUI();
      });
    });

    function syncAllFXUI() {
      const sampleDeck = currentTarget === 'BOTH' ? 'A' : currentTarget;
      const deck = engine.decks[sampleDeck];
      if (!deck) return;

      // Sync filter
      if (fxFilterSlider) fxFilterSlider.value = deck.fx.filter || 0;
      updateFilterReadout(deck.fx.filter || 0);

      // Sync delay
      if (btnDelayPower) {
        btnDelayPower.classList.toggle('active', deck.fx.delay.active);
        btnDelayPower.textContent = deck.fx.delay.active ? 'ACTIVE' : 'OFF';
      }
      if (delayFeedbackSlider) delayFeedbackSlider.value = deck.fx.delay.feedback;
      if (delayMixSlider) delayMixSlider.value = deck.fx.delay.mix;

      // Sync reverb
      if (btnReverbPower) {
        btnReverbPower.classList.toggle('active', deck.fx.reverb.active);
        btnReverbPower.textContent = deck.fx.reverb.active ? 'ACTIVE' : 'OFF';
      }
      if (reverbDecaySlider) reverbDecaySlider.value = deck.fx.reverb.decay;
      if (reverbMixSlider) reverbMixSlider.value = deck.fx.reverb.mix;

      // Sync flanger
      if (btnFlangerPower) {
        btnFlangerPower.classList.toggle('active', deck.fx.flanger.active);
        btnFlangerPower.textContent = deck.fx.flanger.active ? 'ACTIVE' : 'OFF';
      }
      if (flangerRateSlider) flangerRateSlider.value = deck.fx.flanger.rate;
      if (flangerMixSlider) flangerMixSlider.value = deck.fx.flanger.mix;

      // Sync bitcrusher
      if (btnBitcrushPower) {
        btnBitcrushPower.classList.toggle('active', deck.fx.bitcrusher.active);
        btnBitcrushPower.textContent = deck.fx.bitcrusher.active ? 'ACTIVE' : 'OFF';
      }
      if (bitcrushBitsSlider) bitcrushBitsSlider.value = deck.fx.bitcrusher.bits;
      if (bitcrushMixSlider) bitcrushMixSlider.value = deck.fx.bitcrusher.mix;

      // Sync on-deck buttons and knobs for both Deck A and Deck B
      ['A', 'B'].forEach(d => {
        const dk = engine.decks[d];
        if (!dk) return;
        
        // Delay
        const btnDly = document.getElementById(`btn-fx-toggle-delay-${d.toLowerCase()}`);
        if (btnDly) btnDly.classList.toggle('active', !!dk.fx.delay.active);
        const knobDly = document.getElementById(`knob-fx-delay-${d.toLowerCase()}`);
        if (knobDly) {
          const param = knobDly.getAttribute('data-param') || 'feedback';
          updateRotaryKnobUI(knobDly, dk.fx.delay[param]);
        }

        // Reverb
        const btnRev = document.getElementById(`btn-fx-toggle-reverb-${d.toLowerCase()}`);
        if (btnRev) btnRev.classList.toggle('active', !!dk.fx.reverb.active);
        const knobRev = document.getElementById(`knob-fx-reverb-${d.toLowerCase()}`);
        if (knobRev) {
          const param = knobRev.getAttribute('data-param') || 'mix';
          updateRotaryKnobUI(knobRev, dk.fx.reverb[param]);
        }

        // Flanger
        const btnFlg = document.getElementById(`btn-fx-toggle-flanger-${d.toLowerCase()}`);
        if (btnFlg) btnFlg.classList.toggle('active', !!dk.fx.flanger.active);
        const knobFlg = document.getElementById(`knob-fx-flanger-${d.toLowerCase()}`);
        if (knobFlg) {
          const param = knobFlg.getAttribute('data-param') || 'feedback';
          updateRotaryKnobUI(knobFlg, dk.fx.flanger[param]);
        }

        // Bitcrusher
        const btnCrush = document.getElementById(`btn-fx-toggle-bitcrush-${d.toLowerCase()}`);
        if (btnCrush) btnCrush.classList.toggle('active', !!dk.fx.bitcrusher.active);
        const knobCrush = document.getElementById(`knob-fx-bitcrush-${d.toLowerCase()}`);
        if (knobCrush) {
          const param = knobCrush.getAttribute('data-param') || 'mix';
          updateRotaryKnobUI(knobCrush, dk.fx.bitcrusher[param]);
        }
      });
    }

    // ------------------------------------------------------------------
    // On-Deck FX Right-Click Context Menu (Parameter Switcher)
    // ------------------------------------------------------------------
    function initDeckFXContextMenu() {
      let activeMenu = null;

      function closeContextMenu() {
        if (activeMenu) {
          activeMenu.remove();
          activeMenu = null;
        }
      }

      window.addEventListener('click', closeContextMenu);
      window.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.deck-fx-item')) {
          closeContextMenu();
        }
      });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeContextMenu();
      });

      document.querySelectorAll('.deck-fx-item').forEach(item => {
        const openParamMenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeContextMenu();

          const knob = item.querySelector('.knob-deck-fx');
          if (!knob) return;

          const deckId = knob.getAttribute('data-deck');
          const fxType = knob.getAttribute('data-fx');
          const currentParam = knob.getAttribute('data-param') || (fxType === 'delay' || fxType === 'flanger' ? 'feedback' : 'mix');
          const paramsForFx = DECK_FX_PARAMS[fxType];
          if (!paramsForFx) return;

          const menu = document.createElement('div');
          menu.className = `fx-param-menu ${deckId === 'B' ? 'fx-param-menu-deck-b' : ''}`;

          const fxTitles = {
            delay: 'Echo & Delay Parameter',
            reverb: 'Studio Reverb Parameter',
            flanger: 'Flanger & Phaser Parameter',
            bitcrush: 'Lo-Fi Bitcrusher Parameter'
          };

          const header = document.createElement('div');
          header.className = 'fx-param-menu-header';
          header.textContent = fxTitles[fxType] || 'Select Parameter';
          menu.appendChild(header);

          Object.entries(paramsForFx).forEach(([paramKey, pDef]) => {
            const btn = document.createElement('button');
            btn.className = `fx-param-menu-item ${paramKey === currentParam ? 'active' : ''}`;
            btn.innerHTML = `<span>${paramKey === currentParam ? '✓ ' : ''}${pDef.name}</span><span class="fx-param-badge">${pDef.label}</span>`;
            btn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              // Assign selected parameter to knob
              knob.setAttribute('data-param', paramKey);
              const sublabel = item.querySelector('.fx-knob-sublabel');
              if (sublabel) sublabel.textContent = pDef.label;
              knob.setAttribute('title', `${fxTitles[fxType] || fxType}: ${pDef.name}`);

              // Save preference in localStorage
              try {
                localStorage.setItem(`wdjr_fx_param_${deckId}_${fxType}`, paramKey);
              } catch (_) {}

              // Read live parameter value and update dial visual angle
              const dk = engine.decks[deckId];
              if (dk) {
                const engineFx = fxType === 'bitcrush' ? dk.fx.bitcrusher : dk.fx[fxType];
                const curVal = engineFx ? engineFx[paramKey] : pDef.default;
                updateRotaryKnobUI(knob, curVal);
              }

              closeContextMenu();
            });
            menu.appendChild(btn);
          });

          document.body.appendChild(menu);

          // Position menu near cursor with viewport containment
          const mouseX = e.pageX || (item.getBoundingClientRect().left + window.scrollX);
          const mouseY = e.pageY || (item.getBoundingClientRect().bottom + window.scrollY);
          const menuRect = menu.getBoundingClientRect();
          let posX = mouseX + 4;
          let posY = mouseY + 4;

          if (posX + menuRect.width > window.innerWidth - 10) {
            posX = window.innerWidth - menuRect.width - 10;
          }
          if (posY + menuRect.height > window.innerHeight - 10) {
            posY = window.innerHeight - menuRect.height - 10;
          }

          menu.style.left = `${Math.max(10, posX)}px`;
          menu.style.top = `${Math.max(10, posY)}px`;

          activeMenu = menu;
        };

        item.addEventListener('contextmenu', openParamMenu);
        const sublabel = item.querySelector('.fx-knob-sublabel');
        if (sublabel) {
          sublabel.addEventListener('click', openParamMenu);
          sublabel.title = 'Click or Right-Click to change parameter';
        }
      });

      // Restore saved parameter preferences on initialization
      ['A', 'B'].forEach(deckId => {
        ['delay', 'reverb', 'flanger', 'bitcrush'].forEach(fxType => {
          try {
            const savedParam = localStorage.getItem(`wdjr_fx_param_${deckId}_${fxType}`);
            if (savedParam && DECK_FX_PARAMS[fxType]?.[savedParam]) {
              const knob = document.getElementById(`knob-fx-${fxType}-${deckId.toLowerCase()}`);
              if (knob) {
                knob.setAttribute('data-param', savedParam);
                const parent = knob.closest('.deck-fx-item');
                const sublabel = parent?.querySelector('.fx-knob-sublabel');
                if (sublabel) sublabel.textContent = DECK_FX_PARAMS[fxType][savedParam].label;
                knob.setAttribute('title', `${DECK_FX_PARAMS[fxType][savedParam].name}`);
              }
            }
          } catch (_) {}
        });
      });
    }

    // Initialize context menu & initial UI sync
    initDeckFXContextMenu();
    syncAllFXUI();
  })();

  // =======================================================================
  // Live Radio Broadcasting Subsystem (WebRTC WHIP, Icecast, Shoutcast)
  // =======================================================================
  (function initBroadcastSubsystem() {
    if (typeof RadioBroadcastManager === 'undefined') return;
    const broadcastManager = new RadioBroadcastManager(engine);

    // Modal elements
    const broadcastModal = document.getElementById('broadcast-modal');
    const btnBroadcastPanel = document.getElementById('btn-broadcast-panel');
    const btnCloseBroadcastModal = document.getElementById('btn-close-broadcast-modal');
    const btnModalToggleBroadcast = document.getElementById('btn-modal-toggle-broadcast');
    const modalToggleBroadcastText = document.getElementById('modal-toggle-broadcast-text');
    const modalBroadcastDot = document.getElementById('modal-broadcast-dot');
    const modalBroadcastStatusText = document.getElementById('modal-broadcast-status-text');
    const modalBroadcastTimer = document.getElementById('modal-broadcast-timer');
    const broadcastStatusBanner = document.getElementById('broadcast-status-banner');
    const broadcastLogBox = document.getElementById('broadcast-log-box');

    // Header & Mixer controls
    const headerBroadcastDot = document.getElementById('header-broadcast-dot');
    const headerBroadcastText = document.getElementById('header-broadcast-text');
    const btnMixerBroadcast = document.getElementById('btn-mixer-broadcast');
    const mixerBroadcastStatus = document.getElementById('mixer-broadcast-status');
    const mixerBroadcastBtnText = document.getElementById('mixer-broadcast-btn-text');
    const mixerBroadcastTimer = document.getElementById('mixer-broadcast-timer');
    const mixerBroadcastMode = document.getElementById('mixer-broadcast-mode');

    // Protocol tab buttons & contents
    const tabs = {
      webrtc: { btn: document.getElementById('tab-broadcast-webrtc'), content: document.getElementById('bcontent-webrtc') },
      icecast: { btn: document.getElementById('tab-broadcast-icecast'), content: document.getElementById('bcontent-icecast') },
      butt: { btn: document.getElementById('tab-broadcast-butt'), content: document.getElementById('bcontent-butt') },
      shoutcast: { btn: document.getElementById('tab-broadcast-shoutcast'), content: document.getElementById('bcontent-shoutcast') },
      p2p: { btn: document.getElementById('tab-broadcast-p2p'), content: document.getElementById('bcontent-p2p') }
    };

    let activeProtocol = broadcastManager.config.mode || 'webrtc_whip';

    function switchProtocolTab(key) {
      activeProtocol = key === 'webrtc' ? 'webrtc_whip' : (key === 'p2p' ? 'webrtc_p2p' : key);
      Object.entries(tabs).forEach(([k, tab]) => {
        if (!tab.btn || !tab.content) return;
        const isActive = k === key;
        tab.btn.classList.toggle('active', isActive);
        tab.content.style.display = isActive ? 'block' : 'none';
      });
      if (mixerBroadcastMode) {
        mixerBroadcastMode.textContent = key === 'webrtc' ? 'WebRTC WHIP' : (key === 'p2p' ? 'P2P Stream' : (key === 'butt' ? 'B.U.T.T. Direct' : key.toUpperCase()));
      }
      if (key === 'butt') {
        refreshAudioOutputDevices();
      }
    }

    // Audio Output Device Routing (e.g. BlackHole, Loopback into B.U.T.T.)
    const audioDeviceSelect = document.getElementById('bcast-audio-device-select');
    const btnRefreshAudioDevices = document.getElementById('btn-refresh-audio-devices');
    const audioDeviceStatus = document.getElementById('audio-device-status');

    async function refreshAudioOutputDevices(requestPermission = false) {
      if (!audioDeviceSelect) return;
      try {
        const devices = await WebRadioDecksEngine.getAudioOutputDevices(requestPermission);
        const currentVal = audioDeviceSelect.value;
        audioDeviceSelect.innerHTML = '<option value="">Default Audio Output (Speakers / Headphones)</option>';
        
        let hasBlankLabels = false;
        devices.forEach(d => {
          if (d.deviceId === 'default') return;
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          if (!d.label) {
            hasBlankLabels = true;
            opt.textContent = `Audio Output (${d.deviceId.slice(0, 8)}...)`;
          } else {
            opt.textContent = d.label;
          }
          if (d.deviceId === currentVal) opt.selected = true;
          audioDeviceSelect.appendChild(opt);
        });

        if (audioDeviceStatus) {
          if (hasBlankLabels) {
            audioDeviceStatus.innerHTML = `⚠️ Device names hidden by browser. Click <strong>🔄 Refresh</strong> & allow audio permission to show device names (BlackHole, Audio Interface).`;
          } else if (audioDeviceSelect.value) {
            const selectedText = audioDeviceSelect.options[audioDeviceSelect.selectedIndex]?.text || 'Custom Device';
            audioDeviceStatus.textContent = `Active Output: ${selectedText}`;
          } else {
            audioDeviceStatus.textContent = `Active Output: System Default`;
          }
        }
      } catch (err) {
        console.warn('Could not enumerate audio devices:', err);
      }
    }

    if (audioDeviceSelect) {
      audioDeviceSelect.addEventListener('change', async () => {
        const deviceId = audioDeviceSelect.value;
        const success = await engine.setOutputDevice(deviceId);
        if (audioDeviceStatus) {
          const selectedText = audioDeviceSelect.options[audioDeviceSelect.selectedIndex]?.text || 'System Default';
          audioDeviceStatus.textContent = success ? `Active Output: ${selectedText}` : `Active Output: System Default (routing requires Chrome/Edge/Safari)`;
        }
      });
    }

    if (btnRefreshAudioDevices) {
      btnRefreshAudioDevices.addEventListener('click', () => refreshAudioOutputDevices(true));
    }

    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', () => refreshAudioOutputDevices(false));
    }

    Object.entries(tabs).forEach(([k, tab]) => {
      if (tab.btn) tab.btn.addEventListener('click', () => switchProtocolTab(k));
    });

    // Populate inputs from saved config
    function loadFormFromConfig() {
      const cfg = broadcastManager.config;
      if (cfg.webrtc) {
        const urlEl = document.getElementById('bcast-webrtc-url');
        const tokEl = document.getElementById('bcast-webrtc-token');
        const brEl = document.getElementById('bcast-webrtc-bitrate');
        const iceEl = document.getElementById('bcast-webrtc-ice');
        if (urlEl) urlEl.value = cfg.webrtc.whipUrl || '';
        if (tokEl) tokEl.value = cfg.webrtc.authToken || '';
        if (brEl) brEl.value = cfg.webrtc.bitrate || 256;
        if (iceEl) iceEl.value = cfg.webrtc.iceServers || 'stun:stun.l.google.com:19302';
      }
      if (cfg.icecast) {
        const addrEl = document.getElementById('bcast-icecast-address');
        const portEl = document.getElementById('bcast-icecast-port');
        const mntEl = document.getElementById('bcast-icecast-mount');
        const userEl = document.getElementById('bcast-icecast-user');
        const passEl = document.getElementById('bcast-icecast-pass');
        const sslEl = document.getElementById('bcast-icecast-ssl');
        const brEl = document.getElementById('bcast-icecast-bitrate');
        const nameEl = document.getElementById('bcast-icecast-name');
        const genreEl = document.getElementById('bcast-icecast-genre');
        const protoEl = document.getElementById('bcast-icecast-protocol');
        if (addrEl) addrEl.value = cfg.icecast.address || 'localhost';
        if (portEl) portEl.value = cfg.icecast.port || 8000;
        if (mntEl) mntEl.value = cfg.icecast.mount || '/live.ogg';
        if (userEl) userEl.value = cfg.icecast.user || 'source';
        if (passEl) passEl.value = cfg.icecast.password || '';
        if (sslEl) sslEl.value = cfg.icecast.ssl || 'http';
        if (brEl) brEl.value = cfg.icecast.bitrate || 192;
        if (nameEl) nameEl.value = cfg.icecast.stationName || 'WebDJ Radio Live';
        if (genreEl) genreEl.value = cfg.icecast.genre || 'Electronic / DJ Mix';
        if (protoEl) protoEl.value = cfg.icecast.protocol || 'http_put';
      }
      if (cfg.shoutcast) {
        const srvEl = document.getElementById('bcast-shoutcast-server');
        const sidEl = document.getElementById('bcast-shoutcast-sid');
        const passEl = document.getElementById('bcast-shoutcast-pass');
        const brEl = document.getElementById('bcast-shoutcast-bitrate');
        const nameEl = document.getElementById('bcast-shoutcast-name');
        if (srvEl) srvEl.value = cfg.shoutcast.serverUrl || 'http://localhost:8000';
        if (sidEl) sidEl.value = cfg.shoutcast.streamId || 1;
        if (passEl) passEl.value = cfg.shoutcast.password || '';
        if (brEl) brEl.value = cfg.shoutcast.bitrate || 192;
        if (nameEl) nameEl.value = cfg.shoutcast.stationName || 'WebDJ Radio Live';
      }

      if (cfg.mode === 'icecast') switchProtocolTab('icecast');
      else if (cfg.mode === 'shoutcast') switchProtocolTab('shoutcast');
      else if (cfg.mode === 'webrtc_p2p') switchProtocolTab('p2p');
      else switchProtocolTab('webrtc');
    }

    function gatherConfigFromForm() {
      return {
        mode: activeProtocol,
        webrtc: {
          whipUrl: document.getElementById('bcast-webrtc-url')?.value.trim() || '',
          authToken: document.getElementById('bcast-webrtc-token')?.value.trim() || '',
          bitrate: parseInt(document.getElementById('bcast-webrtc-bitrate')?.value || '256'),
          iceServers: document.getElementById('bcast-webrtc-ice')?.value.trim() || 'stun:stun.l.google.com:19302'
        },
        icecast: {
          address: document.getElementById('bcast-icecast-address')?.value.trim() || 'localhost',
          port: parseInt(document.getElementById('bcast-icecast-port')?.value || '8000'),
          mount: document.getElementById('bcast-icecast-mount')?.value.trim() || '/live.ogg',
          user: document.getElementById('bcast-icecast-user')?.value.trim() || 'source',
          password: document.getElementById('bcast-icecast-pass')?.value || '',
          ssl: document.getElementById('bcast-icecast-ssl')?.value || 'http',
          bitrate: parseInt(document.getElementById('bcast-icecast-bitrate')?.value || '192'),
          stationName: document.getElementById('bcast-icecast-name')?.value.trim() || 'WebDJ Radio Live',
          genre: document.getElementById('bcast-icecast-genre')?.value.trim() || 'Electronic / DJ Mix',
          protocol: document.getElementById('bcast-icecast-protocol')?.value || 'http_put'
        },
        shoutcast: {
          serverUrl: document.getElementById('bcast-shoutcast-server')?.value.trim() || 'http://localhost:8000',
          streamId: parseInt(document.getElementById('bcast-shoutcast-sid')?.value || '1'),
          password: document.getElementById('bcast-shoutcast-pass')?.value || '',
          bitrate: parseInt(document.getElementById('bcast-shoutcast-bitrate')?.value || '192'),
          stationName: document.getElementById('bcast-shoutcast-name')?.value.trim() || 'WebDJ Radio Live'
        }
      };
    }

    loadFormFromConfig();

    // Logger
    broadcastManager.onLog = (msg, type) => {
      if (!broadcastLogBox) return;
      const entry = document.createElement('div');
      entry.className = `log-entry log-${type || 'info'}`;
      entry.textContent = msg;
      broadcastLogBox.appendChild(entry);
      broadcastLogBox.scrollTop = broadcastLogBox.scrollHeight;
    };

    // State changes handler
    broadcastManager.onStateChange = (state, err) => {
      const isLive = state === 'connected';
      const isConnecting = state === 'connecting';

      // Header button
      if (btnBroadcastPanel) btnBroadcastPanel.classList.toggle('is-live', isLive);
      if (headerBroadcastDot) headerBroadcastDot.classList.toggle('active', isLive);
      if (headerBroadcastText) headerBroadcastText.textContent = isLive ? '🔴 LIVE ON AIR' : '📡 Broadcast';

      // Mixer console
      const mixerCard = document.querySelector('.broadcast-mixer-card');
      if (mixerCard) mixerCard.classList.toggle('is-live', isLive);
      if (mixerBroadcastStatus) {
        mixerBroadcastStatus.textContent = isLive ? 'ON AIR' : (isConnecting ? 'CONNECTING' : (state === 'error' ? 'ERROR' : 'OFFLINE'));
        mixerBroadcastStatus.classList.toggle('live', isLive);
      }
      if (mixerBroadcastBtnText) mixerBroadcastBtnText.textContent = isLive ? 'STOP STREAM' : (isConnecting ? 'CONNECTING…' : 'GO LIVE');

      // Modal banner
      if (broadcastStatusBanner) broadcastStatusBanner.classList.toggle('is-live', isLive);
      if (modalBroadcastDot) modalBroadcastDot.classList.toggle('active', isLive);
      if (modalBroadcastStatusText) {
        modalBroadcastStatusText.textContent = isLive ? 'LIVE ON AIR' : (isConnecting ? 'CONNECTING…' : (state === 'error' ? `ERROR: ${err || 'Failed'}` : 'OFFLINE'));
      }
      if (modalToggleBroadcastText) modalToggleBroadcastText.textContent = isLive ? '⏹ STOP STREAM' : (isConnecting ? '⏳ CONNECTING…' : '🔴 GO LIVE');

      // P2P SDP offer textarea
      if (activeProtocol === 'webrtc_p2p' && broadcastManager.peerConnection?.localDescription) {
        const p2pArea = document.getElementById('bcast-p2p-sdp');
        if (p2pArea) p2pArea.value = JSON.stringify(broadcastManager.peerConnection.localDescription);
      }
    };

    // Toggle broadcast execution
    async function toggleBroadcast() {
      if (broadcastManager.isBroadcasting) {
        broadcastManager.stopBroadcast();
      } else {
        const cfg = gatherConfigFromForm();
        await broadcastManager.startBroadcast(cfg);
      }
    }

    if (btnModalToggleBroadcast) btnModalToggleBroadcast.addEventListener('click', toggleBroadcast);
    if (btnMixerBroadcast) btnMixerBroadcast.addEventListener('click', () => {
      if (!broadcastManager.isBroadcasting) {
        if (broadcastModal) broadcastModal.style.display = 'flex';
      } else {
        toggleBroadcast();
      }
    });

    if (btnBroadcastPanel && broadcastModal) {
      btnBroadcastPanel.addEventListener('click', () => {
        broadcastModal.style.display = 'flex';
      });
    }

    if (btnCloseBroadcastModal && broadcastModal) {
      btnCloseBroadcastModal.addEventListener('click', () => {
        broadcastModal.style.display = 'none';
      });
      broadcastModal.addEventListener('click', (e) => {
        if (e.target === broadcastModal) broadcastModal.style.display = 'none';
      });
    }

    // Stats interval update
    setInterval(() => {
      const stats = broadcastManager.getStats();
      const timeStr = formatDuration(stats.elapsedSec);

      if (mixerBroadcastTimer) mixerBroadcastTimer.textContent = stats.isBroadcasting ? timeStr : '00:00:00';
      if (modalBroadcastTimer) modalBroadcastTimer.textContent = stats.isBroadcasting ? timeStr : '00:00:00';

      const statDataSent = document.getElementById('stat-data-sent');
      const statAvgBitrate = document.getElementById('stat-avg-bitrate');
      const statNowPlaying = document.getElementById('stat-now-playing');

      if (statDataSent) statDataSent.textContent = `${stats.mbSent} MB`;
      if (statAvgBitrate) statAvgBitrate.textContent = stats.isBroadcasting && stats.bitrateKbps > 0 ? `${stats.bitrateKbps} kbps` : '-- kbps';
      if (statNowPlaying) statNowPlaying.textContent = stats.nowPlaying;
    }, 1000);

    // Track metadata update hook
    function updateBroadcastTrackMeta() {
      const activeDeck = engine.crossfaderPosition < 0.5 ? 'A' : 'B';
      const deckElem = activeDeck === 'A' ? deckAElements : deckBElements;
      const title = deckElem.title.textContent || 'DJ Live Mix';
      const artist = deckElem.artist.textContent || 'WebDJRadio';
      broadcastManager.updateMetadata(title, artist);
    }

    if (deckAElements.btnPlay) deckAElements.btnPlay.addEventListener('click', () => setTimeout(updateBroadcastTrackMeta, 200));
    if (deckBElements.btnPlay) deckBElements.btnPlay.addEventListener('click', () => setTimeout(updateBroadcastTrackMeta, 200));
    if (crossfader) crossfader.addEventListener('input', updateBroadcastTrackMeta);
  })();

});



