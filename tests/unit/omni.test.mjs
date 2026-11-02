import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as slackPost } from '../../functions/api/omni/slack.js';
import { onRequestGet as slackThread } from '../../functions/api/omni/slack-thread.js';
import { onRequestPost as mailPost } from '../../functions/api/omni/mail.js';
import { memoryKV, memoryD1, ctx } from './helpers.mjs';

const TEAM = { u: 'team', n: 'Muse Live team', r: 'admin' };
const VIEWER = { u: 'guest', n: 'Guest reviewer', r: 'viewer' };
function auditOf(db) { return db ? db.tables.auditLog : []; }

function mockFetch(routes) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const hit = routes.find(([rx]) => rx.test(String(url)));
    if (!hit) throw new Error('unexpected fetch ' + url);
    const [, status, body] = hit;
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, done() { globalThis.fetch = real; } };
}

// --- Slack ---

test('slack: bot post succeeds and audits', async () => {
  const m = mockFetch([[ /chat\.postMessage/, 200, { ok: true, ts: '1.2', channel: 'C1' } ]]);
  try {
    const db = memoryD1();
    const r = await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x', MUSE_KV: memoryKV(), MUSE_D1: db }, user: TEAM,
      body: { channel: 'C1', text: 'fix applied' } }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, ts: '1.2', channel: 'C1', path: 'bot' });
    assert.ok(auditOf(db).some((e) => e.action === 'showcaller.notify' && e.key === 'slack'));
  } finally { m.done(); }
});

test('slack: failed bot post retries once via webhook and marks the path', async () => {
  let posts = 0;
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (/chat\.postMessage/.test(String(url))) { posts++; return Response.json({ ok: false, error: 'channel_not_found' }); }
    return new Response('ok', { status: 200 });
  };
  try {
    const r = await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x', SLACK_WEBHOOK_URL: 'https://hooks.slack/1', MUSE_KV: memoryKV() }, user: TEAM,
      body: { channel: 'C1', text: 'fix applied' } }));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).path, 'webhook');
    assert.equal(posts, 1);
  } finally { globalThis.fetch = real; }
});

test('slack: total failure is a sanitized 502 with a failed audit entry', async () => {
  const m = mockFetch([[ /chat\.postMessage/, 200, { ok: false, error: 'xyz<script>' } ]]);
  try {
    const db = memoryD1();
    const r = await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x', MUSE_KV: memoryKV(), MUSE_D1: db }, user: TEAM,
      body: { channel: 'C1', text: 'fix applied' } }));
    assert.equal(r.status, 502);
    const j = await r.json();
    assert.ok(!j.error.includes('<'), 'unsanitized provider error');
    assert.ok(auditOf(db).some((e) => e.action === 'showcaller.notify.failed'));
  } finally { m.done(); }
});

