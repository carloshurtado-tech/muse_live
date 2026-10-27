/* Asset intelligence — one linked graph, not silos.
   Change one record and every linked view reads it. The graph gathers what
   each show already holds (schedule, streams, incidents, crew, equipment,
   vendors, comms) under one key, and search() finds a person, a serial, a
   venue, or an incident with the linked show attached to every hit.
   Read-only: this module never writes a record. */
(function (root) {
  'use strict';

  function prods() { return root.productions || {}; }
  function has(fn) { return typeof fn === 'function'; }
  function cap(a, n) { a = a || []; return a.slice(0, n); }
  function low(s) { return String(s == null ? '' : s).toLowerCase(); }

  function byProduction(list, key) {
    return (list || []).filter(function (x) {
      if (!x || typeof x !== 'object') return false;
      return x.key === key || x.prod === key || x.production === key ||
        (x.linkType === 'production' && x.linkId === key);
    });
  }

  // One graph per show: every area gathered under the same key.
  function graph(key) {
    var p = prods()[key];
    if (!p) return { error: 'No show matches "' + key + '"' };
    var g = { key: key, show: p.name || key };
    try { g.schedule = root.MuseSchedule && has(root.MuseSchedule.byProduction) ? root.MuseSchedule.byProduction(key) : []; }
    catch (e) { g.schedule = []; }
    try { g.streams = root.MuseStreaming && has(root.MuseStreaming.stateOf) ? { state: root.MuseStreaming.stateOf(key) } : null; }
    catch (e) { g.streams = null; }
    try { g.incidents = root.MuseIncidents && has(root.MuseIncidents.byProduction) ? root.MuseIncidents.byProduction(key) : []; }
    catch (e) { g.incidents = []; }
    try { g.crew = has(root.museaiCrewFull) ? (root.museaiCrewFull(key) || []) : []; }
    catch (e) { g.crew = []; }
    try { g.equipment = has(root.museaiPacklist) ? (root.museaiPacklist(p, 1000) || []) : []; }
    catch (e) { g.equipment = []; }
    try {
      var allV = root.vendors || [];
      g.vendors = (p.vendors || []).map(function (ref) {
        var id = ref && ref.id ? ref.id : ref;
        var full = null;
        for (var i = 0; i < allV.length; i++) if (allV[i].id === id) full = allV[i];
        return full || ref;
      });
    } catch (e) { g.vendors = []; }
    try { g.comms = byProduction(root.comms, key); } catch (e) { g.comms = []; }
    return g;
  }

  function counts(key) {
    var g = graph(key);
    if (g.error) return g;
    return { key: key,
      schedule: (g.schedule || []).length, incidents: (g.incidents || []).length,
      crew: (g.crew || []).length, equipment: (g.equipment || []).length,
      vendors: (g.vendors || []).length, comms: (g.comms || []).length };
  }

  // Unified search: people, serials, venues, incidents — every hit names its show.
  function search(q) {
    q = low(q).trim();
    if (!q) return [];
    var out = [];
    function hit(kind, show, id, title, detail) {
      if (out.length < 50) out.push({ kind: kind, show: show, id: id, title: title, detail: detail || '' });
    }
    Object.keys(prods()).forEach(function (key) {
      var p = prods()[key], name = p.name || key;
      if (low(name).indexOf(q) >= 0 || low(p.venue).indexOf(q) >= 0 || low(p.customer).indexOf(q) >= 0)
        hit('show', key, key, name, p.venue || '');
      var sch = [];
      try { sch = root.MuseSchedule && has(root.MuseSchedule.byProduction) ? root.MuseSchedule.byProduction(key) : []; } catch (e) {}
      sch.forEach(function (b, i) {
        var t = low(b.title || b.name || b.activity || '') + ' ' + low(b.res || b.location || '');
        if (t.indexOf(q) >= 0) hit('booking', key, b.id || ('row-' + i), b.title || b.name || b.activity || 'booking', b.res || b.location || '');
      });
      var inc = [];
      try { inc = root.MuseIncidents && has(root.MuseIncidents.byProduction) ? root.MuseIncidents.byProduction(key) : []; } catch (e) {}
      inc.forEach(function (r) {
        if ((low(r.id) + ' ' + low(r.title)).indexOf(q) >= 0) hit('incident', key, r.id, r.title || r.id, r.severity || '');
      });
      var crew = [];
      try { crew = has(root.museaiCrewFull) ? (root.museaiCrewFull(key) || []) : []; } catch (e) {}
      crew.forEach(function (c) {
        if ((low(c.name) + ' ' + low(c.pos)).indexOf(q) >= 0) hit('person', key, c.name || c.pos, c.name || c.pos, c.pos || '');
      });
      var eq = [];
      try { eq = has(root.museaiPacklist) ? (root.museaiPacklist(p, 1000) || []) : []; } catch (e) {}
      eq.forEach(function (it, i) {
        if ((low(it.name) + ' ' + low(it.serial) + ' ' + low(it.status)).indexOf(q) >= 0)
          hit('gear', key, it.serial || it.name || ('item-' + i), it.name || it.serial || 'gear', it.status || '');
      });
    });
    (root.vendors || []).forEach(function (v) {
      if ((low(v.name) + ' ' + low(v.category) + ' ' + low(v.contact) + ' ' + low(v.email)).indexOf(q) >= 0)
        hit('vendor', '', v.id, v.name || v.id, v.category || '');
    });
    byProductionAll().forEach(function (m) {
      if ((low(m.subject) + ' ' + low(m.body)).indexOf(q) >= 0)
        hit('comms', m.linkId || '', m.id, m.subject || m.channel || 'message', m.channel || '');
    });
    return out;
  }
  function byProductionAll() {
    try { return root.comms || []; } catch (e) { return []; }
  }

  var KIND_LABEL = { show: 'Show', booking: 'Booking', incident: 'Incident', person: 'Person', gear: 'Gear', vendor: 'Vendor', comms: 'Message' };
  // Section appended to the global search results: one linked graph,
  // not a second search box. Every hit names its show; a click opens it.
  function globalResultsHTML(q) {
    var hits = [];
    try { hits = search(q); } catch (e) { return ''; }
    if (!hits.length) return '';
    var rows = hits.slice(0, 12).map(function (h) {
      return '<button data-kind="' + esc(h.kind) + '" data-show="' + esc(h.show) + '" data-id="' + esc(h.id) + '" onclick="MuseAssets.openHitEl(this)"'
        + ' class="w-full text-left flex items-center gap-3 px-2 py-2 group" style="border-radius:var(--ax-radius-element)" onmouseover="this.style.background=\'var(--ax-accent-muted)\'" onmouseout="this.style.background=\'\'">'
        + '<span class="ax-kind">' + esc(KIND_LABEL[h.kind] || h.kind) + '</span>'
        + '<div class="min-w-0 flex-1"><p class="truncate" style="font:600 12px var(--ax-font);color:var(--ax-text-primary)">' + esc(h.title) + '</p>'
        + '<p class="truncate" style="font:400 9px var(--ax-font);color:var(--ax-text-secondary)">' + esc((h.show ? h.show + ' · ' : '') + h.detail) + '</p></div>'
        + '<svg style="flex-shrink:0;color:var(--ax-text-disabled)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>';
    }).join('');
    return '<div class="px-2 pt-2"><p class="px-2 mb-1" style="font:800 8px var(--ax-font);letter-spacing:.06em;text-transform:uppercase;color:var(--ax-text-disabled)">Linked assets (' + hits.length + (hits.length > 12 ? ', top 12' : '') + ')</p>' + rows + '</div>';
  }
  function openHitEl(el) {
    if (!el) return;
    var kind = el.getAttribute('data-kind'), show = el.getAttribute('data-show');
    try {
      if (kind === 'vendor' && show === '' && typeof root.switchView === 'function') { root.switchView('vendors'); return; }
      if (show && typeof root.openProject === 'function') root.openProject(show);
    } catch (e) {}
  }

  root.MuseAssets = { version: '0.2.0', graph: graph, counts: counts, search: search,
    globalResultsHTML: globalResultsHTML, openHitEl: openHitEl };

  // Wrap the existing global search so asset hits ride along — no second box.
  try {
    if (typeof root.globalSearchRender === 'function' && !root.globalSearchRender.__assetsWrapped) {
      var origSearch = root.globalSearchRender;
      var wrapped = function (q) {
        var r = origSearch(q);
        try {
          var box = root.document && root.document.getElementById ? root.document.getElementById('gsResults') : null;
          if (box && box.insertAdjacentHTML && String(q || '').trim()) box.insertAdjacentHTML('beforeend', globalResultsHTML(q));
        } catch (e) {}
        return r;
      };
      wrapped.__assetsWrapped = true;
      root.globalSearchRender = wrapped;
    } else if (root.document && root.document.addEventListener) {
      // App scripts not yet evaluated (test harness): wrap on first use.
      root.document.addEventListener('DOMContentLoaded', function () {
        try {
          if (typeof root.globalSearchRender === 'function' && !root.globalSearchRender.__assetsWrapped) {
            var o = root.globalSearchRender;
            var w = function (q) { var r = o(q); try { var b = root.document.getElementById('gsResults'); if (b && String(q || '').trim()) b.insertAdjacentHTML('beforeend', globalResultsHTML(q)); } catch (e) {} return r; };
            w.__assetsWrapped = true;
            root.globalSearchRender = w;
          }
        } catch (e) {}
      });
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
