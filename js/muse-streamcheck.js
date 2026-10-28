/* Stream Check — eyes on the program frame.
   Pipeline rule: SAM segments, Spark reasons, never the other way round.
   Black-frame detection is deterministic (pixel math, no model). Lower-third
   and gear checks segment through /api/streamcheck and compare against what
   the show expects; wording cites SAM output only. Results feed Show Caller
   through latest(), where every flag becomes a high risk with its source.
   Frame capture only works on HLS <video> tiles — YouTube iframes and
   cross-origin-tainted canvases fail cleanly with a reason, never silently. */
(function (root) {
  'use strict';

  var LATEST = {};
  var CAPTURE_W = 320;

  function videoFor(slot) {
    try {
      var M = root.MuseStreaming;
      if (M && typeof M.videoFor === 'function') return M.videoFor(slot);
      if (root.document && root.document.querySelector) {
        var scope = slot && root.document.querySelector('[data-hls-slot="' + slot + '"]');
        var v = (scope || root.document).querySelector('video.ms-video');
        if (v && v.tagName === 'VIDEO') return v;
      }
    } catch (e) {}
    return null;
  }

  function captureFrame(slot) {
    var v = videoFor(slot);
    if (!v) return { ok: false, error: 'No capturable video for slot ' + slot + ' (YouTube and empty tiles cannot be grabbed).' };
    if (!v.videoWidth || !root.document || !root.document.createElement) return { ok: false, error: 'Video has no frame yet.' };
    try {
      var scale = CAPTURE_W / v.videoWidth, w = CAPTURE_W, h = Math.max(2, Math.round(v.videoHeight * scale));
      var c = root.document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(v, 0, 0, w, h);
      return { ok: true, dataUrl: c.toDataURL('image/jpeg', 0.8), w: w, h: h };
    } catch (e) { return { ok: false, error: 'Frame grab blocked: ' + (e && e.message ? e.message : 'tainted canvas') }; }
  }

  // Pure pixel math over {data,w,h} (ImageData-shaped). Black = near-zero
  // luminance nearly everywhere; one hot pixel must not clear a dead frame.
  function analyzePixels(px) {
    var d = px.data, n = px.w * px.h, sum = 0, dark = 0, i, lum;
    for (i = 0; i < n; i++) {
      lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      sum += lum;
      if (lum < 20) dark++;
    }
    return { mean: n ? sum / n : 255, darkFrac: n ? dark / n : 0 };
  }
  function isBlack(sample) { return sample.mean < 14 && sample.darkFrac > 0.97; }

  function sampleVideo(v) {
    if (!v.videoWidth || !root.document || !root.document.createElement) return { ok: false, error: 'Video has no frame yet.' };
    try {
      var c = root.document.createElement('canvas');
      c.width = 64; c.height = 36;
      var g = c.getContext('2d');
      g.drawImage(v, 0, 0, 64, 36);
      return { ok: true, sample: analyzePixels(g.getImageData(0, 0, 64, 36)) };
    } catch (e) { return { ok: false, error: 'Pixel read blocked: ' + (e && e.message ? e.message : 'tainted canvas') }; }
  }
  /* What changed since a held baseline? Mean abs luma delta + share of moved pixels. */
  function compareFrames(slot, baseDataUrl) {
    return new Promise(function (resolve) {
      var v = videoFor(slot);
      if (!v || !v.videoWidth) { resolve({ ok: false, error: 'No capturable video for slot ' + slot + '.' }); return; }
      try {
        var c = root.document.createElement('canvas'); c.width = 160; c.height = 90;
        var g = c.getContext('2d'); g.drawImage(v, 0, 0, 160, 90);
        var now = g.getImageData(0, 0, 160, 90).data;
        var img = new root.Image();
        img.onload = function () {
          try {
            var c2 = root.document.createElement('canvas'); c2.width = 160; c2.height = 90;
            var g2 = c2.getContext('2d'); g2.drawImage(img, 0, 0, 160, 90);
            var base = g2.getImageData(0, 0, 160, 90).data;
            var n = 160 * 90, sum = 0, changed = 0, i, d;
            for (i = 0; i < n; i++) {
              d = Math.abs((0.299 * now[i * 4] + 0.587 * now[i * 4 + 1] + 0.114 * now[i * 4 + 2]) - (0.299 * base[i * 4] + 0.587 * base[i * 4 + 1] + 0.114 * base[i * 4 + 2]));
              sum += d; if (d > 24) changed++;
            }
            resolve({ ok: true, changedPct: +(changed / n * 100).toFixed(1), meanDelta: +(sum / n).toFixed(1) });
          } catch (e) { resolve({ ok: false, error: 'Compare failed: ' + (e && e.message ? e.message : 'tainted canvas') }); }
        };
        img.onerror = function () { resolve({ ok: false, error: 'Baseline image unreadable.' }); };
        img.src = baseDataUrl;
      } catch (e) { resolve({ ok: false, error: 'Compare failed: ' + (e && e.message ? e.message : 'tainted canvas') }); }
    });
  }
  function checkBlack(slot) {
    var v = videoFor(slot);
    if (!v) return { check: 'black', pass: false, error: 'No capturable video for slot ' + slot + '.' };
    var s = sampleVideo(v);
    if (!s.ok) return { check: 'black', pass: false, error: s.error };
    var black = isBlack(s.sample);
    return { check: 'black', pass: !black, evidence: { mean_luma: +s.sample.mean.toFixed(1), dark_frac: +s.sample.darkFrac.toFixed(3) },
      flag: black ? 'Frame is black (mean luma ' + s.sample.mean.toFixed(1) + ').' : '' };
  }

  function http() { return root.fetch || (typeof fetch !== 'undefined' ? fetch : null); }
  async function segment(dataUrl, concept) {
    var F = http();
    if (!F) return { ok: false, error: 'network unavailable' };
    try {
      var r = await F('/api/streamcheck', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, concept: concept }) });
      var j = await r.json();
      return j && j.ok ? { ok: true, data: j } : { ok: false, error: (j && j.error) || ('HTTP ' + (r.status || '?')) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }
  // SAM vocabulary: 'caption bar' segments a name strap reliably; the
  // broadcast-jargon phrasings ('lower-third graphic', 'name strap') return
  // nothing. Verified against a generated strap frame, Day 6.
  var LT_CONCEPT = 'caption bar';
  async function checkLowerThird(slot, expected) {
    var cap = captureFrame(slot);
    if (!cap.ok) return { check: 'lower-third', pass: false, error: cap.error };
    var s = await segment(cap.dataUrl, LT_CONCEPT);
    if (!s.ok) return { check: 'lower-third', pass: false, error: s.error };
    var present = s.data.count > 0, ok = present === !!expected;
    var top = s.data.matches[0];
    return { check: 'lower-third', pass: ok,
      evidence: { expected: !!expected, found: s.data.count, top: top ? { box: [top.x1, top.y1, top.x2, top.y2], confidence: top.confidence } : null },
      flag: ok ? '' : (expected ? 'Lower-third expected but SAM found none.' : 'Lower-third on air but none scheduled (SAM found ' + s.data.count + ').') };
  }
  async function checkGear(slot, concept, expected) {
    var cap = captureFrame(slot);
    if (!cap.ok) return { check: 'gear', pass: false, error: cap.error, concept: concept };
    var s = await segment(cap.dataUrl, concept);
    if (!s.ok) return { check: 'gear', pass: false, error: s.error, concept: concept };
    var ok = s.data.count === expected;
    return { check: 'gear', pass: ok, concept: concept,
      evidence: { expected: expected, found: s.data.count },
      flag: ok ? '' : ('Gear count mismatch for "' + concept + '": SAM found ' + s.data.count + ', checkout says ' + expected + '.') };
  }

  async function runShow(key, slot, opts) {
    opts = opts || {};
    var results = [];
    results.push(checkBlack(slot));
    results.push(await checkLowerThird(slot, opts.expectLowerThird));
    var gear = opts.gear || [];
    for (var i = 0; i < gear.length; i++) {
      results.push(await checkGear(slot, gear[i].concept, gear[i].expected));
    }
    var run = { key: key, slot: slot, ts: new Date().toISOString(), results: results,
      flags: results.filter(function (r) { return !r.pass && !r.error; }) };
    LATEST[key] = run;
    return run;
  }
  function latest(key) { return LATEST[key] || null; }

  root.MuseStreamCheck = { version: '0.1.0', captureFrame: captureFrame, analyzePixels: analyzePixels, compareFrames: compareFrames,
    isBlack: isBlack, checkBlack: checkBlack, segment: segment, checkLowerThird: checkLowerThird,
    checkGear: checkGear, runShow: runShow, latest: latest };
})(typeof window !== 'undefined' ? window : globalThis);