test('slack: viewers refused, signed-out refused, unconfigured is 503', async () => {
  const m = mockFetch([]);
  try {
    const good = { channel: 'C1', text: 'x' };
    assert.equal((await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x' }, user: VIEWER, body: good }))).status, 403);
    assert.equal((await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x' }, user: null, body: good }))).status, 401);
    assert.equal((await slackPost(ctx('/api/omni/slack', { method: 'POST', env: {}, user: TEAM, body: good }))).status, 503);
    assert.equal((await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x' }, user: TEAM, body: { channel: '', text: '' } }))).status, 400);
    assert.equal(m.calls.length, 0, 'refused requests must not call Slack');
  } finally { m.done(); }
});

// --- Gmail ---

test('mail: refresh then send returns the message id and audits', async () => {
  const m = mockFetch([
    [/oauth2\.googleapis/, 200, { access_token: 'a' }],
    [/gmail\.googleapis/, 200, { id: 'm1', threadId: 't1' }],
  ]);
  try {
    const db = memoryD1();
    const env = { GMAIL_CLIENT_ID: 'i', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MUSE_KV: memoryKV(), MUSE_D1: db };
    const r = await mailPost(ctx('/api/omni/mail', { method: 'POST', env, user: TEAM,
      body: { to: ['ops@example.com'], subject: 'fix', body: 'moved the test' } }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, id: 'm1', threadId: 't1' });
    assert.ok(auditOf(db).some((e) => e.action === 'showcaller.notify' && e.key === 'gmail'));
    assert.deepEqual(m.calls.map((u) => /oauth2/.test(u) ? 'token' : 'send'), ['token', 'send']);
  } finally { m.done(); }
});

test('mail: missing refresh token is an honest 503; bad addresses are 400', async () => {
  const m = mockFetch([]);
  try {
    const noRefresh = { GMAIL_CLIENT_ID: 'i', GMAIL_CLIENT_SECRET: 's', MUSE_KV: memoryKV() };
    const r1 = await mailPost(ctx('/api/omni/mail', { method: 'POST', env: noRefresh, user: TEAM,
      body: { to: ['ops@example.com'], subject: 's', body: 'b' } }));
    assert.equal(r1.status, 503);
    assert.equal((await r1.json()).configured, false);
    const full = { GMAIL_CLIENT_ID: 'i', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MUSE_KV: memoryKV() };
    assert.equal((await mailPost(ctx('/api/omni/mail', { method: 'POST', env: full, user: TEAM,
      body: { to: ['not-an-email'], subject: 's', body: 'b' } }))).status, 400);
    assert.equal((await mailPost(ctx('/api/omni/mail', { method: 'POST', env: full, user: VIEWER,
      body: { to: ['ops@example.com'], subject: 's', body: 'b' } }))).status, 403);
    assert.equal(m.calls.length, 0);
  } finally { m.done(); }
});

test('mail: non-ASCII subject is RFC 2047 encoded, ASCII stays plain', async () => {
  const raws = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (/oauth2/.test(u)) return Response.json({ access_token: 'a' });
    raws.push(JSON.parse(init.body).raw);
    return Response.json({ id: 'm1', threadId: 't1' });
  };
  try {
    const env = { GMAIL_CLIENT_ID: 'i', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MUSE_KV: memoryKV() };
    const send = (subject) => mailPost(ctx('/api/omni/mail', { method: 'POST', env, user: TEAM,
      body: { to: ['ops@example.com'], subject, body: 'b' } }));
    assert.equal((await send('gate check — Day 3')).status, 200);
    assert.equal((await send('plain subject')).status, 200);
    const dec = (r) => Buffer.from(r.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const subj = (r) => dec(r).split('\r\n').find((l) => l.startsWith('Subject: '));
    const enc = subj(raws[0]);
    assert.ok(enc.includes('=?UTF-8?B?'), 'non-ASCII subject not encoded: ' + enc);
    const word = enc.match(/=\?UTF-8\?B\?([^?]+)\?=/)[1];
    assert.equal(Buffer.from(word, 'base64').toString('utf8'), 'gate check — Day 3');
    assert.equal(subj(raws[1]), 'Subject: plain subject');
  } finally { globalThis.fetch = real; }
});

test('BUG-30: webhook-only Slack succeeds once, and a repeated approval send is deduped', async () => {
  let hooks = 0;
  const real = globalThis.fetch;
  globalThis.fetch = async () => { hooks++; return new Response('ok', { status: 200 }); };
  try {
    const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack/only', MUSE_KV: memoryKV() };
    const body = { channel: 'C1', text: 'fix applied', idempotencyKey: 'approval-42' };
    const r1 = await slackPost(ctx('/api/omni/slack', { method: 'POST', env, user: TEAM, body }));
    assert.equal(r1.status, 200);
    assert.equal((await r1.json()).path, 'webhook');
    const r2 = await slackPost(ctx('/api/omni/slack', { method: 'POST', env, user: TEAM, body }));
    assert.equal(r2.status, 200);
    assert.equal(hooks, 1, 'the same approval must not post twice');
    // A different approval still posts.
    assert.equal((await slackPost(ctx('/api/omni/slack', { method: 'POST', env, user: TEAM, body: { ...body, idempotencyKey: 'approval-43' } }))).status, 200);
    assert.equal(hooks, 2);
    // Nothing configured at all stays an honest 503.
    const none = await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { MUSE_KV: memoryKV() }, user: TEAM, body: { channel: 'C1', text: 'x' } }));
    assert.equal(none.status, 503);
    assert.equal((await none.json()).configured, false);
  } finally { globalThis.fetch = real; }
});
test('BUG-30: a repeated mail approval sends once (idempotency key)', async () => {
  let sends = 0;
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (/oauth2/.test(String(url))) return Response.json({ access_token: 'a' });
    sends++;
    return Response.json({ id: 'm-once', threadId: 't1' });
  };
  try {
    const env = { GMAIL_CLIENT_ID: 'i', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MUSE_KV: memoryKV() };
    const body = { to: ['ops@example.com'], subject: 'fix', body: 'moved', approvalId: 'show-7-fix-1' };
    const r1 = await mailPost(ctx('/api/omni/mail', { method: 'POST', env, user: TEAM, body }));
    assert.equal(r1.status, 200);
    assert.equal((await r1.json()).id, 'm-once');
    const r2 = await mailPost(ctx('/api/omni/mail', { method: 'POST', env, user: TEAM, body }));
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).id, 'm-once');
    assert.equal(sends, 1);
  } finally { globalThis.fetch = real; }
});
test('mail: dead refresh token fails closed with reconnect wording', async () => {
  const m = mockFetch([[ /oauth2\.googleapis/, 400, { error: 'invalid_grant' } ]]);
  try {
    const env = { GMAIL_CLIENT_ID: 'i', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'dead', MUSE_KV: memoryKV() };
    const r = await mailPost(ctx('/api/omni/mail', { method: 'POST', env, user: TEAM,
      body: { to: ['ops@example.com'], subject: 's', body: 'b' } }));
    assert.equal(r.status, 502);
    assert.ok((await r.json()).error.includes('Reconnect'));
  } finally { m.done(); }
});

