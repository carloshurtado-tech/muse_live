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

test('wall carries no show program decoders, only the test multiviewer', () => {
  const html = renderWallHTML(makeWin());
  assert.doesNotMatch(html, /data-hls-slot="wall:/, 'show monitors never mount on the wall');
  assert.doesNotMatch(html, /data-hls-slot="dash:/);
  assert.match(html, /availability by show/, 'text-only SLO table stays');
});

test('project plan tiles stay clickable and secondary tiles are poster-first', () => {
  const win = makeWin();
  const html = win.MuseStreaming.paneHTML('museaitour');
  assert.match(html, /data-hls-slot="proj:museaitour-s1"[^>]*data-defer="1"/, 'backup tile waits for Play');
  const liveSlot = html.match(/<div class="ms-screen[^]*?data-hls-slot="proj:museaitour-s0"[^>]*>/)[0];
  assert.doesNotMatch(liveSlot, /data-defer="1"/, 'the big program monitor still starts');
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

test('HLS only: no embed machinery remains and seeded programs are .m3u8', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/muse-streaming.js'), 'utf8');
  assert.doesNotMatch(src, /youtube|youtu\.be|parseYt|makeYt/i, 'player is HLS-only');
  const wall = makeWin().MuseStreaming.paneHTML('museaitour');
  const urls = [...wall.matchAll(/data-url="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.length >= 2);
  for (const u of urls) assert.match(u, /\.m3u8/, 'every seeded monitor is HLS: ' + u);
});

test('HLS mounts move the playing video instead of recreating it', async () => {
  const wall = makeWin().MuseStreaming.paneHTML('museaitour');
  const m = /data-hls-slot="(proj:museaitour-s0)" data-url="([^"]+)"/.exec(wall);
  assert.ok(m, 'plan renders the program tile with its slot and url');
  const [, slotKey, url] = m;
  assert.match(url, /\.m3u8/, 'program under test is an HLS feed');
  const videos = [];
  function FakeHls() { this.levels = [{ bitrate: 2400000, width: 1280, height: 720 }]; this.currentLevel = 0; }
  FakeHls.isSupported = () => true;
  FakeHls.Events = { LEVEL_SWITCHED: 'LEVEL_SWITCHED', ERROR: 'ERROR', MANIFEST_PARSED: 'MANIFEST_PARSED' };
  FakeHls.ErrorTypes = { NETWORK_ERROR: 'NETWORK_ERROR', MEDIA_ERROR: 'MEDIA_ERROR' };
  FakeHls.prototype.on = function () {};
  FakeHls.prototype.loadSource = function () {};
  FakeHls.prototype.attachMedia = function () {};
  const win = makeWin({
    Hls: FakeHls,
    MediaSource: function () {},
    document: {
      createElement(tag) {
        const el = { tagName: String(tag).toUpperCase(), style: {}, parentNode: null, paused: true,
          setAttribute() {}, addEventListener() {}, removeAttribute() {}, load() {}, canPlayType: () => '',
          play() { this.paused = false; return Promise.resolve(); } };
        if (el.tagName === 'VIDEO') videos.push(el);
        return el;
      },
      head: { appendChild() {} },
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
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(videos.length, 1);
  assert.equal(videos[0].parentNode, tile);
  win.MuseStreaming.mount({ querySelectorAll: () => [screen] });
  assert.equal(videos.length, 1, 'second mount moves the video, never rebuilds it');
  assert.equal(videos[0].parentNode, screen, 'theater shows the playing feed, same element');
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
  win.MuseStreaming.openStream('museaitour', 'proj:museaitour-s1');
  assert.match(els.msModalTitle.innerHTML, /Backup · LiveU bonded/, 'backup tile opens the backup feed');
  assert.doesNotMatch(els.msModalTitle.innerHTML, /Meta Connect 2026/, 'no program fallback');
});

test('dashboard carries no streams; they live on the wall only', () => {
  let mounted = null;
  const els = {};
  const mkEl = () => ({ style: {}, hidden: false, innerHTML: 'x', textContent: '',
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
  assert.equal(els.dashStreams.hidden, true, 'dashboard stream host stays hidden');
  assert.equal(els.dashStreams.innerHTML, '', 'no stream tiles on the dashboard');
  assert.equal(mounted, null, 'test feeds never mount on the dashboard');
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

test('theater carries full transport, telemetry and manual-caption controls', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/muse-streaming.js'), 'utf8');
  // Full transport: play/pause, seek, live, mute + volume, rate.
  for (const id of ['msTPlay', 'msTSeek', 'msTTime', 'msTMute', 'msTVol', 'msTRate', 'msTLive']) assert.ok(src.includes(id), 'transport control ' + id);
  for (const fn of ['transportPlayPause', 'transportSeek', 'transportVolume', 'transportMute', 'transportLive']) assert.ok(src.includes(fn), 'handler ' + fn);
  // Centered theater over a blurred backdrop with the requested live telemetry.
  assert.ok(src.includes('ms-modal-backdrop'), 'blurred backdrop');
  for (const label of ['State', 'Resolution', 'Codec', 'Rendition', 'Bandwidth est.', 'Live latency', 'Buffer ahead', 'Dropped frames', 'Stalls / errors', 'Bitrate']) assert.ok(src.includes("'" + label + "'"), 'telemetry row ' + label);
  assert.ok(src.includes('>Stream facts<'), 'Stream facts section');
  // Thumbnail mute + captions show/hide + export in vtt/srt/txt.
  assert.ok(src.includes('MuseStreaming.toggleAudio'), 'thumbnail mute');
  assert.ok(src.includes('toggleCaptionsVisible'), 'caption hide/show');
  assert.ok(src.includes("exportCaptions('srt')") || src.includes('exportCaptions'), 'caption export');
});

test('opening or playing a stream never auto-starts billed transcription', () => {
  let starts = 0;
  const els = {};
  const mkEl = () => ({ style: {}, hidden: false, innerHTML: '', textContent: '',
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [], appendChild() {} });
  const win = makeWin({
    MuseCaptions: { start: () => { starts++; return { ok: true }; }, stop: () => {}, status: () => ({ running: false, lines: 0 }), lines: () => [], search: () => [] },
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
  assert.equal(els.msStreamModal.hidden, false, 'theater opened');
  assert.equal(starts, 0, 'manual only: a click/play must never start Muse Voice Transcribe');
});

test('test-feed QoE beacons keep their own show key', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/muse-streaming.js'), 'utf8');
  assert.ok(src.includes("show: isTestSlot(k) ? 'testfeeds'"), 'QA traffic must not pollute a production panel');
});

test('added streams are paused posters in the shared streams store', () => {
  let toasted = '';
  const win = makeWin({ toast: (m) => { toasted = m; }, renderProjectView: () => {}, URL });
  const MS = win.MuseStreaming;
  MS.addStream('orion', { name: { value: 'Roof cam' }, url: { value: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }, role: { value: 'iso' } });
  assert.match(toasted, /paused poster/);
  const names = MS.summary('orion').streams.map((s) => s.name);
  assert.ok(names.includes('Roof cam'), 'added stream is on the project');
  const pane = MS.paneHTML('orion');
  assert.match(pane, /Roof cam[^]*?data-defer="1"|data-defer="1"[^]*?Roof cam/, 'added tile never autoplays');
  const stored = JSON.parse(win.localStorage.getItem('muselive_streams_v1'));
  assert.ok(JSON.stringify(stored).includes('Roof cam'), 'persisted in muselive_streams_v1 (KV-synced platform-wide)');
});

test('hover suspend can never freeze the theater; toggle buttons paint active states', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/muse-streaming.js'), 'utf8');
  assert.ok(src.includes('if (slot && slot === modal.slot) return;'), 'suspendSlot spares the theater slot');
  assert.ok(src.includes('theaterSlot'), 'streaming exposes the theater slot');
  assert.ok(src.includes("classList.toggle('is-on', !!live)"), 'Listen paints active state');
  assert.ok(src.includes('msModalPiPBtn'), 'PiP button is stateful');
  assert.ok(src.includes('pictureinpicturechange'), 'PiP state follows the browser session');
  const tf = fs.readFileSync(path.join(ROOT, 'js/muse-testfeeds.js'), 'utf8');
  assert.ok(tf.includes('M.theaterSlot() === slotOf(id)'), 'hover-end spares the expanded feed');
  assert.ok(tf.includes('WALL_MAX = 4'), 'test & external wall is hard-capped at 4 feeds');
});
