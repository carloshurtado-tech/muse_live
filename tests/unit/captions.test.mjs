import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

const BTOA = (bin) => Buffer.from(bin, 'binary').toString('base64');

test('captions: WAV encoder writes a valid RIFF header and round-trips samples', () => {
  const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA });
  const enc = w.MuseCaptions.encodeWav;
  const n = 1600, s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.round(Math.sin(i / 10) * 10000);
  const raw = Buffer.from(enc(s, 16000), 'base64');
  assert.equal(raw.slice(0, 4).toString(), 'RIFF');
  assert.equal(raw.slice(8, 12).toString(), 'WAVE');
  assert.equal(raw.readUInt32LE(24), 16000);
  assert.equal(raw.readUInt16LE(34), 16);
  assert.equal(raw.length, 44 + n * 2);
  for (const i of [0, 7, 999, 1599]) assert.equal(raw.readInt16LE(44 + i * 2), s[i]);
});

test('captions: transcript store searches case-insensitively', () => {
  const seed = { demo: [
    { ts: 't1', text: 'The keynote starts in five minutes', final: true },
    { ts: 't2', text: 'Camera two is drifting', final: true },
  ] };
  const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA });
  w.localStorage.setItem('muselive_captions_v1', JSON.stringify(seed));
  assert.equal(w.MuseCaptions.lines('demo').length, 2);
  assert.equal(w.MuseCaptions.search('demo', 'KEYNOTE').length, 1);
  assert.equal(w.MuseCaptions.search('demo', '').length, 0);
});

test('captions: tap never routes program audio to the speakers', async () => {
  const connected = [];
  const dest = { name: 'speakers' };
  const src = { connect: (node) => connected.push(node) };
  const actx = { destination: dest, state: 'running',
    createMediaElementSource: () => src,
    audioWorklet: { addModule: () => Promise.resolve() } };
  function FakeAC() { return actx; }
  function FakeNode() { this.port = {}; }
  const video = { tagName: 'VIDEO', muted: true };
  const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA, AudioContext: FakeAC, AudioWorkletNode: FakeNode,
    MuseStreaming: { videoFor: () => video } });
  const r = w.MuseCaptions.start('demo', 'wall:backup');
  assert.equal(r.ok, true);
  assert.equal(await r.ready, true);
  assert.ok(connected.length > 0, 'tap feeds the transcription worklet');
  assert.ok(connected.indexOf(dest) < 0, 'tap must never connect to the speakers');
  w.MuseCaptions.stop('demo');
});

test('captions: a failed tap leaves the element muted', async () => {
  const src = { connect: () => {}, disconnect: () => {} };
  const actx = { destination: {}, state: 'running',
    createMediaElementSource: () => src,
    audioWorklet: { addModule: () => Promise.reject(new Error('no worklet')) } };
  function FakeAC() { return actx; }
  const video = { tagName: 'VIDEO', muted: false };
  const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA, AudioContext: FakeAC,
    MuseStreaming: { videoFor: () => video } });
  const r = w.MuseCaptions.start('demo', 'wall:backup');
  assert.equal(await r.ready, false);
  assert.equal(video.muted, true, 'failed tap must not leave program audio audible');
  w.MuseCaptions.stop('demo');
});

test('captions: monitor mode keeps a tapped program audible, default stays silent', async () => {
  const mkTap = () => {
    const connected = [];
    const dest = { name: 'speakers' };
    const src = { connect: (node) => connected.push(node) };
    const actx = { destination: dest, state: 'running',
      createMediaElementSource: () => src,
      audioWorklet: { addModule: () => Promise.resolve() } };
    function FakeAC() { return actx; }
    function FakeNode() { this.port = {}; }
    const video = { tagName: 'VIDEO', muted: false };
    const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA, AudioContext: FakeAC, AudioWorkletNode: FakeNode,
      MuseStreaming: { videoFor: () => video } });
    return { w, connected, dest };
  };
  const silent = mkTap();
  const r1 = silent.w.MuseCaptions.start('demo', 'wall:backup');
  assert.equal(await r1.ready, true);
  assert.ok(silent.connected.indexOf(silent.dest) < 0, 'backup tap stays off the speakers');
  const mon = mkTap();
  const r2 = mon.w.MuseCaptions.start('demo2', 'wall:program', { monitor: true });
  assert.equal(await r2.ready, true);
  assert.ok(mon.connected.indexOf(mon.dest) >= 0, 'monitored program tap reaches the speakers');
});

