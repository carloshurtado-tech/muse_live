/* Muse Live — Test feeds.
   Stand-in HLS signals for player QA (decoder budget, health checks, perf sampling).
   The feed list is config-driven: DEFAULTS below are the single source of player-side
   defaults, and operators may override them at runtime through the shared KV key
   `testfeeds` (GET /api/kv/testfeeds?optional=1, same shape). Player code in
   js/muse-streaming.js never carries these URLs; test tiles mount through its
   data-hls-slot machinery like any other tile.
   Player telemetry (hls.js level switches and errors, video stalls, dropped-frame
   and buffer samples) lands per feed through TF.event with a
   timestamp, the feed id and a payload. Sustained degradation (stall storm,
   rendition collapse, repeated fragment/decoder errors) raises a Show Caller risk
   with a proposed fix — human approval only, never automatic.
   Synthetic tiles carry a TEST FEED badge and fictional overlay metadata;
   real third-party broadcasts carry an EXTERNAL LIVE FEED badge naming the
   source. Neither is ever presented as production programming. Tiles never
   autoplay: hover previews, click expands to the theater (decoder budget). */
(function (root) {
  'use strict';

  var KV_KEY = 'testfeeds';
  var MAX_ACTIVE = 4; // decoder budget: at most this many test videos decoding at once
  var MAX_FEEDS = 12; // cap so a bad KV override cannot flood the wall
  var CHECK_MS = 8000;
  var VERIFY_MS = 12000;
  var DROP_TICK_MS = 15000;
  var EVT_CAP = 120; // telemetry entries kept per feed (~15 min at the sample rate)
  // Risk signals: stall storm, rendition collapse, repeated fragment/decoder errors.
  // A signal that stays present for SUSTAIN_MS raises a Show Caller risk; a decided
  // approval is not re-raised for RAISE_COOLDOWN_MS.
  var RISK = { STALL_N: 3, STALL_MS: 60000, STALL_GAP_MS: 2000, FRAG_N: 2, FRAG_MS: 5 * 60000,
    COLLAPSE_RATIO: 0.5, COLLAPSE_MS: 30000, SUSTAIN_MS: 60000, RAISE_COOLDOWN_MS: 10 * 60000 };
  var clock = null; // test seam: override the clock, otherwise wall time
  function nowMs() { try { return clock ? clock() : Date.now(); } catch (e) { return Date.now(); } }

  // Wall layout (NOC multiviewer): synthetic test pattern + two real external
  // live broadcasts + two VOD ABR ladders. External feeds are real third-party
  // broadcasts — badged EXTERNAL LIVE FEED, never presented as productions.
  // Al Jazeera Arabic is configured but disabled by default: it sends no CORS
  // headers, so it is native-playback-only with no hls.js telemetry; enable it
  // from KV (`testfeeds`) only as a non-English live stress case.
  var DEFAULTS = [
    { id: 'live', label: 'Test Live', url: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8', kind: 'live', enabled: true, badge: 'test' },
    { id: 'nasa', label: 'NASA TV', url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8', kind: 'live', enabled: true, badge: 'external', source: 'NASA TV' },
    { id: 'redbull', label: 'Red Bull TV', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8', kind: 'live', enabled: true, badge: 'external', source: 'Red Bull TV' },
    { id: 'abr', label: 'Test ABR', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', kind: 'abr', enabled: true, badge: 'test' },
    { id: 'vod2', label: 'Test VOD 2', url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8', kind: 'vod', enabled: true, badge: 'test' },
    { id: 'aja', label: 'Al Jazeera Arabic', url: 'https://live-hls-web-aja.getaj.net/AJA/index.m3u8', kind: 'live', enabled: false, badge: 'external', source: 'Al Jazeera Arabic', nativeOnly: true }
  ];

  var KINDS = { live: 1, abr: 1, vod: 1 };
  var KIND_LABEL = { live: 'Test · Live', abr: 'Test · ABR', vod: 'Test · VOD' };
  var KIND_META = {
    live: 'Rehearsal loop · fictional lineup',
    abr: 'ABR ladder check · fictional program',
    vod: 'VOD sample · fictional title'
  };
  function isExternal(feed) { return !!(feed && feed.badge === 'external'); }
  function badgeHTML(feed) {
    if (isExternal(feed)) return '<span class="ms-test-badge is-external">External live feed · ' + escHtml(feed.source || feed.label || 'External') + '</span>';
    return '<span class="ms-test-badge">Test feed</span>';
  }
  function kindLabel(feed) {
    if (isExternal(feed)) return feed.kind === 'live' ? 'External · Live' : 'External · ' + String(feed.kind || '').toUpperCase();
    return KIND_LABEL[feed.kind] || 'Test';
  }
  function capMeta(feed) {
    if (isExternal(feed)) return 'Third-party broadcast · not a Muse production' + (feed.nativeOnly ? ' · native-only (no CORS telemetry)' : '');
    return KIND_META[feed.kind] || 'Test signal';
  }

  function escHtml(s) {
    try { if (typeof root.esc === 'function' && root.esc !== escHtml) return root.esc(s); } catch (e) {}
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------- config: defaults + validated KV override ---------------- */
  function sanitize(list) {
    if (!list || typeof list.length !== 'number') return [];
    var out = [], seen = {};
    for (var i = 0; i < list.length && out.length < MAX_FEEDS; i++) {
      var f = list[i];
      if (!f || typeof f !== 'object') continue;
      var id = String(f.id || '');
      if (!/^[a-z0-9-]{1,32}$/.test(id) || seen[id]) continue;
      var url = String(f.url || '');
      if (!/^https:\/\/\S{1,500}$/.test(url)) continue;
      if (url.indexOf('.m3u8') < 0) continue; // HLS only
      var kind = String(f.kind || '');
      if (!KINDS[kind]) continue;
      var label = String(f.label || '').trim().slice(0, 80);
      if (!label) continue;
      seen[id] = 1;
      var rec = { id: id, label: label, url: url, kind: kind, enabled: f.enabled !== false, badge: f.badge === 'external' ? 'external' : 'test' };
      if (rec.badge === 'external') {
        rec.source = String(f.source || label).trim().slice(0, 40) || label;
        if (f.nativeOnly) rec.nativeOnly = true;
      }
      out.push(rec);
    }
    return out;
  }

  // Per-id merge: the override wins wherever it names an id, base feeds keep
  // their slots otherwise, and valid override-only ids are appended.
  function merge(base, override) {
    var ov = sanitize(override), byId = {}, out = [];
    ov.forEach(function (f) { byId[f.id] = f; });
    sanitize(base).forEach(function (f) { out.push(byId[f.id] || f); delete byId[f.id]; });
    Object.keys(byId).forEach(function (id) { out.push(byId[id]); });
    return out.slice(0, MAX_FEEDS);
  }

  function sameFeeds(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* ---------------- decoder budget (pure core, unit-tested) ---------------- */
  // Active ids beyond `max` are parked: offscreen tiles first, then the
  // least-recently-touched. `except` (the tile the user just tapped) is kept.
  function chooseVictims(active, vis, touch, max, except) {
    active = (active || []).filter(function (id) { return id !== except; });
    var over = active.length + (except ? 1 : 0) - max;
    if (over <= 0) return [];
    return active.sort(function (a, b) {
      var va = vis[a] !== false ? 1 : 0, vb = vis[b] !== false ? 1 : 0;
      if (va !== vb) return va - vb;
      return (touch[a] || 0) - (touch[b] || 0);
    }).slice(0, over);
  }

  function pickActive(feeds, vis, max) {
    var ids = (feeds || []).filter(function (f) { return f && f.enabled !== false; }).map(function (f) { return f.id; });
    var visFirst = ids.slice().sort(function (a, b) { return (vis[b] !== false ? 1 : 0) - (vis[a] !== false ? 1 : 0); });
    return { active: visFirst.slice(0, max), poster: visFirst.slice(max) };
  }

  function qualityOf(video) {
    try {
      if (!video || typeof video.getVideoPlaybackQuality !== 'function') return null;
      var q = video.getVideoPlaybackQuality();
      return { dropped: q.droppedVideoFrames || 0, total: q.totalVideoFrames || 0 };
    } catch (e) { return null; }
  }

  /* ---------------- state ---------------- */
  var S = { feeds: DEFAULTS.slice(), health: {}, touch: {}, vis: {}, mounted: {}, dropped: {},
    events: {}, qoe: {}, risk: {}, wired: false, io: null };
  function MS() { return root.MuseStreaming || null; }
  function slotOf(id) { return 'test:' + id; }
  function feedById(id) { for (var i = 0; i < S.feeds.length; i++) if (S.feeds[i].id === id) return S.feeds[i]; return null; }
  function screenEl(id) { try { return document.querySelector('[data-testfeed="' + id + '"] .ms-screen'); } catch (e) { return null; } }
  function videoOf(id) { var m = MS(); if (!m || !m.videoFor) return null; try { return m.videoFor(slotOf(id)); } catch (e) { return null; } }

  /* ---------------- tile HTML ---------------- */
  var MUTE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  function tileHTML(feed) {
    var live = feed.kind === 'live' ? ' data-live="1"' : '';
    // Poster-first: data-defer keeps every decoder idle until hover/click, so
    // five live tiles cost nothing on the dashboard until a person looks.
    return '<figure class="ms-tile ms-test" data-testfeed="' + escHtml(feed.id) + '">' +
      '<div class="ms-screen is-clickable" data-defer="1" data-hls-slot="' + escHtml(slotOf(feed.id)) + '" data-url="' + escHtml(feed.url) + '"' + live + ' onclick="MuseTestFeeds.openTheater(event,\'' + escHtml(feed.id) + '\')" onmouseenter="MuseTestFeeds.hoverPreview(\'' + escHtml(feed.id) + '\')" onmouseleave="MuseTestFeeds.hoverEnd(\'' + escHtml(feed.id) + '\')" title="Hover to preview · click to expand">' +
        '<div class="ms-slate" aria-hidden="true"><b>' + escHtml(feed.label) + '</b><span data-tf-slate>Hover to preview · click to expand</span></div>' +
        '<div class="ms-osd">' + badgeHTML(feed) + '<span class="ms-test-kind">' + escHtml(kindLabel(feed)) + '</span></div>' +
        '<button type="button" class="ms-audio" onclick="MuseStreaming.toggleAudio(event,\'' + escHtml(slotOf(feed.id)) + '\',this)" aria-pressed="false" aria-label="Mute or unmute ' + escHtml(feed.label) + '">' + MUTE_SVG + '</button>' +
      '</div>' +
      '<figcaption class="ms-cap"><div class="ms-cap-main"><b>' + escHtml(feed.label) + '</b><span>' + escHtml(capMeta(feed)) + '</span></div>' +
        '<div class="ms-cap-kpis"><span class="ms-test-health" data-tf-health="' + escHtml(feed.id) + '">Checking…</span></div>' +
        '<div class="ms-test-qoe" data-tf-qoe="' + escHtml(feed.id) + '">' + escHtml(qoeText(feed.id)) + '</div>' +
      '</figcaption></figure>';
  }

  function sectionHTML() {
    var tiles = S.feeds.filter(function (f) { return f.enabled !== false; }).map(tileHTML).join('');
    return '<section class="ms-card ms-test-wrap" id="msTestFeeds"><div class="ms-card-h"><h3>Test feeds</h3>' +
      '<span class="ms-sub">Stand-in signals for player QA — not production programming</span></div>' +
      '<p class="ms-note ms-demo-note"><span class="ms-test-badge">Test feed</span> Synthetic sample streams for player QA (fictional metadata). <span class="ms-test-badge is-external">External live feed</span> Real third-party broadcasts — not Muse productions. Tiles stay paused until hover or click, to protect the dashboard.</p>' +
      '<div class="ms-test-risks" data-tf-risks></div>' +
      '<div class="ms-grid" data-tf-grid>' + (tiles || '<p class="ms-empty">No test feeds enabled.</p>') + '</div></section>';
  }

  function setHealth(id, st, txt) {
    S.health[id] = st;
    try {
      var els = document.querySelectorAll('[data-tf-health="' + id + '"]');
      Array.prototype.forEach.call(els, function (el) {
        el.textContent = txt;
        el.classList.toggle('is-up', st === 'up');
        el.classList.toggle('is-down', st === 'down');
      });
    } catch (e) {}
  }

  function setSlate(id, txt) {
    try {
      var scr = screenEl(id); if (!scr) return;
      var sp = scr.querySelector('[data-tf-slate]'); if (sp) sp.textContent = txt;
    } catch (e) {}
  }

  function showDown(id) {
    setHealth(id, 'down', 'Feed down');
    setSlate(id, 'Feed down');
    try {
      var scr = screenEl(id); if (!scr || scr.querySelector('.ms-retry')) return;
      scr.classList.add('is-down');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ms-retry'; b.textContent = 'Retry';
      b.setAttribute('aria-label', 'Retry ' + (feedById(id) || {}).label);
      b.setAttribute('onclick', 'MuseTestFeeds.retry(\'' + id + '\')');
      scr.appendChild(b);
    } catch (e) {}
  }

  function clearDown(id) {
    try {
      var scr = screenEl(id); if (!scr) return;
      scr.classList.remove('is-down');
      var r = scr.querySelector('.ms-retry'); if (r) r.remove();
    } catch (e) {}
  }

  function showPoster(id, txt) {
    try {
      var scr = screenEl(id); if (!scr || scr.querySelector('.ms-play')) return;
      scr.setAttribute('data-defer', '1');
      scr.classList.add('is-poster');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ms-play'; b.textContent = '▶';
      b.setAttribute('aria-label', 'Preview ' + (feedById(id) || {}).label);
      b.setAttribute('onclick', 'MuseTestFeeds.preview(event,this,\'' + id + '\')');
      scr.appendChild(b);
      setSlate(id, txt || 'Poster · tap ▶ to preview');
    } catch (e) {}
  }

  /* ---------------- telemetry: event log + per-tile QoE ----------------
     The player (js/muse-streaming.js) forwards hls.js LEVEL_SWITCHED, ERROR
     (fatal and non-fatal) and video stall/error events
     here. Every entry carries a timestamp, the feed id and a payload; each feed
     keeps its own ring and QoE record, so a degraded tile never affects others. */
  function qoeFor(id) {
    return S.qoe[id] || (S.qoe[id] = { bitrate_kbps: null, rendition: null, renditions: null, resolution: null,
      buffer_s: null, stalls: 0, errors: 0, frag_errors: 0, dropped: 0, dropped_total: 0, switches: 0,
      max_bitrate: 0, state: 'loading', player: 'hls', last_switch: null });
  }

  function logEvent(id, type, payload) {
    try {
      id = String(id || '');
      if (!feedById(id)) return null;
      var q = qoeFor(id);
      var entry = { ts: new Date(nowMs()).toISOString(), feed: id, type: String(type), payload: payload || {} };
      var log = S.events[id] || (S.events[id] = []);
      log.push(entry);
      if (log.length > EVT_CAP) log.splice(0, log.length - EVT_CAP);
      applyEvent(q, entry);
      paintQoe(id);
      evaluate(id);
      return entry;
    } catch (e) { return null; } // one tile's telemetry never breaks another tile
  }

  function applyEvent(q, entry) {
    var p = entry.payload || {};
    switch (entry.type) {
      case 'level':
        if (p.bitrate != null) {
          q.bitrate_kbps = Math.round(p.bitrate / 1000);
          if (q.bitrate_kbps > q.max_bitrate) q.max_bitrate = q.bitrate_kbps;
        }
        if (p.level != null) q.rendition = p.level;
        if (p.renditions != null) q.renditions = p.renditions;
        if (p.width && p.height) q.resolution = p.width + '×' + p.height;
        q.switches++;
        q.last_switch = entry.ts;
        q.state = 'playing';
        break;
      case 'manifest':
        if (p.renditions != null) q.renditions = p.renditions;
        break;
      case 'hls-error':
        q.errors++;
        if (/frag|pars|decod/i.test(String(p.details || ''))) q.frag_errors++;
        if (p.details === 'bufferStalledError') q.stalls++;
        break;
      case 'video-error':
        q.errors++;
        break;
      case 'stall':
        q.stalls++;
        break;
      case 'playing':
        q.state = 'playing';
        break;
      case 'dropped':
        if (p.dropped != null) q.dropped = p.dropped;
        if (p.total != null) q.dropped_total = p.total;
        break;
      case 'buffer':
        if (p.buffer_s != null) q.buffer_s = p.buffer_s;
        break;
      case 'player-unavailable':
        q.errors++;
        q.state = 'unavailable';
        break;
    }
  }

  function bufferAhead(v) {
    try {
      var b = v.buffered, t = v.currentTime, ahead = null;
      for (var i = 0; i < b.length; i++) {
        if (t >= b.start(i) && t <= b.end(i)) ahead = b.end(i) - t;
      }
      return ahead == null ? null : Math.round(ahead * 10) / 10;
    } catch (e) { return null; }
  }

  function qoeText(id) {
    var q = S.qoe[id];
    if (!q) return 'QoE: connecting…';
    var parts = [q.bitrate_kbps ? (Math.round(q.bitrate_kbps / 100) / 10) + ' Mbps' : '… Mbps'];
    if (q.resolution) parts.push(q.resolution);
    parts.push('buf ' + (q.buffer_s != null ? q.buffer_s.toFixed(1) + 's' : '—'));
    parts.push('stalls ' + q.stalls + ' · err ' + q.errors);
    if (q.dropped) parts.push('dropped ' + q.dropped);
    return parts.join(' · ');
  }

  function paintQoe(id) {
    try {
      var els = document.querySelectorAll('[data-tf-qoe="' + id + '"]');
      Array.prototype.forEach.call(els, function (el) { el.textContent = qoeText(id); });
    } catch (e) {}
  }

  /* ---------------- risk signals → Show Caller risks (human approval only) ----------------
     Stall storm, rendition collapse and repeated fragment/decoder errors are
     evaluated per feed over the telemetry log. Sustained degradation parks a
     risk in the standard Show Caller format (brief-shaped risk lines plus a
     proposed fix with sources) via requestApproval — a person approves or
     rejects it on the wall. This module never approves anything itself and
     never executes a fix automatically. */
  function entryTs(e) { var t = Date.parse(e.ts); return isNaN(t) ? -1 : t; }

  function since(log, type, ms, now, pred) {
    var out = [];
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      if (e.type !== type) continue;
      var t = entryTs(e);
      if (t >= 0 && now - t <= ms && (!pred || pred(e))) out.push(e);
    }
    return out;
  }

  // Stall episodes: stall-ish events more than STALL_GAP_MS apart count separately,
  // so one underlying stall (video waiting + hls.js bufferStalledError together)
  // never reads as a storm on its own.
  function stallEpisodes(log, now) {
    var times = [];
    since(log, 'stall', RISK.STALL_MS, now).forEach(function (e) { times.push(entryTs(e)); });
    since(log, 'hls-error', RISK.STALL_MS, now, function (e) { return e.payload && e.payload.details === 'bufferStalledError'; })
      .forEach(function (e) { times.push(entryTs(e)); });
    times.sort(function (a, b) { return a - b; });
    var n = 0, last = -1e15;
    times.forEach(function (t) { if (t - last > RISK.STALL_GAP_MS) { n++; last = t; } });
    return n;
  }

  function fragCount(log, now) {
    return since(log, 'hls-error', RISK.FRAG_MS, now, function (e) {
      return /frag|pars|decod/i.test(String((e.payload || {}).details || ''));
    }).length;
  }

  // The player caps renditions to the tile size, so sitting on a low rung is
  // normal; collapse means falling to half (or less) of this session's peak and
  // staying there — the last rendition change is 30 s or more behind us.
  function renditionCollapsed(q, now) {
    if (!q || !q.last_switch || !(q.max_bitrate > 0) || q.bitrate_kbps == null) return false;
    if (q.bitrate_kbps > q.max_bitrate * RISK.COLLAPSE_RATIO) return false;
    var t = Date.parse(q.last_switch);
    return !isNaN(t) && now - t >= RISK.COLLAPSE_MS;
  }

  function signals(id, now) {
    now = now == null ? nowMs() : now;
    var feed = feedById(id), q = S.qoe[id], out = [];
    if (!feed || !q) return out;
    var log = S.events[id] || [];
    var n = stallEpisodes(log, now);
    if (n >= RISK.STALL_N) out.push({ kind: 'stall-storm', level: 'high', count: n,
      text: feed.label + ': stall storm — ' + n + ' playback stalls in the last minute' });
    if (renditionCollapsed(q, now)) out.push({ kind: 'rendition-collapse', level: 'med',
      text: feed.label + ': rendition collapse — stuck at ' + (Math.round(q.bitrate_kbps / 100) / 10) +
        ' Mbps, ' + Math.round(100 * q.bitrate_kbps / q.max_bitrate) + '% of this session\'s peak' });
    var f = fragCount(log, now);
    if (f >= RISK.FRAG_N) out.push({ kind: 'frag-errors', level: 'high', count: f,
      text: feed.label + ': ' + f + ' fragment/decoder errors in the last 5 minutes' });
    return out;
  }

  var FIX_FOR = {
    'stall-storm': 'Re-check the feed and remount its tile (clears a wedged player or stale playlist)',
    'rendition-collapse': 'Re-check the feed and remount its tile (re-reads the ABR ladder from the manifest)',
    'frag-errors': 'Re-check the feed and remount its tile (restarts segment loading on a clean session)'
  };

  function riskState(id) { return S.risk[id] || (S.risk[id] = { first: {}, raised: {}, raisedAt: {} }); }

  function approvalPending(approvalId) {
    try {
      var SC = root.MuseShowCaller;
      if (!SC || typeof SC.pendingList !== 'function') return false;
      return SC.pendingList().some(function (a) { return a.id === approvalId; });
    } catch (e) { return false; }
  }

  function evaluate(id, now) {
    try {
      now = now == null ? nowMs() : now;
      if (!feedById(id)) return;
      var rs = riskState(id), sigs = signals(id, now), seen = {};
      sigs.forEach(function (s) {
        seen[s.kind] = 1;
        if (!rs.first[s.kind]) rs.first[s.kind] = now;
        var sustained = now - rs.first[s.kind] >= RISK.SUSTAIN_MS;
        var pending = rs.raised[s.kind] && approvalPending(rs.raised[s.kind]);
        var cooled = !rs.raisedAt[s.kind] || now - rs.raisedAt[s.kind] >= RISK.RAISE_COOLDOWN_MS;
        if (sustained && !pending && cooled) raise(id, s, now);
      });
      Object.keys(rs.first).forEach(function (k) { if (!seen[k]) delete rs.first[k]; });
      renderRisks(); // repaints only when the risk list actually changed
    } catch (e) {}
  }

  function raise(id, s, now) {
    try {
      var SC = root.MuseShowCaller, feed = feedById(id), q = qoeFor(id);
      if (!SC || typeof SC.requestApproval !== 'function' || !feed) return null;
      var rs = riskState(id);
      var plan = { area: 'streams', for: s.text, action: 'retry_feed',
        detail: { feed: id, label: feed.label, kind: s.kind, fix: FIX_FOR[s.kind] || FIX_FOR['stall-storm'],
          observed: { stalls: q.stalls, errors: q.errors, frag_errors: q.frag_errors,
            bitrate_kbps: q.bitrate_kbps, max_bitrate: q.max_bitrate, buffer_s: q.buffer_s, dropped: q.dropped },
          expected: { health: S.health[id] || 'unknown' } },
        sources: ['test feed · ' + id, 'player telemetry · ' + s.kind] };
      var a = SC.requestApproval(plan, 'testfeed:' + id,
        { note: 'Sustained degradation on a player-QA tile. Human approval only — nothing runs automatically.' });
      if (a && a.id) { rs.raised[s.kind] = a.id; rs.raisedAt[s.kind] = now == null ? nowMs() : now; renderRisks(); }
      return a;
    } catch (e) { return null; }
  }

  // Show Caller brief shape ({ts, show, key, risks, unknown, grounding} with
  // {level, area, text, sources} lines) for the test feeds.
  function riskBrief(now) {
    now = now == null ? nowMs() : now;
    var risks = [], unknown = [];
    S.feeds.filter(function (f) { return f.enabled !== false; }).forEach(function (f) {
      try {
        signals(f.id, now).forEach(function (s) {
          risks.push({ level: s.level, area: 'streams', text: s.text,
            sources: ['test feed · ' + f.id, 'player telemetry · ' + s.kind] });
        });
      } catch (e) { unknown.push('test feed · ' + f.id); }
    });
    var rank = { high: 0, med: 1, low: 2 };
    risks.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
    var srcSet = {};
    risks.forEach(function (r) { (r.sources || []).forEach(function (x) { srcSet[x] = 1; }); });
    return { ts: new Date(now).toISOString(), show: 'Test feeds', key: 'testfeeds', risks: risks, unknown: unknown,
      grounding: { lines: risks.length, records: Object.keys(srcSet).length,
        note: 'Every line cites its record; ' + (unknown.length ? unknown.length + ' feed(s) unreadable and stated as unknown.' : 'all test feeds readable.') } };
  }

  function pendingRisks() {
    try {
      var SC = root.MuseShowCaller;
      if (!SC || typeof SC.pendingList !== 'function') return [];
      return SC.pendingList().filter(function (a) { return String(a.show || '').indexOf('testfeed:') === 0; });
    } catch (e) { return []; }
  }

  function renderRisks() {
    try {
      var host = document.querySelector('[data-tf-risks]');
      if (!host) return;
      var brief = riskBrief(), pend = pendingRisks();
      var html = '';
      brief.risks.forEach(function (r) {
        html += '<div class="ms-test-risk is-' + escHtml(r.level) + '"><span class="ms-test-risk-lvl">' + escHtml(r.level.toUpperCase()) + '</span>' +
          '<span class="ms-test-risk-txt">' + escHtml(r.text) + '</span>' +
          '<span class="ms-test-risk-src">Sources: ' + escHtml(r.sources.join(' · ')) + '</span></div>';
      });
      pend.forEach(function (a) {
        var d = (a.plan && a.plan.detail) || {};
        html += '<div class="ms-test-risk is-pending"><span class="ms-test-risk-lvl">FIX</span>' +
          '<span class="ms-test-risk-txt">Proposed fix for ' + escHtml(d.label || d.feed || '') + ': ' + escHtml(d.fix || a.plan.action) + ' — needs a human decision.</span>' +
          '<span class="ms-test-risk-src">Sources: ' + escHtml(((a.plan && a.plan.sources) || []).join(' · ')) + '</span>' +
          '<span class="ms-test-risk-btns"><button type="button" class="ms-btn ms-btn-primary" onclick="MuseTestFeeds.approveRisk(\'' + escHtml(a.id) + '\')">Approve &amp; run</button>' +
          '<button type="button" class="ms-btn" onclick="MuseTestFeeds.rejectRisk(\'' + escHtml(a.id) + '\')">Reject</button></span></div>';
      });
      if (host.innerHTML !== html) host.innerHTML = html;
    } catch (e) {}
  }

  function approveRisk(approvalId) {
    try {
      var SC = root.MuseShowCaller;
      if (!SC || typeof SC.approve !== 'function') return;
      var r = SC.approve(String(approvalId), {});
      if (root.toast) root.toast(r && r.ok ? r.result : (r && r.error) || 'Not approved.');
      renderRisks();
    } catch (e) {}
  }

  function rejectRisk(approvalId) {
    try {
      var SC = root.MuseShowCaller;
      if (!SC || typeof SC.reject !== 'function') return;
      SC.reject(String(approvalId), 'rejected from the test wall');
      renderRisks();
    } catch (e) {}
  }

  /* ---------------- agent + status reads ---------------- */
  function status(feedId) {
    var feeds = S.feeds.filter(function (f) { return f.enabled !== false; });
    if (feedId) feeds = feeds.filter(function (f) { return f.id === String(feedId); });
    return { ts: new Date(nowMs()).toISOString(), feeds: feeds.map(function (f) {
      var q = S.qoe[f.id] || null, log = S.events[f.id] || [];
      return { id: f.id, label: f.label, kind: f.kind, health: S.health[f.id] || 'unknown',
        qoe: q ? { bitrate_kbps: q.bitrate_kbps, rendition: q.rendition, renditions: q.renditions,
          resolution: q.resolution, buffer_s: q.buffer_s, stalls: q.stalls, errors: q.errors,
          frag_errors: q.frag_errors, dropped: q.dropped, dropped_total: q.dropped_total,
          switches: q.switches, max_bitrate: q.max_bitrate, state: q.state, player: q.player } : null,
        signals: signals(f.id), recent: log.slice(-5) };
    }), pending: pendingRisks().map(function (a) {
      var pl = (a && a.plan) || {};
      return { id: a.id, show: a.show, for: pl.for || null, action: pl.action || null,
        fix: (pl.detail || {}).fix || null, sources: pl.sources || [] };
    }) };
  }

  // Compact brief shipped with every agent question: one line per feed.
  function agentBrief() {
    return { ts: new Date(nowMs()).toISOString(), feeds: S.feeds.filter(function (f) { return f.enabled !== false; }).map(function (f) {
      var q = S.qoe[f.id] || {};
      return { id: f.id, label: f.label, health: S.health[f.id] || 'unknown', state: q.state || 'loading',
        player: q.player || 'hls', bitrate_kbps: q.bitrate_kbps, buffer_s: q.buffer_s,
        stalls: q.stalls || 0, errors: q.errors || 0, dropped: q.dropped || 0,
        signals: signals(f.id).map(function (s) { return s.text; }) };
    }), pending_fixes: pendingRisks().length };
  }

  /* ---------------- health check: fetch the playlist, verify via playback ---------------- */
  function timed(url, ms) {
    var c = root.AbortController ? new AbortController() : null;
    var tm = setTimeout(function () { if (c) c.abort(); }, ms || CHECK_MS);
    return fetch(url, { cache: 'no-store', credentials: 'omit', signal: c && c.signal }).then(function (r) {
      clearTimeout(tm); return r;
    }, function (e) { clearTimeout(tm); throw e; });
  }

  // 'up' (playlist fetched and parses), 'down' (server says the playlist is
  // gone), or 'unverified' (network error / CORS — mount anyway and let
  // playback decide, so a CORS-blocked fetch never blanks a playable tile).
  function check(feed) {
    return timed(feed.url).then(function (r) {
      if (!r.ok) return 'down';
      return r.text().then(function (txt) {
        return txt && txt.indexOf('#EXTM3U') >= 0 ? 'up' : 'down';
      }, function () { return 'down'; });
    }, function () { return 'unverified'; });
  }

  function activeIds() {
    return Object.keys(S.mounted).filter(function (id) {
      var v = videoOf(id);
      return v && !v.paused;
    });
  }

  function enforceBudget(except) {
    var victims = chooseVictims(Object.keys(S.mounted), S.vis, S.touch, MAX_ACTIVE, except);
    victims.forEach(function (id) {
      var v = videoOf(id);
      try { if (v && !v.paused) v.pause(); } catch (e) {}
      delete S.mounted[id];
      showPoster(id, 'Paused · over decoder budget — tap ▶');
    });
    return victims;
  }

  function activate(id) {
    var m = MS(), feed = feedById(id);
    if (!m || !feed) return;
    clearDown(id);
    S.touch[id] = Date.now();
    var scr = screenEl(id);
    if (Object.keys(S.mounted).length >= MAX_ACTIVE && !S.mounted[id]) { showPoster(id); return; }
    if (scr) { scr.removeAttribute('data-defer'); scr.classList.remove('is-poster'); var pb = scr.querySelector('.ms-play'); if (pb) pb.remove(); }
    try { m.mount(scr ? scr.parentNode : document); } catch (e) {}
    S.mounted[id] = 1;
    watchVideo(id);
    enforceBudget(id);
  }

  function verifyPlayback(id) {
    setTimeout(function () {
      if (S.health[id] === 'down' || !S.mounted[id]) return;
      var v = videoOf(id);
      var dead = false;
      try {
        if (!v) dead = true;
        else if (v.error) dead = true;
        else if (v.networkState === 3 && v.readyState === 0) dead = true; // NETWORK_NO_SOURCE, no frames
      } catch (e) {}
      if (dead) { delete S.mounted[id]; showDown(id); }
      else setHealth(id, 'up', S.health[id] === 'unverified' ? 'Playing (unverified)' : 'Playing');
    }, VERIFY_MS);
  }

  function resetTelemetry(id) {
    S.events[id] = [];
    delete S.qoe[id];
    delete S.risk[id];
    delete S.dropped[id];
    paintQoe(id);
  }

  function runCheck(id, opts) {
    var feed = feedById(id);
    if (!feed || feed.enabled === false) return;
    var lazy = !!(opts && opts.lazy);
    resetTelemetry(id); // a fresh check starts from clean counters; approvals stay with the human
    setHealth(id, 'checking', 'Checking…');
    if (!lazy) setSlate(id, 'Checking feed…');
    check(feed).then(function (st) {
      if (st === 'down') { showDown(id); return; }
      if (lazy) {
        // Poster-first: playlist probed, decoder still idle. Hover previews,
        // click expands — nothing decodes until a person looks at the tile.
        setHealth(id, st, st === 'up' ? 'Ready · hover to preview' : 'Ready (unverified) · hover to preview');
        setSlate(id, 'Hover to preview · click to expand');
        return;
      }
      setHealth(id, st, st === 'up' ? 'Feed OK' : 'Checking playback…');
      activate(id);
      verifyPlayback(id);
    });
  }

  /* ---------------- visibility: pause hidden / offscreen tiles ---------------- */
  function watchVideo(id) {
    var v = videoOf(id);
    if (!v || v.__tfWatched) return;
    try {
      v.__tfWatched = 1;
      v.addEventListener('error', function () { delete S.mounted[id]; showDown(id); });
      if (S.io) S.io.observe(v);
    } catch (e) {}
  }

  function maybeResume(id) {
    if (S.health[id] === 'down' || S.mounted[id]) return;
    var v = videoOf(id);
    if (!v) { activate(id); return; } // parked tile with its element intact
    if (Object.keys(S.mounted).length >= MAX_ACTIVE) return;
    S.mounted[id] = 1;
    S.touch[id] = Date.now();
    try {
      var scr = screenEl(id);
      if (scr) { var pb = scr.querySelector('.ms-play'); if (pb) pb.remove(); scr.classList.remove('is-poster'); }
      v.play().catch(function () {});
    } catch (e) {}
    enforceBudget(id);
  }

  function wireObservers() {
    if (S.wired) return;
    S.wired = true;
    try {
      if (root.IntersectionObserver) {
        S.io = new root.IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            var fig = en.target && en.target.closest ? en.target.closest('[data-testfeed]') : null;
            var id = fig && fig.getAttribute('data-testfeed');
            if (!id) return;
            S.vis[id] = !!en.isIntersecting;
            if (en.isIntersecting) { if (S.mounted[id]) { var v = videoOf(id); try { if (v && v.paused) v.play().catch(function () {}); } catch (e) {} } }
            else { var v2 = videoOf(id); try { if (v2 && !v2.paused) v2.pause(); } catch (e2) {} }
          });
        }, { threshold: 0.15 });
      }
    } catch (e) {}
    try {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
          Object.keys(S.mounted).forEach(function (id) { var v = videoOf(id); try { if (v && !v.paused) v.pause(); } catch (e) {} });
        } else {
          Object.keys(S.mounted).forEach(function (id) {
            if (S.vis[id] === false) return;
            var v = videoOf(id); try { if (v && v.paused) v.play().catch(function () {}); } catch (e) {}
          });
        }
      });
    } catch (e) {}
    try {
      if (root.MuseObserve && root.MuseObserve.inp) root.MuseObserve.inp('.ms-test');
    } catch (e) {}
    var tickFn = function () {
      Object.keys(S.mounted).forEach(function (id) {
        try {
          var v = videoOf(id);
          if (!v) return;
          var q = qualityOf(v);
          if (q) {
            var prev = S.dropped[id] || 0, delta = q.dropped - prev;
            S.dropped[id] = q.dropped;
            logEvent(id, 'dropped', { dropped: q.dropped, total: q.total, delta: delta });
            if (delta > 0 && root.MuseObserve && root.MuseObserve.perf) {
              try { root.MuseObserve.perf('tile_dropped', delta, id); } catch (e) {}
            }
          }
          var ahead = bufferAhead(v);
          if (ahead != null) logEvent(id, 'buffer', { buffer_s: ahead });
        } catch (e) {}
      });
      // Quiet tiles raise no events, but sustained degradation still needs its
      // raise checked as time passes — sweep every mounted feed.
      try { Object.keys(S.mounted).forEach(function (id) { evaluate(id); }); } catch (e) {}
    };
    try {
      if (root.MuseHeartbeat && typeof root.MuseHeartbeat.every === 'function') root.MuseHeartbeat.every('testfeeds:dropped', tickFn, DROP_TICK_MS, { background: true });
      else setInterval(tickFn, DROP_TICK_MS);
    } catch (e) {}
  }

  /* ---------------- config load + wall hook ---------------- */
  var configPromise = null;
  function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = new Promise(function (resolve) {
      var done = function (feeds) { S.feeds = feeds; resolve(feeds); };
      try {
        fetch('/api/kv/' + KV_KEY + '?optional=1', { credentials: 'include', cache: 'no-store' }).then(function (r) {
          if (!r.ok) { done(DEFAULTS.slice()); return; }
          r.json().then(function (j) {
            var list = Array.isArray(j) ? j : (j && j.feeds);
            if (!list) { done(DEFAULTS.slice()); return; }
            var merged = merge(DEFAULTS, list);
            done(merged.length ? merged : DEFAULTS.slice());
          }, function () { done(DEFAULTS.slice()); });
        }, function () { done(DEFAULTS.slice()); });
      } catch (e) { done(DEFAULTS.slice()); }
    });
    return configPromise;
  }

  function rerenderGrid(host) {
    try {
      var grid = (host || document).querySelector('[data-tf-grid]');
      if (!grid) return;
      grid.innerHTML = S.feeds.filter(function (f) { return f.enabled !== false; }).map(tileHTML).join('') || '<p class="ms-empty">No test feeds enabled.</p>';
    } catch (e) {}
  }

  function mount(host) {
    wireObservers();
    loadConfig().then(function (feeds) {
      var have = {};
      try {
        Array.prototype.forEach.call((host || document).querySelectorAll('[data-testfeed]'), function (el) { have[el.getAttribute('data-testfeed')] = 1; });
      } catch (e) {}
      var want = feeds.filter(function (f) { return f.enabled !== false; }).map(function (f) { return f.id; });
      var same = want.length === Object.keys(have).length && want.every(function (id) { return have[id]; });
      if (!same) rerenderGrid(host);
      S.mounted = {};
      want.forEach(function (id) { runCheck(id, { lazy: true }); });
      want.forEach(paintQoe);
      renderRisks();
    });
  }

  var TF = root.MuseTestFeeds = {
    KV_KEY: KV_KEY,
    MAX_ACTIVE: MAX_ACTIVE,
    RISK: RISK,
    defaults: function () { return DEFAULTS.slice(); },
    sanitize: sanitize,
    merge: merge,
    pickActive: pickActive,
    chooseVictims: chooseVictims,
    qualityOf: qualityOf,
    check: check,
    sectionHTML: sectionHTML,
    tileHTML: tileHTML,
    loadConfig: loadConfig,
    mount: mount,
    event: logEvent, // player entry point: hls.js / video telemetry lands here
    signals: signals,
    evaluate: evaluate,
    riskBrief: riskBrief,
    status: status,
    agentBrief: agentBrief,
    approveRisk: approveRisk, // human buttons only — the module never approves by itself
    rejectRisk: rejectRisk,
    qoeOf: function (id) { return S.qoe[String(id || '')] || null; },
    eventsOf: function (id) { return (S.events[String(id || '')] || []).slice(); },
    feedById: function (id) { return feedById(String(id || '')); },
    hoverPreview: function (id) {
      id = String(id || '');
      if (!feedById(id) || S.health[id] === 'down') return;
      if (S.mounted[id]) { try { var M0 = MS(); if (M0 && typeof M0.resumeSlot === 'function' && M0.resumeSlot(slotOf(id))) return; } catch (e) {} var v0 = videoOf(id); try { if (v0 && v0.paused) v0.play().catch(function () {}); } catch (e) {} return; }
      activate(id);
      verifyPlayback(id);
    },
    hoverEnd: function (id) {
      id = String(id || '');
      // Pause + stop segment loading: a hovered-away tile costs no network/CPU.
      try { var M = MS(); if (M && typeof M.suspendSlot === 'function') { M.suspendSlot(slotOf(id)); return; } } catch (e) {}
      var v = videoOf(id);
      try { if (v && !v.paused) v.pause(); } catch (e) {}
    },
    openTheater: function (e, id) {
      var tgt = e && e.target;
      if (tgt && tgt.closest && (tgt.closest('.ms-audio') || tgt.closest('.ms-play') || tgt.closest('.ms-retry'))) return;
      id = String(id || '');
      if (!feedById(id)) return;
      try {
        var M = MS();
        if (M && typeof M.openTestStream === 'function') { M.openTestStream(id, { viaClick: true }); return; }
      } catch (err) {}
    },
    retry: function (id) {
      id = String(id || '');
      if (!feedById(id)) return;
      S.touch[id] = Date.now();
      runCheck(id);
    },
    preview: function (e, btn, id) {
      if (e && e.stopPropagation) e.stopPropagation();
      id = String(id || '');
      var feed = feedById(id), m = MS();
      if (!feed || !m) return;
      S.touch[id] = Date.now();
      try {
        var scr = screenEl(id);
        if (scr) { scr.removeAttribute('data-defer'); scr.classList.remove('is-poster'); }
        if (btn) btn.remove();
        m.mount(scr ? scr.parentNode : document);
      } catch (err) {}
      S.mounted[id] = 1;
      watchVideo(id);
      enforceBudget(id);
    },
    // Test hooks (not for production callers).
    _state: function () { return S; },
    _clock: function (fn) { clock = fn || null; },
    _reset: function () { S.feeds = DEFAULTS.slice(); S.health = {}; S.touch = {}; S.vis = {}; S.mounted = {}; S.dropped = {}; S.events = {}; S.qoe = {}; S.risk = {}; configPromise = null; clock = null; }
  };
  return TF;
})(typeof window !== 'undefined' ? window : globalThis);
