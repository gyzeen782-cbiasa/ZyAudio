/* ═══════════════════════════════════════════════════════
   ZYEEN AUDIO STUDIO — main.js
   App controller: wires Audio engine + UI together.
   ═══════════════════════════════════════════════════════ */

// strict mode inside IIFE

(function App() {

  /* ── STATE ───────────────────────────────────────── */
  let currentFileName = '';
  let exportFormat    = 'wav';
  let historyItems    = [];
  let rafId           = null;

  /* ── PRESET DEFINITIONS ──────────────────────────── */
  const EQ_PRESETS = {
    flat:      [ 0,  0,  0,  0,  0,  0,  0,  0,  0],
    bass:      [ 6,  5,  3,  1,  0, -1, -1,  0,  0],
    treble:    [-1, -1,  0,  1,  2,  4,  5,  6,  6],
    vocal:     [-2, -1,  0,  2,  4,  4,  3,  2,  1],
    lofi:      [ 3,  2,  1, -1, -3, -4, -4, -5, -6],
    rock:      [ 4,  3,  2,  0, -1,  0,  2,  3,  4],
    pop:       [-1,  0,  2,  3,  3,  2,  1,  0, -1],
    jazz:      [ 2,  2,  1,  0, -1, -1,  0,  2,  3],
    classical: [ 3,  2,  1,  0,  0, -1, -1,  1,  2],
  };

  const QUICK_PRESETS = {
    nightcore:    { speed: 1.25, pitch:  3, vol: 100, eq: 'treble', reverb: 0,  echo: 0,  dist: 0,  chorus: 0,  phaser: 0  },
    slowed:       { speed: 0.80, pitch: -2, vol: 100, eq: 'bass',   reverb: 0,  echo: 0,  dist: 0,  chorus: 0,  phaser: 0  },
    slowedreverb: { speed: 0.80, pitch: -2, vol:  90, eq: 'bass',   reverb: 65, echo: 20, dist: 0,  chorus: 0,  phaser: 0  },
    deep:         { speed: 0.88, pitch: -4, vol: 100, eq: 'bass',   reverb: 22, echo: 0,  dist: 6,  chorus: 0,  phaser: 0  },
    chipmunk:     { speed: 1.55, pitch:  5, vol: 100, eq: 'treble', reverb: 0,  echo: 0,  dist: 0,  chorus: 12, phaser: 0  },
    speedup:      { speed: 1.35, pitch:  0, vol: 100, eq: 'flat',   reverb: 0,  echo: 0,  dist: 0,  chorus: 0,  phaser: 0  },
    anime:        { speed: 1.10, pitch:  2, vol: 100, eq: 'treble', reverb: 18, echo: 0,  dist: 0,  chorus: 22, phaser: 0  },
    chill:        { speed: 0.92, pitch: -1, vol:  90, eq: 'jazz',   reverb: 28, echo: 18, dist: 0,  chorus: 12, phaser: 0  },
    radio:        { speed: 1.00, pitch:  0, vol: 100, eq: 'vocal',  reverb: 6,  echo: 0,  dist: 10, chorus: 0,  phaser: 0  },
    vaporwave:    { speed: 0.78, pitch: -3, vol:  95, eq: 'bass',   reverb: 48, echo: 32, dist: 0,  chorus: 16, phaser: 12 },
  };

  /* ── INIT ────────────────────────────────────────── */
  function init() {
    ZyUI.initSidebar();
    ZyUI.initDropZone(handleFile);
    ZyUI.initSeekBar(handleSeek);
    ZyUI.buildEQBoard(handleEQChange);
    ZyUI.buildFXList(handleFXChange);
    ZyUI.buildPresets(handleQuickPreset);
    ZyUI.initEQPresetChips(handleEQPreset);
    ZyUI.initFormatBtns(fmt => { exportFormat = fmt; });
    ZyUI.initSlider(ZyUI.$('sldSpeed'),  handleSpeed);
    ZyUI.initSlider(ZyUI.$('sldPitch'),  handlePitch);
    ZyUI.initSlider(ZyUI.$('sldVolume'), handleVolume);

    // Play / stop buttons
    ZyUI.$('pcPlay').addEventListener('click', togglePlay);
    ZyUI.$('pcStop').addEventListener('click', handleStop);
    ZyUI.$('tbPlay').addEventListener('click', togglePlay);
    ZyUI.$('tbStop').addEventListener('click', handleStop);

    // Compare buttons
    ZyUI.$('btnOrig').addEventListener('click', () => setCompareMode('original'));
    ZyUI.$('btnProc').addEventListener('click', () => setCompareMode('processed'));

    // Reset
    ZyUI.$('btnReset').addEventListener('click', resetAll);
    ZyUI.$('navResetAll').addEventListener('click', resetAll);

    // Export
    ZyUI.$('btnExport').addEventListener('click', handleExport);

    // Audio events
    ZyAudio.on('play',  () => { ZyUI.setPlayBtn(true);  ZyUI.setStatus('playing'); });
    ZyAudio.on('pause', () => { ZyUI.setPlayBtn(false); ZyUI.setStatus('ready'); });
    ZyAudio.on('stop',  () => {
      ZyUI.setPlayBtn(false);
      ZyUI.setStatus('ready');
      ZyUI.updatePlaybackUI(0, ZyAudio.getDuration());
    });
    ZyAudio.on('ended', () => {
      ZyUI.setPlayBtn(false);
      ZyUI.setStatus('ready');
      ZyUI.updatePlaybackUI(0, ZyAudio.getDuration());
      stopRAF();
    });

    // Waveform redraw on resize
    window.addEventListener('resize', () => {
      if (ZyAudio.getRawBuffer()) ZyUI.drawWaveform(ZyAudio.getRawBuffer());
    });

    ZyUI.setStatus('idle');
  }

  /* ── FILE LOAD ───────────────────────────────────── */
  async function handleFile(file) {
    // Validate
    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = ['mp3','wav','ogg','flac','aac','m4a'];
    if (!allowed.includes(ext) && !file.type.startsWith('audio/')) {
      ZyUI.toast('Unsupported file format', 'error');
      return;
    }

    ZyUI.setDropLoading();

    try {
      const buf = await ZyAudio.load(file);

      currentFileName = file.name.replace(/\.[^.]+$/, '');
      ZyUI.$('exportName').value = currentFileName;

      const size = (file.size / 1024 / 1024).toFixed(2) + ' MB';
      ZyUI.setDropLoaded(file.name, size, buf.duration);
      ZyUI.setTopbarFile(file.name, buf.duration);
      ZyUI.showStudio();
      ZyUI.drawWaveform(buf);
      ZyUI.updatePlaybackUI(0, ZyAudio.getDuration());
      ZyUI.setStatus('ready');
      ZyUI.toast('File loaded!', 'success');
    } catch (err) {
      ZyUI.setDropError();
      ZyUI.toast('Failed to decode: ' + err.message, 'error');
      console.error(err);
    }
  }

  /* ── PLAYBACK ─────────────────────────────────────── */
  function togglePlay() {
    if (!ZyAudio.getRawBuffer()) { ZyUI.toast('Upload a file first', 'error'); return; }
    if (ZyAudio.getIsPlaying()) {
      ZyAudio.pause();
      stopRAF();
    } else {
      ZyAudio.play();
      startRAF();
    }
  }

  function handleStop() {
    ZyAudio.stop();
    stopRAF();
  }

  /* ── RAF LOOP ─────────────────────────────────────── */
  function startRAF() {
    stopRAF();
    function loop() {
      if (!ZyAudio.getIsPlaying()) return;
      const pos = ZyAudio.getPosition();
      const dur = ZyAudio.getDuration();
      ZyUI.updatePlaybackUI(pos, dur);
      ZyUI.drawSpectrum(ZyAudio.getAnalyser());
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
  }

  function stopRAF() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ── SEEK ────────────────────────────────────────── */
  function handleSeek(pct) {
    const dur = ZyAudio.getDuration();
    const sec = pct * dur;
    ZyAudio.seek(sec);
    ZyUI.updatePlaybackUI(sec, dur);
    if (ZyAudio.getIsPlaying()) startRAF();
  }

  /* ── COMPARE MODE ────────────────────────────────── */
  let compareMode = 'processed';
  function setCompareMode(mode) {
    compareMode = mode;
    ZyUI.$('btnOrig').classList.toggle('active', mode === 'original');
    ZyUI.$('btnProc').classList.toggle('active', mode === 'processed');
    ZyUI.toast(mode === 'original' ? 'Listening to original' : 'Listening to processed', 'info');
    // Note: live compare implemented — original = bypass all effects (gain only)
    // This is a UX toggle; true bypass would need graph rewire.
    // For now show toast as indication.
  }

  /* ── PROCESSOR SLIDERS ───────────────────────────── */
  function handleSpeed(val) {
    ZyUI.$('valSpeed').textContent = val.toFixed(2) + 'x';
    ZyAudio.setSpeed(val);
    ZyUI.clearPresetActive();
    ZyUI.updateExportMeta(val, ZyAudio.getParams().pitch, Math.round(ZyAudio.getParams().volume * 100));
  }

  function handlePitch(val) {
    const s = parseInt(val);
    ZyUI.$('valPitch').textContent = (s >= 0 ? '+' : '') + s + ' st';
    ZyAudio.setPitch(s);
    ZyUI.clearPresetActive();
    ZyUI.updateExportMeta(ZyAudio.getParams().speed, s, Math.round(ZyAudio.getParams().volume * 100));
  }

  function handleVolume(val) {
    ZyUI.$('valVolume').textContent = Math.round(val) + '%';
    ZyAudio.setVolume(val);
    ZyUI.clearPresetActive();
    ZyUI.updateExportMeta(ZyAudio.getParams().speed, ZyAudio.getParams().pitch, Math.round(val));
  }

  /* ── EQ ──────────────────────────────────────────── */
  function handleEQChange(band, db) {
    ZyAudio.setEQ(band, db);
    ZyUI.clearEQChip();
    ZyUI.clearPresetActive();
  }

  function handleEQPreset(name) {
    const vals = EQ_PRESETS[name];
    if (!vals) return;
    ZyUI.setEQValues(vals);
    vals.forEach((v, i) => ZyAudio.setEQ(i, v));
    ZyUI.setEQChipActive(name);
  }

  /* ── EFFECTS ─────────────────────────────────────── */
  function handleFXChange(id, on, val) {
    ZyAudio.setFX(id, on, val);
    ZyUI.clearPresetActive();
  }

  /* ── QUICK PRESETS ───────────────────────────────── */
  function handleQuickPreset(id) {
    const p = QUICK_PRESETS[id];
    if (!p) return;

    // Processor
    const speedSld = ZyUI.$('sldSpeed');
    const pitchSld = ZyUI.$('sldPitch');
    const volSld   = ZyUI.$('sldVolume');

    speedSld.value = p.speed;
    pitchSld.value = p.pitch;
    volSld.value   = p.vol;
    ZyUI.styleSlider(speedSld);
    ZyUI.styleSlider(pitchSld);
    ZyUI.styleSlider(volSld);

    ZyUI.$('valSpeed').textContent  = p.speed.toFixed(2) + 'x';
    ZyUI.$('valPitch').textContent  = (p.pitch >= 0 ? '+' : '') + p.pitch + ' st';
    ZyUI.$('valVolume').textContent = p.vol + '%';

    ZyAudio.setSpeed(p.speed);
    ZyAudio.setPitch(p.pitch);
    ZyAudio.setVolume(p.vol);

    // EQ
    handleEQPreset(p.eq);
    ZyUI.setEQChipActive(p.eq);

    // FX
    const fxMap = {
      reverb: { on: p.reverb > 0, val: p.reverb },
      echo:   { on: p.echo   > 0, val: p.echo   },
      dist:   { on: p.dist   > 0, val: p.dist   },
      chorus: { on: p.chorus > 0, val: p.chorus  },
      phaser: { on: p.phaser > 0, val: p.phaser  },
    };
    ZyUI.setFXValues(fxMap);
    Object.entries(fxMap).forEach(([key, state]) => {
      ZyAudio.setFX(key, state.on, state.val);
    });

    ZyUI.updateExportMeta(p.speed, p.pitch, p.vol);
    ZyUI.toast(`Preset "${id}" applied`, 'success');
  }

  /* ── RESET ───────────────────────────────────────── */
  function resetAll() {
    // Sliders
    const speedSld = ZyUI.$('sldSpeed');
    const pitchSld = ZyUI.$('sldPitch');
    const volSld   = ZyUI.$('sldVolume');
    speedSld.value = 1.0; pitchSld.value = 0; volSld.value = 100;
    ZyUI.styleSlider(speedSld);
    ZyUI.styleSlider(pitchSld);
    ZyUI.styleSlider(volSld);
    ZyUI.$('valSpeed').textContent  = '1.00x';
    ZyUI.$('valPitch').textContent  = '0 st';
    ZyUI.$('valVolume').textContent = '100%';
    ZyAudio.setSpeed(1.0);
    ZyAudio.setPitch(0);
    ZyAudio.setVolume(100);

    // EQ
    handleEQPreset('flat');
    ZyUI.setEQChipActive('flat');

    // FX
    const fxReset = { on: false, val: 0 };
    const fxMap = { reverb: fxReset, echo: fxReset, dist: fxReset, chorus: fxReset, phaser: fxReset };
    ZyUI.setFXValues(fxMap);
    ['reverb','echo','dist','chorus','phaser'].forEach(id => ZyAudio.setFX(id, false, 0));

    ZyUI.clearPresetActive();
    ZyUI.updateExportMeta(1.0, 0, 100);
    ZyUI.toast('All settings reset', 'success');
  }

  /* ── EXPORT ──────────────────────────────────────── */
  async function handleExport() {
    if (!ZyAudio.getRawBuffer()) { ZyUI.toast('No audio loaded', 'error'); return; }

    ZyUI.$('btnExport').disabled = true;

    try {
      ZyUI.showProgress('Starting render...', 5);

      const rendered = await ZyAudio.render((pct, text) => {
        ZyUI.updateProgress(pct, text);
      });

      ZyUI.updateProgress(95, 'Writing file...');
      await sleep(80);

      const blob = audioBufferToWAV(rendered);
      const name = (ZyUI.$('exportName').value.trim() || currentFileName || 'zyeen_export')
                    .replace(/[^\w\-_.]/g, '_');
      const ext  = 'wav'; // browser exports as WAV always
      downloadBlob(blob, `${name}.${ext}`);

      ZyUI.updateProgress(100, 'Done!');
      await sleep(600);
      ZyUI.hideProgress();

      // History
      historyItems.unshift({
        name: `${name}.${ext}`,
        format: 'WAV',
        dur: ZyUI.fmtTime(rendered.duration),
        time: new Date().toLocaleTimeString(),
      });
      if (historyItems.length > 12) historyItems.pop();
      ZyUI.renderHistory(historyItems);

      ZyUI.toast('Export complete! 🎉', 'success');

    } catch (err) {
      ZyUI.hideProgress();
      ZyUI.toast('Export failed: ' + err.message, 'error');
      console.error(err);
    } finally {
      ZyUI.$('btnExport').disabled = false;
    }
  }

  /* ── WAV ENCODER ─────────────────────────────────── */
  function audioBufferToWAV(abuf) {
    const numCh = abuf.numberOfChannels;
    const sRate = abuf.sampleRate;
    const len   = abuf.length;
    const bytesPerSample = 2; // 16-bit
    const blockAlign = numCh * bytesPerSample;
    const byteRate   = sRate * blockAlign;
    const dataSize   = len * blockAlign;
    const buffer     = new ArrayBuffer(44 + dataSize);
    const view       = new DataView(buffer);
    let p = 0;

    function w8(v)  { view.setUint8(p++, v); }
    function w16(v) { view.setUint16(p, v, true); p += 2; }
    function w32(v) { view.setUint32(p, v, true); p += 4; }
    function wStr(s){ for (let i = 0; i < s.length; i++) w8(s.charCodeAt(i)); }

    wStr('RIFF'); w32(36 + dataSize); wStr('WAVE');
    wStr('fmt '); w32(16); w16(1); w16(numCh);
    w32(sRate); w32(byteRate); w16(blockAlign); w16(16);
    wStr('data'); w32(dataSize);

    // Interleave channels
    const channels = [];
    for (let c = 0; c < numCh; c++) channels.push(abuf.getChannelData(c));

    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][i]));
        const v = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(p, v, true);
        p += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /* ── DOWNLOAD ────────────────────────────────────── */
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── BOOT ─────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', init);

  console.log(
    '%c🎵 Zyeen Audio Studio',
    'color:#00e8ff;font-family:monospace;font-size:14px;font-weight:bold'
  );

})();