test('captions: a consumed element rebuilds the player and retries the tap', () => {
  let taps = 0, resets = 0;
  const src = { connect: () => {} };
  const actx = { destination: {}, state: 'running', close: () => {},
    createMediaElementSource: () => { taps++; if (taps === 1) throw new Error('already used'); return src; },
    audioWorklet: { addModule: () => Promise.resolve() } };
  function FakeAC() { return actx; }
  function FakeNode() { this.port = {}; }
  const v1 = { tagName: 'VIDEO', muted: false }, v2 = { tagName: 'VIDEO', muted: true };
  let cur = v1;
  const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA, AudioContext: FakeAC, AudioWorkletNode: FakeNode,
    MuseStreaming: { videoFor: () => cur, resetSlot: () => { resets++; cur = v2; } } });
  const r = w.MuseCaptions.start('demo', 'wall:program');
  assert.equal(r.ok, true, 'retry on the rebuilt player succeeds');
  assert.equal(resets, 1);
  assert.equal(v2.muted, false, 'fresh element is unmuted for the tap signal');
  assert.equal(w.MuseCaptions.status('demo').running, true);
  w.MuseCaptions.stop('demo');
});

test('captions: a re-tap with no rebuild path fails silent, never audible', () => {
  const actx = { destination: {}, state: 'running', close: () => {},
    createMediaElementSource: () => { throw new Error('already used'); },
    audioWorklet: { addModule: () => Promise.resolve() } };
  function FakeAC() { return actx; }
  const video = { tagName: 'VIDEO', muted: false };
  const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA, AudioContext: FakeAC,
    MuseStreaming: { videoFor: () => video } });
  const r = w.MuseCaptions.start('demo', 'wall:program');
  assert.equal(r.ok, false);
  assert.equal(video.muted, true, 'failed re-tap must not leak feed audio to the room');
});

test('captions: transcribe fetch carries an AbortSignal timeout (BUG-38)', async () => {
  let seen = null;
  const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA, AbortSignal,
    fetch: async (url, init) => { seen = init; return { status: 200, json: async () => ({ ok: true, transcript: 'hello' }) }; } });
  const r = await w.MuseCaptions.transcribeClip('AAAA');
  assert.equal(r.ok, true);
  assert.ok(seen && seen.signal, 'transcribe fetch must pass an AbortSignal (timeout)');
});

test('captions: failed transcribe clears the overlay to unavailable, not frozen LIVE (BUG-16)', async () => {
  let intervalFn = null, nodeInst = null;
  const ccEl = { className: '', textContent: 'Standby camera two…', setAttribute() {} };
  const screenEl = { _cc: ccEl, querySelector: () => screenEl._cc, appendChild: (el) => { screenEl._cc = el; } };
  const doc = { querySelector: (sel) => (String(sel).includes('wall:backup') ? screenEl : null), createElement: () => ccEl };
  function FakeNode() { this.port = {}; nodeInst = this; }
  const src = { connect: () => {} };
  const actx = { destination: {}, state: 'running', createMediaElementSource: () => src, audioWorklet: { addModule: () => Promise.resolve() } };
  function FakeAC() { return actx; }
  const video = { tagName: 'VIDEO', muted: true };
  const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA, AudioContext: FakeAC, AudioWorkletNode: FakeNode,
    MuseStreaming: { videoFor: () => video }, document: doc,
    setInterval: (fn) => { intervalFn = fn; return 1; },
    fetch: async () => ({ status: 502, json: async () => ({ ok: false, error: 'transcribe down' }) }) });
  const r = w.MuseCaptions.start('demo', 'wall:backup');
  assert.equal(await r.ready, true);
  nodeInst.port.onmessage({ data: new Int16Array(1600) });
  await intervalFn();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ccEl.textContent, 'Captions unavailable', 'failure must replace the frozen line: ' + JSON.stringify(ccEl.textContent));
  assert.ok(w.MuseCaptions.status('demo').lastError, 'failure is recorded');
  w.MuseCaptions.stop('demo');
});

test('captions: start refuses honestly without tappable audio or Web Audio', () => {
  const w = loadBrowserModule('js/muse-captions.js', { btoa: BTOA, MuseStreaming: {} });
  const r1 = w.MuseCaptions.start('demo', 'wall:program');
  assert.equal(r1.ok, false);
  assert.ok(/cannot be captioned/.test(r1.error));
  const w2 = loadBrowserModule('js/muse-captions.js', { btoa: BTOA,
    MuseStreaming: { videoFor: () => ({ tagName: 'VIDEO' }) } });
  const r2 = w2.MuseCaptions.start('demo', 'wall:program');
  assert.equal(r2.ok, false);
  assert.ok(/Web Audio/.test(r2.error));
  assert.equal(w2.MuseCaptions.status('demo').running, false);
  assert.equal(w2.MuseCaptions.stop('demo').ok, true);
});
