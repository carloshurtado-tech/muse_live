import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/media.js';
import { memoryR2, ctx, memoryKV, memoryD1 } from './helpers.mjs';

const editor = { u: 'ana@meta.com', n: 'Ana', r: 'engineer' };
const viewer = { u: 'vic@meta.com', n: 'Vic', r: 'viewer' };

function env() { return { MUSE_MEDIA: memoryR2(), MUSE_KV: memoryKV(), MUSE_DB: memoryD1() }; }
const b64 = (s) => Buffer.from(s).toString('base64');
const up = (body, user = editor) => onRequest(ctx('/api/media', { method: 'POST', body, env: env(), user }));

test('unbound bucket, signed-out users, and bad kinds fail closed', async () => {
  assert.equal((await onRequest(ctx('/api/media?prefix=x', { env: {}, user: editor }))).status, 503);
  assert.equal((await onRequest(ctx('/api/media?prefix=x', { env: env(), user: null }))).status, 401);
  assert.equal((await up({ kind: 'dump', show: 'demo', data: b64('x') })).status, 400);
  assert.equal((await up({ kind: 'pano', show: 'BAD SHOW!', data: b64('x') })).status, 400);
  assert.equal((await up({ kind: 'pano', show: 'demo', data: '!!!' })).status, 400);
  assert.equal((await up({ kind: 'pano', show: 'demo', data: '' })).status, 400);
});

test('upload → download round-trips bytes with content type', async () => {
  const e = env();
  const put = await onRequest(ctx('/api/media', { method: 'POST', body: { kind: 'captions', show: 'demo', name: 'act1.vtt', contentType: 'text/vtt', data: b64('WEBVTT\n\n00:00.000 --> 00:01.000\nHi') }, env: e, user: editor }));
  assert.equal(put.status, 200);
  const meta = await put.json();
  assert.ok(/^captions\/demo\//.test(meta.key), 'key carries kind + show: ' + meta.key);
  assert.ok(meta.url.includes(encodeURIComponent(meta.key).slice(0, 20)));
  const get = await onRequest(ctx('/api/media?key=' + encodeURIComponent(meta.key), { env: e, user: viewer }));
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('Content-Type'), 'text/vtt');
  assert.equal(await get.text(), 'WEBVTT\n\n00:00.000 --> 00:01.000\nHi');
  assert.equal((await onRequest(ctx('/api/media?key=nope', { env: e, user: viewer }))).status, 404);
});

test('prefix listing scopes to a show; delete is writers-only', async () => {
  const e = env();
  const post = (show, name) => onRequest(ctx('/api/media', { method: 'POST', body: { kind: 'pano', show, name, contentType: 'image/jpeg', data: b64('bytes') }, env: e, user: editor }));
  const k1 = (await (await post('demo', 'a.jpg')).json()).key;
  await post('other', 'b.jpg');
  const list = await (await onRequest(ctx('/api/media?prefix=pano/demo/', { env: e, user: viewer }))).json();
  assert.equal(list.keys.length, 1);
  assert.equal(list.keys[0].key, k1);
  assert.equal((await onRequest(ctx('/api/media?key=' + encodeURIComponent(k1), { method: 'DELETE', env: e, user: viewer }))).status, 403);
  assert.equal((await onRequest(ctx('/api/media?key=' + encodeURIComponent(k1), { method: 'DELETE', env: e, user: editor }))).status, 200);
  assert.equal((await onRequest(ctx('/api/media?key=' + encodeURIComponent(k1), { env: e, user: viewer }))).status, 404);
});

test('attach links a media key to an asset record', async () => {
  const { onRequest: serial } = await import('../../functions/api/assets/[serial].js');
  const db = memoryD1();
  const e = { MUSE_DB: db, MUSE_KV: memoryKV() };
  db.tables.assets.set('CAM-1', { serial: 'CAM-1', name: 'Camera', media_keys: '[]' });
  const bad = await serial(ctx('/api/assets/CAM-1', { method: 'POST', body: { action: 'attach', key: '../evil' }, env: e, user: editor, params: { serial: 'CAM-1' } }));
  assert.equal(bad.status, 400);
  const ok = await serial(ctx('/api/assets/CAM-1', { method: 'POST', body: { action: 'attach', key: 'pano/demo/2026-10-27/x-a.jpg' }, env: e, user: editor, params: { serial: 'CAM-1' } }));
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse((await ok.json()).asset.media_keys), ['pano/demo/2026-10-27/x-a.jpg']);
});
