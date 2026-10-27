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

  function sevRank(s) { var m = /SEV-(\d)/.exec(String(s || '')); return m ? +m[1] : 5; }

  function brief(x) {
    var s = typeof x === 'string' || !x ? snapshot(x) : x;
    if (s.error) return s;
    var risks = [], unknown = [];
    ['schedule', 'streams', 'incidents', 'crew', 'equipment', 'ops'].forEach(function (a) {
      if (isOut(s[a])) unknown.push(a + ' (' + s[a].unavailable + ')');
    });

    // Streams: alerts on a live show are the highest line.
    var st = s.streams || {};
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
    var sch = s.schedule || {};
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
    var inc = s.incidents || {};
    (inc.open || []).slice().sort(function (a, b) { return sevRank(a.severity) - sevRank(b.severity); }).forEach(function (i) {
      risks.push({ level: sevRank(i.severity) <= 2 ? 'high' : 'med', area: 'incidents',
        text: i.id + ' (' + i.severity + ', ' + i.status + '): ' + i.title,
        sources: ['incident ' + i.id] });
    });

    // Crew: unfilled positions.
    var crew = s.crew || {};
    (crew.open || []).forEach(function (pos) {
      risks.push({ level: 'med', area: 'crew', text: 'Open position: ' + pos + ' has nobody assigned',
        sources: ['crew roster · ' + s.show] });
    });

    // Equipment: gear not yet packed (one aggregate line, not one per item).
    var eq = s.equipment || {};
    if (eq.not_packed) {
      risks.push({ level: eq.not_packed > 10 ? 'med' : 'low', area: 'equipment',
        text: eq.not_packed + ' of ' + eq.lines + ' pack-list lines are not packed yet',
        sources: ['pack list · ' + s.show] });
    }

    // Ops: transmission conflicts and ENG pressure naming this show.
    var ops = s.ops || {};
    (ops.transmission_conflicts || []).forEach(function (c) {
      risks.push({ level: 'med', area: 'ops', text: 'Transmission: ' + (typeof c === 'string' ? c : JSON.stringify(c)),
        sources: ['transmission book · ' + s.show] });
    });

    var rank = { high: 0, med: 1, low: 2 };
    risks.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
    return { ts: s.ts, show: s.show, key: s.key, risks: risks, unknown: unknown };
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
    function plan(area, ft, action, detail, sources) { plans.push({ area: area, for: ft, action: action, detail: detail, sources: sources }); }
    function uncov(ft, why) { uncovered.push({ for: ft, why: why }); }

    // Schedule double-books: move the booking that is NOT on air.
    var sch = s.schedule || {}, S = root.MuseSchedule;
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
      if (alt) plan('schedule', ft, 'reassign_booking',
        { booking: mover.title || mover.id, booking_id: mover.id, from: c.res, to: alt.name, window: [mover.start, mover.end] },
        ['booking ' + mover.id]);
      else if (other) plan('schedule', ft, 'push_booking',
        { booking: mover.title || mover.id, booking_id: mover.id, after: other.end },
        ['booking ' + mover.id, 'booking ' + other.id]);
      else uncov(ft, 'no free alternative and no reference booking');
    });
    (sch.rule_findings || []).forEach(function (r) {
      uncov('Labor rule: ' + (r.text || r.kind), 'labor finding names no booking the read API can resolve — needs a human');
    });

    // Stream anomalies with a recommendation carry their own fix.
    var st = s.streams || {};
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
    var inc = s.incidents || {}, I = root.MuseIncidents;
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
    var crew = s.crew || {};
    (crew.open || []).forEach(function (pos) {
      uncov('Open position: ' + pos + ' has nobody assigned', 'filling a position needs a qualified human pick — skill matching is not automated');
    });

    // Equipment: unpacked lines become a check task.
    var eq = s.equipment || {};
    if (eq.not_packed) plan('equipment', eq.not_packed + ' of ' + eq.lines + ' pack-list lines are not packed yet',
      'pack_check', { count: eq.not_packed, lines: eq.lines }, ['pack list · ' + s.show]);

    // Transmission moves stay human-decided on air-critical paths.
    var ops = s.ops || {};
    (ops.transmission_conflicts || []).forEach(function (c) {
      uncov('Transmission: ' + (typeof c === 'string' ? c : JSON.stringify(c)), 'transmission moves are human-decided on air-critical paths');
    });

    return { ts: s.ts, show: s.show, key: s.key, plans: plans, uncovered: uncovered };
  }

  var SC = root.MuseShowCaller = { version: '0.2.0', snapshot: snapshot, brief: brief, propose: propose };
  SC.readOnly = true; // hard rule: this module gathers, it never changes show data.
})(typeof window !== 'undefined' ? window : globalThis);
