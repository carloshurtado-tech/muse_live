import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadBrowserModule, ROOT } from './helpers.mjs';
import path from 'node:path';

function win(extra = {}) {
  const w = loadBrowserModule('js/muse-templates.js', extra);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/muse-utils.js'), 'utf8'), w, { filename: 'js/muse-utils.js' });
  return w;
}

test('catalogue lists the five named templates plus full-stack default', () => {
  const T = win().MuseTemplates;
  const ids = T.list().map((t) => t.id);
  assert.deepEqual(JSON.parse(JSON.stringify(ids)), JSON.parse(JSON.stringify(['audio-only', 'audio-replay', 'eng', 'remi', 'studio'])));
  assert.equal(T.get('remi').modules.length, T.MODULES.length);
  assert.equal(T.get('nope'), null);
});

test('audio-only has no cameras or streams; every template keeps the core', () => {
  const T = win().MuseTemplates;
  const a = T.get('audio-only').modules;
  assert.ok(!a.includes('cameras') && !a.includes('streams') && !a.includes('replay'));
  assert.ok(a.includes('audio') && a.includes('comms'));
  for (const t of T.list()) for (const c of ['schedule', 'incidents', 'crew', 'ops']) assert.ok(t.modules.includes(c), t.id + ' missing core ' + c);
});

test('unassigned production runs the full stack (frozen behaviour unchanged)', () => {
  const T = win().MuseTemplates;
  const f = T.forProduction('anything');
  assert.equal(f.template, 'remi');
  assert.equal(f.implicit, true);
  assert.equal(T.enabled('anything', 'cameras'), true);
});

test('setTemplate scopes modules and never mutates the production record', () => {
  const w = win();
  const T = w.MuseTemplates;
  const prod = { name: 'Show', dept: [['Audio', 'approved', 'x'], ['Cameras / Video', 'approved', 'y'], ['Replay / EVS', 'pending', 'z']] };
  const before = JSON.stringify(prod);
  assert.equal(T.setTemplate('show1', 'audio-only').ok, true);
  assert.equal(T.enabled('show1', 'cameras'), false);
  assert.equal(T.enabled('show1', 'audio'), true);
  assert.equal(JSON.stringify(prod), before, 'production record mutated');
  assert.deepEqual(T.visibleDepts(prod, 'show1').map((r) => r[0]), ['Audio']);
  assert.equal(T.setTemplate('show1', 'bogus').ok, false);
  T.clear('show1');
  assert.equal(T.enabled('show1', 'cameras'), true, 'clear did not restore full stack');
});

test('custom template keeps only known modules and restores on template switch', () => {
  const T = win().MuseTemplates;
  const r = T.setCustom('show2', ['audio', 'cameras', 'bogus', 'audio']);
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(r.modules)), JSON.parse(JSON.stringify(['audio', 'cameras'])));
  assert.equal(T.forProduction('show2').template, 'custom');
  assert.equal(T.setCustom('show2', []).ok, false);
  T.setTemplate('show2', 'studio');
  assert.equal(T.enabled('show2', 'replay'), true);
});

test('create picker defaults to full stack and applyToNew stores the pending pick', () => {
  const T = win().MuseTemplates;
  const html = T.createHTML();
  assert.ok(html.includes('Audio-only') && html.includes('Custom') && html.includes('id="np_template"'));
  assert.equal((html.match(/data-tpl-mod=/g) || []).length, T.MODULES.length);
  assert.equal(T.pending().template, 'remi');
  // Pick audio-only through the real handler shape (no host element in the sandbox: render is a no-op there).
  T.onCreatePick({ value: 'audio-only' });
  assert.equal(T.pending().template, 'audio-only');
  assert.ok(!T.pending().modules.includes('cameras'));
  const r = T.applyToNew('newshow');
  assert.equal(r.ok, true);
  assert.equal(T.forProduction('newshow').template, 'audio-only');
  assert.equal(T.enabled('newshow', 'cameras'), false);
  assert.equal(T.pending().template, 'remi', 'pending state did not reset after create');
});

test('create toggle switches to Custom and never leaves zero modules', () => {
  const T = win().MuseTemplates;
  T.resetCreate();
  T.onCreateToggle({ checked: false, getAttribute: () => 'cameras' });
  assert.equal(T.pending().template, 'custom');
  assert.ok(!T.pending().modules.includes('cameras'));
  for (const m of T.MODULES) T.onCreateToggle({ checked: false, getAttribute: () => m });
  assert.equal(T.pending().modules.length, 1, 'picker allowed an empty scope');
});

test('Show Caller brief and propose respect template scope', () => {
  // One problem per area; audio-only scope must hide stream/equipment risks.
  const g = {
    productions: { demo: { name: 'Demo Show', tab: 'Demo' } }, order: ['demo'],
    MuseSchedule: { byProduction: () => [], conflicts: () => [], ruleFindings: () => [] },
    MuseStreaming: { stateOf: () => 'LIVE', health: () => ({ state: 'LIVE', alerts: [{ text: 'SRT loss' }] }), anomalies: () => [] },
    MuseIncidents: { byProduction: () => [] },
    museaiCrewFull: () => [{ pos: 'A1', name: 'Sam' }],
    museaiPacklist: () => [{ name: 'Enc', status: 'Draft' }, { name: 'Cable', status: 'Draft' }],
    buildMuseAiContext: () => JSON.stringify({ ops_backbone: {} }),
  };
  const tw = loadBrowserModule('js/muse-templates.js', g);
  tw.MuseTemplates.setTemplate('demo', 'audio-only');
  // Share storage + templates with the Show Caller window.
  const sc = loadBrowserModule('js/muse-showcaller.js', { ...g, MuseTemplates: tw.MuseTemplates, localStorage: tw.localStorage });
  const b = sc.MuseShowCaller.brief('demo');
  assert.ok(!b.risks.some((r) => r.area === 'streams'), 'stream risk leaked into audio-only scope: ' + JSON.stringify(b.risks));
  assert.ok(!b.risks.some((r) => r.area === 'equipment'), 'equipment risk leaked into audio-only scope');
  const p = sc.MuseShowCaller.propose('demo');
  assert.equal(p.plans.filter((x) => x.area === 'equipment').length, 0);
});
