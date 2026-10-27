// @ts-check
/* Muse Live — first-party product telemetry (window.MuseObserve).
   Load it FIRST so it sees errors from everything after it. Sends batched events to
   /api/observe (daily aggregates in KV; admins read them at /ops/health.html):
     error   — uncaught errors / unhandled rejections from Muse Live's own code
               (cross-origin noise such as the YouTube player is filtered out)
     view    — top-level views and production tabs (wraps navGo / switchView / setProjTab)
     muse    — one count per question asked (never the question text)
     feature — which inline actions people use (the function name behind a button)
     session — one per page load
   Nothing personal beyond the signed-in account (server side) is collected. */
(function (root) {
  'use strict';
  /** @type {any} */ var w = root;
  var Q = [], MAX_BATCH = 40, FLUSH_MS = 30000, errCount = {};
  var NOISE = /isExternalMethodAvailable|^Script error\.?$|ResizeObserver loop|compute-pressure|chrome-extension:|moz-extension:/i;

  function signedIn() { try { return document.cookie.indexOf('muse_authed=1') >= 0; } catch (e) { return false; } }
  function push(e) { if (!signedIn()) return; e.at = new Date().toISOString(); Q.push(e); if (Q.length >= MAX_BATCH) flush(); }
  function flush(beacon) {
    if (!Q.length || !signedIn()) return;
    var body = JSON.stringify({ events: Q.splice(0, Q.length) });
    try {
      if (beacon && navigator.sendBeacon && navigator.sendBeacon('/api/observe', new Blob([body], { type: 'application/json' }))) return;
      fetch('/api/observe', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: body }).catch(function () { /* best effort */ });
    } catch (e) { /* best effort */ }
  }
  function sameOriginSrc(src) { return !src || String(src).indexOf(location.origin) === 0; }
  function recordError(msg, src, stack) {
    msg = String(msg || 'Unknown error');
    if (NOISE.test(msg) || !sameOriginSrc(src)) return;
    var sig = msg + '|' + (src || '');
    errCount[sig] = (errCount[sig] || 0) + 1;
    if (errCount[sig] > 20) return; // a loop shouldn't flood the batch
    push({ t: 'error', msg: msg.slice(0, 300), src: String(src || '').replace(location.origin, '').slice(0, 200), stack: String(stack || '').slice(0, 1200) });
  }
  root.addEventListener('error', function (ev) {
    if (!ev || !(/** @type {any} */ (ev).message)) return; // resource load errors have no message
    var e = /** @type {ErrorEvent} */ (ev);
    recordError(e.message, e.filename ? e.filename + ':' + e.lineno : '', e.error && e.error.stack);
  });
  root.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    recordError('Unhandled rejection: ' + (r && r.message ? r.message : String(r)), '', r && r.stack);
  });

  /* wrap app globals after the deferred bundles have defined them */
  function wrap(name, fn) {
    var orig = w[name];
    if (typeof orig !== 'function' || orig.__observed) return;
    var wrapped = function () { try { fn.apply(null, arguments); } catch (e) { /* never break the app */ } return orig.apply(this, arguments); };
    wrapped.__observed = true;
    w[name] = wrapped;
  }
  function instrument() {
    var last = '';
    function view(v) { if (v && v !== last) { last = v; push({ t: 'view', v: v }); } }
    wrap('switchView', function (v) { view(w.productions && w.productions[v] ? 'production' : String(v || 'dashboard')); });
    wrap('setProjTab', function (k, tab) { view('production:' + tab); });
    wrap('museaiDeliver', function () { push({ t: 'muse', k: 'asked' }); });
    if (w.MuseAiMuseAi && typeof w.MuseAiMuseAi.ask === 'function' && !w.MuseAiMuseAi.ask.__observed) {
      var ask = w.MuseAiMuseAi.ask;
      w.MuseAiMuseAi.ask = function () { push({ t: 'muse', k: 'asked' }); return ask.apply(this, arguments); };
      w.MuseAiMuseAi.ask.__observed = true;
    }
    var initial = document.querySelector('.view-pane.active');
    view(initial ? initial.id.replace(/^view-/, '') : 'dashboard');
  }
  // feature usage: the function name behind any inline-handled control the user clicks
  document.addEventListener('click', function (ev) {
    var t = /** @type {any} */ (ev.target);
    var el = t && t.closest ? t.closest('[onclick]') : null;
    if (!el) return;
    var m = /(?:^|;)\s*(?:event\.\w+\(\);\s*)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/.exec(el.getAttribute('onclick') || '');
    if (m && m[1].length <= 60 && !/^(if|return|this|event|document)$/.test(m[1])) push({ t: 'feature', f: m[1] });
  }, true);

  if (signedIn()) push({ t: 'session' });
  root.addEventListener('load', function () { setTimeout(instrument, 0); });
  if (root.MuseHeartbeat && typeof root.MuseHeartbeat.every === 'function') root.MuseHeartbeat.every('observe:flush', function () { flush(false); }, FLUSH_MS, { background: true });
  else setInterval(function () { flush(false); }, FLUSH_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
  root.addEventListener('pagehide', function () { flush(true); });

  w.MuseObserve = { track: function (f) { push({ t: 'feature', f: String(f).slice(0, 60) }); }, error: recordError, flush: function () { flush(false); } };
})(typeof window !== 'undefined' ? window : globalThis);
