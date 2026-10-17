/* Muse Schedule — resource scheduling for live production.
   One source of truth for control rooms, audio rooms, transmission circuits, edit/replay,
   mobile units, encoders and bonded kits, and crew. Real date/time bookings with holds,
   on-air flags, conflict detection (double-bookings, crew turnaround, overtime), one-click
   fixes, slot finding, utilization, iCalendar export and a change log.

   Integration:
   • Master Schedule → "Muse Schedule" tab (renderInto), production "Bookings" tab
     (projectPaneHTML), dashboard control-room board and facility gantt (FACILITY_ROWS shim),
     Omni schedule change log (log), and Muse (brief / summary).
   • Labor rule sets (union / overtime-style): per-crew rest, maximum day, daily OT, double and
     golden time, weekly OT, meal penalties, 6th/7th-day premiums and minimum calls. Rule names
     appear in conflict texts; the Crew labor & timecards card is priced through them.
   • Crew self-service ("My schedule", #schedule/crew/<name>): upcoming calls, printable call
     sheets, availability blocks (status "Unavailable") and hold accept / decline.
   • Calendar sync: signed iCalendar subscription feeds served by functions/api/calendar.js.
   • Persisted in localStorage `muselive_schedule_v1`; mirrored to the server (MuseSync and
     /api/calendar) for calendar feeds. */
