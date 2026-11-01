import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, takeToken, sessionKey, fetchWithHeaderTimeout } from '../../functions/api/museai.js';
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

test('BUG-02: guests charge only the guest counter, so the team keeps its budget', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }), { headers: { 'Content-Type': 'application/json' } });
  try {
    const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_DAILY_TOKEN_CAP: '10000', MUSE_GUEST_DAILY_TOKEN_CAP: '10000' };
    const TEAM = { u: 'team', n: 'Muse Live team', r: 'admin' };
    const call = (user) => onRequestPost(ctx('/api/museai', { method: 'POST', body, env, user }));
    assert.equal((await call(GUEST)).status, 200);
    assert.equal((await call(GUEST)).status, 200);
    assert.equal((await call(GUEST)).status, 200);
    assert.equal((await call(GUEST)).status, 429); // guest slice exhausted
    const teamKey = 'museai:tokens:' + day;
    assert.ok(!Number(await env.MUSE_KV.get(teamKey, 'json')), 'guest spend leaked into the team counter');
    assert.equal((await call(TEAM)).status, 200); // team budget untouched
  } finally { globalThis.fetch = realFetch; }
});
test('BUG-02: the rate-limit key comes from the verified session, not the raw cookie', () => {
  const req = (cookie) => new Request('https://muse.test/api/museai', { headers: { Cookie: cookie } });
  const a = sessionKey(req('muse_session=token-aaaaaaaaaaaaaaaaaaaaaaaa'), GUEST);
  const b = sessionKey(req('muse_session=completely-different-token-value'), GUEST);
  assert.equal(a, b);
  assert.ok(!a.includes('token'), 'key must not be derived from cookie bytes: ' + a);
});
test('BUG-15: the model timeout covers headers only, never a streaming body', async () => {
  // Slow headers must still time out.
  await assert.rejects(
    fetchWithHeaderTimeout('https://model.test/v1/chat/completions', {}, 30, async () => {
      await new Promise((r) => setTimeout(r, 120));
      return new Response('late', { status: 200 });
    }),
  );
  // Fast headers with a slow body must complete: no whole-stream abort.
  const slowBody = new ReadableStream({
    async start(c) {
      c.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'));
      await new Promise((r) => setTimeout(r, 120));
      c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      c.close();
    },
  });
  const res = await fetchWithHeaderTimeout('https://model.test/v1/chat/completions', {}, 30, async () => new Response(slowBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /DONE/);
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
