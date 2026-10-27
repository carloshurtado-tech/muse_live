import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { onRequestPost } from '../../functions/api/streamcheck.js';
import { memoryKV, ctx, loadBrowserModule, ROOT } from './helpers.mjs';

const TEAM = { u: 'team', n: 'Muse Live team', r: 'admin' };
const VIEWER = { u: 'guest', n: 'Guest reviewer', r: 'viewer' };
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(100);
const day = () => new Date().toISOString().slice(0, 10);

function samResponse(text) {
  return { object: 'response', status: 'completed', error: null,
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }] };
}
function mockFetch(body, status = 200) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push([String(url), JSON.parse(init.body)]); return new Response(JSON.stringify(body), { status }); };
  return { calls, done() { globalThis.fetch = real; } };
}

test('streamcheck: parses boxes + confidences, counts masks without returning them', async () => {
  const text = 'a<|box;x1=10;y1=20;x2=30;y2=40;w=640;h=360;c=0.94|><|mask;x=0;y=0;c=0.94;data=AAA|>b<|box;x1=50;y1=60;x2=70;y2=80;w=640;h=360;c=0.87|><|mask;x=0;y=0;c=0.87;data=BBB|>';
  const m = mockFetch(samResponse(text));
  try {
    const kv = memoryKV();
    const r = await onRequestPost(ctx('/api/streamcheck', { method: 'POST', env: { MODEL_API_KEY: 'k', MUSE_KV: kv }, user: TEAM,
      body: { image: IMG, concept: 'traffic cone' } }));
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.count, 2);
    assert.equal(j.masks, 2);
    assert.equal(j.noMatch, false);
    assert.deepEqual(j.matches[0], { x1: 10, y1: 20, x2: 30, y2: 40, w: 640, h: 360, confidence: 0.94 });
    assert.ok(!JSON.stringify(j).includes('AAA'), 'mask data leaked into the response');
    assert.equal(m.calls[0][0], 'https://api.meta.ai/v1/responses');
    assert.equal(m.calls[0][1].model, 'sam-3.1');
    assert.ok((await kv.get('audit:' + day(), { type: 'json' })).some((e) => e.action === 'showcaller.streamcheck'));
  } finally { m.done(); }
});

test('streamcheck: empty output is an explicit no-match, not an error', async () => {
  const m = mockFetch(samResponse(''));
  try {
    const r = await onRequestPost(ctx('/api/streamcheck', { method: 'POST', env: { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() }, user: TEAM,
      body: { image: IMG, concept: 'camera' } }));
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.noMatch, true);
    assert.deepEqual(j.matches, []);
  } finally { m.done(); }
});

test('streamcheck: commands and bad images are rejected before any model call', async () => {
  const m = mockFetch(samResponse(''));
  try {
    const env = { MODEL_API_KEY: 'k', MUSE_KV: memoryKV() };
    const bad = [
      { image: IMG, concept: 'find the camera?' },
      { image: IMG, concept: '' },
      { image: 'https://evil/x.jpg', concept: 'camera' },
      { image: 'data:image/gif;base64,' + 'A'.repeat(100), concept: 'camera' },
      { image: 'data:image/jpeg;base64,' + 'A'.repeat(1600000), concept: 'camera' },
    ];
    for (const b of bad) {
      assert.equal((await onRequestPost(ctx('/api/streamcheck', { method: 'POST', env, user: TEAM, body: b }))).status, 400);
    }
    assert.equal((await onRequestPost(ctx('/api/streamcheck', { method: 'POST', env, user: VIEWER, body: { image: IMG, concept: 'camera' } }))).status, 403);
    assert.equal((await onRequestPost(ctx('/api/streamcheck', { method: 'POST', env: {}, user: TEAM, body: { image: IMG, concept: 'camera' } }))).status, 503);
    assert.equal(m.calls.length, 0, 'rejected requests must not reach SAM');
  } finally { m.done(); }
});

test('client: black math flags dead frames, clears live ones', () => {
  const w = loadBrowserModule('js/muse-streamcheck.js', {});
  const SC = w.MuseStreamCheck;
  const px = (v, n = 64) => ({ data: Array.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? 255 : v)), w: 8, h: 8 });
  assert.equal(SC.isBlack(SC.analyzePixels(px(0))), true);
  assert.equal(SC.isBlack(SC.analyzePixels(px(255))), false);
  assert.equal(SC.isBlack(SC.analyzePixels(px(30))), false, 'dark scene is not a black frame');
  const hot = px(0); hot.data[0] = 255;
  assert.equal(SC.isBlack(SC.analyzePixels(hot)), true, 'one hot pixel must not clear a dead frame');
});

test('client: capture fails cleanly without video, grabs with it', () => {
  const empty = loadBrowserModule('js/muse-streamcheck.js', { MuseStreaming: {} });
  assert.equal(empty.MuseStreamCheck.captureFrame('x:1').ok, false);
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: [], w: 0, h: 0 }) }), toDataURL: () => 'data:image/jpeg;base64,x' });
  const full = loadBrowserModule('js/muse-streamcheck.js', {
    MuseStreaming: { videoFor: () => ({ tagName: 'VIDEO', videoWidth: 640, videoHeight: 360 }) },
    document: { createElement: () => canvas() },
  });
  const c = full.MuseStreamCheck.captureFrame('x:1');
  assert.equal(c.ok, true);
  assert.ok(c.dataUrl.startsWith('data:image/jpeg'));
});

