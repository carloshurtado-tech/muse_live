import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

test('MuseSync stays local when signed out and maps localStorage keys to valid KV keys', async () => {
  const w = loadBrowserModule('js/muse-sync.js', { Storage: function Storage() {}, fetch: () => Promise.reject(new Error('no network in unit tests')), performance: { now: () => 0 }, sessionStorage: { getItem: () => null, setItem() {} } });
  assert.equal(typeof w.MuseSync.put, 'function');
  assert.equal(w.MuseSync.status().enabled, false);
  assert.equal(w.MuseSync._kvKey('muselive_incidents_v1'), 'ls-muselive_incidents_v1');
  assert.match(w.MuseSync._kvKey('Weird Key!'), /^[a-z0-9_-]{1,64}$/);
  assert.equal(await w.MuseSync.get('live-status'), null);
});
