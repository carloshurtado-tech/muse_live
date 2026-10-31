import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/museai.js';
import { memoryKV, ctx } from './helpers.mjs';

const GUEST = { u: 'guest', n: 'Guest reviewer', r: 'viewer' };
const TEAM = { u: 'team', n: 'Muse Live team', r: 'admin' };

test('guest Muse: effort dropped, output capped, charged before the call, size and daily cap enforced', async () => {
  const sent = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_GUEST_DAILY_TOKEN_CAP: '10000' };
    const body = { messages: [{ role: 'user', content: 'What happened at the Ray-Ban event?' }], effort: 'high' };
    const post = (b, user) => onRequestPost(ctx('/api/museai', { method: 'POST', body: b, env, user }));

    assert.equal((await post(body, TEAM)).status, 200);
    assert.equal(sent[0].reasoning_effort, 'high');
    assert.equal(sent[0].max_completion_tokens, 6000);

    // The cap has a 10,000-token floor; each guest call is charged ~4,000 before it runs.
    assert.equal((await post(body, GUEST)).status, 200); // ~4k
    assert.equal(sent[1].reasoning_effort, 'low');
    assert.equal(sent[1].max_completion_tokens, 4000);
    assert.equal((await post(body, GUEST)).status, 200); // ~8k
    assert.equal((await post(body, GUEST)).status, 200); // ~8k < 10k passes, total ~12k
    assert.equal((await post(body, GUEST)).status, 429); // refused without calling the model
    assert.equal(sent.length, 4);

    const big = { messages: [{ role: 'user', content: 'x'.repeat(210_000) }] };
    assert.equal((await post(big, GUEST)).status, 429); // capped already; the size check sits behind the cap
    const env2 = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_GUEST_DAILY_TOKEN_CAP: '9999999' };
    const r = await onRequestPost(ctx('/api/museai', { method: 'POST', body: big, env: env2, user: GUEST, headers: { 'CF-Connecting-IP': '203.0.113.9' } }));
    assert.equal(r.status, 413);
    assert.equal(sent.length, 4);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Muse checks origin and content-type before the model, and pins the API base', async () => {
  const sent = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push(String(url));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { total_tokens: 1 } }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const body = { messages: [{ role: 'user', content: 'hi' }] };
    const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() };
    assert.equal((await onRequestPost(ctx('/api/museai', { method: 'POST', body, env, user: TEAM, headers: { Origin: 'https://evil.example' } }))).status, 403);
    const plain = new Request('https://muse.test/api/museai', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal((await onRequestPost({ request: plain, env, params: {}, data: { user: TEAM }, next: async () => new Response('NEXT') })).status, 415);
    // Evil base fails closed without calling upstream.
    const evilEnv = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_API_BASE: 'https://evil.example/v1' };
    const refused = await onRequestPost(ctx('/api/museai', { method: 'POST', body, env: evilEnv, user: TEAM }));
    assert.equal(refused.status, 503);
    assert.equal(sent.length, 0);
    // Allowlisted override is honoured.
    const okEnv = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_API_BASE: 'https://models.example.com/v1', MUSE_API_BASE_ALLOWLIST: 'models.example.com' };
    assert.equal((await onRequestPost(ctx('/api/museai', { method: 'POST', body, env: okEnv, user: TEAM }))).status, 200);
    assert.ok(sent[0].startsWith('https://models.example.com/v1/chat/completions'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('model tools include live test-feed telemetry', async () => {
  let tools = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    tools = JSON.parse(init.body).tools;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { total_tokens: 1 } }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() };
    const body = { messages: [{ role: 'user', content: 'how are the test feeds?' }] };
    assert.equal((await onRequestPost(ctx('/api/museai', { method: 'POST', body, env, user: TEAM }))).status, 200);
    const feed = (tools || []).find((t) => t.function && t.function.name === 'get_feed_status');
    assert.ok(feed, 'get_feed_status missing from the tool surface');
    assert.ok(feed.function.parameters.properties.feed, 'optional feed narrow is missing');
  } finally {
    globalThis.fetch = realFetch;
  }
});