test('client: lower-third presence is compared against expectation, errors are not flags', async () => {
  const video = { tagName: 'VIDEO', videoWidth: 640, videoHeight: 360 };
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,x' });
  const win = (fetch) => loadBrowserModule('js/muse-streamcheck.js', {
    MuseStreaming: { videoFor: () => video }, document: { createElement: () => canvas() }, fetch });
  const box = { x1: 1, y1: 2, x2: 3, y2: 4, w: 9, h: 9, confidence: 0.9 };
  const hit = win(async () => ({ status: 200, json: async () => ({ ok: true, matches: [box], count: 1 }) }));
  const miss = win(async () => ({ status: 200, json: async () => ({ ok: true, matches: [], count: 0, noMatch: true }) }));
  const dead = win(async () => { throw new Error('down'); });
  assert.equal((await hit.MuseStreamCheck.checkLowerThird('x:1', true)).pass, true);
  assert.equal((await hit.MuseStreamCheck.checkLowerThird('x:1', true)).evidence.top.confidence, 0.9);
  const f1 = await miss.MuseStreamCheck.checkLowerThird('x:1', true);
  assert.equal(f1.pass, false);
  assert.ok(!f1.error && f1.flag.includes('expected'), 'missing lower-third must flag, not error');
  assert.equal((await miss.MuseStreamCheck.checkLowerThird('x:1', false)).pass, true);
  const e1 = await dead.MuseStreamCheck.checkLowerThird('x:1', true);
  assert.ok(e1.error, 'dead endpoint must error, never flag');
});

test('client: gear count matches the checkout or flags with both numbers', async () => {
  const video = { tagName: 'VIDEO', videoWidth: 640, videoHeight: 360 };
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,x' });
  const win = (n) => loadBrowserModule('js/muse-streamcheck.js', {
    MuseStreaming: { videoFor: () => video }, document: { createElement: () => canvas() },
    fetch: async () => ({ status: 200, json: async () => ({ ok: true, matches: new Array(n).fill({}), count: n }) }) });
  assert.equal((await win(5).MuseStreamCheck.checkGear('x:1', 'traffic cone', 5)).pass, true);
  const f = await win(4).MuseStreamCheck.checkGear('x:1', 'traffic cone', 5);
  assert.equal(f.pass, false);
  assert.ok(f.flag.includes('4') && f.flag.includes('5'), 'flag must carry both counts: ' + f.flag);
});

test('client: runShow stores latest and Show Caller raises each flag high', async () => {
  const black = { data: new Array(64 * 36 * 4).fill(0), w: 64, h: 36 };
  const w = loadBrowserModule('js/muse-streamcheck.js', {
    productions: { demo: { name: 'Demo Show' } }, order: ['demo'],
    MuseSchedule: { byProduction: () => [], conflicts: () => [], ruleFindings: () => [] },
    MuseStreaming: { videoFor: () => ({ tagName: 'VIDEO', videoWidth: 640, videoHeight: 360 }), stateOf: () => 'LIVE',
      health: () => ({ state: 'LIVE', alerts: [] }), anomalies: () => [] },
    MuseIncidents: { byProduction: () => [] },
    museaiCrewFull: () => [{ pos: 'A1', name: 'Sam' }],
    museaiPacklist: () => [{ name: 'Encoder', status: 'Packed' }],
    buildMuseAiContext: () => JSON.stringify({ ops_backbone: {} }),
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => black }), toDataURL: () => 'data:image/jpeg;base64,x' }) },
    fetch: async (url, init) => ({ status: 200, json: async () =>
      JSON.parse(init.body).concept === 'lower-third graphic'
        ? { ok: true, matches: [{ x1: 1, y1: 1, x2: 2, y2: 2, w: 9, h: 9, confidence: 0.9 }], count: 1 }
        : { ok: true, matches: [], count: 0, noMatch: true } }),
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/muse-showcaller.js'), 'utf8'), w, { filename: 'js/muse-showcaller.js' });
  const run = await w.MuseStreamCheck.runShow('demo', 'wall:program', { expectLowerThird: true, gear: [] });
  assert.equal(run.flags.length, 1, 'black frame should be the only flag');
  assert.equal(run.flags[0].check, 'black');
  const b = w.MuseShowCaller.brief('demo');
  const sc = b.risks.filter((r) => r.area === 'streamcheck');
  assert.equal(sc.length, 1);
  assert.equal(sc[0].level, 'high');
  assert.ok(sc[0].sources[0].includes('streamcheck'));
  const p = w.MuseShowCaller.propose('demo');
  assert.ok(p.uncovered.some((u) => /monitor/.test(u.why)), 'visual flag must escalate to human eyes');
});

test('streamcheck: upstream failure is a 502 with a failed audit entry', async () => {
  const m = mockFetch({ error: { code: 'model_not_found' } });
  try {
    const kv = memoryKV();
    const r = await onRequestPost(ctx('/api/streamcheck', { method: 'POST', env: { MODEL_API_KEY: 'k', MUSE_KV: kv }, user: TEAM,
      body: { image: IMG, concept: 'camera' } }));
    assert.equal(r.status, 502);
    assert.ok((await kv.get('audit:' + day(), { type: 'json' })).some((e) => e.action === 'showcaller.streamcheck.failed'));
  } finally { m.done(); }
});
