/* Muse Live — rolling demo clock.
   The seed portfolio is authored around fixed 2026 dates. For a live demo every show has to sit
   in a coherent place relative to TODAY, so each production gets a whole-day offset that moves its
   air date (last schedule row with a broadcast value) to a target:
     museaitour, igcreators → today (LIVE) · museailaunch → tomorrow (REHEARSAL) ·
     whatsapp → +17 d (STANDBY) · orion → +110 d (SCHEDULED) · raybangen3 → −110 d · charm → −250 d (ENDED)
   Every date-looking string in that show's seed (ISO, "Jul 19, 2026", "Jul 19", "Jul 2026",
   "Jul 12–19, 2026") is shifted by the offset at boot (MuseDemo.applySeed, called from initApp).
   Stored data (localStorage muselive_*) is re-anchored by whole days when the calendar day changes,
   so saved edits stay coherent too. Other modules shift their own seeds with shiftISO/shiftText.
   Loaded before the app bundles; no dependencies. */
(function (root) {
  'use strict';
  var DAY = 864e5;
  var ANCHOR_KEY = 'muselive_demo_anchor';
  var TARGET = { museaitour: 0, igcreators: 0, museailaunch: 1, whatsapp: 17, orion: 110, raybangen3: -110, charm: -250 };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MRX = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

  function midnight(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDay(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; }
  function daysBetween(a, b) { return Math.round((midnight(b) - midnight(a)) / DAY); }
  function monIdx(m) { var s = String(m).slice(0, 3).toLowerCase(); for (var i = 0; i < 12; i++) if (MON[i].toLowerCase() === s) return i; return -1; }
  function monName(i, full) { return full ? FULL[i] : MON[i]; }

  var today = midnight(new Date());
  var todayISO = isoDay(today);

  /* ---------- parsing ---------- */
  function parseLoose(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return midnight(v);
    var s = String(v), m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = new RegExp('\\b' + MRX + '\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})').exec(s);
    if (m) return new Date(+m[3], monIdx(m[1]), +m[2]);
    return null;
  }

  /* ---------- per-production offsets (computed once, from the unshifted seed) ---------- */
  var offsets = null, airs = {}, refYears = {}, applied = false;
  function seedAir(p) {
    var rows = (p && p.schedule) || [], air = null;
    for (var i = 0; i < rows.length; i++) { var r = rows[i]; if (r && r[4] && String(r[4]).trim() !== '—' && String(r[4]).trim() !== '-') { var d = parseLoose(r[0]) || parseLoose(r[4]); if (d) air = d; } }
    if (!air) for (var j = rows.length - 1; j >= 0 && !air; j--) air = parseLoose(rows[j] && rows[j][0]);
    return air;
  }
  function computeOffsets() {
    if (offsets) return offsets;
    offsets = {};
    var P = root.productions || {};
    Object.keys(P).forEach(function (k) {
      var air = seedAir(P[k]);
      if (air) { airs[k] = air; refYears[k] = air.getFullYear(); }
      offsets[k] = (air && TARGET[k] != null) ? daysBetween(air, addDays(today, TARGET[k])) : 0;
    });
    return offsets;
  }
  function off(k) { var o = computeOffsets(); return o[k] || 0; }

  /* ---------- string shifting ---------- */
  // Year for a "Mon D" / "Mon" with no year: the one that puts it closest to the reference date.
  function nearestYear(mi, day, ref) {
    var best = ref.getFullYear(), bestD = Infinity;
    [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1].forEach(function (y) {
      var dd = Math.abs(new Date(y, mi, day || 15) - ref); if (dd < bestD) { bestD = dd; best = y; }
    });
    return best;
  }
  function shiftString(s, days, ref) {
    if (!days || typeof s !== 'string' || s.length > 4000 || /^data:/.test(s)) return s;
    ref = ref || today;
    var out = s;
    // ranges first: "Jul 12–19, 2026" / "Jul 12 - 19 2026"
    out = out.replace(new RegExp('\\b' + MRX + '(\\.?)\\s+(\\d{1,2})\\s*([–—-])\\s*(\\d{1,2})(,?)\\s+(\\d{4})\\b', 'g'), function (all, m, dot, d1, dash, d2, comma, y) {
      var mi = monIdx(m); if (mi < 0 || +d1 > 31 || +d2 > 31) return all;
      var a = addDays(new Date(+y, mi, +d1), days), b = addDays(new Date(+y, mi, +d2), days), full = m.length > 4;
      return monName(a.getMonth(), full) + dot + ' ' + a.getDate() + dash + (b.getMonth() !== a.getMonth() ? monName(b.getMonth(), full) + ' ' : '') + b.getDate() + comma + ' ' + b.getFullYear();
    });
    // ISO dates (keep any time / zone suffix untouched)
    out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})(?=$|[^\d])/g, function (all, y, mo, d) {
      if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return all;
      return isoDay(addDays(new Date(+y, +mo - 1, +d), days));
    });
    // "Jul 19, 2026" / "July 19 2026" / "Jul 19 2026"
    out = out.replace(new RegExp('\\b' + MRX + '(\\.?)\\s+(\\d{1,2})(,?)\\s+(\\d{4})\\b', 'g'), function (all, m, dot, d, comma, y) {
      var mi = monIdx(m); if (mi < 0 || +d > 31) return all;
      var a = addDays(new Date(+y, mi, +d), days);
      return monName(a.getMonth(), m.length > 4) + dot + ' ' + a.getDate() + comma + ' ' + a.getFullYear();
    });
    // "Jul 2026" (month + year, no day)
    out = out.replace(new RegExp('\\b' + MRX + '\\s+(\\d{4})\\b', 'g'), function (all, m, y) {
      var mi = monIdx(m); if (mi < 0) return all;
      var a = addDays(new Date(+y, mi, 15), days);
      return monName(a.getMonth(), m.length > 4) + ' ' + a.getFullYear();
    });
    // "Jul 19" (no year) — not followed by another digit, a comma+year, or a 4-digit year
    out = out.replace(new RegExp('\\b' + MRX + '(\\.?)\\s+(\\d{1,2})\\b(?!\\s*[–—-]\\s*\\d)(?!,?\\s+\\d{4})(?!\\d)(?![:.]\\d)', 'g'), function (all, m, dot, d) {
      var mi = monIdx(m); if (mi < 0 || +d < 1 || +d > 31) return all;
      var y = nearestYear(mi, +d, ref), a = addDays(new Date(y, mi, +d), days);
      return monName(a.getMonth(), m.length > 4) + dot + ' ' + a.getDate();
    });
    return out;
  }
  var SKIP_KEYS = { id: 1, img: 1, src: 1, url: 1, href: 1, thumb: 1, data: 1, dataUrl: 1, dataURL: 1, pano: 1, image: 1, logo: 1, file: 1, filename: 1, checksum: 1, barcode: 1, serial: 1 };
  function shiftDeep(obj, days, ref, depth) {
    if (!days || obj == null || (depth || 0) > 12) return obj;
    if (typeof obj === 'string') return shiftString(obj, days, ref);
    if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) obj[i] = shiftDeep(obj[i], days, ref, (depth || 0) + 1); return obj; }
    if (typeof obj === 'object') {
      Object.keys(obj).forEach(function (k) { if (SKIP_KEYS[k]) return; var v = obj[k]; if (v != null && typeof v === 'object' || typeof v === 'string') obj[k] = shiftDeep(v, days, ref, (depth || 0) + 1); });
    }
    return obj;
  }
  function refFor(k) { computeOffsets(); return airs[k] || today; }

  /* ---------- states ---------- */
  function airDate(k) { computeOffsets(); return airs[k] ? isoDay(addDays(airs[k], off(k))) : null; }
  function stateFor(k) {
    var a = airDate(k); if (!a) return 'SCHEDULED';
    var d = daysBetween(today, parseLoose(a));
    if (d === 0) return 'LIVE';
    if (d < 0) return 'ENDED';
    if (d <= 3) return 'REHEARSAL';
    if (d <= 30) return 'STANDBY';
    return 'SCHEDULED';
  }

  /* ---------- applying to the seed (once, at boot, before saved edits overlay) ---------- */
  function applySeed() {
    if (applied) return; applied = true;
    computeOffsets();
    var P = root.productions || {};
    Object.keys(P).forEach(function (k) {
      var d = off(k); if (!d) return;
      shiftDeep(P[k], d, refFor(k));
      var st = stateFor(k);
      if (st === 'LIVE') P[k].status = 'On Air';
      else if (st === 'ENDED') P[k].status = 'Complete';
    });
    // global seed arrays that belong to a show
    ['engRequests', 'txBookings', 'workOrders', 'finPOs', 'finInvoices', 'trkEvents'].forEach(function (name) {
      var arr = root[name]; if (!Array.isArray(arr)) return;
      arr.forEach(function (r) { if (r && r.prod && off(r.prod)) shiftDeep(r, off(r.prod), refFor(r.prod)); });
    });
    // messages follow the show of whatever record they link to (production, invoice, PO, WO, TX, ENG)
    var owner = {};
    ['engRequests', 'txBookings', 'workOrders', 'finPOs', 'finInvoices'].forEach(function (name) {
      (root[name] || []).forEach(function (r) { if (r && r.id && r.prod) owner[r.id] = r.prod; });
    });
    var comms = root.comms;
    if (Array.isArray(comms)) comms.forEach(function (m) {
      var k = m && (m.prod || (m.linkType === 'production' ? m.linkId : owner[m.linkId]));
      if (k && off(k)) shiftDeep(m, off(k), refFor(k));
    });
  }

  /* ---------- stored data follows the calendar (whole days) ---------- */
  function reanchorStorage() {
    var ls; try { ls = root.localStorage; } catch (e) { return; }
    if (!ls) return;
    var prev = null; try { prev = ls.getItem(ANCHOR_KEY); } catch (e) {}
    if (prev && prev !== todayISO) {
      var delta = daysBetween(parseLoose(prev), today);
      if (delta) for (var i = 0; i < ls.length; i++) {
        var key = ls.key(i);
        if (!key || key.indexOf('muselive_') !== 0 || key === ANCHOR_KEY || key === 'muselive_data_v') continue;
        try {
          var raw = ls.getItem(key); if (!raw || raw.length > 4e6 || !/\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2}\s+\d{1,2}/.test(raw)) continue;
          var val = JSON.parse(raw); if (val == null || typeof val !== 'object') continue;
          ls.setItem(key, JSON.stringify(shiftDeep(val, delta, today)));
        } catch (e2) {}
      }
    }
    try { ls.setItem(ANCHOR_KEY, todayISO); } catch (e3) {}
  }
  reanchorStorage();

  function reset() {
    try {
      var ls = root.localStorage, keep = {};
      ['museTheme', 'muselive_data_v'].forEach(function (k) { try { var v = ls.getItem(k); if (v != null) keep[k] = v; } catch (e) {} });
      for (var i = ls.length - 1; i >= 0; i--) { var k = ls.key(i); if (k && (k.indexOf('muselive') === 0 || k.indexOf('muse_') === 0) && !keep[k]) ls.removeItem(k); }
      try { sessionStorage.clear(); } catch (e) {}
      try { if (root.indexedDB) indexedDB.deleteDatabase('MuseRecords'); } catch (e) {}
    } catch (e) {}
    root.location.reload();
  }

  root.MuseDemo = {
    today: todayISO,
    todayDate: today,
    offsetDays: function (k) { return off(k); },
    shiftISO: function (k, v) {
      var d = off(k); if (!d || v == null) return v instanceof Date ? v.toISOString() : v;
      if (v instanceof Date) return new Date(v.getTime() + d * DAY).toISOString();
      return shiftString(String(v), d, refFor(k));
    },
    shiftText: function (k, s) { return shiftString(s, off(k), refFor(k)); },
    shiftDeep: function (k, obj) { return shiftDeep(obj, off(k), refFor(k)); },
    stateFor: stateFor,
    airDate: airDate,
    applySeed: applySeed,
    reset: reset,
    targets: TARGET
  };
})(typeof window !== 'undefined' ? window : globalThis);
