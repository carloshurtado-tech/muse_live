/* Site Survey v2 — the record a richer 360 and an engineer-grade CAD read through.
   The old survey holds seeded galleries and free-text notes. This record holds
   what a walk actually produces: a structured checklist per area, photos with
   GPS/time/source (first-person Ray-Ban captures import as source 'rayban'),
   category pins that link to the asset, incident, or risk they are about
   (a pin that links to nothing is flagged, never silently dead), and rich-text
   notes with resolve/reopen. EVERY mutation appends to the per-show activity
   log — actor, timestamp, action, detail — so no survey update is silent.
   Read-only where it must be: the module never edits geometry, drawings, or
   any record outside the survey. Persistence rides the app's existing save
   path (best-effort stampEdit); the record itself is plain data. */
(function (root) {
  'use strict';

  var LOG_CAP = 300, NOTE_CAP = 500, PIN_CAP = 500, PHOTO_CAP = 300;
  var SEQ = 0;

  var PIN_STYLE = {
    camera: { color: '#0866ff', shape: 'circle' }, power: { color: '#f5832a', shape: 'square' },
    network: { color: '#00a99d', shape: 'square' }, audio: { color: '#7a3efe', shape: 'circle' },
    ifb: { color: '#7a3efe', shape: 'diamond' }, cable: { color: '#65676b', shape: 'line' },
    access: { color: '#1e7b34', shape: 'circle' }, hazard: { color: '#e41e3f', shape: 'triangle' },
    rigging: { color: '#b24a00', shape: 'triangle' }, rf: { color: '#d1005c', shape: 'diamond' }
  };
  var CHECK_AREAS = ['power', 'network', 'rf', 'access', 'rigging', 'parking', 'security'];
  var PHOTO_SOURCES = ['walk', 'rayban', 'upload'];

  function prods() { return root.productions || {}; }
  function actor() {
    try {
      if (typeof root.permUser === 'function' && root.permUser()) return String(root.permUser());
      var p = prods();
      var k = (root.order || Object.keys(p))[0];
      if (k && p[k] && p[k].editedBy) return p[k].editedBy;
    } catch (e) {}
    return 'survey';
  }
  function stamp(key) { try { if (typeof root.stampEdit === 'function') root.stampEdit(key); } catch (e) {} }
  // Record lives on the production survey so the app's save path keeps it.
  function record(key) {
    var p = prods()[key];
    if (!p) return { error: 'No show matches "' + key + '"' };
    var s = null;
    try { s = (typeof root.getSurvey === 'function') ? root.getSurvey(key) : (p.survey || (p.survey = {})); }
    catch (e) { s = p.survey || (p.survey = {}); }
    if (!s.v2) s.v2 = { checklist: {}, photos: [], pins: [], notes: [], log: [] };
    var v = s.v2;
    if (!v.checklist) v.checklist = {};
    if (!v.photos) v.photos = [];
    if (!v.pins) v.pins = [];
    if (!v.notes) v.notes = [];
    if (!v.log) v.log = [];
    return { key: key, show: p.name || key, v: v };
  }
  function get(key) {
    var r = record(key);
    if (r.error) return r;
    return { key: key, show: r.show, checklist: r.v.checklist, photos: r.v.photos.slice(),
      pins: r.v.pins.slice(), notes: r.v.notes.slice(), log: r.v.log.slice() };
  }

  /* ---------- activity log: every mutation lands here ---------- */
  function log(key, action, detail) {
    var r = record(key);
    if (r.error) return r;
    SEQ += 1;
    r.v.log.unshift({ id: 'SVL-' + Date.now().toString(36) + '-' + SEQ, ts: new Date().toISOString(),
      by: actor(), action: String(action || ''), detail: String(detail == null ? '' : detail).slice(0, 500) });
    r.v.log = r.v.log.slice(0, LOG_CAP);
    stamp(key);
    return { ok: true };
  }
  function history(key, n) {
    var r = record(key);
    if (r.error) return [];
    return r.v.log.slice(0, Math.max(0, n == null ? 50 : n));
  }

  /* ---------- checklist: structured inputs per walk area ---------- */
  function setCheck(key, area, item, value) {
    var r = record(key);
    if (r.error) return r;
    if (CHECK_AREAS.indexOf(area) < 0) return { ok: false, error: 'Unknown area ' + area + '.' };
    if (!item) return { ok: false, error: 'A checklist needs a named item.' };
    r.v.checklist[area] = r.v.checklist[area] || {};
    var before = r.v.checklist[area][item];
    r.v.checklist[area][item] = value;
    log(key, 'checklist', area + ' · ' + item + ': ' + JSON.stringify(before) + ' → ' + JSON.stringify(value));
    return { ok: true };
  }

  /* ---------- photos: GPS + time + source, Ray-Ban first-person included ---------- */
  function addPhoto(key, ph) {
    var r = record(key);
    if (r.error) return r;
    ph = ph || {};
    if (!ph.src) return { ok: false, error: 'A photo needs an image.' };
    var src = PHOTO_SOURCES.indexOf(ph.source) >= 0 ? ph.source : 'walk';
    SEQ += 1;
    var rec = { id: 'SVP-' + Date.now().toString(36) + '-' + SEQ, src: ph.src,
      caption: String(ph.caption || ''), lat: (typeof ph.lat === 'number' ? ph.lat : null),
      lng: (typeof ph.lng === 'number' ? ph.lng : null), ts: ph.ts || new Date().toISOString(),
      by: ph.by || actor(), source: src };
    r.v.photos.unshift(rec);
    r.v.photos = r.v.photos.slice(0, PHOTO_CAP);
    log(key, 'photo', (src === 'rayban' ? 'Ray-Ban capture · ' : '') + (rec.caption || rec.id));
    return { ok: true, id: rec.id };
  }
  function removePhoto(key, id) {
    var r = record(key);
    if (r.error) return r;
    var n = r.v.photos.length;
    r.v.photos = r.v.photos.filter(function (p) { return p.id !== id; });
    if (r.v.photos.length === n) return { ok: false, error: 'No photo ' + id + '.' };
    log(key, 'photo-remove', id);
    return { ok: true };
  }

  /* ---------- pins: categorised, linked, status-tracked ---------- */
  function pinStyle(category) { return PIN_STYLE[category] || { color: '#65676b', shape: 'circle' }; }
  function addPin(key, pin) {
    var r = record(key);
    if (r.error) return r;
    pin = pin || {};
    if (!pin.label) return { ok: false, error: 'A pin needs a label.' };
    var category = PIN_STYLE[pin.category] ? pin.category : 'access';
    SEQ += 1;
    var rec = { id: 'SVN-' + Date.now().toString(36) + '-' + SEQ, category: category,
      style: pinStyle(category), label: String(pin.label),
      note: String(pin.note || ''), owner: pin.owner || actor(),
      yaw: (typeof pin.yaw === 'number' ? pin.yaw : null), pitch: (typeof pin.pitch === 'number' ? pin.pitch : null),
      photo: pin.photo || null, link: (pin.link && pin.link.kind && pin.link.id) ? { kind: pin.link.kind, id: pin.link.id } : null,
      status: pin.status === 'closed' ? 'closed' : 'open', ts: new Date().toISOString(), by: actor() };
    r.v.pins.unshift(rec);
    r.v.pins = r.v.pins.slice(0, PIN_CAP);
    log(key, 'pin', category + ' · ' + rec.label + (rec.link ? ' → ' + rec.link.kind + ' ' + rec.link.id : ' · unlinked'));
    return { ok: true, id: rec.id };
  }
  function findPin(r, id) {
    for (var i = 0; i < r.v.pins.length; i++) if (r.v.pins[i].id === id) return r.v.pins[i];
    return null;
  }
  function updatePin(key, id, patch) {
    var r = record(key);
    if (r.error) return r;
    var p = findPin(r, id);
    if (!p) return { ok: false, error: 'No pin ' + id + '.' };
    patch = patch || {};
    ['label', 'note', 'owner', 'photo'].forEach(function (k) { if (patch[k] !== undefined) p[k] = patch[k]; });
    if (typeof patch.yaw === 'number') p.yaw = patch.yaw;
    if (typeof patch.pitch === 'number') p.pitch = patch.pitch;
    if (patch.category && PIN_STYLE[patch.category]) { p.category = patch.category; p.style = pinStyle(patch.category); }
    if (patch.link !== undefined) p.link = (patch.link && patch.link.kind && patch.link.id) ? { kind: patch.link.kind, id: patch.link.id } : null;
    log(key, 'pin-edit', p.label);
    return { ok: true };
  }
  function setPinStatus(key, id, status) {
    var r = record(key);
    if (r.error) return r;
    var p = findPin(r, id);
    if (!p) return { ok: false, error: 'No pin ' + id + '.' };
    if (status !== 'open' && status !== 'closed') return { ok: false, error: 'Status is open or closed.' };
    p.status = status;
    log(key, status === 'closed' ? 'pin-close' : 'pin-reopen', p.label);
    return { ok: true };
  }
  function removePin(key, id) {
    var r = record(key);
    if (r.error) return r;
    var p = findPin(r, id);
    if (!p) return { ok: false, error: 'No pin ' + id + '.' };
    r.v.pins = r.v.pins.filter(function (x) { return x.id !== id; });
    log(key, 'pin-remove', p.label);
    return { ok: true };
  }
  // A pin that links to nothing is flagged — dead pins rot into noise.
  function dangling(key) {
    var r = record(key);
    if (r.error) return [];
    return r.v.pins.filter(function (p) { return !p.link && p.status === 'open'; });
  }

  /* ---------- rich-text notes: a safe subset, resolved like findings ---------- */
  function renderRich(body) {
    var lines = String(body == null ? '' : body).split('\n');
    var html = [], list = [];
    function inline(s) {
      s = esc(s);
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
      return s;
    }
    lines.forEach(function (ln) {
      var m = /^\s*-\s+(.*)$/.exec(ln);
      if (m) { list.push('<li>' + inline(m[1]) + '</li>'); return; }
      if (list.length) { html.push('<ul>' + list.join('') + '</ul>'); list = []; }
      if (/^\s*$/.test(ln)) return;
      html.push('<p>' + inline(ln) + '</p>');
    });
    if (list.length) html.push('<ul>' + list.join('') + '</ul>');
    return html.join('');
  }
  function addNote(key, body) {
    var r = record(key);
    if (r.error) return r;
    if (!String(body || '').trim()) return { ok: false, error: 'A note needs text.' };
    SEQ += 1;
    var rec = { id: 'SVN-N' + Date.now().toString(36) + '-' + SEQ, body: String(body),
      html: renderRich(body), by: actor(), ts: new Date().toISOString(),
      status: 'open', history: [{ ts: new Date().toISOString(), by: actor(), action: 'created' }] };
    r.v.notes.unshift(rec);
    r.v.notes = r.v.notes.slice(0, NOTE_CAP);
    log(key, 'note', String(body).slice(0, 120));
    return { ok: true, id: rec.id };
  }
  function editNote(key, id, body) {
    var r = record(key);
    if (r.error) return r;
    var n = null;
    r.v.notes.forEach(function (x) { if (x.id === id) n = x; });
    if (!n) return { ok: false, error: 'No note ' + id + '.' };
    if (!String(body || '').trim()) return { ok: false, error: 'A note needs text.' };
    n.body = String(body);
    n.html = renderRich(body);
    n.history.push({ ts: new Date().toISOString(), by: actor(), action: 'edited' });
    log(key, 'note-edit', id);
    return { ok: true };
  }
  function setNoteStatus(key, id, status) {
    var r = record(key);
    if (r.error) return r;
    var n = null;
    r.v.notes.forEach(function (x) { if (x.id === id) n = x; });
    if (!n) return { ok: false, error: 'No note ' + id + '.' };
    if (status !== 'open' && status !== 'resolved') return { ok: false, error: 'Status is open or resolved.' };
    n.status = status;
    n.history.push({ ts: new Date().toISOString(), by: actor(), action: status });
    log(key, status === 'resolved' ? 'note-resolve' : 'note-reopen', id);
    return { ok: true };
  }

  function counts(key) {
    var r = record(key);
    if (r.error) return r;
    return { key: key, photos: r.v.photos.length, pins: r.v.pins.length,
      openPins: r.v.pins.filter(function (p) { return p.status === 'open'; }).length,
      dangling: dangling(key).length, notes: r.v.notes.length,
      openNotes: r.v.notes.filter(function (n) { return n.status === 'open'; }).length,
      log: r.v.log.length };
  }

  root.MuseSurvey = { version: '0.1.0', CHECK_AREAS: CHECK_AREAS.slice(), PIN_STYLE: JSON.parse(JSON.stringify(PIN_STYLE)),
    record: get, setCheck: setCheck, addPhoto: addPhoto, removePhoto: removePhoto,
    addPin: addPin, updatePin: updatePin, setPinStatus: setPinStatus, removePin: removePin,
    dangling: dangling, addNote: addNote, editNote: editNote, setNoteStatus: setNoteStatus,
    renderRich: renderRich, history: history, counts: counts };
})(typeof window !== 'undefined' ? window : globalThis);
