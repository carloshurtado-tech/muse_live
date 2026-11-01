/* Show Caller — cross-module risk detection for live shows.
   Day 1 boundary: READ ONLY. This module gathers state from the schedule,
   streams, incidents, crew, equipment and ops modules and turns it into a
   ranked risk brief with the source record behind every line. It never writes:
   no bookings, no stream changes, no incident edits. Proposals and execution
   arrive behind a human approval step later; this file stays the deterministic
   reader (and the fallback when the model cannot be reached).
   Load-safe with any subset of modules missing: unknown areas are reported
   as unknown, never guessed. */
(function (root) {
  'use strict';

  function prods() { return root.productions || {}; }
  function keys() { return (root.order || Object.keys(prods())).filter(function (k) { return prods()[k]; }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function has(fn) { return typeof fn === 'function'; }
  function cap(a, n) { a = a || []; return a.slice(0, n); }
  // Run a reader; a missing module or a bad shape is an unknown, not a crash.
  function read(name, fn) {
    try { var v = fn(); return v == null ? { unavailable: name + ' returned nothing' } : v; }
    catch (e) { return { unavailable: name + ': ' + (e && e.message ? e.message : 'not loaded') }; }
  }
  function isOut(v) { return !v || v.unavailable; }

  function resolveKey(x) {
    var P = prods(), ks = keys();
    if (x && P[x]) return x;
    var q = norm(x);
    if (!q) return ks[0] || null;
    var hit = null;
    ks.forEach(function (k) {
      if (hit) return;
      var p = P[k];
      if (norm(k) === q || norm(p.name) === q || norm(p.tab) === q) hit = k;
    });
    if (!hit) ks.forEach(function (k) {
      if (hit) return;
      if (norm(prods()[k].name).indexOf(q) >= 0) hit = k;
    });
    return hit;
  }

  /* ---------- readers (one per module, all read-only) ---------- */
  function readSchedule(k) {
    var S = root.MuseSchedule;
    if (!S) return { unavailable: 'Muse Schedule is not loaded' };
    var mine = [];
    try { mine = S.byProduction ? S.byProduction(k) : []; } catch (e) { mine = []; }
    var ids = {};
    mine.forEach(function (b) { if (b && b.id) ids[b.id] = 1; });
    var all = [];
    try { all = S.conflicts ? S.conflicts() : []; } catch (e) { all = []; }
    var rel = (all || []).filter(function (c) {
      return (c.ids || []).some(function (id) { return ids[id]; });
    });
    var rules = [];
    try {
      var rf = S.ruleFindings ? S.ruleFindings() : [];
      rules = (rf || []).filter(function (r) {
        return (r.ids || []).some(function (id) { return ids[id]; }) ||
          norm(r.text).indexOf(norm(prods()[k].name)) >= 0;
      });
    } catch (e) { rules = []; }
    return { bookings: mine, conflicts: rel, rule_findings: rules };
  }

  function readStreams(k) {
    var M = root.MuseStreaming;
    if (!M) return { unavailable: 'Streaming is not loaded' };
    var out = {};
    if (has(M.stateOf)) out.state = M.stateOf(k);
    if (has(M.health)) out.health = M.health(k);
    if (has(M.anomalies)) out.anomalies = (M.anomalies() || []).filter(function (a) { return a.key === k; });
    if (has(M.liveStatus)) { try { out.wall = M.liveStatus(); } catch (e) {} }
    return out;
  }

  function readIncidents(k) {
    var I = root.MuseIncidents;
    if (!I) return { unavailable: 'Incident Reports is not loaded' };
    var mine = [];
    try { mine = I.byProduction ? I.byProduction(k) : []; } catch (e) { mine = []; }
    var open = mine.filter(function (i) { return i.status === 'Open' || i.status === 'Monitoring'; });
    return {
      open: open.map(function (i) { return has(I.brief) ? I.brief(i) : { id: i.id, title: i.title, severity: i.severity, status: i.status }; }),
      recent_closed: mine.filter(function (i) { return i.status !== 'Open' && i.status !== 'Monitoring'; }).slice(0, 3)
        .map(function (i) { return { id: i.id, title: i.title, severity: i.severity }; })
    };
  }

  function readCrew(k) {
    var crew = null, chk = null;
    try { crew = has(root.museaiCrewFull) ? root.museaiCrewFull(k) : null; } catch (e) {}
    try { chk = has(root.museaiCheckinsFull) ? root.museaiCheckinsFull(k) : null; } catch (e) {}
    if (!crew) return { unavailable: 'Crew roster is not loaded' };
    return {
      positions: crew.length,
      open: crew.filter(function (s) { return !String(s.name || '').trim() || s.name === '(OPEN)'; }).map(function (s) { return s.pos; }),
      check_in: chk ? { on_site: chk.on_count, total_named: chk.total_named } : null
    };
  }

  function readEquipment(k) {
    var p = prods()[k];
    if (!has(root.museaiPacklist)) return { unavailable: 'Pack list is not loaded' };
    var list = [];
    try { list = root.museaiPacklist(p, 1000) || []; } catch (e) { list = []; }
    var loose = list.filter(function (it) { return !/pack|ship|load|approved|complete/i.test(it.status || ''); });
    return { lines: list.length, not_packed: loose.length, sample: cap(loose, 10) };
  }

  function readOps(k) {
    if (!has(root.buildMuseAiContext)) return { unavailable: 'Ops context is not loaded' };
    var ctx;
    try { ctx = JSON.parse(root.buildMuseAiContext()); } catch (e) { return { unavailable: 'Ops context did not parse' }; }
    var ob = (ctx && ctx.ops_backbone) || {};
    var p = prods()[k], want = [norm(p.name), norm(p.tab)].filter(Boolean);
    function pick(lines) {
      return (lines || []).filter(function (ln) {
        var t = norm(typeof ln === 'string' ? ln : JSON.stringify(ln));
        return want.some(function (w) { return w && t.indexOf(w) >= 0; });
      });
    }
    return {
      transmission_bookings: cap(pick(ob.transmission_bookings), 10),
      transmission_conflicts: cap(pick(ob.transmission_conflicts), 10),
      eng_requests: cap(pick(ob.eng_requests), 10)
    };
  }

  /* ---------- public boundary ---------- */
  function snapshot(x) {
    var k = resolveKey(x);
    if (!k) return { error: 'No show matches "' + x + '"' };
    return {
      ts: new Date().toISOString(), key: k, show: prods()[k].name,
      schedule: read('schedule', function () { return readSchedule(k); }),
      streams: read('streams', function () { return readStreams(k); }),
      incidents: read('incidents', function () { return readIncidents(k); }),
      crew: read('crew', function () { return readCrew(k); }),
      equipment: read('equipment', function () { return readEquipment(k); }),
      ops: read('ops', function () { return readOps(k); })
    };
  }

  // Template scope: a module the show's template disables is out of
  // scope — not read as a risk, not proposed on. No template module (or
  // no assignment) means the full stack, as before.
  function scopeOn(key, mod) {
    try { return !root.MuseTemplates || root.MuseTemplates.enabled(key, mod); } catch (e) { return true; }
  }

  function sevRank(s) { var m = /SEV-(\d)/.exec(String(s || '')); return m ? +m[1] : 5; }

  function brief(x) {
    var s = typeof x === 'string' || !x ? snapshot(x) : x;
    if (s.error) return s;
    var risks = [], unknown = [];
    ['schedule', 'streams', 'incidents', 'crew', 'equipment', 'ops'].forEach(function (a) {
      if (scopeOn(s.key, a) && isOut(s[a])) unknown.push(a + ' (' + s[a].unavailable + ')');
    });

    // Streams: alerts on a live show are the highest line.
    var st = scopeOn(s.key, 'streams') ? (s.streams || {}) : {};
    var live = st.state === 'LIVE' || st.state === 'REHEARSAL';
    ((st.health && st.health.alerts) || []).forEach(function (al) {
      risks.push({ level: live ? 'high' : 'med', area: 'streams',
        text: (st.health.state || st.state || 'stream') + ': ' + (al.text || al),
        sources: ['stream health · ' + s.show] });
    });
    (st.anomalies || []).forEach(function (a) {
      risks.push({ level: live ? 'high' : 'med', area: 'streams',
        text: 'Anomaly on ' + (a.stage || 'stream') + ': ' + a.text +
          (a.recommendation ? ' Recommended fix: ' + (a.recommendation.label || a.recommendation) : ''),
        sources: ['stream anomaly · ' + (a.stage || s.show)] });
    });

    // Schedule: double-books touching this show; labor findings behind them.
    var sch = scopeOn(s.key, 'schedule') ? (s.schedule || {}) : {};
    (sch.conflicts || []).forEach(function (c) {
      risks.push({ level: /double|overlap|clash/i.test(c.kind || c.text || '') ? 'high' : 'med', area: 'schedule',
        text: 'Booking conflict on ' + (c.res || 'a resource') + ': ' + (c.text || c.kind),
        sources: (c.ids || []).map(function (id) { return 'booking ' + id; }) });
    });
    (sch.rule_findings || []).forEach(function (r) {
      risks.push({ level: 'med', area: 'schedule', text: 'Labor rule: ' + (r.text || r.kind),
        sources: ['labor rules · ' + (r.res || s.show)] });
    });

    // Incidents: open ones, most severe first.
    var inc = scopeOn(s.key, 'incidents') ? (s.incidents || {}) : {};
    (inc.open || []).slice().sort(function (a, b) { return sevRank(a.severity) - sevRank(b.severity); }).forEach(function (i) {
      risks.push({ level: sevRank(i.severity) <= 2 ? 'high' : 'med', area: 'incidents',
        text: i.id + ' (' + i.severity + ', ' + i.status + '): ' + i.title,
        sources: ['incident ' + i.id] });
    });

    // Crew: unfilled positions.
    var crew = scopeOn(s.key, 'crew') ? (s.crew || {}) : {};
    (crew.open || []).forEach(function (pos) {
      risks.push({ level: 'med', area: 'crew', text: 'Open position: ' + pos + ' has nobody assigned',
        sources: ['crew roster · ' + s.show] });
    });

    // Equipment: gear not yet packed (one aggregate line, not one per item).
    var eq = scopeOn(s.key, 'equipment') ? (s.equipment || {}) : {};
    if (eq.not_packed) {
      risks.push({ level: eq.not_packed > 10 ? 'med' : 'low', area: 'equipment',
        text: eq.not_packed + ' of ' + eq.lines + ' pack-list lines are not packed yet',
        sources: ['pack list · ' + s.show] });
    }

    // Ops: transmission conflicts and ENG pressure naming this show.
    var ops = scopeOn(s.key, 'ops') ? (s.ops || {}) : {};
    (ops.transmission_conflicts || []).forEach(function (c) {
      risks.push({ level: 'med', area: 'ops', text: 'Transmission: ' + (typeof c === 'string' ? c : JSON.stringify(c)),
        sources: ['transmission book · ' + s.show] });
    });

    // Tasks: blocked chains and overdue owners surface as ops risks.
    try {
      if (root.MuseTasks && scopeOn(s.key, 'ops')) {
        var crit = {};
        try {
          if (root.MuseLaunch && typeof root.MuseLaunch.criticalPath === 'function')
            (root.MuseLaunch.criticalPath(s.key).chain || []).forEach(function (id) { crit[id] = 1; });
        } catch (e2) {}
        root.MuseTasks.blocked(s.key).slice(0, 3).forEach(function (t) {
          risks.push({ level: crit[t.id] ? 'high' : 'med', area: 'tasks',
            text: 'Blocked: "' + t.title + '" waits on ' + t.deps.length + ' unfinished dependenc' + (t.deps.length === 1 ? 'y' : 'ies') + (crit[t.id] ? ' — ON THE CRITICAL PATH' : ''),
            sources: ['task chain · ' + s.show] });
        });
        root.MuseTasks.overdue(s.key).slice(0, 3).forEach(function (t) {
          risks.push({ level: crit[t.id] ? 'high' : 'med', area: 'tasks',
            text: 'Overdue: "' + t.title + '"' + (t.owner ? ' (' + t.owner + ')' : '') + (crit[t.id] ? ' — ON THE CRITICAL PATH' : ''),
            sources: ['task chain · ' + s.show] });
        });
      }
    } catch (e) {}

    // Stream Check: visual flags from the last frame run. Errored checks are
    // unavailable — stated as unknown, never read as clean (BUG-06).
    try {
      var chk = scopeOn(s.key, 'streams') && root.MuseStreamCheck && typeof root.MuseStreamCheck.latest === 'function' ? root.MuseStreamCheck.latest(s.key) : null;
      ((chk && chk.flags) || []).forEach(function (f) {
        risks.push({ level: 'high', area: 'streamcheck',
          text: 'Stream Check [' + f.check + (f.concept ? ' ' + f.concept : '') + ']: ' + (f.flag || 'flagged'),
          sources: ['streamcheck · ' + ((chk && chk.slot) || s.show)] });
      });
      if (chk && chk.unavailable && chk.unavailable.length) {
        unknown.push('streamcheck (' + chk.unavailable.map(function (u) { return u.check + ': ' + (u.error || 'unavailable'); }).join('; ') + ')');
      }
    } catch (e) {}

    var rank = { high: 0, med: 1, low: 2 };
    risks.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
    var srcSet = {};
    risks.forEach(function (r) { (r.sources || []).forEach(function (x) { srcSet[x] = 1; }); });
    return { ts: s.ts, show: s.show, key: s.key, risks: risks, unknown: unknown,
      grounding: { lines: risks.length, records: Object.keys(srcSet).length,
        note: 'Every line cites its record; ' + (unknown.length ? unknown.length + ' area(s) unreadable and stated as unknown.' : 'all six ops areas readable.') } };
  }

  /* ---------- fix proposals (Day 2): data only, nothing executes ----------
     Every plan is a verified proposal a human approves later: the free
     alternative was actually checked free, the on-air booking never moves
     when another can. Anything that cannot be verified lands in uncovered
     with the reason, never as a guessed plan. */
  var STREAM_FIX = /^(cdn_shift|failover_backup|raise_srt_latency)$/;

  function propose(x) {
    var s = typeof x === 'string' || !x ? snapshot(x) : x;
    if (s.error) return s;
    var plans = [], uncovered = [];
    function plan(area, ft, action, detail, sources) {
      var rule = null;
      try { if (root.MuseLaunch && typeof root.MuseLaunch.ruleFor === 'function') rule = root.MuseLaunch.ruleFor(action); } catch (e) {}
      var p = { area: area, for: ft, action: action, detail: detail, sources: sources };
      if (rule) p.rule = rule;
      plans.push(p);
    }
    function uncov(ft, why) { uncovered.push({ for: ft, why: why }); }

    // Schedule double-books: move the booking that is NOT on air.
    var sch = scopeOn(s.key, 'schedule') ? (s.schedule || {}) : {}, S = root.MuseSchedule;
    (sch.conflicts || []).forEach(function (c) {
      var ft = 'Booking conflict on ' + (c.res || 'a resource') + ': ' + (c.text || c.kind);
      if (!/double|overlap|clash/i.test(c.kind || c.text || '')) { uncov(ft, 'conflict kind needs a human read'); return; }
      if (!S || !has(S.get) || !has(S.types) || !has(S.resources) || !has(S.isFree)) { uncov(ft, 'schedule read API incomplete — cannot verify a free alternative'); return; }
      var bs = (c.ids || []).map(function (id) { try { return S.get(id); } catch (e) { return null; } }).filter(Boolean);
      if (bs.length < 2) { uncov(ft, 'conflicting bookings are not resolvable'); return; }
      if (bs.filter(function (b) { return b.onAir; }).length > 1) { uncov(ft, 'both bookings are on air — a human decides'); return; }
      var mover = bs.filter(function (b) { return !b.onAir; })[0] || bs[1];
      var other = bs.filter(function (b) { return b.id !== mover.id; })[0];
      var type = null;
      try {
        (S.types() || []).forEach(function (t) {
          if (type) return;
          (S.resources(t.id) || []).forEach(function (r) { if (r.id === mover.res || r.name === mover.res) type = r.type || t.id; });
        });
      } catch (e) { type = null; }
      var alt = null;
      if (type) {
        try {
          alt = (S.resources(type) || []).filter(function (r) {
            return r.id !== mover.res && r.name !== mover.res && S.isFree(r.id, mover.start, mover.end);
          })[0] || null;
        } catch (e) { alt = null; }
      }
      var want = { res: mover.res, start: mover.start, end: mover.end };
      if (alt) plan('schedule', ft, 'reassign_booking',
        { booking: mover.title || mover.id, booking_id: mover.id, from: c.res, to: alt.name, to_id: alt.id, window: [mover.start, mover.end], expected: want },
        ['booking ' + mover.id]);
      else if (other) plan('schedule', ft, 'push_booking',
        { booking: mover.title || mover.id, booking_id: mover.id, after: other.end, other_id: other.id,
          new_start: other.end, new_end: new Date(Date.parse(other.end) + (Date.parse(mover.end) - Date.parse(mover.start))).toISOString(), expected: want },
        ['booking ' + mover.id, 'booking ' + other.id]);
      else uncov(ft, 'no free alternative and no reference booking');
    });
    (sch.rule_findings || []).forEach(function (r) {
      uncov('Labor rule: ' + (r.text || r.kind), 'labor finding names no booking the read API can resolve — needs a human');
    });

    // Stream anomalies with a recommendation carry their own fix.
    var st = scopeOn(s.key, 'streams') ? (s.streams || {}) : {};
    (st.anomalies || []).forEach(function (a) {
      var ft = 'Anomaly on ' + (a.stage || 'stream') + ': ' + a.text, rc = a.recommendation;
      if (rc && rc.kind && STREAM_FIX.test(rc.kind)) plan('streams', ft, 'apply_stream_fix',
        { kind: rc.kind, label: rc.label || rc.kind, args: rc.args || {} },
        ['stream anomaly · ' + (a.stage || s.show)]);
      else uncov(ft, 'anomaly has no automatic action — needs diagnosis');
    });
    ((st.health && st.health.alerts) || []).forEach(function (al) {
      uncov((st.health.state || st.state || 'stream') + ': ' + (al.text || al), 'alert has no attached recommendation — needs diagnosis');
    });

    // Open incidents: review with similar precedent, never auto-resolve.
    var inc = scopeOn(s.key, 'incidents') ? (s.incidents || {}) : {}, I = root.MuseIncidents;
    (inc.open || []).forEach(function (i) {
      var sim = [], open_n = null;
      try {
        if (I && has(I.get) && has(I.similar)) {
          var full = I.get(i.id);
          if (full) {
            sim = (I.similar(full) || []).map(function (o) { return o.id; });
            open_n = (full.actions || []).filter(function (a) { return (a.status == null ? a[3] : a.status) !== 'Done'; }).length;
          }
        }
      } catch (e) {}
      plan('incidents', i.id + ' (' + i.severity + ', ' + i.status + '): ' + i.title, 'review_incident',
        { id: i.id, similar: sim, open_actions: open_n }, ['incident ' + i.id]);
    });

    // Crew: people are picked by people.
    var crew = scopeOn(s.key, 'crew') ? (s.crew || {}) : {};
    (crew.open || []).forEach(function (pos) {
      uncov('Open position: ' + pos + ' has nobody assigned', 'filling a position needs a qualified human pick — skill matching is not automated');
    });

    // Equipment: unpacked lines become a check task.
    var eq = scopeOn(s.key, 'equipment') ? (s.equipment || {}) : {};
    if (eq.not_packed) plan('equipment', eq.not_packed + ' of ' + eq.lines + ' pack-list lines are not packed yet',
      'pack_check', { count: eq.not_packed, lines: eq.lines }, ['pack list · ' + s.show]);

    // Transmission moves stay human-decided on air-critical paths.
    var ops = scopeOn(s.key, 'ops') ? (s.ops || {}) : {};
    (ops.transmission_conflicts || []).forEach(function (c) {
      uncov('Transmission: ' + (typeof c === 'string' ? c : JSON.stringify(c)), 'transmission moves are human-decided on air-critical paths');
    });

    // Stream Check flags need human eyes on the monitor before any action.
    try {
      var chk = scopeOn(s.key, 'streams') && root.MuseStreamCheck && typeof root.MuseStreamCheck.latest === 'function' ? root.MuseStreamCheck.latest(s.key) : null;
      ((chk && chk.flags) || []).forEach(function (f) {
        uncov('Stream Check [' + f.check + ']: ' + (f.flag || 'flagged'), 'visual flag — confirm on the monitor before acting');
      });
      ((chk && chk.unavailable) || []).forEach(function (f) {
        uncov('Stream Check [' + f.check + ']: unavailable', 'check unavailable — ' + (f.error || 'no result') + '; confirm on the monitor');
      });
    } catch (e) {}

    return { ts: s.ts, show: s.show, key: s.key, plans: plans, uncovered: uncovered };
  }

  /* ---------- approval + execution (Day 3): nothing runs without a human ----------
     propose() output is data. requestApproval() parks it; approve() re-verifies
     every expectation against live state (the world may have moved since the
     proposal) and only then calls the existing module actions. notify() posts
     the outcome to Slack/Gmail and files both in the Omni thread; a dead
     channel never rolls back an executed fix. */
  var LS_KEY = 'muselive_showcaller_v1', seq = 0;
  function store() {
    try { var s = JSON.parse(root.localStorage.getItem(LS_KEY) || 'null'); if (s && s.pending && s.log) return s; } catch (e) {}
    return { pending: {}, log: [] };
  }
  function saveStore(s) { try { root.localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} }
  function stamp() { try { if (typeof root.nowStamp === 'function') return root.nowStamp(); } catch (e) {} return new Date().toISOString(); }
  function escH(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b); }

  var APPROVAL_TTL = 10 * 60 * 1000; // frames and bookings move; a plan older than 10 min is stale by definition
  function requestApproval(plan, key, extra) {
    var st = store();
    seq += 1;
    var id = 'SC-' + Date.now().toString(36) + '-' + seq;
    st.pending[id] = { id: id, plan: plan, show: key, ts: stamp(), status: 'pending', note: (extra && extra.note) || '', exp: (extra && extra.exp) || Date.now() + APPROVAL_TTL };
    saveStore(st);
    return st.pending[id];
  }
  function pendingList() {
    var st = store();
    return Object.keys(st.pending).map(function (k) { return st.pending[k]; }).filter(function (a) { return a.status === 'pending'; });
  }
  function reject(id, reason, by) {
    var st = store(), a = st.pending[id];
    if (!a || a.status !== 'pending') return { ok: false, error: 'No pending approval ' + id + '.' };
    a.status = 'rejected'; a.reason = String(reason || 'no reason given').slice(0, 500); a.by = by || ''; a.decided = stamp();
    st.log.unshift({ id: id, action: a.plan.action, status: 'rejected', reason: a.reason, by: a.by, ts: a.decided });
    st.log = st.log.slice(0, 100);
    saveStore(st);
    return { ok: true, id: id };
  }

  function liveNow(key) {
    try { var s = root.MuseStreaming && root.MuseStreaming.stateOf(key); return s === 'LIVE' || s === 'REHEARSAL'; } catch (e) { return false; }
  }
  function execute(a, opts) {
    var d = a.plan.detail || {}, S = root.MuseSchedule, M = root.MuseStreaming;
    if (a.plan.action === 'reassign_booking') {
      if (!S || !has(S.get) || !has(S.update) || !has(S.isFree)) return { ok: false, error: 'Schedule actions are not loaded.' };
      var b = S.get(d.booking_id);
      if (!b) return { ok: false, error: 'Booking ' + d.booking_id + ' is gone.' };
      if (!same(b.res, d.expected.res) || !same(b.start, d.expected.start) || !same(b.end, d.expected.end))
        return { ok: false, stale: true, error: 'Booking changed since the proposal — re-propose instead of executing.' };
      if (!S.isFree(d.to_id, b.start, b.end)) return { ok: false, stale: true, error: d.to + ' is no longer free in that window.' };
      S.update(d.booking_id, { res: d.to_id });
      return { ok: true, text: 'Moved "' + (d.booking || d.booking_id) + '" to ' + d.to + '.' };
    }
    if (a.plan.action === 'push_booking') {
      if (!S || !has(S.get) || !has(S.update)) return { ok: false, error: 'Schedule actions are not loaded.' };
      var m = S.get(d.booking_id), o = S.get(d.other_id);
      if (!m) return { ok: false, error: 'Booking ' + d.booking_id + ' is gone.' };
      if (!same(m.res, d.expected.res) || !same(m.start, d.expected.start) || !same(m.end, d.expected.end))
        return { ok: false, stale: true, error: 'Booking changed since the proposal — re-propose instead of executing.' };
      if (!o || !same(o.end, d.after)) return { ok: false, stale: true, error: 'The blocking booking moved — re-propose instead of executing.' };
      S.update(d.booking_id, { start: d.new_start, end: d.new_end });
      return { ok: true, text: 'Pushed "' + (d.booking || d.booking_id) + '" to start ' + d.new_start + '.' };
    }
    if (a.plan.action === 'apply_stream_fix') {
      if (!M || !has(M.apply)) return { ok: false, error: 'Stream actions are not loaded.' };
      if (liveNow(a.show) && !(opts && opts.liveConfirmed)) return { ok: false, needsLiveConfirm: true, error: 'This touches a live show — confirm explicitly.' };
      var args = Object.assign({}, d.args, { key: a.show });
      var r = M.apply({ kind: d.kind, args: args });
      if (!r || !r.ok) return { ok: false, error: (r && r.text) || 'Stream action refused.' };
      return { ok: true, text: r.text };
    }
    if (a.plan.action === 'retry_feed') {
      // Player-QA tile only: re-checks and remounts that one test feed. No live
      // confirm is needed — test tiles never touch a live show — but like every
      // action here it still runs only after a human approves it.
      var TF = root.MuseTestFeeds;
      if (!TF || typeof TF.retry !== 'function' || typeof TF.status !== 'function')
        return { ok: false, error: 'Test feeds are not loaded.' };
      if (!d.feed || !TF.status(d.feed).feeds.length) return { ok: false, error: 'That test feed is gone.' };
      TF.retry(d.feed);
      return { ok: true, text: 'Re-checking test feed "' + (d.label || d.feed) + '" on its own tile — other tiles are untouched.' };
    }
    if (a.plan.action === 'review_incident' || a.plan.action === 'pack_check') {
      return { ok: true, advisory: true, text: 'Acknowledged: ' + (d.id || d.count + ' lines') + '.' };
    }
    return { ok: false, error: 'Unknown action ' + a.plan.action + '.' };
  }

  function approve(id, opts) {
    var st = store(), a = st.pending[id];
    if (!a || a.status !== 'pending') return { ok: false, error: 'No pending approval ' + id + '.' };
    if (a.exp && Date.now() > a.exp) {
      a.status = 'expired'; a.decided = stamp();
      st.log.unshift({ id: id, action: a.plan.action, status: 'expired', ts: a.decided });
      st.log = st.log.slice(0, 100);
      saveStore(st);
      return { ok: false, id: id, expired: true, error: 'Plan expired (10 min) — the world moved; re-propose.' };
    }
    var r = execute(a, opts || {});
    if (!r.ok && !r.stale && !r.needsLiveConfirm) { /* hard failure still closes the loop below */ }
    if (r.ok) {
      a.status = 'approved'; a.by = (opts && opts.by) || ''; a.decided = stamp(); a.result = r.text;
      st.log.unshift({ id: id, action: a.plan.action, status: 'executed', by: a.by, ts: a.decided, result: r.text });
    } else if (r.stale) {
      a.status = 'stale'; a.error = r.error; a.decided = stamp();
      st.log.unshift({ id: id, action: a.plan.action, status: 'refused-stale', ts: a.decided, result: r.error });
    } else if (r.needsLiveConfirm) {
      saveStore(st);
      return { ok: false, needsLiveConfirm: true, error: r.error }; // stays pending
    } else {
      a.status = 'failed'; a.error = r.error; a.decided = stamp();
      st.log.unshift({ id: id, action: a.plan.action, status: 'failed', ts: a.decided, result: r.error });
    }
    st.log = st.log.slice(0, 100);
    saveStore(st);
    if (r.ok) {
      try { pushTally(a.show); } catch (e) {}
      var t = (opts && opts.targets) || {};
      try { var n = notify(a, r.text, t); if (n && typeof n.catch === 'function') n.catch(function () {}); } catch (e) {}
    }
    return r.ok ? { ok: true, id: id, result: r.text } : { ok: false, id: id, error: r.error, stale: !!r.stale };
  }

  /* ----- Omni notifications: real sends, filed in the existing comms thread ----- */
  function http() { return root.fetch || (typeof fetch !== 'undefined' ? fetch : null); }
  function nextMsgId() {
    var n = 0;
    try {
      (root.comms || []).forEach(function (m) { var x = parseInt(String(m.id || '').replace('MSG-', ''), 10); if (x > n) n = x; });
    } catch (e) {}
    return 'MSG-' + (n + 1);
  }
  function logOmni(rec) {
    if (!root.comms || !root.comms.unshift) return { logged: false };
    root.comms.unshift(rec);
    try { if (typeof root.saveComms === 'function') root.saveComms(); } catch (e) {}
    try { if (typeof root.renderComms === 'function') root.renderComms(); } catch (e) {}
    return { logged: true, id: rec.id };
  }
  function fixLine(a, result) {
    return 'Show Caller: ' + result + ' (' + a.show + ', approved by ' + (a.by || 'the team') + ').';
  }
  async function post(url, payload) {
    var F = http();
    if (!F) return { ok: false, error: 'network unavailable' };
    try {
      var r = await F(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      var j = await r.json();
      return j && j.ok ? { ok: true, data: j } : { ok: false, error: (j && j.error) || ('HTTP ' + (r.status || '?')) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }
  async function notify(a, result, t) {
    t = t || {};
    var out = {};
    var show = a.show || '', thread = 'showcaller-' + show;
    if (t.slack) {
      var body = fixLine(a, result);
      var r = await post('/api/omni/slack', { channel: t.slack, text: body, show: show });
      out.slack = r.ok ? { sent: true, ts: r.data.ts, path: r.data.path } : { sent: false, error: r.error };
      logOmni({ id: nextMsgId(), channel: 'slack', dir: 'out', from: 'Show Caller', to: String(t.slack),
        subject: '', body: body, ts: stamp(), linkType: 'production', linkId: show, prod: show, read: true,
        thread: thread, ext_id: r.ok ? r.data.ts : '', ext_thread: '', status: r.ok ? 'sent' : 'failed',
        error: r.ok ? '' : r.error, payload: { channel: 'slack', to: String(t.slack), body: body } });
    }
    if (t.mail && t.mail.length) {
      var to = [].concat(t.mail), subject = 'Show Caller fix — ' + show, mbody = fixLine(a, result);
      var m = await post('/api/omni/mail', { to: to, subject: subject, body: mbody, show: show });
      out.mail = m.ok ? { sent: true, id: m.data.id } : { sent: false, error: m.error };
      logOmni({ id: nextMsgId(), channel: 'gmail', dir: 'out', from: 'Show Caller', to: to.join(', '),
        subject: subject, body: mbody, ts: stamp(), linkType: 'production', linkId: show, prod: show, read: true,
        thread: thread, ext_id: m.ok ? m.data.id : '', ext_thread: m.ok ? m.data.threadId : '', status: m.ok ? 'sent' : 'failed',
        error: m.ok ? '' : m.error, payload: { channel: 'gmail', to: to, subject: subject, body: mbody } });
    }
    return out;
  }
  async function retry(msgId) {
    var rec = null;
    try { (root.comms || []).forEach(function (m) { if (m.id === msgId) rec = m; }); } catch (e) {}
    if (!rec || !rec.payload) return { ok: false, error: 'No stored payload for ' + msgId + '.' };
    var p = rec.payload, r;
    if (p.channel === 'slack') r = await post('/api/omni/slack', { channel: p.to, text: p.body });
    else r = await post('/api/omni/mail', { to: [].concat(p.to), subject: p.subject, body: p.body });
    if (r.ok) {
      rec.status = 'sent'; rec.error = '';
      rec.ext_id = p.channel === 'slack' ? r.data.ts : r.data.id;
      if (p.channel === 'gmail') rec.ext_thread = r.data.threadId || '';
      try { if (typeof root.saveComms === 'function') root.saveComms(); } catch (e) {}
      return { ok: true, id: msgId };
    }
    rec.status = 'failed'; rec.error = r.error;
    try { if (typeof root.saveComms === 'function') root.saveComms(); } catch (e) {}
    return { ok: false, error: r.error };
  }

  /* ----- glasses tally: republish live status the moment a fix lands ----- */
  function pushTally(key) {
    try {
      var M = root.MuseStreaming, SY = root.MuseSync;
      if (!M || typeof M.liveStatus !== 'function' || !SY || typeof SY.put !== 'function') return { ok: false };
      SY.put('live-status', M.liveStatus());
      return { ok: true };
    } catch (e) { return { ok: false }; }
  }

  /* ----- approval card ----- */
  function planWords(plan) {
    var d = plan.detail || {};
    if (plan.action === 'reassign_booking') return 'Move "' + d.booking + '" from ' + d.from + ' to ' + d.to + '.';
    if (plan.action === 'push_booking') return 'Push "' + d.booking + '" to start ' + d.new_start + '.';
    if (plan.action === 'apply_stream_fix') return 'Stream fix: ' + (d.label || d.kind) + '.';
    if (plan.action === 'review_incident') return 'Review incident ' + d.id + (d.similar && d.similar.length ? ' (similar: ' + d.similar.join(', ') + ')' : '') + '.';
    if (plan.action === 'pack_check') return 'Pack check: ' + d.count + ' lines still open.';
    if (plan.action === 'retry_feed') return 'Re-check test feed "' + (d.label || d.feed) + '" (' + (d.fix || 'remount its tile') + ').';
    return plan.action;
  }
  function cardHTML(a) {
    var live = a.plan.action === 'apply_stream_fix' && liveNow(a.show);
    return '<div class="sc-card" role="dialog" aria-label="Approve Show Caller fix">' +
      '<h3>Show Caller proposes a fix — ' + escH(a.show) + '</h3>' +
      '<p class="sc-plan">' + escH(planWords(a.plan)) + '</p>' +
      '<p class="sc-src">Sources: ' + escH((a.plan.sources || []).join(' · ')) + '</p>' +
      (live ? '<label class="sc-live"><input type="checkbox" id="scLive-' + escH(a.id) + '"> This touches a live show — I confirm explicitly.</label>' : '') +
      '<label class="sc-reason">Reason (for rejections)<input id="scReason-' + escH(a.id) + '" maxlength="500" placeholder="Why reject this fix?"></label>' +
      '<div class="sc-btns"><button onclick="MuseShowCaller.approveUI(\'' + escH(a.id) + '\')">Approve &amp; run</button>' +
      '<button onclick="MuseShowCaller.rejectUI(\'' + escH(a.id) + '\')">Reject</button></div>' +
      '<p class="sc-note" id="scNote-' + escH(a.id) + '" aria-live="polite"></p></div>';
  }
  function openCard(id) {
    if (!root.document || !root.document.body) return false;
    var st = store(), a = st.pending[id];
    if (!a) return false;
    var ov = root.document.createElement('div');
    ov.id = 'scApproval'; ov.className = 'sc-overlay';
    ov.innerHTML = cardHTML(a);
    root.document.body.appendChild(ov);
    try { var b = ov.querySelector('button'); if (b) b.focus(); } catch (e) {}
    return true;
  }
  function note(id, msg) { try { var el = root.document.getElementById('scNote-' + id); if (el) el.textContent = msg; } catch (e) {} }
  function approveUI(id) {
    var live = false;
    try { var c = root.document.getElementById('scLive-' + id); live = !!(c && c.checked); } catch (e) {}
    var r = SC.approve(id, { liveConfirmed: live });
    if (r.ok) { note(id, 'Done: ' + r.result); setTimeout(function () { try { root.document.getElementById('scApproval').remove(); } catch (e) {} }, 1200); }
    else if (r.needsLiveConfirm) note(id, r.error);
    else note(id, 'Refused: ' + r.error);
  }
  function rejectUI(id) {
    var reason = '';
    try { reason = root.document.getElementById('scReason-' + id).value; } catch (e) {}
    var r = SC.reject(id, reason);
    note(id, r.ok ? 'Rejected and logged.' : r.error);
  }

  var SC = root.MuseShowCaller = { version: '0.3.0', snapshot: snapshot, brief: brief, propose: propose,
    requestApproval: requestApproval, pendingList: pendingList, approve: approve, reject: reject,
    notify: notify, retry: retry, pushTally: pushTally, cardHTML: cardHTML, openCard: openCard,
    approveUI: approveUI, rejectUI: rejectUI };
  SC.readOnly = true; // no write except through approve(), and every approval is logged.
})(typeof window !== 'undefined' ? window : globalThis);
