/* Live captions for one program channel (Day 4 slice).
   Chunked, not realtime: program audio is windowed (≈10 s), encoded to WAV,
   and transcribed through /api/transcribe, so every window is also stored —
   the post-show transcript exists by construction. A failed window marks a
   gap and the loop continues; captions lag live by about a window plus the
   transcribe call. True realtime (WebSocket relay) is the stretch, not the
   promise. YouTube iframes cannot be tapped (no element audio) and refuse
   loudly instead of captioning silence. */
(function (root) {
  'use strict';

  var LS_KEY = 'muselive_captions_v1';
  var RUNS = {}; // key -> {slot, ctx, src, node, timer, buf, lines, lastError, gaps, running}

  // Pure: mono int16 samples + rate → base64 WAV (RIFF, 16-bit PCM).
  function encodeWav(samples, rate) {
    var n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), i;
    function wstr(off, s) { for (var k = 0; k < s.length; k++) v.setUint8(off + k, s.charCodeAt(k)); }
    wstr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE'); wstr(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    wstr(36, 'data'); v.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++) v.setInt16(44 + i * 2, samples[i], true);
    var bin = '', bytes = new Uint8Array(buf);
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return (root.btoa || (typeof btoa !== 'undefined' ? btoa : null)) ? (root.btoa || btoa)(bin) : '';
  }

  function store() {
    try { var s = JSON.parse(root.localStorage.getItem(LS_KEY) || 'null'); if (s) return s; } catch (e) {}
    return {};
  }
  function saveStore(s) { try { root.localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} }
  function pushLine(key, line) {
    var s = store(), arr = s[key] || [];
    arr.push(line); s[key] = arr.slice(-500); saveStore(s);
    var r = RUNS[key]; if (r) r.lines.push(line);
  }
  function lines(key) {
    var r = RUNS[key];
    if (r && r.lines.length) return r.lines.slice();
    return (store()[key] || []).slice();
  }
  function search(key, q) {
    q = String(q || '').toLowerCase();
    if (!q) return [];
    return lines(key).filter(function (l) { return l.text && l.text.toLowerCase().indexOf(q) >= 0; });
  }

  function http() { return root.fetch || (typeof fetch !== 'undefined' ? fetch : null); }
  async function transcribeClip(b64) {
    var F = http();
    if (!F) return { ok: false, error: 'network unavailable' };
    try {
      var r = await F('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64 }) });
      var j = await r.json();
      return j && j.ok ? { ok: true, text: j.transcript } : { ok: false, error: (j && j.error) || ('HTTP ' + (r.status || '?')) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }

  function renderLine(slot, text) {
    try {
      var doc = root.document;
      if (!doc || !doc.querySelector) return;
      var screen = doc.querySelector('[data-hls-slot="' + slot + '"]');
      if (!screen) return;
      var el = screen.querySelector('.ms-cc');
      if (!el) { el = doc.createElement('div'); el.className = 'ms-cc'; el.setAttribute('aria-live', 'polite'); screen.appendChild(el); }
      el.textContent = text;
    } catch (e) {}
  }

  async function flushWindow(key) {
    var r = RUNS[key];
    if (!r || !r.running) return;
    if (!r.buf.length) return;
    var total = 0, i, parts = r.buf.splice(0, r.buf.length);
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var all = new Int16Array(total), off = 0;
    for (i = 0; i < parts.length; i++) { all.set(parts[i], off); off += parts[i].length; }
    var t = await transcribeClip(encodeWav(all, 16000));
    if (t.ok && t.text) {
      var line = { ts: new Date().toISOString(), text: t.text, final: true };
      pushLine(key, line);
      renderLine(r.slot, t.text);
    } else {
      r.gaps++;
      r.lastError = t.error || 'empty transcript';
      pushLine(key, { ts: new Date().toISOString(), text: '', gap: true });
    }
  }

  function start(key, slot, opts) {
    opts = opts || {};
    if (RUNS[key] && RUNS[key].running) return { ok: true, resumed: true };
    var M = root.MuseStreaming, v = null;
    try { v = M && typeof M.videoFor === 'function' ? M.videoFor(slot) : null; } catch (e) { v = null; }
    if (!v) return { ok: false, error: 'No tappable audio for slot ' + slot + ' (YouTube and empty tiles cannot be captioned).' };
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return { ok: false, error: 'Web Audio is unavailable in this browser.' };
    var winSec = Math.min(30, Math.max(5, opts.windowSec || 10));
    var actx = null, src = null;
    try {
      actx = new AC();
      if (actx.state === 'suspended' && actx.resume) { try { actx.resume(); } catch (e) {} }
      src = actx.createMediaElementSource(v);
    } catch (e) {
      // A video element accepts exactly one MediaElementSource in its life:
      // reopening the theater re-taps the same element and throws. Rebuild
      // the player so the retry taps a fresh element; if that is impossible,
      // re-mute and fail silent — never leak raw feed audio to the room.
      if (!opts.retried && M && typeof M.resetSlot === 'function') {
        try { M.resetSlot(slot); } catch (x) {}
        try { v = M.videoFor(slot); if (v) v.muted = false; } catch (x) { v = null; }
        if (v) {
          opts.retried = true;
          try { if (actx && actx.close) actx.close(); } catch (x) {}
          return start(key, slot, opts);
        }
      }
      try { if (actx && actx.close) actx.close(); } catch (x) {}
      try { v.muted = true; } catch (x) {}
      delete RUNS[key];
      return { ok: false, error: 'Audio tap failed: ' + String((e && e.message) || e).slice(0, 160) };
    }
    try {
      var r = RUNS[key] = { slot: slot, ctx: actx, src: src, node: null, timer: 0, buf: [], lines: lines(key), lastError: '', gaps: 0, running: true };
      // The tap feeds the transcription worklet only — it is never routed to the
      // speakers, so program audio (test tones included) stays silent in the room.
      // monitor:true is the one exception: the tap target is the feed the room
      // is listening to, so it stays on the speakers as well as the worklet.
      var ready = actx.audioWorklet ? actx.audioWorklet.addModule('js/muse-cap-worklet.js?v=' + CAPV) : Promise.reject(new Error('no worklet'));
      return { ok: true, pending: true, ready: ready.then(function () {
        var node = new root.AudioWorkletNode(actx, 'muse-cap');
        node.port.onmessage = function (ev) { if (r.running && ev.data) r.buf.push(ev.data); };
        src.connect(node);
        if (opts.monitor) { try { src.connect(actx.destination); } catch (x) {} }
        r.node = node;
        r.timer = root.setInterval ? root.setInterval(function () { flushWindow(key); }, winSec * 1000) : 0;
        return true;
      }).catch(function (e) { r.lastError = String((e && e.message) || e).slice(0, 160); try { v.muted = true; } catch (x) {} return false; }) };
    } catch (e) {
      try { v.muted = true; } catch (x) {}
      delete RUNS[key];
      return { ok: false, error: 'Audio tap failed: ' + String((e && e.message) || e).slice(0, 160) };
    }
  }
  function stop(key) {
    var r = RUNS[key];
    if (!r) return { ok: true };
    r.running = false;
    try { if (r.timer && root.clearInterval) root.clearInterval(r.timer); } catch (e) {}
    try { if (r.node) r.node.disconnect(); } catch (e) {}
    try { if (r.src) r.src.disconnect(); } catch (e) {}
    try { if (r.ctx && r.ctx.close) r.ctx.close(); } catch (e) {}
    delete RUNS[key];
    return { ok: true };
  }
  function status(key) {
    var r = RUNS[key];
    if (!r) return { running: false, lines: lines(key).length };
    return { running: r.running, lines: r.lines.length, gaps: r.gaps, lastError: r.lastError };
  }

  var CAPV = '1';
  root.MuseCaptions = { version: '0.1.0', encodeWav: encodeWav, start: start, stop: stop,
    status: status, lines: lines, search: search, transcribeClip: transcribeClip };
})(typeof window !== 'undefined' ? window : globalThis);
