/* Launch discipline, stolen from the launch pad.
   A live show is a launch: the go/no-go board is a VOTE, not a status —
   each discipline votes GO / NO-GO / GO-WITH-CONSTRAINT against written
   commit criteria, and one NO-GO holds the show. The clock is a T-minus with
   holds that stop it cleanly and resume without losing state. Flight rules
   are decisions made calmly beforehand ("if encoder loss, then failover"),
   and Show Caller cites the rule it follows. The critical path is the task
   chain whose slip slips the show. Andon is one tap that reaches the board
   instantly, no matter who pulls it. The punch list has no orphans: every
   open item has one owner and one due date, or it is flagged.
   Per-show state lives in localStorage; nothing here executes anything. */
(function (root) {
  'use strict';

  var LS_KEY = 'muselive_launch_v1';
  var VOTES = ['GO', 'NO-GO', 'GO-WITH-CONSTRAINT'];
  var DISCIPLINES = ['video', 'audio', 'rf', 'network', 'power', 'talent', 'safety'];

  var COMMIT_DEFAULTS = {
    video: 'All program/ISO chains tested end to end; backup path verified.',
    audio: 'Mix, IFB, and mix-minus checked on every position; backup console ready.',
    rf: 'Frequency coordination complete; no intermod products on show frequencies.',
    network: 'Bonded paths tested under load; failover demonstrated, not assumed.',
    power: 'Tie-in metered; UPS on load; single-feed risks flagged with a backup plan.',
    talent: 'Call times confirmed; green room, IFB, and walk paths checked.',
    safety: 'No weather, crowd, or rigging holds; egress clear; permits signed.'
  };

  // Flight rules: pre-written calm decisions. Show Caller cites the id.
  var FLIGHT_RULES = [
    { id: 'FR-1', when: 'Primary encoder lost on a live show', then: 'Fail over to the backup path', action: 'failover_backup' },
    { id: 'FR-2', when: 'Two bookings need one circuit', then: 'Move the one that is NOT on air', action: 'reassign_booking' },
    { id: 'FR-3', when: 'SRT stream degrades (loss/latency)', then: 'Raise latency, then shift CDN', action: 'raise_srt_latency' },
    { id: 'FR-3b', when: 'SRT stream degrades and latency is already high', then: 'Shift CDN', action: 'cdn_shift' },
    { id: 'FR-4', when: 'Transmission conflict needs a path decision', then: 'A human decides — never auto-move a live feed', action: 'escalate_transmission' },
    { id: 'FR-5', when: 'Open incident at SEV-2 or worse', then: 'Review with similar precedent; never auto-resolve', action: 'review_incident' },
    { id: 'FR-6', when: 'Gear unpacked against a pack list', then: 'Verify, do not assume', action: 'check_gear' },
    { id: 'FR-7', when: 'A fix needs a vendor on site or on call', then: 'Call the vendor; file it in the Omni thread', action: 'contact_vendor' },
    { id: 'FR-8', when: 'Stream Check flags a visual fault', then: 'Human eyes on the monitor before any action', action: 'streamcheck_review' }
  ];
  function ruleFor(action) {
    if (action === 'action_stream_fix') return 'FR-8';
    for (var i = 0; i < FLIGHT_RULES.length; i++) if (FLIGHT_RULES[i].action === action) return FLIGHT_RULES[i].id;
    return null;
  }

  function store() {
    try { var s = JSON.parse(root.localStorage.getItem(LS_KEY) || 'null'); if (s && s.shows) return s; } catch (e) {}
    return { shows: {} };
  }
  function save(s) { try { root.localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} }
  function show(key) {
    var s = store();
    if (!s.shows[key]) s.shows[key] = { votes: {}, criteria: Object.assign({}, COMMIT_DEFAULTS), t0: 0, holds: [] };
    return { s: s, rec: s.shows[key] };
  }
  function actor() {
    try {
      if (typeof root.permUser === 'function' && root.permUser()) return String(root.permUser());
      if (root.CURRENT_USER && root.CURRENT_USER.name) return String(root.CURRENT_USER.name);
    } catch (e) {}
    return 'crew';
  }

  /* ---------- go/no-go poll ---------- */
  function setVote(key, discipline, vote, constraint) {
    if (DISCIPLINES.indexOf(discipline) < 0) return { ok: false, error: 'Discipline is ' + DISCIPLINES.join(' | ') + '.' };
    if (VOTES.indexOf(vote) < 0) return { ok: false, error: 'Vote is ' + VOTES.join(' | ') + '.' };
    if (vote === 'GO-WITH-CONSTRAINT' && !String(constraint || '').trim()) return { ok: false, error: 'A constrained GO names its constraint.' };
    var st = show(key);
    st.rec.votes[discipline] = { vote: vote, constraint: String(constraint || '').slice(0, 200), by: actor(), ts: Date.now() };
    save(st.s);
    return { ok: true };
  }
  function setCriteria(key, discipline, text) {
    if (DISCIPLINES.indexOf(discipline) < 0) return { ok: false, error: 'Unknown discipline.' };
    if (!String(text || '').trim()) return { ok: false, error: 'Commit criteria cannot be blank.' };
    var st = show(key);
    st.rec.criteria[discipline] = String(text).slice(0, 500);
    save(st.s);
    return { ok: true };
  }
  // Any NO-GO holds. Missing votes are pending, not GO.
  function poll(key) {
    var rec = show(key).rec;
    var votes = DISCIPLINES.map(function (d) {
      var v = rec.votes[d];
      /* Every check names an owner (OPS-005): the voter, 'system' for a
         weather hold, or 'Unassigned' while the vote is still pending. */
      return { discipline: d, vote: v ? v.vote : 'PENDING', constraint: v ? v.constraint : '', by: v ? v.by : '', owner: v && v.by ? v.by : 'Unassigned', ts: v ? v.ts : 0, criteria: rec.criteria[d] || '' };
    });
    var nogos = votes.filter(function (v) { return v.vote === 'NO-GO'; });
    var pending = votes.filter(function (v) { return v.vote === 'PENDING'; });
    var held = nogos.length > 0;
    return { key: key, votes: votes,
      result: held ? 'HOLD' : (pending.length ? 'PENDING' : 'GO'),
      holdBy: nogos.map(function (v) { return v.discipline; }),
      pendingBy: pending.map(function (v) { return v.discipline; }) };
  }
  // A weather hold is a safety NO-GO by the system, not a status color.
  function weatherHold(key, on) {
    if (on) return setVoteDirect(key, 'safety', 'NO-GO', 'Weather hold active', 'system');
    return clearSystemVote(key, 'safety');
  }
  function setVoteDirect(key, discipline, vote, constraint, by) {
    var st = show(key);
    // A system hold stashes the human vote it overrides, so clearing restores it.
    if (by === 'system' && !st.rec.stash) st.rec.stash = {};
    if (by === 'system' && st.rec.votes[discipline] && st.rec.votes[discipline].by !== 'system' && !st.rec.stash[discipline])
      st.rec.stash[discipline] = st.rec.votes[discipline];
    st.rec.votes[discipline] = { vote: vote, constraint: String(constraint || '').slice(0, 200), by: by, ts: Date.now() };
    save(st.s);
    return { ok: true };
  }
  function clearSystemVote(key, discipline) {
    var st = show(key);
    var v = st.rec.votes[discipline];
    if (v && v.by === 'system') {
      if (st.rec.stash && st.rec.stash[discipline]) {
        st.rec.votes[discipline] = st.rec.stash[discipline];
        delete st.rec.stash[discipline];
      } else delete st.rec.votes[discipline];
    }
    save(st.s);
    return { ok: true };
  }

  /* ---------- T-minus with holds ---------- */
  function setT0(key, ts) {
    var st = show(key);
    st.rec.t0 = +ts || 0;
    save(st.s);
    return { ok: true };
  }
  function hold(key, reason) {
    var st = show(key);
    if (st.rec.holds.some(function (h) { return !h.released; })) return { ok: false, error: 'A hold is already active — release it before holding again.' };
    st.rec.holds.push({ id: 'H-' + Date.now().toString(36), at: Date.now(), reason: String(reason || '').slice(0, 200), released: 0, by: actor() });
    save(st.s);
    return { ok: true };
  }
  function release(key) {
    var st = show(key);
    var open = st.rec.holds.filter(function (h) { return !h.released; })[0];
    if (!open) return { ok: false, error: 'No active hold.' };
    open.released = Date.now();
    save(st.s);
    return { ok: true };
  }
  function heldMs(key, now) {
    now = now == null ? Date.now() : now;
    var rec = show(key).rec;
    return rec.holds.reduce(function (n, h) { return n + ((h.released || now) - h.at); }, 0);
  }
  // The clock stops during holds: shift T-0 by accumulated hold time.
  function countdown(key, now) {
    now = now == null ? Date.now() : now;
    var rec = show(key).rec;
    if (!rec.t0) return { state: 'NO-T0', t0: 0, remaining: 0, heldMs: 0, activeHold: null };
    var active = rec.holds.filter(function (h) { return !h.released; })[0] || null;
    var eff = rec.t0 + heldMs(key, now);
    return { state: active ? 'HOLD' : (eff - now <= 0 ? 'LIVE' : 'COUNTING'),
      t0: rec.t0, effectiveT0: eff, remaining: Math.max(0, eff - now),
      heldMs: heldMs(key, now), activeHold: active };
  }

  /* ---------- critical path over the task chain ---------- */
  // Longest dependency chain ending anywhere: slip here slips the show.
  function criticalPath(key) {
    var tasks = [];
    try {
      if (root.MuseTasks && typeof root.MuseTasks.list === 'function') tasks = root.MuseTasks.list(key) || [];
    } catch (e) { return []; }
    var byId = {}, i;
    tasks.forEach(function (t) { byId[t.id] = t; });
    var depth = {}, visiting = {};
    function len(id) {
      if (depth[id] != null) return depth[id];
      if (visiting[id]) return 0;
      visiting[id] = true;
      var t = byId[id], best = 0, j, ds = (t && t.deps) || [];
      for (j = 0; j < ds.length; j++) if (byId[ds[j]]) best = Math.max(best, len(ds[j]));
      visiting[id] = false;
      depth[id] = (t && t.status === 'done' ? 0 : 1) + best;
      return depth[id];
    }
    var order = tasks.map(function (t) { return t.id; }).sort(function (a, b) { return len(b) - len(a); });
    var longest = order.length ? len(order[0]) : 0;
    // Reconstruct one longest chain from the deepest open task.
    var chain = [], cur = order.filter(function (id) { return byId[id] && byId[id].status !== 'done'; })[0];
    var guard = tasks.length + 1;
    while (cur && byId[cur] && guard-- > 0) {
      chain.unshift(cur);
      var ds = (byId[cur].deps || []).filter(function (d) { return byId[d] && byId[d].status !== 'done'; });
      ds.sort(function (a, b) { return len(b) - len(a); });
      cur = ds[0] || null;
    }
    return { length: longest, chain: chain };
  }

  /* ---------- Andon: one tap, no hierarchy ---------- */
  function andon(key, text) {
    if (!String(text || '').trim()) return { ok: false, error: 'A flag says what is wrong.' };
    if (!root.MuseTasks || typeof root.MuseTasks.add !== 'function') return { ok: false, error: 'Task chain unavailable.' };
    var r = root.MuseTasks.add(key, { title: 'ANDON: ' + String(text).slice(0, 160), owner: '', notes: 'Raised by ' + actor() + ' — reaches the go/no-go board instantly.' });
    return r;
  }

  /* ---------- punch list: no orphans ---------- */
  function punchList(key) {
    var tasks = [];
    try {
      if (root.MuseTasks && typeof root.MuseTasks.list === 'function') tasks = root.MuseTasks.list(key) || [];
    } catch (e) {}
    var open = tasks.filter(function (t) { return t.status !== 'done'; });
    var orphans = open.filter(function (t) { return !t.owner || !t.due; });
    open.sort(function (a, b) { return String(a.due || '9999') < String(b.due || '9999') ? -1 : 1; });
    return { open: open, orphans: orphans };
  }

  root.MuseLaunch = { version: '0.1.0', DISCIPLINES: DISCIPLINES.slice(), VOTES: VOTES.slice(),
    FLIGHT_RULES: JSON.parse(JSON.stringify(FLIGHT_RULES)), COMMIT_DEFAULTS: Object.assign({}, COMMIT_DEFAULTS),
    ruleFor: ruleFor, setVote: setVote, setCriteria: setCriteria, poll: poll, weatherHold: weatherHold,
    setT0: setT0, hold: hold, release: release, heldMs: heldMs, countdown: countdown,
    criticalPath: criticalPath, andon: andon, punchList: punchList };
})(typeof window !== 'undefined' ? window : globalThis);
