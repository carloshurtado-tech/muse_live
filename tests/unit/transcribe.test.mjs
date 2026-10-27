import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/transcribe.js';
import { memoryKV, ctx } from './helpers.mjs';

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
    const kv = memoryKV();
    const r = await onRequestPost(ctx('/api/transcribe', { method: 'POST', env: { MODEL_API_KEY: 'k', MUSE_KV: kv }, user: TEAM, body: { audio: WAV } }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, transcript: 'hello world', final: true });
    assert.equal(m.calls[0], 'https://api.meta.ai/v1/asr/transcribe');
    assert.ok((await kv.get('audit:' + day(), { type: 'json' })).some((e) => e.action === 'showcaller.transcribe'));
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

test('transcribe: empty transcript is a failed 502, not an empty caption', async () => {
  const m = mockFetch({ sessionId: 's', transcript: '', audioDurationMs: 1000, turns: [] });
  try {
    const r = await onRequestPost(ctx('/api/transcribe', { method: 'POST', env: { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() }, user: TEAM, body: { audio: WAV } }));
    assert.equal(r.status, 502);
    assert.equal((await r.json()).ok, false);
  } finally { m.done(); }
});