test('slack: thread_ts joins the same Slack thread', async () => {
  let sent = null;
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return Response.json({ ok: true, ts: '1.3', channel: 'C9' }); };
  try {
    const r = await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x', MUSE_KV: memoryKV() }, user: TEAM,
      body: { channel: 'C9', text: 'follow-up', thread_ts: '1720000000.000100' } }));
    assert.equal(r.status, 200);
    assert.equal(sent.thread_ts, '1720000000.000100');
    assert.deepEqual(await r.json(), { ok: true, ts: '1.3', channel: 'C9', path: 'bot' });
  } finally { globalThis.fetch = real; }
});

test('slack: malformed thread_ts is dropped, never forwarded', async () => {
  let sent = null;
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return Response.json({ ok: true, ts: '1.4', channel: 'C9' }); };
  try {
    const r = await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x', MUSE_KV: memoryKV() }, user: TEAM,
      body: { channel: 'C9', text: 'top-level', thread_ts: 'not-a-ts' } }));
    assert.equal(r.status, 200);
    assert.ok(!('thread_ts' in sent));
  } finally { globalThis.fetch = real; }
});

test('slack-thread: replies map to Omni messages', async () => {
  const m = mockFetch([[ /conversations\.replies/, 200, { ok: true, messages: [
    { ts: '1720000000.000100', text: 'root post', user: 'U1' },
    { ts: '1720000000.000200', text: 'copy that', user: 'U2', thread_ts: '1720000000.000100', username: 'Sam' },
  ] } ]]);
  try {
    const r = await slackThread(ctx('/api/omni/slack-thread?channel=C012AB345CD&ts=1720000000.000100', { env: { SLACK_BOT_TOKEN: 'x' }, user: TEAM }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, channel: 'C012AB345CD', messages: [
      { ts: '1720000000.000100', thread_ts: '1720000000.000100', user: 'U1', name: '', text: 'root post' },
      { ts: '1720000000.000200', thread_ts: '1720000000.000100', user: 'U2', name: 'Sam', text: 'copy that' },
    ] });
  } finally { m.done(); }
});

test('slack-thread: signed out, unconfigured, bad params, and Slack errors stay clean', async () => {
  const noUser = await slackThread(ctx('/api/omni/slack-thread?channel=C012AB345CD&ts=1720000000.000100', { env: { SLACK_BOT_TOKEN: 'x' } }));
  assert.equal(noUser.status, 401);
  const noToken = await slackThread(ctx('/api/omni/slack-thread?channel=C012AB345CD&ts=1720000000.000100', { env: {}, user: TEAM }));
  assert.equal(noToken.status, 503);
  assert.equal((await noToken.json()).configured, false);
  const bad = await slackThread(ctx('/api/omni/slack-thread?channel=nope&ts=x', { env: { SLACK_BOT_TOKEN: 'x' }, user: TEAM }));
  assert.equal(bad.status, 400);
  const m = mockFetch([[ /conversations\.replies/, 200, { ok: false, error: 'missing_scope<script>' } ]]);
  try {
    const r = await slackThread(ctx('/api/omni/slack-thread?channel=C012AB345CD&ts=1720000000.000100', { env: { SLACK_BOT_TOKEN: 'x' }, user: TEAM }));
    assert.equal(r.status, 502);
    assert.ok(!(await r.json()).error.includes('<'));
  } finally { m.done(); }
});
