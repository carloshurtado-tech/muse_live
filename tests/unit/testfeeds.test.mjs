import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrowserModule, memoryKV, ctx, ROOT } from './helpers.mjs';
import { onRequest as observeReq } from '../../functions/api/observe.js';

const ESC = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Values built inside the vm sandbox carry a different Object prototype;
// normalize before deep comparison.
const plain = (v) => JSON.parse(JSON.stringify(v));
function makeWin(over = {}) {
  return loadBrowserModule('js/muse-testfeeds.js', Object.assign({ esc: ESC }, over));
}

test('defaults carry the five-tile NOC wall plus disabled native-only AJA', () => {
  const TF = makeWin().MuseTestFeeds;
  assert.deepEqual(plain(TF.defaults()), [
    { id: 'live', label: 'Test Live', url: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8', kind: 'live', enabled: true, badge: 'test' },
    { id: 'nasa', label: 'NASA TV', url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8', kind: 'live', enabled: true, badge: 'external', source: 'NASA TV' },
    { id: 'redbull', label: 'Red Bull TV', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8', kind: 'live', enabled: true, badge: 'external', source: 'Red Bull TV' },
    { id: 'abr', label: 'Test ABR', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', kind: 'abr', enabled: true, badge: 'test' },
    { id: 'vod2', label: 'Test VOD 2', url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8', kind: 'vod', enabled: true, badge: 'test' },
    { id: 'aja', label: 'Al Jazeera Arabic', url: 'https://live-hls-web-aja.getaj.net/AJA/index.m3u8', kind: 'live', enabled: false, badge: 'external', source: 'Al Jazeera Arabic', nativeOnly: true },
  ]);
  assert.equal(TF.defaults().filter((f) => f.enabled !== false).length, 5, 'wall shows five tiles; AJA stays off (no CORS telemetry)');
  assert.equal(TF.MAX_ACTIVE, 4);
  assert.equal(TF.KV_KEY, 'testfeeds');
});

test('sanitize drops invalid feeds and caps the list', () => {
  const TF = makeWin().MuseTestFeeds;
  const out = TF.sanitize([
    { id: 'ok', label: 'Fine', url: 'https://example.com/a.m3u8', kind: 'live' },
    { id: 'BAD ID', label: 'x', url: 'https://example.com/b.m3u8', kind: 'live' },
    { id: 'nohttps', label: 'x', url: 'http://example.com/c.m3u8', kind: 'live' },
    { id: 'badkind', label: 'x', url: 'https://example.com/d.m3u8', kind: 'dash' },
    { id: 'nolabel', label: '  ', url: 'https://example.com/e.m3u8', kind: 'vod' },
    { id: 'ok', label: 'dupe', url: 'https://example.com/f.m3u8', kind: 'vod' },
    null, 'junk',
  ]);
  assert.deepEqual(plain(out), [{ id: 'ok', label: 'Fine', url: 'https://example.com/a.m3u8', kind: 'live', enabled: true, badge: 'test' }]);
  assert.deepEqual(plain(TF.sanitize([{ id: 'dashonly', label: 'x', url: 'https://example.com/manifest.mpd', kind: 'live' }])), [], 'HLS only: non-.m3u8 URLs are dropped');
  const ext = TF.sanitize([{ id: 'ext', label: 'NASA TV', url: 'https://example.com/nasa.m3u8', kind: 'live', badge: 'external', source: 'NASA TV' }]);
  assert.equal(ext[0].badge, 'external');
  assert.equal(ext[0].source, 'NASA TV');
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 'f' + i, label: 'F', url: 'https://example.com/f.m3u8', kind: 'vod' }));
  assert.equal(TF.sanitize(many).length, 12);
  assert.deepEqual(plain(TF.sanitize('nope')), []);
});

test('KV override merges per id: wins, disables, appends; garbage ignored', () => {
  const TF = makeWin().MuseTestFeeds;
  const merged = TF.merge(TF.defaults(), [
    { id: 'live', label: 'Test Live', url: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8', kind: 'live', enabled: false },
    { id: 'abr', label: 'Renamed ABR', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', kind: 'abr' },
    { id: 'extra', label: 'Extra', url: 'https://example.com/x.m3u8', kind: 'vod' },
    { id: 'bogus!!', label: 'x', url: 'https://example.com/y.m3u8', kind: 'vod' },
  ]);
  assert.equal(merged.find((f) => f.id === 'live').enabled, false);
  assert.equal(merged.find((f) => f.id === 'abr').label, 'Renamed ABR');
  assert.equal(merged.find((f) => f.id === 'vod2').label, 'Test VOD 2');
  assert.ok(merged.find((f) => f.id === 'extra'), 'valid override-only ids are appended');
  assert.ok(!merged.find((f) => f.id === 'bogus!!'));
});

test('decoder budget: pickActive caps at 4, visible tiles first', () => {
  const TF = makeWin().MuseTestFeeds;
  const feeds = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, enabled: true }));
  const p = TF.pickActive(feeds, { a: false, b: false, c: false, d: false, f: false }, 4);
  assert.deepEqual(plain(p.active), ['e', 'a', 'b', 'c']);
  assert.deepEqual(plain(p.poster), ['d', 'f']);
  assert.deepEqual(plain(TF.pickActive(feeds.slice(0, 2), {}, 4).poster), []);
});

test('chooseVictims parks offscreen first, then least-recently-touched, keeps the tapped tile', () => {
  const TF = makeWin().MuseTestFeeds;
  const active = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(plain(TF.chooseVictims(active, { a: false }, { a: 1, b: 2, c: 3, d: 4, e: 5 }, 4)), ['a']);
  assert.deepEqual(plain(TF.chooseVictims(active, {}, { a: 5, b: 1, c: 4, d: 3, e: 2 }, 4)), ['b']);
  assert.deepEqual(plain(TF.chooseVictims(active, {}, { a: 1, b: 2, c: 3, d: 4, e: 5 }, 4, 'a')), ['b'], 'tapped tile survives even when oldest');
  assert.deepEqual(plain(TF.chooseVictims(['a', 'b'], {}, {}, 4)), [], 'within budget parks nothing');
});

test('tiles badge synthetic vs external honestly and stay poster-first', () => {
  const TF = makeWin().MuseTestFeeds;
  const html = TF.sectionHTML();
  const tiles = html.match(/data-testfeed="/g) || [];
  assert.equal(tiles.length, 5, 'five enabled tiles; disabled AJA is not rendered');
  assert.match(html, /not production programming/);
  assert.match(html, /data-hls-slot="test:live"/);
  assert.match(html, /data-hls-slot="test:nasa"/);
  assert.match(html, /data-hls-slot="test:redbull"/);
  assert.match(html, /External live feed · NASA TV/);
  assert.match(html, /External live feed · Red Bull TV/);
  assert.match(html, /Third-party broadcast · not a Muse production/);
  assert.match(html, /stay paused until hover or click/);
  const tile = TF.tileHTML(TF.defaults()[0]);
  assert.match(tile, /Test feed/);
  assert.match(tile, /Rehearsal loop/);
  assert.match(tile, /data-defer="1"/, 'poster-first: no decoder until hover/click');
  assert.match(tile, /onmouseenter="MuseTestFeeds\.hoverPreview/);
  assert.match(tile, /MuseStreaming\.toggleAudio/, 'mute button lives on the thumbnail');
  const nasa = TF.tileHTML(TF.defaults().find((f) => f.id === 'nasa'));
  assert.match(nasa, /is-external/);
  assert.doesNotMatch(nasa, /fictional/i);
});

test('health check: playlist ok → up, gone → down, network/CORS failure → unverified', async () => {
  const mk = (fetch) => makeWin({ fetch }).MuseTestFeeds;
  const feed = { id: 'x', url: 'https://example.com/x.m3u8' };
  const up = mk(async () => ({ ok: true, text: async () => '#EXTM3U\n#EXT-X-VERSION:3\n' }));
  assert.equal(await up.check(feed), 'up');
  const gone = mk(async () => ({ ok: false, status: 404 }));
  assert.equal(await gone.check(feed), 'down');
  const notPlaylist = mk(async () => ({ ok: true, text: async () => '<html>nope</html>' }));
  assert.equal(await notPlaylist.check(feed), 'down');
  const corsBlocked = mk(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(await corsBlocked.check(feed), 'unverified', 'CORS-blocked fetch must not blank a playable tile');
});

test('retry re-runs the health check for the tile', async () => {
  let calls = 0;
  const win = makeWin({ fetch: async () => { calls++; return { ok: true, text: async () => '#EXTM3U' }; } });
  const TF = win.MuseTestFeeds;
  TF.retry('live');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, 1);
  assert.equal(TF._state().health.live, 'up');
  TF.retry('missing');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, 1, 'unknown ids are ignored');
});

test('qualityOf reads dropped frames, tolerates missing API', () => {
  const TF = makeWin().MuseTestFeeds;
  assert.deepEqual(plain(TF.qualityOf({ getVideoPlaybackQuality: () => ({ droppedVideoFrames: 7, totalVideoFrames: 900 }) })), { dropped: 7, total: 900 });
  assert.equal(TF.qualityOf({}), null);
  assert.equal(TF.qualityOf(null), null);
  assert.equal(TF.qualityOf({ getVideoPlaybackQuality: () => { throw new Error('x'); } }), null);
});

test('test-feed URLs stay in the config module, never in player code', () => {
  const player = fs.readFileSync(path.join(ROOT, 'js/muse-streaming.js'), 'utf8');
  assert.ok(!player.includes('akamaized.net/hls'), 'live test URL must not be hardcoded in the player');
  assert.ok(!player.includes('tears-of-steel/tears-of-steel.ism'), 'vod2 test URL must not be hardcoded in the player');
  const cfg = fs.readFileSync(path.join(ROOT, 'js/muse-testfeeds.js'), 'utf8');
  assert.ok(cfg.includes('akamaized.net/hls/live/2000341/test/master.m3u8'));
});

test('wall renders the test section and hands it to the test module on mount', () => {
  let mountedWith = null;
  const win = loadBrowserModule('js/muse-streaming.js', {
    productions: { museaitour: { name: 'Muse AI Tour' } },
    order: ['museaitour'],
    setTimeout: () => 0,
    esc: ESC,
    MuseTestFeeds: { sectionHTML: () => '<section id="msTestFeeds">TESTS</section>', mount: (h) => { mountedWith = h; } },
  });
  let html = '';
  const host = { set innerHTML(v) { html = v; }, querySelectorAll: () => [] };
  win.document.getElementById = () => host;
  win.MuseStreaming.renderWall();
  assert.match(html, /TESTS/);
  assert.equal(mountedWith, host);
});

test('observe client exposes perf/inp measurement points', () => {
  const bodies = [];
  const win = loadBrowserModule('js/muse-observe.js', {
    fetch: async (url, opts) => { bodies.push(JSON.parse(String(opts.body))); return {}; },
  });
  win.document.cookie = 'muse_authed=1';
  assert.equal(typeof win.MuseObserve.perf, 'function');
  assert.equal(typeof win.MuseObserve.inp, 'function');
  win.MuseObserve.perf('tile_inp', 42, '.ms-test');
  win.MuseObserve.perf('tile_dropped', 3, 'live');
  win.MuseObserve.flush();
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].events.map((e) => [e.t, e.k, e.v]), [['perf', 'tile_inp', 42], ['perf', 'tile_dropped', 3]]);
  win.MuseObserve.inp('.ms-test'); // no PerformanceObserver in vm: must not throw
});

