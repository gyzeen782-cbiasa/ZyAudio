/* ═══════════════════════════════════════════════════════
   ZYEEN AUDIO STUDIO — audio.js
   Web Audio API engine.
   KEY DESIGN: param changes update nodes IN-PLACE.
   Audio NEVER stops/restarts when user moves sliders.
   ═══════════════════════════════════════════════════════ */

// strict mode inside IIFE

const ZyAudio = (() => {

  /* ── STATE ───────────────────────────────────────── */
  let ctx         = null;   // AudioContext
  let rawBuffer   = null;   // original decoded buffer
  let sourceNode  = null;
  let isPlaying   = false;
  let startedAt   = 0;      // ctx.currentTime when play started
  let pausedAt    = 0;      // offset inside buffer where we paused

  /* ── NODES (created once, kept alive) ─────────────── */
  let gainNode        = null;
  let analyserNode    = null;
  let eqFilters       = [];     // 9 BiquadFilterNodes
  let dryBus          = null;

  // FX nodes
  let reverbConv      = null;
  let reverbWetGain   = null;
  let reverbDryGain   = null;
  let delayNode       = null;
  let delayFeedback   = null;
  let delayWetGain    = null;
  let waveShaperNode  = null;
  let distWetGain     = null;
  let chorusDelay1    = null;
  let chorusDelay2    = null;
  let chorusWetGain   = null;
  let chorusOsc1      = null;
  let chorusOsc2      = null;
  let phaserFilters   = [];
  let phaserWetGain   = null;

  let graphBuilt = false;

  /* ── PARAMS (live state) ─────────────────────────── */
  const P = {
    speed:  1.0,
    pitch:  0,       // semitones (applied on export via resample)
    volume: 1.0,
    eq:     new Array(9).fill(0),
    reverb: { on: false, val: 0 },
    echo:   { on: false, val: 0 },
    dist:   { on: false, val: 0 },
    chorus: { on: false, val: 0 },
    phaser: { on: false, val: 0 },
  };

  const EQ_FREQS = [60, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  /* ── INIT CONTEXT ────────────────────────────────── */
  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  /* ── BUILD FULL GRAPH (called once per file load) ── */
  function buildGraph() {
    if (!ctx || !rawBuffer) return;

    // ── Gain + analyser (always on) ──
    gainNode = ctx.createGain();
    gainNode.gain.value = P.volume;

    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.78;

    // ── 9-band EQ ──
    eqFilters = EQ_FREQS.map((freq, i) => {
      const f = ctx.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : i === 8 ? 'highshelf' : 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.2;
      f.gain.value = P.eq[i];
      return f;
    });
    // chain EQ
    for (let i = 0; i < eqFilters.length - 1; i++) {
      eqFilters[i].connect(eqFilters[i + 1]);
    }

    // ── Dry bus (after EQ) ──
    dryBus = ctx.createGain();
    dryBus.gain.value = 1;
    eqFilters[eqFilters.length - 1].connect(dryBus);

    // ── Reverb ──
    reverbConv    = ctx.createConvolver();
    reverbWetGain = ctx.createGain();
    reverbDryGain = ctx.createGain(); // unused but keeps symmetry
    _updateReverb();
    dryBus.connect(reverbConv);
    reverbConv.connect(reverbWetGain);
    reverbWetGain.connect(gainNode);

    // ── Delay / Echo ──
    delayNode     = ctx.createDelay(5.0);
    delayFeedback = ctx.createGain();
    delayWetGain  = ctx.createGain();
    _updateEcho();
    dryBus.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);   // feedback loop
    delayNode.connect(delayWetGain);
    delayWetGain.connect(gainNode);

    // ── Distortion ──
    waveShaperNode = ctx.createWaveShaper();
    waveShaperNode.oversample = '4x';
    distWetGain = ctx.createGain();
    _updateDist();
    dryBus.connect(waveShaperNode);
    waveShaperNode.connect(distWetGain);
    distWetGain.connect(gainNode);

    // ── Chorus ──
    chorusDelay1  = ctx.createDelay(0.1);
    chorusDelay2  = ctx.createDelay(0.1);
    chorusWetGain = ctx.createGain();
    chorusOsc1 = ctx.createOscillator();
    chorusOsc2 = ctx.createOscillator();
    const cMod1 = ctx.createGain();
    const cMod2 = ctx.createGain();
    chorusOsc1.frequency.value = 1.1;
    chorusOsc2.frequency.value = 0.85;
    cMod1.gain.value = 0.003;
    cMod2.gain.value = 0.004;
    chorusOsc1.connect(cMod1); cMod1.connect(chorusDelay1.delayTime);
    chorusOsc2.connect(cMod2); cMod2.connect(chorusDelay2.delayTime);
    chorusOsc1.start(); chorusOsc2.start();
    _updateChorus();
    dryBus.connect(chorusDelay1);
    dryBus.connect(chorusDelay2);
    chorusDelay1.connect(chorusWetGain);
    chorusDelay2.connect(chorusWetGain);
    chorusWetGain.connect(gainNode);

    // ── Phaser (4 allpass filters in series) ──
    phaserFilters = [];
    for (let i = 0; i < 4; i++) {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 350 + i * 180;
      ap.Q.value = 8;
      phaserFilters.push(ap);
    }
    for (let i = 0; i < phaserFilters.length - 1; i++) {
      phaserFilters[i].connect(phaserFilters[i + 1]);
    }
    phaserWetGain = ctx.createGain();
    _updatePhaser();
    dryBus.connect(phaserFilters[0]);
    phaserFilters[phaserFilters.length - 1].connect(phaserWetGain);
    phaserWetGain.connect(gainNode);

    // ── Dry path ──
    dryBus.connect(gainNode);

    // ── Output ──
    gainNode.connect(analyserNode);
    analyserNode.connect(ctx.destination);

    graphBuilt = true;
  }

  /* ── CREATE + START SOURCE ───────────────────────── */
  function _createSource(offset = 0) {
    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = rawBuffer;
    sourceNode.playbackRate.value = P.speed;
    sourceNode.connect(eqFilters[0]);

    sourceNode.onended = () => {
      if (isPlaying) {
        // Natural end
        isPlaying = false;
        pausedAt  = 0;
        Events.emit('ended');
      }
    };

    sourceNode.start(0, offset);
    startedAt = ctx.currentTime - offset;
  }

  /* ── INTERNAL FX UPDATES (no audio restart) ─────── */
  function _updateReverb() {
    if (!reverbConv || !reverbWetGain) return;
    const amt = P.reverb.on ? P.reverb.val / 100 : 0;
    if (amt > 0) {
      reverbConv.buffer = _makeImpulse(2.5 * amt + 0.4, 2.2);
    }
    reverbWetGain.gain.setTargetAtTime(amt * 0.65, ctx.currentTime, 0.05);
  }

  function _updateEcho() {
    if (!delayNode || !delayFeedback || !delayWetGain) return;
    const amt = P.echo.on ? P.echo.val / 100 : 0;
    delayNode.delayTime.setTargetAtTime(0.08 + 0.32 * amt, ctx.currentTime, 0.05);
    delayFeedback.gain.setTargetAtTime(0.45 * amt, ctx.currentTime, 0.05);
    delayWetGain.gain.setTargetAtTime(amt * 0.65, ctx.currentTime, 0.05);
  }

  function _updateDist() {
    if (!waveShaperNode || !distWetGain) return;
    const amt = P.dist.on ? P.dist.val / 100 : 0;
    waveShaperNode.curve = _makeDistCurve(amt * 380 + 1);
    distWetGain.gain.setTargetAtTime(amt * 0.55, ctx.currentTime, 0.05);
  }

  function _updateChorus() {
    if (!chorusWetGain) return;
    const amt = P.chorus.on ? P.chorus.val / 100 : 0;
    chorusDelay1.delayTime.setTargetAtTime(0.020 + 0.005 * amt, ctx.currentTime, 0.05);
    chorusDelay2.delayTime.setTargetAtTime(0.026 + 0.006 * amt, ctx.currentTime, 0.05);
    chorusWetGain.gain.setTargetAtTime(amt * 0.42, ctx.currentTime, 0.05);
  }

  function _updatePhaser() {
    if (!phaserWetGain) return;
    const amt = P.phaser.on ? P.phaser.val / 100 : 0;
    phaserFilters.forEach((f, i) => {
      f.Q.value = 0.5 + 14 * amt;
      f.frequency.setTargetAtTime(200 + i * 220 + amt * 400, ctx.currentTime, 0.05);
    });
    phaserWetGain.gain.setTargetAtTime(amt * 0.48, ctx.currentTime, 0.05);
  }

  function _makeImpulse(duration, decay) {
    const len = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function _makeDistCurve(amount) {
    const n = 512;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  /* ── PUBLIC API ──────────────────────────────────── */

  /** Load an audio File object */
  async function load(file) {
    ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    // Stop any current playback cleanly
    if (isPlaying) _stopSource();

    const arrayBuf = await file.arrayBuffer();
    rawBuffer = await ctx.decodeAudioData(arrayBuf);

    graphBuilt = false;
    buildGraph();

    pausedAt  = 0;
    isPlaying = false;

    return rawBuffer;
  }

  /** Play from current pause position */
  function play() {
    if (!rawBuffer || !graphBuilt) return;
    ensureCtx();
    ctx.resume();

    if (isPlaying) return; // already playing

    _createSource(pausedAt);
    isPlaying = true;
    Events.emit('play');
  }

  /** Pause – keeps position */
  function pause() {
    if (!isPlaying) return;
    pausedAt = _currentOffset();
    _stopSource();
    isPlaying = false;
    Events.emit('pause');
  }

  /** Stop – resets to beginning */
  function stop() {
    pausedAt = 0;
    if (isPlaying) _stopSource();
    isPlaying = false;
    Events.emit('stop');
  }

  /** Seek to position in seconds */
  function seek(sec) {
    if (!rawBuffer) return;
    const wasPlaying = isPlaying;
    const dur = rawBuffer.duration;
    pausedAt = Math.max(0, Math.min(sec, dur - 0.01));

    if (isPlaying) {
      _stopSource(false);  // don't fire ended
      _createSource(pausedAt);
    }
  }

  function _stopSource(fireEnded = true) {
    if (sourceNode) {
      sourceNode.onended = null; // prevent ghost fire
      try { sourceNode.stop(); } catch (_) {}
      sourceNode.disconnect();
      sourceNode = null;
    }
    isPlaying = false;
  }

  function _currentOffset() {
    if (!isPlaying || !ctx) return pausedAt;
    const elapsed = ctx.currentTime - startedAt;
    const dur = rawBuffer ? rawBuffer.duration / P.speed : 0;
    return Math.min(elapsed, dur - 0.001);
  }

  /* ── LIVE PARAMETER SETTERS (no restart) ─────────── */

  function setSpeed(val) {
    P.speed = val;
    if (sourceNode) sourceNode.playbackRate.setTargetAtTime(val, ctx.currentTime, 0.04);
  }

  function setPitch(semitones) {
    P.pitch = semitones;
    // Pitch via detune (cents). Both live and export use the same method.
    if (sourceNode) {
      sourceNode.detune.setTargetAtTime(semitones * 100, ctx.currentTime, 0.04);
    }
  }

  function setVolume(pct) {
    P.volume = pct / 100;
    if (gainNode) gainNode.gain.setTargetAtTime(P.volume, ctx.currentTime, 0.04);
  }

  function setEQ(band, db) {
    P.eq[band] = db;
    if (eqFilters[band]) eqFilters[band].gain.setTargetAtTime(db, ctx.currentTime, 0.04);
  }

  function setFX(name, on, val) {
    P[name] = { on, val };
    switch (name) {
      case 'reverb': _updateReverb(); break;
      case 'echo':   _updateEcho();   break;
      case 'dist':   _updateDist();   break;
      case 'chorus': _updateChorus(); break;
      case 'phaser': _updatePhaser(); break;
    }
  }

  /* ── GETTERS ─────────────────────────────────────── */
  function getPosition()   { return _currentOffset(); }
  function getDuration()   { return rawBuffer ? rawBuffer.duration / P.speed : 0; }
  function getRawDuration(){ return rawBuffer ? rawBuffer.duration : 0; }
  function getIsPlaying()  { return isPlaying; }
  function getAnalyser()   { return analyserNode; }
  function getRawBuffer()  { return rawBuffer; }
  function getParams()     { return P; }
  function getCtx()        { return ctx; }

  /* ── OFFLINE RENDER (export) ─────────────────────── */
  async function render(onProgress) {
    if (!rawBuffer) throw new Error('No audio loaded');

    ensureCtx();

    // Correct output length: raw samples / speed + tail for FX decay
    // (OfflineAudioContext renders exactly outLen samples regardless of playbackRate)
    const speedFactor = P.speed;
    const sRate       = rawBuffer.sampleRate;
    const numCh       = rawBuffer.numberOfChannels;
    const tailSamples = Math.ceil(sRate * 0.8); // 0.8s tail for reverb/echo decay
    const outLen      = Math.ceil(rawBuffer.length / speedFactor) + tailSamples;

    const off = new OfflineAudioContext(numCh, outLen, sRate);

    // Gain
    const oGain = off.createGain();
    oGain.gain.value = P.volume;

    // EQ
    const oEQ = EQ_FREQS.map((freq, i) => {
      const f = off.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : i === 8 ? 'highshelf' : 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.2;
      f.gain.value = P.eq[i];
      return f;
    });
    for (let i = 0; i < oEQ.length - 1; i++) oEQ[i].connect(oEQ[i + 1]);

    const oDry = off.createGain();
    oDry.gain.value = 1;
    oEQ[oEQ.length - 1].connect(oDry);
    oDry.connect(oGain);

    // Reverb
    const rAmt = P.reverb.on ? P.reverb.val / 100 : 0;
    if (rAmt > 0) {
      const oRev = off.createConvolver();
      const oRevWet = off.createGain();
      oRev.buffer = _makeImpulseFor(off, 2.5 * rAmt + 0.4, 2.2);
      oRevWet.gain.value = rAmt * 0.65;
      oDry.connect(oRev);
      oRev.connect(oRevWet);
      oRevWet.connect(oGain);
    }

    // Echo
    const eAmt = P.echo.on ? P.echo.val / 100 : 0;
    if (eAmt > 0) {
      const oDly = off.createDelay(5);
      const oFB  = off.createGain();
      const oDlyW = off.createGain();
      oDly.delayTime.value = 0.08 + 0.32 * eAmt;
      oFB.gain.value  = 0.45 * eAmt;
      oDlyW.gain.value = eAmt * 0.65;
      oDry.connect(oDly);
      oDly.connect(oFB);
      oFB.connect(oDly);
      oDly.connect(oDlyW);
      oDlyW.connect(oGain);
    }

    // Distortion
    const dAmt = P.dist.on ? P.dist.val / 100 : 0;
    if (dAmt > 0) {
      const oWS = off.createWaveShaper();
      const oDW = off.createGain();
      oWS.curve = _makeDistCurve(dAmt * 380 + 1);
      oWS.oversample = '4x';
      oDW.gain.value = dAmt * 0.55;
      oDry.connect(oWS);
      oWS.connect(oDW);
      oDW.connect(oGain);
    }

    // Chorus
    const cAmt = P.chorus.on ? P.chorus.val / 100 : 0;
    if (cAmt > 0) {
      const oCD1 = off.createDelay(0.1);
      const oCD2 = off.createDelay(0.1);
      const oCW  = off.createGain();
      oCD1.delayTime.value = 0.022;
      oCD2.delayTime.value = 0.028;
      oCW.gain.value = cAmt * 0.42;
      oDry.connect(oCD1); oDry.connect(oCD2);
      oCD1.connect(oCW);  oCD2.connect(oCW);
      oCW.connect(oGain);
    }

    // Phaser
    const phAmt = P.phaser.on ? P.phaser.val / 100 : 0;
    if (phAmt > 0) {
      const oPFs = [];
      for (let i = 0; i < 4; i++) {
        const ap = off.createBiquadFilter();
        ap.type = 'allpass';
        ap.frequency.value = 200 + i * 220 + phAmt * 400;
        ap.Q.value = 0.5 + 14 * phAmt;
        oPFs.push(ap);
      }
      for (let i = 0; i < oPFs.length - 1; i++) oPFs[i].connect(oPFs[i + 1]);
      const oPW = off.createGain();
      oPW.gain.value = phAmt * 0.48;
      oDry.connect(oPFs[0]);
      oPFs[oPFs.length - 1].connect(oPW);
      oPW.connect(oGain);
    }

    oGain.connect(off.destination);

    // Source — use detune for pitch (IDENTICAL to live preview behaviour)
    // detune in cents: semitones * 100
    // This ensures export sounds EXACTLY like the live preview
    const oSrc = off.createBufferSource();
    oSrc.buffer = rawBuffer;
    oSrc.playbackRate.value = speedFactor;
    oSrc.detune.value = P.pitch * 100; // semitones → cents, same as live
    oSrc.connect(oEQ[0]);
    oSrc.start(0);

    onProgress && onProgress(20, 'Rendering audio...');
    const rendered = await off.startRendering();

    onProgress && onProgress(90, 'Encoding...');
    await _sleep(30);

    return rendered; // no extra pitch resample step needed
  }

  function _makeImpulseFor(offCtx, duration, decay) {
    const len = Math.ceil(offCtx.sampleRate * duration);
    const buf = offCtx.createBuffer(2, len, offCtx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function _pitchShift(buf, semitones) {
    const ratio  = Math.pow(2, semitones / 12);
    const newLen = Math.round(buf.length / ratio);
    const out = new AudioBuffer({
      numberOfChannels: buf.numberOfChannels,
      length: Math.max(1, newLen),
      sampleRate: buf.sampleRate,
    });
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const inp = buf.getChannelData(c);
      const op  = out.getChannelData(c);
      for (let i = 0; i < newLen; i++) {
        const pos  = i * ratio;
        const lo   = Math.floor(pos);
        const hi   = Math.min(lo + 1, inp.length - 1);
        const frac = pos - lo;
        op[i] = inp[lo] * (1 - frac) + inp[hi] * frac;
      }
    }
    return out;
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── SIMPLE EVENT BUS ────────────────────────────── */
  const Events = (() => {
    const listeners = {};
    return {
      on(evt, fn)     { (listeners[evt] = listeners[evt] || []).push(fn); },
      off(evt, fn)    { listeners[evt] = (listeners[evt] || []).filter(f => f !== fn); },
      emit(evt, data) { (listeners[evt] || []).forEach(fn => fn(data)); },
    };
  })();

  /* ── EXPOSE ──────────────────────────────────────── */
  return {
    load, play, pause, stop, seek,
    setSpeed, setPitch, setVolume, setEQ, setFX,
    getPosition, getDuration, getRawDuration,
    getIsPlaying, getAnalyser, getRawBuffer,
    getParams, getCtx,
    render,
    on:  Events.on.bind(Events),
    off: Events.off.bind(Events),
    EQ_FREQS,
  };

})();
