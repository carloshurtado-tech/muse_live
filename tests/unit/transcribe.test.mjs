import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/transcribe.js';
import { memoryKV, memoryD1, ctx } from './helpers.mjs';

const TEAM = { u: 'team', n: 'Muse Live team', r: 'admin' };
const VIEWER = { u: 'guest', n: 'Guest reviewer', r: 'viewer' };
// Minimal RIFF header + 1k of samples; the endpoint checks the magic only.
const WAV = Buffer.from('RIFF....WAVE' + 'A'.repeat(1000)).toString('base64');
const day = () => new Date().toISOString().slice(0, 10);

function mockFetch(body, status = 200) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push(String(url)); return new Response(JSON.stringify(body), { status }); };
  return { calls, done() { globalThis.fetch = real; } };
}

test('transcribe: relays the clip and returns the transcript', async () => {
  const m = mockFetch({ sessionId: 's', transcript: 'hello world', audioDurationMs: 1000, turns: [] });
  try {
    const db = memoryD1();
    const r = await onRequestPost(ctx('/api/transcribe', { method: 'POST', env: { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_D1: db }, user: TEAM, body: { audio: WAV } }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, transcript: 'hello world', final: true });
    assert.equal(m.calls[0], 'https://api.meta.ai/v1/asr/transcribe');
    assert.ok(db.tables.auditLog.some((e) => e.action === 'showcaller.transcribe'));
  } finally { m.done(); }
});

test('transcribe: non-WAV and oversize clips never reach the model', async () => {
  const m = mockFetch({ transcript: 'x' });
  try {
    const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() };
    const notWav = Buffer.from('NOTA....WAVE' + 'A'.repeat(1000)).toString('base64');
    assert.equal((await onRequestPost(ctx('/api/transcribe', { method: 'POST', env, user: TEAM, body: { audio: notWav } }))).status, 400);
    assert.equal((await onRequestPost(ctx('/api/transcribe', { method: 'POST', env, user: TEAM, body: { audio: 'AAAA' } }))).status, 400);
    assert.equal((await onRequestPost(ctx('/api/transcribe', { method: 'POST', env, user: TEAM, body: { audio: 'A'.repeat(11000000) } }))).status, 400);
    assert.equal((await onRequestPost(ctx('/api/transcribe', { method: 'POST', env, user: VIEWER, body: { audio: WAV } }))).status, 403);
    assert.equal((await onRequestPost(ctx('/api/transcribe', { method: 'POST', env: {}, user: TEAM, body: { audio: WAV } }))).status, 503);
    assert.equal(m.calls.length, 0);
  } finally { m.done(); }
});

test('BUG-28: transcribe honours the mock model base, rate limit and daily budget', async () => {
  const m = mockFetch({ sessionId: 's', transcript: 'hello world', audioDurationMs: 1000, turns: [] });
  try {
    const mockEnv = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_API_BASE: 'http://127.0.0.1:8799/v1' };
    const r0 = await onRequestPost(ctx('/api/transcribe', { method: 'POST', env: mockEnv, user: TEAM, body: { audio: WAV } }));
    assert.equal(r0.status, 200);
    assert.equal(m.calls[0], 'http://127.0.0.1:8799/v1/asr/transcribe');
    const evilEnv = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_API_BASE: 'https://evil.example/v1' };
    assert.equal((await onRequestPost(ctx('/api/transcribe', { method: 'POST', env: evilEnv, user: TEAM, body: { audio: WAV } }))).status, 503);
    assert.equal(m.calls.length, 1);
    const rlEnv = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_RATE_PER_MIN: '2' };
    const RLUSER = { u: 'rl@meta.com', n: 'RL', r: 'engineer' };
    const call = () => onRequestPost(ctx('/api/transcribe', { method: 'POST', env: rlEnv, user: RLUSER, body: { audio: WAV } }));
    assert.equal((await call()).status, 200);
    assert.equal((await call()).status, 200);
    assert.equal((await call()).status, 429);
    assert.equal(m.calls.length, 3);
    const cappedKv = memoryKV();
    await cappedKv.put('museai:tokens:' + day(), JSON.stringify(10000));
    const capEnv = { MODEL_API_KEY: 'k', MUSE_KV: cappedKv, MUSE_DAILY_TOKEN_CAP: '10000' };
    assert.equal((await onRequestPost(ctx('/api/transcribe', { method: 'POST', env: capEnv, user: TEAM, body: { audio: WAV } }))).status, 429);
    assert.equal(m.calls.length, 3);
  } finally { m.done(); }
});
test('transcribe: empty transcript is a failed 502, not an empty caption', async () => {
  const m = mockFetch({ sessionId: 's', transcript: '', audioDurationMs: 1000, turns: [] });
  try {
    const r = await onRequestPost(ctx('/api/transcribe', { method: 'POST', env: { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() }, user: TEAM, body: { audio: WAV } }));
    assert.equal(r.status, 502);
    assert.equal((await r.json()).ok, false);
  } finally { m.done(); }
});
