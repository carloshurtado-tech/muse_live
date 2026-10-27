/* Interconnectivity — tasks with dependencies, owners, and automations.
   A show is a chain, not a pile: "uplink booked → encoder test → line check
   → go/no-go" reads as one chain with its blockers visible, not four rows
   that happen to share a date. Dependencies are computed, never stored as
   status — a task is blocked when any dependency is not done, no matter what
   anyone last claimed about it.
   Automations follow the Show Caller pattern: anything that touches a live
   show, a feed, or an outbound message NEVER executes silently. Critical
   rules produce a pending approval a human confirms or rejects; only the
   reversible and the informational run on their own, and everything lands in
   the log. Persistence is localStorage with a best-effort MuseSync mirror,
   the same shape the schedule uses. */
(function (root) {
  'use strict';

  var LS_KEY = 'muselive_tasks_v1';
  var RULE_KEY = 'muselive_task_rules_v1';
  var STATUSES = ['open', 'doing', 'blocked', 'done'];
  var SEQ = 0;

  function store() {
    try { var s = JSON.parse(root.localStorage.getItem(LS_KEY) || 'null'); if (s && s.tasks) return s; } catch (e) {}
    return { tasks: {} };
  }
  function saveStore(s) { try { root.localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} mirror(); }
  function rules() {
    try { var r = JSON.parse(root.localStorage.getItem(RULE_KEY) || 'null'); if (Array.isArray(r)) return r; } catch (e) {}
    return [];
  }
  function saveRules(r) { try { root.localStorage.setItem(RULE_KEY, JSON.stringify(r)); } catch (e) {} }
  function mirror() {
    try { if (root.MuseSync && typeof root.MuseSync.put === 'function' && !root.MuseSync.readOnly()) root.MuseSync.put('tasks', store().tasks); } catch (e) {}
  }
  function actor() {
    try {
      if (typeof root.permUser === 'function' && root.permUser()) return String(root.permUser());
      if (root.CURRENT_USER && root.CURRENT_USER.name) return String(root.CURRENT_USER.name);
    } catch (e) {}
    return 'crew';
  }
  function nid(p) { SEQ += 1; return p + '-' + Date.now().toString(36) + '-' + SEQ; }

  function list(key) {
    var t = store().tasks[key] || [];
    return JSON.parse(JSON.stringify(t));
  }
  function cleanDeps(deps, tasks, selfId) {
    var ids = {};
    tasks.forEach(function (t) { ids[t.id] = true; });
    return (deps || []).filter(function (d) { return ids[d] && d !== selfId; });
  }
  function add(key, task) {
    if (!key) return { ok: false, error: 'A task belongs to a show.' };
    task = task || {};
    if (!String(task.title || '').trim()) return { ok: false, error: 'A task needs a title.' };
    var s = store();
    s.tasks[key] = s.tasks[key] || [];
    var rec = { id: nid('T'), title: String(task.title).slice(0, 200),
      owner: String(task.owner || '').slice(0, 80), due: String(task.due || '').slice(0, 10),
      status: STATUSES.indexOf(task.status) >= 0 ? task.status : 'open',
      notes: String(task.notes || '').slice(0, 2000),
      deps: cleanDeps(task.deps, s.tasks[key], null),
      ts: Date.now(), by: actor(),
      log: [{ ts: Date.now(), by: actor(), action: 'created' }] };
    rec.deps = cleanDeps(task.deps, s.tasks[key].concat([rec]), rec.id);
    s.tasks[key].push(rec);
    saveStore(s);
    runAutomations({ type: 'task.created', show: key, task: { id: rec.id, title: rec.title, owner: rec.owner } });
    return { ok: true, id: rec.id };
  }
  function find(key, id) {
    return (store().tasks[key] || []).filter(function (t) { return t.id === id; })[0] || null;
  }
  function update(key, id, patch, why) {
    var s = store();
    var rec = (s.tasks[key] || []).filter(function (t) { return t.id === id; })[0] || null;
    if (!rec) return { ok: false, error: 'No task ' + id + '.' };
    var before = rec.status;
    patch = patch || {};
    if (patch.title !== undefined && String(patch.title).trim()) rec.title = String(patch.title).slice(0, 200);
    if (patch.owner !== undefined) rec.owner = String(patch.owner).slice(0, 80);
    if (patch.due !== undefined) rec.due = String(patch.due).slice(0, 10);
    if (patch.notes !== undefined) rec.notes = String(patch.notes).slice(0, 2000);
    if (patch.status !== undefined) {
      if (STATUSES.indexOf(patch.status) < 0) return { ok: false, error: 'Status is ' + STATUSES.join(' | ') + '.' };
      if (patch.status === 'done' && unmet(key, rec).length) return { ok: false, error: 'Blocked by ' + unmet(key, rec).length + ' unfinished dependenc' + (unmet(key, rec).length === 1 ? 'y' : 'ies') + '.' };
      rec.status = patch.status;
    }
    if (patch.deps !== undefined) rec.deps = cleanDeps(patch.deps, s.tasks[key], id);
    rec.log.push({ ts: Date.now(), by: actor(), action: 'updated', detail: String(why || (before !== rec.status ? before + ' → ' + rec.status : 'fields')) });
    saveStore(s);
    if (before !== 'done' && rec.status === 'done') runAutomations({ type: 'task.done', show: key, task: { id: rec.id, title: rec.title, owner: rec.owner } });
    return { ok: true };
  }
  function remove(key, id) {
    var s = store(), tasks = s.tasks[key] || [];
    if (!tasks.some(function (t) { return t.id === id; })) return { ok: false, error: 'No task ' + id + '.' };
    s.tasks[key] = tasks.filter(function (t) { return t.id !== id; });
    s.tasks[key].forEach(function (t) { t.deps = t.deps.filter(function (d) { return d !== id; }); });
    saveStore(s);
    return { ok: true };
  }

  // Computed, never stored: unmet dependencies by id.
  function unmet(key, rec) {
    var byId = {};
    (store().tasks[key] || []).forEach(function (t) { byId[t.id] = t; });
    return (rec.deps || []).filter(function (d) { return !byId[d] || byId[d].status !== 'done'; });
  }
  function blocked(key) {
    return list(key).filter(function (t) { return t.status !== 'done' && unmet(key, t).length > 0; });
  }
  function ready(key) {
    return list(key).filter(function (t) { return t.status === 'open' && unmet(key, t).length === 0; });
  }
  function overdue(key, now) {
    now = now == null ? Date.now() : now;
    return list(key).filter(function (t) { return t.status !== 'done' && t.due && Date.parse(t.due + 'T23:59:59') < now; });
  }
  function byOwner(key) {
    var out = {};
    list(key).forEach(function (t) {
      var o = t.owner || 'unassigned';
      (out[o] = out[o] || []).push(t);
    });
    return out;
  }

  /* ---------- automations: critical ones wait for a human ---------- */
  // Rule: { id, show ('*' for all), on (event type), match (substring of the
  // event title, optional), action ('create_task' | 'flag'), params,
  // requireApproval (default follows criticality) }.
  // Critical = the event names a live feed/incident, or the action sends,
  // books, or moves something. Critical rules NEVER execute on their own.
  var CRITICAL_EVENTS = ['incident.opened', 'stream.degraded', 'task.overdue'];
  var CRITICAL_ACTIONS = ['send', 'book', 'move', 'escalate'];

  function addRule(rule) {
    rule = rule || {};
    if (!rule.on) return { ok: false, error: 'A rule needs an event.' };
    if (['create_task', 'flag'].indexOf(rule.action) < 0) return { ok: false, error: 'Action is create_task | flag.' };
    var r = rules();
    var rec = { id: nid('R'), show: rule.show || '*', on: rule.on, match: String(rule.match || ''),
      action: rule.action, params: rule.params || {}, requireApproval: rule.requireApproval !== false, ts: Date.now(), by: actor() };
    r.push(rec);
    saveRules(r);
    return { ok: true, id: rec.id };
  }
  function removeRule(id) {
    var r = rules().filter(function (x) { return x.id !== id; });
    if (r.length === rules().length) return { ok: false, error: 'No rule ' + id + '.' };
    saveRules(r);
    return { ok: true };
  }
  function pending() {
    try { return JSON.parse(root.localStorage.getItem('muselive_task_pending_v1') || '[]'); } catch (e) { return []; }
  }
  function savePending(p) { try { root.localStorage.setItem('muselive_task_pending_v1', JSON.stringify(p.slice(0, 100))); } catch (e) {} }
  function isCritical(rule, event) {
    if (rule.requireApproval) return true;
    if (CRITICAL_EVENTS.indexOf(event.type) >= 0) return true;
    if (CRITICAL_ACTIONS.indexOf(rule.action) >= 0) return true;
    if (event.live) return true;
    return false;
  }
  function execute(key, action, params, provenance) {
    if (action === 'create_task') {
      return add(key, { title: (params && params.title) || 'Follow-up', owner: (params && params.owner) || '',
        due: (params && params.due) || '', notes: 'Raised by automation' + (provenance ? ' (' + provenance + ')' : '') + '.' });
    }
    if (action === 'flag') {
      return add(key, { title: 'FLAGGED: ' + ((params && params.title) || 'needs eyes'), owner: (params && params.owner) || '',
        notes: 'Raised by automation' + (provenance ? ' (' + provenance + ')' : '') + '.' });
    }
    return { ok: false, error: 'Unknown action' };
  }
  function runAutomations(event) {
    event = event || {};
    var out = [];
    rules().forEach(function (rule) {
      if (rule.show !== '*' && rule.show !== event.show) return;
      if (rule.on !== event.type) return;
      var title = (event.task && event.task.title) || event.title || '';
      if (rule.match && title.toLowerCase().indexOf(rule.match.toLowerCase()) < 0) return;
      if (isCritical(rule, event)) {
        var p = pending();
        var rec = { id: nid('P'), rule: rule.id, show: event.show, action: rule.action,
          params: rule.params || {}, event: title, ts: Date.now(), by: 'automation' };
        p.unshift(rec);
        savePending(p);
        out.push({ rule: rule.id, held: true, pending: rec.id });
      } else {
        var r = execute(event.show, rule.action, rule.params, 'rule ' + rule.id);
        out.push({ rule: rule.id, held: false, ok: r.ok });
      }
    });
    return out;
  }
  function approvePending(id, by) {
    var p = pending(), rec = null;
    p = p.filter(function (x) { if (x.id === id) { rec = x; return false; } return true; });
    if (!rec) return { ok: false, error: 'No pending item ' + id + '.' };
    savePending(p);
    var r = execute(rec.show, rec.action, rec.params, 'approved by ' + (by || actor()));
    return { ok: true, executed: r.ok };
  }
  function rejectPending(id, by) {
    var p = pending(), found = false;
    p = p.filter(function (x) { if (x.id === id) { found = true; return false; } return true; });
    if (!found) return { ok: false, error: 'No pending item ' + id + '.' };
    savePending(p);
    return { ok: true };
  }

  root.MuseTasks = { version: '0.1.0', STATUSES: STATUSES.slice(),
    list: list, add: add, update: update, remove: remove,
    unmet: unmet, blocked: blocked, ready: ready, overdue: overdue, byOwner: byOwner,
    addRule: addRule, removeRule: removeRule, rules: rules,
    runAutomations: runAutomations, pending: pending,
    approvePending: approvePending, rejectPending: rejectPending };
})(typeof window !== 'undefined' ? window : globalThis);
