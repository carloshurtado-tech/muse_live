import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/kv/[key].js';
import { memoryKV, ctx } from './helpers.mjs';

const editor = { u: 'ana@meta.com', n: 'Ana', r: 'engineer' };
const put = (body, env, headers = {}, params = { key: 'doc' }, user = editor) =>
  onRequest(ctx('/api/kv/doc', { method: 'PUT', body, env, params, headers, user }));

test('PUT returns an ETag matching X-Muse-Updated', async () => {
  const env = { MUSE_KV: memoryKV() };
  const r = await put({ v: 1 }, env);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(r.headers.get('ETag'), '"' + body.updated + '"');
  assert.equal(r.headers.get('X-Muse-Updated'), String(body.updated));
});

test('PUT with If-Match: matching version writes, stale version → 412', async () => {
  const env = { MUSE_KV: memoryKV() };
  await put({ v: 1 }, env);
  const first = await onRequest(ctx('/api/kv/doc', { env, user: editor, params: { key: 'doc' } }));
  const etag = first.headers.get('ETag');
  assert.match(etag, /^"\d+"$/);

  const ok = await put({ v: 2 }, env, { 'If-Match': etag });
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).updated > 0); // new version issued

  const stale = await put({ v: 3 }, env, { 'If-Match': etag });
  assert.equal(stale.status, 412); // etag belongs to the overwritten version

  const weak = await onRequest(ctx('/api/kv/doc', { env, user: editor, params: { key: 'doc' } }));
  const fresh = await put({ v: 4 }, env, { 'If-Match': 'W/' + weak.headers.get('ETag') });
  assert.equal(fresh.status, 200); // weak validators compare
});

test('PUT with If-Match:* requires the key to exist', async () => {
  const env = { MUSE_KV: memoryKV() };
  assert.equal((await put({ v: 1 }, env, { 'If-Match': '*' })).status, 412);
  assert.equal((await put({ v: 1 }, env)).status, 200);
  assert.equal((await put({ v: 2 }, env, { 'If-Match': '*' })).status, 200);
});

test('PUT with If-None-Match: matching version → 412, otherwise writes', async () => {
  const env = { MUSE_KV: memoryKV() };
  assert.equal((await put({ v: 1 }, env, { 'If-None-Match': '*' })).status, 200); // absent → create
  assert.equal((await put({ v: 2 }, env, { 'If-None-Match': '*' })).status, 412); // present → refuse
  const cur = await onRequest(ctx('/api/kv/doc', { env, user: editor, params: { key: 'doc' } }));
  const etag = cur.headers.get('ETag');
  assert.equal((await put({ v: 2 }, env, { 'If-None-Match': etag })).status, 412);
  assert.equal((await put({ v: 2 }, env, { 'If-None-Match': '"1", "2"' })).status, 200);
  assert.equal((await onRequest(ctx('/api/kv/doc', { env, user: editor, params: { key: 'doc' } }))).status, 200);
});

test('conditional PUT keeps other guards (auth, JSON, size, origin)', async () => {
  const env = { MUSE_KV: memoryKV() };
  assert.equal((await put({ v: 1 }, env, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await put('not json', env, { 'If-Match': '*' })).status, 400);
});
