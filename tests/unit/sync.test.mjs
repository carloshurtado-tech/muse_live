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

test('reads are conditional: second GET sends If-None-Match, 304 resolves unchanged', async () => {
  const seen = [];
  const doc = { readyState: 'complete', cookie: 'muse_authed=1', addEventListener() {}, getElementById: () => null, hidden: false };
  const fetch = (url, init) => {
    if (String(url).includes('/api/auth/me')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ user: { email: 'ana@meta.com', role: 'engineer' } }) });
    seen.push([String(url), (init && init.headers) || {}]);
    if (String(url).includes('/api/kv/')) {
      const inm = (init && init.headers && init.headers['If-None-Match']) || '';
      if (inm === '"123"') return Promise.resolve({ status: 304, ok: false, headers: { get: () => null } });
      return Promise.resolve({ status: 200, ok: true, headers: { get: (h) => (h === 'X-Muse-Updated' ? '123' : null) }, json: () => Promise.resolve({ v: 1 }) });
    }
    return Promise.reject(new Error('unexpected ' + url));
  };
  const w = loadBrowserModule('js/muse-sync.js', {
    Storage: function Storage() {}, fetch, performance: { now: () => 0 },
    sessionStorage: { getItem: () => null, setItem() {} }, document: doc,
  });
  await w.MuseSync.ready;
  assert.equal(w.MuseSync.status().enabled, true);
  const first = await w.MuseSync.get('k1');
  assert.deepEqual(JSON.parse(JSON.stringify(first)), { v: 1 });
  const second = await w.MuseSync.get('k1');
  assert.deepEqual(JSON.parse(JSON.stringify(second)), { __unchanged: true });
  const k1 = seen.filter(([u]) => u.includes('/api/kv/k1'));
  assert.equal(k1.length, 2);
  assert.equal(k1[0][1]['If-None-Match'], undefined);
  assert.equal(k1[1][1]['If-None-Match'], '"123"');
});