test('telemetry log carries timestamp, feed id and payload per feed, capped', () => {
  const TF = makeWin().MuseTestFeeds;
  const e = TF.event('live', 'level', { level: 1, bitrate: 2400000 });
  assert.ok(e.ts && !isNaN(Date.parse(e.ts)));
  assert.equal(e.feed, 'live');
  assert.equal(e.type, 'level');
  assert.deepEqual(plain(e.payload), { level: 1, bitrate: 2400000 });
  for (let i = 0; i < 130; i++) TF.event('live', 'buffer', { buffer_s: 4 });
  assert.equal(TF.eventsOf('live').length, 120);
  assert.equal(TF.eventsOf('abr').length, 0, 'one tile never logs into another');
  assert.equal(TF.event('nope', 'level', {}), null, 'unknown feeds are ignored');
  assert.equal(TF.event(null), null);
});

test('level, error and stall events update per-tile QoE (HLS only)', () => {
  const TF = makeWin().MuseTestFeeds;
  TF.event('live', 'manifest', { renditions: 5 });
  TF.event('live', 'level', { level: 2, bitrate: 2400000, width: 1280, height: 720, renditions: 5 });
  let q = plain(TF.qoeOf('live'));
  assert.equal(q.bitrate_kbps, 2400);
  assert.equal(q.resolution, '1280×720');
  assert.equal(q.renditions, 5);
  assert.equal(q.switches, 1);
  assert.equal(q.state, 'playing');
  TF.event('live', 'hls-error', { type: 'MEDIA_ERROR', details: 'fragParsingError', fatal: false });
  TF.event('live', 'hls-error', { type: 'MEDIA_ERROR', details: 'bufferStalledError', fatal: false });
  TF.event('live', 'stall', { via: 'video-waiting' });
  q = plain(TF.qoeOf('live'));
  assert.equal(q.errors, 2);
  assert.equal(q.frag_errors, 1);
  assert.equal(q.stalls, 2, 'bufferStalledError counts as a stall too');
  TF.event('abr', 'yt-state', { state: 'buffering', prev: 'playing' });
  q = plain(TF.qoeOf('abr'));
  assert.equal(q.player, 'hls', 'HLS only: legacy embed events never switch the player');
  assert.equal(q.stalls, 0, 'embed state cannot fabricate HLS stalls');
  TF.event('abr', 'dropped', { dropped: 9, total: 900, delta: 9 });
  TF.event('abr', 'buffer', { buffer_s: 6.2 });
  q = plain(TF.qoeOf('abr'));
  assert.equal(q.dropped, 9);
  assert.equal(q.buffer_s, 6.2);
  assert.equal(plain(TF.qoeOf('live')).stalls, 2, 'abr samples leave live untouched');
});

