import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, takeToken } from '../../functions/api/museai.js';
import { memoryKV, ctx } from './helpers.mjs';

const GUEST = { u: 'guest', n: 'Guest reviewer', r: 'viewer' };
const day = new Date().toISOString().slice(0, 10);
const guestKey = 'museai:tokens:' + day + ':guest';
const body = { messages: [{ role: 'user', content: 'hi' }] };
const post = (env, fetchImpl, cookie) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  const p = onRequestPost(ctx('/api/museai', { method: 'POST', body, env, user: GUEST, headers: { Cookie: cookie } }));
  return p.finally(() => { globalThis.fetch = realFetch; });
};

test('guest pre-charge is refunded when upstream fails', async () => {
  const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() };
  const failFetch = () => Promise.reject(new Error('boom'));
  const errFetch = () => Promise.resolve(new Response(JSON.stringify({ error: { message: 'bad' } }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }));

  assert.equal((await post(env, failFetch, 'muse_session=refund-a')).status, 502);
  assert.equal((await post(env, errFetch, 'muse_session=refund-b')).status, 502);
  assert.equal(await env.MUSE_KV.get(guestKey, 'json'), 0);
});

test('takeToken consumes one token and exhausts with KV and without', async () => {
  for (const withKV of [true, false]) {
    const env = withKV ? { MUSE_KV: memoryKV(), MUSE_RATE_PER_MIN: '3' } : { MUSE_RATE_PER_MIN: '3' };
    const sk = 's:take-' + withKV;
    assert.deepEqual(await takeToken(env, sk, false), { ok: true, retryS: 0 });
    assert.deepEqual(await takeToken(env, sk, false), { ok: true, retryS: 0 });
    assert.deepEqual(await takeToken(env, sk, false), { ok: true, retryS: 0 });
    const last = await takeToken(env, sk, false);
    assert.equal(last.ok, false);
    assert.ok(last.retryS > 0);
    if (withKV) {
      const stored = await env.MUSE_KV.get('museai:rl:' + sk, 'json');
      assert.ok(stored && stored.t < 1);
    }
  }
});

test('takeToken survives a lost KV race without double-charging', async () => {
  // A racing writer overwrites the bucket between our write and confirm: the
  // retry must adopt the winner's state and still admit exactly one token.
  let fired = false;
  const store = new Map([['museai:rl:s:race', JSON.stringify({ t: 3, at: Date.now() })]]);
  const kv = {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) {
      store.set(k, v);
      if (!fired) { fired = true; store.set(k, JSON.stringify({ t: 0, at: Date.now() })); } // racer drains it after our write
    },
  };
  const r = await takeToken({ MUSE_KV: kv, MUSE_RATE_PER_MIN: '3' }, 's:race', false);
  assert.equal(r.ok, false); // winner's drained state is honoured, no phantom token
});
