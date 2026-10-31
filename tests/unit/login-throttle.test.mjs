import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, loginTake } from '../../functions/_middleware.js';
import { sha256hex } from '../../functions/_lib/session.js';
import { memoryKV, ctx } from './helpers.mjs';

const PW = 'local-test-password';
async function env(extra = {}) { return { MUSE_PASSWORD_HASH: await sha256hex('muse-live:' + PW), SESSION_SECRET: 's', MUSE_KV: memoryKV(), ...extra }; }

test('loginTake admits 10 per minute, then reports a retry delay', async () => {
  const e = await env();
  const key = '203.0.113.7|-';
  for (let i = 0; i < 10; i++) assert.equal(await loginTake(e, key), 0);
  assert.ok((await loginTake(e, key)) > 0);
});

test('loginTake persists the bucket in MUSE_KV so isolates share it', async () => {
  const e = await env();
  const key = '203.0.113.8|-';
  assert.equal(await loginTake(e, key), 0);
  const stored = await e.MUSE_KV.get('login:rl:' + key, 'json');
  assert.ok(stored && typeof stored.t === 'number' && stored.t < 10);

  // A fresh isolate (empty memory map entry) still sees the shared bucket: seed it exhausted.
  const kv = e.MUSE_KV;
  await kv.put('login:rl:203.0.113.9|-', JSON.stringify({ t: 0, at: Date.now() }));
  assert.ok((await loginTake(e, '203.0.113.9|-')) > 0);
});

test('loginTake falls back to memory without MUSE_KV instead of failing open', async () => {
  const e = await env({ MUSE_KV: undefined });
  const key = '203.0.113.10|-';
  for (let i = 0; i < 10; i++) assert.equal(await loginTake(e, key), 0);
  assert.ok((await loginTake(e, key)) > 0);
});

test('guest logins share one throttle: 10 ok, 11th → 429 with Retry semantics', async () => {
  const e = await env();
  const headers = { 'X-Forwarded-For': '203.0.113.11' };
  for (let i = 0; i < 10; i++) {
    assert.equal((await onRequest(ctx('/api/auth/guest', { method: 'POST', body: {}, env: e, headers }))).status, 200);
  }
  assert.equal((await onRequest(ctx('/api/auth/guest', { method: 'POST', body: {}, env: e, headers }))).status, 429);
});
