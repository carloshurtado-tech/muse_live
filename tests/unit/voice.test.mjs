import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/voice.js';
import { memoryKV, ctx } from './helpers.mjs';

test('voice is rate limited like Muse: the bucket empties before the audio is read', async () => {
  const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV(), MUSE_RATE_PER_MIN: '2' };
  const post = () => onRequestPost(ctx('/api/voice', { method: 'POST', body: 'not a wav', headers: { Cookie: 'muse_session=abc' }, env, user: { u: 'team', r: 'admin' } }));
  assert.equal((await post()).status, 400); // token taken, WAV rejected
  assert.equal((await post()).status, 400);
  const r = await post();
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /pacing/);
});
