import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/voice.js';
import { memoryKV, ctx } from './helpers.mjs';

function makeWav(seconds = 0.5, rate = 16000) {
  const samples = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const tag = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, samples * 2, true);
  return new Uint8Array(buf);
}
function voiceCtx(bodyBytes, { user, env, headers = {} }) {
  const request = new Request('https://muse.test/api/voice', { method: 'POST', headers, body: bodyBytes });
  return { request, env, params: {}, data: { user }, next: async () => new Response('NEXT') };
}
test('BUG-03/33: voice itself refuses viewers and foreign origins, and times out upstream', async () => {
  const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() };
  const viewer = { u: 'guest', n: 'Guest reviewer', r: 'viewer' };
  const team = { u: 'team', n: 'Team', r: 'admin' };
  assert.equal((await onRequestPost(voiceCtx(makeWav(), { user: viewer, env }))).status, 403);
  assert.equal((await onRequestPost(voiceCtx(makeWav(), { user: team, env, headers: { Origin: 'https://evil.example' } }))).status, 403);
  assert.equal((await onRequestPost(voiceCtx(makeWav(), { user: null, env }))).status, 401);
  let seenSignal = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    seenSignal = init && init.signal;
    return new Response(JSON.stringify({ transcript: 'hello', audioDurationMs: 500 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const ok = await onRequestPost(voiceCtx(makeWav(), { user: team, env: { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() } }));
    assert.equal(ok.status, 200);
    assert.ok(seenSignal instanceof AbortSignal, 'voice upstream fetch must carry a timeout signal');
  } finally { globalThis.fetch = realFetch; }
});
test('voice is rate limited like Muse: the bucket empties before the audio is read', async () => {
  const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_RATE_PER_MIN: '2' };
  const post = () => onRequestPost(ctx('/api/voice', { method: 'POST', body: 'not a wav', headers: { Cookie: 'muse_session=abc' }, env, user: { u: 'team', r: 'admin' } }));
  assert.equal((await post()).status, 400); // token taken, WAV rejected
  assert.equal((await post()).status, 400);
  const r = await post();
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /pacing/);
});
