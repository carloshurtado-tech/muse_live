import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadBrowserModule, ROOT } from './helpers.mjs';
import path from 'node:path';

function win(extra = {}) {
  const w = loadBrowserModule('js/muse-assets.js', {
    productions: { demo: { name: 'Demo Show', venue: 'Harbor Lights', customer: 'Example Co', vendors: [{ id: 'v1' }] } },
    order: ['demo'],
    MuseSchedule: { byProduction: () => [{ id: 'b1', title: 'Keynote uplink', res: 'CRK 4', location: 'Studio M1' }] },
    MuseStreaming: { stateOf: () => 'LIVE' },
    MuseIncidents: { byProduction: () => [{ id: 'INC-9', title: 'Encoder dropped', severity: 'SEV-2' }] },
    museaiCrewFull: () => [{ pos: 'A1', name: 'Maya Chen' }, { pos: 'A2', name: '' }],
    museaiPacklist: () => [{ name: 'Encoder', serial: 'ENC-0042', status: 'Draft' }],
    vendors: [{ id: 'v1', name: 'Lens & Friends', category: 'Lenses', contact: 'Dana Pratt', email: 'ops@example.com' }],
    comms: [{ id: 'MSG-1', channel: 'slack', subject: 'Keynote fix', body: 'encoder moved', linkId: 'demo', linkType: 'production' }],
    ...extra,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/muse-utils.js'), 'utf8'), w, { filename: 'js/muse-utils.js' });
  return w;
}

test('graph gathers every area under one key and errors on unknown shows', () => {
  const A = win().MuseAssets;
  const g = A.graph('demo');
  assert.equal(g.show, 'Demo Show');
  assert.equal(g.schedule.length, 1);
  assert.equal(g.streams.state, 'LIVE');
  assert.equal(g.incidents.length, 1);
  assert.equal(g.crew.length, 2);
  assert.equal(g.equipment.length, 1);
  assert.equal(g.vendors[0].name, 'Lens & Friends');
  assert.equal(g.comms.length, 1);
  assert.ok(A.graph('nope').error);
  assert.equal(A.counts('demo').crew, 2);
});

test('graph is read-only and survives missing modules', () => {
  const w = loadBrowserModule('js/muse-assets.js', { productions: { demo: { name: 'Demo' } }, order: ['demo'] });
  const g = JSON.parse(JSON.stringify(w.MuseAssets.graph('demo')));
  assert.deepEqual(g.schedule, []);
  assert.deepEqual(g.incidents, []);
  assert.deepEqual(g.vendors, []);
  assert.equal(JSON.parse(JSON.stringify(w.MuseAssets.search('demo'))).filter((h) => h.kind === 'show').length, 1);
});

test('global results section escapes hostile names and routes clicks', () => {
  const w = win({ museaiCrewFull: () => [{ pos: 'A1', name: '"><img src=x onerror=alert(1)>' }] });
  const T = w.MuseAssets;
  const html = T.globalResultsHTML('img');
  assert.ok(html.includes('Linked assets'), 'section missing');
  assert.ok(!html.includes('<img src=x'), 'unescaped name in results');
  assert.equal(T.globalResultsHTML(''), '');
  assert.equal(T.globalResultsHTML('zzz-no-match'), '');
  const opened = [];
  w.openProject = (k) => { opened.push(['project', k]); };
  w.switchView = (v) => { opened.push(['view', v]); };
  T.openHitEl({ getAttribute: (a) => (a === 'data-kind' ? 'person' : 'demo') });
  T.openHitEl({ getAttribute: (a) => (a === 'data-kind' ? 'vendor' : '') });
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), JSON.parse(JSON.stringify([['project', 'demo'], ['view', 'vendors']])));
});

test('search finds people, serials, venues, and incidents with the show attached', () => {
  const A = win().MuseAssets;
  assert.ok(A.search('maya').some((h) => h.kind === 'person' && h.show === 'demo'), 'person hit missing');
  assert.ok(A.search('enc-0042').some((h) => h.kind === 'gear' && h.show === 'demo'), 'serial hit missing');
  assert.ok(A.search('harbor').some((h) => h.kind === 'show' && h.show === 'demo'), 'venue hit missing');
  assert.ok(A.search('encoder dropped').some((h) => h.kind === 'incident' && h.show === 'demo'), 'incident hit missing');
  assert.ok(A.search('lens').some((h) => h.kind === 'vendor'), 'vendor hit missing');
  assert.ok(A.search('keynote fix').some((h) => h.kind === 'comms' && h.show === 'demo'), 'comms hit missing');
  assert.deepEqual(JSON.parse(JSON.stringify(A.search(''))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(A.search('   '))), []);
  for (const h of A.search('e')) assert.ok(h.show !== undefined && h.title, 'hit without show/title: ' + JSON.stringify(h));
});