test('every tile renders its own QoE line and the section holds the risk list', () => {
  const TF = makeWin().MuseTestFeeds;
  TF.event('live', 'level', { level: 1, bitrate: 2400000, width: 1280, height: 720 });
  const tile = TF.tileHTML(TF.defaults()[0]);
  assert.match(tile, /data-tf-qoe="live"/);
  assert.match(tile, /2\.4 Mbps · 1280×720/);
  assert.match(TF.sectionHTML(), /data-tf-risks/);
});

test('stall storm, rendition collapse and frag errors signal independently per feed', () => {
  const TF = makeWin().MuseTestFeeds;
  let now = Date.now();
  TF._clock(() => now);
  const sigs = (id) => plain(TF.signals(id).map((s) => s.kind));
  // Stall storm: three episodes (>2 s apart) inside a minute.
  TF.event('live', 'stall', {});
  now += 1000;
  TF.event('live', 'stall', {});
  assert.deepEqual(sigs('live'), [], 'two stalls one second apart are one episode');
  now += 10000;
  TF.event('live', 'stall', {});
  now += 10000;
  TF.event('live', 'stall', {});
  assert.deepEqual(sigs('live'), ['stall-storm']);
  assert.equal(TF.signals('live')[0].level, 'high');
  assert.deepEqual(sigs('abr'), [], 'other feeds stay clean');
  // Rendition collapse: half the session peak or worse, held 30 s. A fresh drop is not a signal.
  TF.event('vod2', 'level', { level: 3, bitrate: 8000000 });
  now += 5000;
  TF.event('vod2', 'level', { level: 0, bitrate: 2000000 });
  assert.deepEqual(sigs('vod2'), [], 'a fresh drop may still recover');
  now += 31000;
  assert.deepEqual(sigs('vod2'), ['rendition-collapse']);
  assert.equal(TF.signals('vod2')[0].level, 'med');
  // Fragment/decoder errors: two in five minutes, fatal or not.
  now += 1000;
  TF.event('abr', 'hls-error', { details: 'fragParsingError', fatal: false });
  assert.deepEqual(sigs('abr'), []);
  now += 1000;
  TF.event('abr', 'hls-error', { details: 'fragLoadError', fatal: true });
  assert.deepEqual(sigs('abr'), ['frag-errors']);
  assert.equal(TF.signals('abr')[0].level, 'high');
  TF._clock(null);
});

