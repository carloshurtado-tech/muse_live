import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// Dark-mode regression locks. Several stream/Omni surfaces use --c-* tokens
// from css/muse-tokens.css, which index.html never loads, so the light
// fallbacks always win; others hardcode light colors while their text flips
// light under html.dark. These rules are the explicit dark cover — deleting
// one re-opens white-on-white text.
const css = fs.readFileSync(path.join(ROOT, 'css/muse.css'), 'utf8');

test('theme: site chips stay readable in dark mode', () => {
  assert.ok(css.includes('html.dark .ms-site-chip{background:#30333A'),
    'chips need an explicit dark surface (their --c-surface token is unloaded)');
});

test('theme: theater card and its inner text stay readable in dark mode', () => {
  for (const rule of [
    'html.dark .ms-modal-card{background:#1E1E21',
    'html.dark .ms-modal-title span{color:#B0B3B8',
    'html.dark .ms-modal-sec h4{color:#B0B3B8',
    'html.dark .ms-caplist time,html.dark .ms-caplist i{color:#8A8D91',
    'html.dark .ms-modal-hint{color:#8A8D91',
    'html.dark .ms-ok{color:#4ade80',
    'html.dark .ms-flag{color:#f87171',
  ]) assert.ok(css.includes(rule), 'missing dark rule: ' + rule);
});

test('theme: comms thread bubbles adapt to dark mode', () => {
  assert.ok(css.includes('html.dark .comms-bubble-in{background:#30333A'),
    'incoming bubbles need a dark surface for dark-flipped text');
  const app = fs.readFileSync(path.join(ROOT, 'js/muse-app-b.js'), 'utf8');
  assert.ok(app.includes('comms-bubble-in rounded-2xl rounded-bl-sm'),
    'thread modal must use the theme-aware bubble class, not inline light colors');
  assert.ok(!app.includes("background:#F0F2F5;color:#050505"),
    'no hardcoded light bubble may survive in the thread renderer');
});

test('theme: customer chips use AA text colors in dark mode', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js/muse-app-a.js'), 'utf8');
  assert.ok(app.includes('CUST_DARK_TX'), 'dark chips need lightened text (brand blues are ~3.1:1 on dark cards)');
  for (const hex of ['#6CB2FF', '#B79CFF', '#4ADE80', '#FF7EB6', '#B0B3B8'])
    assert.ok(app.includes(hex), 'missing dark chip color ' + hex);
});

test('theme: feed retry button keeps AA contrast in dark mode', () => {
  assert.ok(css.includes('html.dark .ms-retry{background:#0A58CA;'),
    'dark --ms-blue (#2694FE) is only 3.11:1 under white text; the retry button needs its own dark background');
});

test('theme: theater data stays dense (one glance, minimal scroll)', () => {
  assert.ok(css.includes('.ms-modal .ms-kv div{flex-direction:row'),
    'modal measurements read as tight rows');
  assert.ok(css.includes('.ms-caplist{max-height:140px'),
    'caption repository caps early');
});
