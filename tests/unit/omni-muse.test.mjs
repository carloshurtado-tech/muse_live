import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// @muse in the Omni ops room asks Muse in the thread; the answer carries a
// visibility choice — everyone (mirrored to the shared Slack thread) or only
// me (stays local). The drawer has no DOM in node, so these pin the wiring.
const src = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-b.js'), 'utf8');

test('@muse routes to the Muse asker and strips the mention', () => {
  assert.ok(src.includes('/^@muse\\b/i'), '@muse must trigger the Muse path');
  assert.ok(src.includes('/^@muse\\s+/i'), '@muse mention must be stripped before asking');
  assert.ok(src.includes('/^@?museai\\b/i'), 'the older @museai trigger must keep working');
});

test('Muse answers carry a pending visibility choice', () => {
  assert.ok(src.includes('museShare=null'), 'fresh answers must start undecided');
  assert.ok(src.includes('museQ=txt'), 'the question must be kept for the shared post');
});

test('Omni @muse falls back to rules instead of dead-ending', () => {
  assert.ok(src.includes('omniMuseFallback'), 'Omni must have a rules fallback');
  assert.ok(src.includes('.catch(function(){return omniMuseFallback(txt);})'), 'a rejected model ask must fall back to the rules answer');
  assert.ok(src.includes("typeof museaiAnswer==='function'"), 'the fallback must use the built-in rules engine');
});

test('answer card offers Everyone / Only me and mirrors on Everyone', () => {
  assert.ok(src.includes('Everyone can see'), 'must offer the everyone choice');
  assert.ok(src.includes('Only me'), 'must offer the private choice');
  assert.ok(src.includes('omniMuseShare('), 'buttons must call the share handler');
  assert.ok(src.includes("payload.thread_ts=thr.ts"), 'the shared post must join the ops-room Slack thread');
  assert.ok(src.includes("m.museShare='me'"), 'Only me must stay local without posting');
});
