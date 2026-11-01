import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/observe.js';
import { memoryKV, ctx } from './helpers.mjs';

test('aggregates errors by signature, views, features and Muse counts (never question text)', async () => {
  const env = { MUSE_KV: memoryKV() }, user = { u: 'ana@meta.com', r: 'engineer' };
  const events = [
    { t: 'session' }, { t: 'view', v: 'streams' }, { t: 'view', v: 'streams' }, { t: 'feature', f: 'downloadTechbook' },
    { t: 'muse', k: 'asked', q: 'secret question text' },
    { t: 'error', msg: 'TypeError: x is undefined', src: '/js/muse-app-b.min.js:1' }, { t: 'error', msg: 'TypeError: x is undefined', src: '/js/muse-app-b.min.js:1' },
  ];
  assert.equal((await onRequest(ctx('/api/observe', { method: 'POST', body: { events }, env, user }))).status, 200);
  const day = new Date().toISOString().slice(0, 10);
  const agg = await env.MUSE_KV.get('obs:' + day, 'json');
  assert.equal(agg.sessions, 1); assert.equal(agg.views.streams, 2); assert.equal(agg.features.downloadTechbook, 1); assert.equal(agg.muse.asked, 1);
  assert.equal(Object.values(agg.errors)[0].count, 2);
  assert.ok(!JSON.stringify(agg).includes('secret question text'));
  // reading the aggregate is admin-only
  assert.equal((await onRequest(ctx('/api/observe', { env, user }))).status, 403);
  assert.equal((await onRequest(ctx('/api/observe', { env, user: { u: 'team', r: 'admin' } }))).status, 200);
});
test('BUG-32: viewer (guest) events are dropped and cannot create health groups', async () => {
  const env = { MUSE_KV: memoryKV() };
  const guest = { u: 'guest', n: 'Guest reviewer', r: 'viewer' };
  const forged = [{ t: 'error', msg: 'Forged guest failure', src: '/js/fake.js:1' }, { t: 'view', v: 'streams' }, { t: 'session' }];
  const r = await onRequest(ctx('/api/observe', { method: 'POST', body: { events: forged }, env, user: guest }));
  assert.equal(r.status, 200);
  const day = new Date().toISOString().slice(0, 10);
  const agg = await env.MUSE_KV.get('obs:' + day, 'json');
  assert.ok(!agg || !Object.keys(agg.errors || {}).some((k) => k.includes('Forged')), 'guest error created a health group');
  assert.ok(!agg || !(agg.views && agg.views.streams), 'guest view was aggregated');
  // The admin read shape is unchanged.
  const read = await onRequest(ctx('/api/observe', { env, user: { u: 'team', r: 'admin' } }));
  assert.equal(read.status, 200);
  const j = await read.json();
  assert.equal(j.ok, true); assert.ok('date' in j && 'data' in j);
});
