import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// A resolved notice must disappear on its own, and Apply must act on live
// state instead of refusing against a stale snapshot. The drawer panel has
// no DOM in node, so these pin the wiring at the source.
const src = fs.readFileSync(path.join(ROOT, 'js', 'muse-proactive.js'), 'utf8');

test('resolved notices auto-clear with badge step-down', () => {
  assert.ok(src.includes('autoResolve'), 'stale cards must auto-finish');
  assert.ok(src.includes('unsee('), 'auto-clear must un-see so a recurrence re-raises');
  assert.ok(src.includes('if (P.unread > 0) P.unread--'), 'badge must step down on auto-clear');
});

test('Apply re-reads the live anomaly instead of refusing on a stale snapshot', () => {
  assert.ok(!src.includes('already cleared'), 'the stale-snapshot refusal must be gone');
  assert.ok(src.includes('live.recommendation'), 'Apply must prefer the current recommendation');
});

test('every notice opens its solution, even after it resolves', () => {
  assert.ok(src.includes('MuseProactive.view('), 'cards must carry a View action');
  assert.ok(src.includes('View stream'), 'stream notices must offer the stream view');
  assert.ok(src.includes('View conflicts'), 'conflict notices must offer the conflicts view');
  assert.ok(src.includes('MuseStreaming.openShow(item.key)'), 'View must land on the show streaming plan');
  assert.ok(src.includes('gotoConflicts(item)'), 'review and View must share the exact-conflict landing');
});

test('notices can be deleted from the panel', () => {
  assert.ok(src.includes('MuseProactive.remove('), 'cards must carry a remove action');
  assert.ok(src.includes('class="mp-x"'), 'remove affordance must sit in the card header');
  assert.ok(src.includes('delete P.cards[id]'), 'remove must drop the card record');
  assert.ok(src.includes('removeChild(el)'), 'remove must take the card element out of the panel');
});

test('judge entry grants read-write producer sessions', async () => {
  const mw = fs.readFileSync(path.join(ROOT, 'functions', '_middleware.js'), 'utf8');
  assert.ok(mw.includes("r: 'producer'"), 'guest sessions must carry the producer role');
});
