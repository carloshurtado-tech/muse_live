import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// Every error, notification and conflict must be clickable into Muse with a
// fix request. The app shell cannot boot in node, so these pin the wiring at
// the source: each surface below must call museaiAsk with a fix prompt.
const aSrc = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-a.js'), 'utf8');
const bSrc = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-b.js'), 'utf8');

test('snapshot bottleneck / milestone block asks Muse for a fix', () => {
  assert.ok(aSrc.includes('event.stopPropagation();museaiAsk('), 'card bottleneck must open Muse without opening the project');
  assert.ok(aSrc.includes('Suggest a fix.'), 'Muse must be asked for a fix, not just a summary');
});

test('dashboard transmission conflicts ask Muse for a fix', () => {
  assert.ok(bSrc.includes("Transmission conflict: '"), 'conflict notes must build a Muse question');
  assert.ok(bSrc.includes("onclick=\"museaiAsk(\\'"), 'conflict notes must be clickable into Muse');
});

test('document warning banner asks Muse for a fix', () => {
  assert.ok(bSrc.includes("'About '+d.title"), 'doc warn must name the document in the Muse question');
  assert.ok(bSrc.includes('Ask Muse →'), 'doc warn must carry an Ask Muse button');
});
