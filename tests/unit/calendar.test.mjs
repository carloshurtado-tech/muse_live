import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/calendar.js';
import { memoryKV, memoryD1, ctx } from './helpers.mjs';

const WRITER = { u: 'ana@meta.com', n: 'Ana', r: 'engineer' };
const GUEST = { u: 'guest', n: 'Guest reviewer', r: 'viewer' };
const SNAP = {
  v: 2, resources: [{ id: 'pcr1', name: 'PCR 1' }], prods: { demo: 'Demo Show' }, venues: {},
  bookings: [{ id: 'b1', res: 'pcr1', prod: 'demo', title: 'Tech check', start: '2026-11-05T14:00:00Z', end: '2026-11-05T15:00:00Z', status: 'Confirmed' }],
};
function calEnv() {
  return { MUSE_KV: memoryKV(), MUSE_D1: memoryD1(), MUSE_FEED_SECRET: 'feed-secret-for-tests' };
}
async function seed(kv) { await kv.put('calendar:schedule', JSON.stringify(SNAP)); }

test('BUG-27: only writers mint feed links; guests get 403; the public feed still verifies tokens', async () => {
  const env = calEnv(); await seed(env.MUSE_KV);
  assert.equal((await onRequest(ctx('/api/calendar?sign=1', { env, user: GUEST }))).status, 403);
  assert.equal((await onRequest(ctx('/api/calendar?sign=1', { env, user: null }))).status, 401);
  const signed = await onRequest(ctx('/api/calendar?sign=1', { env, user: WRITER }));
  assert.equal(signed.status, 200);
  const feedUrl = (await signed.json()).url;
  assert.ok(feedUrl.includes('token='), feedUrl);
  const feed = await onRequest(ctx(feedUrl, { env, user: null }));
  assert.equal(feed.status, 200);
  assert.match(await feed.text(), /Tech check/);
  const bad = await onRequest(ctx('/api/calendar?token=bogus-token-value', { env, user: null }));
  assert.equal(bad.status, 403);
});

test('BUG-27: a minted link expires and is then rejected', async () => {
  const env = calEnv(); await seed(env.MUSE_KV);
  const signed = await onRequest(ctx('/api/calendar?sign=1', { env, user: WRITER }));
  const feedUrl = (await signed.json()).url;
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 40 * 24 * 3600 * 1000;
    assert.equal((await onRequest(ctx(feedUrl, { env, user: null }))).status, 403);
  } finally { Date.now = realNow; }
  assert.equal((await onRequest(ctx(feedUrl, { env, user: null }))).status, 200);
});

test('BUG-33: calendar POST requires a writer and a same-origin request', async () => {
  const env = calEnv();
  const body = JSON.stringify(SNAP);
  const post = (user, headers = {}) => onRequest(ctx('/api/calendar', { method: 'POST', body, env, user, headers }));
  assert.equal((await post(GUEST)).status, 403);
  assert.equal((await post(WRITER, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(WRITER)).status, 200);
});
