/* ═══════════════════════════════════════════════════════
   ZYEEN AUDIO STUDIO — main.js  (FIXED v3)
   All ZyUI calls verified against ui.js exports.
   ═══════════════════════════════════════════════════════ */

(function App() {

  let currentFileName = '';
  let exportFormat    = 'wav';
  let rafId           = null;

  /* ── EQ PRESETS ──────────────────────────────────── */
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

  /* ── QUICK PRESETS ───────────────────────────────── */
  const QUICK_PRESETS = {
    nightcore:    { speed:1.25, pitch: 3,  vol:100, eq:'treble', reverb:0,  echo:0,  dist:0,  chorus:0,  phaser:0  },
    slowed:       { speed:0.80, pitch:-2,  vol:100, eq:'bass',   reverb:0,  echo:0,  dist:0,  chorus:0,  phaser:0  },
    slowedreverb: { speed:0.80, pitch:-2,  vol: 90, eq:'bass',   reverb:65, echo:20, dist:0,  chorus:0,  phaser:0  },
    deep:         { speed:0.88, pitch:-4,  vol:100, eq:'bass',   reverb:22, echo:0,  dist:6,  chorus:0,  phaser:0  },
    chipmunk:     { speed:1.55, pitch: 5,  vol:100, eq:'treble', reverb:0,  echo:0,  dist:0,  chorus:12, phaser:0  },
    speedup:      { speed:1.35, pitch: 0,  vol:100, eq:'flat',   reverb:0,  echo:0,  dist:0,  chorus:0,  phaser:0  },
    anime:        { speed:1.10, pitch: 2,  vol:100, eq:'treble', reverb:18, echo:0,  dist:0,  chorus:22, phaser:0  },
    chill:        { speed:0.92, pitch:-1,  vol: 90, eq:'jazz',   reverb:28, echo:18, dist:0,  chorus:12, phaser:0  },
    radio:        { speed:1.00, pitch: 0,  vol:100, eq:'vocal',  reverb:6,  echo:0,  dist:10, chorus:0,  phaser:0  },
    vaporwave:    { speed:0.78, pitch:-3,  vol: 95, eq:'bass',   reverb:48, echo:32, dist:0,  chorus:16, phaser:12 },
  };

  /* ── HELPERS ─────────────────────────────────────── */
  const ge = id => document.getElementById(id);

  /* ── SIDEBAR ─────────────────────────────────────── */
  function initSidebar() {
    const sidebar  = ge('sidebar');
    const overlay  = ge('sidebarOverlay');
    const ham      = ge('hamburger');

    function open()  {
      sidebar.classList.add('open');
      overlay.classList.add('visible');
      ham.classList.add('open');
      ham.setAttribute('aria-expanded','true');
    }
    function close() {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
      ham.classList.remove('open');
      ham.setAttribute('aria-expanded','false');
    }

    ham.addEventListener('click', () =>
      sidebar.classList.contains('open') ? close() : open()
    );
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.querySelectorAll('.nav-item').forEach(el =>
      el.addEventListener('click', () => { if (window.innerWidth <= 768) close(); })
    );
  }

  /* ── DROP ZONE ───────────────────────────────────── */
  function initDropZone() {
    const dz = ge('dropZone');
    const fi = ge('fileInput');

    const openFile = () => fi.click();
    dz.addEventListener('click',   openFile);
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openFile(); });
    ge('btnOpenTop').addEventListener('click', openFile);
    ge('navOpenFile').addEventListener('click', openFile);

    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag'); });
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fi.addEventListener('change', e => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
      e.target.value = '';
    });
  }

  /* ── SEEK BAR ────────────────────────────────────── */
  function initSeekBar() {
    const bar = ge('pcSeek');
    if (!bar) return;
    let drag = false;

    function pct(e) {
      const r = bar.getBoundingClientRect();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      return Math.max(0, Math.min(1, (x - r.left) / r.width));
    }
    function seek(e) {
      const p   = pct(e);
      const dur = ZyAudio.getDuration();
      const sec = p * dur;
      ZyAudio.seek(sec);
      ZyUI.updateSeek(sec, dur);
      if (ZyAudio.getIsPlaying()) startRAF();
    }

    bar.addEventListener('mousedown',  e => { drag = true; seek(e); });
    bar.addEventListener('touchstart', e => { drag = true; seek(e); }, {passive:true});
    window.addEventListener('mousemove',  e => { if (drag) seek(e); });
    window.addEventListener('touchmove',  e => { if (drag) seek(e); }, {passive:true});
    window.addEventListener('mouseup',    () => { drag = false; });
    window.addEventListener('touchend',   () => { drag = false; });
  }

  /* ── INIT ────────────────────────────────────────── */
  function init() {
    initSidebar();
    initDropZone();
    initSeekBar();

    // Format buttons
    document.querySelectorAll('.fmt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        exportFormat = btn.dataset.fmt;
        const note = ge('fmtNote');
        if (note) note.style.display = exportFormat === 'mp3' ? 'block' : 'none';
      });
    });

    // EQ board
    ZyUI.buildEQBoard((band, db) => {
      ZyAudio.setEQ(band, db);
      ZyUI.clearEQActiveChip();
      ZyUI.clearActivePreset();
    });

    // EQ preset chips
    document.querySelectorAll('#eqPresetRow .chip').forEach(chip => {
      chip.addEventListener('click', () => applyEQPreset(chip.dataset.eq));
    });

    // FX list
    ZyUI.buildFXList(
      (id, on, val) => ZyAudio.setFX(id, on, val),
      (id, val)     => ZyAudio.setFX(id, true, val)
    );

    // Preset grid
    ZyUI.buildPresetGrid(handleQuickPreset);

    // Processor sliders
    ZyUI.initSlider(ge('sldSpeed'), val => {
      ge('valSpeed').textContent = parseFloat(val).toFixed(2) + 'x';
      ZyAudio.setSpeed(val);
      ZyUI.clearActivePreset();
      syncExportMeta();
    });
    ZyUI.initSlider(ge('sldPitch'), val => {
      const s = parseInt(val);
      ge('valPitch').textContent = (s >= 0 ? '+' : '') + s + ' st';
      ZyAudio.setPitch(s);
      ZyUI.clearActivePreset();
      syncExportMeta();
    });
    ZyUI.initSlider(ge('sldVolume'), val => {
      ge('valVolume').textContent = Math.round(val) + '%';
      ZyAudio.setVolume(val);
      ZyUI.clearActivePreset();
      syncExportMeta();
    });

    // Playback
    ge('pcPlay').addEventListener('click', togglePlay);
    ge('pcStop').addEventListener('click', handleStop);
    ge('tbPlay').addEventListener('click', togglePlay);
    ge('tbStop').addEventListener('click', handleStop);

    // Compare
    ge('btnOrig').addEventListener('click', () => {
      ge('btnOrig').classList.add('active');
      ge('btnProc').classList.remove('active');
      ZyUI.toast('Preview: Original', 'info');
    });
    ge('btnProc').addEventListener('click', () => {
      ge('btnProc').classList.add('active');
      ge('btnOrig').classList.remove('active');
      ZyUI.toast('Preview: Processed', 'info');
    });

    // Reset & export
    ge('btnReset').addEventListener('click', resetAll);
    ge('navResetAll').addEventListener('click', resetAll);
    ge('btnExport').addEventListener('click', handleExport);

    // ZyAudio events
    ZyAudio.on('play',  () => { ZyUI.setPlayBtn(true);  ZyUI.setStatus('playing', 'Playing'); });
    ZyAudio.on('pause', () => { ZyUI.setPlayBtn(false); ZyUI.setStatus('ready',   'Paused'); });
    ZyAudio.on('stop',  () => {
      ZyUI.setPlayBtn(false);
      ZyUI.setStatus('ready', 'Stopped');
      ZyUI.updateSeek(0, ZyAudio.getDuration());
      stopRAF();
    });
    ZyAudio.on('ended', () => {
      ZyUI.setPlayBtn(false);
      ZyUI.setStatus('ready', 'Ready');
      ZyUI.updateSeek(0, ZyAudio.getDuration());
      stopRAF();
    });

    window.addEventListener('resize', () => {
      if (ZyAudio.getRawBuffer()) ZyUI.drawWaveform(ZyAudio.getRawBuffer());
    });

    ZyUI.setStatus('ready', 'Ready');
    console.log('%c🎵 Zyeen Audio Studio — OK', 'color:#00e8ff;font-family:monospace;font-weight:bold');
  }

  /* ── FILE LOAD ───────────────────────────────────── */
  async function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['mp3','wav','ogg','flac','aac','m4a'].includes(ext) && !file.type.startsWith('audio/')) {
      ZyUI.toast('Format tidak didukung', 'error');
      return;
    }

    ge('dzIcon').textContent  = '⏳';
    ge('dzTitle').textContent = 'Memuat...';
    ge('dzSub').textContent   = 'Decoding audio file...';

    try {
      const buf = await ZyAudio.load(file);

      currentFileName = file.name.replace(/\.[^.]+$/, '');
      const en = ge('exportName');
      if (en) en.value = currentFileName;

      // Drop zone update
      ge('dzIcon').textContent  = '✅';
      ge('dzTitle').textContent = file.name;
      ge('dzSub').textContent   = `Duration: ${ZyUI.fmt(buf.duration)} · ${(file.size/1024/1024).toFixed(2)} MB`;
      ge('dropZone').classList.add('loaded');

      // Topbar
      const tc = ge('topbarCenter');
      if (tc) tc.innerHTML = `<div class="tc-file"><span>🎵</span><strong title="${file.name}">${file.name}</strong><span class="tc-dur">${ZyUI.fmt(buf.duration)}</span></div>`;
      ZyUI.showTransport(true);

      // Reveal panels
      ZyUI.showPlayer(true);
      ZyUI.showStudio(true);

      ZyUI.drawWaveform(buf);
      ZyUI.updateSeek(0, buf.duration);
      ZyUI.setExportEnabled(true);
      ZyUI.setStatus('ready', 'Ready');
      ZyUI.toast('File dimuat! ✓', 'success');

    } catch (err) {
      ge('dzIcon').textContent  = '❌';
      ge('dzTitle').textContent = 'Gagal memuat';
      ge('dzSub').textContent   = 'Coba MP3, WAV, atau OGG';
      ge('dropZone').classList.remove('loaded');
      ZyUI.toast('Error: ' + err.message, 'error');
      console.error(err);
    }
  }

  /* ── PLAYBACK ─────────────────────────────────────── */
  function togglePlay() {
    if (!ZyAudio.getRawBuffer()) { ZyUI.toast('Upload file dulu!', 'error'); return; }
    if (ZyAudio.getIsPlaying()) { ZyAudio.pause(); stopRAF(); }
    else                         { ZyAudio.play();  startRAF(); }
  }

  function handleStop() { ZyAudio.stop(); stopRAF(); }

  function startRAF() {
    stopRAF();
    (function loop() {
      if (!ZyAudio.getIsPlaying()) return;
      ZyUI.updateSeek(ZyAudio.getPosition(), ZyAudio.getDuration());
      ZyUI.drawSpectrum(ZyAudio.getAnalyser());
      rafId = requestAnimationFrame(loop);
    })();
  }
  function stopRAF() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ── EQ ──────────────────────────────────────────── */
  function applyEQPreset(name) {
    const vals = EQ_PRESETS[name];
    if (!vals) return;
    vals.forEach((db, i) => { ZyUI.setEQBand(i, db); ZyAudio.setEQ(i, db); });
    ZyUI.setEQActiveChip(name);
  }

  /* ── QUICK PRESET ────────────────────────────────── */
  function handleQuickPreset(id) {
    const p = QUICK_PRESETS[id];
    if (!p) return;

    ZyUI.syncProcessorUI(p.speed, p.pitch, p.vol);
    ZyAudio.setSpeed(p.speed);
    ZyAudio.setPitch(p.pitch);
    ZyAudio.setVolume(p.vol);

    applyEQPreset(p.eq);

    ['reverb','echo','dist','chorus','phaser'].forEach(key => {
      const v = p[key], on = v > 0;
      ZyUI.setFXState(key, on, v);
      ZyAudio.setFX(key, on, v);
    });

    syncExportMeta();
    ZyUI.toast(`"${id}" applied ✓`, 'success');
  }

  /* ── RESET ───────────────────────────────────────── */
  function resetAll() {
    ZyUI.syncProcessorUI(1.0, 0, 100);
    ZyAudio.setSpeed(1.0);
    ZyAudio.setPitch(0);
    ZyAudio.setVolume(100);
    applyEQPreset('flat');
    ['reverb','echo','dist','chorus','phaser'].forEach(id => {
      ZyUI.setFXState(id, false, 0);
      ZyAudio.setFX(id, false, 0);
    });
    ZyUI.clearActivePreset();
    syncExportMeta();
    ZyUI.toast('Reset ✓', 'success');
  }

  function syncExportMeta() {
    const p = ZyAudio.getParams();
    ZyUI.updateExportMeta(p.speed, p.pitch, Math.round(p.volume * 100));
  }

  /* ── EXPORT ──────────────────────────────────────── */
  async function handleExport() {
    if (!ZyAudio.getRawBuffer()) { ZyUI.toast('Tidak ada audio!', 'error'); return; }
    const btn = ge('btnExport');
    btn.disabled = true;

    try {
      ZyUI.showProgress(5, 'Memulai render...');
      const rendered = await ZyAudio.render((pct, text) => ZyUI.showProgress(pct, text));

      ZyUI.showProgress(95, 'Encoding WAV...');
      await new Promise(r => setTimeout(r, 80));

      const blob = encodeWAV(rendered);
      const name = (ge('exportName').value.trim() || currentFileName || 'zyeen_export').replace(/[^\w\-_.]/g,'_');
      downloadBlob(blob, name + '.wav');

      ZyUI.showProgress(100, 'Selesai!');
      await new Promise(r => setTimeout(r, 500));
      ZyUI.hideProgress();
      ZyUI.addHistory(name, rendered.duration, 'WAV');
      ZyUI.toast('Export selesai! 🎉', 'success');

    } catch (err) {
      ZyUI.hideProgress();
      ZyUI.toast('Export gagal: ' + err.message, 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  /* ── WAV ENCODER ─────────────────────────────────── */
  function encodeWAV(buf) {
    const nCh = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
    const blk = nCh * 2, dSz = len * blk;
    const ab = new ArrayBuffer(44 + dSz), dv = new DataView(ab);
    let o = 0;
    const str = s => { for (let i=0;i<s.length;i++) { dv.setUint8(o++, s.charCodeAt(i)); } };
    const u16 = v => { dv.setUint16(o,v,true); o+=2; };
    const u32 = v => { dv.setUint32(o,v,true); o+=4; };
    const i16 = v => { dv.setInt16(o,v,true);  o+=2; };
    str('RIFF'); u32(36+dSz); str('WAVE');
    str('fmt '); u32(16); u16(1); u16(nCh);
    u32(sr); u32(sr*blk); u16(blk); u16(16);
    str('data'); u32(dSz);
    const ch = Array.from({length:nCh}, (_,c) => buf.getChannelData(c));
    for (let i=0;i<len;i++) for (let c=0;c<nCh;c++) {
      const s2 = Math.max(-1,Math.min(1,ch[c][i]));
      i16(s2<0 ? s2*0x8000 : s2*0x7FFF);
    }
    return new Blob([ab], {type:'audio/wav'});
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  /* ── BOOT ─────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
