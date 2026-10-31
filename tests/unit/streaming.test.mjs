import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrowserModule, ROOT } from './helpers.mjs';

// Tile thumbnail clicks: the whole monitor area is the affordance, not just the
// small play button. Deferred (off-air) tiles play; live tiles open the show.
// The Listen button and the play button keep handling their own clicks.
function makeWin(over = {}) {
  return loadBrowserModule('js/muse-streaming.js', Object.assign({
    productions: { museaitour: { name: 'Muse AI Tour' }, orion: { name: 'Orion' } },
    order: ['museaitour', 'orion'],
    setTimeout: () => 0, // boot timer + slate guards never fire in-vm
    esc: (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  }, over));
}
function renderWallHTML(win) {
  let html = '';
  win.document.getElementById = () => ({ set innerHTML(v) { html = v; }, querySelectorAll: () => [] });
  win.MuseStreaming.renderWall();
  return html;
}

test('wall tiles wire the thumbnail click (deferred keeps its play button)', () => {
  const html = renderWallHTML(makeWin());
  assert.match(html, /onclick="MuseStreaming\.screenClick\(event,this,'museaitour'\)"/);
  assert.match(html, /onclick="MuseStreaming\.screenClick\(event,this,'orion'\)"/);
  assert.match(html, /ms-screen is-clickable/);
  const orionSlot = html.match(/<div class="ms-screen[^]*?data-hls-slot="wall:orion-s0"[^>]*>/)[0];
  assert.match(orionSlot, /data-defer="1"/);
  assert.match(html, /onclick="MuseStreaming\.play\(event,this\)"/);
  const liveSlot = html.match(/<div class="ms-screen[^]*?data-hls-slot="wall:museaitour-s0"[^>]*>/)[0];
  assert.doesNotMatch(liveSlot, /data-defer="1"/);
});

test('screen click on a live tile opens the theater, not the product page', () => {
  let navigated = '';
  const els = {};
  const mkEl = () => ({ style: {}, hidden: false, innerHTML: '', textContent: '',
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [], appendChild() {} });
  const win = makeWin({
    navGo: (k) => { navigated = k; },
    document: {
      createElement: () => mkEl(),
      getElementById: (id) => (els[id] = els[id] || mkEl()),
      body: { appendChild() {}, contains: () => true },
      addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [],
    },
  });
  const screen = { querySelector: () => null, getAttribute: () => 'wall:museaitour-s0' };
  win.MuseStreaming.screenClick({ target: { closest: () => null } }, screen, 'museaitour');
  assert.equal(navigated, '', 'no navigation away from the wall');
  assert.equal(els.msStreamModal.hidden, false, 'theater is open');
});

test('screen click on a deferred tile plays instead of opening', () => {
  let opened = '';
  const videos = [];
  const win = makeWin({
    navGo: (k) => { opened = k; },
    document: {
      createElement(tag) {
        const el = { tagName: String(tag).toUpperCase(), style: {}, parentNode: null, paused: true,
          setAttribute() {}, addEventListener() {}, removeAttribute() {}, load() {}, canPlayType: () => '',
          play() { this.paused = false; return Promise.resolve(); } };
        videos.push(el);
        return el;
      },
      head: { appendChild() {} },
    },
  });
  const MS = win.MuseStreaming;
  const slot = {
    attrs: { 'data-hls-slot': 'wall:orion-s0', 'data-url': 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    removeAttribute(n) { delete this.attrs[n]; },
    get firstChild() { return null; },
    insertBefore(node) { node.parentNode = this; },
    classList: { toggle() {} },
    querySelector: () => null,
  };
  slot.parentNode = { querySelectorAll: () => [slot] };
  const playBtn = { parentNode: slot, remove() {} };
  const screen = { querySelector: (sel) => (sel === '.ms-play' ? playBtn : null) };
  MS.screenClick({ target: { closest: () => null } }, screen, 'orion');
  assert.equal(opened, '');
  assert.equal(videos.filter((v) => v.tagName === 'VIDEO' && v.parentNode === slot).length, 1);
});

test('injected program drop becomes a crit anomaly Muse can fail over', () => {
  const win = makeWin();
  const MS = win.MuseStreaming;
  assert.equal(MS.injectFault('museaitour').ok, true);
  const a = MS.anomalies().find((x) => x.key === 'museaitour' && x.stage === 'program');
  assert.ok(a, 'fault surfaces as an anomaly');
  assert.equal(a.level, 'crit');
  assert.equal(a.recommendation.kind, 'failover_backup');
  const r = MS.applyAnomaly(a.id);
  assert.equal(r.ok, true);
  assert.match(r.text, /LiveU backup/);
  assert.equal(MS.anomalies().some((x) => x.stage === 'program'), false, 'fault cleared by failover');
});

test('stream theater opens in place and closes back to the wall', () => {
  const els = {};
  const mkEl = () => ({ style: {}, hidden: false, innerHTML: '', textContent: '',
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [], appendChild() {} });
  const win = makeWin({
    document: {
      createElement: () => mkEl(),
      getElementById: (id) => (els[id] = els[id] || mkEl()),
      body: { appendChild() {}, contains: () => true },
      addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [],
    },
  });
  const MS = win.MuseStreaming;
  MS.openStream('museaitour', 'wall:museaitour-s0');
  assert.match(els.msModalTitle.innerHTML, /Muse AI Tour/);
  assert.match(els.msModalTitle.innerHTML, /Meta Connect 2026/, 'real event program in the title');
  assert.equal(els.msStreamModal.hidden, false);
  MS.closeStream();
  assert.equal(els.msStreamModal.hidden, true);
});

test('tile buttons stop propagation so mute/CC/play never open the theater', () => {
  const win = makeWin();
  const MS = win.MuseStreaming;
  const slot = { removeAttribute() {}, parentNode: { querySelectorAll: () => [] } };
  const btn = { parentNode: slot, remove() {} };
  let n = 0;
  const evt = () => ({ stopPropagation() { n++; } });
  n = 0; MS.toggleAudio(evt(), 'wall:orion-s0', btn);
  assert.equal(n, 1, 'mute click must not bubble to the tile');
  n = 0; MS.toggleTileCC(evt(), btn, 'museaitour');
  assert.equal(n, 1, 'CC click must not bubble to the tile');
  n = 0; MS.play(evt(), btn);
  assert.equal(n, 1, 'play click must not bubble to the tile');
});

test('dead youtube embeds fall back to a watch link, not a black box', () => {
  const win = makeWin();
  const html = win.MuseStreaming.ytFallbackHTML('FZ-RZ0dKO8o', 1855);
  assert.match(html, /youtube\.com\/watch\?v=FZ-RZ0dKO8o/);
  assert.match(html, /Watch on YouTube/);
});

test('youtube mounts move the playing embed instead of recreating it', () => {
  // Regression: makeYt stored url:'yt:'+id while slots carry yt:id:offset:title,
  // so every mount saw a mismatch and rebuilt the iframe at a fresh wall-clock
  // start — the theater showed a different scene than the clicked tile.
  const wall = renderWallHTML(makeWin());
  const m = /data-hls-slot="(wall:museaitour-s0)" data-url="([^"]+)"/.exec(wall);
  assert.ok(m, 'wall renders the program tile with its slot and url');
  const [, slotKey, url] = m;
  assert.match(url, /^yt:/, 'program under test is a YouTube embed');
  const iframes = [];
  const win = makeWin({
    document: {
      createElement(tag) {
        const el = { tagName: String(tag).toUpperCase(), style: {}, parentNode: null,
          setAttribute() {}, addEventListener() {}, removeAttribute() {}, load() {}, loading: '' };
        if (el.tagName === 'IFRAME') iframes.push(el);
        return el;
      },
    },
  });
  const mkSlot = () => ({
    getAttribute(n) { return n === 'data-hls-slot' ? slotKey : n === 'data-url' ? url : n === 'data-live' ? '1' : null; },
    get firstChild() { return null; },
    insertBefore(node) { node.parentNode = this; },
    classList: { toggle() {} },
    querySelector: () => null,
  });
  const tile = mkSlot(), screen = mkSlot();
  win.MuseStreaming.mount({ querySelectorAll: () => [tile] });
  assert.equal(iframes.length, 1);
  assert.equal(iframes[0].parentNode, tile);
  win.MuseStreaming.mount({ querySelectorAll: () => [screen] });
  assert.equal(iframes.length, 1, 'second mount moves the embed, never rebuilds it');
  assert.equal(iframes[0].parentNode, screen, 'theater shows the playing embed, same position');
});

test('theater resolves the clicked stream whatever tile context opened it', () => {
  // Dashboard tiles carry dash:<id> slots; the theater must open that stream,
  // not silently fall back to the program feed.
  const els = {};
  const mkEl = () => ({ style: {}, hidden: false, innerHTML: '', textContent: '',
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [], appendChild() {} });
  const win = makeWin({
    document: {
      createElement: () => mkEl(),
      getElementById: (id) => (els[id] = els[id] || mkEl()),
      body: { appendChild() {}, contains: () => true },
      addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [],
    },
  });
  win.MuseStreaming.openStream('museaitour', 'dash:museaitour-s1');
  assert.match(els.msModalTitle.innerHTML, /Backup · LiveU bonded/, 'backup tile opens the backup feed');
  assert.doesNotMatch(els.msModalTitle.innerHTML, /Meta Connect 2026/, 'no program fallback');
});

test('dashboard rail carries the test-feed section for wow factor', () => {
  let mounted = null;
  const els = {};
  const mkEl = () => ({ style: {}, hidden: false, innerHTML: '', textContent: '',
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [], appendChild() {} });
  const win = makeWin({
    MuseTestFeeds: { sectionHTML: () => '<section id="msTestFeeds">TEST</section>', mount: (h) => { mounted = h; } },
    document: {
      createElement: () => mkEl(),
      getElementById: (id) => (els[id] = els[id] || mkEl()),
      body: { appendChild() {}, contains: () => true },
      addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [],
    },
  });
  win.MuseStreaming.renderDash();
  assert.match(els.dashStreams.innerHTML, /msTestFeeds/, 'test section renders on the dashboard');
  assert.equal(mounted, els.dashStreams, 'test players mount with the dashboard rail');
});

test('the listen and play buttons keep their own clicks', () => {
  let opened = '';
  const win = makeWin({ navGo: (k) => { opened = k; } });
  const MS = win.MuseStreaming;
  const screen = { querySelector: () => ({ parentNode: null, remove() {} }) };
  MS.screenClick({ target: { closest: (sel) => (sel === '.ms-audio' ? {} : null) } }, screen, 'museaitour');
  MS.screenClick({ target: { closest: (sel) => (sel === '.ms-play' ? {} : null) } }, screen, 'orion');
  assert.equal(opened, '');
});

// Test-feed player contract: hls.js only (never a native src), with level,
// error, manifest and YouTube state forwarded per tile into the feed telemetry.
function feedSlot(key, url) {
  return {
    attrs: { 'data-hls-slot': key, 'data-url': url },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    get firstChild() { return null; },
    insertBefore(node) { node.parentNode = this; },
    classList: { toggle() {} },
    querySelector: () => null,
  };
}
function fakeVideo() {
  return { tagName: 'VIDEO', style: {}, parentNode: null, paused: true, src: undefined,
    setAttribute() {}, addEventListener() {}, removeAttribute() {}, load() {},
    canPlayType: () => 'maybe', play() { return Promise.resolve(); } };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

test('test slots never take the native src path; regular tiles still can', async () => {
  const forwarded = [];
  const videos = [];
  const win = makeWin({
    Hls: { isSupported: () => false }, // no MSE anywhere: regular tiles fall back, test tiles must not
    MuseTestFeeds: { event: (id, type, payload) => forwarded.push([id, type, payload]) },
    document: { createElement: (tag) => { const v = fakeVideo(); v.tagName = String(tag).toUpperCase(); videos.push(v); return v; } },
  });
  const MS = win.MuseStreaming;
  MS.mount({ querySelectorAll: () => [feedSlot('test:live', 'https://example.com/live.m3u8')] });
  MS.mount({ querySelectorAll: () => [feedSlot('wall:orion-s0', 'https://example.com/orion.m3u8')] });
  await tick();
  assert.equal(videos.length, 2);
  assert.equal(videos[0].src, undefined, 'test slot must never set a native src');
  assert.equal(videos[1].src, 'https://example.com/orion.m3u8', 'regular tiles keep the native fallback');
  assert.deepEqual(forwarded.map((f) => [f[0], f[1]]), [['live', 'player-unavailable']]);
});

test('hls.js level switches, errors and manifests forward per-tile telemetry', async () => {
  const forwarded = [];
  const instances = [];
  function FakeHls() {
    this.handlers = {};
    this.levels = [
      { bitrate: 8000000, width: 1920, height: 1080 },
      { bitrate: 2400000, width: 1280, height: 720 },
      { bitrate: 800000, width: 640, height: 360 },
    ];
    this.currentLevel = 1;
    instances.push(this);
  }
  FakeHls.isSupported = () => true;
  FakeHls.Events = { LEVEL_SWITCHED: 'LEVEL_SWITCHED', ERROR: 'ERROR', MANIFEST_PARSED: 'MANIFEST_PARSED' };
  FakeHls.ErrorTypes = { NETWORK_ERROR: 'NETWORK_ERROR', MEDIA_ERROR: 'MEDIA_ERROR' };
  FakeHls.prototype.on = function (ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); };
  FakeHls.prototype.loadSource = function () {};
  FakeHls.prototype.attachMedia = function () {};
  const win = makeWin({
    Hls: FakeHls,
    MediaSource: function () {},
    MuseTestFeeds: { event: (id, type, payload) => forwarded.push({ id, type, payload: JSON.parse(JSON.stringify(payload)) }) },
    document: { createElement: () => fakeVideo() },
  });
  const MS = win.MuseStreaming;
  MS.mount({ querySelectorAll: () => [feedSlot('test:live', 'https://example.com/live.m3u8')] });
  MS.mount({ querySelectorAll: () => [feedSlot('wall:orion-s0', 'https://example.com/orion.m3u8')] });
  await tick();
  assert.equal(instances.length, 2);
  const h = instances[0];
  h.handlers.LEVEL_SWITCHED[0](null, { level: 1 });
  assert.deepEqual(forwarded[0], { id: 'live', type: 'level',
    payload: { level: 1, bitrate: 2400000, width: 1280, height: 720, renditions: 3 } });
  h.handlers.ERROR[0](null, { fatal: false, type: 'MEDIA_ERROR', details: 'fragParsingError', frag: { sn: 12, level: 1 } });
  assert.deepEqual(forwarded[1], { id: 'live', type: 'hls-error',
    payload: { type: 'MEDIA_ERROR', details: 'fragParsingError', fatal: false, frag: { sn: 12, level: 1 }, response_code: null } });
  h.handlers.ERROR[0](null, { fatal: true, type: 'NETWORK_ERROR', details: 'manifestLoadError' });
  assert.equal(forwarded[2].payload.fatal, true, 'fatal errors forward too');
  h.handlers.MANIFEST_PARSED[0]();
  assert.equal(forwarded[3].type, 'manifest');
  assert.equal(forwarded[3].payload.ladder.length, 3);
  const n = forwarded.length;
  instances[1].handlers.LEVEL_SWITCHED[0](null, { level: 0 });
  instances[1].handlers.ERROR[0](null, { fatal: false, details: 'fragParsingError' });
  assert.equal(forwarded.length, n, 'regular tiles never forward into feed telemetry');
});

test('youtube IFrame state flows into the same telemetry, with limits', async () => {
  const forwarded = [];
  const listeners = {};
  const posted = [];
  const contentWindow = { postMessage: (msg) => posted.push(JSON.parse(msg)) };
  let loadFn = null, nowValue = 1000000000000;
  const win = makeWin({
    MuseTestFeeds: { event: (id, type, payload) => forwarded.push({ id, type, payload: JSON.parse(JSON.stringify(payload)) }) },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    Date: { now: () => nowValue },
    document: {
      createElement: () => ({ tagName: 'IFRAME', style: {}, parentNode: null, contentWindow,
        setAttribute() {}, removeAttribute() {}, load() {}, addEventListener: (t, fn) => { if (t === 'load') loadFn = fn; } }),
    },
  });
  const MS = win.MuseStreaming;
  MS.mount({ querySelectorAll: () => [feedSlot('test:live', 'yt:dnT9cVv3Spw:0:Meta Connect 2026')] });
  assert.ok(loadFn, 'embed waits for load before subscribing');
  loadFn();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].event, 'listening');
  const msg = (info, origin = 'https://www.youtube-nocookie.com') =>
    listeners.message[0]({ origin, data: JSON.stringify({ event: 'infoDelivery', info }), source: contentWindow });
  msg({ playerState: 1, playbackQuality: 'hd720', videoLoadedFraction: 0.62, currentTime: 100.5 });
  assert.deepEqual(forwarded[0], { id: 'live', type: 'yt-state',
    payload: { state: 'playing', prev: 'unknown', quality: 'hd720', loaded_fraction: 0.62, t: 100.5 } });
  msg({ playerState: 3, playbackQuality: 'hd720', videoLoadedFraction: 0.63, currentTime: 101 });
  assert.equal(forwarded[1].payload.state, 'buffering');
  assert.equal(forwarded[1].payload.prev, 'playing');
  // Inferred stall: playing, but the playhead is frozen across samples.
  msg({ playerState: 1, playbackQuality: 'hd720', videoLoadedFraction: 0.7, currentTime: 120 });
  nowValue += 2000;
  msg({ playerState: 1, playbackQuality: 'hd720', videoLoadedFraction: 0.7, currentTime: 120 });
  const stalls = forwarded.filter((f) => f.type === 'yt-stall');
  assert.equal(stalls.length, 1);
  assert.equal(stalls[0].payload.inferred, true);
  nowValue += 500;
  msg({ playerState: 1, currentTime: 125 });
  assert.equal(forwarded.filter((f) => f.type === 'yt-stall').length, 1, 'a moving playhead clears the inference');
  const n = forwarded.length;
  msg({ playerState: 2 }, 'https://evil.example');
  assert.equal(forwarded.length, n, 'foreign origins are ignored');
  assert.equal(MS.ytInfo('wall:missing', { playerState: 1 }), null, 'unknown slots are ignored');
});

test('test-feed QoE beacons keep their own show key', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/muse-streaming.js'), 'utf8');
  assert.ok(src.includes("show: isTestSlot(k) ? 'testfeeds'"), 'QA traffic must not pollute a production panel');
});
