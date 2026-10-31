// Stream Check eval: harness math, signal determinism, fault-server shapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';
import { RUN_SEC, WINDOW, FAULTS, STREAMS, truthOf } from '../../eval/streamcheck/faults.mjs';
import { frameAt, audioAt } from '../../eval/streamcheck/synth.mjs';
import { summarize, toCSV } from '../../eval/streamcheck/stats.mjs';
import { route, stubFetch } from '../../eval/streamcheck/fault-server.mjs';

const SC = () => loadBrowserModule('js/muse-streamcheck.js', {}).MuseStreamCheck;

test('eval faults: one control plus windowed faults inside the run', () => {
  assert.ok(WINDOW.start < WINDOW.end && WINDOW.end <= RUN_SEC);
  const black = FAULTS.find((f) => f.type === 'black');
  assert.equal(truthOf(black, 9), 'clean');
  assert.equal(truthOf(black, 10), 'fault');
  assert.equal(truthOf(black, 19), 'fault');
  assert.equal(truthOf(black, 20), 'clean');
  const clean = FAULTS.find((f) => f.type === 'clean');
  assert.ok([0, 10, 19, 29].every((t) => truthOf(clean, t) === 'clean'));
  assert.equal(STREAMS.length, 3);
});

test('eval stats: rates and time-to-detect come from the rows', () => {
  const rows = [];
  for (let t = 0; t < 10; t++) {
    rows.push({ fault: 'black', stream: 'bright', t, window: { start: 4, end: 8 }, truth: t >= 4 && t < 8 ? 'fault' : 'clean',
      flagged: t >= 5 && t < 8, latency_ms: 1, model_calls: 0 });
  }
  const [r] = summarize(rows);
  assert.equal(r.fault_samples, 4);
  assert.equal(r.detected, 3);
  assert.equal(r.detection_rate, 0.75);
  assert.equal(r.false_alarm_rate, 0);
  assert.deepEqual(r.ttd_s, [1]);
  assert.equal(r.ttd_p50_s, 1);
  assert.equal(r.ttd_p90_s, 1);
  assert.equal(r.model_calls, 0);
});

test('eval stats: empty and never-detected cells stay null, never zero', () => {
  assert.deepEqual(summarize([]), []);
  const rows = [{ fault: 'muted', stream: 'bright', t: 0, window: { start: 4, end: 8 }, truth: 'clean',
    flagged: false, latency_ms: 1, model_calls: 0 }];
  const [r] = summarize(rows);
  assert.equal(r.detection_rate, null);
  assert.equal(r.false_alarm_rate, 0);
  assert.equal(r.ttd_p50_s, null);
  const csv = toCSV(summarize(rows));
  assert.ok(csv.startsWith('fault,streams,samples,'));
  assert.equal(csv.trim().split('\n').length, 2);
});

test('eval detectors: still streak and silence streak rules', () => {
  const sc = SC();
  const a = frameAt('bright', 'clean', 3), b = frameAt('bright', 'clean', 3);
  const d0 = sc.frameDelta(a, b);
  assert.equal(d0.meanDelta, 0);
  assert.equal(d0.changedPct, 0);
  assert.equal(sc.isStill(d0), true);
  assert.equal(sc.isFrozen(1), false);
  assert.equal(sc.isFrozen(2), true);
  assert.equal(sc.audioEnergy(new Array(8).fill(0)), 0);
  assert.equal(sc.isSilent(0), true);
  assert.equal(sc.isSilent(sc.audioEnergy(audioAt('clean', 3))), false);
  assert.equal(sc.silenceHeld(1), false);
  assert.equal(sc.silenceHeld(2), true);
});

test('eval synth: deterministic signals the shipped math separates', () => {
  const sc = SC();
  assert.deepEqual(frameAt('bright', 'black', 12), frameAt('bright', 'black', 12));
  assert.deepEqual(frameAt('low-motion', 'clean', 5), frameAt('low-motion', 'clean', 5));
  assert.equal(sc.isBlack(sc.analyzePixels(frameAt('bright', 'black', 12))), true);
  for (const s of STREAMS) {
    for (let t = 0; t < RUN_SEC; t++) {
      assert.equal(sc.isBlack(sc.analyzePixels(frameAt(s.id, 'clean', t))), false, `${s.id} t=${t} misread as black`);
      assert.equal(sc.isSilent(sc.audioEnergy(audioAt('clean', t))), false);
    }
    assert.equal(sc.isBlack(sc.analyzePixels(frameAt(s.id, 'frozen', 19))), false, 'frozen picture is not a black frame');
  }
  const d0 = sc.frameDelta(frameAt('bright', 'frozen', 11), frameAt('bright', 'frozen', 12));
  assert.equal(sc.isStill(d0), true);
  for (let t = 1; t < RUN_SEC; t++) {
    const d = sc.frameDelta(frameAt('low-motion', 'clean', t), frameAt('low-motion', 'clean', t - 1));
    assert.equal(sc.isStill(d), false, `low-motion t=${t} misread as still`);
  }
});

test('eval fault server: clean up, down 503, fault variants shaped', async () => {
  // In-process over the route table (no listener): the HTTP wrapper serves
  // these same bytes and statuses.
  const hits = { flaky: 0 };
  const get = (p) => { const r = route('GET', p, hits); return { st: r.status, txt: String(r.body) }; };
  const clean = get('/hls/clean.m3u8');
  assert.equal(clean.st, 200);
  assert.ok(clean.txt.includes('#EXTM3U'));
  assert.equal(get('/hls/down.m3u8').st, 503);
  const uris = get('/hls/frozen.m3u8').txt.split('\n').filter((l) => l.startsWith('/hls/seg/'));
  assert.equal(uris.length, 6);
  assert.equal(uris[2], uris[1]);
  assert.equal(uris[3], uris[1]);
  assert.equal((get('/hls/black.m3u8').txt.match(/#EXT-X-GAP/g) || []).length, 2);
  assert.ok(!get('/hls/muted-master.m3u8').txt.includes('AUDIO='));
  assert.ok(get('/hls/clean-master.m3u8').txt.includes('AUDIO="audio"'));
  assert.equal(get('/hls/seg/clean-0.ts').st, 200);
  route('POST', '/reset', hits);
  assert.equal(get('/hls/flaky.m3u8').st, 503);
  assert.equal(get('/hls/flaky.m3u8').st, 200);
});

test('eval fault server: in-process fetch feeds the shipped check', async () => {
  const TF = loadBrowserModule('js/muse-testfeeds.js', { fetch: stubFetch(), AbortController }).MuseTestFeeds;
  assert.equal(await TF.check({ url: 'http://fault/hls/down.m3u8' }), 'down');
  assert.equal(await TF.check({ url: 'http://fault/hls/clean.m3u8' }), 'up');
});
