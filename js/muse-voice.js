/* Muse Live — Voice Muse.
   Push-to-talk in the Ask Muse drawer: hold the mic button (or hold Space while the drawer has
   focus outside a text field) and speak; release to send. A quick tap toggles recording on/off.
   Audio is captured as PCM in the browser, resampled to 16 kHz mono and encoded as a 16-bit WAV
   (the format Muse Voice Transcribe accepts), then sent to /api/voice, which holds the model key.
   "Speak answers" (off by default) reads Muse's replies aloud with the browser's speech synthesis. */
(function (root) {
  'use strict';

  var MAX_MS = 30000, TARGET_RATE = 16000, TAP_MS = 350;
  var SPEAK_KEY = 'muselive_museai_speak';
  var V = root.MuseVoice = { state: 'idle' }; // idle | recording | transcribing | denied | unsupported | offline
  var rec = null; // { stream, ctx, src, proc, chunks, rate, t0, timer, mode }

  function $(id) { return document.getElementById(id); }
  function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (root.AudioContext || root.webkitAudioContext)); }
  function say(msg) { var l = $('museaiVoiceLive'); if (l) { l.textContent = ''; setTimeout(function () { l.textContent = msg; }, 30); } }
  function toast(msg) { try { if (typeof root.toast === 'function') root.toast(msg); } catch (e) {} }
  function getSpeak() { try { return localStorage.getItem(SPEAK_KEY) === '1'; } catch (e) { return false; } }
  function setSpeak(on) { try { localStorage.setItem(SPEAK_KEY, on ? '1' : '0'); } catch (e) {} }

  /* ---------------- UI ---------------- */
  var MIC_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/></svg>';
  var SPK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path class="vs-wave" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  function btn() { return $('museaiMicBtn'); }
  function paint() {
    var b = btn(); if (!b) return;
    var st = V.state;
    b.classList.toggle('is-rec', st === 'recording');
    b.classList.toggle('is-busy', st === 'transcribing');
    b.disabled = st === 'unsupported' || st === 'offline' || st === 'transcribing';
    b.setAttribute('aria-pressed', st === 'recording' ? 'true' : 'false');
    var label = st === 'recording' ? 'Listening. Release to send.' : st === 'transcribing' ? 'Transcribing…' :
      st === 'unsupported' ? 'Voice isn\'t supported in this browser' : st === 'offline' ? 'Voice needs the Muse model to be connected' :
      st === 'denied' ? 'Microphone blocked. Allow it in site settings, then try again' : 'Hold to talk to Muse';
    b.setAttribute('aria-label', label); b.title = label;
    var inp = $('museaiInput');
    if (inp) inp.placeholder = st === 'recording' ? 'Listening… release to send' : st === 'transcribing' ? 'Transcribing…' : (inp.getAttribute('data-ph') || inp.placeholder);
  }
  function setState(s) { V.state = s; paint(); }

  function mount() {
    var b = btn(), inp = $('museaiInput');
    if (!b || b.getAttribute('data-voice')) return;
    b.setAttribute('data-voice', '1');
    b.hidden = false; b.removeAttribute('hidden');
    b.className = 'ma-mic'; b.innerHTML = MIC_SVG + '<span class="ma-mic-level" aria-hidden="true"></span>';
    if (inp && !inp.getAttribute('data-ph')) inp.setAttribute('data-ph', inp.placeholder);
    var live = document.createElement('div'); live.id = 'museaiVoiceLive'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite');
    b.parentNode.appendChild(live);

    // pointer: press-and-hold = push-to-talk; quick tap = toggle
    var downAt = 0;
    b.addEventListener('pointerdown', function (e) { if (b.disabled) return; e.preventDefault(); downAt = Date.now(); if (V.state === 'recording') return; start('hold'); });
    function release() {
      if (!downAt) return; var held = Date.now() - downAt; downAt = 0;
      if (V.state !== 'recording') return;
      if (rec && rec.mode === 'hold' && held < TAP_MS) { rec.mode = 'toggle'; return; } // tap: keep listening until the next tap
      if (rec && rec.mode === 'toggle' && held < TAP_MS && Date.now() - rec.t0 < TAP_MS * 2) return;
      stop(true);
    }
    b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('pointerleave', function () { if (rec && rec.mode === 'hold') release(); });
    b.addEventListener('click', function (e) { e.preventDefault(); }); // pointer handlers own it; keeps the form from submitting

    // keyboard: hold Space/Enter on the mic button
    b.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); if (V.state === 'recording') stop(true); else start('hold'); } });
    b.addEventListener('keyup', function (e) { if ((e.key === ' ' || e.key === 'Enter') && V.state === 'recording' && rec && rec.mode === 'hold' && Date.now() - rec.t0 > TAP_MS) stop(true); });

    // drawer-wide: hold Space when focus isn't in a field or on a control
    var drawer = $('museaiDrawer');
    if (drawer) {
      drawer.addEventListener('keydown', function (e) {
        if (e.key !== ' ' || e.repeat || V.state === 'recording') return;
        var t = e.target, tag = (t && t.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'a' || (t && t.isContentEditable)) return;
        e.preventDefault(); start('hold');
      });
      drawer.addEventListener('keyup', function (e) { if (e.key === ' ' && V.state === 'recording' && rec && rec.mode === 'hold') { e.preventDefault(); stop(true); } });
    }

    // "Speak answers" toggle in the drawer header
    if (root.speechSynthesis) {
      var head = document.querySelector('#museaiDrawer button[onclick="MuseAgent.reset()"]');
      if (head && !$('museaiSpeakBtn')) {
        var sb = document.createElement('button'); sb.type = 'button'; sb.id = 'museaiSpeakBtn'; sb.className = 'ma-icon-btn ma-speak';
        sb.innerHTML = SPK_SVG; head.parentNode.insertBefore(sb, head);
        var syncSpeak = function () { var on = getSpeak(); sb.setAttribute('aria-pressed', on ? 'true' : 'false'); sb.classList.toggle('is-on', on); sb.title = on ? 'Speak answers: on' : 'Speak answers: off'; sb.setAttribute('aria-label', sb.title); };
        sb.addEventListener('click', function () { setSpeak(!getSpeak()); syncSpeak(); if (!getSpeak()) try { root.speechSynthesis.cancel(); } catch (e) {} say(getSpeak() ? 'Muse will read answers aloud.' : 'Muse will stop reading answers aloud.'); });
        syncSpeak();
      }
    }
    if (!supported()) setState('unsupported'); else paint();
    // Voice needs the model; reflect it once the agent knows.
    fetch('/api/museai', { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { if (!j.configured && V.state === 'idle') setState('offline'); }).catch(function () {});
  }

  /* ---------------- recording ---------------- */
  function start(mode) {
    if (!supported()) { setState('unsupported'); toast('Voice isn\'t supported in this browser.'); return; }
    if (V.state === 'recording' || V.state === 'transcribing') return;
    try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) {}
    if (root.MuseAgent && root.MuseAgent.busy) root.MuseAgent.stop();
    rec = { chunks: [], mode: mode || 'hold', t0: Date.now(), pending: true };
    setState('recording'); say('Listening.');
    var r = rec;
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
      if (rec !== r) { stream.getTracks().forEach(function (t) { t.stop(); }); return; } // released before permission resolved
      var AC = root.AudioContext || root.webkitAudioContext, ctx = new AC();
      var src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain();
      mute.gain.value = 0;
      proc.onaudioprocess = function (e) {
        var d = e.inputBuffer.getChannelData(0); r.chunks.push(new Float32Array(d));
        var sum = 0; for (var i = 0; i < d.length; i += 16) sum += d[i] * d[i];
        var lvl = Math.min(1, Math.sqrt(sum / (d.length / 16)) * 6), m = document.querySelector('#museaiMicBtn .ma-mic-level');
        if (m) m.style.transform = 'scale(' + (1 + lvl * 0.9).toFixed(2) + ')';
      };
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      r.stream = stream; r.ctx = ctx; r.src = src; r.proc = proc; r.rate = ctx.sampleRate; r.pending = false;
      r.timer = setTimeout(function () { if (rec === r) { say('That\'s 30 seconds. Sending.'); stop(true); } }, MAX_MS);
      if (r.stopRequested) stop(r.stopSend);
    }).catch(function (err) {
      rec = null;
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) { setState('denied'); toast('Microphone access is blocked. Allow it for this site to talk to Muse.'); say('Microphone access is blocked.'); }
      else if (err && err.name === 'NotFoundError') { setState('idle'); toast('No microphone found.'); say('No microphone found.'); }
      else { setState('idle'); toast('Could not start the microphone.'); }
    });
  }
  function stop(send) {
    var r = rec; if (!r) return;
    if (r.pending) { r.stopRequested = true; r.stopSend = send; return; }
    rec = null; clearTimeout(r.timer);
    try { r.proc.disconnect(); r.src.disconnect(); } catch (e) {}
    try { r.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { r.ctx.close(); } catch (e) {}
    var m = document.querySelector('#museaiMicBtn .ma-mic-level'); if (m) m.style.transform = '';
    var ms = Date.now() - r.t0;
    if (!send || ms < 300) { setState('idle'); say(ms < 300 ? 'Hold the button while you speak.' : 'Cancelled.'); return; }
    var wav = encodeWav(r.chunks, r.rate);
    setState('transcribing'); say('Transcribing.');
    fetch('/api/voice', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'audio/wav' }, body: wav })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { if (!res.ok || !j.ok) throw new Error(j.error || 'Voice transcription failed.'); return j; }); })
      .then(function (j) {
        setState('idle');
        var text = String(j.text || '').trim();
        if (!text) { say('I didn\'t catch that.'); toast('I didn\'t catch that. Try again a little closer to the mic.'); return; }
        var inp = $('museaiInput'); if (inp) inp.value = text;
        say('Heard: ' + text);
        if (typeof root.museaiSend === 'function') root.museaiSend();
      })
      .catch(function (e) { setState('idle'); toast(e.message || 'Voice transcription failed.'); say(e.message || 'Voice transcription failed.'); });
  }

  // Float32 chunks at the device rate → 16 kHz mono 16-bit PCM WAV.
  function encodeWav(chunks, rate) {
    var len = 0; chunks.forEach(function (c) { len += c.length; });
    var all = new Float32Array(len), o = 0; chunks.forEach(function (c) { all.set(c, o); o += c.length; });
    var ratio = rate / TARGET_RATE, outLen = Math.floor(all.length / ratio), pcm = new Int16Array(outLen);
    for (var i = 0; i < outLen; i++) {
      // average the source samples that fall into this output sample (simple low-pass for downsampling)
      var a = Math.floor(i * ratio), b = Math.min(all.length, Math.floor((i + 1) * ratio)), s = 0, n = 0;
      for (var j = a; j < b; j++) { s += all[j]; n++; }
      var v = Math.max(-1, Math.min(1, n ? s / n : 0)); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    var buf = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(buf);
    function w(off, str) { for (var k = 0; k < str.length; k++) dv.setUint8(off + k, str.charCodeAt(k)); }
    w(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, TARGET_RATE, true);
    dv.setUint32(28, TARGET_RATE * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    return new Blob([buf], { type: 'audio/wav' });
  }
  V.encodeWav = encodeWav; // exposed for tests

  /* ---------------- speak answers ---------------- */
  function plain(md) {
    return String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/\|.*\|/g, ' ').replace(/[*_`#>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
  }
  document.addEventListener('muse:answer', function (e) {
    if (!getSpeak() || !root.speechSynthesis) return;
    try {
      var t = plain(e.detail && e.detail.text);
      // read the lead (first ~3 sentences): the full answer stays on screen
      var lead = (t.match(/[^.!?]+[.!?]+/g) || [t]).slice(0, 3).join(' ').slice(0, 500);
      var u = new SpeechSynthesisUtterance(lead); u.rate = 1.05; u.lang = 'en-US';
      root.speechSynthesis.cancel(); root.speechSynthesis.speak(u);
    } catch (err) {}
  });

  V.start = start; V.stop = stop;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})(typeof window !== 'undefined' ? window : globalThis);