test('sustained degradation parks a Show Caller approval; nothing auto-executes', () => {
  const approvals = [];
  let approved = 0;
  const win = makeWin({
    MuseShowCaller: {
      requestApproval: (plan, show, extra) => { const a = { id: 'SC-1', plan, show, note: extra && extra.note }; approvals.push(a); return a; },
      pendingList: () => approvals.slice(),
      approve: () => { approved++; return { ok: true }; },
    },
  });
  const TF = win.MuseTestFeeds;
  let now = Date.now();
  TF._clock(() => now);
  for (let t = 0; t <= 130000; t += 10000) { // a stall every 10 s, evaluated as time passes
    now += 10000;
    TF.event('live', 'stall', {});
    TF.evaluate('live');
  }
  assert.equal(approvals.length, 1, 'raised once, not on every evaluation');
  const [a] = approvals;
  assert.equal(a.show, 'testfeed:live');
  assert.equal(a.plan.area, 'streams');
  assert.equal(a.plan.action, 'retry_feed');
  assert.match(a.plan.for, /stall storm/);
  assert.ok(a.plan.detail.fix, 'a proposed fix travels with the risk');
  assert.deepEqual(plain(a.plan.sources), ['test feed · live', 'player telemetry · stall-storm']);
  assert.equal(approved, 0, 'the module never approves anything by itself');
  const brief = plain(TF.riskBrief());
  assert.equal(brief.show, 'Test feeds');
  assert.equal(brief.key, 'testfeeds');
  assert.equal(brief.risks.length, 1);
  assert.deepEqual(Object.keys(brief.risks[0]).sort(), ['area', 'level', 'sources', 'text'], 'standard Show Caller risk shape');
  assert.equal(brief.grounding.lines, 1);
  TF._clock(null);
});

