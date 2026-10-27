import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as search } from '../../functions/api/assets/search.js';
import { onRequest as sync } from '../../functions/api/assets/sync.js';
import { onRequest as serial } from '../../functions/api/assets/[serial].js';
import { memoryD1, ctx, memoryKV } from './helpers.mjs';

const editor = { u: 'ana@meta.com', n: 'Ana', r: 'engineer' };
const viewer = { u: 'vic@meta.com', n: 'Vic', r: 'viewer' };

function env() { return { MUSE_DB: memoryD1(), MUSE_KV: memoryKV() }; }

test('unbound database and signed-out users fail closed', async () => {
  assert.equal((await search(ctx('/api/assets/search?q=x', { env: {}, user: editor }))).status, 503);
  assert.equal((await sync(ctx('/api/assets/sync', { env: env(), user: null }))).status, 401);
  assert.equal((await serial(ctx('/api/assets/S1', { env: env(), user: null, params: { serial: 'S1' } }))).status, 401);
  assert.equal((await serial(ctx('/api/assets/!!', { env: env(), user: editor, params: { serial: '!!' } }))).status, 400);
});

test('sync upserts the register, skips stale versions, seeds fresh devices', async () => {
  const e = env();
  const put = await sync(ctx('/api/assets/sync', { method: 'POST', body: { assets: [{ serial: 'ENC-1', name: 'Encoder', category: 'transmission', updated: 100 }], vendors: [{ id: 'v1', name: 'Lens & Friends', updated: 100 }] }, env: e, user: editor }));
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { ok: true, kept: 2, skipped: 0 });
  const stale = await sync(ctx('/api/assets/sync', { method: 'POST', body: { assets: [{ serial: 'ENC-1', name: 'Old', updated: 50 }] }, env: e, user: editor }));
  assert.deepEqual(await stale.json(), { ok: true, kept: 0, skipped: 1 });
  const seed = await sync(ctx('/api/assets/sync', { env: e, user: viewer }));
  const body = await seed.json();
  assert.equal(body.assets.length, 1);
  assert.equal(body.vendors.length, 1);
  assert.equal(body.assets[0].name, 'Encoder', 'stale version did not overwrite');
  assert.equal((await sync(ctx('/api/assets/sync', { method: 'POST', body: {}, env: e, user: viewer }))).status, 403);
});

test('serial lifecycle: checkout refuses double checkout, every step writes history', async () => {
  const e = env();
  await sync(ctx('/api/assets/sync', { method: 'POST', body: { assets: [{ serial: 'CAM-9', name: 'Camera', updated: 1 }] }, env: e, user: editor }));
  assert.equal((await serial(ctx('/api/assets/NOPE', { env: e, user: editor, params: { serial: 'NOPE' } }))).status, 404);
  const out = await serial(ctx('/api/assets/CAM-9', { method: 'POST', body: { action: 'checkout', to: 'Maya Chen' }, env: e, user: editor, params: { serial: 'CAM-9' } }));
  assert.equal(out.status, 200);
  assert.equal((await out.json()).asset.status, 'checked-out');
  assert.equal((await serial(ctx('/api/assets/CAM-9', { method: 'POST', body: { action: 'checkout', to: 'Sam' }, env: e, user: editor, params: { serial: 'CAM-9' } }))).status, 409);
  assert.equal((await serial(ctx('/api/assets/CAM-9', { method: 'POST', body: { action: 'condition', condition: 'bogus' }, env: e, user: editor, params: { serial: 'CAM-9' } }))).status, 400);
  await serial(ctx('/api/assets/CAM-9', { method: 'POST', body: { action: 'condition', condition: 'fair' }, env: e, user: editor, params: { serial: 'CAM-9' } }));
  await serial(ctx('/api/assets/CAM-9', { method: 'POST', body: { action: 'checkin' }, env: e, user: editor, params: { serial: 'CAM-9' } }));
  const got = await serial(ctx('/api/assets/CAM-9', { env: e, user: viewer, params: { serial: 'CAM-9' } }));
  const body = await got.json();
  assert.equal(body.asset.status, 'available');
  assert.equal(body.asset.condition, 'fair');
  assert.deepEqual(body.history.map((h) => h.action), ['checkin', 'condition', 'checkout']);
  assert.ok(body.history.every((h) => h.by === 'ana@meta.com' && h.ts > 0), 'history missing actor/timestamp');
});

test('FTS search finds assets and vendors, rejects noise', async () => {
  const e = env();
  await sync(ctx('/api/assets/sync', { method: 'POST', body: { assets: [{ serial: 'ENC-42', name: 'Main Encoder', category: 'transmission', location: 'Truck 2', updated: 1 }], vendors: [{ id: 'v9', name: 'Prime Lenses Co', category: 'Lenses', updated: 1 }] }, env: e, user: editor }));
  const enc = await (await search(ctx('/api/assets/search?q=encoder', { env: e, user: viewer }))).json();
  assert.equal(enc.hits.length, 1);
  assert.equal(enc.hits[0].id, 'ENC-42');
  const lens = await (await search(ctx('/api/assets/search?q=lenses', { env: e, user: viewer }))).json();
  assert.equal(lens.hits.length, 1);
  assert.equal(lens.hits[0].kind, 'vendor');
  const none = await (await search(ctx('/api/assets/search?q=a', { env: e, user: viewer }))).json();
  assert.deepEqual(none.hits, []);
});
