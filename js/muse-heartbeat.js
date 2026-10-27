/* One heartbeat, not a dozen timers.
   Modules register named cadences; a single 1 s tick fans out to whatever is
   due. Foreground work is skipped while the tab is hidden (the poll loops it
   replaces each woke the main thread on their own schedule and paid CPU for
   modules nobody was looking at). Errors in one task never stop the others.
   Cadences below one tick are clamped to one tick — sub-second work does not
   belong on the shared heartbeat. */
(function (root) {
  'use strict';

  var TICK_MS = 500;
  var tasks = {};
  var timer = null;
  var fakeNow = null;
  var clock = function () { if (fakeNow !== null) return fakeNow; try { return Date.now(); } catch (e) { return 0; } };
  var forceHidden = null;

  function hidden() {
    if (forceHidden !== null) return forceHidden;
    try { return !!(root.document && root.document.hidden); } catch (e) { return false; }
  }
  function tick(at) {
    var now = typeof at === 'number' ? at : clock(), h = hidden();
    Object.keys(tasks).forEach(function (name) {
      var t = tasks[name];
      if (!t) return;
      if (h && !t.background) return;
      if (now - t.last >= t.ms) {
        t.last = now;
        try { t.fn(); } catch (e) { /* one bad task never stops the rest */ }
      }
    });
  }
  function ensure() {
    if (timer !== null) return;
    try {
      if (typeof root.setInterval === 'function') timer = root.setInterval(function () { tick(); }, TICK_MS);
    } catch (e) { timer = null; }
  }
  // Register (or replace) a named cadence. Returns an unregister function.
  function every(name, fn, ms, opts) {
    tasks[name] = { fn: fn, ms: Math.max(+ms || TICK_MS, TICK_MS), last: clock(), background: !!(opts && opts.background) };
    ensure();
    return function () { delete tasks[name]; };
  }

  root.MuseHeartbeat = { version: '0.1.0', TICK_MS: TICK_MS, every: every,
    _tick: tick, _tasks: tasks,
    _hidden: function (v) { forceHidden = v; },
    _now: function (v) { fakeNow = v; } };
})(typeof window !== 'undefined' ? window : globalThis);