test('status and agent brief surface live feed telemetry', () => {
  const TF = makeWin().MuseTestFeeds;
  TF.event('live', 'level', { level: 1, bitrate: 2400000, width: 1280, height: 720 });
  TF.event('live', 'stall', {});
  const st = plain(TF.status());
  assert.equal(st.feeds.length, 5);
  const live = st.feeds.find((f) => f.id === 'live');
  assert.equal(live.qoe.bitrate_kbps, 2400);
  assert.equal(live.qoe.stalls, 1);
  assert.equal(live.recent.length, 2);
  assert.deepEqual(plain(TF.status('live')).feeds.map((f) => f.id), ['live']);
  assert.deepEqual(plain(TF.status('nope')).feeds, []);
  const brief = plain(TF.agentBrief());
  assert.equal(brief.feeds.length, 5);
  assert.equal(brief.feeds[0].stalls, 1);
  assert.equal(brief.pending_fixes, 0);
});

test('retry resets a tile telemetry, approvals stay with the human', async () => {
  const approvals = [{ id: 'SC-9', show: 'testfeed:live' }];
  const win = makeWin({
    fetch: async () => ({ ok: true, text: async () => '#EXTM3U' }),
    MuseShowCaller: { pendingList: () => approvals.slice() },
  });
  const TF = win.MuseTestFeeds;
  TF.event('live', 'stall', {});
  TF.event('live', 'stall', {});
  assert.equal(TF.qoeOf('live').stalls, 2);
  TF.retry('live');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(TF.qoeOf('live'), null);
  assert.deepEqual(plain(TF.eventsOf('live')), []);
  assert.equal(plain(TF.status()).pending.length, 1, 'pending approvals are untouched by retry');
});

test('the agent reads feeds from live telemetry (snapshot brief + feed tool)', () => {
  const agent = fs.readFileSync(path.join(ROOT, 'js/muse-agent.js'), 'utf8');
  assert.ok(agent.includes('test_feeds:'), 'snapshot carries the feed brief');
  assert.ok(agent.includes('MuseTestFeeds.agentBrief'), 'snapshot reads live data, not fixtures');
  assert.ok(agent.includes('get_feed_status'), 'client tool exists');
  assert.ok(agent.includes('TF.status(feed)'), 'tool answers from the live status read');
});

test('observe server aggregates perf samples per key (n/sum/max)', async () => {
  const env = { MUSE_KV: memoryKV() }, user = { u: 'qa@example.com', r: 'engineer' };
  const events = [
    { t: 'perf', k: 'tile_inp', v: 40 }, { t: 'perf', k: 'tile_inp', v: 120 },
    { t: 'perf', k: 'tile_dropped', v: 7 }, { t: 'perf', k: 'tile_dropped', v: 'junk' },
  ];
  assert.equal((await observeReq(ctx('/api/observe', { method: 'POST', body: { events }, env, user }))).status, 200);
  const day = new Date().toISOString().slice(0, 10);
  const agg = await env.MUSE_KV.get('obs:' + day, 'json');
  assert.deepEqual(agg.perf.tile_inp, { n: 2, sum: 160, max: 120 });
  assert.deepEqual(agg.perf.tile_dropped, { n: 2, sum: 7, max: 7 });
});
