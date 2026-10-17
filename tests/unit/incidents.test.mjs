import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

const productions = { raybangen3: { name: 'Ray-Ban Meta Gen 3 Launch', venue: 'NYC Harbor Remote · Pier 26' }, museaitour: { name: 'Muse AI World Tour 2026' } };
const SEV = (s) => +String(s).replace(/\D/g, '');

test('"what happened at Rayban" finds the Ray-Ban incidents, most severe first', () => {
  const w = loadBrowserModule('js/muse-incidents.js', { productions, order: Object.keys(productions) });
  const hits = w.MuseIncidents.search('rayban');
  assert.ok(hits.length >= 1, 'no hits');
  assert.ok(hits.every((i) => i.production === 'raybangen3'), 'non Ray-Ban hit');
  for (let i = 1; i < hits.length; i++) assert.ok(SEV(hits[i - 1].severity) <= SEV(hits[i].severity), 'not sorted by severity');
});
test('filters narrow by severity and status', () => {
  const w = loadBrowserModule('js/muse-incidents.js', { productions, order: Object.keys(productions) });
  const all = w.MuseIncidents.search('', {});
  const sev2 = w.MuseIncidents.search('', { severity: 'SEV-2' });
  assert.ok(sev2.length >= 1 && sev2.length < all.length);
  assert.ok(sev2.every((i) => i.severity === 'SEV-2'));
});
