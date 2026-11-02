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
  assert.ok(fn.includes('omniSlackChanFor(prod)'), 'drawer channel must follow the project name');
  assert.ok(fn.includes('omniSlackThreadAnchor('), 'drawer send must join the thread when one exists');
});

test('Omni threads and Slack threads mirror each other both ways', () => {
  const src = js('muse-app-b.js');
  assert.ok(src.includes('function omniSlackThreadAnchor(thread)'), 'thread anchor helper must exist');
  assert.ok(src.includes('function syncOmniThread(tk,manual)'), 'inbound sync must exist');
  assert.ok(src.includes('Sync from Slack'), 'thread view must offer a manual sync');
  assert.ok(src.includes('syncOmniThread(tk,false)'), 'opening a thread must pull new Slack replies');
  assert.ok(src.includes("openCommsThread(tk,true)"), 'sync must re-render the visible thread without looping');
  const sc = fs.readFileSync(path.join(ROOT, 'js', 'muse-showcaller.js'), 'utf8');
  assert.ok(sc.includes('thread_ts'), 'Show Caller sends must join the Slack thread');
  assert.ok(sc.includes('ext_channel'), 'sent messages must store the Slack channel id for sync');
});

test('drawer Slack channel is derived from the project name, never typed', () => {
  const src = js('muse-app-b.js');
  assert.ok(src.includes('function omniSlackChanFor(prod)'), 'channel helper must exist');
  assert.ok(!src.includes('omniSlackChan(prod)'), 'no per-show stored channel may override the project name');
  assert.ok(!src.includes('id="omniSlackChan"'), 'no manual channel input may remain');
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
