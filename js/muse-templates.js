/* Project templates — build only what the show needs.
   A template toggles modules per production: the UI, schedule checks,
   equipment lists, and Show Caller scope all follow it. Disabled modules
   hide, they never delete — switching template restores every record.
   Unassigned productions run the full stack, so existing shows and the
   frozen demo build behave exactly as before. */
(function (root) {
  'use strict';

  var LS_KEY = 'muselive_templates_v1';

  // Module ids. Department ids match production dept rows; system ids
  // match the readers Show Caller runs.
  var MODULES = [
    'audio', 'cameras', 'transmission', 'power', 'engineering',
    'replay', 'graphics', 'comms', 'rf', 'talent', 'legal',
    'schedule', 'streams', 'incidents', 'crew', 'equipment', 'ops'
  ];
  var DEPT_MODULE = {
    'Audio': 'audio', 'Cameras / Video': 'cameras', 'Transmission / Signal': 'transmission',
    'Power / Electrical': 'power', 'Engineering / CAD': 'engineering', 'Replay / EVS': 'replay',
    'Graphics (GFX)': 'graphics', 'Comms & IFB': 'comms', 'RF / Wireless Mics': 'rf',
    'Talent / Production': 'talent', 'Legal / Rights': 'legal'
  };
  var CORE = ['schedule', 'incidents', 'crew', 'ops'];

  function withCore(list) {
    var out = list.slice();
    CORE.forEach(function (m) { if (out.indexOf(m) < 0) out.push(m); });
    return out;
  }

  var TEMPLATES = {
    'audio-only': { id: 'audio-only', label: 'Audio-only', modules: withCore(['audio', 'comms', 'rf', 'talent']) },
    'audio-replay': { id: 'audio-replay', label: 'Audio + replay', modules: withCore(['audio', 'comms', 'rf', 'talent', 'replay', 'graphics']) },
    'eng': { id: 'eng', label: 'ENG single-camera', modules: withCore(['cameras', 'audio', 'transmission', 'power', 'comms', 'rf', 'talent', 'equipment', 'streams']) },
    'remi': { id: 'remi', label: 'REMI / remote production', modules: MODULES.slice() },
    'studio': { id: 'studio', label: 'Studio show', modules: withCore(['cameras', 'audio', 'transmission', 'power', 'engineering', 'replay', 'graphics', 'comms', 'rf', 'talent', 'legal', 'equipment', 'streams']) }
  };
  var DEFAULT_ID = 'remi';

  function store() {
    try { var s = JSON.parse(root.localStorage.getItem(LS_KEY) || 'null'); if (s && typeof s === 'object') return s; } catch (e) {}
    return {};
  }
  function saveStore(s) { try { root.localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} }
  function clean(list) {
    var out = [];
    (list || []).forEach(function (m) { if (MODULES.indexOf(m) >= 0 && out.indexOf(m) < 0) out.push(m); });
    return out;
  }

  function list() { return Object.keys(TEMPLATES).map(function (k) { return { id: TEMPLATES[k].id, label: TEMPLATES[k].label, modules: TEMPLATES[k].modules.slice() }; }); }
  function get(id) { var t = TEMPLATES[id]; return t ? { id: t.id, label: t.label, modules: t.modules.slice() } : null; }

  // Assignment for one production: {template, modules} — modules is the
  // resolved set (custom assignments carry their own list).
  function forProduction(key) {
    var a = store()[key];
    if (a && a.template === 'custom' && Array.isArray(a.modules)) return { template: 'custom', label: 'Custom', modules: clean(a.modules) };
    if (a && TEMPLATES[a.template]) { var t = TEMPLATES[a.template]; return { template: t.id, label: t.label, modules: t.modules.slice() }; }
    var d = TEMPLATES[DEFAULT_ID];
    return { template: d.id, label: d.label, modules: d.modules.slice(), implicit: true };
  }
  function modulesFor(key) { return forProduction(key).modules; }
  function enabled(key, mod) { return modulesFor(key).indexOf(mod) >= 0; }

  // Hide, never delete: the production record is not touched.
  function setTemplate(key, id) {
    if (!TEMPLATES[id]) return { ok: false, error: 'Unknown template ' + id + '.' };
    var s = store(); s[key] = { template: id }; saveStore(s);
    return { ok: true, template: id };
  }
  function setCustom(key, list) {
    var mods = clean(list);
    if (!mods.length) return { ok: false, error: 'A custom template needs at least one module.' };
    var s = store(); s[key] = { template: 'custom', modules: mods }; saveStore(s);
    return { ok: true, template: 'custom', modules: mods.slice() };
  }
  function clear(key) { var s = store(); delete s[key]; saveStore(s); return { ok: true }; }

  // UI helper: dept rows visible under the production's template.
  function visibleDepts(prod, key) {
    var on = modulesFor(key);
    return ((prod && prod.dept) || []).filter(function (row) {
      var m = DEPT_MODULE[row[0]];
      return !m || on.indexOf(m) >= 0;
    });
  }

  /* ---------- create-flow picker ----------
     Lives only inside the New Project modal (#np_templateHost): it exists
     when a production is being created and nowhere else. The selection is
     pending state until Create is pressed; applyToNew() then stores it
     against the new production key. Hidden modules keep their data — the
     picker never deletes a record. */
  var MOD_LABEL = { audio: 'Audio', cameras: 'Cameras', transmission: 'Transmission', power: 'Power', engineering: 'Engineering', replay: 'Replay', graphics: 'Graphics', comms: 'Comms & IFB', rf: 'RF', talent: 'Talent', legal: 'Legal', schedule: 'Schedule', streams: 'Streams', incidents: 'Incidents', crew: 'Crew', equipment: 'Equipment', ops: 'Ops' };

  var pendingId = DEFAULT_ID, pendingMods = TEMPLATES[DEFAULT_ID].modules.slice();
  function resetCreate() { pendingId = DEFAULT_ID; pendingMods = TEMPLATES[DEFAULT_ID].modules.slice(); }
  function pending() { return { template: pendingId, modules: pendingMods.slice() }; }

  function createHTML() {
    var tplOpts = list().map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (pendingId === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>';
    }).join('') + '<option value="custom"' + (pendingId === 'custom' ? ' selected' : '') + '>Custom</option>';
    var boxes = MODULES.map(function (m) {
      var checked = pendingMods.indexOf(m) >= 0;
      return '<label class="ax-chip">'
        + '<input type="checkbox" data-tpl-mod="' + esc(m) + '"' + (checked ? ' checked' : '') + ' onchange="MuseTemplates.onCreateToggle(this)">'
        + esc(MOD_LABEL[m] || m) + '</label>';
    }).join('');
    var deptOn = MODULES.filter(function (m) { return pendingMods.indexOf(m) >= 0 && Object.keys(DEPT_MODULE).some(function (d) { return DEPT_MODULE[d] === m; }); }).length;
    return '<div class="flex flex-wrap items-end gap-3">'
      + '<label class="block"><span class="ax-label">Template</span>'
      + '<select id="np_template" class="ax-select" onchange="MuseTemplates.onCreatePick(this)">' + tplOpts + '</select></label>'
      + '<span class="ax-note" style="padding-bottom:8px">' + pendingMods.length + '/' + MODULES.length + ' modules in scope · ' + deptOn + ' department groups</span>'
      + '</div>'
      + '<div class="flex flex-wrap gap-1.5 mt-3" role="group" aria-label="Modules in scope">' + boxes + '</div>'
      + '<p class="ax-note">Toggling a module switches to Custom. Show Caller will only read modules in scope for this production.</p>';
  }
  function renderCreatePicker() {
    var host = root.document && root.document.getElementById ? root.document.getElementById('np_templateHost') : null;
    if (!host) return { ok: false, error: 'No np_templateHost element.' };
    host.innerHTML = createHTML();
    return { ok: true };
  }
  // Store the pending selection against a freshly created production.
  function applyToNew(key) {
    if (!key) return { ok: false, error: 'No production key.' };
    var r = pendingId === 'custom' ? setCustom(key, pendingMods) : setTemplate(key, pendingId);
    resetCreate();
    return r;
  }

  root.MuseTemplates = { version: '0.3.0', MODULES: MODULES.slice(), DEPT_MODULE: Object.assign({}, DEPT_MODULE),
    list: list, get: get, forProduction: forProduction, modulesFor: modulesFor, enabled: enabled,
    setTemplate: setTemplate, setCustom: setCustom, clear: clear, visibleDepts: visibleDepts,
    createHTML: createHTML, renderCreatePicker: renderCreatePicker, pending: pending, resetCreate: resetCreate, applyToNew: applyToNew,
    onCreatePick: function (sel) {
      if (!sel) return;
      if (sel.value === 'custom') { pendingId = 'custom'; }
      else if (TEMPLATES[sel.value]) { pendingId = sel.value; pendingMods = TEMPLATES[sel.value].modules.slice(); }
      renderCreatePicker();
    },
    onCreateToggle: function (box) {
      if (!box) return;
      var m = box.getAttribute('data-tpl-mod');
      pendingMods = box.checked ? clean(pendingMods.concat([m])) : pendingMods.filter(function (x) { return x !== m; });
      if (!pendingMods.length) pendingMods = [m];
      pendingId = 'custom';
      renderCreatePicker();
    } };
})(typeof window !== 'undefined' ? window : globalThis);