(function (root) {
  'use strict';

  var STORE = 'muselive_schedule_v1';
  var DAY_START = 5, DAY_END = 24;           // visible hours on the timeline
  var SNAP_MIN = 30;
  var REST_HOURS = 10, MAX_SHIFT_HOURS = 12;   // defaults when no rule set applies
  var STATUSES = ['Confirmed', 'Hold', 'Tentative', 'Released', 'Unavailable'];
  var ME_KEY = 'muselive_sched_me';
  // The app's router rewrites the URL during load, so read the hash the page was opened with.
  var bootHash = (function () {
    try {
      var nav = root.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
      if (nav && nav.name && nav.name.indexOf('#') >= 0) return '#' + nav.name.split('#').slice(1).join('#');
      return location.hash || '';
    } catch (e) { return ''; }
  })();

  // Reference rule sets modelled on common US entertainment and broadcast agreements. They are
  // planning defaults, not contract terms: labor relations confirms the real agreement per show.
  var DEFAULT_RULES = {
    iatse: { id: 'iatse', name: 'IATSE Local 600-style', dailyOT: 8, otX: 1.5, dt: 12, dtX: 2, golden: 14, goldenX: 2.5, weeklyOT: 40, rest: 10, maxDay: 12, mealAfter: 6, mealPenalty: 25, day6X: 1.5, day7X: 2, minCall: 8 },
    nabet: { id: 'nabet', name: 'NABET-CWA-style', dailyOT: 8, otX: 1.5, dt: 12, dtX: 2, golden: 0, goldenX: 2, weeklyOT: 40, rest: 10, maxDay: 12, mealAfter: 6, mealPenalty: 20, day6X: 1.5, day7X: 2, minCall: 8 },
    ibew: { id: 'ibew', name: 'IBEW-style', dailyOT: 8, otX: 1.5, dt: 10, dtX: 2, golden: 0, goldenX: 2, weeklyOT: 40, rest: 8, maxDay: 12, mealAfter: 5, mealPenalty: 30, day6X: 1.5, day7X: 2, minCall: 4 },
    custom: { id: 'custom', name: 'Custom (house rules)', dailyOT: 10, otX: 1.5, dt: 12, dtX: 2, golden: 14, goldenX: 2.5, weeklyOT: 50, rest: 10, maxDay: 12, mealAfter: 6, mealPenalty: 25, day6X: 1.5, day7X: 2, minCall: 4 }
  };
  var RULE_FIELDS = [
    ['dailyOT', 'Daily overtime after', 'h'], ['otX', 'Overtime rate', '×'], ['dt', 'Double time after', 'h'], ['dtX', 'Double time rate', '×'],
    ['golden', 'Golden time after (0 = none)', 'h'], ['goldenX', 'Golden time rate', '×'], ['weeklyOT', 'Weekly overtime after', 'h'],
    ['rest', 'Minimum rest (turnaround)', 'h'], ['maxDay', 'Maximum day (hard limit)', 'h'], ['mealAfter', 'Meal break due within', 'h'],
    ['mealPenalty', 'Meal penalty per half hour', '$'], ['day6X', '6th consecutive day rate', '×'], ['day7X', '7th consecutive day rate', '×'], ['minCall', 'Minimum call', 'h']
  ];

  var TYPES = [
    { id: 'control', label: 'Control rooms', room: true },
    { id: 'audio', label: 'Audio rooms', room: true },
    { id: 'circuit', label: 'Transmission circuits', room: true },
    { id: 'remi', label: 'REMI', room: true },
    { id: 'edit', label: 'Edit & replay' },
    { id: 'mobile', label: 'Mobile units & flypacks' },
    { id: 'encoder', label: 'Encoders & bonded kits' },
    { id: 'crew', label: 'Crew' }
  ];
  var BASE_RESOURCES = [].concat(
    ['PCR 1', 'PCR 2', 'PCR 3', 'PCR 4', 'PCR 5', 'PCR 6', 'PCR 7', 'PCR 8', 'Studio M1'].map(function (n) { return [n, 'control']; }),
    ['ACR 1', 'ACR 2', 'ACR 3', 'ACR 4', 'ACR 6', 'ACR 7', 'MIX 4'].map(function (n) { return [n, 'audio']; }),
    ['CRK 1', 'CRK 2', 'CRK 3', 'CRK 4', 'CRK 5', 'CRK 6', 'CRK 7', 'CRK 8', 'CRK 9', 'CRK 10'].map(function (n) { return [n, 'circuit']; }),
    [['REMI Bay', 'remi']],
    ['Edit 1', 'Edit 2', 'Edit 3', 'Edit 4', 'EVS 1', 'EVS 2'].map(function (n) { return [n, 'edit']; }),
    ['MU-1', 'Flypack A', 'Flypack B'].map(function (n) { return [n, 'mobile']; }),
    ['LiveU LU800 #1', 'LiveU LU800 #2', 'LiveU LU800 #3', 'LiveU LU800 #4', 'Makito X4 pair 1', 'Makito X4 pair 2'].map(function (n) { return [n, 'encoder']; })
  );
  // Text colors that keep white labels at ≥4.5:1 on the production color.
  var PROD_COLOR = { museaitour: '#0866FF', raybangen3: '#1E7B34', orion: '#0073C7', museailaunch: '#6A4BF0', whatsapp: '#128C7E', igcreators: '#C13584', charm: '#C25E0D' };
  var FALLBACK_COLORS = ['#0866FF', '#1E7B34', '#6A4BF0', '#C13584', '#0073C7', '#C25E0D', '#128C7E', '#B3122E'];

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function P() { return root.productions || {}; }
  function prodKeys() { return (root.order || Object.keys(P())).filter(function (k) { return P()[k]; }); }
  function prodName(k) { var p = P()[k]; return p ? (p.tab || p.name || k) : (k || 'Unassigned'); }
  function prodColor(k) { if (PROD_COLOR[k]) return PROD_COLOR[k]; var i = prodKeys().indexOf(k); return FALLBACK_COLORS[(i < 0 ? 7 : i) % FALLBACK_COLORS.length]; }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function d(x) { return x instanceof Date ? new Date(x.getTime()) : new Date(x); }
  function iso(x) { return d(x).toISOString(); }
  function mondayOf(x) { var t = d(x); t.setHours(0, 0, 0, 0); var wd = (t.getDay() + 6) % 7; t.setDate(t.getDate() - wd); return t; }
  function addDays(x, n) { var t = d(x); t.setDate(t.getDate() + n); return t; }
  function addMin(x, n) { return new Date(d(x).getTime() + n * 60000); }
  function at(day, h, m) { var t = d(day); t.setHours(h, m || 0, 0, 0); return t; }
  function hrs(a, b) { return (d(b) - d(a)) / 3600000; }
  function overlap(a1, a2, b1, b2) { return d(a1) < d(b2) && d(b1) < d(a2); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(x) { var t = d(x); return pad(t.getHours()) + ':' + pad(t.getMinutes()); }
  function dayLabel(x) { return d(x).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function dayShort(x) { return d(x).toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + d(x).getDate(); }
  function span(b) { return dayShort(b.start) + ' ' + hm(b.start) + '–' + hm(b.end); }
  function localInput(x) { var t = d(x); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + 'T' + hm(t); }
  function sameDay(a, b) { a = d(a); b = d(b); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function toast(m) { try { if (root.toast) root.toast(m); } catch (e) {} }

  /* ---------------- store ---------------- */
  var db = null;
  function load() {
    try { var raw = localStorage.getItem(STORE); if (raw) { var j = JSON.parse(raw); if (j && Array.isArray(j.bookings) && Array.isArray(j.resources)) return migrate(j); } } catch (e) {}
    return null;
  }
  function migrate(j) {
    if (!j.rules || typeof j.rules !== 'object') j.rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
    Object.keys(DEFAULT_RULES).forEach(function (k) { if (!j.rules[k]) j.rules[k] = JSON.parse(JSON.stringify(DEFAULT_RULES[k])); });
    if (!j.assign || typeof j.assign !== 'object') j.assign = {};
    j.v = 2;
    return j;
  }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) {} scheduleSync(); }
  function ensure() { if (!db) { db = load() || seed(); persist(); afterChange(true); } return db; }
  function nextId() { db.seq = (db.seq || 0) + 1; return 'bk' + db.seq.toString(36); }
  function logChange(prod, text, lvl) {
    db.log = db.log || [];
    db.log.unshift({ t: new Date().toISOString(), prod: prod || null, text: text, lvl: lvl || 'ok' });
    if (db.log.length > 80) db.log.length = 80;
  }

  /* ---------------- seed ---------------- */
  function crewNames() {
    var seen = {}, out = [];
    var keys = ['museailaunch'].concat(prodKeys().filter(function (k) { return k !== 'museailaunch'; }));
    keys.forEach(function (k) {
      var crew = []; try { crew = root.getProjectCrew(k) || []; } catch (e) {}
      crew.forEach(function (s) {
        var n = (s.name || '').trim(); if (!n || seen[n] || out.length >= 24) return;
        seen[n] = 1; out.push({ name: n, pos: s.pos || '', prod: k });
      });
    });
    return out;
  }
  function parseWindow(w) {
    var m = String(w || '').match(/(\d{1,2}):(\d{2})\s*(?:[–-]\s*(\d{1,2}):(\d{2}))?/);
    if (!m) return { h1: 9, m1: 0, h2: 17, m2: 0 };
    var h1 = +m[1], m1 = +m[2], h2 = m[3] != null ? +m[3] : Math.min(23, h1 + 2), m2 = m[4] != null ? +m[4] : m1;
    return { h1: h1, m1: m1, h2: h2, m2: m2 };
  }
  function airDay(key, fallback) {
    try {
      var a = root.MuseDemo && typeof root.MuseDemo.airDate === 'function' ? root.MuseDemo.airDate(key) : null;
      if (a) { var t = /^\d{4}-\d{2}-\d{2}$/.test(String(a)) ? new Date(a + 'T00:00') : d(a); if (!isNaN(t)) { t.setHours(0, 0, 0, 0); return t; } } // date-only = local day
    } catch (e) {}
    return fallback;
  }
  function cleanTitle(t) {
    return String(t || '').replace(/Launchth/g, 'Launch').replace('Match Coverage', 'Keynote Coverage').replace(/^Calrec Artemis$/, 'Console prep · Calrec Artemis');
  }
  function seed() {
    var mon = mondayOf(new Date());
    var resources = BASE_RESOURCES.map(function (r) { return { id: slug(r[0]), name: r[0], type: r[1] }; });
    var crew = crewNames();
    crew.forEach(function (c) { resources.push({ id: 'crew-' + slug(c.name), name: c.name, type: 'crew', role: c.pos, home: c.prod }); });
    db = migrate({ v: 2, seq: 0, week0: iso(mon), resources: resources, bookings: [], log: [] });
    var byName = {}; resources.forEach(function (r) { byName[r.name] = r; });
    function add(resName, prod, title, start, end, extra) {
      var r = byName[resName]; if (!r) return null;
      if (extra && extra.onAir && prod) db.bookings = db.bookings.filter(function (x) { return !(x.res === r.id && x.prod === prod && !x.onAir && overlap(x.start, x.end, start, end)); });
      var b = Object.assign({ id: nextId(), res: r.id, prod: prod || null, title: title, start: iso(start), end: iso(end), status: 'Confirmed', onAir: false, notes: '' }, extra || {});
      db.bookings.push(b); return b;
    }
    function free(resName, s, e) {
      var r = byName[resName]; if (!r) return false;
      return !db.bookings.some(function (b) { return b.res === r.id && overlap(b.start, b.end, s, e); });
    }
    // 1) The control-room / circuit week (formerly a fixed demo week), mapped onto this week.
    var rows = Array.isArray(root.FACILITY_ROWS) ? root.FACILITY_ROWS : [];
    rows.forEach(function (row) {
      (row[1] || []).forEach(function (fb) {
        var w = parseWindow(fb[5]), onAir = /on air/i.test(fb[5] || '');
        var title = cleanTitle(fb[2]);
        var st = /test|rehears|survey|map|bench/i.test(title) ? (/survey|map/i.test(title) ? 'Tentative' : 'Confirmed') : 'Confirmed';
        for (var i = fb[0]; i < fb[0] + fb[1] && i < 7; i++) {
          var day = addDays(mon, i), s = at(day, w.h1, w.m1), e = at(day, w.h2, w.m2);
          if (e <= s) e = addMin(s, 120);
          // Keep the seeded plan clean: shift any overlap after the earlier booking.
          var guard = 0;
          while (!free(row[0], s, e) && guard++ < 6) { var dur = (e - s) / 60000; s = addMin(e, 30); e = addMin(s, dur); }
          add(row[0], fb[6] || null, title, s, e, { status: st, onAir: onAir });
        }
      });
    });
    // 2) This week's headline: the Muse AI Launch keynote (Sunday) and the build to it.
    // Show days follow the demo clock (MuseDemo) when it is loaded, so the schedule lines up with
    // the rolled show dates; otherwise the keynote lands on this week's Sunday.
    var sun = airDay('museailaunch', addDays(mon, 6)), sat = addDays(sun, -1), fri = addDays(sun, -2);
    add('Studio M1', 'museailaunch', 'Muse AI Launch Keynote — LIVE', at(sun, 13), at(sun, 21, 30), { onAir: true });
    add('PCR 6', 'museailaunch', 'Muse AI Launch Keynote — LIVE', at(sun, 13), at(sun, 21, 30), { onAir: true });
    add('MIX 4', 'museailaunch', 'Muse AI Launch — Show mix', at(sun, 13), at(sun, 21, 30), { onAir: true });
    add('CRK 4', 'museailaunch', 'Muse AI Launch — Primary uplink (SRT → MediaConnect)', at(sun, 17), at(sun, 21, 30), { onAir: true });
    add('CRK 5', 'museailaunch', 'Muse AI Launch — Backup uplink (LiveU Matrix)', at(sun, 17), at(sun, 21, 30), { onAir: true });
    add('EVS 1', 'museailaunch', 'Keynote replay & highlights', at(sun, 15), at(sun, 22));
    add('Edit 1', 'museailaunch', 'Post-keynote recap edit', at(sun, 21, 30), at(addDays(sun, 0), 23, 59), { status: 'Hold' });
    add('Makito X4 pair 1', 'museailaunch', 'Keynote encode 1+1', at(sun, 12), at(sun, 22));
    add('LiveU LU800 #1', 'museailaunch', 'Keynote bonded backup', at(sun, 12), at(sun, 22));
    add('LiveU LU800 #2', 'museailaunch', 'Keynote bonded backup (spare)', at(sun, 12), at(sun, 22), { status: 'Hold' });
    add('LiveU LU800 #3', 'igcreators', 'Creator Week route test', at(addDays(mon, 3), 11), at(addDays(mon, 3), 15));
    add('Flypack A', 'igcreators', 'Creator Week float-cam build', at(addDays(mon, 2), 8), at(addDays(mon, 2), 18), { status: 'Hold' });
    add('MU-1', 'whatsapp', 'WhatsApp Summit — truck prep & shakedown', at(fri, 7), at(fri, 17), { status: 'Tentative' });
    add('Edit 2', 'museaitour', 'World Tour highlights package', at(addDays(mon, 1), 10), at(addDays(mon, 1), 18));
    // Deliberate conflict #1 — a double-booked circuit.
    add('CRK 4', 'whatsapp', 'WhatsApp Summit — line-up test', at(sun, 18), at(sun, 19), { notes: 'Requested by WhatsApp Summit TX — clashes with the keynote uplink.' });
    // 3) Crew: dress rehearsal (Fri), rehearsal (Sat), keynote (Sun).
    var launchCrew = crew.filter(function (c) { return c.prod === 'museailaunch'; }).slice(0, 10);
    if (launchCrew.length < 4) launchCrew = crew.slice(0, Math.min(10, crew.length));
    launchCrew.forEach(function (c, i) {
      add(c.name, 'museailaunch', 'Dress rehearsal · ' + (c.pos || 'crew'), at(fri, 8), at(fri, 18));
      if (i === 1) add(c.name, 'museailaunch', 'Rehearsal + notes · ' + (c.pos || 'crew'), at(sat, 9), at(sat, 23)); // wraps late…
      else add(c.name, 'museailaunch', 'Rehearsal · ' + (c.pos || 'crew'), at(sat, 9), at(sat, 18));
      if (i === 1) add(c.name, 'museailaunch', 'Keynote call · ' + (c.pos || 'crew'), at(sun, 6), at(sun, 21, 30)); // …and calls early: turnaround + 15.5 h day
      else add(c.name, 'museailaunch', 'Keynote call · ' + (c.pos || 'crew'), at(sun, 12), at(sun, 21, 30));
    });
    // Deliberate conflict #2 — one person on two shows at once.
    if (launchCrew[2]) add(launchCrew[2].name, 'igcreators', 'Creator Week route recce', at(sun, 14), at(sun, 17), { notes: 'Recce booked by Creator Week producer.' });
    // Other shows' crew this week (light), so the crew lane isn't only one show.
    crew.filter(function (c) { return c.prod !== 'museailaunch'; }).slice(0, 8).forEach(function (c, i) {
      var day = addDays(mon, i % 5);
      add(c.name, c.prod, prodName(c.prod) + ' prep · ' + (c.pos || 'crew'), at(day, 9), at(day, 17), { status: i % 3 === 2 ? 'Hold' : 'Confirmed' });
    });
    // On air today when the demo clock says so: World Tour and Creator Week.
    if (root.MuseDemo) {
      var tour = airDay('museaitour', null), cw = airDay('igcreators', null);
      if (tour) {
        if (free('PCR 2', at(tour, 11), at(tour, 19))) add('PCR 2', 'museaitour', 'World Tour — stop feed · LIVE', at(tour, 11), at(tour, 19), { onAir: true });
        if (free('CRK 6', at(tour, 11), at(tour, 19))) add('CRK 6', 'museaitour', 'World Tour — stop feed B-path', at(tour, 11), at(tour, 19), { onAir: true });
      }
      if (cw) {
        if (free('PCR 3', at(cw, 8), at(cw, 13))) add('PCR 3', 'igcreators', 'Creator Week street takeover — LIVE', at(cw, 8), at(cw, 13), { onAir: true });
        if (free('CRK 3', at(cw, 8), at(cw, 13))) add('CRK 3', 'igcreators', 'Creator Week — bonded return', at(cw, 8), at(cw, 13), { onAir: true });
        if (free('LiveU LU800 #4', at(cw, 7), at(cw, 14))) add('LiveU LU800 #4', 'igcreators', 'Creator Week roaming cam', at(cw, 7), at(cw, 14));
      }
    }
    logChange(null, 'Muse Schedule initialised for the week of ' + dayLabel(mon) + ' · ' + db.bookings.length + ' bookings', 'ok');
    return db;
  }

  /* ---------------- queries ---------------- */
  function resources(type) { ensure(); return db.resources.filter(function (r) { return !type || r.type === type; }); }
  function resById(id) { ensure(); for (var i = 0; i < db.resources.length; i++) if (db.resources[i].id === id || db.resources[i].name === id) return db.resources[i]; return null; }
  function bookings(f) {
    ensure(); f = f || {};
    var from = f.from ? d(f.from) : null, to = f.to ? d(f.to) : null, q = f.q ? String(f.q).toLowerCase() : '';
    return db.bookings.filter(function (b) {
      var r = resById(b.res);
      if (f.prod && b.prod !== f.prod) return false;
      if (f.res && b.res !== f.res && (!r || r.name !== f.res)) return false;
      if (f.type && (!r || r.type !== f.type)) return false;
      if (f.status && b.status !== f.status) return false;
      if (from && d(b.end) <= from) return false;
      if (to && d(b.start) >= to) return false;
      if (q && (b.title + ' ' + (r ? r.name : '') + ' ' + prodName(b.prod) + ' ' + (b.notes || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return d(a.start) - d(b.start); });
  }
  function get(id) { ensure(); for (var i = 0; i < db.bookings.length; i++) if (db.bookings[i].id === id) return db.bookings[i]; return null; }
  function isFree(res, start, end, ignoreId) {
    var r = resById(res); if (!r) return false;
    return !db.bookings.some(function (b) { return b.res === r.id && b.id !== ignoreId && b.status !== 'Released' && overlap(b.start, b.end, start, end); });
  }
  function describe(b) { var r = resById(b.res); return '“' + b.title + '” (' + (r ? r.name : b.res) + ', ' + span(b) + ')'; }

  /* ---------------- labor rules ---------------- */
  function defaultRuleFor(role) {
    var r = String(role || '').toLowerCase();
    if (/camera|\bcam\b|video|\bdp\b|steadicam|jib|shader|vision|lens|director of photography/.test(r)) return 'iatse';
    if (/electric|power|gaffer|lighting|\blx\b|generator|rigger|best boy/.test(r)) return 'ibew';
    if (/audio|\ba1\b|\ba2\b|engineer|\beic\b|tech|transmission|\btx\b|comms|\brf\b|replay|evs|graphic|network|\bit\b|maintenance|stream|encod/.test(r)) return 'nabet';
    return 'custom';
  }
  function ruleIdFor(res) { return (db.assign && res && db.assign[res.id]) || defaultRuleFor(res && res.role); }
  function ruleFor(resOrId) {
    var res = typeof resOrId === 'object' ? resOrId : resById(resOrId);
    var id = ruleIdFor(res);
    return db.rules[id] || db.rules.custom || DEFAULT_RULES.custom;
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function dayKey(x) { var t = d(x); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
  // A crew member's work grouped by calendar day of the call: paid hours as the union of bookings,
  // the longest stretch without a 30-minute gap (for the meal rule), and hours per show.
  function workDays(resId, from, to) {
    var list = db.bookings.filter(function (b) {
      return b.res === resId && b.status !== 'Released' && b.status !== 'Unavailable' && (!from || d(b.end) > d(from)) && (!to || d(b.start) < d(to));
    }).sort(function (a, b) { return d(a.start) - d(b.start); });
    var days = {}, order = [];
    list.forEach(function (b) { var k = dayKey(b.start); if (!days[k]) { days[k] = { key: k, date: at(b.start, 0), items: [] }; order.push(k); } days[k].items.push(b); });
    return order.map(function (k) {
      var it = days[k].items, spans = [];
      it.forEach(function (b) {
        var s1 = d(b.start), e1 = d(b.end), last = spans[spans.length - 1];
        if (last && s1 <= last.e) { if (e1 > last.e) { last.e = e1; last.endId = b.id; } } else spans.push({ s: s1, e: e1, startId: b.id, endId: b.id });
      });
      var hours = spans.reduce(function (a, sp) { return a + hrs(sp.s, sp.e); }, 0);
      var cont = [];
      spans.forEach(function (sp) { var l = cont[cont.length - 1]; if (l && hrs(l.e, sp.s) < 0.5) { if (sp.e > l.e) l.e = sp.e; } else cont.push({ s: sp.s, e: sp.e }); });
      var byProd = {}; it.forEach(function (b) { var pk = b.prod || ''; byProd[pk] = (byProd[pk] || 0) + hrs(b.start, b.end); });
      return {
        key: k, date: days[k].date, hours: hours, first: spans[0].s, last: spans[spans.length - 1].e,
        firstId: spans[0].startId, lastId: spans[spans.length - 1].endId,
        longest: cont.reduce(function (a, c) { return Math.max(a, hrs(c.s, c.e)); }, 0),
        // A first meal break is assumed unless a booking says "no meal" / "walking lunch"; then the
        // penalty clock starts at call. Otherwise it starts when the second meal is due.
        noMeal: it.some(function (b) { return /no meal|walking lunch|working lunch|meal penalty/i.test((b.notes || '') + ' ' + b.title); }),
        byProd: byProd, ids: it.map(function (b) { return b.id; })
      };
    });
  }
  // Wages for one crew member under their rule set. With o.prod each day is shared by the hours
  // worked on that show, so someone split across two shows is costed fairly.
  function laborFor(resId, o) {
    o = o || {};
    var res = resById(resId), rs = ruleFor(res || resId), rate = +o.rate || 65;
    var out = { name: res ? res.name : resId, role: res ? res.role || '' : '', rule: rs.name, ruleId: rs.id, rate: rate, days: 0, hours: 0, paid_hours: 0,
      straight: 0, ot: 0, dt: 0, golden: 0, weekly_ot: 0, meal_penalties: 0, meal_penalty_cost: 0, day6: 0, day7: 0, min_call_hours: 0, premium_cost: 0, wages: 0, lines: [] };
    var streak = 0, prev = null, weekStraight = {};
    workDays(res ? res.id : resId, o.from, o.to).forEach(function (dy) {
      var tot = 0; Object.keys(dy.byProd).forEach(function (k) { tot += dy.byProd[k]; });
      var share = o.prod ? (tot ? (dy.byProd[o.prod] || 0) / tot : 0) : 1;
      streak = prev && Math.round((dy.date - prev) / 864e5) === 1 ? streak + 1 : 1; prev = dy.date;
      var h = Math.max(dy.hours, rs.minCall || 0), padded = h - dy.hours;
      var g = rs.golden > 0 ? Math.max(0, h - rs.golden) : 0;
      var dt = Math.max(0, h - rs.dt) - g;
      var ot = Math.max(0, Math.min(h, rs.dt) - rs.dailyOT);
      var st = Math.min(h, rs.dailyOT);
      var wk = dayKey(mondayOf(dy.date)), before = weekStraight[wk] || 0;
      var wOT = Math.max(0, Math.min(st, before + st - rs.weeklyOT)); weekStraight[wk] = before + st; st -= wOT;
      var mult = streak >= 7 ? rs.day7X : streak >= 6 ? rs.day6X : 1;
      var base = rate * (st + ot + wOT + dt + g);
      var pay = rate * (st * mult + (ot + wOT) * Math.max(rs.otX, mult) + dt * Math.max(rs.dtX, mult) + g * Math.max(rs.goldenX, mult));
      var due = rs.mealAfter * (dy.noMeal ? 1 : 2);
      var meal = dy.longest > due ? Math.min(6, Math.ceil((dy.longest - due) / 0.5)) : 0;
      var mealCost = meal * rs.mealPenalty;
      pay += mealCost;
      if (share <= 0) return;
      out.days += 1; out.hours += dy.hours * share; out.paid_hours += h * share; out.straight += st * share; out.ot += ot * share; out.weekly_ot += wOT * share;
      out.dt += dt * share; out.golden += g * share; out.meal_penalties += meal; out.meal_penalty_cost += mealCost * share; out.min_call_hours += padded * share;
      if (streak === 6) out.day6 += 1;
      if (streak >= 7) out.day7 += 1;
      out.premium_cost += (pay - base) * share; out.wages += pay * share;
      out.lines.push({ date: dy.key, hours: round1(dy.hours), paid_hours: round1(h), straight: round1(st), ot: round1(ot + wOT), dt: round1(dt), golden: round1(g),
        meal_penalties: meal, consecutive_day: streak, multiplier: mult, share: Math.round(share * 100) / 100, wages: Math.round(pay * share) });
    });
    ['hours', 'paid_hours', 'straight', 'ot', 'dt', 'golden', 'weekly_ot', 'min_call_hours'].forEach(function (k) { out[k] = round1(out[k]); });
    out.meal_penalty_cost = Math.round(out.meal_penalty_cost); out.premium_cost = Math.round(out.premium_cost); out.wages = Math.round(out.wages);
    return out;
  }
  function crewRate(key, res) {
    try {
      var L = typeof root.ensureLabor === 'function' ? root.ensureLabor(key) : null;
      var r = (L && L.rates && L.rates[res.role]) || (typeof root.laborDefaultRate === 'function' ? root.laborDefaultRate(res.role) : null);
      if (r && r.baseHr) return { baseHr: r.baseHr, fringePct: r.fringePct || 0 };
    } catch (e) {}
    return { baseHr: 65, fringePct: 0 };
  }
  // Premium breakdown for one show's crew (Bookings tab, Muse, labor card).
  function laborBreakdown(key) {
    ensure();
    var people = {};
    db.bookings.forEach(function (b) { if (b.prod === key && b.status !== 'Released' && b.status !== 'Unavailable') { var r = resById(b.res); if (r && r.type === 'crew') people[r.id] = r; } });
    var rows = Object.keys(people).map(function (id) { var rt = crewRate(key, people[id]); var l = laborFor(id, { prod: key, rate: rt.baseHr }); l.fringe_pct = rt.fringePct; return l; });
    var tot = { wages: 0, premium_cost: 0, meal_penalty_cost: 0, hours: 0, ot: 0, dt: 0, golden: 0 };
    rows.forEach(function (r) { Object.keys(tot).forEach(function (k) { tot[k] += r[k]; }); });
    Object.keys(tot).forEach(function (k) { tot[k] = (k === 'hours' || k === 'ot' || k === 'dt' || k === 'golden') ? round1(tot[k]) : Math.round(tot[k]); });
    return { production: prodName(key), crew: rows.sort(function (a, b) { return b.wages - a.wages; }), totals: tot,
      note: 'Rule sets are planning defaults modelled on common agreements; confirm the real contract terms with labor relations.' };
  }
  // Advisories: premiums the rules will trigger (not hard conflicts).
  function ruleFindings(f) {
    ensure(); f = f || {};
    var from = f.from ? d(f.from) : addDays(weekStart(), -7), to = f.to ? d(f.to) : addDays(weekStart(), 21), out = [];
    resources('crew').forEach(function (r) {
      var rs = ruleFor(r), streak = 0, prev = null, weekly = {};
      workDays(r.id, from, to).forEach(function (dy) {
        streak = prev && Math.round((dy.date - prev) / 864e5) === 1 ? streak + 1 : 1; prev = dy.date;
        var prods = Object.keys(dy.byProd).filter(Boolean), when = dayLabel(dy.date);
        function add(kind, text) { out.push({ kind: kind, res: r.name, ids: dy.ids.slice(), prods: prods, rule: rs.name, text: text }); }
        if (dy.noMeal && dy.longest > rs.mealAfter) add('meal', r.name + ' works ' + round1(dy.longest) + ' h with no meal break on ' + when + '. Meal penalties run after ' + rs.mealAfter + ' h (' + rs.name + ').');
        else if (!dy.noMeal && dy.longest > rs.mealAfter * 2) add('meal', r.name + ' works ' + round1(dy.longest) + ' h straight on ' + when + '. A second meal is due after ' + (rs.mealAfter * 2) + ' h or penalties apply (' + rs.name + ').');
        if (rs.golden > 0 && dy.hours > rs.golden) add('golden', r.name + ' goes into golden time on ' + when + ' (' + round1(dy.hours) + ' h; golden after ' + rs.golden + ' h at ' + rs.goldenX + '×, ' + rs.name + ').');
        if (streak >= 6) add('consecutive', r.name + ' is on a ' + (streak === 6 ? '6th' : streak + 'th') + ' consecutive day on ' + when + ' (' + (streak >= 7 ? rs.day7X : rs.day6X) + '×, ' + rs.name + ').');
        if (dy.hours < (rs.minCall || 0)) add('min-call', r.name + ' is booked ' + round1(dy.hours) + ' h on ' + when + '; the ' + rs.minCall + ' h minimum call is paid (' + rs.name + ').');
        var wk = dayKey(mondayOf(dy.date)); weekly[wk] = (weekly[wk] || 0) + dy.hours;
        if (weekly[wk] > rs.weeklyOT && weekly[wk] - dy.hours <= rs.weeklyOT) add('weekly-ot', r.name + ' passes ' + rs.weeklyOT + ' h this week on ' + when + '; weekly overtime applies from here (' + rs.name + ').');
      });
    });
    if (f.prod) out = out.filter(function (x) { return x.prods.indexOf(f.prod) >= 0; });
    return out;
  }

  function conflicts(f) {
    ensure(); f = f || {};
    var out = [], live = db.bookings.filter(function (b) { return b.status !== 'Released'; });
    var byRes = {};
    live.forEach(function (b) { (byRes[b.res] = byRes[b.res] || []).push(b); });
    Object.keys(byRes).forEach(function (rid) {
      var list = byRes[rid].sort(function (a, b) { return d(a.start) - d(b.start); }), r = resById(rid);
      for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
        if (d(list[j].start) >= d(list[i].end)) break;
        var ua = list[i].status === 'Unavailable', ub = list[j].status === 'Unavailable';
        if (ua && ub) continue;
        if (ua || ub) {
          var blk = ua ? list[i] : list[j], bk = ua ? list[j] : list[i];
          out.push({ kind: 'unavailable', res: r ? r.name : rid, ids: [blk.id, bk.id], prods: [bk.prod],
            text: (r ? r.name : rid) + ' is marked unavailable ' + (hrs(blk.start, blk.end) >= 23.9 ? 'all day ' + dayLabel(blk.start) : span(blk)) + (blk.notes ? ' (' + blk.notes + ')' : '') + ' but is booked for ' + describe(bk) + '.' });
          continue;
        }
        out.push({ kind: 'double-booking', res: r ? r.name : rid, ids: [list[i].id, list[j].id], prods: [list[i].prod, list[j].prod],
          text: (r ? r.name : rid) + ' is double-booked: ' + describe(list[i]) + ' overlaps ' + describe(list[j]) + '.' });
      }
      if (r && r.type === 'crew') {
        var rs = ruleFor(r), days = workDays(r.id);
        for (var k = 0; k + 1 < days.length; k++) {
          var gap = hrs(days[k].last, days[k + 1].first);
          if (gap > 0 && gap < rs.rest) {
            var a1 = get(days[k].lastId), a2 = get(days[k + 1].firstId);
            out.push({ kind: 'turnaround', res: r.name, ids: [days[k].lastId, days[k + 1].firstId], prods: [a1 && a1.prod, a2 && a2.prod], rule: rs.name,
              text: r.name + ' gets only ' + round1(gap) + ' h rest between ' + (a1 ? describe(a1) : dayLabel(days[k].last)) + ' and ' + (a2 ? describe(a2) : dayLabel(days[k + 1].first)) + ' (' + rs.name + ': minimum ' + rs.rest + ' h).' });
          }
        }
        days.forEach(function (dy) {
          if (dy.hours > rs.maxDay) {
            var lb = get(dy.lastId);
            out.push({ kind: 'overtime', res: r.name, ids: [dy.lastId].concat(dy.ids.filter(function (x) { return x !== dy.lastId; })), prods: Object.keys(dy.byProd).filter(Boolean), rule: rs.name, excess: dy.hours - rs.maxDay,
              text: r.name + ' is booked ' + round1(dy.hours) + ' h on ' + dayLabel(dy.date) + (lb ? ', ending with ' + describe(lb) : '') + ' (over the ' + rs.maxDay + ' h maximum day, ' + rs.name + ').' });
          }
        });
      }
    });
    if (f.prod) out = out.filter(function (c) { return c.prods.indexOf(f.prod) >= 0; });
    return out;
  }
  function conflictIds() { var s = {}; conflicts().forEach(function (c) { c.ids.forEach(function (id) { s[id] = (s[id] || []).concat(c.kind); }); }); return s; }

  function findSlot(o) {
    ensure(); o = o || {};
    var minutes = Math.max(30, Math.round((+o.hours || 1) * 60));
    var cands = o.res ? [resById(o.res)].filter(Boolean) : resources(o.type || 'control');
    var after = o.after ? d(o.after) : new Date(), before = o.before ? d(o.before) : addDays(after, 14);
    var t = d(after); t.setSeconds(0, 0); t.setMinutes(Math.ceil(t.getMinutes() / SNAP_MIN) * SNAP_MIN);
    var results = [];
    for (var guard = 0; t < before && guard < 2000 && results.length < (o.limit || 3); guard++) {
      var h = t.getHours();
      if (h >= 6 && h < 23) {
        var e = addMin(t, minutes);
        for (var i = 0; i < cands.length; i++) {
          if (isFree(cands[i].id, t, e)) { results.push({ res: cands[i].name, resId: cands[i].id, start: iso(t), end: iso(e) }); break; }
        }
        if (results.length && results[results.length - 1].start === iso(t)) { t = addMin(t, Math.max(minutes, 120)); continue; }
      }
      t = addMin(t, SNAP_MIN);
    }
    return o.limit ? results : (results[0] || null);
  }
  function utilization(type, from, to) {
    ensure();
    from = from ? d(from) : weekStart(); to = to ? d(to) : addDays(from, 7);
    var rs = resources(type); if (!rs.length) return 0;
    var cap = rs.length * hrs(from, to) * ((DAY_END - 6) / 24);
    var used = 0;
    bookings({ type: type, from: from, to: to }).forEach(function (b) {
      if (b.status === 'Released' || b.status === 'Unavailable') return;
      var s = d(b.start) < from ? from : d(b.start), e = d(b.end) > to ? to : d(b.end);
      used += Math.max(0, hrs(s, e));
    });
    return cap ? Math.min(100, Math.round(used / cap * 100)) : 0;
  }
  function byProduction(key) { return bookings({ prod: key }); }

  /* ---------------- mutations ---------------- */
  function create(b) {
    ensure();
    var r = resById(b.res); if (!r) throw new Error('Unknown resource ' + b.res);
    var rec = { id: nextId(), res: r.id, prod: b.prod || null, title: String(b.title || 'Booking').slice(0, 120), start: iso(b.start), end: iso(b.end),
      status: b.status || 'Confirmed', onAir: !!b.onAir, notes: String(b.notes || '').slice(0, 1000) };
    if (d(rec.end) <= d(rec.start)) throw new Error('End must be after start');
    db.bookings.push(rec);
    logChange(rec.prod, 'Booked ' + describe(rec) + ' · ' + rec.status);
    persist(); afterChange(); return rec;
  }
  function update(id, patch) {
    var b = get(id); if (!b) throw new Error('No booking ' + id);
    var before = describe(b);
    if (patch.res) { var r = resById(patch.res); if (!r) throw new Error('Unknown resource'); b.res = r.id; }
    ['prod', 'title', 'status', 'notes'].forEach(function (k) { if (patch[k] !== undefined) b[k] = patch[k]; });
    if (patch.onAir !== undefined) b.onAir = !!patch.onAir;
    if (patch.start) b.start = iso(patch.start);
    if (patch.end) b.end = iso(patch.end);
    if (d(b.end) <= d(b.start)) b.end = iso(addMin(b.start, SNAP_MIN));
    logChange(b.prod, 'Changed ' + before + ' → ' + describe(b) + (patch.status ? ' · ' + b.status : ''));
    persist(); afterChange(); return b;
  }
  function remove(id) {
    var b = get(id); if (!b) return false;
    db.bookings = db.bookings.filter(function (x) { return x.id !== id; });
    logChange(b.prod, 'Removed ' + describe(b), 'warn');
    persist(); afterChange(); return true;
  }
  // One-click fixes for a conflict.
  function fixesFor(c) {
    var out = [];
    if (c.kind === 'double-booking') {
      var b = get(c.ids[1]), r = b && resById(b.res);
      if (b && r) {
        var alt = resources(r.type).filter(function (x) { return x.id !== r.id && isFree(x.id, b.start, b.end); })[0];
        if (alt) out.push({ label: (r.type === 'crew' ? 'Swap to ' : 'Move to free ') + alt.name, run: function () { update(b.id, { res: alt.id }); } });
        var other = get(c.ids[0]);
        if (other) out.push({ label: 'Push after ' + hm(other.end), run: function () { var dur = d(b.end) - d(b.start); update(b.id, { start: other.end, end: new Date(d(other.end).getTime() + dur) }); } });
      }
    } else if (c.kind === 'unavailable') {
      var ub = get(c.ids[1]), ur = ub && resById(ub.res);
      if (ub && ur) {
        var usub = resources(ur.type).filter(function (x) { return x.id !== ur.id && isFree(x.id, ub.start, ub.end); })[0];
        if (usub) out.push({ label: 'Swap to available ' + usub.name, run: function () { update(ub.id, { res: usub.id }); } });
        out.push({ label: 'Release the booking', run: function () { update(ub.id, { status: 'Released' }); } });
      }
    } else if (c.kind === 'turnaround') {
      var a = get(c.ids[0]), n = get(c.ids[1]), restH = (n && ruleFor(n.res).rest) || REST_HOURS;
      if (a && n) {
        var call = addMin(a.end, restH * 60);
        out.push({ label: 'Push call to ' + hm(call) + ' (' + restH + ' h rest)', run: function () { update(n.id, { start: call, end: d(n.end) > call ? n.end : addMin(call, 60) }); } });
        var rr = resById(n.res);
        var sub = rr && resources('crew').filter(function (x) { return x.id !== rr.id && isFree(x.id, n.start, n.end); })[0];
        if (sub) out.push({ label: 'Swap to available ' + sub.name, run: function () { update(n.id, { res: sub.id }); } });
      }
    } else if (c.kind === 'overtime') {
      // c.ids[0] is the booking that ends the day; wrap it earlier (or call later) by the excess.
      var o = get(c.ids[0]), ex = Math.ceil(((c.excess || 0) * 60) / SNAP_MIN) * SNAP_MIN, maxD = (o && ruleFor(o.res).maxDay) || MAX_SHIFT_HOURS;
      if (o && ex > 0 && hrs(o.start, o.end) * 60 > ex) {
        var wrap = addMin(o.end, -ex);
        out.push({ label: 'Wrap at ' + hm(wrap) + ' (' + maxD + ' h day)', run: function () { update(o.id, { end: wrap }); } });
        if (c.ids.length === 1) out.push({ label: 'Call at ' + hm(addMin(o.start, ex)) + ' instead', run: function () { update(o.id, { start: addMin(o.start, ex) }); } });
      }
    }
    return out;
  }

  /* ---------------- iCalendar ---------------- */
  function icsDate(x) { return iso(x).replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  // RFC 5545 line folding: at most 75 octets per line, continuation lines start with a space.
  function icsFold(line) {
    var out = [], cur = '', n = 0, limit = 75;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], code = line.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < line.length) { ch += line[++i]; }
      var c = ch.codePointAt(0), bytes = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
      if (n + bytes > limit) { out.push(cur); cur = ' '; n = 1; limit = 75; }
      cur += ch; n += bytes;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function toICS(f) {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meta//Muse Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Muse Schedule'];
    var stamp = icsDate(new Date());
    bookings(f).forEach(function (b) {
      var r = resById(b.res), un = b.status === 'Unavailable';
      lines.push('BEGIN:VEVENT', 'UID:' + b.id + '@muse-schedule', 'DTSTAMP:' + stamp, 'DTSTART:' + icsDate(b.start), 'DTEND:' + icsDate(b.end),
        'SUMMARY:' + icsText(un ? 'Unavailable' + (r ? ' · ' + r.name : '') : (b.onAir ? '[ON AIR] ' : '') + b.title), 'LOCATION:' + icsText(r ? r.name : ''),
        'DESCRIPTION:' + icsText(un ? (b.notes || 'Marked unavailable in Muse Schedule') : prodName(b.prod) + ' · ' + b.status + (b.notes ? '\n' + b.notes : '')),
        'STATUS:' + (b.status === 'Confirmed' || un ? 'CONFIRMED' : b.status === 'Released' ? 'CANCELLED' : 'TENTATIVE'), 'TRANSP:OPAQUE', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }
  function downloadICS(f, name) {
    try {
      var blob = new Blob([toICS(f)], { type: 'text/calendar' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name || 'muse-schedule.ics'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast('Calendar exported (.ics)');
    } catch (e) { toast('Export failed'); }
  }

  /* ---------------- compatibility: FACILITY_ROWS + NPC_DAYS for the existing board/gantt ---------------- */
  function weekStart() { return mondayOf(new Date()); }
  function regenFacilityRows() {
    if (!Array.isArray(root.FACILITY_ROWS)) return;
    var mon = weekStart(), sun = addDays(mon, 7);
    var roomTypes = {}; TYPES.forEach(function (t) { if (t.room) roomTypes[t.id] = 1; });
    var rows = [];
    db.resources.filter(function (r) { return roomTypes[r.type]; }).forEach(function (r) {
      var segs = [];
      bookings({ res: r.id, from: mon, to: sun }).forEach(function (b) {
        if (b.status === 'Released') return;
        var col = Math.max(0, Math.min(6, Math.floor((d(b.start) - mon) / 864e5)));
        var win = (b.onAir ? 'ON AIR · ' : '') + hm(b.start) + '–' + hm(b.end);
        var c = prodColor(b.prod);
        var last = segs[segs.length - 1];
        if (last && last[2] === b.title && last[5] === win && last[6] === b.prod && last[0] + last[1] === col) last[1]++;
        else segs.push([col, 1, b.title, c + '22', c, win, b.prod]);
      });
      if (segs.length) rows.push([r.name, segs]);
    });
    root.FACILITY_ROWS.length = 0;
    rows.forEach(function (x) { root.FACILITY_ROWS.push(x); });
    if (Array.isArray(root.NPC_DAYS)) {
      root.NPC_DAYS.length = 0;
      for (var i = 0; i < 7; i++) root.NPC_DAYS.push(dayShort(addDays(mon, i)));
    }
  }
  function afterChange(quiet) {
    try { regenFacilityRows(); } catch (e) {}
    try { if (typeof root.renderRoutingBoard === 'function') root.renderRoutingBoard(); } catch (e) {}
    if (quiet) return;
    // Master Schedule: re-render the whole tab so the tab badge and conflict bubble update too.
    try { if (document.getElementById('scSchedule') && typeof root.renderSchedule === 'function') root.renderSchedule(); else if (document.getElementById('scSchedule')) renderInto(document.getElementById('scheduleGantt')); } catch (e) {}
    try {
      var act = document.querySelector('.view-pane.active'), k = act && act.id.replace(/^view-/, '');
      if (k && P()[k] && root.projSubTab && root.projSubTab[k] === 'bookings') root.renderProjectView(k);
    } catch (e) {}
  }

  /* ---------------- summaries for Muse ---------------- */
  function summary() {
    ensure();
    var mon = weekStart(), sun = addDays(mon, 7), wk = bookings({ from: mon, to: sun });
    var util = {}; TYPES.forEach(function (t) { util[t.label] = utilization(t.id, mon, sun) + '%'; });
    return {
      week: dayLabel(mon) + ' – ' + dayLabel(addDays(mon, 6)),
      bookings_this_week: wk.length,
      on_air_this_week: wk.filter(function (b) { return b.onAir; }).map(function (b) { var r = resById(b.res); return (r ? r.name : '') + ' · ' + b.title + ' · ' + span(b); }),
      holds: wk.filter(function (b) { return b.status === 'Hold' || b.status === 'Tentative'; }).length,
      utilization: util,
      conflicts: conflicts().map(function (c) { return { kind: c.kind, text: c.text }; }),
      rule_advisories: ruleFindings().length,
      crew_unavailable_this_week: bookings({ from: mon, to: sun, status: 'Unavailable' }).map(function (b) { var r = resById(b.res); return (r ? r.name : b.res) + ' · ' + span(b) + (b.notes ? ' · ' + b.notes : ''); }),
      labor_rule_sets: Object.keys(db.rules).map(function (k) { return db.rules[k].name + ': ' + ruleSummary(db.rules[k]); }),
      resource_types: TYPES.map(function (t) { return t.label + ' (' + resources(t.id).length + ')'; })
    };
  }
  function brief(key) {
    if (!key) return summary();
    var list = byProduction(key);
    return {
      production: prodName(key),
      bookings: list.map(function (b) { var r = resById(b.res); return { id: b.id, resource: r ? r.name : b.res, type: r ? r.type : '', title: b.title, start: b.start, end: b.end, when: span(b), status: b.status, on_air: b.onAir, notes: b.notes || undefined }; }),
      conflicts: conflicts({ prod: key }).map(function (c) { return { kind: c.kind, text: c.text }; }),
      rule_advisories: ruleFindings({ prod: key }).map(function (a) { return a.text; }),
      crew_labor: (function () {
        var lb = laborBreakdown(key);
        return { totals: lb.totals, crew: lb.crew.map(function (c) { return { name: c.name, role: c.role, rule: c.rule, hours: c.hours, ot: c.ot, dt: c.dt, golden: c.golden, meal_penalties: c.meal_penalties, est_wages: c.wages }; }), note: lb.note };
      })()
    };
  }

  /* =====================================================================================
     UI
     ===================================================================================== */
  var ui = { view: 'week', mode: null, anchor: null, q: '', prod: '', type: '', collapsed: { crew: false }, panel: null, slotResult: null, focusRes: null };
  function isPhone() { return root.matchMedia && root.matchMedia('(max-width: 700px)').matches; }
  function range() {
    var a = ui.anchor ? d(ui.anchor) : new Date(); a.setHours(0, 0, 0, 0);
    if (ui.view === 'day') return { from: a, to: addDays(a, 1), days: 1 };
    var m = mondayOf(a); return { from: m, to: addDays(m, 7), days: 7 };
  }
  function geometry() {
    var hoursPerDay = DAY_END - DAY_START;
    var hourW = ui.view === 'day' ? 64 : 16;
    return { hourW: hourW, dayW: hourW * hoursPerDay, hoursPerDay: hoursPerDay };
  }
  function xFor(t, from, g) {
    var dt = d(t), day = Math.floor((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()) - from) / 864e5);
    var h = dt.getHours() + dt.getMinutes() / 60;
    h = Math.max(DAY_START, Math.min(DAY_END, h));
    return day * g.dayW + (h - DAY_START) * g.hourW;
  }
  function timeAtX(x, from, g) {
    var day = Math.floor(x / g.dayW), within = (x - day * g.dayW) / g.hourW + DAY_START;
    var t = addDays(from, day); var mins = Math.round(within * 60 / SNAP_MIN) * SNAP_MIN;
    t.setHours(0, 0, 0, 0); return addMin(t, mins);
  }
  function kpisHTML() {
    var mon = weekStart(), sun = addDays(mon, 7), wk = bookings({ from: mon, to: sun }).filter(function (b) { return b.status !== 'Unavailable'; }), cf = conflicts();
    var holds = wk.filter(function (b) { return b.status === 'Hold' || b.status === 'Tentative'; }).length;
    return '<div class="sc-kpis">' +
      '<div><span>Bookings this week</span><b>' + wk.length + '</b></div>' +
      '<div><span>Control rooms</span><b>' + utilization('control', mon, sun) + '%</b><i>utilization</i></div>' +
      '<div><span>Circuits</span><b>' + utilization('circuit', mon, sun) + '%</b><i>utilization</i></div>' +
      '<div><span>Crew</span><b>' + utilization('crew', mon, sun) + '%</b><i>utilization</i></div>' +
      '<button type="button" class="sc-kpi-btn' + (cf.length ? ' is-alert' : '') + '" onclick="MuseSchedule.panel(\'conflicts\')"><span>Conflicts</span><b>' + cf.length + '</b><i>' + (cf.length ? 'Review & fix →' : 'All clear') + '</i></button>' +
      '<div><span>Holds & tentative</span><b>' + holds + '</b></div></div>';
  }
  function toolbarHTML(r) {
    var ks = prodKeys();
    var label = ui.view === 'day' ? dayLabel(r.from) : dayLabel(r.from) + ' – ' + dayLabel(addDays(r.from, 6));
    return '<div class="sc-toolbar">' +
      '<div class="sc-tb-group"><button type="button" class="sc-icon-btn" onclick="MuseSchedule.nav(-1)" aria-label="Previous">‹</button>' +
        '<button type="button" class="sc-btn" onclick="MuseSchedule.nav(0)">Today</button>' +
        '<button type="button" class="sc-icon-btn" onclick="MuseSchedule.nav(1)" aria-label="Next">›</button>' +
        '<span class="sc-range">' + esc(label) + '</span></div>' +
      '<div class="sc-tb-group"><div class="sc-seg" role="group" aria-label="View">' +
        ['day', 'week', 'list'].map(function (v) { return '<button type="button" class="' + (ui.view === v ? 'on' : '') + '" aria-pressed="' + (ui.view === v) + '" onclick="MuseSchedule.setView(\'' + v + '\')">' + v.charAt(0).toUpperCase() + v.slice(1) + '</button>'; }).join('') + '</div>' +
        '<input type="search" class="sc-input" placeholder="Search bookings" aria-label="Search bookings" value="' + esc(ui.q) + '" oninput="MuseSchedule.filter(\'q\',this.value)">' +
        '<select class="sc-select" aria-label="Production" onchange="MuseSchedule.filter(\'prod\',this.value)"><option value="">All shows</option>' + ks.map(function (k) { return '<option value="' + k + '"' + (ui.prod === k ? ' selected' : '') + '>' + esc(prodName(k)) + '</option>'; }).join('') + '</select>' +
        '<select class="sc-select" aria-label="Resource type" onchange="MuseSchedule.filter(\'type\',this.value)"><option value="">All resources</option>' + TYPES.map(function (t) { return '<option value="' + t.id + '"' + (ui.type === t.id ? ' selected' : '') + '>' + t.label + '</option>'; }).join('') + '</select></div>' +
      '<div class="sc-tb-group"><button type="button" class="sc-btn" onclick="MuseSchedule.myView()">My schedule</button>' +
        '<button type="button" class="sc-btn" onclick="MuseSchedule.panel(\'subscribe\')">Subscribe</button>' +
        '<button type="button" class="sc-btn" onclick="MuseSchedule.panel(\'rules\')">Labor rules</button>' +
        '<button type="button" class="sc-btn" onclick="MuseSchedule.panel(\'slot\')">Find a slot</button>' +
        '<button type="button" class="sc-btn" onclick="MuseSchedule.exportICS()">Export .ics</button>' +
        '<button type="button" class="sc-btn sc-btn-primary" onclick="MuseSchedule.openEditor()">+ New booking</button></div></div>';
  }
  function barHTML(b, r, g, from, cmap) {
    var x1 = d(b.start) < from ? 0 : xFor(b.start, from, g), x2 = d(b.end) > addDays(from, g.days || 7) ? (g.days || 7) * g.dayW : xFor(b.end, from, g);
    var w = Math.max(10, x2 - x1), c = prodColor(b.prod), cf = cmap[b.id];
    var cls = 'sc-bar' + (b.status === 'Hold' || b.status === 'Tentative' ? ' is-hold' : '') + (b.status === 'Released' ? ' is-released' : '') + (b.status === 'Unavailable' ? ' is-unavail' : '') + (cf ? ' is-conflict' : '') + (b.onAir ? ' is-onair' : '');
    var tip = b.title + '\n' + (r ? r.name : '') + ' · ' + span(b) + '\n' + prodName(b.prod) + ' · ' + b.status + (cf ? '\n⚠ ' + cf.join(', ') : '') + (b.notes ? '\n' + b.notes : '');
    return '<button type="button" class="' + cls + '" data-id="' + b.id + '" style="left:' + x1 + 'px;width:' + w + 'px;--c:' + c + '" title="' + esc(tip) + '" aria-label="' + esc(tip.replace(/\n/g, ' · ')) + '">' +
      (cf ? '<span class="sc-warn" aria-hidden="true">⚠</span>' : '') + (b.onAir ? '<span class="sc-onair">ON AIR</span>' : '') +
      '<span class="sc-bar-t">' + esc(b.title) + '</span>' + (w >= 150 ? '<span class="sc-bar-h">' + hm(b.start) + '–' + hm(b.end) + '</span>' : '') +
      '<span class="sc-resize" data-resize="1" aria-hidden="true"></span></button>';
  }
  function timelineHTML(r, filt) {
    var g = geometry(); g.days = r.days;
    var width = r.days * g.dayW, cmap = conflictIds(), now = new Date();
    var head = '<div class="sc-head" style="width:' + width + 'px">';
    for (var i = 0; i < r.days; i++) {
      var day = addDays(r.from, i), today = sameDay(day, now);
      head += '<div class="sc-day' + (today ? ' is-today' : '') + '" style="width:' + g.dayW + 'px"><b>' + esc(ui.view === 'day' ? dayLabel(day) : dayShort(day)) + '</b><div class="sc-hours">';
      var step = ui.view === 'day' ? 1 : 3;
      for (var h = DAY_START; h < DAY_END; h += step) { var hw = Math.min(step, DAY_END - h) * g.hourW; head += '<span style="width:' + hw + 'px">' + (hw >= 22 ? pad(h) : '') + '</span>'; }
      head += '</div></div>';
    }
    head += '</div>';
    var rows = '';
    TYPES.forEach(function (t) {
      if (filt.type && filt.type !== t.id) return;
      var rs = resources(t.id);
      var anyB = bookings({ type: t.id, from: r.from, to: r.to, prod: filt.prod, q: filt.q });
      if (filt.prod || filt.q) rs = rs.filter(function (x) { return anyB.some(function (b) { return b.res === x.id; }); });
      if (!rs.length) return;
      var col = !!ui.collapsed[t.id];
      rows += '<div class="sc-group"><button type="button" class="sc-group-h" aria-expanded="' + !col + '" onclick="MuseSchedule.toggleGroup(\'' + t.id + '\')"><span class="sc-caret">' + (col ? '▸' : '▾') + '</span>' + t.label + ' <i>' + rs.length + '</i></button></div>';
      if (col) return;
      rs.forEach(function (res) {
        var bs = anyB.filter(function (b) { return b.res === res.id; });
        rows += '<div class="sc-row' + (ui.focusRes === res.name ? ' is-focus' : '') + '" data-res="' + res.id + '" data-type="' + t.id + '"><div class="sc-name" title="' + esc(res.name + (res.role ? ' · ' + res.role : '')) + '"><b>' + esc(res.name) + '</b>' + (res.role ? '<span>' + esc(res.role) + '</span>' : '') + '</div>' +
          '<div class="sc-track" style="width:' + width + 'px">' + bs.map(function (b) { return barHTML(b, res, g, r.from, cmap); }).join('') + '</div></div>';
      });
    });
    var nowX = (now >= r.from && now < r.to) ? xFor(now, r.from, g) : -1;
    return '<div class="sc-scroll" id="scScroll"><div class="sc-grid" style="--dayw:' + g.dayW + 'px;--hourw:' + g.hourW + 'px">' +
      '<div class="sc-headrow"><div class="sc-corner">Resource</div>' + head + '</div>' +
      '<div class="sc-body" id="scBody">' + (rows || '<p class="sc-empty">No bookings match.</p>') +
      (nowX >= 0 ? '<div class="sc-now" style="left:calc(var(--namew) + ' + nowX + 'px)" aria-hidden="true"></div>' : '') + '</div></div></div>';
  }
  function listHTML(r, filt) {
    var bs = bookings({ from: r.from, to: r.to, prod: filt.prod, type: filt.type, q: filt.q }), cmap = conflictIds();
    if (!bs.length) return '<p class="sc-empty">No bookings in this range.</p>';
    var out = '', last = '';
    bs.forEach(function (b) {
      var dl = dayLabel(b.start), res = resById(b.res);
      if (dl !== last) { out += '<h4 class="sc-list-day">' + esc(dl) + '</h4>'; last = dl; }
      out += '<button type="button" class="sc-li' + (cmap[b.id] ? ' is-conflict' : '') + (b.status === 'Hold' || b.status === 'Tentative' ? ' is-hold' : '') + '" style="--c:' + prodColor(b.prod) + '" onclick="MuseSchedule.openEditor(\'' + b.id + '\')">' +
        '<span class="sc-li-time">' + hm(b.start) + '<br>' + hm(b.end) + '</span><span class="sc-li-main"><b>' + (cmap[b.id] ? '⚠ ' : '') + esc(b.title) + '</b>' +
        '<span>' + esc((res ? res.name : '') + ' · ' + prodName(b.prod) + ' · ' + b.status) + '</span></span>' + (b.onAir ? '<span class="sc-onair">ON AIR</span>' : '') + '</button>';
    });
    return '<div class="sc-list">' + out + '</div>';
  }
  function advisoriesHTML() {
    var adv = ruleFindings({ prod: ui.prod || undefined });
    if (!adv.length) return '';
    var names = { meal: 'Meal penalty', golden: 'Golden time', consecutive: 'Consecutive days', 'min-call': 'Minimum call', 'weekly-ot': 'Weekly overtime' };
    return '<h4 class="sc-sub-h">Rule advisories <span>' + adv.length + '</span></h4><p class="sc-help">Premiums the labor rules will trigger. Not conflicts, but worth a look.</p>' +
      adv.slice(0, 14).map(function (a) { return '<div class="sc-cf is-advisory"><p class="sc-cf-k">' + esc(names[a.kind] || a.kind) + ' · ' + esc(a.res) + '</p><p>' + esc(a.text) + '</p></div>'; }).join('') +
      (adv.length > 14 ? '<p class="sc-help">+ ' + (adv.length - 14) + ' more.</p>' : '');
  }
  function panelHTML() {
    if (ui.panel === 'conflicts') {
      var cf = conflicts();
      return '<aside class="sc-panel" aria-label="Conflicts"><div class="sc-panel-h"><h3>Conflicts <span>' + cf.length + '</span></h3><button type="button" class="sc-icon-btn" onclick="MuseSchedule.panel(null)" aria-label="Close">✕</button></div>' +
        (cf.length ? cf.map(function (c, i) {
          var fx = fixesFor(c);
          return '<div class="sc-cf is-' + c.kind + '"><p class="sc-cf-k">' + ({ 'double-booking': 'Double-booking', turnaround: 'Crew rest', overtime: 'Maximum day', unavailable: 'Unavailable' })[c.kind] + ' · ' + esc(c.res) + '</p><p>' + esc(c.text) + '</p><div class="sc-cf-btns">' +
            fx.map(function (f, j) { return '<button type="button" class="sc-btn sc-btn-primary" onclick="MuseSchedule.fix(' + i + ',' + j + ')">' + esc(f.label) + '</button>'; }).join('') +
            '<button type="button" class="sc-btn" onclick="MuseSchedule.openEditor(\'' + c.ids[c.ids.length - 1] + '\')">Open</button></div></div>';
        }).join('') : '<p class="sc-empty">No conflicts. Every resource, crew rest period and shift length is within limits.</p>') + advisoriesHTML() + '</aside>';
    }
    if (ui.panel === 'subscribe') return subscribeHTML();
    if (ui.panel === 'rules') return rulesHTML();
    if (ui.panel === 'slot') {
      var res = ui.slotResult;
      var now = new Date(); now.setMinutes(0, 0, 0);
      return '<aside class="sc-panel" aria-label="Find a slot"><div class="sc-panel-h"><h3>Find a slot</h3><button type="button" class="sc-icon-btn" onclick="MuseSchedule.panel(null)" aria-label="Close">✕</button></div>' +
        '<form class="sc-form" onsubmit="event.preventDefault();MuseSchedule.runFind(this)">' +
        '<label>Resource type<select name="type">' + TYPES.map(function (t) { return '<option value="' + t.id + '">' + t.label + '</option>'; }).join('') + '</select></label>' +
        '<label>Duration (hours)<input name="hours" type="number" min="0.5" max="24" step="0.5" value="4"></label>' +
        '<label>Earliest start<input name="after" type="datetime-local" value="' + localInput(addMin(now, 60)) + '"></label>' +
        '<button type="submit" class="sc-btn sc-btn-primary">Find earliest</button></form>' +
        (res ? (res.length ? '<div class="sc-slots">' + res.map(function (s, i) {
          return '<div class="sc-slot"><div><b>' + esc(s.res) + '</b><span>' + esc(dayLabel(s.start) + ' · ' + hm(s.start) + '–' + hm(s.end)) + '</span></div><button type="button" class="sc-btn sc-btn-primary" onclick="MuseSchedule.bookSlot(' + i + ')">Book</button></div>';
        }).join('') + '</div>' : '<p class="sc-empty">Nothing free in the next 14 days.</p>') : '') + '</aside>';
    }
    return '';
  }
  function renderInto(host) {
    if (!host) return; ensure();
    if (ui.mode === 'crew') { host.innerHTML = '<div class="sc-app sc-crewapp" id="scSchedule">' + crewViewHTML() + '</div>'; return; }
    if (!ui.userView) ui.view = isPhone() ? 'list' : 'week';   // phones start on the agenda list
    var r = range();
    if (ui.view === 'list') { var m = ui.anchor ? mondayOf(ui.anchor) : weekStart(); r = { from: m, to: addDays(m, 7), days: 7 }; }
    var filt = { prod: ui.prod, type: ui.type, q: ui.q };
    var sx = 0, sy = 0, old = document.getElementById('scScroll'); if (old) { sx = old.scrollLeft; sy = old.scrollTop; }
    host.innerHTML = '<div class="sc-app" id="scSchedule">' +
      '<div class="sc-title"><div><h2>Muse Schedule</h2><p>Facilities, circuits, kit and crew on one timeline. Drag to move, drag the edge to resize, double-click empty space to book.</p></div></div>' +
      kpisHTML() + toolbarHTML(r) +
      '<div class="sc-main' + (ui.panel ? ' has-panel' : '') + '"><div class="sc-canvas">' + (ui.view === 'list' ? listHTML(r, filt) : timelineHTML(r, filt)) + '</div>' + panelHTML() + '</div></div>';
    var sc = document.getElementById('scScroll');
    if (sc) {
      if (sx || sy) { sc.scrollLeft = sx; sc.scrollTop = sy; }
      else if (ui.view === 'week') { var g = geometry(), now = new Date(), rr = range(); if (now >= rr.from && now < rr.to) sc.scrollLeft = Math.max(0, xFor(now, rr.from, g) - 260); }
      else if (ui.view === 'day') sc.scrollLeft = Math.max(0, (8 - DAY_START) * geometry().hourW);
      bindDrag(sc, r);
    }
  }

  /* ---------------- drag / resize / create (pointer events) ---------------- */
  function bindDrag(sc, r) {
    var g = geometry(); g.days = r.days;
    var st = null;
    sc.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var bar = e.target.closest('.sc-bar'), track = e.target.closest('.sc-track');
      if (bar) {
        var b = get(bar.getAttribute('data-id')); if (!b) return;
        st = { kind: e.target.getAttribute('data-resize') ? 'resize' : 'move', bar: bar, b: b, x0: e.clientX, y0: e.clientY, moved: false, left: parseFloat(bar.style.left), width: parseFloat(bar.style.width), row: bar.closest('.sc-row') };
        try { bar.setPointerCapture(e.pointerId); } catch (x) {}
      } else if (track && e.pointerType === 'mouse') {
        var rect = track.getBoundingClientRect();
        st = { kind: 'create', track: track, x0: e.clientX, left: e.clientX - rect.left, row: track.closest('.sc-row'), moved: false };
      }
    });
    sc.addEventListener('pointermove', function (e) {
      if (!st) return;
      var dx = e.clientX - st.x0;
      if (!st.moved && Math.abs(dx) < 4 && Math.abs((e.clientY - (st.y0 || e.clientY))) < 4) return;
      st.moved = true;
      var snapPx = g.hourW * SNAP_MIN / 60, sdx = Math.round(dx / snapPx) * snapPx;
      if (st.kind === 'move') {
        st.bar.style.transform = 'translateX(' + sdx + 'px)'; st.bar.classList.add('is-dragging');
        var over = document.elementFromPoint(e.clientX, e.clientY), row = over && over.closest && over.closest('.sc-row');
        sc.querySelectorAll('.sc-row.is-target').forEach(function (x) { x.classList.remove('is-target'); });
        if (row && row !== st.row && row.getAttribute('data-type') === st.row.getAttribute('data-type')) { row.classList.add('is-target'); st.target = row; } else st.target = null;
        st.dx = sdx;
      } else if (st.kind === 'resize') {
        st.bar.style.width = Math.max(snapPx, st.width + sdx) + 'px'; st.dx = sdx;
      } else if (st.kind === 'create') {
        if (!st.ghost) { st.ghost = document.createElement('div'); st.ghost.className = 'sc-ghost'; st.track.appendChild(st.ghost); }
        var a = Math.min(st.left, st.left + dx), w = Math.abs(dx);
        st.ghost.style.left = a + 'px'; st.ghost.style.width = w + 'px';
      }
    });
    function end(e) {
      if (!st) return;
      var s = st; st = null;
      if (s.kind === 'create') {
        if (s.ghost) {
          var a = parseFloat(s.ghost.style.left), w = parseFloat(s.ghost.style.width); s.ghost.remove();
          if (w > g.hourW / 4) {
            var t1 = timeAtX(a, r.from, g), t2 = timeAtX(a + w, r.from, g); if (t2 <= t1) t2 = addMin(t1, 60);
            openEditor(null, { res: s.row.getAttribute('data-res'), start: t1, end: t2, prod: ui.prod || '' });
          }
        }
        return;
      }
      if (!s.moved) { openEditor(s.b.id); return; }
      var mins = Math.round((s.dx || 0) / g.hourW * 60 / SNAP_MIN) * SNAP_MIN;
      try {
        if (s.kind === 'move') {
          var patch = { start: addMin(s.b.start, mins), end: addMin(s.b.end, mins) };
          if (s.target) patch.res = s.target.getAttribute('data-res');
          update(s.b.id, patch); toast('Moved · ' + span(get(s.b.id)));
        } else {
          update(s.b.id, { end: addMin(s.b.end, mins) }); toast('Resized · ' + span(get(s.b.id)));
        }
      } catch (x) { toast(x.message); renderInto(document.getElementById('scheduleGantt')); }
    }
    sc.addEventListener('pointerup', end);
    sc.addEventListener('pointercancel', function () { if (st && st.bar) { st.bar.style.transform = ''; st.bar.classList.remove('is-dragging'); } if (st && st.ghost) st.ghost.remove(); st = null; });
    sc.addEventListener('dblclick', function (e) {
      var track = e.target.closest('.sc-track'); if (!track || e.target.closest('.sc-bar')) return;
      var rect = track.getBoundingClientRect(), t1 = timeAtX(e.clientX - rect.left, r.from, g);
      openEditor(null, { res: track.closest('.sc-row').getAttribute('data-res'), start: t1, end: addMin(t1, 120), prod: ui.prod || '' });
    });
  }

  /* ---------------- editor dialog ---------------- */
  var lastFocus = null;
  function openEditor(id, preset) {
    ensure();
    var b = id ? get(id) : null; preset = preset || {};
    var now = new Date(); now.setMinutes(0, 0, 0);
    var v = b ? b : { res: preset.res || (db.resources[0] && db.resources[0].id), prod: preset.prod || '', title: preset.title || '', start: preset.start || addMin(now, 60), end: preset.end || addMin(now, 180), status: preset.status || 'Confirmed', onAir: false, notes: '' };
    closeEditor(true);
    lastFocus = document.activeElement;
    var ov = document.createElement('div'); ov.className = 'sc-modal'; ov.id = 'scEditor';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeEditor(); });
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); closeEditor(); } });
    var resOpts = TYPES.map(function (t) {
      return '<optgroup label="' + t.label + '">' + resources(t.id).map(function (r) { return '<option value="' + r.id + '"' + (r.id === v.res ? ' selected' : '') + '>' + esc(r.name + (r.role ? ' · ' + r.role : '')) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    ov.innerHTML = '<form class="sc-dialog" role="dialog" aria-modal="true" aria-labelledby="scEdTitle" onsubmit="event.preventDefault();MuseSchedule.saveEditor(this)">' +
      '<input type="hidden" name="id" value="' + (b ? b.id : '') + '">' +
      '<div class="sc-dialog-h"><h2 id="scEdTitle">' + (b ? 'Edit booking' : 'New booking') + '</h2><button type="button" class="sc-icon-btn" onclick="MuseSchedule.closeEditor()" aria-label="Close">✕</button></div>' +
      '<label>Title<input name="title" required maxlength="120" value="' + esc(v.title) + '" placeholder="e.g. Keynote uplink"></label>' +
      '<div class="sc-grid2"><label>Resource<select name="res" onchange="MuseSchedule.checkEditor(this.form)">' + resOpts + '</select></label>' +
      '<label>Production<select name="prod"><option value="">— None —</option>' + prodKeys().map(function (k) { return '<option value="' + k + '"' + (k === v.prod ? ' selected' : '') + '>' + esc(prodName(k)) + '</option>'; }).join('') + '</select></label>' +
      '<label>Start<input name="start" type="datetime-local" step="1800" required value="' + localInput(v.start) + '" onchange="MuseSchedule.checkEditor(this.form)"></label>' +
      '<label>End<input name="end" type="datetime-local" step="1800" required value="' + localInput(v.end) + '" onchange="MuseSchedule.checkEditor(this.form)"></label>' +
      '<label>Status<select name="status">' + STATUSES.map(function (s) { return '<option' + (s === v.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
      '<label class="sc-check"><input type="checkbox" name="onAir"' + (v.onAir ? ' checked' : '') + '> On air</label></div>' +
      '<label>Notes<textarea name="notes" rows="2" maxlength="1000">' + esc(v.notes || '') + '</textarea></label>' +
      '<div class="sc-ed-warn" id="scEdWarn" role="status"></div>' +
      '<div class="sc-dialog-btns">' + (b ? '<button type="button" class="sc-btn sc-btn-danger" onclick="MuseSchedule.deleteEditor(\'' + b.id + '\')">Delete</button>' : '') +
      '<span class="sc-flex"></span><button type="button" class="sc-btn" onclick="MuseSchedule.closeEditor()">Cancel</button><button type="submit" class="sc-btn sc-btn-primary">Save</button></div></form>';
    document.body.appendChild(ov);
    var f = ov.querySelector('form'); checkEditor(f);
    setTimeout(function () { var t = f.querySelector('[name=title]'); if (t) t.focus(); }, 20);
    // keep focus inside the dialog
    f.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var els = f.querySelectorAll('input:not([type=hidden]),select,textarea,button'), first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  function closeEditor(silent) {
    var ov = document.getElementById('scEditor'); if (ov) ov.remove();
    if (!silent && lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  function checkEditor(f) {
    var w = document.getElementById('scEdWarn'); if (!w || !f) return;
    var s = new Date(f.start.value), e = new Date(f.end.value), id = f.id.value, res = resById(f.res.value);
    if (isNaN(s) || isNaN(e) || e <= s) { w.innerHTML = '<p>End must be after start.</p>'; return; }
    var clash = db.bookings.filter(function (b) { return res && b.res === res.id && b.id !== id && b.status !== 'Released' && overlap(b.start, b.end, s, e); });
    if (!clash.length) { w.innerHTML = res ? '<p class="is-ok">✓ ' + esc(res.name) + ' is free ' + hm(s) + '–' + hm(e) + '.</p>' : ''; return; }
    var alt = resources(res.type).filter(function (x) { return x.id !== res.id && isFree(x.id, s, e, id); })[0];
    w.innerHTML = '<p>⚠ ' + esc(res.name) + ' is already booked: ' + clash.map(function (c) { return esc(c.title + ' (' + hm(c.start) + '–' + hm(c.end) + ')'); }).join(', ') + '.</p>' +
      (alt ? '<button type="button" class="sc-btn" onclick="var f=this.closest(\'form\');f.res.value=\'' + alt.id + '\';MuseSchedule.checkEditor(f)">Use free ' + esc(alt.name) + '</button>' : '');
  }
  function saveEditor(f) {
    var data = { res: f.res.value, prod: f.prod.value || null, title: f.title.value.trim(), start: new Date(f.start.value), end: new Date(f.end.value), status: f.status.value, onAir: f.onAir.checked, notes: f.notes.value.trim() };
    if (isNaN(data.start) || isNaN(data.end) || data.end <= data.start) { toast('End must be after start'); return; }
    try {
      if (f.id.value) update(f.id.value, data); else create(data);
      closeEditor(); toast(f.id.value ? 'Booking updated' : 'Booked ' + (resById(data.res) || {}).name);
    } catch (e) { toast(e.message); }
  }

  /* ---------------- per-production pane ---------------- */
  function projectPaneHTML(key) {
    ensure();
    var list = byProduction(key), cf = conflicts({ prod: key }), cmap = conflictIds();
    var now = new Date(), upcoming = list.filter(function (b) { return d(b.end) >= addDays(now, -1); });
    var byType = {}; list.forEach(function (b) { var r = resById(b.res); var t = r ? r.type : 'other'; byType[t] = (byType[t] || 0) + 1; });
    var summary = TYPES.filter(function (t) { return byType[t.id]; }).map(function (t) { return '<span class="sc-chip">' + t.label + ' · ' + byType[t.id] + '</span>'; }).join('');
    var shown = upcoming.length ? upcoming : list;
    var rows = shown.slice(0, 12).map(function (b) {
      var r = resById(b.res);
      return '<button type="button" class="sc-li' + (cmap[b.id] ? ' is-conflict' : '') + (b.status === 'Hold' || b.status === 'Tentative' ? ' is-hold' : '') + '" style="--c:' + prodColor(b.prod) + '" onclick="MuseSchedule.openEditor(\'' + b.id + '\')">' +
        '<span class="sc-li-time">' + esc(dayShort(b.start)) + '<br>' + hm(b.start) + '–' + hm(b.end) + '</span><span class="sc-li-main"><b>' + (cmap[b.id] ? '⚠ ' : '') + esc(b.title) + '</b><span>' + esc((r ? r.name : '') + ' · ' + b.status) + '</span></span>' + (b.onAir ? '<span class="sc-onair">ON AIR</span>' : '') + '</button>';
    }).join('');
    return '<section class="sc-card"><div class="sc-card-h"><div><h3>Resource bookings</h3><p>' + list.length + ' booking' + (list.length === 1 ? '' : 's') + ' in Muse Schedule' + (upcoming.length && upcoming.length < list.length ? ' · showing upcoming' : '') + '</p></div>' +
        '<div class="sc-tb-group"><button type="button" class="sc-btn" onclick="MuseSchedule.exportICS(\'' + key + '\')">Export .ics</button><button type="button" class="sc-btn" onclick="MuseSchedule.openFor(\'' + key + '\')">Open in Muse Schedule</button>' +
        '<button type="button" class="sc-btn sc-btn-primary" onclick="MuseSchedule.openEditor(null,{prod:\'' + key + '\'})">Book resource</button></div></div>' +
        (summary ? '<div class="sc-chips">' + summary + '</div>' : '') +
        (cf.length ? '<div class="sc-cf-list">' + cf.map(function (c) { return '<div class="sc-cf is-' + c.kind + '"><p>⚠ ' + esc(c.text) + '</p></div>'; }).join('') + '<button type="button" class="sc-btn sc-btn-primary" onclick="MuseSchedule.openFor(\'' + key + '\',\'conflicts\')">Resolve in Muse Schedule</button></div>' : '') +
        (rows ? '<div class="sc-list">' + rows + '</div>' + (shown.length > 12 ? '<button type="button" class="sc-btn sc-more" onclick="MuseSchedule.openFor(\'' + key + '\')">Show all ' + shown.length + ' in Muse Schedule →</button>' : '') : '<p class="sc-empty">Nothing booked yet for this show.</p>') + '</section>' + premiumsHTML(key);
  }

  /* ---------------- crew self-service ("My schedule") ---------------- */
  function readMe() { try { return localStorage.getItem(ME_KEY) || ''; } catch (e) { return ''; } }
  function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }
  function crewRes(name) {
    if (!name) return null;
    var r = resById(name) || resById('crew-' + slug(name));
    if (r && r.type === 'crew') return r;
    var q = slug(name);
    return resources('crew').filter(function (x) { return slug(x.name) === q || slug(x.name).indexOf(q) >= 0; })[0] || null;
  }
  function crewCalls(name, from, to) {
    ensure();
    var r = crewRes(name); if (!r) return [];
    var f = from ? d(from) : addDays(new Date(), -1), t = to ? d(to) : addDays(new Date(), 21);
    var cf = conflicts().filter(function (c) { return c.res === r.name; });
    var adv = ruleFindings({ from: f, to: t }).filter(function (c) { return c.res === r.name; });
    return bookings({ res: r.id, from: f, to: t }).map(function (b) {
      var rooms = b.prod ? db.bookings.filter(function (x) {
        var xr = resById(x.res);
        return x.prod === b.prod && xr && /control|audio|remi|mobile/.test(xr.type) && x.status !== 'Released' && overlap(x.start, x.end, b.start, b.end);
      }).map(function (x) { return resById(x.res).name; }) : [];
      var p = P()[b.prod];
      return { id: b.id, title: b.title, show: b.prod ? prodName(b.prod) : null, prod: b.prod, start: b.start, end: b.end, status: b.status, on_air: !!b.onAir,
        notes: b.notes || '', rooms: uniq(rooms), venue: p ? (p.venue || '') : '', rule: ruleFor(r).name,
        warnings: cf.filter(function (c) { return c.ids.indexOf(b.id) >= 0; }).map(function (c) { return c.text; }),
        advisories: adv.filter(function (c) { return c.ids.indexOf(b.id) >= 0; }).map(function (c) { return c.text; }) };
    });
  }
  function crewViewHTML() {
    var crew = resources('crew').slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var r = crewRes(ui.crew) || crewRes(readMe()) || crew[0];
    if (!r) return '<p class="sc-empty">No crew in Muse Schedule yet.</p>';
    ui.crew = r.name;
    var tab = ui.crewTab || 'calls', rs = ruleFor(r), remembered = readMe() === r.name;
    var head = '<div class="sc-crew-h">' +
      '<button type="button" class="sc-btn" onclick="MuseSchedule.exitCrew()">‹ Timeline</button>' +
      '<div class="sc-crew-id"><h2>My schedule</h2><p>' + esc(r.role || 'Crew') + ' · ' + esc(rs.name) + '</p></div>' +
      '<label class="sc-crew-pick">Crew member<select class="sc-select" onchange="MuseSchedule.myView(this.value)">' +
        crew.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.id === r.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="sc-check sc-me"><input type="checkbox"' + (remembered ? ' checked' : '') + ' onchange="MuseSchedule.rememberMe(this.checked)"> This is me on this device</label>' +
      '<button type="button" class="sc-btn" data-scope="crew:' + esc(r.name) + '" onclick="MuseSchedule.subscribeFor(this.getAttribute(\'data-scope\'))">Subscribe to my calendar</button></div>';
    var seg = '<div class="sc-seg" role="group" aria-label="My schedule sections">' +
      [['calls', 'Upcoming calls'], ['availability', 'Availability']].map(function (t) {
        return '<button type="button" class="' + (tab === t[0] ? 'on' : '') + '" aria-pressed="' + (tab === t[0]) + '" onclick="MuseSchedule.crewTab(\'' + t[0] + '\')">' + t[1] + '</button>';
      }).join('') + '</div>';
    var body = tab === 'availability' ? availabilityHTML(r) : callsHTML(r);
    return head + seg + body;
  }
  function callsHTML(r) {
    var calls = crewCalls(r.name, addDays(new Date(), -0.5), addDays(new Date(), 14));
    if (!calls.length) return '<p class="sc-empty">No calls in the next two weeks.</p>';
    var byDay = {}, order = [];
    calls.forEach(function (c) { var k = dayKey(c.start); if (!byDay[k]) { byDay[k] = []; order.push(k); } byDay[k].push(c); });
    return '<div class="sc-calls">' + order.map(function (k) {
      var list = byDay[k], work = list.filter(function (c) { return c.status !== 'Unavailable' && c.status !== 'Released'; });
      return '<section class="sc-callday" aria-label="' + esc(dayLabel(list[0].start)) + '"><div class="sc-callday-h"><h3>' + esc(dayLabel(list[0].start)) + '</h3>' +
        (work.length ? '<button type="button" class="sc-btn" data-crew="' + esc(r.name) + '" data-day="' + k + '" onclick="MuseSchedule.printCallSheet(this.getAttribute(\'data-crew\'),this.getAttribute(\'data-day\'))">Call sheet</button>' : '') + '</div>' +
        list.map(function (c) { return callCardHTML(c); }).join('') + '</section>';
    }).join('') + '</div>';
  }
  function callCardHTML(c) {
    var hold = c.status === 'Hold' || c.status === 'Tentative', un = c.status === 'Unavailable', rel = c.status === 'Released';
    var cls = 'sc-call' + (hold ? ' is-hold' : '') + (un ? ' is-unavail' : '') + (rel ? ' is-released' : '') + (c.warnings.length ? ' is-conflict' : '');
    var rooms = c.rooms.filter(function (n) { return !c.venue || c.venue.indexOf(n) < 0; });
    var where = [c.show, rooms.join(', '), c.venue].filter(Boolean).join(' · ');
    var acts = un ? '<button type="button" class="sc-btn" onclick="MuseSchedule.removeUnavailable(\'' + c.id + '\')">Remove</button>' :
      hold ? '<button type="button" class="sc-btn sc-btn-primary" onclick="MuseSchedule.acceptHold(\'' + c.id + '\')">Accept hold</button><button type="button" class="sc-btn" onclick="MuseSchedule.declineHold(\'' + c.id + '\')">Decline</button>' :
      rel ? '' : '<button type="button" class="sc-btn" onclick="MuseSchedule.openEditor(\'' + c.id + '\')">Details</button>';
    return '<article class="' + cls + '" style="--c:' + (un ? '#8D929D' : prodColor(c.prod)) + '">' +
      (un && hrs(c.start, c.end) >= 23.9 ? '<div class="sc-call-time"><b>All</b><span>day</span></div>' : '<div class="sc-call-time"><b>' + hm(c.start) + '</b><span>to ' + hm(c.end) + '</span></div>') +
      '<div class="sc-call-main"><h4>' + esc(un ? 'Unavailable' : c.title) + (c.on_air ? ' <span class="sc-onair">ON AIR</span>' : '') + '</h4>' +
        (where ? '<p>' + esc(where) + '</p>' : '') +
        '<p class="sc-call-status">' + esc(rel ? 'Released' : un ? (c.notes || 'Marked unavailable') : c.status) + (c.notes && !un ? ' · ' + esc(c.notes) : '') + '</p>' +
        c.warnings.map(function (w) { return '<p class="sc-call-warn">⚠ ' + esc(w) + '</p>'; }).join('') +
        c.advisories.map(function (w) { return '<p class="sc-call-adv">' + esc(w) + '</p>'; }).join('') +
        (acts ? '<div class="sc-call-acts">' + acts + '</div>' : '') + '</div></article>';
  }
  function availabilityHTML(r) {
    var today = new Date(), iso10 = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    var blocks = bookings({ res: r.id, status: 'Unavailable', from: addDays(today, -1) });
    return '<div class="sc-avail-wrap"><form class="sc-form sc-avail" onsubmit="event.preventDefault();MuseSchedule.addUnavailable(this)">' +
      '<h3>Mark time off</h3><p class="sc-help">Booking someone over these times shows as a conflict in Muse Schedule.</p>' +
      '<div class="sc-grid2"><label>First day<input type="date" name="date" required value="' + iso10 + '"></label>' +
      '<label>Number of days<input type="number" name="days" min="1" max="14" value="1"></label></div>' +
      '<label class="sc-check"><input type="checkbox" name="allday" checked onchange="this.form.from.disabled=this.form.to.disabled=this.checked"> All day</label>' +
      '<div class="sc-grid2"><label>From<input type="time" name="from" value="09:00" disabled></label><label>To<input type="time" name="to" value="18:00" disabled></label></div>' +
      '<label>Reason (optional)<input name="note" maxlength="120" placeholder="e.g. Travel day, personal"></label>' +
      '<button type="submit" class="sc-btn sc-btn-primary">Mark unavailable</button></form>' +
      '<div class="sc-avail-list"><h3>Upcoming time off</h3>' + (blocks.length ? blocks.map(function (b) {
        return '<div class="sc-slot"><div><b>' + esc(dayLabel(b.start)) + (sameDay(b.start, addMin(b.end, -1)) ? '' : ' – ' + esc(dayLabel(addMin(b.end, -1)))) + '</b><span>' +
          (hrs(b.start, b.end) >= 23.9 ? 'All day' : hm(b.start) + '–' + hm(b.end)) + (b.notes ? ' · ' + esc(b.notes) : '') + '</span></div>' +
          '<button type="button" class="sc-btn" onclick="MuseSchedule.removeUnavailable(\'' + b.id + '\')">Remove</button></div>';
      }).join('') : '<p class="sc-empty">None marked.</p>') + '</div></div>';
  }
  function addUnavailable(f) {
    var r = crewRes(ui.crew); if (!r) return;
    var days = Math.max(1, Math.min(14, +f.days.value || 1)), base = new Date(f.date.value + 'T00:00');
    if (isNaN(base)) { toast('Pick a date'); return; }
    for (var i = 0; i < days; i++) {
      var day = addDays(base, i), s1, e1;
      if (f.allday.checked) { s1 = at(day, 0); e1 = addDays(at(day, 0), 1); }
      else {
        var a = String(f.from.value || '09:00').split(':'), b = String(f.to.value || '18:00').split(':');
        s1 = at(day, +a[0], +a[1]); e1 = at(day, +b[0], +b[1]); if (e1 <= s1) e1 = addMin(s1, 60);
      }
      db.bookings.push({ id: nextId(), res: r.id, prod: null, title: 'Unavailable', start: iso(s1), end: iso(e1), status: 'Unavailable', onAir: false, notes: String(f.note.value || '').trim().slice(0, 120) });
    }
    logChange(null, r.name + ' marked unavailable from ' + dayLabel(base) + (days > 1 ? ' for ' + days + ' days' : ''), 'warn');
    persist(); afterChange(); toast('Time off saved');
  }

  /* ---------------- printable call sheet ---------------- */
  function printCallSheet(name, key) {
    var r = crewRes(name); if (!r) return;
    var day = new Date(key + 'T00:00'), next = addDays(day, 1);
    var mine = bookings({ res: r.id, from: day, to: next }).filter(function (b) { return b.status !== 'Released' && b.status !== 'Unavailable'; });
    if (!mine.length) { toast('No calls that day'); return; }
    var prods = uniq(mine.map(function (b) { return b.prod; }).filter(Boolean));
    var sections = prods.map(function (pk) {
      var p = P()[pk] || {};
      var crewRows = db.bookings.filter(function (b) { var br = resById(b.res); return b.prod === pk && br && br.type === 'crew' && b.status !== 'Released' && b.status !== 'Unavailable' && overlap(b.start, b.end, day, next); })
        .sort(function (a, b) { return d(a.start) - d(b.start); });
      var kit = db.bookings.filter(function (b) { var br = resById(b.res); return b.prod === pk && br && br.type !== 'crew' && b.status !== 'Released' && overlap(b.start, b.end, day, next); })
        .sort(function (a, b) { return d(a.start) - d(b.start); });
      return '<h2>' + esc(prodName(pk)) + '</h2>' + (p.venue ? '<p class="cs-venue">' + esc(p.venue) + '</p>' : '') +
        '<h3>Crew calls</h3><table><thead><tr><th>Name</th><th>Position</th><th>Call</th><th>Wrap</th><th>Booking</th></tr></thead><tbody>' +
        crewRows.map(function (b) { var br = resById(b.res); return '<tr' + (br.id === r.id ? ' class="cs-me"' : '') + '><td>' + esc(br.name) + '</td><td>' + esc(br.role || '') + '</td><td>' + hm(b.start) + '</td><td>' + hm(b.end) + '</td><td>' + esc(b.title) + '</td></tr>'; }).join('') +
        '</tbody></table>' + (kit.length ? '<h3>Rooms, circuits &amp; kit</h3><table><thead><tr><th>Resource</th><th>From</th><th>To</th><th>Booking</th></tr></thead><tbody>' +
        kit.map(function (b) { return '<tr><td>' + esc(resById(b.res).name) + '</td><td>' + hm(b.start) + '</td><td>' + hm(b.end) + '</td><td>' + esc((b.onAir ? 'ON AIR · ' : '') + b.title) + '</td></tr>'; }).join('') + '</tbody></table>' : '');
    }).join('');
    var rs = ruleFor(r);
    var html = '<div class="cs-sheet"><header><div><p class="cs-kicker">Muse Live · Call sheet</p><h1>' + esc(r.name) + '</h1><p>' + esc((r.role || 'Crew') + ' · ' + dayLabel(day) + ' · ' + rs.name) + '</p></div>' +
      '<div class="cs-call"><span>Your call</span><b>' + hm(mine[0].start) + '</b><span>Wrap ' + hm(mine[mine.length - 1].end) + '</span></div></header>' +
      '<h3>Your bookings</h3><ul>' + mine.map(function (b) { return '<li><b>' + hm(b.start) + '–' + hm(b.end) + '</b> ' + esc(b.title) + (b.notes ? ' — ' + esc(b.notes) : '') + '</li>'; }).join('') + '</ul>' +
      sections + '<p class="cs-foot">Generated ' + esc(new Date().toLocaleString()) + ' from Muse Schedule. Rest before your next call: at least ' + rs.rest + ' h.</p></div>';
    closePrint();
    var ov = document.createElement('div'); ov.id = 'scPrint'; ov.className = 'sc-print'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Call sheet');
    ov.innerHTML = '<div class="sc-print-btns"><button type="button" class="sc-btn sc-btn-primary" onclick="MuseSchedule.doPrint()">Print</button><button type="button" class="sc-btn" onclick="MuseSchedule.closePrint()">Close</button></div>' + html;
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePrint(); });
    document.body.appendChild(ov);
    setTimeout(function () { var b = ov.querySelector('button'); if (b) b.focus(); }, 20);
  }
  function closePrint() { var o = document.getElementById('scPrint'); if (o) o.remove(); document.body.classList.remove('sc-printing'); }
  function doPrint() {
    document.body.classList.add('sc-printing');
    var done = function () { document.body.classList.remove('sc-printing'); root.removeEventListener('afterprint', done); };
    root.addEventListener('afterprint', done);
    try { root.print(); } catch (e) { done(); }
    setTimeout(done, 60000);
  }

  /* ---------------- rules settings + premiums ---------------- */
  function ruleSummary(rs) {
    return 'OT after ' + rs.dailyOT + ' h · DT after ' + rs.dt + ' h' + (rs.golden ? ' · golden after ' + rs.golden + ' h' : '') + ' · rest ' + rs.rest + ' h · max day ' + rs.maxDay + ' h';
  }
  function rulesHTML() {
    var sets = Object.keys(db.rules).map(function (k) { return db.rules[k]; });
    var crew = resources('crew').slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    return '<aside class="sc-panel sc-rules" aria-label="Labor rules"><div class="sc-panel-h"><h3>Labor rules</h3><button type="button" class="sc-icon-btn" onclick="MuseSchedule.panel(null)" aria-label="Close">✕</button></div>' +
      '<p class="sc-help">Rule sets drive crew conflicts (rest, maximum day), premium advisories and the labor cost on each show. They are planning defaults modelled on common agreements, not contract terms.</p>' +
      sets.map(function (rs) {
        return '<details class="sc-rule"><summary><b>' + esc(rs.name) + '</b><span>' + esc(ruleSummary(rs)) + '</span></summary>' +
          '<form class="sc-form" onsubmit="event.preventDefault();MuseSchedule.saveRule(this)"><input type="hidden" name="id" value="' + rs.id + '">' +
          '<label>Name<input name="name" maxlength="60" value="' + esc(rs.name) + '"></label><div class="sc-grid2 sc-rule-grid">' +
          RULE_FIELDS.map(function (f) { return '<label>' + esc(f[1]) + ' (' + f[2] + ')<input type="number" name="' + f[0] + '" min="0" max="200" step="' + (f[2] === '×' ? '0.25' : '0.5') + '" value="' + rs[f[0]] + '"></label>'; }).join('') +
          '</div><div class="sc-dialog-btns">' + (DEFAULT_RULES[rs.id] ? '<button type="button" class="sc-btn" onclick="MuseSchedule.resetRule(\'' + rs.id + '\')">Reset</button>' : '') +
          '<span class="sc-flex"></span><button type="submit" class="sc-btn sc-btn-primary">Save</button></div></form></details>';
      }).join('') +
      '<h4 class="sc-sub-h">Who is on which rules</h4><div class="sc-assign">' + crew.map(function (c) {
        var auto = defaultRuleFor(c.role), cur = db.assign[c.id] || '';
        return '<label class="sc-assign-row"><span><b>' + esc(c.name) + '</b><i>' + esc(c.role || 'Crew') + '</i></span><select class="sc-select" onchange="MuseSchedule.assignRule(\'' + c.id + '\',this.value)">' +
          '<option value="">Auto: ' + esc(db.rules[auto].name) + '</option>' + sets.map(function (rs) { return '<option value="' + rs.id + '"' + (cur === rs.id ? ' selected' : '') + '>' + esc(rs.name) + '</option>'; }).join('') + '</select></label>';
      }).join('') + '</div></aside>';
  }
  function money(n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); }
  function premiumsHTML(key) {
    var lb = laborBreakdown(key); if (!lb.crew.length) return '';
    var t = lb.totals;
    return '<section class="sc-card sc-prem"><div class="sc-card-h"><div><h3>Crew rules &amp; premiums</h3><p>' + lb.crew.length + ' crew on this show · ' + money(t.wages) + ' estimated wages, ' + money(t.premium_cost) + ' of it premiums</p></div>' +
      '<div class="sc-tb-group"><button type="button" class="sc-btn" onclick="MuseSchedule.openFor(\'' + key + '\',\'rules\')">Edit rule sets</button></div></div>' +
      '<div class="sc-table"><table><thead><tr><th>Crew</th><th>Rule set</th><th>Hours</th><th>OT</th><th>DT</th><th>Golden</th><th>Meal pen.</th><th>6th/7th</th><th>Est. wages</th></tr></thead><tbody>' +
      lb.crew.map(function (c) {
        return '<tr><td><b>' + esc(c.name) + '</b><span>' + esc(c.role) + '</span></td><td>' + esc(c.rule) + '</td><td>' + c.hours + '</td><td>' + c.ot + '</td><td>' + c.dt + '</td><td>' + c.golden + '</td>' +
          '<td>' + (c.meal_penalties ? c.meal_penalties + ' · ' + money(c.meal_penalty_cost) : '—') + '</td><td>' + ((c.day6 + c.day7) || '—') + '</td><td>' + money(c.wages) + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td colspan="2">Total</td><td>' + t.hours + '</td><td>' + t.ot + '</td><td>' + t.dt + '</td><td>' + t.golden + '</td><td>' + money(t.meal_penalty_cost) + '</td><td></td><td>' + money(t.wages) + '</td></tr></tfoot></table></div>' +
      '<p class="sc-help">' + esc(lb.note) + ' Wages are before fringe and kit; the labor & timecards card below uses the same rules.</p></section>';
  }

  /* ---------------- calendar subscriptions ---------------- */
  function scopeOf(v) { var i = String(v || 'all').indexOf(':'); return i < 0 ? { all: true } : (function (k, val) { var o = {}; o[k] = val; return o; })(v.slice(0, i), v.slice(i + 1)); }
  function feedUrl(o) {
    o = o || {};
    var qs = ['sign=1'];
    ['prod', 'res', 'crew'].forEach(function (k) { if (o[k]) qs.push(k + '=' + encodeURIComponent(o[k])); });
    return syncNow().then(function () {
      return fetch('/api/calendar?' + qs.join('&'), { credentials: 'include', cache: 'no-store' });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.url) throw new Error(j.error || 'Calendar feeds need the Muse Live server (HTTP ' + r.status + ').'); return j; });
    });
  }
  function subscribeHTML() {
    var cur = ui.subScope || 'all', res = ui.subResult;
    var opt = function (v, l) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>'; };
    var nonCrew = db.resources.filter(function (r) { return r.type !== 'crew'; }), crew = resources('crew');
    return '<aside class="sc-panel" aria-label="Calendar subscriptions"><div class="sc-panel-h"><h3>Subscribe in a calendar</h3><button type="button" class="sc-icon-btn" onclick="MuseSchedule.panel(null)" aria-label="Close">✕</button></div>' +
      '<form class="sc-form" onsubmit="event.preventDefault();MuseSchedule.createFeed(this)"><label>Calendar for<select name="scope" onchange="MuseSchedule.setSubScope(this.value)">' + opt('all', 'Everything in Muse Schedule') +
      '<optgroup label="Shows">' + prodKeys().map(function (k) { return opt('prod:' + k, prodName(k)); }).join('') + '</optgroup>' +
      '<optgroup label="Rooms, circuits & kit">' + nonCrew.map(function (r) { return opt('res:' + r.id, r.name); }).join('') + '</optgroup>' +
      '<optgroup label="Crew">' + crew.map(function (r) { return opt('crew:' + r.name, r.name); }).join('') + '</optgroup></select></label>' +
      '<button type="submit" class="sc-btn sc-btn-primary">Create subscription link</button></form>' +
      (res ? (res.error ? '<p class="sc-ed-warn"><span class="sc-err">' + esc(res.error) + '</span></p>' :
        '<div class="sc-feed"><label>Feed URL<input readonly value="' + esc(res.url) + '" onfocus="this.select()" aria-label="Calendar feed URL"></label>' +
        '<div class="sc-cf-btns"><button type="button" class="sc-btn" onclick="MuseSchedule.copyFeed()">Copy link</button>' +
        '<a class="sc-btn" href="' + esc(res.webcal) + '">Apple Calendar</a>' +
        '<a class="sc-btn" href="' + esc(res.google) + '" target="_blank" rel="noopener noreferrer">Google Calendar</a>' +
        '<a class="sc-btn" href="' + esc(res.outlook) + '" target="_blank" rel="noopener noreferrer">Outlook</a></div>' +
        '<p class="sc-help">' + esc(res.label || '') + '. Calendars refresh subscriptions on their own schedule (Google every few hours, Apple and Outlook from every 15 minutes to a few hours), so a change can take a while to appear. Anyone with the link can read this calendar; create a new link to share a different one.</p></div>') : '') +
      '<button type="button" class="sc-btn" onclick="MuseSchedule.exportScope()">Download a one-off .ics instead</button></aside>';
  }

  /* ---------------- server mirror (calendar feeds, MuseSync) ---------------- */
  var syncTimer = null;
  function snapshot() {
    var prods = {}, venues = {};
    prodKeys().forEach(function (k) { prods[k] = prodName(k); var p = P()[k]; if (p && p.venue) venues[k] = p.venue; });
    return { v: 2, updated: new Date().toISOString(), resources: db.resources.map(function (r) { return { id: r.id, name: r.name, type: r.type, role: r.role || '' }; }),
      bookings: db.bookings.map(function (b) { return Object.assign({}, b); }), rules: db.rules, assign: db.assign, prods: prods, venues: venues };
  }
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(function () { syncNow(); }, 1500); }
  function syncNow() {
    if (!db) return Promise.resolve(false);
    var snap = snapshot();
    try { if (root.MuseSync && typeof root.MuseSync.put === 'function') root.MuseSync.put('schedule', snap); } catch (e) {}
    try { if (location.protocol === 'file:') return Promise.resolve(false); } catch (e) {}
    return fetch('/api/calendar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snap) })
      .then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /* ---------------- labor card integration ---------------- */
  // The Crew labor & timecards card (app bundle) prices crew through the global schedWage /
  // schedLaborEstimate. Wrap both so estimates and approved timecards follow the rule sets.
  function hookLabor() {
    if (root.__msLaborHooked || typeof root.schedLaborEstimate !== 'function' || typeof root.schedWage !== 'function') return;
    root.__msLaborHooked = true;
    var origEst = root.schedLaborEstimate, origWage = root.schedWage;
    root.schedWage = function (r, hpd, days) {
      if (!r || !r._ms) return origWage(r, hpd, days);
      var rs = r._ms, h = Math.max(hpd, rs.minCall || 0);
      var g = rs.golden > 0 ? Math.max(0, h - rs.golden) : 0, dt = Math.max(0, h - rs.dt) - g, ot = Math.max(0, Math.min(h, rs.dt) - rs.dailyOT), st = Math.min(h, rs.dailyOT);
      var perDay = r.baseHr * (st + ot * rs.otX + dt * rs.dtX + g * rs.goldenX);
      return { wages: perDay * days, hours: hpd * days, otHours: (ot + dt + g) * days };
    };
    root.schedLaborEstimate = function (key) {
      var list = origEst(key);
      try {
        list.forEach(function (e) {
          if (e.source !== 'Muse Schedule' || !e.name) return;
          var res = crewRes(e.name); if (!res) return;
          var rs = ruleFor(res), base = origWage(e.rate, e.est.hpd, e.est.days).wages;
          var lab = laborFor(res.id, { prod: key, rate: e.rate.baseHr }), fr = 1 + (e.rate.fringePct || 0);
          e.est.loaded = Math.max(0, Math.round(e.est.loaded - base * fr + lab.wages * fr));
          e.rate = Object.assign({}, e.rate, { _ms: rs });
          e.union = (e.union ? e.union + ' · ' : '') + rs.name;
          e.rules = { rule: rs.name, premium_cost: lab.premium_cost, meal_penalties: lab.meal_penalties, ot: lab.ot, dt: lab.dt, golden: lab.golden };
        });
      } catch (x) {}
      return list;
    };
  }

  /* ---------------- deep link: #schedule/crew/<name> ---------------- */
  function routeFromHash(h) {
    var m = /^#\/?schedule\/crew\/([^?#]+)/.exec(h || ''); if (!m) return false;
    var name; try { name = decodeURIComponent(m[1]); } catch (e) { name = m[1]; }
    myView(name.replace(/-/g, ' '));
    return true;
  }
  function setHash(h) { try { history.replaceState(history.state, '', h); } catch (e) {} }
  function myView(name) {
    ensure();
    ui.mode = 'crew'; if (name) ui.crew = (crewRes(name) || {}).name || name; ui.panel = null;
    try { root.switchView('schedule'); root.setSchedTab('muse'); } catch (e) {}
    var host = document.getElementById('scheduleGantt'); if (host && !document.getElementById('scSchedule')) renderInto(host);
    setTimeout(function () { if (ui.mode === 'crew' && ui.crew) setHash('#/schedule/crew/' + encodeURIComponent(slug(ui.crew))); }, 60);
  }

  /* ---------------- public API ---------------- */
  var MS = root.MuseSchedule = {
    // data
    types: function () { return TYPES.map(function (t) { return { id: t.id, label: t.label }; }); },
    resources: function (type) { return resources(type).map(function (r) { return Object.assign({}, r); }); },
    bookings: function (f) { return bookings(f).map(function (b) { return Object.assign({}, b); }); },
    get: function (id) { var b = get(id); return b ? Object.assign({}, b) : null; },
    create: create, update: update, remove: remove,
    conflicts: function (f) { return conflicts(f).map(function (c) { return { kind: c.kind, res: c.res, ids: c.ids.slice(), text: c.text }; }); },
    isFree: function (res, start, end) { ensure(); return isFree(res, start, end); },
    findSlot: findSlot, utilization: utilization, byProduction: function (k) { return byProduction(k).map(function (b) { return Object.assign({}, b); }); },
    toICS: toICS, brief: brief, summary: summary,
    log: function (prod) { ensure(); return (db.log || []).filter(function (l) { return !prod || l.prod === prod || !l.prod; }).slice(0, 20); },
    weekLabel: function () { var m = weekStart(); return dayLabel(m) + ' – ' + dayLabel(addDays(m, 6)); },
    prodColor: prodColor,
    // ui
    renderInto: renderInto, projectPaneHTML: projectPaneHTML,
    openEditor: openEditor, closeEditor: function () { closeEditor(); }, saveEditor: saveEditor, checkEditor: checkEditor,
    deleteEditor: function (id) { remove(id); closeEditor(); toast('Booking removed'); },
    nav: function (n) { ui.mode = null; var a = ui.anchor ? d(ui.anchor) : new Date(); ui.anchor = n === 0 ? new Date() : addDays(a, n * (ui.view === 'day' ? 1 : 7)); renderInto(document.getElementById('scheduleGantt')); },
    setView: function (v) { ui.mode = null; ui.view = v; ui.userView = true; renderInto(document.getElementById('scheduleGantt')); },
    filter: function (k, v) {
      ui[k] = v;
      var keep = k === 'q' ? document.activeElement : null, pos = keep && keep.selectionStart;
      renderInto(document.getElementById('scheduleGantt'));
      if (k === 'q') { var el = document.querySelector('.sc-input'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} } }
    },
    toggleGroup: function (t) { ui.collapsed[t] = !ui.collapsed[t]; renderInto(document.getElementById('scheduleGantt')); },
    panel: function (p) {
      if (ui.mode === 'crew' && p) { ui.mode = null; setHash('#/schedule'); }
      ui.panel = ui.panel === p ? null : p; ui.slotResult = null; if (p !== 'subscribe') ui.subResult = null;
      renderInto(document.getElementById('scheduleGantt'));
    },
    fix: function (i, j) { var c = conflicts()[i]; if (!c) return; var f = fixesFor(c)[j]; if (f) { f.run(); toast('Fixed · ' + f.label); } },
    runFind: function (f) { ui.slotResult = findSlot({ type: f.type.value, hours: +f.hours.value, after: new Date(f.after.value), limit: 3 }); ui.slotType = f.type.value; renderInto(document.getElementById('scheduleGantt')); },
    bookSlot: function (i) { var s = ui.slotResult && ui.slotResult[i]; if (s) openEditor(null, { res: s.resId, start: s.start, end: s.end, prod: ui.prod || '' }); },
    exportICS: function (prod) { downloadICS(prod ? { prod: prod } : { prod: ui.prod || undefined, type: ui.type || undefined }, prod ? 'muse-schedule-' + prod + '.ics' : 'muse-schedule.ics'); },
    openFor: function (key, panel) {
      ui.mode = null; ui.prod = key || ''; ui.panel = panel || null; ui.anchor = null;
      try { root.switchView('schedule'); root.setSchedTab('muse'); } catch (e) {}
    },
    focusRes: function (name) { ui.mode = null; ui.focusRes = name; ui.prod = ''; ui.type = ''; try { root.switchView('schedule'); root.setSchedTab('muse'); } catch (e) {} },
    ready: function () { ensure(); return true; },
    // labor rules
    rules: function () { ensure(); return JSON.parse(JSON.stringify({ sets: db.rules, assign: db.assign, fields: RULE_FIELDS.map(function (f) { return { key: f[0], label: f[1], unit: f[2] }; }) })); },
    ruleFor: function (res) { ensure(); return Object.assign({}, ruleFor(crewRes(res) || res)); },
    setRule: function (id, patch) {
      ensure(); patch = patch || {};
      if (patch.assign) { [].concat(patch.assign).forEach(function (rid) { var r = crewRes(rid) || resById(rid); if (r) db.assign[r.id] = id; }); }
      var rs = db.rules[id] || (db.rules[id] = Object.assign({}, DEFAULT_RULES.custom, { id: id, name: patch.name || id }));
      if (patch.name) rs.name = String(patch.name).slice(0, 60);
      RULE_FIELDS.forEach(function (f) { if (patch[f[0]] !== undefined && !isNaN(+patch[f[0]])) rs[f[0]] = Math.max(0, +patch[f[0]]); });
      logChange(null, 'Labor rules updated: ' + rs.name, 'ok'); persist(); afterChange(); return Object.assign({}, rs);
    },
    assignRule: function (resId, ruleId) {
      ensure(); var r = resById(resId); if (!r) return;
      if (ruleId) db.assign[r.id] = ruleId; else delete db.assign[r.id];
      logChange(null, r.name + ' → ' + (ruleId ? db.rules[ruleId].name : 'rules by role'), 'ok'); persist(); afterChange();
    },
    saveRule: function (f) {
      var patch = { name: f.name.value }; RULE_FIELDS.forEach(function (x) { patch[x[0]] = f[x[0]].value; });
      MS.setRule(f.id.value, patch); toast('Rule set saved');
    },
    resetRule: function (id) { if (!DEFAULT_RULES[id]) return; db.rules[id] = JSON.parse(JSON.stringify(DEFAULT_RULES[id])); persist(); afterChange(); toast('Rule set reset'); },
    ruleFindings: function (f) { return ruleFindings(f).map(function (a) { return { kind: a.kind, res: a.res, rule: a.rule, text: a.text }; }); },
    laborFor: function (res, o) { ensure(); var r = crewRes(res) || resById(res); return r ? laborFor(r.id, o) : null; },
    laborBreakdown: laborBreakdown,
    // crew self-service
    crewCalls: crewCalls,
    myView: function (name) { myView(name || ui.crew || readMe()); },
    exitCrew: function () { ui.mode = null; setHash('#/schedule'); renderInto(document.getElementById('scheduleGantt')); },
    crewTab: function (t) { ui.crewTab = t; renderInto(document.getElementById('scheduleGantt')); },
    rememberMe: function (on) { try { if (on) localStorage.setItem(ME_KEY, ui.crew); else localStorage.removeItem(ME_KEY); } catch (e) {} toast(on ? 'Remembered on this device' : 'Forgotten on this device'); },
    addUnavailable: addUnavailable,
    removeUnavailable: function (id) { var b = get(id); if (b && b.status === 'Unavailable') { remove(id); toast('Time off removed'); } },
    acceptHold: function (id) { var b = get(id); if (!b) return; update(id, { status: 'Confirmed' }); logChange(b.prod, (resById(b.res) || {}).name + ' accepted the hold ' + describe(b)); persist(); toast('Hold accepted'); },
    declineHold: function (id) {
      var b = get(id); if (!b) return; var who = (resById(b.res) || {}).name || 'Crew';
      update(id, { status: 'Released', notes: ((b.notes ? b.notes + ' · ' : '') + 'Declined by ' + who).slice(0, 1000) }); toast('Hold declined');
    },
    printCallSheet: printCallSheet, doPrint: doPrint, closePrint: closePrint,
    // calendar sync
    feedUrl: feedUrl,
    syncNow: syncNow,
    subscribeFor: function (scope) { ui.mode = null; setHash('#/schedule'); ui.panel = 'subscribe'; ui.subScope = scope || 'all'; ui.subResult = null; renderInto(document.getElementById('scheduleGantt')); },
    setSubScope: function (v) { ui.subScope = v; ui.subResult = null; },
    createFeed: function (f) {
      ui.subScope = f.scope.value; ui.subResult = { label: 'Creating link…', url: '', webcal: '#', google: '#', outlook: '#' };
      feedUrl(scopeOf(f.scope.value)).then(function (j) { ui.subResult = j; }, function (e) { ui.subResult = { error: e.message }; })
        .then(function () { renderInto(document.getElementById('scheduleGantt')); });
    },
    copyFeed: function () { var u = ui.subResult && ui.subResult.url; if (!u) return; try { navigator.clipboard.writeText(u).then(function () { toast('Feed link copied'); }); } catch (e) { toast('Copy failed'); } },
    exportScope: function () { var sc = scopeOf(ui.subScope); var f = sc.prod ? { prod: sc.prod } : sc.res ? { res: sc.res } : sc.crew ? { res: (crewRes(sc.crew) || {}).id } : {}; downloadICS(f, 'muse-schedule' + (sc.prod || sc.res || (sc.crew ? '-' + slug(sc.crew) : '')) + '.ics'); }
  };

  function boot() {
    try { ensure(); afterChange(true); } catch (e) {}
    try { hookLabor(); } catch (e) {}
    setTimeout(function () { try { hookLabor(); syncNow(); } catch (e) {} }, 1500);
    setTimeout(function () { try { routeFromHash(bootHash); } catch (e) {} }, 700);
  }
  // newURL carries the hash as typed; the app's router may already have rewritten location.hash.
  root.addEventListener('hashchange', function (e) { routeFromHash(e && e.newURL && e.newURL.indexOf('#') >= 0 ? '#' + e.newURL.split('#').slice(1).join('#') : location.hash); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
