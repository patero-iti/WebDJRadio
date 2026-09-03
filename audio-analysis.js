/**
 * WebDJRadio — Audio Metadata Parser & DSP Audio Analysis Engine
 * 
 * Features:
 * 1. Binary ID3v2 (v2.2, v2.3, v2.4), ID3v1, MP4/M4A atoms, FLAC Vorbis, and WAV RIFF parser.
 *    Extracts Title, Artist, Album, BPM (TBPM / tmpo), Musical Key (TKEY / initialkey), and Album Artwork (APIC / PIC / covr / Picture block).
 * 2. DSP Beat & Tempo Detection (Onset Peak Autocorrelation, 150Hz LPF).
 * 3. DSP Harmonic Key Detection (12-note Chromagram Pitch Class Profile & Krumhansl Correlation).
 * 4. Camelot Wheel Key Normalization (e.g. "8A (Am)", "8B (C)", "11B (A)").
 */

const AudioMetadataParser = (function() {
  'use strict';

  // Camelot wheel translation table
  const CAMELOT_KEY_MAP = {
    // Minor Keys (A)
    'ABM': '1A (Abm)', 'G#M': '1A (Abm)', 'G# MINOR': '1A (Abm)', 'AB MINOR': '1A (Abm)', '1A': '1A (Abm)',
    'EBM': '2A (Ebm)', 'D#M': '2A (Ebm)', 'D# MINOR': '2A (Ebm)', 'EB MINOR': '2A (Ebm)', '2A': '2A (Ebm)',
    'BBM': '3A (Bbm)', 'A#M': '3A (Bbm)', 'A# MINOR': '3A (Bbm)', 'BB MINOR': '3A (Bbm)', '3A': '3A (Bbm)',
    'FM':  '4A (Fm)',  'F MINOR': '4A (Fm)',  '4A': '4A (Fm)',
    'CM':  '5A (Cm)',  'C MINOR': '5A (Cm)',  '5A': '5A (Cm)',
    'GM':  '6A (Gm)',  'G MINOR': '6A (Gm)',  '6A': '6A (Gm)',
    'DM':  '7A (Dm)',  'D MINOR': '7A (Dm)',  '7A': '7A (Dm)',
    'AM':  '8A (Am)',  'A MINOR': '8A (Am)',  '8A': '8A (Am)',
    'EM':  '9A (Em)',  'E MINOR': '9A (Em)',  '9A': '9A (Em)',
    'BM':  '10A (Bm)', 'B MINOR': '10A (Bm)', '10A': '10A (Bm)',
    'F#M': '11A (F#m)','GBM': '11A (F#m)',    'F# MINOR': '11A (F#m)', 'GB MINOR': '11A (F#m)', '11A': '11A (F#m)',
    'C#M': '12A (C#m)','DBM': '12A (C#m)',    'C# MINOR': '12A (C#m)', 'DB MINOR': '12A (C#m)', '12A': '12A (C#m)',

    // Major Keys (B)
    'B':   '1B (B)',   'B MAJ': '1B (B)',   'B MAJOR': '1B (B)',   '1B': '1B (B)',
    'F#':  '2B (F#)',  'GB': '2B (Gb)',     'F# MAJOR': '2B (F#)', 'GB MAJOR': '2B (Gb)', '2B': '2B (F#)',
    'DB':  '3B (Db)',  'C#': '3B (C#)',     'DB MAJOR': '3B (Db)', 'C# MAJOR': '3B (C#)', '3B': '3B (Db)',
    'AB':  '4B (Ab)',  'G#': '4B (Ab)',     'AB MAJOR': '4B (Ab)', 'G# MAJOR': '4B (Ab)', '4B': '4B (Ab)',
    'EB':  '5B (Eb)',  'D#': '5B (Eb)',     'EB MAJOR': '5B (Eb)', 'D# MAJOR': '5B (Eb)', '5B': '5B (Eb)',
    'BB':  '6B (Bb)',  'A#': '6B (Bb)',     'BB MAJOR': '6B (Bb)', 'A# MAJOR': '6B (Bb)', '6B': '6B (Bb)',
    'F':   '7B (F)',   'F MAJ': '7B (F)',   'F MAJOR': '7B (F)',   '7B': '7B (F)',
    'C':   '8B (C)',   'C MAJ': '8B (C)',   'C MAJOR': '8B (C)',   '8B': '8B (C)',
    'G':   '9B (G)',   'G MAJ': '9B (G)',   'G MAJOR': '9B (G)',   '9B': '9B (G)',
    'D':   '10B (D)',  'D MAJ': '10B (D)',  'D MAJOR': '10B (D)',  '10B': '10B (D)',
    'A':   '11B (A)',  'A MAJ': '11B (A)',  'A MAJOR': '11B (A)',  '11B': '11B (A)',
    'E':   '12B (E)',  'E MAJ': '12B (E)',  'E MAJOR': '12B (E)',  '12B': '12B (E)'
  };

  function normalizeKey(rawKey) {
    if (!rawKey) return null;
    const clean = String(rawKey).trim().toUpperCase().replace(/[\/\\()\[\]]/g, ' ').replace(/\s+/g, ' ');
    
    // Direct match
    if (CAMELOT_KEY_MAP[clean]) return CAMELOT_KEY_MAP[clean];

    // Check if rawKey already has Camelot format e.g. "8A" or "11B"
    const camelotMatch = clean.match(/\b([1-9]|1[0-2])[AB]\b/);
    if (camelotMatch && CAMELOT_KEY_MAP[camelotMatch[0]]) {
      return CAMELOT_KEY_MAP[camelotMatch[0]];
    }

    // Try without spaces or symbols
    const simplified = clean.replace(/MAJ(OR)?/g, '').replace(/MIN(OR)?/g, 'M').replace(/\s+/g, '');
    if (CAMELOT_KEY_MAP[simplified]) return CAMELOT_KEY_MAP[simplified];

    return rawKey.trim();
  }

  function decodeString(buffer, encoding) {
    try {
      if (encoding === 0) { // ISO-8859-1
        let str = '';
        for (let i = 0; i < buffer.length; i++) {
          if (buffer[i] === 0) break;
          str += String.fromCharCode(buffer[i]);
        }
        return str;
      } else if (encoding === 1) { // UTF-16 with BOM
        return new TextDecoder('utf-16').decode(buffer).replace(/\0+$/, '');
      } else if (encoding === 2) { // UTF-16BE
        return new TextDecoder('utf-16be').decode(buffer).replace(/\0+$/, '');
      } else if (encoding === 3) { // UTF-8
        return new TextDecoder('utf-8').decode(buffer).replace(/\0+$/, '');
      }
    } catch (_) {}
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/\0+$/, '');
  }

  function parseID3v2(buffer) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 10) return null;

    // Check ID3 header magic
    if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
      return null;
    }

    const version = view.getUint8(3); // 2, 3, or 4
    const flags = view.getUint8(5);
    // Synchsafe integer size
    const tagSize = ((view.getUint8(6) & 0x7F) << 21) |
                    ((view.getUint8(7) & 0x7F) << 14) |
                    ((view.getUint8(8) & 0x7F) << 7)  |
                     (view.getUint8(9) & 0x7F);

    let offset = 10;
    // Check extended header flag (bit 6)
    if (flags & 0x40 && version >= 3) {
      const extSize = view.getUint32(offset);
      offset += (version === 4) ? 4 : extSize;
    }

    const metadata = {};
    const maxOffset = Math.min(buffer.byteLength, 10 + tagSize);

    while (offset < maxOffset - 8) {
      if (view.getUint8(offset) === 0) break; // padding reached

      let frameId = '';
      let frameSize = 0;
      let headerLen = 10;

      if (version === 2) { // ID3v2.2 (3-char frame IDs, 3-byte size)
        frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2));
        frameSize = (view.getUint8(offset+3) << 16) | (view.getUint8(offset+4) << 8) | view.getUint8(offset+5);
        headerLen = 6;
      } else { // ID3v2.3 & ID3v2.4
        frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3));
        if (version === 4) {
          frameSize = ((view.getUint8(offset+4) & 0x7F) << 21) |
                      ((view.getUint8(offset+5) & 0x7F) << 14) |
                      ((view.getUint8(offset+6) & 0x7F) << 7)  |
                       (view.getUint8(offset+7) & 0x7F);
        } else {
          frameSize = view.getUint32(offset + 4);
        }
        headerLen = 10;
      }

      if (frameSize <= 0 || offset + headerLen + frameSize > buffer.byteLength) break;

      const frameData = new Uint8Array(buffer, offset + headerLen, frameSize);
      const encoding = frameData.length > 0 ? frameData[0] : 0;
      const contentBytes = frameData.subarray(1);
      const textContent = decodeString(contentBytes, encoding).trim();

      switch (frameId) {
        case 'TIT2': case 'TT2':
          metadata.title = textContent;
          break;
        case 'TPE1': case 'TP1':
          metadata.artist = textContent;
          break;
        case 'TALB': case 'TAL':
          metadata.album = textContent;
          break;
        case 'TBPM': case 'TBP': {
          const bpmNum = parseFloat(textContent);
          if (!isNaN(bpmNum) && bpmNum > 40 && bpmNum < 240) {
            metadata.bpm = bpmNum;
          }
          break;
        }
        case 'TKEY': case 'TKE':
          metadata.key = normalizeKey(textContent);
          break;
        case 'APIC': {
          try {
            const enc = frameData[0];
            let mimeEnd = 1;
            while (mimeEnd < frameData.length && frameData[mimeEnd] !== 0) mimeEnd++;
            let mimeType = decodeString(frameData.subarray(1, mimeEnd), 0).trim();
            if (!mimeType || mimeType === 'image/' || mimeType === '-->') mimeType = 'image/jpeg';

            let descOffset = mimeEnd + 2; // skip pictureType byte
            let imgStart = descOffset;

            if (enc === 1 || enc === 2) {
              while (descOffset < frameData.length - 1) {
                if (frameData[descOffset] === 0 && frameData[descOffset + 1] === 0) {
                  imgStart = descOffset + 2;
                  break;
                }
                descOffset += 2;
              }
            } else {
              while (descOffset < frameData.length) {
                if (frameData[descOffset] === 0) {
                  imgStart = descOffset + 1;
                  break;
                }
                descOffset++;
              }
            }

            if (imgStart < frameData.length) {
              const imageBytes = frameData.slice(imgStart);
              if (imageBytes.length > 64) {
                const blob = new Blob([imageBytes], { type: mimeType });
                metadata.artworkBlob = blob;
                metadata.artworkUrl = URL.createObjectURL(blob);
              }
            }
          } catch (e) {
            console.warn('APIC artwork parsing error:', e);
          }
          break;
        }
        case 'PIC': {
          try {
            const fmt = String.fromCharCode(frameData[1], frameData[2], frameData[3]).toUpperCase();
            const mimeType = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
            let descOffset = 5;
            let imgStart = descOffset;
            while (descOffset < frameData.length) {
              if (frameData[descOffset] === 0) {
                imgStart = descOffset + 1;
                break;
              }
              descOffset++;
            }
            if (imgStart < frameData.length) {
              const imageBytes = frameData.slice(imgStart);
              if (imageBytes.length > 64) {
                const blob = new Blob([imageBytes], { type: mimeType });
                metadata.artworkBlob = blob;
                metadata.artworkUrl = URL.createObjectURL(blob);
              }
            }
          } catch (e) {
            console.warn('PIC artwork parsing error:', e);
          }
          break;
        }
        case 'TXXX': {
          const fullText = decodeString(contentBytes, encoding);
          const parts = fullText.split('\0');
          if (parts.length >= 2) {
            const desc = parts[0].toUpperCase().trim();
            const val = parts[1].trim();
            if ((desc === 'INITIALKEY' || desc === 'KEY') && !metadata.key) {
              metadata.key = normalizeKey(val);
            } else if (desc === 'BPM' && !metadata.bpm) {
              const bpmVal = parseFloat(val);
              if (!isNaN(bpmVal) && bpmVal > 40 && bpmVal < 240) metadata.bpm = bpmVal;
            }
          }
          break;
        }
      }

      offset += headerLen + frameSize;
    }

    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  function parseID3v1(buffer) {
    if (buffer.byteLength < 128) return null;
    const offset = buffer.byteLength - 128;
    const bytes = new Uint8Array(buffer, offset, 128);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
    if (magic !== 'TAG') return null;

    function readStr(start, len) {
      let str = '';
      for (let i = start; i < start + len; i++) {
        if (bytes[i] === 0) break;
        str += String.fromCharCode(bytes[i]);
      }
      return str.trim();
    }

    const title = readStr(3, 30);
    const artist = readStr(33, 30);
    const album = readStr(63, 30);

    const meta = {};
    if (title) meta.title = title;
    if (artist) meta.artist = artist;
    if (album) meta.album = album;
    return Object.keys(meta).length > 0 ? meta : null;
  }

  function parseMP4Cover(buffer) {
    try {
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length - 16; i++) {
        // Find 'covr'
        if (bytes[i] === 0x63 && bytes[i+1] === 0x6F && bytes[i+2] === 0x76 && bytes[i+3] === 0x72) {
          for (let j = i + 4; j < Math.min(bytes.length - 16, i + 48); j++) {
            // Find 'data' inside covr
            if (bytes[j] === 0x64 && bytes[j+1] === 0x61 && bytes[j+2] === 0x74 && bytes[j+3] === 0x61) {
              const view = new DataView(buffer, j - 4);
              const dataSize = view.getUint32(0);
              const typeFlag = bytes[j + 7]; // 13 = JPEG, 14 = PNG
              const mimeType = typeFlag === 14 ? 'image/png' : 'image/jpeg';
              const imgStart = j + 12;
              const imgEnd = Math.min(bytes.length, (j - 4) + dataSize);
              if (imgEnd > imgStart + 64) {
                const imgBytes = bytes.slice(imgStart, imgEnd);
                const blob = new Blob([imgBytes], { type: mimeType });
                return {
                  artworkBlob: blob,
                  artworkUrl: URL.createObjectURL(blob)
                };
              }
            }
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function parseFLACPicture(buffer) {
    try {
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);
      if (bytes[0] !== 0x66 || bytes[1] !== 0x4C || bytes[2] !== 0x61 || bytes[3] !== 0x43) return null; // 'fLaC'

      let offset = 4;
      while (offset < buffer.byteLength - 4) {
        const header = view.getUint8(offset);
        const isLast = (header & 0x80) !== 0;
        const blockType = header & 0x7F;
        const blockSize = (view.getUint8(offset + 1) << 16) | (view.getUint8(offset + 2) << 8) | view.getUint8(offset + 3);
        offset += 4;

        if (blockType === 6) { // PICTURE BLOCK
          const picView = new DataView(buffer, offset);
          const mimeLen = picView.getUint32(4);
          let mime = '';
          for (let m = 0; m < mimeLen; m++) mime += String.fromCharCode(bytes[offset + 8 + m]);
          const descLen = picView.getUint32(8 + mimeLen);
          const dataLenOffset = 8 + mimeLen + 4 + descLen + 16;
          const dataLen = picView.getUint32(dataLenOffset);
          const dataStart = offset + dataLenOffset + 4;
          const imgBytes = bytes.slice(dataStart, dataStart + dataLen);
          if (imgBytes.length > 64) {
            const blob = new Blob([imgBytes], { type: mime || 'image/jpeg' });
            return { artworkBlob: blob, artworkUrl: URL.createObjectURL(blob) };
          }
        }

        offset += blockSize;
        if (isLast) break;
      }
    } catch (_) {}
    return null;
  }

  function parseVorbisComment(buffer) {
    try {
      const bytes = new Uint8Array(buffer);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const meta = {};

      const titleMatch = text.match(/TITLE=([^\x00\r\n]+)/i);
      if (titleMatch) meta.title = titleMatch[1].trim();

      const artistMatch = text.match(/ARTIST=([^\x00\r\n]+)/i);
      if (artistMatch) meta.artist = artistMatch[1].trim();

      const albumMatch = text.match(/ALBUM=([^\x00\r\n]+)/i);
      if (albumMatch) meta.album = albumMatch[1].trim();

      const bpmMatch = text.match(/BPM=([0-9.]+)/i);
      if (bpmMatch) {
        const bpm = parseFloat(bpmMatch[1]);
        if (!isNaN(bpm) && bpm > 40 && bpm < 240) meta.bpm = bpm;
      }

      const keyMatch = text.match(/(?:INITIALKEY|KEY)=([^\x00\r\n]+)/i);
      if (keyMatch) meta.key = normalizeKey(keyMatch[1]);

      return Object.keys(meta).length > 0 ? meta : null;
    } catch (_) {
      return null;
    }
  }

  function parseFilename(fileName) {
    const cleanName = fileName.replace(/\.[^/.]+$/, "").trim();
    const dashMatch = cleanName.match(/^(.+?)\s*[-_–—]\s*(.+)$/);
    if (dashMatch) {
      return {
        artist: dashMatch[1].trim(),
        title: dashMatch[2].trim()
      };
    }

    return {
      title: cleanName,
      artist: 'Unknown Artist'
    };
  }

  /**
   * Reads metadata and embedded cover art directly from a File or Blob object
   */
  async function parseFile(file) {
    if (!file) return null;

    let id3Data = null;
    let artworkUrl = null;
    let artworkBlob = null;

    try {
      // Read first 1MB to capture ID3v2 header and embedded album art
      const headerSlice = file.slice(0, Math.min(file.size, 1048576));
      const headerBuffer = await headerSlice.arrayBuffer();

      // 1. Try ID3v2 (MP3 / WAV)
      id3Data = parseID3v2(headerBuffer);
      if (id3Data && id3Data.artworkUrl) {
        artworkUrl = id3Data.artworkUrl;
        artworkBlob = id3Data.artworkBlob;
      }

      // 2. Try MP4 Cover if M4A/AAC
      if (!artworkUrl && file.name.match(/\.(m4a|aac|mp4)$/i)) {
        const mp4Cover = parseMP4Cover(headerBuffer);
        if (mp4Cover) {
          artworkUrl = mp4Cover.artworkUrl;
          artworkBlob = mp4Cover.artworkBlob;
        }
      }

      // 3. Try FLAC Picture Block
      if (!artworkUrl && file.name.match(/\.flac$/i)) {
        const flacPic = parseFLACPicture(headerBuffer);
        if (flacPic) {
          artworkUrl = flacPic.artworkUrl;
          artworkBlob = flacPic.artworkBlob;
        }
      }

      // 4. Try Vorbis Comment (FLAC / OGG)
      if (!id3Data && file.name.match(/\.(flac|ogg)$/i)) {
        id3Data = parseVorbisComment(headerBuffer);
      }

      // 5. Try ID3v1 from file tail if MP3
      if (!id3Data && file.size > 128 && file.name.match(/\.mp3$/i)) {
        const tailSlice = file.slice(file.size - 128, file.size);
        const tailBuffer = await tailSlice.arrayBuffer();
        id3Data = parseID3v1(tailBuffer);
      }
    } catch (err) {
      console.warn('Metadata parsing error for', file.name, err);
    }

    const fnMeta = parseFilename(file.name);
    return {
      title: (id3Data && id3Data.title) ? id3Data.title : fnMeta.title,
      artist: (id3Data && id3Data.artist) ? id3Data.artist : fnMeta.artist,
      album: (id3Data && id3Data.album) ? id3Data.album : '',
      bpm: (id3Data && id3Data.bpm) ? id3Data.bpm : null,
      key: (id3Data && id3Data.key) ? id3Data.key : null,
      artworkUrl: artworkUrl || null,
      artworkBlob: artworkBlob || null,
      hasTags: !!(id3Data && (id3Data.title || id3Data.artist || id3Data.bpm || id3Data.key || artworkUrl))
    };
  }

  return {
    parseFile,
    normalizeKey,
    CAMELOT_KEY_MAP
  };
})();

/**
 * AudioDSPAnalyzer — Fast Web Audio DSP Tempo & Harmonic Key Analyzer
 */
const AudioDSPAnalyzer = (function() {
  'use strict';

  // Standard Krumhansl-Kessler key profiles for 12 Major & 12 Minor keys
  const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const PITCH_TO_CAMELOT_MAJOR = {
    'C': '8B (C)', 'C#': '3B (C#)', 'D': '10B (D)', 'D#': '5B (Eb)',
    'E': '12B (E)', 'F': '7B (F)', 'F#': '2B (F#)', 'G': '9B (G)',
    'G#': '4B (Ab)', 'A': '11B (A)', 'A#': '6B (Bb)', 'B': '1B (B)'
  };

  const PITCH_TO_CAMELOT_MINOR = {
    'C': '5A (Cm)', 'C#': '12A (C#m)', 'D': '7A (Dm)', 'D#': '2A (Ebm)',
    'E': '9A (Em)', 'F': '4A (Fm)', 'F#': '11A (F#m)', 'G': '6A (Gm)',
    'G#': '1A (Abm)', 'A': '8A (Am)', 'A#': '3A (Bbm)', 'B': '10A (Bm)'
  };

  function pearsonCorrelation(x, y) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    const n = 12;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }
    const num = (n * sumXY) - (sumX * sumY);
    const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
    return den === 0 ? 0 : num / den;
  }

  function analyzeBPM(audioBuffer) {
    if (!audioBuffer || audioBuffer.duration <= 0) return 124.0;

    try {
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      
      const analyzeSeconds = Math.min(40, audioBuffer.duration * 0.7);
      const startOffsetSec = Math.max(0, (audioBuffer.duration - analyzeSeconds) * 0.4);
      const startSample = Math.floor(startOffsetSec * sampleRate);
      const sampleLength = Math.floor(analyzeSeconds * sampleRate);
      const endSample = Math.min(channelData.length, startSample + sampleLength);

      const downsampleFactor = Math.max(1, Math.floor(sampleRate / 4410));
      const targetRate = sampleRate / downsampleFactor;
      const downsampledLen = Math.floor((endSample - startSample) / downsampleFactor);
      const downsampled = new Float32Array(downsampledLen);

      for (let i = 0, src = startSample; i < downsampledLen; i++, src += downsampleFactor) {
        downsampled[i] = channelData[src];
      }

      const rc = 1.0 / (2.0 * Math.PI * 150);
      const dt = 1.0 / targetRate;
      const alpha = dt / (rc + dt);
      let prev = 0;
      for (let i = 0; i < downsampled.length; i++) {
        prev = prev + alpha * (downsampled[i] - prev);
        downsampled[i] = prev;
      }

      const frameSize = Math.floor(targetRate * 0.02);
      const numFrames = Math.floor(downsampled.length / frameSize);
      const energy = new Float32Array(numFrames);

      for (let f = 0; f < numFrames; f++) {
        let sum = 0;
        const offset = f * frameSize;
        for (let i = 0; i < frameSize; i++) {
          const v = downsampled[offset + i];
          sum += v * v;
        }
        energy[f] = Math.sqrt(sum / frameSize);
      }

      const onsets = new Float32Array(numFrames);
      for (let f = 1; f < numFrames; f++) {
        const diff = energy[f] - energy[f - 1];
        onsets[f] = diff > 0 ? diff : 0;
      }

      const minBpm = 68;
      const maxBpm = 175;
      const minLag = Math.floor(3000 / maxBpm);
      const maxLag = Math.ceil(3000 / minBpm);

      let bestLag = minLag;
      let maxCorr = -1;

      for (let lag = minLag; lag <= maxLag; lag++) {
        let corr = 0;
        const count = numFrames - lag;
        for (let i = 0; i < count; i++) {
          corr += onsets[i] * onsets[i + lag];
        }
        if (corr > maxCorr) {
          maxCorr = corr;
          bestLag = lag;
        }
      }

      const rawBpm = (3000 / bestLag);
      let finalBpm = rawBpm;
      if (finalBpm < 85) finalBpm *= 2;
      if (finalBpm > 175) finalBpm /= 2;

      return Math.round(finalBpm * 10) / 10;
    } catch (err) {
      console.warn('DSP BPM analysis fallback:', err);
      return 124.0;
    }
  }

  function analyzeKey(audioBuffer) {
    if (!audioBuffer || audioBuffer.duration <= 0) return '8A (Am)';

    try {
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      
      const analyzeSeconds = Math.min(30, audioBuffer.duration * 0.7);
      const startOffsetSec = Math.max(0, (audioBuffer.duration - analyzeSeconds) * 0.35);
      const startSample = Math.floor(startOffsetSec * sampleRate);
      const sampleLength = Math.floor(analyzeSeconds * sampleRate);
      const endSample = Math.min(channelData.length, startSample + sampleLength);

      const chroma = new Float32Array(12);
      const step = 64;
      for (let s = startSample; s < endSample - 256; s += step) {
        const val = Math.abs(channelData[s]);
        if (val < 0.02) continue;

        for (let pitch = 0; pitch < 12; pitch++) {
          for (let oct = 2; oct <= 5; oct++) {
            const freq = 440 * Math.pow(2, (pitch - 9 + (oct - 4) * 12) / 12);
            const k = (2 * Math.PI * freq) / sampleRate;
            const samp = channelData[s];
            const samp1 = channelData[s + 1];
            chroma[pitch] += Math.abs(samp * Math.cos(k * s) - samp1 * Math.sin(k * (s + 1)));
          }
        }
      }

      let maxChroma = 0;
      for (let i = 0; i < 12; i++) {
        if (chroma[i] > maxChroma) maxChroma = chroma[i];
      }
      if (maxChroma > 0) {
        for (let i = 0; i < 12; i++) chroma[i] /= maxChroma;
      }

      let bestCamelot = '8A (Am)';
      let bestCorrelation = -2;

      for (let root = 0; root < 12; root++) {
        const majorShifted = new Float32Array(12);
        const minorShifted = new Float32Array(12);
        for (let i = 0; i < 12; i++) {
          majorShifted[i] = MAJOR_PROFILE[(i - root + 12) % 12];
          minorShifted[i] = MINOR_PROFILE[(i - root + 12) % 12];
        }

        const rMaj = pearsonCorrelation(chroma, majorShifted);
        if (rMaj > bestCorrelation) {
          bestCorrelation = rMaj;
          bestCamelot = PITCH_TO_CAMELOT_MAJOR[PITCH_NAMES[root]] || `${PITCH_NAMES[root]} Maj`;
        }

        const rMin = pearsonCorrelation(chroma, minorShifted);
        if (rMin > bestCorrelation) {
          bestCorrelation = rMin;
          bestCamelot = PITCH_TO_CAMELOT_MINOR[PITCH_NAMES[root]] || `${PITCH_NAMES[root]}m`;
        }
      }

      return bestCamelot;
    } catch (err) {
      console.warn('DSP Key analysis fallback:', err);
      return '8A (Am)';
    }
  }

  return {
    analyzeBPM,
    analyzeKey,
    PITCH_NAMES
  };
})();
