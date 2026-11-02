import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// Popup/drawer coexistence: an open Muse or Omni drawer must never bury a
// centered dialog — the drawer stays put, the popup shifts left. Pinned at
// the source (stylesheet rule keyed on the drawer-open body classes).
const css = fs.readFileSync(path.join(ROOT, 'css', 'muse.css'), 'utf8');

test('open drawer shifts centered popups left, drawer stays put', () => {
  assert.ok(css.includes('body.museai-open div[id$="Overlay"]'), 'Muse-open body class must shift overlays');
  assert.ok(css.includes('body.omni-open div[id$="Overlay"]'), 'Omni-open body class must shift overlays');
  assert.ok(css.includes('padding-right:436px'), 'shift must clear the 420px drawer');
  assert.ok(css.includes('body.museai-open .ms-modal'), 'the stream theater must shift too, drawer transform untouched');
});

// Glasses companion (glasses/preview.html): talk to Muse by voice or text in
// glance mode, answers land in the lens, Meta Connect backdrop.
const pv = fs.readFileSync(path.join(ROOT, 'glasses', 'preview.html'), 'utf8');

test('glasses talks to Muse with the live snapshot, never an object dump', () => {
  assert.ok(pv.includes('/api/kv/live-status'), 'glasses must read the desktop live-status first');
  assert.ok(pv.includes('/api/museai'), 'glasses must call the Muse endpoint on this origin');
  assert.ok(pv.includes('/api/auth/guest'), 'glasses must mint a guest session like Explore does');
  assert.ok(pv.includes('muselive_schedule_v1'), 'snapshot fallback must use this browser’s real schedule data, never invented data');
  assert.ok(pv.includes('m.content'), 'the {role, content} answer must be unwrapped before display');
});

test('glasses answers in the lens, by voice and by tap', () => {
  assert.ok(pv.includes('id="lensCard"'), 'answers must render in an in-lens card');
  assert.ok(pv.includes('SpeechRecognition'), 'mic must use the Web Speech API where offered');
  assert.ok(pv.includes('speechSynthesis'), 'Muse must speak its answers unless muted');
  assert.ok(pv.includes('data-q='), 'alerts must be one-tap questions Muse answers');
});

test('glasses stage is a Meta Connect event, not a black void', () => {
  assert.ok(pv.includes('scene-connect.jpg'), 'lens world must be the Meta Connect backdrop');
});

// Exit: the presenter must always be able to get back to the dashboard —
// from the preview page header and from inside the 600×600 app itself.
const gsrc = fs.readFileSync(path.join(ROOT, 'glasses-src', 'src', 'Root.tsx'), 'utf8');

test('glasses exits back to the dashboard', () => {
  assert.ok(pv.includes('Exit to dashboard'), 'preview header must link back to the dashboard');
  assert.ok(gsrc.includes('g-exit'), 'glasses app must render an exit button');
  assert.ok(gsrc.includes("location.href = '/'"), 'exit must land on the dashboard');
});
