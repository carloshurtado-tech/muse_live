/* Muse agent — the live broadcast & streaming agent in the Ask Muse drawer.
   The model runs behind /api/museai (Meta Model API, key held server-side). This file is the
   agent's hands and eyes: it builds a live snapshot of every show, runs the tools the model
   asks for against the in-browser plan of record, and renders the conversation.
   Writes are never automatic: propose_change renders a Confirm card for the user.
   When the model is not connected, the drawer falls back to the built-in rules answers. */
(function (root) {
  'use strict';

  var MAX_STEPS = 8;
  var STEP_TIMEOUT_MS = 120000;
  var TOOL_RESULT_LIMIT = 48000;
  var FACE = 'assets/brand/muse-face.webp';

  var A = root.MuseAgent = {
    state: 'unknown',      // unknown | online | offline
    thread: [],            // model-format messages (user / assistant / tool)
    busy: false,
    actions: {},           // pending Confirm cards by id
    navs: {},              // clickable source chips by id
    metrics: [],           // per-turn latency, effort, steps and tokens (newest last)
    stream: true,          // render answers token by token when the server can stream
    _abort: null,
    _seq: 0
  };
  var rulesDeliver = root.museaiDeliver; // original rules engine (offline fallback)

  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function has(fnName) { return typeof root[fnName] === 'function'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }
  function filled(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    var t = String(v).trim();
    return !!t && t !== '—' && t !== '-';
  }
  function prods() { return root.productions || {}; }
  function keys() { return (root.order || Object.keys(prods())).filter(function (k) { return prods()[k]; }); }
  function pctOf(p) { try { return has('computePct') ? root.computePct(p) : p.pct; } catch (e) { return p.pct; } }
  function counts(p) { try { return root.countStatus(p); } catch (e) { return {}; } }
  function ensure(p, key) {
    try { if (has('ensureTB')) root.ensureTB(p, key); } catch (e) {}
    try { if (has('ensureFields')) root.ensureFields(p); } catch (e2) {}
  }
  function liveCtx(run) {
    if (!run.ctx) { try { run.ctx = JSON.parse(root.buildMuseAiContext()); } catch (e) { run.ctx = {}; } }
    return run.ctx;
  }

  /* ---------- resolving shows and departments from loose model input ---------- */
  function resolveProd(x) {
    var P = prods(), ks = keys();
    if (x && P[x]) return x;
    var q = norm(x);
    if (q) {
      var hit = null;
      ks.forEach(function (k) {
        if (hit) return;
        var p = P[k], names = [k, p.name, p.tab, p.tag, p.customer].map(norm);
        if (names.indexOf(q) >= 0) hit = k;
      });
      if (hit) return hit;
      ks.forEach(function (k) {
        if (hit) return;
        var p = P[k], n = norm(p.name) + ' ' + norm(p.tab) + ' ' + norm(k);
        if (n.indexOf(q) >= 0 || q.split(' ').filter(function (w) { return w.length > 2; }).every(function (w) { return n.indexOf(w) >= 0; })) hit = k;
      });
      if (hit) return hit;
      if (has('findProd')) { try { var f = root.findProd(String(x).toLowerCase()); if (f && P[f]) return f; } catch (e) {} }
      return null;
    }
    try { return root.museaiFocusKey(); } catch (e) { return ks[0] || null; }
  }
  var DEPT_ALIASES = [
    ['Audio', /audio|sound|a1\b|mix(er|ing)?\b|console/],
    ['Cameras / Video', /camera|cams?\b|video|ccu|lens/],
    ['Transmission / Signal', /transmission|\btx\b|signal|uplink|encod|liveu|satellite|fiber|stream/],
    ['Engineering', /engineering|\beic\b|router|evertz/],
    ['Replay / EVS', /replay|evs/],
    ['Lighting', /light|lx\b|gaffer/],
    ['Power / Electrical', /power|electric|generator|ups\b|distro/],
    ['CAD', /\bcad\b|drawing|plan(s)?\b/],
    ['Monitors', /monitor|display/],
    ['Graphics (GFX)', /graphic|gfx|chyron|viz/],
    ['Talent / Production', /talent|production|host|producer/],
    ['Networking / IT', /network|\bit\b|internet|wifi|ip\b/],
    ['Miscellaneous / Consumables', /misc|consumable/],
    ['Legal / Rights', /legal|rights|clearance|music sync/],
    ['Comms & IFB', /comms?\b|intercom|ifb|rts|clear.?com|freespeak/],
    ['RF / Wireless Mics', /\brf\b|wireless|radio mic|frequenc/]
  ];
  function deptNames(p) {
    var s = {};
    (p.dept || []).forEach(function (d) { s[d[0]] = 1; });
    Object.keys(p.tbFields || {}).forEach(function (d) { s[d] = 1; });
    Object.keys(root.DEFAULT_DEPT_FIELDS || {}).forEach(function (d) { s[d] = 1; });
    return Object.keys(s);
  }
  function resolveDept(p, x) {
    var names = deptNames(p), q = norm(x);
    if (!q) return null;
    var exact = names.filter(function (n) { return norm(n) === q; })[0];
    if (exact) return exact;
    var part = names.filter(function (n) { return norm(n).indexOf(q) >= 0 || q.indexOf(norm(n)) >= 0; })[0];
    if (part) return part;
    for (var i = 0; i < DEPT_ALIASES.length; i++) if (DEPT_ALIASES[i][1].test(q)) return DEPT_ALIASES[i][0];
    return null;
  }
  // The board and the techbook use slightly different department names on older shows.
  function deptVariants(name) {
    var v = [name];
    if (name === 'Engineering' || name === 'CAD') v.push('Engineering / CAD');
    if (name === 'Engineering / CAD') v.push('Engineering', 'CAD');
    if (name === 'Comms & IFB' || name === 'RF / Wireless Mics') v.push('Audio');
    return v;
  }
  function deptRx(name) {
    for (var i = 0; i < DEPT_ALIASES.length; i++) if (DEPT_ALIASES[i][0] === name) return DEPT_ALIASES[i][1];
    return new RegExp(norm(name).split(' ')[0] || 'zzz');
  }

  /* ---------- schedule helpers ---------- */
  function parseDay(s) { var t = Date.parse(String(s || '').split('–')[0].split(' - ')[0]); return isNaN(t) ? null : t; }
  function scheduleInfo(p) {
    var rows = (p.schedule || []).map(function (r) { return { date: r[0], time: r[1], activity: r[2], crew_call: r[3], broadcast: r[4], location: r[5], t: parseDay(r[0]) }; });
    var now = Date.now(), dated = rows.filter(function (r) { return r.t != null; });
    var air = rows.filter(function (r) { return filled(r.broadcast); }).pop() || null;
    var next = dated.filter(function (r) { return r.t >= now - 864e5; })[0] || null;
    return {
      first: dated.length ? dated[0].date : null,
      last: dated.length ? dated[dated.length - 1].date : null,
      air: air ? (air.date + (air.time ? ' ' + air.time : '') + ' — ' + air.activity) : null,
      next: next ? (next.date + ' ' + (next.time || '') + ' — ' + next.activity) : null,
      rows: rows.map(function (r) { var o = Object.assign({}, r); delete o.t; return o; })
    };
  }
  function prodTz(p, key) {
    try { var L = root.activeLocation(key); if (L && L.tz) return L.tz; } catch (e) {}
    return (p.locations && p.locations[0] && p.locations[0].tz) || null;
  }

  /* ---------- live snapshot (sent with every question) ---------- */
  function snapshot() {
    var P = prods(), role = null, view = null, focus = null;
    try { role = root.permRoleDef(); } catch (e) {}
    try { var act = document.querySelector('.view-pane.active'); view = act ? act.id.replace(/^view-/, '') : null; } catch (e) {}
    try { focus = root.museaiFocusKey(); } catch (e) {}
    var tz = null; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    var shows = keys().map(function (k) {
      var p = P[k], c = counts(p), s = scheduleInfo(p);
      return {
        key: k, name: p.name, client: p.customer, venue: p.venue, status: p.status, readiness_pct: pctOf(p),
        departments: { approved: c.approved, pending: c.pending, missing: c.missing },
        pending: (p.dept || []).filter(function (d) { return d[1] === 'pending'; }).map(function (d) { return d[0]; }),
        missing: (p.dept || []).filter(function (d) { return d[1] === 'missing'; }).map(function (d) { return d[0]; }),
        dates: s.first ? (s.first + (s.last && s.last !== s.first ? ' → ' + s.last : '')) : p.date,
        on_air: s.air, next_milestone: s.next,
        bottleneck: p.bottleneck ? p.bottleneck.text : null,
        stream: (function () { try { return root.MuseStreaming.health(k); } catch (e) { return null; } })(),
        open_incidents: (function () { try { return root.MuseIncidents.byProduction(k).filter(function (i) { return i.status === 'Open' || i.status === 'Monitoring'; }).map(function (i) { return i.id + ' ' + i.severity + ' ' + i.title; }); } catch (e) { return []; } })(),
        venues: (p.locations || []).map(function (L) { return L.name + (L.city ? ' (' + L.city + ')' : ''); }).slice(0, 20),
        time_zone: prodTz(p, k)
      };
    });
    var alerts = 0, tx = 0;
    try { alerts = (root.permComms ? root.permComms() : []).filter(function (m) { return m.priority === 'critical' && !m.read && m.dir === 'in'; }).length; } catch (e) {}
    try { tx = root.txConflicts().notes.length; } catch (e) {}
    return JSON.stringify({
      now: new Date().toISOString(), now_local: new Date().toString(), user_time_zone: tz,
      viewing_as: role ? role.label : null,
      on_screen: { view: view, production: focus && P[focus] ? P[focus].name : null, production_key: focus, tab: (root.projSubTab || {})[focus] || null },
      productions: shows,
      unread_critical_alerts: alerts, transmission_conflicts: tx
    });
  }

  /* ---------- tools ---------- */
  function needProd(args) {
    var k = resolveProd(args.production);
    if (!k) throw new Error('No production matches "' + (args.production || '') + '". Known: ' + keys().map(function (x) { return prods()[x].name; }).join(', '));
    return k;
  }
  var TOOLS = {
    get_production: function (a) {
      var k = needProd(a), p = prods()[k]; ensure(p, k);
      var c = counts(p), s = scheduleInfo(p);
      return {
        production: p.name, key: k, client: p.customer, venue: p.venue, status: p.status, readiness_pct: pctOf(p),
        counts: c, version: p.version, edited_by: p.editedBy || null, bottleneck: p.bottleneck || null,
        departments: (p.dept || []).map(function (d) { return { department: d[0], status: d[1], note: d[2] || '' }; }),
        approvals: p.approvals || {}, signoff: p.signoff || null,
        dates: { first: s.first, last: s.last, on_air: s.air, next_milestone: s.next },
        locations: (p.locations || []).map(function (L) { return { id: L.id, name: L.name, venue: L.venue, city: L.city, role: L.role, tz: L.tz }; }),
        time_zone: prodTz(p, k)
      };
    },
    get_department: function (a) {
      var k = needProd(a), p = prods()[k]; ensure(p, k);
      var dn = resolveDept(p, a.department);
      if (!dn) throw new Error('No department matches "' + a.department + '". Departments: ' + (p.dept || []).map(function (d) { return d[0]; }).join(', '));
      var vars = deptVariants(dn), rx = deptRx(dn);
      var row = null; (p.dept || []).forEach(function (d) { if (!row && vars.indexOf(d[0]) >= 0) row = d; });
      var schema = (root.DEFAULT_DEPT_FIELDS || {})[dn] || [];
      var vals = {}; vars.forEach(function (v) { var f = (p.tbFields || {})[v]; if (f) Object.keys(f).forEach(function (x) { if (vals[x] == null) vals[x] = f[x]; }); });
      var known = {}, fieldsDone = [], fieldsOpen = [], section = '';
      schema.forEach(function (f) {
        if (!f || !f[0]) return;
        if (f[0].charAt(0) === '_') { section = f[1] || ''; return; }
        known[f[0]] = 1;
        var v = vals[f[0]], item = { field: f[1], section: section || undefined };
        if (filled(v)) { item.value = Array.isArray(v) ? v.map(function (x) { return x && typeof x === 'object' ? (x.a || x.name || JSON.stringify(x)) : x; }) : v; fieldsDone.push(item); }
        else fieldsOpen.push(item);
      });
      Object.keys(vals).forEach(function (x) { if (!known[x] && filled(vals[x])) fieldsDone.push({ field: x, value: vals[x] }); });
      var pack = []; try { pack = root.museaiPacklist(p, 600).filter(function (it) { return vars.indexOf(it.dept) >= 0; }); } catch (e) {}
      var byStatus = {}; pack.forEach(function (it) { var s = it.status || 'Draft'; byStatus[s] = (byStatus[s] || 0) + (Number(it.qty) || 1); });
      var crew = []; try { crew = root.getProjectCrew(k); } catch (e) {}
      var crewRel = crew.filter(function (s) { return rx.test(String(s.pos || '').toLowerCase()); });
      var tasks = (p.tasks || []).filter(function (t) { return rx.test(JSON.stringify(t).toLowerCase()); }).slice(0, 25);
      var survey = null; try { survey = root.museaiSurveyFull(k); } catch (e) {}
      var findings = survey ? (survey.findings || []).filter(function (f) { return rx.test(String(f.text).toLowerCase()); }) : [];
      return {
        production: p.name, department: row ? row[0] : dn,
        status: row ? row[1] : 'not on this show\'s board', note: row ? row[2] : null,
        approval: (p.approvals || {})[row ? row[0] : dn] || null,
        techbook_filled: fieldsDone, techbook_unfilled: fieldsOpen,
        pack_list: { lines: pack.length, quantity_by_status: byStatus, not_packed: pack.filter(function (it) { return !/pack|ship|load|approved|complete/i.test(it.status || ''); }).slice(0, 60), sample: pack.slice(0, 40) },
        crew: { related_positions: crewRel.map(function (s) { return { position: s.pos, name: (s.name || '').trim() || 'OPEN' }; }), open: crewRel.filter(function (s) { return !(s.name || '').trim(); }).map(function (s) { return s.pos; }) },
        tasks: tasks, survey_findings: findings,
        readiness_rule: 'A department counts toward readiness only when its status is approved.'
      };
    },
    get_techbook: function (a) {
      var k = needProd(a), p = prods()[k]; ensure(p, k);
      var all = {}; try { all = root.museaiTbFieldsFull(p); } catch (e) {}
      if (a.department) {
        var dn = resolveDept(p, a.department), out = {};
        deptVariants(dn || a.department).forEach(function (v) { if (all[v]) out[v] = all[v]; });
        all = out;
      }
      return { production: p.name, techbook: all, truck_specs: a.department ? undefined : (p.tb || null) };
    },
    get_equipment: function (a) {
      var k = needProd(a), p = prods()[k];
      var list = []; try { list = root.museaiPacklist(p, 1000); } catch (e) {}
      if (a.department) { var dn = resolveDept(p, a.department), vars = deptVariants(dn || a.department); list = list.filter(function (it) { return vars.indexOf(it.dept) >= 0; }); }
      if (a.search) { var q = norm(a.search); list = list.filter(function (it) { return norm(it.name + ' ' + it.detail + ' ' + it.dept).indexOf(q) >= 0; }); }
      var tot = {}; list.forEach(function (it) { tot[it.dept] = (tot[it.dept] || 0) + (Number(it.qty) || 1); });
      return { production: p.name, lines: list.length, quantity_by_department: tot, items: list.slice(0, 300) };
    },
    get_crew: function (a) {
      var k = needProd(a), p = prods()[k];
      var crew = []; try { crew = root.museaiCrewFull(k); } catch (e) {}
      if (a.search) { var q = norm(a.search); crew = crew.filter(function (s) { return norm(s.pos + ' ' + s.name + ' ' + s.group).indexOf(q) >= 0; }); }
      var chk = null; try { chk = root.museaiCheckinsFull(k); } catch (e) {}
      return {
        production: p.name, positions: crew.length,
        open_positions: crew.filter(function (s) { return s.name === '(OPEN)'; }).map(function (s) { return s.pos; }),
        roster: crew, venue_check_in: chk ? { on_site: chk.on_site, not_yet: chk.not_yet, on_count: chk.on_count, total_named: chk.total_named } : null
      };
    },
    get_schedule: function (a) {
      var k = needProd(a), p = prods()[k], s = scheduleInfo(p);
      return { production: p.name, time_zone: prodTz(p, k), on_air: s.air, next_milestone: s.next, schedule: s.rows };
    },
    get_site: function (a) {
      var k = needProd(a), p = prods()[k];
      var doc = {}; try { doc = root.museaiProductionDocument(k, 'standard') || {}; } catch (e) {}
      var geo = null; try { geo = root.projGeo(p, k); } catch (e) {}
      return {
        production: p.name, venue: p.venue, venue_coordinates: geo,
        locations: (p.locations || []).map(function (L) { return { id: L.id, name: L.name, venue: L.venue, city: L.city, address: L.address || '', role: L.role, note: L.note || '', tz: L.tz, lat: L.lat, lng: L.lng }; }),
        site_survey: doc.site_survey || null, fiber_plant: doc.fiber_plant || [], ifb_route: doc.ifb_route || null, vendors: doc.vendors || []
      };
    },
    get_weather: function (a) { return weather(a); },
    get_live_status: function () {
      var MS = root.MuseStreaming; if (!MS) throw new Error('Streaming is not loaded.');
      var st = null;
      if (typeof MS.liveStatus === 'function') st = MS.liveStatus();
      else st = { ts: new Date().toISOString(), shows: keys().map(function (k) { var h = MS.health(k); return { key: k, name: prods()[k].name, state: h.state, health: h.health, viewers: h.viewers, alerts: h.alerts }; }) };
      var an = []; try { an = typeof MS.anomalies === 'function' ? MS.anomalies() : []; } catch (e) {}
      st.anomalies = (an || []).map(function (x) { return { show: x.show, stage: x.stage, level: x.level, text: x.text, recommendation: x.recommendation ? x.recommendation.label : null }; });
      if (!st.openIncidents) { try { st.openIncidents = root.MuseIncidents.all().filter(function (i) { return i.status === 'Open' || i.status === 'Monitoring'; }).map(function (i) { return { id: i.id, severity: i.severity, title: i.title, show: prods()[i.production] ? prods()[i.production].name : i.production }; }); } catch (e) {} }
      return st;
    },
    create_booking: function (a, run) {
      if (run.headless) return HEADLESS_WRITE;
      var S2 = root.MuseSchedule; if (!S2) throw new Error('Muse Schedule is not loaded.');
      var k = needProd(a), start = isoOf(a.start), end = isoOf(a.end);
      if (!(new Date(end) > new Date(start))) throw new Error('The end must be after the start.');
      var resId = a.resource ? resolveRes(a.resource) : null;
      if (a.resource && !resId) throw new Error('No resource matches "' + a.resource + '".');
      if (!resId && a.type) {
        var t = resolveType(a.type), free = (S2.resources(t) || []).filter(function (r) { return S2.isFree(r.id, start, end); })[0];
        if (!free) throw new Error('No ' + a.type + ' is free in that window.');
        resId = free.id;
      }
      if (!resId) throw new Error('Give a resource or a resource type.');
      var r = resInfo(resId), clash = !S2.isFree(resId, start, end), status = a.status || 'Hold';
      var b = { res: resId, prod: k, title: String(a.title || 'Booking').slice(0, 120), start: start, end: end, status: status, onAir: !!a.on_air };
      return propose(run, {
        text: 'Book **' + (r ? r.name : resId) + '** for **' + prods()[k].name + '** — ' + b.title + ', ' + fmtWin(start, end) + ' (' + status + (b.onAir ? ', on air' : '') + ')?' +
          (clash ? '\n\n⚠ This overlaps an existing booking on ' + (r ? r.name : resId) + '.' : ''),
        apply: function () { var nb = S2.create(b); return { done: 'Booked **' + (r ? r.name : resId) + '** for ' + prods()[k].name + ', ' + fmtWin(start, end) + '.', undo: function () { S2.remove(nb.id); return 'Booking removed.'; }, nav: { kind: 'schedule', res: r ? r.name : resId } }; }
      });
    },
    update_booking: function (a, run) {
      if (run.headless) return HEADLESS_WRITE;
      var S2 = root.MuseSchedule; if (!S2) throw new Error('Muse Schedule is not loaded.');
      var b = S2.get(a.id); if (!b) throw new Error('No booking with id ' + a.id + '. Use get_bookings to find it.');
      var patch = {}, before = {}, diff = [];
      if (a.resource) { var rid = resolveRes(a.resource); if (!rid) throw new Error('No resource matches "' + a.resource + '".'); if (rid !== b.res) { patch.res = rid; before.res = b.res; diff.push(resName(b.res) + ' → **' + resName(rid) + '**'); } }
      if (a.start) { var ns = isoOf(a.start); if (ns !== b.start) { patch.start = ns; before.start = b.start; } }
      if (a.end) { var ne = isoOf(a.end); if (ne !== b.end) { patch.end = ne; before.end = b.end; } }
      if (patch.start || patch.end) diff.push(fmtWin(b.start, b.end) + ' → **' + fmtWin(patch.start || b.start, patch.end || b.end) + '**');
      if (a.status && a.status !== b.status) { patch.status = a.status; before.status = b.status; diff.push(b.status + ' → **' + a.status + '**'); }
      if (!diff.length) return { ok: true, note: 'That booking already matches. Nothing to confirm.' };
      var ns2 = patch.start || b.start, ne2 = patch.end || b.end, rr = patch.res || b.res;
      var clash = (S2.bookings({ res: rr, from: ns2, to: ne2 }) || []).some(function (x) { return x.id !== b.id && new Date(x.start) < new Date(ne2) && new Date(x.end) > new Date(ns2) && x.status !== 'Released'; });
      return propose(run, {
        text: 'Change **' + b.title + '** (' + (prods()[b.prod] ? prods()[b.prod].name : b.prod) + '):\n' + diff.map(function (d) { return '- ' + d; }).join('\n') + (clash ? '\n\n⚠ The new slot overlaps another booking.' : ''),
        apply: function () { S2.update(b.id, patch); return { done: 'Updated **' + b.title + '**.', undo: function () { S2.update(b.id, before); return 'Booking restored.'; }, nav: { kind: 'schedule', res: resName(rr) } }; }
      });
    },
    log_incident: function (a, run) {
      if (run.headless) return HEADLESS_WRITE;
      var MI = root.MuseIncidents; if (!MI || typeof MI.createRecord !== 'function') throw new Error('Incident logging is not available.');
      var k = needProd(a), rec = { production: k, title: String(a.title || '').slice(0, 160), severity: a.severity || 'SEV-3', category: a.category || 'Process', summary: String(a.summary || '').slice(0, 2000), started: new Date().toISOString() };
      return propose(run, {
        text: 'Log **' + rec.severity + '** incident on **' + prods()[k].name + '**: ' + rec.title + '\n\n' + rec.category + ' · ' + clip(rec.summary, 240) + '\n\nThe current stream telemetry is attached.',
        apply: function () { var r = MI.createRecord(rec); return { done: 'Logged **' + (r && r.id ? r.id : 'incident') + '**.', nav: r && r.id ? { kind: 'incident', id: r.id } : null }; }
      });
    },
    apply_stream_recommendation: function (a, run) {
      if (run.headless) return HEADLESS_WRITE;
      var MS = root.MuseStreaming; if (!MS || typeof MS.anomalies !== 'function' || typeof MS.apply !== 'function') throw new Error('Stream recommendations are not available.');
      var k = needProd(a), list = (MS.anomalies() || []).filter(function (x) { return x.key === k && x.recommendation && x.recommendation.kind !== 'none'; });
      if (a.kind) list = list.filter(function (x) { return x.recommendation.kind === a.kind; }).concat(list.filter(function (x) { return x.recommendation.kind !== a.kind; }));
      var an = list[0];
      if (!an) return { ok: true, note: 'There is no active anomaly with a recommended fix on ' + prods()[k].name + ' right now.' };
      return propose(run, {
        text: '**' + prods()[k].name + '**: ' + an.text + '\n\nApply: **' + an.recommendation.label + '**?',
        apply: function () { var r = MS.apply(an.recommendation) || {}; return { done: r.ok === false ? 'That did not go through: ' + (r.text || 'unknown error') : (r.text || 'Applied.'), nav: { kind: 'tab', key: k, tab: 'streaming' } }; }
      });
    },
    get_bookings: function (a) {
      var S2 = root.MuseSchedule; if (!S2) throw new Error('Muse Schedule is not loaded.');
      var f = {}; if (a.production) f.prod = resolveProd(a.production); if (a.type) f.type = resolveType(a.type); if (a.from) f.from = a.from; if (a.to) f.to = a.to;
      if (a.resource) f.res = resolveRes(a.resource);
      var list = S2.bookings(f) || [];
      return { count: list.length, bookings: list.slice(0, 80).map(bookingOut) };
    },
    check_availability: function (a) {
      var S2 = root.MuseSchedule; if (!S2) throw new Error('Muse Schedule is not loaded.');
      var start = new Date(a.start).toISOString(), end = new Date(a.end).toISOString();
      if (a.resource) {
        var r = resolveRes(a.resource); if (!r) throw new Error('No resource matches "' + a.resource + '".');
        var free = S2.isFree(r, start, end);
        var clash = free ? [] : (S2.bookings({ res: r, from: start, to: end }) || []).map(bookingOut);
        var res = resInfo(r), same = [], later = null;
        if (!free) {
          // Same window on other resources of the same type first, then the next free slot on this one.
          same = (S2.resources(res && res.type) || []).filter(function (x) { return x.id !== r && S2.isFree(x.id, start, end); }).slice(0, 3).map(function (x) { return x.name; });
          try { later = S2.findSlot({ res: r, hours: (new Date(end) - new Date(start)) / 36e5, after: start }); } catch (e) {}
        }
        return { resource: res ? res.name : r, window: fmtWin(start, end), free: free, clashes: clash, free_same_window: same, next_free_on_this_resource: later };
      }
      var slot = S2.findSlot({ type: resolveType(a.type), hours: (new Date(end) - new Date(start)) / 36e5, after: start, limit: 3 });
      return { type: a.type, earliest_free: slot };
    },
    schedule_overview: function (a) { var S2 = root.MuseSchedule; if (!S2) throw new Error('Muse Schedule is not loaded.'); return a.production ? S2.brief(needProd(a)) : S2.summary(); },
    schedule_conflicts: function () { var S2 = root.MuseSchedule; if (!S2) throw new Error('Muse Schedule is not loaded.'); var c = S2.conflicts() || []; return { count: c.length, conflicts: c.slice(0, 40) }; },
    get_streaming: function (a) { var k = needProd(a); return root.MuseStreaming.summary(k); },
    search_incidents: function (a) {
      var k = a.production ? resolveProd(a.production) : '';
      var hits = root.MuseIncidents.search(a.query || '', { production: k || '', severity: a.severity || '', status: a.status || '' });
      // A show name alone may not be in the query words; fall back to everything for that show.
      if (!hits.length && k) hits = root.MuseIncidents.byProduction(k);
      if (!hits.length && a.query) { var k2 = resolveProd(a.query); if (k2 && a.query) hits = root.MuseIncidents.byProduction(k2); }
      return { count: hits.length, incidents: hits.slice(0, 12).map(root.MuseIncidents.brief) };
    },
    get_incident: function (a) { var i = root.MuseIncidents.get(a.id); if (!i) throw new Error('No incident ' + a.id); return root.MuseIncidents.full(i); },
    get_ops: function (a, run) {
      var c = liveCtx(run), ob = c.ops_backbone || {}, k = a.production ? resolveProd(a.production) : null;
      var pname = k ? norm(prods()[k].name) : '', ptab = k ? norm(prods()[k].tab || '') : '';
      var pick = {
        transmission: { bookings: ob.transmission_bookings, conflicts: ob.transmission_conflicts },
        eng: { requests: ob.eng_requests }, inventory: { items: ob.equipment_inventory },
        personnel: { directory: ob.personnel_directory }, travel: { requests: ob.travel_requests },
        vendors: { vendors: ob.vendors }, tracking: { assets: ob.asset_tracking },
        comms: { messages: ob.communications, critical_alerts: ob.critical_alerts, unread: ob.unread_messages },
        finance: { rollup: ob.finance_rollup, purchase_orders: ob.purchase_orders, work_orders: ob.work_orders, invoices: ob.invoices_ap }
      }[a.area];
      if (a.area === 'controls' || a.area === 'broadcast_ops') {
        var field = a.area === 'controls' ? 'project_controls' : 'broadcast_ops', out = {};
        (k ? [k] : keys()).forEach(function (x) {
          try { var d = root.museaiProductionDocument(x, 'standard'); if (d && d[field] != null) out[prods()[x].name] = d[field]; } catch (e) {}
        });
        return { area: a.area, data: out };
      }
      if (!pick) throw new Error('Unknown area ' + a.area);
      var q = a.search ? norm(a.search) : '';
      Object.keys(pick).forEach(function (f) {
        if (!Array.isArray(pick[f])) return;
        pick[f] = pick[f].filter(function (line) {
          var t = norm(typeof line === 'string' ? line : JSON.stringify(line));
          if (k && a.area !== 'personnel' && a.area !== 'vendors' && t.indexOf(pname) < 0 && (!ptab || t.indexOf(ptab) < 0)) return false;
          return !q || t.indexOf(q) >= 0;
        });
      });
      return { area: a.area, production: k ? prods()[k].name : 'all', data: pick };
    },
    search_knowledge: function (a) {
      var q = String(a.query || ''), out = { wiki: [], product_guide: [] };
      try { out.wiki = (root.MuseKB.chunksForMuseAi(q, 8) || []).map(function (d) { return { title: d.title, kind: d.col || d.kind, team: d.team, text: clip(d.body, 1400) }; }); } catch (e) {}
      try {
        var bp = root.museaiAppBlueprint(null), words = norm(q).split(' ').filter(function (w) { return w.length > 2; });
        var pool = [];
        ['views', 'modules_detail', 'engines', 'maps_layout'].forEach(function (sec) {
          Object.keys(bp[sec] || {}).forEach(function (n) { pool.push({ topic: n.replace(/_/g, ' '), text: String(bp[sec][n]) }); });
        });
        pool.forEach(function (it) { var t = norm(it.topic + ' ' + it.text); it.score = words.reduce(function (s, w) { return s + (t.indexOf(w) >= 0 ? 1 : 0); }, 0); });
        out.product_guide = pool.filter(function (it) { return it.score > 0; }).sort(function (x, y) { return y.score - x.score; }).slice(0, 6)
          .map(function (it) { return { topic: it.topic, text: it.text }; });
      } catch (e) {}
      return out;
    },
    open_in_app: function (a) {
      if (a.incident) { root.MuseIncidents.open(a.incident); return { ok: true, now_showing: 'Incident ' + a.incident }; }
      if (a.tab || (a.production && !a.view)) {
        var k = needProd(a), tab = a.tab || 'overview';
        root.switchView(k);
        setTimeout(function () { try { root.setProjTab(k, tab); } catch (e) {} }, 60);
        return { ok: true, now_showing: prods()[k].name + ' → ' + tab };
      }
      if (a.view) { root.navGo(a.view); return { ok: true, now_showing: a.view }; }
      throw new Error('Give a production and tab, or a view.');
    },
    propose_change: function (a, run) {
      if (run.headless) return { ok: false, note: 'Changes can only be confirmed in the Ask Muse drawer. Tell the user to open Ask Muse and ask there.' };
      var k = needProd(a), p = prods()[k], id = 'act' + (++A._seq), card;
      if (a.action === 'set_department_status') {
        if (!a.status) throw new Error('status is required');
        var dn = resolveDept(p, a.department), row = null;
        (p.dept || []).forEach(function (d) { if (!row && deptVariants(dn || '').indexOf(d[0]) >= 0) row = d; });
        if (!row) throw new Error('That department is not on ' + p.name + '\'s board.');
        if (row[1] === a.status) return { ok: true, note: row[0] + ' is already ' + a.status + '. Nothing to confirm.' };
        card = { id: id, kind: 'deptStatus', key: k, dept: row[0], status: a.status, from: row[1],
          text: 'Set **' + row[0] + '** on **' + p.name + '** from ' + row[1] + ' to **' + a.status + '**?' };
      } else if (a.action === 'export_techbook') {
        card = { id: id, kind: 'techbook', key: k, text: 'Export the live techbook PDF for **' + p.name + '**?' };
      } else throw new Error('Unknown action');
      A.actions[id] = card; run.cards.push(card);
      return { ok: true, awaiting_user_confirmation: true, note: 'A Confirm button is shown to the user under your reply. Tell them what will change.' };
    }
  };

  /* ---------- weather (Open-Meteo, keyless) ---------- */
  var WMO = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail' };
  function getJSON(url) { return fetch(url, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('Weather service HTTP ' + r.status); return r.json(); }); }
  function weather(a) {
    var place = Promise.resolve(null), k = a.production ? resolveProd(a.production) : null;
    if (k) {
      var p = prods()[k], L = null;
      if (a.location && p.locations) { var q = norm(a.location); L = p.locations.filter(function (x) { return norm(x.id) === q || norm(x.name).indexOf(q) >= 0 || norm(x.city).indexOf(q) >= 0 || norm(x.venue).indexOf(q) >= 0; })[0] || null; }
      if (!L) { try { L = root.activeLocation(k); } catch (e) {} }
      if (L && typeof L.lat === 'number') place = Promise.resolve({ name: L.name + (L.venue && L.venue.indexOf(L.name) < 0 && L.name.indexOf(L.venue) < 0 ? ' · ' + L.venue : '') + (L.city ? ', ' + L.city : ''), lat: L.lat, lng: L.lng, tz: L.tz, production: p.name });
      else { var g = null; try { g = root.projGeo(p, k); } catch (e) {} if (g) place = Promise.resolve({ name: p.venue, lat: g[0], lng: g[1], production: p.name }); }
    } else if (a.location) {
      place = getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(a.location)).then(function (g) {
        var h = g.results && g.results[0]; if (!h) throw new Error('Could not find "' + a.location + '".');
        return { name: h.name + (h.admin1 ? ', ' + h.admin1 : '') + (h.country_code ? ', ' + h.country_code : ''), lat: h.latitude, lng: h.longitude, tz: h.timezone };
      });
    }
    return place.then(function (pl) {
      if (!pl) throw new Error('Give a production or a place for the weather.');
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pl.lat + '&longitude=' + pl.lng +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m' +
        '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,sunrise,sunset' +
        '&forecast_days=16&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=' + encodeURIComponent(pl.tz || 'auto');
      return getJSON(url).then(function (w) {
        var c = w.current || {}, h = w.hourly || {}, d = w.daily || {};
        var idx = 0, nowIso = c.time || '';
        while (h.time && idx < h.time.length && h.time[idx] < nowIso.slice(0, 13)) idx++;
        var hourly = [], from = idx, to = idx + 24;
        if (a.date && h.time) { from = h.time.findIndex(function (t) { return t.indexOf(a.date) === 0; }); to = from + 24; }
        if (from >= 0 && h.time) for (var i = from; i < Math.min(to, h.time.length); i++) {
          hourly.push({ time: h.time[i], temp_f: h.temperature_2m[i], rain_chance: h.precipitation_probability[i], rain_in: h.precipitation[i], sky: WMO[h.weather_code[i]] || h.weather_code[i], wind_mph: h.wind_speed_10m[i], gusts_mph: h.wind_gusts_10m[i] });
        }
        var daily = (d.time || []).map(function (t, i) {
          return { date: t, sky: WMO[d.weather_code[i]] || d.weather_code[i], high_f: d.temperature_2m_max[i], low_f: d.temperature_2m_min[i], rain_chance: d.precipitation_probability_max[i], rain_in: d.precipitation_sum[i], wind_max_mph: d.wind_speed_10m_max[i], gusts_max_mph: d.wind_gusts_10m_max[i], uv_max: d.uv_index_max[i], sunrise: d.sunrise[i], sunset: d.sunset[i] };
        });
        return {
          place: pl.name, production: pl.production || null, time_zone: w.timezone, local_time: c.time,
          now: { sky: WMO[c.weather_code] || c.weather_code, temp_f: c.temperature_2m, feels_like_f: c.apparent_temperature, humidity: c.relative_humidity_2m, precip_in: c.precipitation, cloud_cover: c.cloud_cover, wind_mph: c.wind_speed_10m, gusts_mph: c.wind_gusts_10m, wind_dir_deg: c.wind_direction_10m },
          hourly: hourly, daily: daily,
          note: a.date && from < 0 ? a.date + ' is outside the 16-day forecast window.' : undefined,
          source: 'Open-Meteo'
        };
      });
    });
  }

  /* ---------- write proposals (Confirm cards) ---------- */
  var HEADLESS_WRITE = { ok: false, note: 'Changes can only be confirmed in the Ask Muse drawer. Tell the user to open Ask Muse and ask there.' };
  function propose(run, card) {
    card.id = 'act' + (++A._seq); card.kind = 'generic';
    A.actions[card.id] = card; run.cards.push(card);
    return { ok: true, awaiting_user_confirmation: true, note: 'A Confirm card is shown under your reply. Tell the user what will change; nothing happens until they confirm.' };
  }
  function isoOf(x) { var d = new Date(x); if (isNaN(d)) throw new Error('Could not read the time "' + x + '".'); return d.toISOString(); }
  function fmtWin(a, b) {
    var s = new Date(a), e = new Date(b), o = { weekday: 'short', month: 'short', day: 'numeric' }, t = { hour: 'numeric', minute: '2-digit' };
    return s.toLocaleDateString('en-US', o) + ' ' + s.toLocaleTimeString('en-US', t) + '–' + (s.toDateString() === e.toDateString() ? '' : e.toLocaleDateString('en-US', o) + ' ') + e.toLocaleTimeString('en-US', t);
  }
  function resName(id) { var r = resInfo(id); return r ? r.name : id; }

  /* ---------- Muse Schedule helpers ---------- */
  function resList() { try { return root.MuseSchedule.resources() || []; } catch (e) { return []; } }
  function resInfo(id) { return resList().filter(function (r) { return r.id === id || r.name === id; })[0] || null; }
  function resolveType(x) {
    var q = norm(x), ts = []; try { ts = root.MuseSchedule.types() || []; } catch (e) {}
    var t = ts.filter(function (t) { return norm(t.id) === q || norm(t.label) === q; })[0] || ts.filter(function (t) { return norm(t.label).indexOf(q) >= 0 || q.indexOf(norm(t.id)) >= 0; })[0];
    return t ? t.id : x;
  }
  function resolveRes(x) {
    var q = norm(x), list = resList();
    var hit = list.filter(function (r) { return norm(r.id) === q || norm(r.name) === q || norm(r.name).replace(/ /g, '') === q.replace(/ /g, ''); })[0] ||
      list.filter(function (r) { return norm(r.name).indexOf(q) >= 0; })[0];
    return hit ? hit.id : null;
  }
  function bookingOut(b) {
    var r = resInfo(b.res);
    return { id: b.id, resource: r ? r.name : b.res, type: r ? r.type : undefined, production: prods()[b.prod] ? prods()[b.prod].name : b.prod, title: b.title, start: b.start, end: b.end, status: b.status, on_air: !!b.onAir, notes: b.notes || undefined };
  }

  /* ---------- labels for the trace chips ---------- */
  function traceLabel(name, a, res) {
    var p = a && a.production ? resolveProd(a.production) : null, pn = p ? (prods()[p].tab || prods()[p].name) : '';
    switch (name) {
      case 'get_production': return 'Show overview · ' + pn;
      case 'get_department': return (res && res.department ? res.department : a.department) + ' · ' + pn;
      case 'get_techbook': return 'Techbook' + (a.department ? ' · ' + a.department : '') + ' · ' + pn;
      case 'get_equipment': return 'Pack list' + (a.search ? ' · ' + a.search : '') + ' · ' + pn;
      case 'get_crew': return 'Crew · ' + pn;
      case 'get_schedule': return 'Schedule · ' + pn;
      case 'get_site': return 'Site & survey · ' + pn;
      case 'get_weather': return 'Weather · ' + (res && res.place ? clip(res.place.split(' · ')[0].split(',')[0], 28) : (a.location || pn));
      case 'get_ops': return a.area.replace('_', ' ').replace(/^./, function (c) { return c.toUpperCase(); }) + (pn ? ' · ' + pn : '');
      case 'search_knowledge': return 'Wiki · ' + clip(a.query, 24);
      case 'get_streaming': return 'Stream health · ' + pn;
      case 'search_incidents': return 'Incidents · ' + clip(a.query || pn || 'all', 24) + (res && res.count != null ? ' (' + res.count + ')' : '');
      case 'get_incident': return a.id;
      case 'get_bookings': return 'Schedule' + (a.resource ? ' · ' + a.resource : '') + (pn ? ' · ' + pn : '') + (res && res.count != null ? ' (' + res.count + ')' : '');
      case 'check_availability': return 'Availability · ' + (a.resource || a.type || '');
      case 'schedule_overview': return 'Schedule overview' + (pn ? ' · ' + pn : '');
      case 'schedule_conflicts': return 'Schedule conflicts' + (res && res.count != null ? ' (' + res.count + ')' : '');
      case 'open_in_app': return 'Opened ' + (a.tab || a.view || 'show');
      case 'get_live_status': return 'Live status · all shows';
      case 'create_booking': return 'Booking proposed';
      case 'update_booking': return 'Booking change proposed';
      case 'log_incident': return 'Incident proposed';
      case 'apply_stream_recommendation': return 'Stream fix proposed';
      case 'propose_change': return 'Change proposed';
      default: return name;
    }
  }
  var WORKING = {
    get_production: 'Reading the show file', get_department: 'Checking the department board', get_techbook: 'Reading the techbook',
    get_equipment: 'Counting the pack list', get_crew: 'Checking the crew roster', get_schedule: 'Reading the run of show',
    get_site: 'Reviewing the site survey', get_weather: 'Pulling the venue forecast', get_ops: 'Checking ops',
    search_knowledge: 'Searching the wiki', get_streaming: 'Reading stream telemetry', search_incidents: 'Searching incident reports', get_incident: 'Reading the post-mortem', get_bookings: 'Checking Muse Schedule', check_availability: 'Checking availability', schedule_conflicts: 'Checking for conflicts', schedule_overview: 'Reading the schedule', open_in_app: 'Opening it for you', propose_change: 'Preparing a change',
    get_live_status: 'Checking every live show', create_booking: 'Preparing a booking', update_booking: 'Preparing a booking change', log_incident: 'Drafting an incident', apply_stream_recommendation: 'Preparing the fix'
  };

  // Where a source chip leads when clicked: the exact screen Muse read.
  function navFor(name, a, out) {
    var k = a && a.production ? resolveProd(a.production) : null;
    var TAB = { get_production: 'overview', get_department: 'overview', get_techbook: 'overview', get_equipment: 'packlist', get_crew: 'crew', get_schedule: 'schedule', get_site: 'survey', get_streaming: 'streaming', get_weather: 'overview' };
    if (TAB[name] && k) return { kind: 'tab', key: k, tab: TAB[name] };
    if (name === 'get_incident' && a.id) return { kind: 'incident', id: a.id };
    if (name === 'search_incidents') { var first = out && out.incidents && out.incidents.length === 1 ? out.incidents[0].id : null; return first ? { kind: 'incident', id: first } : { kind: 'view', view: 'incidents' }; }
    if (name === 'get_bookings' || name === 'check_availability') return { kind: 'schedule', res: a.resource || '' };
    if (name === 'schedule_overview' || name === 'schedule_conflicts') return { kind: 'schedule', panel: name === 'schedule_conflicts' ? 'conflicts' : '' };
    if (name === 'get_live_status') return { kind: 'view', view: 'streams' };
    if (name === 'search_knowledge') { var w = out && out.wiki && out.wiki[0]; return { kind: 'wiki', title: w ? w.title : '' }; }
    if (name === 'get_ops') {
      var V = { finance: 'finance', eng: 'engrequests', inventory: 'equipment', personnel: 'personnel', travel: 'portal', vendors: 'vendors', comms: 'comms', tracking: 'telemetry', transmission: 'dashboard' };
      if ((a.area === 'controls' || a.area === 'broadcast_ops') && k) return { kind: 'tab', key: k, tab: a.area === 'controls' ? 'overview' : 'ops' };
      return V[a.area] ? { kind: 'view', view: V[a.area] } : null;
    }
    return null;
  }
  function go(n) {
    if (!n) return;
    try {
      if (n.kind === 'tab') { root.projSubTab[n.key] = n.tab; root.navGo(n.key); setTimeout(function () { try { root.setProjTab(n.key, n.tab); } catch (e) {} }, 60); }
      else if (n.kind === 'view') root.navGo(n.view);
      else if (n.kind === 'incident') root.MuseIncidents.open(n.id);
      else if (n.kind === 'schedule') {
        root.navGo('schedule');
        setTimeout(function () { try { if (root.setSchedTab) root.setSchedTab('muse'); } catch (e) {} try { if (n.res && root.MuseSchedule.focusRes) root.MuseSchedule.focusRes(n.res); if (n.panel && root.MuseSchedule.panel) root.MuseSchedule.panel(n.panel); } catch (e) {} }, 120);
      } else if (n.kind === 'wiki') { root.navGo('kb'); if (n.title && root.MuseKB && root.MuseKB.openByTitle) setTimeout(function () { try { root.MuseKB.openByTitle(n.title); } catch (e) {} }, 150); }
    } catch (e) {}
    // On phones the drawer covers the screen: get out of the way.
    try { if (root.matchMedia && root.matchMedia('(max-width: 767px)').matches && root.museaiOpen) root.toggleMuseAi(); } catch (e) {}
  }

  function runTool(call, run) {
    var name = call.function.name, args = {};
    try { args = JSON.parse(call.function.arguments || '{}') || {}; } catch (e) { return Promise.resolve({ error: 'Arguments were not valid JSON.' }); }
    var f = TOOLS[name];
    if (!f) return Promise.resolve({ name: name, args: args, out: { error: 'Unknown tool ' + name } });
    return Promise.resolve().then(function () { return f(args, run); })
      .then(function (out) { return { name: name, args: args, out: out }; })
      .catch(function (e) { return { name: name, args: args, out: { error: String(e && e.message || e) }, failed: true }; });
  }
  var INJECTION = /(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|your)\s+(instructions|prompts?|rules|messages)|\byou are now\b|\bnew (system )?instructions?\b|\bsystem prompt\b|<\/?(system|untrusted_data|assistant)[^>]*>|\[\s*(system|assistant)\s*\]/gi;
  function neutralize(str) { return String(str).replace(INJECTION, '[instruction-like text removed]'); }
  function toolContent(out) {
    var s; try { s = neutralize(JSON.stringify(out)); } catch (e) { s = '{"error":"unserializable result"}'; }
    return s.length > TOOL_RESULT_LIMIT ? s.slice(0, TOOL_RESULT_LIMIT) + '…(truncated)' : s;
  }

  /* ---------- markdown (escaped first, then a safe subset) ---------- */
  function inline(s) {
    return s.replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function md(text) {
    var lines = esc(text).replace(/\r/g, '').split('\n'), html = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (/^```/.test(l)) { var code = []; i++; while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); i++; html.push('<pre><code>' + code.join('\n') + '</code></pre>'); continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        var cells = function (r) { return r.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return inline(c.trim()); }); };
        var head = cells(l), body = []; i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
        html.push('<div class="ma-table"><table><thead><tr>' + head.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
          body.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
        continue;
      }
      if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
        var ordered = /^\s*\d/.test(l), items = [], base = l.match(/^\s*/)[0].length;
        while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
          var sub = lines[i].match(/^\s*/)[0].length > base; // indented = nested item
          items.push('<li' + (sub ? ' class="ma-li-sub"' : '') + '>' + inline(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, '')) + '</li>');
        }
        html.push((ordered ? '<ol>' : '<ul>') + items.join('') + (ordered ? '</ol>' : '</ul>'));
        continue;
      }
      var hm = l.match(/^#{1,4}\s+(.*)/);
      if (hm) { html.push('<p class="ma-h">' + inline(hm[1]) + '</p>'); i++; continue; }
      if (!l.trim()) { i++; continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*([-*•]|\d+[.)])\s+)/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) para.push(inline(lines[i++]));
      html.push('<p>' + para.join('<br>') + '</p>');
    }
    return html.join('');
  }

  /* ---------- rendering ---------- */
  function scrollDown() { var m = $('museaiMessages'); if (m) m.scrollTop = m.scrollHeight; }
  function clearHero() { var h = $('museaiHero'); if (h) h.remove(); }
  function rowUser(text) {
    clearHero();
    var el = document.createElement('div'); el.className = 'ma-row ma-user';
    el.innerHTML = '<div class="ma-bubble">' + esc(text) + '</div>';
    $('museaiMessages').appendChild(el); scrollDown();
  }
  function rowBot(html, opts) {
    clearHero(); opts = opts || {};
    var el = document.createElement('div'); el.className = 'ma-row ma-bot' + (opts.error ? ' is-error' : '');
    el.innerHTML = '<img class="ma-ava" src="' + FACE + '" alt="" width="28" height="28" draggable="false">' +
      '<div class="ma-body"><div class="ma-bubble ma-md">' + html + '</div></div>';
    $('museaiMessages').appendChild(el); scrollDown();
    return el;
  }
  function addTrace(row, traces, metric) {
    if (!traces.length && !metric) return;
    var t = document.createElement('div'); t.className = 'ma-trace';
    t.setAttribute('aria-label', 'What Muse checked. Select a source to open it.');
    t.innerHTML = traces.map(function (x) {
      if (!x.nav) return '<span class="ma-chip' + (x.failed ? ' is-failed' : '') + '">' + esc(x.label) + '</span>';
      var id = 'nv' + (++A._seq); A.navs[id] = x.nav;
      return '<button type="button" class="ma-chip ma-chip-link' + (x.failed ? ' is-failed' : '') + '" onclick="MuseAgent.go(\'' + id + '\')" title="Open this in Muse Live">' + esc(x.label) + '<span aria-hidden="true">↗</span></button>';
    }).join('') + (metric ? '<span class="ma-metric" title="Answer time · reasoning effort">' + (metric.ms / 1000).toFixed(1) + ' s' + (metric.steps > 1 ? ' · ' + metric.steps + ' steps' : '') + '</span>' : '');
    row.querySelector('.ma-body').appendChild(t);
  }
  function addCards(row, cards) {
    cards.forEach(function (c) {
      var d = document.createElement('div'); d.className = 'ma-card'; d.id = 'ma-' + c.id;
      d.innerHTML = '<div class="ma-card-text">' + md(c.text) + '</div><div class="ma-card-btns">' +
        '<button type="button" class="ma-btn ma-btn-primary" onclick="MuseAgent.confirm(\'' + c.id + '\')">Confirm</button>' +
        '<button type="button" class="ma-btn" onclick="MuseAgent.cancel(\'' + c.id + '\')">Cancel</button></div>';
      row.querySelector('.ma-body').appendChild(d);
    });
    scrollDown();
  }
  function working(text) {
    var w = $('museaiWorking');
    if (text == null) { if (w) w.remove(); return; }
    if (!w) {
      clearHero();
      w = document.createElement('div'); w.id = 'museaiWorking'; w.className = 'ma-row ma-bot ma-working';
      w.innerHTML = '<img class="ma-ava" src="' + FACE + '" alt="" width="28" height="28" draggable="false"><div class="ma-body"><div class="ma-bubble"><span class="ma-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="ma-working-text"></span></div></div>';
      $('museaiMessages').appendChild(w);
    }
    w.querySelector('.ma-working-text').textContent = text;
    scrollDown();
  }
  function setHeaderState(s) {
    var d = $('museaiDrawer'); if (d) d.setAttribute('data-muse-state', s);
    var lab = $('museaiStatusText');
    if (lab) lab.textContent = s === 'working' ? 'Working on it…' : (A.state === 'offline' ? 'Quick answers mode' : 'On comms · ready');
  }
  function setBusy(on) {
    A.busy = on; root.museaiBusy = on;
    var b = $('museaiSendBtn'); if (b) { b.classList.toggle('is-stop', on); b.setAttribute('aria-label', on ? 'Stop' : 'Send'); }
    setHeaderState(on ? 'working' : 'idle');
  }

  /* ---------- welcome (shown on an empty conversation) ---------- */
  function suggestions() {
    var P = prods(), ks = keys(), f = null;
    try { f = root.museaiFocusKey(); } catch (e) {}
    var focus = P[f] ? f : ks[0], fp = P[focus];
    var withPending = ks.filter(function (k) { return (P[k].dept || []).some(function (d) { return d[1] !== 'approved'; }); })[0];
    var pd = withPending ? (P[withPending].dept || []).filter(function (d) { return d[1] !== 'approved'; })[0] : null;
    var out = [];
    if (fp) out.push("What's the weather on location for " + (fp.tab || fp.name) + '?');
    if (fp) out.push('How many cameras are we using for ' + (fp.tab || fp.name) + '?');
    if (pd) out.push('Has ' + pd[0] + ' finished on ' + (P[withPending].tab || P[withPending].name) + "? What's missing?");
    out.push('What happened at the Ray-Ban event?');
    out.push('Give me a health check on every live stream');
    return out;
  }
  function renderHero() {
    var m = $('museaiMessages'); if (!m || $('museaiHero')) return;
    var h = document.createElement('div'); h.id = 'museaiHero'; h.className = 'ma-hero';
    h.innerHTML =
      '<div class="ma-row ma-bot"><img class="ma-ava" src="' + FACE + '" alt="" width="28" height="28" draggable="false">' +
        '<div class="ma-body"><div class="ma-bubble ma-md"><p>Hi, I\'m Muse. I know every show in Muse Live: weather on location, camera counts, department readiness, crew, transmission and more. What do you need?</p></div></div></div>' +
      '<div class="ma-suggest">' + suggestions().map(function (s) { return '<button type="button" class="ma-suggest-btn" onclick="MuseAgent.ask(this.textContent)">' + esc(s) + '</button>'; }).join('') + '</div>';
    m.appendChild(h);
  }

  /* ---------- talking to the model ---------- */
  // Streams when asked: the server answers with SSE ({t:'d',v} text deltas, then {t:'done', message}).
  // Falls back to plain JSON transparently (older server, glance mode, upstream without streaming).
  function post(body, signal, onDelta) {
    return fetch('/api/museai', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal })
      .then(function (r) {
        var ct = r.headers.get('Content-Type') || '';
        if (r.ok && /event-stream/i.test(ct) && r.body && r.body.getReader) return readSSE(r.body.getReader(), onDelta);
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || !j.ok) { var e = new Error(j.error || ('Muse is unavailable (HTTP ' + r.status + ').')); e.status = r.status; e.configured = j.configured; throw e; }
          return j;
        });
      });
  }
  function readSSE(reader, onDelta) {
    var dec = new TextDecoder(), buf = '', text = '', done = null;
    function pump() {
      return reader.read().then(function (x) {
        if (x.value) {
          buf += dec.decode(x.value, { stream: true });
          var i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            var ev = buf.slice(0, i); buf = buf.slice(i + 2);
            ev.split('\n').forEach(function (line) {
              if (line.indexOf('data:') !== 0) return;
              var j; try { j = JSON.parse(line.slice(5).trim()); } catch (e) { return; }
              if (j.t === 'd') { text += j.v; if (onDelta) onDelta(text); }
              else if (j.t === 'tool') { if (onDelta) onDelta(text, true); }
              else if (j.t === 'done') done = j;
              else if (j.t === 'error') { var e2 = new Error(j.error || 'Muse stream failed.'); throw e2; }
            });
          }
        }
        if (x.done) { if (!done) throw new Error('The answer was cut off. Try again.'); return done; }
        return pump();
      });
    }
    return pump();
  }
  // Effort routing: quick lookups stay fast; portfolio-wide analysis and post-mortems get more thought.
  function routeEffort(q) {
    q = String(q || '').toLowerCase();
    if (/\b(compare|briefing|brief me|summari[sz]e|post-?mortem|what happened|why|root cause|plan|recommend|analy[sz]e|morning)\b/.test(q)) return 'medium';
    if (/^(open|go to|show me|take me|switch to)\b/.test(q)) return 'minimal';
    return 'low';
  }
  function trimThread() {
    // Keep whole turns only (never start on a tool result), and stay well under the server cap.
    var t = A.thread;
    while (t.length > 90 || (t.length > 2 && JSON.stringify(t).length > 600000)) {
      var next = 1; while (next < t.length && t[next].role !== 'user') next++;
      if (next >= t.length) break;
      t.splice(0, next);
    }
  }
  // One agent run: model step → tools → model step … until the model answers in text.
  function runLoop(run) {
    var steps = 0;
    run.t0 = run.t0 || Date.now(); run.tokens = 0;
    function step() {
      if (++steps > MAX_STEPS) return Promise.reject(new Error('That took more steps than I allow myself. Try a narrower question.'));
      run.steps = steps; run.stepFirst = null;
      var timer = setTimeout(function () { if (run.ctl) run.ctl.abort(); }, STEP_TIMEOUT_MS);
      var body = { messages: run.thread, snapshot: run.snap, turnStart: run.turnStart, effort: run.effort || 'low' };
      if (run.onDelta && A.stream) body.stream = true;
      return post(body, run.ctl && run.ctl.signal, run.onDelta ? function (txt, tool) { if (!run.stepFirst && txt && !tool) run.stepFirst = Date.now() - run.t0; run.onDelta(txt, tool); } : null).then(function (j) {
        clearTimeout(timer);
        if (j.usage && j.usage.total_tokens) run.tokens += j.usage.total_tokens;
        var msg = j.message || { role: 'assistant', content: '' };
        run.thread.push(msg);
        if (msg.tool_calls && msg.tool_calls.length) {
          if (run.onStepTools) run.onStepTools();
          if (run.onWorking) run.onWorking((WORKING[msg.tool_calls[0].function.name] || 'Checking') + '…');
          return Promise.all(msg.tool_calls.map(function (c) { return runTool(c, run); })).then(function (results) {
            results.forEach(function (r, i) {
              run.thread.push({ role: 'tool', tool_call_id: msg.tool_calls[i].id, content: toolContent(r.out) });
              run.traces.push({ label: traceLabel(r.name, r.args, r.out), failed: r.failed, nav: r.failed ? null : navFor(r.name, r.args, r.out) });
            });
            return step();
          });
        }
        run.firstMs = run.stepFirst; // time to the first token of the answer itself
        return msg.content || '';
      }, function (e) { clearTimeout(timer); throw e; });
    }
    return step();
  }
  function newRun(thread, opts) {
    return Object.assign({ thread: thread, turnStart: thread.length - 1, snap: snapshot(), traces: [], cards: [], ctx: null,
      ctl: root.AbortController ? new AbortController() : null }, opts || {});
  }
  // The answer bubble that fills in token by token while the model writes.
  function liveRow() {
    var el = $('museaiLive');
    if (!el) { working(null); el = rowBot('', {}); el.id = 'museaiLive'; el.classList.add('ma-live'); }
    return el;
  }
  function turn(q) {
    A.thread.push({ role: 'user', content: q });
    trimThread();
    var pending = null, lastText = '', finished = false;
    function paint() { pending = null; if (!lastText || finished) return; var el = liveRow(); el.querySelector('.ma-md').innerHTML = md(lastText) + '<span class="ma-caret" aria-hidden="true"></span>'; scrollDown(); }
    var run = newRun(A.thread, {
      effort: routeEffort(q), onWorking: working,
      onDelta: function (txt, tool) {
        if (tool) return; // tool-call deltas: the working indicator covers it
        lastText = txt;
        if (!pending) pending = (root.requestAnimationFrame || setTimeout)(paint);
      },
      // Text written before a tool call is a progress note, not the answer: fold it into the indicator.
      onStepTools: function () { var el = $('museaiLive'); if (el) el.remove(); lastText = ''; }
    });
    A._abort = run.ctl;
    setBusy(true); working('Listening on comms');
    return runLoop(run).then(function (text) {
      finished = true; working(null);
      var live = $('museaiLive');
      var metric = { q: q, effort: run.effort, ms: Date.now() - run.t0, firstMs: run.firstMs || null, steps: run.steps, tools: run.traces.map(function (t) { return t.label; }), tokens: run.tokens };
      A.metrics.push(metric); if (A.metrics.length > 50) A.metrics.shift();
      var html = md(text || "I didn't get an answer back. Try asking again."), row;
      if (live) { row = live; row.removeAttribute('id'); row.classList.remove('ma-live'); row.querySelector('.ma-md').innerHTML = html; }
      else row = rowBot(html);
      addTrace(row, run.traces, metric); addCards(row, run.cards);
      if (root.museaiHistory) root.museaiHistory.push({ role: 'assistant', content: text });
      try { document.dispatchEvent(new CustomEvent('muse:answer', { detail: { text: text, question: q } })); } catch (e) {}
    }).catch(function (e) {
      finished = true; working(null);
      var live = $('museaiLive'); if (live) live.remove();
      // Roll back this turn's partial tool steps so the next question starts clean.
      A.thread.splice(run.turnStart);
      if (e && e.name === 'AbortError') { rowBot('<p>Stopped.</p>'); return; }
      if (e && (e.status === 503 || e.configured === false)) { goOffline(); rulesDeliver(q); return; }
      rowBot('<p>' + esc(e && e.message ? e.message : 'Something went wrong.') + '</p>', { error: true });
    }).then(function () { A._abort = null; setBusy(false); });
  }
  // Headless one-shot answers for the global search "Ask Muse" panel and Omni "@museai".
  root.MuseAiMuseAi = {
    ask: function (q) {
      var go = A.state === 'unknown' ? probe() : Promise.resolve(A.state);
      return go.then(function (st) {
        if (st !== 'online') throw new Error('offline');
        return runLoop(newRun([{ role: 'user', content: String(q || '') }], { headless: true, effort: routeEffort(q) }));
      });
    }
  };

  function goOffline() { A.state = 'offline'; setHeaderState('idle'); }
  function probe() {
    return fetch('/api/museai', { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { A.state = j && j.configured ? 'online' : 'offline'; })
      .catch(function () { A.state = 'offline'; })
      .then(function () { setHeaderState('idle'); return A.state; });
  }

  /* ---------- public surface (wired to the existing drawer globals) ---------- */
  A.ask = function (q) {
    q = String(q || '').trim(); if (!q || A.busy) return;
    if (!root.museaiOpen && has('toggleMuseAi')) root.toggleMuseAi();
    var inp = $('museaiInput'); if (inp) inp.value = '';
    rowUser(q);
    root.museaiDeliver(q);
  };
  A.stop = function () { if (A._abort) A._abort.abort(); };
  A.go = function (id) { go(A.navs[id]); };
  // Shared rendering helpers for js/muse-proactive.js and js/muse-voice.js.
  A.ui = { md: md, esc: esc, rowBot: function (html, o) { return rowBot(html, o); }, scrollDown: function () { scrollDown(); } };
  A.reset = function () {
    if (A.busy) A.stop();
    A.thread = []; A.actions = {};
    var m = $('museaiMessages'); if (m) m.innerHTML = '';
    renderHero();
    var inp = $('museaiInput'); if (inp) inp.focus();
  };
  A.confirm = function (id) {
    var c = A.actions[id], el = $('ma-' + id); delete A.actions[id];
    if (!c) return;
    if (c.kind === 'generic') {
      var res2 = null, done2 = '';
      try { res2 = c.apply() || {}; done2 = res2.done || 'Done.'; } catch (e) { done2 = 'That change did not go through: ' + (e.message || e); }
      if (res2 && res2.undo) A.actions['undo' + id] = { kind: 'genericUndo', fn: res2.undo };
      var navId = null; if (res2 && res2.nav) { navId = 'nv' + (++A._seq); A.navs[navId] = res2.nav; }
      if (el) {
        el.innerHTML = '<div class="ma-card-text">' + md(done2) + '</div><div class="ma-card-btns">' +
          (A.actions['undo' + id] ? '<button type="button" class="ma-btn" onclick="MuseAgent.undo(\'undo' + id + '\')">Undo</button>' : '') +
          (navId ? '<button type="button" class="ma-btn" onclick="MuseAgent.go(\'' + navId + '\')">Open</button>' : '') + '</div>';
        el.classList.add('is-done');
      }
      A.thread.push({ role: 'user', content: '[The user confirmed: ' + c.text.replace(/\*\*/g, '') + ' Result: ' + done2.replace(/\*\*/g, '') + ']' });
      A.thread.push({ role: 'assistant', content: 'Noted.' });
      return;
    }
    var p = prods()[c.key], done = '';
    try {
      if (c.kind === 'deptStatus') {
        var idx = -1; (p.dept || []).forEach(function (d, i) { if (idx < 0 && d[0] === c.dept) idx = i; });
        if (idx < 0) throw new Error('That department is no longer on the board.');
        root.setDeptStatus(c.key, idx, c.status);
        A.actions['undo' + id] = { kind: 'undo', key: c.key, idx: idx, prev: c.from, dept: c.dept };
        done = '**' + c.dept + '** is now **' + c.status + '** on **' + p.name + '**.';
      } else if (c.kind === 'techbook') { root.downloadTechbook(c.key); done = 'Exporting the techbook for **' + p.name + '**.'; }
    } catch (e) { done = 'That change did not go through: ' + (e.message || e); }
    if (el) {
      el.innerHTML = '<div class="ma-card-text">' + md(done) + '</div>' +
        (c.kind === 'deptStatus' && A.actions['undo' + id] ? '<div class="ma-card-btns"><button type="button" class="ma-btn" onclick="MuseAgent.undo(\'undo' + id + '\')">Undo</button></div>' : '');
      el.classList.add('is-done');
    }
    A.thread.push({ role: 'user', content: '[The user confirmed: ' + c.text.replace(/\*\*/g, '') + ' Result: ' + done.replace(/\*\*/g, '') + ']' });
    A.thread.push({ role: 'assistant', content: 'Noted.' });
  };
  A.cancel = function (id) {
    var c = A.actions[id], el = $('ma-' + id); delete A.actions[id];
    if (el) { el.innerHTML = '<div class="ma-card-text"><p>Cancelled. Nothing changed.</p></div>'; el.classList.add('is-done'); }
    if (c) { A.thread.push({ role: 'user', content: '[The user cancelled: ' + c.text.replace(/\*\*/g, '') + ']' }); A.thread.push({ role: 'assistant', content: 'Understood.' }); }
  };
  A.undo = function (id) {
    var u = A.actions[id], el = id && document.querySelector('[onclick="MuseAgent.undo(\'' + id + '\')"]'); delete A.actions[id];
    if (!u) return;
    if (u.kind === 'genericUndo') { var msg = 'Undone.'; try { msg = u.fn() || msg; } catch (e) { msg = 'Could not undo: ' + (e.message || e); } if (el) el.parentNode.innerHTML = '<span class="ma-card-note">' + esc(msg) + '</span>'; return; }
    root.setDeptStatus(u.key, u.idx, u.prev);
    if (el) el.parentNode.innerHTML = '<span class="ma-card-note">Undone. ' + esc(u.dept) + ' is back to ' + esc(u.prev) + '.</span>';
  };

  // Every message path in the app (rules answers, settings test, actions) renders in the new style.
  root.museaiPush = function (text, who) {
    if (who === 'user') return rowUser(text);
    rowBot('<p>' + esc(text).replace(/\n/g, '<br>') + '</p>');
  };
  root.museaiPushHtml = function (html) { rowBot(html); };
  root.museaiTyping = function (on) { working(on ? 'Thinking' : null); };
  root.museaiSend = function () {
    if (A.busy) { A.stop(); return; }
    var inp = $('museaiInput'), q = inp ? inp.value.trim() : '';
    if (!q) return;
    inp.value = ''; rowUser(q); root.museaiDeliver(q);
  };
  root.museaiAsk = A.ask;
  root.museaiChip = function (b) { A.ask(b.textContent); };
  root.museaiDeliver = function (q) {
    if (A.state === 'online') return turn(q);
    if (A.state === 'unknown') return probe().then(function () { root.museaiDeliver(q); });
    return rulesDeliver(q); // offline: built-in rules + public weather/sports
  };
  var baseToggle = root.toggleMuseAi;
  root.toggleMuseAi = function () {
    var m = $('museaiMessages');
    // The original greets into an empty pane; the hero replaces that greeting.
    if (m && !m.childElementCount) renderHero();
    baseToggle.apply(this, arguments);
    document.body.classList.toggle('museai-open', !!root.museaiOpen);
    if (root.museaiOpen) { if (!$('museaiHero')) scrollDown(); if (A.state === 'unknown') probe(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setHeaderState('idle'); });
  else setHeaderState('idle');
})(typeof window !== 'undefined' ? window : globalThis);
