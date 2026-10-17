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
