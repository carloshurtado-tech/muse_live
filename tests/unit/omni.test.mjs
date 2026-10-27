import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as slackPost } from '../../functions/api/omni/slack.js';
import { onRequestPost as mailPost } from '../../functions/api/omni/mail.js';
import { memoryKV, ctx } from './helpers.mjs';

const TEAM = { u: 'team', n: 'Muse Live team', r: 'admin' };
const VIEWER = { u: 'guest', n: 'Guest reviewer', r: 'viewer' };
const day = () => new Date().toISOString().slice(0, 10);
async function auditOf(kv) { return (await kv.get('audit:' + day(), { type: 'json' })) || []; }

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
    const kv = memoryKV();
    const r = await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x', MUSE_KV: kv }, user: TEAM,
      body: { channel: 'C1', text: 'fix applied' } }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, ts: '1.2', channel: 'C1', path: 'bot' });
    assert.ok((await auditOf(kv)).some((e) => e.action === 'showcaller.notify' && e.key === 'slack'));
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
    const kv = memoryKV();
    const r = await slackPost(ctx('/api/omni/slack', { method: 'POST', env: { SLACK_BOT_TOKEN: 'x', MUSE_KV: kv }, user: TEAM,
      body: { channel: 'C1', text: 'fix applied' } }));
    assert.equal(r.status, 502);
    const j = await r.json();
    assert.ok(!j.error.includes('<'), 'unsanitized provider error');
    assert.ok((await auditOf(kv)).some((e) => e.action === 'showcaller.notify.failed'));
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
    const kv = memoryKV();
    const env = { GMAIL_CLIENT_ID: 'i', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MUSE_KV: kv };
    const r = await mailPost(ctx('/api/omni/mail', { method: 'POST', env, user: TEAM,
      body: { to: ['ops@example.com'], subject: 'fix', body: 'moved the test' } }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, id: 'm1', threadId: 't1' });
    assert.ok((await auditOf(kv)).some((e) => e.action === 'showcaller.notify' && e.key === 'gmail'));
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
