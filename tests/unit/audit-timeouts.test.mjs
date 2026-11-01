import test from 'node:test';
import assert from 'node:assert/strict';
import { audit } from '../../functions/_lib/audit.js';
import { onRequestGet as fbliveGet } from '../../functions/api/fblive.js';
import { onRequestPost as telemetryPost } from '../../functions/api/telemetry.js';
import { memoryKV, memoryD1, ctx } from './helpers.mjs';

test('BUG-29: audit appends to D1 only — no flushable KV array mirror, nothing dropped', async () => {
  const kv = memoryKV(), db = memoryD1();
  const env = { MUSE_KV: kv, MUSE_D1: db };
  await Promise.all(Array.from({ length: 20 }, (_, i) => audit(env, { who: 'guest', role: 'viewer', action: 'login', detail: 'guest demo ' + i })));
  await audit(env, { who: 'ana@meta.com', role: 'engineer', action: 'kv.put', key: 'doc', detail: '1 bytes' });
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(await kv.get('audit:' + day, 'json'), null, 'the 5000-entry KV array mirror must be gone');
  assert.equal(db.tables.auditLog.length, 21);
  assert.equal(db.tables.auditLog.filter((e) => e.action === 'login').length, 20);
});

test('BUG-15: Facebook Live and telemetry upstream fetches carry timeouts', async () => {
  const signals = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    signals.push([String(url), init && init.signal]);
    const u = String(url);
    if (u.includes('graph.facebook.com')) return Response.json({ data: [] });
    return Response.json({});
  };
  try {
    const fb = await fbliveGet({ request: new Request('https://muse.test/api/fblive?page=12345'), env: { FB_GRAPH_TOKEN: 'tok' } });
    assert.equal(fb.status, 200);
    assert.ok(signals[0][1] instanceof AbortSignal, 'fblive fetch must carry a timeout signal');
    signals.length = 0;
    const tel = await telemetryPost(ctx('/api/telemetry', {
      method: 'POST', body: { mux: { videoId: 'v1' } },
      env: { MUX_TOKEN_ID: 'i', MUX_TOKEN_SECRET: 's' }, user: { u: 'team', r: 'admin' },
    }));
    assert.equal(tel.status, 200);
    assert.ok(signals.length > 0 && signals.every(([, s]) => s instanceof AbortSignal), 'telemetry fetches must carry timeout signals');
  } finally { globalThis.fetch = real; }
});
