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
