import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/kv/[key].js';
import { memoryKV, ctx } from './helpers.mjs';

const editor = { u: 'ana@meta.com', n: 'Ana', r: 'engineer' };
const viewer = { u: 'vic@meta.com', n: 'Vic', r: 'viewer' };
const admin = { u: 'team', n: 'Team', r: 'admin' };

test('GET missing key → 404, PUT then GET round-trips with metadata', async () => {
  const env = { MUSE_KV: memoryKV() };
  assert.equal((await onRequest(ctx('/api/kv/live-status', { env, user: editor, params: { key: 'live-status' } }))).status, 404);
  const put = await onRequest(ctx('/api/kv/live-status', { method: 'PUT', body: { shows: 3 }, env, user: editor, params: { key: 'live-status' } }));
  assert.equal(put.status, 200);
  const got = await onRequest(ctx('/api/kv/live-status', { env, user: editor, params: { key: 'live-status' } }));
  assert.deepEqual(await got.json(), { shows: 3 });
  assert.ok(+got.headers.get('X-Muse-Updated') > 0);
  assert.equal(got.headers.get('X-Muse-By'), 'ana@meta.com');
});
test('validation: bad key, non-JSON, too large, foreign origin', async () => {
  const env = { MUSE_KV: memoryKV() };
  assert.equal((await onRequest(ctx('/x', { env, user: editor, params: { key: 'users:ana' } }))).status, 400);
  assert.equal((await onRequest(ctx('/x', { method: 'PUT', body: 'not json', env, user: editor, params: { key: 'a' } }))).status, 400);
  assert.equal((await onRequest(ctx('/x', { method: 'PUT', body: JSON.stringify({ s: 'x'.repeat(270000) }), env, user: editor, params: { key: 'a' } }))).status, 413);
  assert.equal((await onRequest(ctx('/x', { method: 'PUT', body: {}, headers: { Origin: 'https://evil.example' }, env, user: editor, params: { key: 'a' } }))).status, 403);
});
test('roles: viewers read-only, only admins delete, signed-out 401, no binding 503', async () => {
  const env = { MUSE_KV: memoryKV() };
  assert.equal((await onRequest(ctx('/x', { method: 'PUT', body: {}, env, user: viewer, params: { key: 'a' } }))).status, 403);
  assert.equal((await onRequest(ctx('/x', { method: 'DELETE', env, user: editor, params: { key: 'a' } }))).status, 403);
  assert.equal((await onRequest(ctx('/x', { method: 'DELETE', env, user: admin, params: { key: 'a' } }))).status, 200);
  assert.equal((await onRequest(ctx('/x', { env, user: null, params: { key: 'a' } }))).status, 401);
  assert.equal((await onRequest(ctx('/x', { env: {}, user: editor, params: { key: 'a' } }))).status, 503);
});
test('writes are audited (except high-frequency telemetry keys)', async () => {
  const kv = memoryKV(), env = { MUSE_KV: kv };
  await onRequest(ctx('/x', { method: 'PUT', body: { a: 1 }, env, user: editor, params: { key: 'ls-muselive_incidents_v1' } }));
  await onRequest(ctx('/x', { method: 'PUT', body: { a: 1 }, env, user: editor, params: { key: 'live-status' } }));
  const day = new Date().toISOString().slice(0, 10);
  const log = await kv.get('audit:' + day, 'json');
  assert.equal(log.length, 1); assert.equal(log[0].action, 'kv.put'); assert.equal(log[0].key, 'ls-muselive_incidents_v1');
});
test('?optional=1 answers 200 + null for missing keys (no console noise)', async () => {
  const env = { MUSE_KV: memoryKV() };
  const r = await onRequest(ctx('/api/kv/nope?optional=1', { env, user: editor, params: { key: 'nope' } }));
  assert.equal(r.status, 200); assert.equal(r.headers.get('X-Muse-Missing'), '1'); assert.equal(await r.json(), null);
});
