/**
 * Muse Live — Ops OS layer
 * Shared plan-of-record (BroadcastChannel + LWW) · day-of show board ·
 * field offline queue · Action Muse hooks.
 * ES5 IIFE. No deploy backend required — live across tabs in this origin.
 */
(function (global) {
  'use strict';

  var CH = 'muse-live-por';
  var QKEY = 'muselive_field_q_v1';
  var LOGKEY = 'muselive_por_log_v1';
  var CLOCKKEY = 'muselive_por_clock_v1';
  var FOCUSKEY = 'muselive_os_focus';
  var TTL = 14000;

  var selfId = '';
  var bc = null;
  var peers = {};
  var log = [];
  var clock = {};
  var queue = [];
  var focus = '';
  var installed = false;
  var silent = false;
  var helloTimer = null;
  var orig = {};

  function now() { return Date.now(); }
  function iso() { try { return new Date().toISOString(); } catch (e) { return String(now()); } }
  function actor() {
    try { if (typeof global.permUser === 'function' && global.permUser()) return String(global.permUser()); } catch (e) {}
    try {
      var n = document.getElementById('userChipName');
      if (n && n.textContent) return n.textContent.trim();
    } catch (e2) {}
    return 'Lila Hart';
  }
  function uid(pfx) {
    return (pfx || 'os') + now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
  }
  function loadJSON(k, fallback) {
    try {
      var r = localStorage.getItem(k);
      if (!r) return fallback;
      var o = JSON.parse(r);
      return o == null ? fallback : o;
    } catch (e) { return fallback; }
  }
  function saveJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function isOnline() {
    try { return navigator.onLine !== false; } catch (e) { return true; }
  }

  function persistMeta() {
    saveJSON(LOGKEY, log.slice(0, 80));
    saveJSON(CLOCKKEY, clock);
    saveJSON(QKEY, queue);
  }

  function pushLog(entry) {
    entry.ts = entry.ts || iso();
    entry.id = entry.id || uid('lg');
    log.unshift(entry);
    if (log.length > 80) log.length = 80;
    persistMeta();
  }

  /* ---------- presence ---------- */
  function peerList() {
    var cut = now() - TTL;
    var out = [];
    Object.keys(peers).forEach(function (id) {
      if (peers[id].ts < cut) delete peers[id];
      else out.push(peers[id]);
    });
    return out;
  }
  function hello(view) {
    var msg = {
      t: 'hello',
      id: selfId,
      name: actor(),
      view: view || currentView(),
      ts: now()
    };
    peers[selfId] = msg;
    post(msg);
    paintPorChip();
  }
  function currentView() {
    try {
      if (typeof global.navRailActiveView === 'function') return global.navRailActiveView();
    } catch (e) {}
    var el = document.querySelector('.view-pane.active');
    return el ? String(el.id || '').replace('view-', '') : 'dashboard';
  }

  function post(msg) {
    try { if (bc) bc.postMessage(msg); } catch (e) {}
  }

  /* ---------- patches / LWW ---------- */
  function pathOf(p) {
    return p.kind + ':' + p.key + ':' + (p.path || p.dept || p.idx || '');
  }
  function accept(p) {
    var path = pathOf(p);
    var prev = clock[path] || 0;
    var ts = p.at || 0;
    if (ts < prev) return false;
    clock[path] = ts;
    persistMeta();
    return true;
  }

  function applyDept(p) {
    var prods = global.productions;
    if (!prods || !prods[p.key] || !prods[p.key].dept) return;
    var i, idx = -1;
    if (typeof p.idx === 'number') idx = p.idx;
    else {
      for (i = 0; i < prods[p.key].dept.length; i++) {
        if (prods[p.key].dept[i][0] === p.dept) { idx = i; break; }
      }
    }
    if (idx < 0) return;
    silent = true;
    try {
      if (typeof global.setDeptStatus === 'function') global.setDeptStatus(p.key, idx, p.status);
    } finally { silent = false; }
  }

  function applyFieldNote(p) {
    var prods = global.productions;
    if (!prods || !prods[p.key]) return;
    var prod = prods[p.key];
    try {
      if (typeof global.getSurvey === 'function') global.getSurvey(p.key);
    } catch (e) {}
    if (!prod.survey) prod.survey = {};
    if (!Array.isArray(prod.survey.notes)) prod.survey.notes = [];
    prod.survey.notes.unshift({
      author: p.actor || actor(),
      ts: p.ts || iso(),
      text: p.text || '',
      via: 'field'
    });
    try { if (typeof global.logEvent === 'function') global.logEvent(p.key, 'Field note: ' + String(p.text || '').slice(0, 80)); } catch (e2) {}
    try { if (typeof global.stampEdit === 'function') global.stampEdit(p.key); } catch (e3) {}
  }

  function applyCheckin(p) {
    silent = true;
    try {
      if (typeof global.checkinWrite === 'function') global.checkinWrite(p.key, p.name, p.rec);
    } finally { silent = false; }
  }

  function ingest(p, remote) {
    if (!p || p.id === selfId && remote) return;
    if (p.t === 'hello') {
      if (p.id && p.id !== selfId) peers[p.id] = p;
      paintPorChip();
      return;
    }
    if (p.t === 'bye') {
      if (p.id) delete peers[p.id];
      paintPorChip();
      return;
    }
    if (p.t !== 'patch') return;
    if (!accept(p)) return;
    if (p.kind === 'deptStatus') applyDept(p);
    else if (p.kind === 'fieldNote') applyFieldNote(p);
    else if (p.kind === 'checkin') applyCheckin(p);
    pushLog({
      kind: p.kind,
      key: p.key,
      actor: p.actor,
      text: p.label || p.kind,
      remote: !!remote
    });
    render();
  }

  function commit(p) {
    if (silent) return;
    p = p || {};
    p.t = 'patch';
    p.id = selfId;
    p.at = now();
    p.ts = iso();
    p.actor = actor();
    if (!accept(p) && p.kind !== 'fieldNote') return;
    if (p.kind === 'deptStatus') {
      p.label = (p.dept || 'Dept') + ' → ' + p.status + ' · ' + prodName(p.key);
    } else if (p.kind === 'fieldNote') {
      p.label = 'Field note on ' + prodName(p.key);
    } else if (p.kind === 'checkin') {
      p.label = (p.name || 'Crew') + ' check-in · ' + prodName(p.key);
    }
    pushLog({ kind: p.kind, key: p.key, actor: p.actor, text: p.label });
    post(p);
    render();
    try { if (typeof global.museBus === 'object' && global.museBus.emit) global.museBus.emit('por.patch', p); } catch (e) {}
  }

  /* ---------- field queue ---------- */
  function queued() {
    return queue.filter(function (x) { return x.status === 'queued' || x.status === 'error'; });
  }
  function enqueue(item) {
    item.id = item.id || uid('fq');
    item.ts = item.ts || iso();
    item.status = isOnline() ? 'queued' : 'queued';
    item.actor = actor();
    queue.unshift(item);
    persistMeta();
    if (isOnline()) flushQueue();
    else {
      try { if (typeof global.toast === 'function') global.toast('Queued offline — will sync when signal returns'); } catch (e) {}
    }
    render();
    return item.id;
  }
  function flushQueue() {
    if (!isOnline()) { render(); return; }
    var i, item;
    for (i = 0; i < queue.length; i++) {
      item = queue[i];
      if (item.status === 'synced') continue;
      try {
        if (item.kind === 'fieldNote') {
          applyFieldNote(item);
          commit({ kind: 'fieldNote', key: item.key, text: item.text, path: 'note:' + item.id });
        } else if (item.kind === 'checkin') {
          applyCheckin(item);
          commit({ kind: 'checkin', key: item.key, name: item.name, rec: item.rec, path: 'checkin:' + item.name });
        }
        item.status = 'synced';
        item.syncedAt = iso();
      } catch (e) {
        item.status = 'error';
        item.error = String(e && e.message || e);
      }
    }
    persistMeta();
    render();
  }

  function fieldNote(key, text) {
    key = key || focusKey();
    text = String(text || '').trim();
    if (!key || !text) return;
    enqueue({ kind: 'fieldNote', key: key, text: text });
    if (isOnline()) {
      try { if (typeof global.toast === 'function') global.toast('Field note on plan of record'); } catch (e) {}
    }
  }

  /* ---------- show board model ---------- */
  function prodName(key) {
    var p = (global.productions || {})[key];
    return p ? (p.tab || p.name || key) : key;
  }
  function focusKey() {
    if (focus && (global.productions || {})[focus]) return focus;
    var saved = '';
    try { saved = sessionStorage.getItem(FOCUSKEY) || ''; } catch (e) {}
    if (saved && (global.productions || {})[saved]) { focus = saved; return focus; }
    var order = global.order || [];
    var i, k, p, best = '', bestScore = -1;
    for (i = 0; i < order.length; i++) {
      k = order[i];
      p = (global.productions || {})[k];
      if (!p) continue;
      var score = 0;
      if (/live/i.test(p.status || '')) score += 50;
      if (p.risk) score += 20;
      if (k === 'orion') score += 15;
      if (k === 'museaitour') score += 10;
      if (typeof p.pct === 'number') score += Math.max(0, 40 - Math.abs(70 - p.pct) / 2);
      if (score > bestScore) { bestScore = score; best = k; }
    }
    focus = best || order[0] || '';
    return focus;
  }
  function setFocus(key) {
    if (!(global.productions || {})[key]) return;
    focus = key;
    try { sessionStorage.setItem(FOCUSKEY, key); } catch (e) {}
    render();
  }

  function gng(key) {
    try {
      if (global.MuseBOps && typeof global.MuseBOps.computeGoNoGo === 'function')
        return global.MuseBOps.computeGoNoGo(key);
    } catch (e) {}
    var p = (global.productions || {})[key];
    if (!p) return { decision: 'NO-GO', score: 0, checks: [], summary: 'Unknown production' };
    var missing = (p.dept || []).filter(function (d) { return d[1] === 'missing'; }).length;
    var pending = (p.dept || []).filter(function (d) { return d[1] === 'pending'; }).length;
    var decision = missing ? 'NO-GO' : pending ? 'CONDITIONAL' : 'GO';
    return {
      decision: decision,
      score: typeof p.pct === 'number' ? p.pct : 0,
      summary: missing ? missing + ' department(s) missing' : pending ? pending + ' pending' : 'Departments clear',
      checks: []
    };
  }

  function blockers(key) {
    var p = (global.productions || {})[key];
    var out = [];
    if (!p) return out;
    (p.dept || []).forEach(function (d) {
      if (d[1] === 'missing' || d[1] === 'pending') {
        out.push({
          level: d[1] === 'missing' ? 'red' : 'amber',
          label: d[0],
          detail: d[2] && d[2] !== '—' ? d[2] : (d[1] === 'missing' ? 'Missing' : 'Pending')
        });
      }
    });
    var g = gng(key);
    (g.checks || []).forEach(function (c) {
      if (c.level === 'red' || c.level === 'amber')
        out.push({ level: c.level, label: c.label, detail: c.detail });
    });
    return out.slice(0, 10);
  }

  function crewOnSite(key) {
    try {
      if (typeof global.checkinSummary === 'function') return global.checkinSummary(key);
    } catch (e) {}
    return { on: 0, total: 0, off: 0 };
  }

  /* ---------- render ---------- */
  function levelCls(lv) {
    if (lv === 'green' || lv === 'GO') return 'os-go';
    if (lv === 'amber' || lv === 'CONDITIONAL' || lv === 'pending') return 'os-hold';
    return 'os-nogo';
  }
  function tile(label, level, value, sub, go) {
    return (
      '<button type="button" class="os-tile ' + levelCls(level) + '" onclick="' + go + '">' +
      '<span class="os-tile-k">' + esc(label) + '</span>' +
      '<span class="os-tile-v">' + esc(value) + '</span>' +
      '<span class="os-tile-s">' + esc(sub || '') + '</span></button>'
    );
  }
  function openProdTab(key, tab) {
    return "try{switchView('" + key + "');setProjTab('" + key + "','" + tab + "');}catch(e){}";
  }

  function boardHTML(compact) {
    var key = focusKey();
    var p = (global.productions || {})[key];
    if (!p) {
      return '<div class="os-empty">No productions loaded.</div>';
    }
    var g = gng(key);
    var crew = crewOnSite(key);
    var bl = blockers(key);
    var checks = g.checks || [];
    var byId = {};
    checks.forEach(function (c) { byId[c.id] = c; });
    function chk(id, fallbackLabel, fallbackDetail) {
      return byId[id] || { id: id, label: fallbackLabel, level: 'green', detail: fallbackDetail || '—' };
    }
    var sig = chk('signal', 'Signal path', 'Not modeled');
    var pwr = chk('power', 'Power load', 'Not modeled');
    var rf = chk('rf', 'RF', 'Hardwire / none');
    var sat = chk('sat', 'Satellite', 'No birds booked');
    var wx = chk('weather', 'Weather', 'No hold');
    var qn = queued().length;
    var peersNow = peerList();
    var viewerN = Math.max(1, peersNow.length);
    var order = global.order || [];
    var pills = order.map(function (k) {
      var pr = (global.productions || {})[k];
      if (!pr) return '';
      var on = k === key ? ' is-on' : '';
      return '<button type="button" class="os-pill' + on + '" onclick="MuseOS.setFocus(\'' + k + '\')">' + esc(pr.tab || pr.name || k) + '</button>';
    }).join('');

    var deptPills = (p.dept || []).map(function (d) {
      var lv = d[1] === 'approved' ? 'green' : d[1] === 'pending' ? 'amber' : 'red';
      return '<span class="os-dp ' + levelCls(lv) + '" title="' + esc(d[2] || d[1]) + '">' + esc(d[0]) + '</span>';
    }).join('');

    var audit = log.filter(function (e) { return !key || e.key === key || !e.key; }).slice(0, compact ? 4 : 8).map(function (e) {
      return '<li><span class="os-log-t">' + esc(String(e.ts || '').replace('T', ' ').slice(11, 16) || 'now') +
        '</span><b>' + esc(e.actor || 'Ops') + '</b> ' + esc(e.text || e.kind) + '</li>';
    }).join('') || '<li class="os-muted">No writes yet — mark a department or ask Muse.</li>';

    var blockRows = bl.slice(0, compact ? 4 : 8).map(function (b) {
      return '<li class="' + levelCls(b.level) + '"><b>' + esc(b.label) + '</b> ' + esc(b.detail) + '</li>';
    }).join('') || '<li class="os-go">No blockers on the plan of record.</li>';

    var fieldHint = qn
      ? qn + ' field item' + (qn === 1 ? '' : 's') + ' waiting to sync'
      : (isOnline() ? 'Field queue clear · live' : 'Offline — notes will queue');

    var dec = g.decision || 'NO-GO';
    return (
      '<section class="os-board' + (compact ? ' is-compact' : '') + '">' +
      '<header class="os-head">' +
        '<div class="os-head-l">' +
          '<p class="os-kicker">Day-of show board</p>' +
          '<h2>' + esc(p.name) + '</h2>' +
          '<p class="os-sub">' + esc(p.venue || '') + (p.date ? ' · ' + esc(p.date) : '') + '</p>' +
        '</div>' +
        '<div class="os-decision ' + levelCls(dec) + '">' +
          '<span class="os-dec-lab">Go / No-Go</span>' +
          '<span class="os-dec">' + esc(dec) + '</span>' +
          '<span class="os-score mono">' + esc(String(g.score)) + '%</span>' +
        '</div>' +
      '</header>' +
      '<div class="os-por">' +
        '<span class="os-live"></span>' +
        '<b>Plan of record</b>' +
        '<span>' + viewerN + ' viewing</span>' +
        '<span class="os-dot">·</span>' +
        '<span>' + esc(fieldHint) + '</span>' +
        (qn ? '<button type="button" class="os-link" onclick="MuseOS.flush()">Sync now</button>' : '') +
      '</div>' +
      '<div class="os-pills">' + pills + '</div>' +
      '<div class="os-tiles">' +
        tile('Signal', sig.level, sig.level === 'green' ? 'Clear' : sig.level === 'red' ? 'Fault' : 'Watch', sig.detail, openProdTab(key, 'ops')) +
        tile('Power', pwr.level, pwr.level === 'green' ? 'In spec' : pwr.level === 'red' ? 'Over' : 'Watch', pwr.detail, openProdTab(key, 'ops')) +
        tile('RF', rf.level, rf.level === 'green' ? 'Coordinated' : rf.level === 'red' ? 'Clash' : 'Pending', rf.detail, openProdTab(key, 'ops')) +
        tile('Satellite', sat.level, (sat.level === 'green' && sat.detail && sat.detail.indexOf('No birds') < 0) ? 'Booked' : (sat.detail && sat.detail.indexOf('No birds') === 0 ? 'None' : 'Hold'), sat.detail, openProdTab(key, 'ops')) +
        tile('Crew on site', crew.off ? 'amber' : (crew.total ? 'green' : 'amber'), crew.on + ' / ' + crew.total, crew.total ? (crew.off ? crew.off + ' not yet' : 'All on site') : 'No crew rows', openProdTab(key, 'crew')) +
        tile('Weather', wx.level || 'green', wx.level === 'red' ? 'Hold' : 'Clear', (wx.detail && wx.detail !== '—') ? wx.detail : 'No hold', openProdTab(key, 'ops')) +
      '</div>' +
      '<div class="os-depts">' + deptPills + '</div>' +
      '<div class="os-split">' +
        '<div class="os-col"><h3>Blockers</h3><ul class="os-list">' + blockRows + '</ul></div>' +
        '<div class="os-col"><h3>Plan of record log</h3><ul class="os-log">' + audit + '</ul></div>' +
      '</div>' +
      '<div class="os-actions">' +
        '<button type="button" class="os-btn" onclick="' + openProdTab(key, 'ops') + '">Broadcast Ops</button>' +
        '<button type="button" class="os-btn" onclick="' + openProdTab(key, 'survey') + '">Site survey</button>' +
        '<button type="button" class="os-btn" onclick="try{if(!museaiOpen)toggleMuseAi();museaiAsk(\'What is blocking ' + esc(p.name).replace(/'/g, '') + '?\')}catch(e){}">Ask Muse</button>' +
        '<button type="button" class="os-btn os-btn-quiet" onclick="MuseOS.promptNote(\'' + key + '\')">Field note</button>' +
      '</div>' +
      '</section>'
    );
  }

  function paintPorChip() {
    var el = document.getElementById('musePorChip');
    if (!el) return;
    var n = Math.max(1, peerList().length);
    var qn = queued().length;
    var live = n > 1;
    el.hidden = false;
    el.textContent = (global.MUSE_LIVE_CONFIG && global.MUSE_LIVE_CONFIG.LOCAL_DEMO) ? 'PoR · local demo' : live ? ('PoR · ' + n + ' live') : (qn ? ('PoR · ' + qn + ' queued') : 'PoR · live');
    el.className = 'os-chip' + (qn ? ' is-warn' : (live ? ' is-live' : ''));
    el.title = live
      ? n + ' sessions on this plan of record.'
      : 'This browser is the plan of record. Open another tab to live-sync.' + (qn ? ' ' + qn + ' field item(s) queued.' : '');
  }

  function render() {
    paintPorChip();
    try {
      var qn = queued().length;
      var bar = document.getElementById('osFieldBanner');
      if (bar) {
        bar.hidden = !qn;
        bar.textContent = qn ? (qn + ' field item' + (qn === 1 ? '' : 's') + ' waiting to sync') : '';
      }
    } catch (e) {}
  }

  function promptNote(key) {
    key = key || focusKey();
    var text = '';
    try { text = window.prompt('Field note for ' + prodName(key) + ' (queued if offline)', ''); } catch (e) {}
    if (text && String(text).trim()) fieldNote(key, String(text).trim());
  }

  function openBoard(key) {
    if (key) setFocus(key);
    try {
      if (typeof global.openProject === 'function') global.openProject(key || focusKey());
      else if (typeof global.switchView === 'function') global.switchView(key || focusKey());
    } catch (e) {}
  }

  /* ---------- Muse ---------- */
  function parseMuseAi(qRaw) {
    var q = String(qRaw || '').toLowerCase().trim();
    if (!q) return null;
    if (/\b(what('?s| is)|whats)\b/.test(q) && /\b(block|blocking|missing|pending|holding)\b/.test(q))
      return { kind: 'blockers', key: (typeof global.findProd === 'function' && global.findProd(q)) || focusKey() };
    var m = q.match(/\b(?:field note|note from (?:the )?field|queue(?: a)? note)\b[:\s-]*(.*)$/i);
    if (/\b(field note|note from the field|queue(?: a)? note)\b/.test(q)) {
      var text = (m && m[1]) ? m[1].replace(/^for\s+[a-z0-9 ]+\s*/i, '').trim() : '';
      return { kind: 'fieldNote', key: (typeof global.findProd === 'function' && global.findProd(q)) || focusKey(), text: text };
    }
    if (/\bwho is on site\b/.test(q) || /\bon-?site\b/.test(q) && /\bwho\b/.test(q))
      return { kind: 'onsite', key: (typeof global.findProd === 'function' && global.findProd(q)) || focusKey() };
    return null;
  }

  function offerMuseAi(act) {
    if (!act) return false;
    if (act.kind === 'blockers') {
      var bl = blockers(act.key);
      var lines = bl.length
        ? bl.map(function (b) { return '• <b>' + esc(b.label) + '</b> — ' + esc(b.detail); }).join('<br>')
        : 'No blockers on the plan of record.';
      var g = gng(act.key);
      if (typeof global.museaiPushHtml === 'function')
        global.museaiPushHtml('<b>' + esc(prodName(act.key)) + '</b> is <b>' + esc(g.decision) + '</b> (' + g.score + '%).<br>' + lines +
          '<div class="mt-2"><button type="button" onclick="MuseOS.openBoard(\'' + act.key + '\')" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-2.5 py-1">Open production</button></div>');
      return true;
    }
    if (act.kind === 'onsite') {
      var c = crewOnSite(act.key);
      if (typeof global.museaiPushHtml === 'function')
        global.museaiPushHtml('<b>' + c.on + ' / ' + c.total + '</b> on site at ' + esc(prodName(act.key)) +
          (c.off ? (' · ' + c.off + ' not yet.') : ' · all checked in.') +
          '<div class="mt-2"><button type="button" onclick="' + openProdTab(act.key, 'crew') + '" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-2.5 py-1">Open crew</button></div>');
      return true;
    }
    if (act.kind === 'fieldNote') {
      global._museaiPending = act;
      if (typeof global.museaiPushHtml === 'function') {
        var preview = act.text ? esc(act.text) : '(you will be asked for the note)';
        global.museaiPushHtml('Queue a field note on <b>' + esc(prodName(act.key)) + '</b>: <i>' + preview + '</i>?' +
          '<div class="mt-2 flex flex-wrap gap-1.5">' +
          '<button type="button" onclick="museaiConfirmAction()" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-2.5 py-1">Confirm</button>' +
          '<button type="button" onclick="museaiCancelAction()" class="text-[10px] font-bold text-gray-700 border border-gray-300 rounded-lg px-2.5 py-1">Cancel</button></div>');
      }
      return true;
    }
    return false;
  }

  function confirmMuseAi(act) {
    if (!act || act.kind !== 'fieldNote') return false;
    var text = act.text;
    if (!text) {
      try { text = window.prompt('Field note for ' + prodName(act.key), ''); } catch (e) { text = ''; }
    }
    if (!text || !String(text).trim()) {
      if (typeof global.museaiPush === 'function') global.museaiPush('Cancelled — empty note.', 'bot');
      return true;
    }
    fieldNote(act.key, String(text).trim());
    if (typeof global.museaiPushHtml === 'function')
      global.museaiPushHtml('Queued to the plan of record' + (isOnline() ? ' and synced.' : ' (offline — will flush with signal).') +
        '<div class="mt-2"><button type="button" onclick="MuseOS.openBoard(\'' + act.key + '\')" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-2.5 py-1">Open production</button></div>');
    return true;
  }

  /* ---------- install wraps ---------- */
  function wrap(name, fn) {
    if (typeof global[name] !== 'function') return;
    orig[name] = global[name];
    global[name] = fn;
  }

  function install() {
    if (installed) return;
    installed = true;
    try {
      selfId = sessionStorage.getItem('muselive_os_sid') || uid('tab');
      sessionStorage.setItem('muselive_os_sid', selfId);
    } catch (e) { selfId = uid('tab'); }
    log = loadJSON(LOGKEY, []) || [];
    clock = loadJSON(CLOCKKEY, {}) || {};
    queue = loadJSON(QKEY, []) || [];

    try { bc = new BroadcastChannel(CH); } catch (e0) { bc = null; }
    if (bc) {
      bc.onmessage = function (ev) { try { ingest(ev.data, true); } catch (e1) {} };
    }

    wrap('setDeptStatus', function (key, idx, status) {
      var dept = '';
      try { dept = global.productions[key].dept[idx][0]; } catch (e) {}
      orig.setDeptStatus.apply(this, arguments);
      if (!silent) commit({ kind: 'deptStatus', key: key, idx: idx, status: status, dept: dept, path: 'dept:' + dept });
    });
    wrap('checkinWrite', function (key, name, rec) {
      orig.checkinWrite.apply(this, arguments);
      if (!silent) {
        if (!isOnline()) {
          enqueue({ kind: 'checkin', key: key, name: name, rec: rec });
        } else {
          commit({ kind: 'checkin', key: key, name: name, rec: rec, path: 'checkin:' + name });
        }
      }
    });
    wrap('switchView', function (view, opts) {
      orig.switchView.apply(this, arguments);
      hello(view);
    });
    wrap('museaiParseAction', function (q) {
      var extra = parseMuseAi(q);
      if (extra) return extra;
      return orig.museaiParseAction.apply(this, arguments);
    });
    wrap('museaiOfferAction', function (act) {
      if (act && offerMuseAi(act)) return true;
      return orig.museaiOfferAction.apply(this, arguments);
    });
    wrap('museaiConfirmAction', function () {
      var act = global._museaiPending;
      if (act && confirmMuseAi(act)) { global._museaiPending = null; return; }
      return orig.museaiConfirmAction.apply(this, arguments);
    });
    wrap('buildMuseAiChips', function () {
      orig.buildMuseAiChips.apply(this, arguments);
    });

    window.addEventListener('online', function () { flushQueue(); hello(); });
    window.addEventListener('offline', function () { render(); });
    window.addEventListener('beforeunload', function () { post({ t: 'bye', id: selfId }); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { hello(); flushQueue(); } });

    hello('dashboard');
    helloTimer = (global.MuseHeartbeat && typeof global.MuseHeartbeat.every === 'function')
      ? global.MuseHeartbeat.every('presence:hello', function () { hello(); }, 5000)
      : setInterval(function () { hello(); }, 5000);
    try {
      if (global.MuseLazy && global.MuseLazy.ensureBOps) global.MuseLazy.ensureBOps().then(function () { render(); }).catch(function () { render(); });
    } catch (e2) {}
    render();
    try { if (typeof global.buildMuseAiChips === 'function') global.buildMuseAiChips(); } catch (e3) {}
    setTimeout(flushQueue, 400);
  }

  global.MuseOS = {
    init: install,
    render: render,
    setFocus: setFocus,
    openBoard: openBoard,
    fieldNote: fieldNote,
    promptNote: promptNote,
    flush: flushQueue,
    queued: queued,
    parseMuseAi: parseMuseAi,
    focusKey: focusKey
  };

  function boot() {
    if (typeof global.setDeptStatus === 'function') install();
    else setTimeout(boot, 40);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : this);
