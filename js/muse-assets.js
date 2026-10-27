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

  /* ---------- asset register: QR-ready serials with a paper trail ----------
     The show packlists are per-show snapshots; the register is the cross-show
     truth: condition, firmware, maintenance due, who has it, and every
     checkout in a capped history. Persists in its own localStorage key and
     syncs to D1 when the binding exists (last-writer-wins per record). */
  var REG_KEY = 'muselive_asset_register_v1', VEN_KEY = 'muselive_vendor_extras_v1';
  var HIST_CAP = 100;
  var CONDITIONS = ['excellent', 'good', 'fair', 'needs-repair'];

  function regLoad() {
    try { var r = JSON.parse(root.localStorage.getItem(REG_KEY) || 'null'); if (r && r.assets) return r; } catch (e) {}
    return { assets: {} };
  }
  function regSave(r) { try { root.localStorage.setItem(REG_KEY, JSON.stringify(r)); } catch (e) {} }
  function venLoad() {
    try { var r = JSON.parse(root.localStorage.getItem(VEN_KEY) || 'null'); if (r && typeof r === 'object') return r; } catch (e) {}
    return {};
  }
  function venSave(r) { try { root.localStorage.setItem(VEN_KEY, JSON.stringify(r)); } catch (e) {} }
  function regActor() {
    try {
      if (typeof root.permUser === 'function' && root.permUser()) return String(root.permUser());
      if (root.CURRENT_USER && root.CURRENT_USER.name) return String(root.CURRENT_USER.name);
    } catch (e) {}
    return 'crew';
  }
  function hist(rec, action, detail) {
    rec.history = rec.history || [];
    rec.history.unshift({ ts: Date.now(), by: regActor(), action: action, detail: String(detail || '').slice(0, 300) });
    rec.history = rec.history.slice(0, HIST_CAP);
  }

  // Adopt a show's packlist serials into the register (idempotent by serial).
  function adoptFromPacklist(key) {
    var p = prods()[key];
    if (!p) return { ok: false, error: 'No show matches "' + key + '"' };
    var items = [];
    try { items = has(root.museaiPacklist) ? (root.museaiPacklist(p, 1000) || []) : []; } catch (e) {}
    var r = regLoad(), n = 0;
    items.forEach(function (it) {
      if (!it || !it.serial) return;
      if (!r.assets[it.serial]) {
        r.assets[it.serial] = { serial: it.serial, name: it.name || it.serial, category: 'gear',
          status: 'available', condition: '', firmware: '', location: '', maintenance_due: '',
          checked_out_to: '', checked_out_at: 0, updated: Date.now(), updated_by: regActor(), history: [] };
        hist(r.assets[it.serial], 'created', 'adopted from ' + key);
        n++;
      }
    });
    regSave(r);
    return { ok: true, adopted: n };
  }
  function registerList() {
    var r = regLoad();
    return Object.keys(r.assets).map(function (s) { return r.assets[s]; }).sort(function (a, b) { return String(a.serial).localeCompare(String(b.serial)); });
  }
  function registerGet(serial) {
    var rec = regLoad().assets[serial];
    return rec ? JSON.parse(JSON.stringify(rec)) : null;
  }
  function registerHistory(serial) {
    var rec = regLoad().assets[serial];
    return rec ? (rec.history || []).slice() : [];
  }
  function checkout(serial, to) {
    var r = regLoad(), rec = r.assets[serial];
    if (!rec) return { ok: false, error: 'No asset ' + serial + ' in the register.' };
    to = String(to || '');
    if (!to) return { ok: false, error: 'Checkout needs a destination (person or show).' };
    if (rec.status === 'checked-out') return { ok: false, error: 'Already checked out to ' + (rec.checked_out_to || 'someone') + '.' };
    rec.status = 'checked-out'; rec.checked_out_to = to; rec.checked_out_at = Date.now();
    rec.updated = Date.now(); rec.updated_by = regActor();
    hist(rec, 'checkout', '→ ' + to);
    regSave(r);
    return { ok: true };
  }
  function checkin(serial) {
    var r = regLoad(), rec = r.assets[serial];
    if (!rec) return { ok: false, error: 'No asset ' + serial + ' in the register.' };
    var from = rec.checked_out_to;
    rec.status = 'available'; rec.checked_out_to = ''; rec.checked_out_at = 0;
    rec.updated = Date.now(); rec.updated_by = regActor();
    hist(rec, 'checkin', '← ' + (from || 'field'));
    regSave(r);
    return { ok: true };
  }
  function setAssetField(serial, field, value, action) {
    var r = regLoad(), rec = r.assets[serial];
    if (!rec) return { ok: false, error: 'No asset ' + serial + ' in the register.' };
    rec[field] = value;
    rec.updated = Date.now(); rec.updated_by = regActor();
    hist(rec, action, String(value));
    regSave(r);
    return { ok: true };
  }
  function setCondition(serial, condition) {
    if (CONDITIONS.indexOf(condition) < 0) return { ok: false, error: 'Condition is ' + CONDITIONS.join(' | ') + '.' };
    return setAssetField(serial, 'condition', condition, 'condition');
  }
  function setMaintenance(serial, date) { return setAssetField(serial, 'maintenance_due', String(date || '').slice(0, 10), 'maintenance'); }
  function setFirmware(serial, v) { return setAssetField(serial, 'firmware', String(v || '').slice(0, 40), 'firmware'); }
  function addAssetNote(serial, text) {
    if (!String(text || '').trim()) return { ok: false, error: 'A note needs text.' };
    var r = regLoad(), rec = r.assets[serial];
    if (!rec) return { ok: false, error: 'No asset ' + serial + ' in the register.' };
    rec.updated = Date.now(); rec.updated_by = regActor();
    hist(rec, 'note', String(text).slice(0, 300));
    regSave(r);
    return { ok: true };
  }
  // Maintenance coming due within `days` (default 30), soonest first.
  function maintenanceDue(days) {
    var horizon = Date.now() + (days == null ? 30 : +days) * 864e5;
    return registerList().filter(function (a) {
      if (!a.maintenance_due) return false;
      var t = Date.parse(a.maintenance_due + 'T00:00:00');
      return !isNaN(t) && t <= horizon;
    }).sort(function (a, b) { return a.maintenance_due < b.maintenance_due ? -1 : 1; });
  }

  /* ---------- vendor CRM-lite: evidence, not memory ---------- */
  function vendorProfile(id) {
    var v = null;
    try { (root.vendors || []).forEach(function (x) { if (x.id === id) v = x; }); } catch (e) {}
    if (!v) return { error: 'No vendor ' + id + '.' };
    var pastShows = [];
    Object.keys(prods()).forEach(function (key) {
      var refs = (prods()[key].vendors || []);
      if (refs.some(function (r) { return (r && r.id ? r.id : r) === id; })) pastShows.push(key);
    });
    var comms = [];
    try {
      (root.comms || []).forEach(function (m) {
        var t = ((m.subject || '') + ' ' + (m.body || '')).toLowerCase();
        if ((v.name && t.indexOf(String(v.name).toLowerCase()) >= 0) || (v.email && v.email && t.indexOf(String(v.email).toLowerCase()) >= 0)) comms.push(m);
      });
    } catch (e) {}
    var extras = venLoad()[id] || { rates: [], reliability: '', notes: '' };
    return { id: id, name: v.name, category: v.category, contact: v.contact, email: v.email,
      pastShows: pastShows, comms: comms.slice(0, 50), extras: JSON.parse(JSON.stringify(extras)) };
  }
  function setVendorExtras(id, patch) {
    var all = venLoad();
    var cur = all[id] || { rates: [], reliability: '', notes: '' };
    if (patch && patch.rate != null && isFinite(+patch.rate)) cur.rates.push({ amount: +patch.rate, ts: Date.now(), by: regActor() });
    if (patch && patch.reliability !== undefined) cur.reliability = String(patch.reliability).slice(0, 500);
    if (patch && patch.notes !== undefined) cur.notes = String(patch.notes).slice(0, 2000);
    all[id] = cur;
    venSave(all);
    return { ok: true };
  }

  /* ---------- D1 sync: last-writer-wins per record ---------- */
  async function pushToServer() {
    try {
      var r = regLoad(), v = venLoad();
      var vendors = (root.vendors || []).map(function (x) {
        var ex = v[x.id] || {};
        return { id: x.id, name: x.name, category: x.category, contact: x.contact, email: x.email, reliability: ex.reliability, notes: ex.notes, updated: Date.now() };
      });
      var res = await root.fetch('/api/assets/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: Object.keys(r.assets).map(function (s) { return r.assets[s]; }), vendors: vendors }) });
      if (!res.ok) return { ok: false, error: 'Server refused the register (' + res.status + ').' };
      return await res.json();
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }
  async function pullFromServer() {
    try {
      var res = await root.fetch('/api/assets/sync');
      if (!res.ok) return { ok: false, error: 'Server refused (' + res.status + ').' };
      var body = await res.json();
      var r = regLoad();
      ((body && body.assets) || []).forEach(function (a) {
        var cur = r.assets[a.serial];
        if (!cur || (+a.updated || 0) > (+cur.updated || 0)) r.assets[a.serial] = a;
      });
      regSave(r);
      return { ok: true, assets: (body.assets || []).length, vendors: (body.vendors || []).length };
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }

  root.MuseAssets = { version: '0.3.0', graph: graph, counts: counts, search: search,
    globalResultsHTML: globalResultsHTML, openHitEl: openHitEl,
    adoptFromPacklist: adoptFromPacklist, registerList: registerList, registerGet: registerGet,
    registerHistory: registerHistory, checkout: checkout, checkin: checkin,
    setCondition: setCondition, setMaintenance: setMaintenance, setFirmware: setFirmware,
    addAssetNote: addAssetNote, maintenanceDue: maintenanceDue,
    vendorProfile: vendorProfile, setVendorExtras: setVendorExtras,
    pushToServer: pushToServer, pullFromServer: pullFromServer };

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
