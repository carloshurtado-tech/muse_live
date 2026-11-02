import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// The whole app reads Slack traffic under one canonical channel id, 'teams'
// (drawer tab filter, comms stats, chips, status dots). A 'slack' channel
// value makes messages invisible on Slack surfaces and breaks the
// unread/total arithmetic, so new writes must never use it; one load-time
// migration repairs records saved before the fix.
const js = (f) => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');

test('no new channel:slack writes in client js (canonical Slack channel is teams)', () => {
  const hits = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter((x) => /^[\w-]+\.js$/.test(x) && !/\.min\.js$/.test(x))) {
    const lines = js(f).split('\n');
    lines.forEach((line, i) => {
      if (/channel\s*:\s*['"]slack['"]/.test(line) && !/teams/.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('loadComms migrates legacy slack-channel records to teams', () => {
  const src = js('muse-app-b.js');
  assert.match(src, /m\.channel\s*===\s*['"]slack['"]\)\s*m\.channel\s*=\s*['"]teams['"]/);
});

test('drawer Send posts to the real Slack endpoint, not the console stub', () => {
  const src = js('muse-app-b.js');
  const at = src.search(/function omniSendChat\s*\(\)/);
  assert.ok(at >= 0, 'omniSendChat missing');
  let depth = 0, i = src.indexOf('{', at);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  const fn = src.slice(at, i + 1);
  assert.ok(fn.includes('/api/omni/slack'), 'omniSendChat must POST /api/omni/slack');
  assert.ok(!fn.includes('sendTeamsNotification'), 'omniSendChat must not use the simulated stub');
  assert.ok(fn.includes("status") && fn.includes('failed'), 'omniSendChat must record send status');
});

test('proactive Muse-noticed cards render newest first', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'muse-proactive.js'), 'utf8');
  assert.ok(src.includes('insertBefore(el, m.firstChild)'), 'cards must prepend newest first');
  assert.ok(!src.includes('m.appendChild(el)'), 'cards must not append oldest-first');
});

test('conflict review deep-links to the exact conflict', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'muse-proactive.js'), 'utf8');
  assert.ok(src.includes('focusConflict'), 'review must call focusConflict');
  const sched = fs.readFileSync(path.join(ROOT, 'js', 'muse-schedule.js'), 'utf8');
  assert.ok(sched.includes('focusConflict: function'), 'schedule must expose focusConflict');
  assert.ok(sched.includes('data-cf='), 'conflict rows must carry an anchor id');
});
