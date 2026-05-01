/* ═══════════════════════════════════════════════════════
   ZYEEN AUDIO STUDIO — ui.js
   DOM interactions, canvas drawing, slider styling
   ═══════════════════════════════════════════════════════ */

// strict mode inside IIFE

const ZyUI = (() => {

  const $ = id => document.getElementById(id);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const fmt = s => {
    if (isNaN(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  /* ── TOAST ───────────────────────────────────────── */
  function toast(msg, type = 'info') {
    const wrap = $('toastWrap');
    const el = document.createElement('div');
    el.className = `toast ${type === 'success' ? 'ok' : type === 'error' ? 'err' : ''}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
    el.innerHTML = `<span>${icon}</span> ${msg}`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3100);
  }

  /* ── PROGRESS ────────────────────────────────────── */
  function showProgress(pct, text) {
    const ov = $('progressOverlay');
    ov.classList.add('visible');
    ov.setAttribute('aria-hidden', 'false');
    $('pbBar').style.width = pct + '%';
    $('pbPct').textContent = pct + '%';
    if (text) $('pbSub').textContent = text;
  }
  function hideProgress() {
    $('progressOverlay').classList.remove('visible');
    $('progressOverlay').setAttribute('aria-hidden', 'true');
  }

  /* ── STATUS ──────────────────────────────────────── */
  function setStatus(state, label) {
    const dot = $('sfDot');
    const lbl = $('sfLabel');
    if (dot) dot.className = 'sf-dot ' + (state || '');
    if (lbl) lbl.textContent = label || 'Ready';
  }

  /* ── SLIDER FILL ─────────────────────────────────── */
  function styleSlider(el) {
    if (!el) return;
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    const val = parseFloat(el.value);
    const pct = ((val - min) / (max - min)) * 100;
    el.style.background =
      `linear-gradient(90deg, var(--cyan) ${pct}%, var(--bg3) ${pct}%)`;
  }

  function initSlider(el, onChange) {
    el.addEventListener('input', () => {
      styleSlider(el);
      onChange(parseFloat(el.value));
    });
    styleSlider(el);
  }

  /* ── WAVEFORM ────────────────────────────────────── */
  function drawWaveform(audioBuffer) {
    const canvas = $('waveCanvas');
    if (!canvas || !audioBuffer) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth  || 600;
    const H = canvas.clientHeight || 80;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / W);
    const mid  = H / 2;

    const grad = c.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0,    'rgba(0,232,255,0.85)');
    grad.addColorStop(0.45, 'rgba(157,78,221,0.85)');
    grad.addColorStop(0.55, 'rgba(157,78,221,0.85)');
    grad.addColorStop(1,    'rgba(0,232,255,0.85)');

    c.clearRect(0, 0, W, H);
    c.beginPath();
    for (let i = 0; i < W; i++) {
      let mn = 0, mx = 0;
      for (let j = 0; j < step; j++) {
        const s = data[i * step + j] || 0;
        if (s < mn) mn = s;
        if (s > mx) mx = s;
      }
      if (i === 0) c.moveTo(i, mid + mn * mid * 0.88);
      c.lineTo(i, mid + mn * mid * 0.88);
      c.lineTo(i, mid + mx * mid * 0.88);
    }
    c.strokeStyle = grad;
    c.lineWidth   = 1.2;
    c.stroke();

    const fill = c.createLinearGradient(0, 0, 0, H);
    fill.addColorStop(0, 'rgba(0,232,255,0.05)');
    fill.addColorStop(1, 'rgba(157,78,221,0.05)');
    c.fillStyle = fill;
    c.fill();
  }

  /* ── SPECTRUM ────────────────────────────────────── */
  function drawSpectrum(analyser) {
    const canvas = $('specCanvas');
    if (!canvas || !analyser) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth  || 600;
    const H = canvas.clientHeight || 44;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    c.clearRect(0, 0, W, H);

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const barW = (W / data.length) * 2.2;
    const g = c.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0,   'rgba(0,232,255,0.9)');
    g.addColorStop(0.5, 'rgba(157,78,221,0.8)');
    g.addColorStop(1,   'rgba(255,45,120,0.75)');
    c.fillStyle = g;
    for (let i = 0; i < data.length; i++) {
      const bH = (data[i] / 255) * H;
      c.fillRect(i * barW * 2, H - bH, Math.max(barW - 1, 1), bH);
    }
  }

  /* ── EQ BOARD ────────────────────────────────────── */
  const EQ_LABELS = ['60Hz','125Hz','250Hz','500Hz','1kHz','2kHz','4kHz','8kHz','16kHz'];

  function buildEQBoard(onBandChange) {
    const board = $('eqBoard');
    if (!board) return;
    board.innerHTML = '';
    EQ_LABELS.forEach((label, i) => {
      const band = document.createElement('div');
      band.className = 'eq-band';
      band.innerHTML = `
        <div class="eq-val" id="eqVal${i}">0</div>
        <div class="eq-vert-wrap">
          <input type="range" class="slider" id="eqSld${i}"
            min="-12" max="12" step="0.5" value="0"
            aria-label="${label} EQ gain" />
        </div>
        <div class="eq-freq">${label}</div>`;
      board.appendChild(band);
    });

    EQ_LABELS.forEach((_, i) => {
      const sld = $(`eqSld${i}`);
      initSlider(sld, val => {
        const v = Math.round(val * 2) / 2;
        const el = $(`eqVal${i}`);
        if (el) el.textContent = (v >= 0 ? '+' : '') + v.toFixed(1);
        onBandChange(i, v);
        clearEQActiveChip();
      });
    });
  }

  function setEQBand(i, db) {
    const sld = $(`eqSld${i}`);
    const val = $(`eqVal${i}`);
    if (sld) { sld.value = db; styleSlider(sld); }
    if (val) val.textContent = (db >= 0 ? '+' : '') + db.toFixed(1);
  }

  function clearEQActiveChip() {
    $$('#eqPresetRow .chip').forEach(c => c.classList.remove('active'));
  }

  function setEQActiveChip(name) {
    $$('#eqPresetRow .chip').forEach(c =>
      c.classList.toggle('active', c.dataset.eq === name));
  }

  /* ── FX LIST ─────────────────────────────────────── */
  const FX_DEFS = [
    { id: 'reverb', label: 'Reverb' },
    { id: 'echo',   label: 'Echo / Delay' },
    { id: 'dist',   label: 'Distortion' },
    { id: 'chorus', label: 'Chorus' },
    { id: 'phaser', label: 'Phaser' },
  ];

  function buildFXList(onToggle, onVal) {
    const list = $('fxList');
    if (!list) return;
    list.innerHTML = '';
    FX_DEFS.forEach(({ id, label }) => {
      const item = document.createElement('div');
      item.className = 'fx-item';
      item.innerHTML = `
        <div class="fx-header">
          <div class="fx-toggle" id="fxTog-${id}" role="switch"
               aria-checked="false" aria-label="${label} toggle" tabindex="0"></div>
          <span class="fx-name" id="fxLbl-${id}">${label}</span>
          <span class="fx-val"  id="fxVal-${id}">0%</span>
        </div>
        <div class="fx-slider">
          <input type="range" class="slider" id="fxSld-${id}"
            min="0" max="100" step="1" value="0"
            aria-label="${label} amount" />
        </div>`;
      list.appendChild(item);
    });

    FX_DEFS.forEach(({ id }) => {
      const tog = $(`fxTog-${id}`);
      const sld = $(`fxSld-${id}`);
      const valEl = $(`fxVal-${id}`);
      const lbl = $(`fxLbl-${id}`);

      const doToggle = () => {
        const isOn = tog.classList.toggle('on');
        if (lbl) lbl.classList.toggle('on', isOn);
        tog.setAttribute('aria-checked', isOn.toString());
        onToggle(id, isOn, parseInt(sld.value));
      };

      tog.addEventListener('click', doToggle);
      tog.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doToggle(); }
      });

      initSlider(sld, v => {
        if (valEl) valEl.textContent = Math.round(v) + '%';
        if (!tog.classList.contains('on')) {
          tog.classList.add('on');
          if (lbl) lbl.classList.add('on');
          tog.setAttribute('aria-checked', 'true');
        }
        onVal(id, Math.round(v));
      });
    });
  }

  function setFXState(id, on, val) {
    const tog = $(`fxTog-${id}`);
    const lbl = $(`fxLbl-${id}`);
    const sld = $(`fxSld-${id}`);
    const valEl = $(`fxVal-${id}`);
    if (!tog) return;
    tog.classList.toggle('on', on);
    if (lbl) lbl.classList.toggle('on', on);
    tog.setAttribute('aria-checked', on.toString());
    if (sld) { sld.value = val; styleSlider(sld); }
    if (valEl) valEl.textContent = val + '%';
  }

  /* ── QUICK PRESETS ───────────────────────────────── */
  const PRESET_DEFS = [
    { id: 'nightcore',    emoji: '🌙', label: 'Nightcore' },
    { id: 'slowed',       emoji: '🐌', label: 'Slowed' },
    { id: 'slowedreverb', emoji: '🌊', label: 'Slowed+Reverb' },
    { id: 'deep',         emoji: '🌑', label: 'Deep' },
    { id: 'chipmunk',     emoji: '🐿️', label: 'Chipmunk' },
    { id: 'speedup',      emoji: '⚡', label: 'Speed Up' },
    { id: 'anime',        emoji: '✨', label: 'Anime' },
    { id: 'chill',        emoji: '🎧', label: 'Chill' },
    { id: 'radio',        emoji: '📻', label: 'Radio' },
    { id: 'vaporwave',    emoji: '🌸', label: 'Vaporwave' },
  ];

  function buildPresetGrid(onSelect) {
    const grid = $('presetGrid');
    if (!grid) return;
    grid.innerHTML = '';
    PRESET_DEFS.forEach(({ id, emoji, label }) => {
      const btn = document.createElement('button');
      btn.className   = 'preset-btn';
      btn.dataset.preset = id;
      btn.innerHTML   = `<span class="pb-emoji">${emoji}</span>${label}`;
      btn.addEventListener('click', () => {
        $$('#presetGrid .preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(id);
      });
      grid.appendChild(btn);
    });
  }

  function clearActivePreset() {
    $$('#presetGrid .preset-btn').forEach(b => b.classList.remove('active'));
  }

  /* ── PLAYBACK UI ─────────────────────────────────── */
  function updateSeek(position, duration) {
    const pct = duration > 0 ? Math.min(position / duration, 1) : 0;
    const fill  = $('pcSeekFill');
    const thumb = $('pcSeekThumb');
    if (fill)  fill.style.width = (pct * 100) + '%';
    if (thumb) thumb.style.left = (pct * 100) + '%';
    const cur = $('pcCur');
    const tot = $('pcTot');
    const ph  = $('phTime');
    if (cur) cur.textContent = fmt(position);
    if (tot) tot.textContent = fmt(duration);
    if (ph)  ph.textContent  = `${fmt(position)} / ${fmt(duration)}`;
  }

  function setPlayBtn(isPlaying) {
    const btn = $('pcPlay');
    const tb  = $('tbPlay');
    if (btn) btn.textContent = isPlaying ? '⏸' : '▶';
    if (tb)  tb.textContent  = isPlaying ? '⏸' : '▶';
  }

  function showPlayer(show)    { const el = $('playerCard'); if (el) el.style.display = show ? 'flex' : 'none'; }
  function showStudio(show)    { const el = $('studioGrid'); if (el) el.style.display = show ? 'grid' : 'none'; }
  function showTransport(show) { const el = $('topbarTransport'); if (el) el.style.display = show ? 'flex' : 'none'; }

  function setFileInfo(name, duration, size) {
    const dzIcon  = $('dzIcon');
    const dzTitle = $('dzTitle');
    const dzSub   = $('dzSub');
    const dz      = $('dropZone');
    const tc      = $('topbarCenter');
    if (dzIcon)  dzIcon.textContent  = '✅';
    if (dzTitle) dzTitle.textContent = name;
    if (dzSub)   dzSub.textContent   = `Duration: ${fmt(duration)} · ${(size / 1024 / 1024).toFixed(2)} MB`;
    if (dz)      dz.classList.add('loaded');
    if (tc) tc.innerHTML = `
      <div class="tc-file">
        <span>🎵</span>
        <div><strong>${name}</strong></div>
        <span style="color:var(--cyan);font-family:var(--font-mono);font-size:0.68rem">${fmt(duration)}</span>
      </div>`;
  }

  function setExportEnabled(en) {
    const btn = $('btnExport');
    if (btn) btn.disabled = !en;
  }

  function updateExportMeta(speed, pitch, vol) {
    const el = $('exportMeta');
    if (!el) return;
    el.innerHTML =
      `Speed: <span class="em-val">${speed.toFixed(2)}x</span> · ` +
      `Pitch: <span class="em-val">${pitch >= 0 ? '+' : ''}${pitch}st</span> · ` +
      `Vol: <span class="em-val">${vol}%</span>`;
  }

  /* ── HISTORY ─────────────────────────────────────── */
  const histItems = [];
  function addHistory(name, duration, format) {
    histItems.unshift({
      name, duration, format,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    });
    if (histItems.length > 12) histItems.pop();
    _renderHistory();
    const badge = $('histBadge');
    if (badge) badge.textContent = histItems.length;
  }
  function _renderHistory() {
    const list = $('histList');
    if (!list) return;
    if (!histItems.length) { list.innerHTML = '<div class="hist-empty">No exports yet</div>'; return; }
    list.innerHTML = histItems.map(h => `
      <div class="hist-item">
        <span class="hist-ico">🎵</span>
        <div class="hist-info">
          <div class="hist-name">${h.name}.${h.format.toLowerCase()}</div>
          <div class="hist-meta">${h.format} · ${fmt(h.duration)}</div>
        </div>
        <span class="hist-time">${h.time}</span>
      </div>`).join('');
  }

  /* ── SYNC PROCESSOR UI ───────────────────────────── */
  function syncProcessorUI(speed, pitch, volume) {
    const ss = $('sldSpeed');
    const sp = $('sldPitch');
    const sv = $('sldVolume');
    const vs = $('valSpeed');
    const vp = $('valPitch');
    const vv = $('valVolume');
    if (ss) { ss.value = speed;  styleSlider(ss); }
    if (sp) { sp.value = pitch;  styleSlider(sp); }
    if (sv) { sv.value = volume; styleSlider(sv); }
    if (vs) vs.textContent = parseFloat(speed).toFixed(2) + 'x';
    if (vp) vp.textContent = (pitch >= 0 ? '+' : '') + pitch + ' st';
    if (vv) vv.textContent = volume + '%';
  }

  return {
    toast, showProgress, hideProgress, setStatus,
    styleSlider, initSlider,
    drawWaveform, drawSpectrum,
    buildEQBoard, setEQBand, clearEQActiveChip, setEQActiveChip,
    buildFXList, setFXState,
    buildPresetGrid, clearActivePreset,
    updateSeek, setPlayBtn,
    showPlayer, showStudio, showTransport,
    setFileInfo, setExportEnabled,
    updateExportMeta, addHistory,
    syncProcessorUI,
    fmt, $, $$,
  };

})();
