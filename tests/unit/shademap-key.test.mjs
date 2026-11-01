import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../../functions/api/shademap-key.js';
import { ctx } from './helpers.mjs';

test('returns the env key, or empty string when unconfigured', async () => {
  const ok = await onRequestGet(ctx('/api/shademap-key', { env: { SHADEMAP_API_KEY: 'sm-test-key' } }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { key: 'sm-test-key' });
  const empty = await onRequestGet(ctx('/api/shademap-key', { env: {} }));
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { key: '' });
  const nonString = await onRequestGet(ctx('/api/shademap-key', { env: { SHADEMAP_API_KEY: 42 } }));
  assert.deepEqual(await nonString.json(), { key: '' });
});

test('cross-origin reads are refused', async () => {
  const r = await onRequestGet(ctx('/api/shademap-key', { env: { SHADEMAP_API_KEY: 'sm-test-key' }, headers: { Origin: 'https://evil.example' } }));
  assert.equal(r.status, 403);
});
