import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadBrowserModule, ROOT } from './helpers.mjs';
import path from 'node:path';

function win(extra = {}) {
  const w = loadBrowserModule('js/muse-survey.js', {
    productions: { demo: { name: 'Demo Show', survey: {} } },
    order: ['demo'],
    ...extra,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/muse-utils.js'), 'utf8'), w, { filename: 'js/muse-utils.js' });
  return w;
}

test('record initialises empty and rejects unknown shows', () => {
  const S = win().MuseSurvey;
  const r = S.record('demo');
  assert.equal(r.show, 'Demo Show');
  assert.deepEqual(JSON.parse(JSON.stringify(S.counts('demo'))),
    { key: 'demo', photos: 0, pins: 0, openPins: 0, dangling: 0, notes: 0, openNotes: 0, log: 0 });
  assert.ok(S.record('nope').error);
});

test('checklist writes structured values and logs the change', () => {
  const S = win().MuseSurvey;
  assert.equal(S.setCheck('demo', 'power', 'tie-in amps', 400).ok, true);
  assert.equal(S.setCheck('demo', 'bogus', 'x', 1).ok, false);
  assert.equal(S.setCheck('demo', 'power', '', 1).ok, false);
  assert.equal(S.record('demo').checklist.power['tie-in amps'], 400);
  const h = S.history('demo');
  assert.ok(h.some((e) => e.action === 'checklist' && /tie-in amps/.test(e.detail)), 'checklist change not logged');
  assert.ok(h[0].ts && h[0].by, 'log entry missing actor/timestamp');
});

test('photos carry GPS, timestamps, and Ray-Ban source attribution', () => {
  const S = win().MuseSurvey;
  assert.equal(S.addPhoto('demo', {}).ok, false);
  const r = S.addPhoto('demo', { src: 'img1', caption: 'Load-in', lat: 37.7, lng: -122.4, source: 'rayban' });
  assert.equal(r.ok, true);
  const ph = S.record('demo').photos[0];
  assert.equal(ph.source, 'rayban');
  assert.equal(ph.lat, 37.7);
  assert.ok(ph.ts && ph.by);
  assert.equal(S.addPhoto('demo', { src: 'img2' }).ok, true);
  assert.equal(S.record('demo').photos[0].source, 'walk', 'default source is the walk');
  assert.equal(S.removePhoto('demo', 'nope').ok, false);
  assert.equal(S.removePhoto('demo', r.id).ok, true);
  const h = S.history('demo');
  assert.ok(h.some((e) => e.action === 'photo' && /Ray-Ban/.test(e.detail)), 'glasses capture not attributed in log');
});

test('pins link to records and unlinked open pins are flagged', () => {
  const S = win().MuseSurvey;
  assert.equal(S.addPin('demo', {}).ok, false);
  const linked = S.addPin('demo', { label: 'Fiber demarc', category: 'network', link: { kind: 'asset', id: 'ENC-1' } });
  const loose = S.addPin('demo', { label: 'Mystery hatch' });
  assert.equal(linked.ok && loose.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(S.record('demo').pins.find((p) => p.id === linked.id).style)), { color: '#00a99d', shape: 'square' });
  assert.deepEqual(JSON.parse(JSON.stringify(S.dangling('demo').map((p) => p.id))), [loose.id]);
  assert.equal(S.setPinStatus('demo', loose.id, 'bogus').ok, false);
  assert.equal(S.setPinStatus('demo', loose.id, 'closed').ok, true);
  assert.deepEqual(S.dangling('demo').length, 0, 'closed pins are not flagged');
  assert.equal(S.updatePin('demo', loose.id, { link: { kind: 'risk', id: 'R-2' } }).ok, true);
  assert.equal(S.updatePin('demo', 'nope', {}).ok, false);
  assert.equal(S.removePin('demo', loose.id).ok, true);
  assert.equal(S.removePin('demo', loose.id).ok, false);
  const h = S.history('demo');
  for (const a of ['pin', 'pin-close', 'pin-edit', 'pin-remove']) assert.ok(h.some((e) => e.action === a), a + ' not logged');
});

test('rich-text notes render a safe subset and resolve like findings', () => {
  const S = win().MuseSurvey;
  assert.equal(S.addNote('demo', '   ').ok, false);
  const r = S.addNote('demo', '**Power** tie-in at *dock 3*\n- 400A 3-phase\n- UPS `A`');
  assert.equal(r.ok, true);
  const html = S.renderRich('**Power** tie-in at *dock 3*\n- 400A 3-phase\n- UPS `A`');
  assert.ok(html.includes('<strong>Power</strong>') && html.includes('<em>dock 3</em>') && html.includes('<ul><li>'), 'subset not rendered: ' + html);
  const evil = S.renderRich('<script>alert(1)</script> **[x](javascript:.)**');
  assert.ok(!evil.includes('<script>') && evil.includes('&lt;script&gt;'), 'markup not escaped: ' + evil);
  assert.equal(S.setNoteStatus('demo', r.id, 'bogus').ok, false);
  assert.equal(S.setNoteStatus('demo', r.id, 'resolved').ok, true);
  assert.equal(S.record('demo').notes[0].history.length, 2);
  assert.equal(S.setNoteStatus('demo', r.id, 'open').ok, true);
  assert.equal(S.editNote('demo', r.id, 'Updated **text**').ok, true);
  assert.ok(S.record('demo').notes[0].html.includes('<strong>text</strong>'));
  assert.equal(S.editNote('demo', 'nope', 'x').ok, false);
  const h = S.history('demo');
  for (const a of ['note', 'note-resolve', 'note-reopen', 'note-edit']) assert.ok(h.some((e) => e.action === a), a + ' not logged');
});

test('history caps and newest-first order hold under volume', () => {
  const S = win().MuseSurvey;
  for (let i = 0; i < 5; i++) S.addNote('demo', 'note ' + i);
  const h = S.history('demo', 2);
  assert.equal(h.length, 2);
  assert.ok(new Date(h[0].ts) >= new Date(h[1].ts), 'history not newest-first');
  assert.deepEqual(S.counts('demo').notes, 5);
});
