import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

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

test('the listen and play buttons keep their own clicks', () => {
  let opened = '';
  const win = makeWin({ navGo: (k) => { opened = k; } });
  const MS = win.MuseStreaming;
  const screen = { querySelector: () => ({ parentNode: null, remove() {} }) };
  MS.screenClick({ target: { closest: (sel) => (sel === '.ms-audio' ? {} : null) } }, screen, 'museaitour');
  MS.screenClick({ target: { closest: (sel) => (sel === '.ms-play' ? {} : null) } }, screen, 'orion');
  assert.equal(opened, '');
});
