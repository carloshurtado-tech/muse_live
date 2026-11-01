import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadBrowserModule, ROOT } from './helpers.mjs';
import path from 'node:path';

function win(extra = {}) {
  return loadBrowserModule('js/muse-heartbeat.js', extra);
}

test('tasks run when due, not before, and keep their cadence', () => {
  const w = win();
  const H = w.MuseHeartbeat;
  H._now(0);
  let n = 0;
  H.every('a', () => { n++; }, 5000);
  H._tick(1000);
  assert.equal(n, 0, 'ran before due');
  H._tick(6000);
  assert.equal(n, 1);
  H._tick(9000);
  assert.equal(n, 1, 'ran early');
  H._tick(11000);
  assert.equal(n, 2);
});

test('sub-second cadences clamp to one tick and re-registering replaces', () => {
  const w = win();
  const H = w.MuseHeartbeat;
  H._now(0);
  let n = 0;
  H.every('fast', () => { n++; }, 100);
  assert.equal(H._tasks.fast.ms, H.TICK_MS);
  H.every('fast', () => { n += 10; }, 1000);
  H._tick(2000);
  assert.equal(n, 10, 'old registration ran');
});

test('one bad task never stops the rest, and unregister stops a task', () => {
  const w = win();
  const H = w.MuseHeartbeat;
  H._now(0);
  let ok = 0;
  H.every('bad', () => { throw new Error('boom'); }, 1000);
  H.every('good', () => { ok++; }, 1000);
  const un = H.every('temp', () => { ok += 100; }, 1000);
  un();
  H._tick(5000);
  assert.equal(ok, 1);
});

test('hidden tabs skip foreground work but not background work', () => {
  const w = win();
  const H = w.MuseHeartbeat;
  H._now(0);
  let fg = 0, bg = 0;
  H.every('fg', () => { fg++; }, 1000);
  H.every('bg', () => { bg++; }, 1000, { background: true });
  H._hidden(true);
  H._tick(5000);
  assert.equal(fg, 0);
  assert.equal(bg, 1);
  H._hidden(null);
  H._tick(6000);
  assert.equal(fg, 1);
  assert.equal(bg, 2);
});

test('BUG-17: a background live-status publish runs while the tab is hidden', () => {
  const w = win();
  const H = w.MuseHeartbeat;
  H._now(0);
  let pub = 0, fg = 0;
  H.every('streams:live-status', () => { pub++; }, 10000, { background: true });
  H.every('streams:frame', () => { fg++; }, 10000);
  H._hidden(true);
  H._tick(20000);
  assert.equal(pub, 1, 'live-status publish was skipped on a hidden tab (glasses go stale, then demo)');
  assert.equal(fg, 0, 'foreground rendering work must still pause while hidden');
});

test('BUG-17: glasses never invent a "next" show the desktop did not send', async () => {
  const { transformSync } = await import('esbuild');
  const src = fs.readFileSync(path.join(ROOT, 'glasses-src/src/data.ts'), 'utf8');
  const { code } = transformSync(src, { loader: 'ts', format: 'cjs' });
  const mod = { exports: {} };
  const ctx = vm.createContext({
    module: mod, exports: mod.exports, console,
    fetch: async () => ({
      ok: true,
      json: async () => ({ ts: Date.now(), shows: [{ key: 'a', name: 'Show A', state: 'LIVE', health: 'ok', viewers: 10, latency: 4, alerts: [] }], openIncidents: [] }),
    }),
  });
  vm.runInContext(code, ctx, { filename: 'glasses-src/src/data.ts' });
  const s = await mod.exports.fetchStatus();
  assert.equal(s.demo, false, 'fresh desktop status must not be marked demo');
  assert.equal(s.next, null, 'desktop sent no next: glasses must show unknown, not an invented demo next: ' + JSON.stringify(s.next));
});

test('thingsboard demo loop starts and stops through the heartbeat', () => {
  const w = loadBrowserModule('js/muse-heartbeat.js', {});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/muse-thingsboard.js'), 'utf8'), w, { filename: 'js/muse-thingsboard.js' });
  const TB = w.MuseThingsBoard;
  TB.startDemoLoop('truck1');
  assert.ok(w.MuseHeartbeat._tasks['tb:demo'], 'demo loop not on the heartbeat');
  assert.equal(w.MuseHeartbeat._tasks['tb:demo'].ms, 1500);
  TB.startDemoLoop('truck1');
  assert.ok(w.MuseHeartbeat._tasks['tb:demo'], 'restart lost the loop');
  TB.stopDemoLoop();
  assert.equal(w.MuseHeartbeat._tasks['tb:demo'], undefined, 'stop did not unregister');
  TB.stopDemoLoop(); // double stop is a no-op, never throws
});

test('muse-sync registers its loops on the heartbeat when present', async () => {
  const intervals = [];
  const doc = { readyState: 'complete', cookie: 'muse_authed=1', addEventListener() {}, getElementById: () => null, hidden: false };
  const fetch = (url) => {
    if (String(url).includes('/api/auth/me')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ user: { email: 'ana@meta.com', role: 'engineer' } }) });
    if (String(url).includes('/api/kv/')) return Promise.resolve({ status: 200, ok: true, headers: { get: () => null }, json: () => Promise.resolve(null) });
    return Promise.reject(new Error('unexpected ' + url));
  };
  const w = loadBrowserModule('js/muse-heartbeat.js', {
    Storage: function Storage() {}, fetch, performance: { now: () => 0 },
    sessionStorage: { getItem: () => null, setItem() {} }, document: doc,
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    clearInterval() {},
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/muse-sync.js'), 'utf8'), w, { filename: 'js/muse-sync.js' });
  await w.MuseSync.ready;
  assert.ok(w.MuseHeartbeat._tasks['muse-sync:poll'], 'poll not on the heartbeat');
  assert.ok(w.MuseHeartbeat._tasks['muse-sync:retry'], 'retry not on the heartbeat');
  assert.equal(w.MuseHeartbeat._tasks['muse-sync:poll'].ms, 10000);
  assert.equal(w.MuseHeartbeat._tasks['muse-sync:retry'].ms, 15000);
  assert.equal(intervals.length, 1, 'expected only the heartbeat tick, found private loops');
});
