/**
 * Muse Live — lazy loader (Wave B)
 * Defers heavy engines (CAD, 360) and PDF stack until first use.
 * ES5-friendly. Call MuseLazy.ensureCad / ensurePano / ensurePdf.
 *
 * v1.4 — never treat a deferred <script> as ready until onload fires and the
 * global exists. Try several absolute URLs so cad-viewer-engine.js /
 * pano-engine.js resolve from /, /Muse_Live_0.38.html, iframes, nested Pages.
 */
(function (global) {
  'use strict';

  var loading = {};
  var loaded = {};
  // Same ?v= tag as this loader's own <script> (the build bumps it), so lazy modules refresh on every deploy.
  var CACHE_V = (/[?&]v=([^&#]+)/.exec((document.currentScript || {}).src || '') || [])[1] || 'dev';

  function scriptBase() {
    try {
      var nodes = document.querySelectorAll('script[src]');
      for (var i = 0; i < nodes.length; i++) {
        var s = nodes[i].src || '';
        if (/muse-lazy|muse-broadcast|muse-platform|cad-viewer-engine|pano-engine|Muse_Live|index\.html/i.test(s)) {
          return s.replace(/[#?].*$/, '').replace(/[^\/]+$/, '');
        }
      }
    } catch (e) {}
    try {
      var path = (location.pathname || '/').replace(/[^\/]+$/, '');
      return (location.origin || '') + path;
    } catch (e2) {
      return '';
    }
  }

  function addUrl(list, u) {
    if (!u) return;
    var clean = String(u).replace(/([^:]\/)\/+/g, '$1');
    if (list.indexOf(clean) < 0) list.push(clean);
  }

  function withCache(u) {
    if (!u) return u;
    if (u.indexOf('?') >= 0) {
      if (/[?&]v=/.test(u)) return u;
      return u + '&v=' + CACHE_V;
    }
    return u + '?v=' + CACHE_V;
  }

  function candidateUrls(rel) {
    var urls = [];
    var file = String(rel || '').replace(/^\.\//, '');
    var leaf = file.replace(/^js\//i, '');
    var origin = '';
    try { origin = location.origin || ''; } catch (e0) {}
    var path = '/';
    try { path = (location.pathname || '/').replace(/[^\/]+$/, ''); } catch (e1) {}
    if (!path) path = '/';
    if (path.charAt(path.length - 1) !== '/') path += '/';

    addUrl(urls, origin + path + file);
    addUrl(urls, origin + '/' + file);
    addUrl(urls, origin + '/js/' + leaf);
    try { addUrl(urls, new URL(file, location.href).href); } catch (e2) {}
    try { addUrl(urls, new URL('js/' + leaf, location.href).href); } catch (e3) {}

    var base = scriptBase();
    if (base) {
      if (/\/js\/?$/i.test(base)) {
        addUrl(urls, base + leaf);
        addUrl(urls, base.replace(/\/js\/?$/i, '/') + file);
      } else {
        addUrl(urls, base + file);
        addUrl(urls, base + 'js/' + leaf);
      }
    }
    var busted = [];
    for (var i = 0; i < urls.length; i++) busted.push(withCache(urls[i]));
    return busted;
  }

  function waitGlobal(name, pred, ms) {
    ms = ms || 8000;
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      function tick() {
        var g = global[name];
        if (g && (!pred || pred(g))) { resolve(g); return; }
        if (Date.now() - t0 > ms) { reject(new Error(name + ' missing after load')); return; }
        setTimeout(tick, 40);
      }
      tick();
    });
  }

  function injectOne(url, id) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = false;
      s.charset = 'utf-8';
      s.setAttribute('data-muse-lazy', id);
      s.setAttribute('data-muse-pending', '1');
      var settled = false;
      function ok() {
        if (settled) return;
        settled = true;
        s.removeAttribute('data-muse-pending');
        s.setAttribute('data-muse-ready', '1');
        resolve(true);
      }
      function fail() {
        if (settled) return;
        settled = true;
        try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) {}
        reject(new Error('script error ' + url));
      }
      s.onload = ok;
      s.onerror = fail;
      setTimeout(function () { if (!settled) fail(); }, 12000);
      document.head.appendChild(s);
    });
  }

  function waitExisting(el, id) {
    return new Promise(function (resolve, reject) {
      if (!el) { reject(new Error('no script')); return; }
      if (el.getAttribute('data-muse-ready') === '1') { resolve(true); return; }
      var settled = false;
      function ok() {
        if (settled) return;
        settled = true;
        el.setAttribute('data-muse-ready', '1');
        resolve(true);
      }
      function fail() {
        if (settled) return;
        settled = true;
        reject(new Error('existing script failed'));
      }
      function globalReady() {
        if (id === 'cad-viewer-engine' && global.CadViewer && global.CadViewer.open) return true;
        if (id === 'pano-engine' && global.PanoEng && global.PanoEng.open) return true;
        return false;
      }
      if (globalReady()) { ok(); return; }
      el.addEventListener('load', function () { if (globalReady() || true) ok(); });
      el.addEventListener('error', fail);
      try {
        if (el.readyState === 'complete' || el.readyState === 'loaded') {
          if (globalReady()) { ok(); return; }
        }
      } catch (e0) {}
      var t0 = Date.now();
      (function poll() {
        if (settled) return;
        if (globalReady()) { ok(); return; }
        if (Date.now() - t0 > 10000) { fail(); return; }
        setTimeout(poll, 50);
      })();
    });
  }

  function loadScript(src, id) {
    if (loaded[id]) return Promise.resolve(true);
    if (loading[id]) return loading[id];
    loading[id] = new Promise(function (resolve, reject) {
      function doneOk() {
        loaded[id] = true;
        resolve(true);
      }
      function injectAll() {
        var urls = /^https?:\/\//i.test(src) ? [src] : candidateUrls(src);
        var i = 0;
        function attempt() {
          if (i >= urls.length) {
            delete loading[id];
            reject(new Error('Failed to load ' + src));
            return;
          }
          injectOne(urls[i], id).then(doneOk).catch(function () {
            i += 1;
            attempt();
          });
        }
        attempt();
      }

      var existing = document.querySelector('script[data-muse-lazy="' + id + '"],script[src*="' + id + '"]');
      if (existing) {
        waitExisting(existing, id).then(doneOk).catch(function () {
          injectAll();
        });
        return;
      }
      injectAll();
    });
    return loading[id];
  }

  function abs(rel) {
    var list = candidateUrls(rel);
    return list.length ? list[0] : rel;
  }

  function ensureCad() {
    if (typeof global.CadViewer !== 'undefined' && global.CadViewer.open) {
      return Promise.resolve(global.CadViewer);
    }
    if (typeof global.CAD3D !== 'undefined' && global.CAD3D.open) {
      return Promise.resolve(global.CAD3D);
    }
    return loadScript('js/cad-viewer-engine.js', 'cad-viewer-engine').then(function () {
      return waitGlobal('CadViewer', function (g) { return !!g.open; }, 8000);
    }).catch(function () {
      if (typeof global.CAD3D !== 'undefined' && global.CAD3D.open) return global.CAD3D;
      /* last-ditch: inject even if a stale tag claimed to exist */
      delete loaded['cad-viewer-engine'];
      delete loading['cad-viewer-engine'];
      var urls = candidateUrls('js/cad-viewer-engine.js');
      return injectOne(urls[0] || 'js/cad-viewer-engine.js?v=' + CACHE_V, 'cad-viewer-engine').then(function () {
        return waitGlobal('CadViewer', function (g) { return !!g.open; }, 8000);
      });
    });
  }

  function ensurePano() {
    if (typeof global.PanoEng !== 'undefined' && global.PanoEng.open) {
      return Promise.resolve(global.PanoEng);
    }
    return loadScript('js/pano-engine.js', 'pano-engine').then(function () {
      return waitGlobal('PanoEng', function (g) { return !!g.open; }, 8000);
    }).catch(function () {
      delete loaded['pano-engine'];
      delete loading['pano-engine'];
      var urls = candidateUrls('js/pano-engine.js');
      return injectOne(urls[0] || 'js/pano-engine.js?v=' + CACHE_V, 'pano-engine').then(function () {
        return waitGlobal('PanoEng', function (g) { return !!g.open; }, 8000);
      });
    });
  }

  function ensurePdf() {
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf);
    var p1 = loadScript(
      'js/vendor/jspdf.umd.min.js?v=20261015-meta6',
      'jspdf'
    );
    var p2 = p1.then(function () {
      return loadScript(
        'js/vendor/jspdf-autotable.min.js?v=20261015-meta6',
        'jspdf-autotable'
      );
    });
    return p2.then(function () {
      if (typeof global.museLoadInterVfs === 'function') {
        return global.museLoadInterVfs().then(function () { return global.jspdf; }).catch(function () { return global.jspdf; });
      }
      return global.jspdf;
    });
  }

  function ensureFuse() {
    if (typeof global.Fuse !== 'undefined') return Promise.resolve(global.Fuse);
    return loadScript('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js', 'fuse').then(function () {
      return global.Fuse;
    });
  }

  // Truck telemetry (ThingsBoard) is only used by Broadcast Ops; load it first, never on the critical path.
  function ensureTB() {
    if (typeof global.MuseThingsBoard !== 'undefined') return Promise.resolve(global.MuseThingsBoard);
    return loadScript('js/muse-thingsboard.js', 'muse-thingsboard').then(function () { return global.MuseThingsBoard; }).catch(function () { return null; });
  }
  function ensureBOps() {
    if (typeof global.MuseBOps !== 'undefined' && global.MuseBOps.opsPaneHTML) {
      return Promise.resolve(global.MuseBOps);
    }
    return ensureTB().then(function () { return loadScript('js/muse-broadcast-ops.js', 'muse-broadcast-ops'); }).then(function () {
      if (typeof global.MuseBOps === 'undefined') throw new Error('MuseBOps missing after load');
      try {
        if (global.MuseBOps.seedShowcase) global.MuseBOps.seedShowcase();
      } catch (e) {}
      return global.MuseBOps;
    });
  }

  // Guided tour: deferred until someone actually takes it (?tour=, the
  // profile button, or the home button). Lazy scripts skip the static ?v tag,
  // so stamp the running build's tag — js/* ships immutable-cached.
  function versioned(rel) {
    try {
      var scripts = document.querySelectorAll ? document.querySelectorAll('script[src*="?v="]') : [];
      for (var i = 0; i < scripts.length; i++) {
        var m = /(\?v=[A-Za-z0-9-]+)/.exec(scripts[i].getAttribute('src') || '');
        if (m) return rel + m[1];
      }
    } catch (e) {}
    return rel;
  }
  function tourWanted() {
    try {
      if (/[?&]tour=(1|auto)\b/.test(location.search || '')) return true;
      if (global.sessionStorage && global.sessionStorage.getItem('muse_tour')) return true;
    } catch (e) {}
    return false;
  }
  function ensureTour() {
    if (typeof global.MuseTour !== 'undefined') return Promise.resolve(global.MuseTour);
    return loadScript(versioned('js/muse-tour.js'), 'muse-tour').then(function () { return global.MuseTour || null; }).catch(function () { return null; });
  }

  global.MuseLazy = {
    version: '1.5.0',
    ensureCad: ensureCad,
    ensurePano: ensurePano,
    ensurePdf: ensurePdf,
    ensureFuse: ensureFuse,
    ensureBOps: ensureBOps,
    ensureTB: ensureTB,
    ensureTour: ensureTour,
    loadScript: loadScript,
    candidateUrls: candidateUrls,
    abs: abs,
    _tourWanted: tourWanted,
    _versioned: versioned
  };

  // The tour's own boot (query param / session flag) lives in the tour module;
  // kick the load here so ?tour=auto still works with no static script tag.
  try { if (tourWanted()) ensureTour(); } catch (e) {}
})(typeof window !== 'undefined' ? window : global);

