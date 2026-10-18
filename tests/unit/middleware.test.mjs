import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/_middleware.js';
import { sha256hex } from '../../functions/_lib/session.js';
import { hashPassword } from '../../functions/_lib/users.js';
import { memoryKV, ctx } from './helpers.mjs';

const PW = 'local-test-password';
async function env(extra = {}) { return { MUSE_PASSWORD_HASH: await sha256hex('muse-live:' + PW), SESSION_SECRET: 's', MUSE_KV: memoryKV(), ...extra }; }
function cookieFrom(res) { return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '); }

test('signed out: login page public, API 401, app JS withheld, glasses redirect, calendar public', async () => {
  const e = await env();
  assert.equal(await (await onRequest(ctx('/', { env: e }))).text(), 'NEXT');
  assert.equal((await onRequest(ctx('/api/kv/x', { env: e }))).status, 401);
  assert.match(await (await onRequest(ctx('/js/muse-app-a.min.js', { env: e }))).text(), /sign in required/);
  const g = await onRequest(ctx('/glasses/', { env: e }));
  assert.equal(g.status, 302); assert.match(g.headers.get('Location'), /next=%2Fglasses%2F/);
  assert.equal(await (await onRequest(ctx('/api/calendar.ics?token=x', { env: e }))).text(), 'NEXT');
  assert.equal(await (await onRequest(ctx('/api/auth/config', { env: e }))).text(), 'NEXT');
});
test('shared password login → session that unlocks the app', async () => {
  const e = await env();
  assert.equal((await onRequest(ctx('/api/login', { method: 'POST', body: { password: 'nope' }, env: e }))).status, 401);
  const res = await onRequest(ctx('/api/login', { method: 'POST', body: { password: PW }, env: e }));
  assert.equal(res.status, 200);
  const cookie = cookieFrom(res);
  const ping = await (await onRequest(ctx('/api/ping', { env: e, headers: { Cookie: cookie } }))).json();
  assert.equal(ping.authed, true);
  assert.equal(await (await onRequest(ctx('/js/muse-app-a.min.js', { env: e, headers: { Cookie: cookie } }))).text(), 'NEXT');
});
test('once accounts exist: shared password asks for email; email login works; disabling locks the API', async () => {
  const e = await env();
  await e.MUSE_KV.put('users:ana@meta.com', JSON.stringify({ email: 'ana@meta.com', name: 'Ana', role: 'producer', disabled: false, ...(await hashPassword('correct-horse-1')) }));
  const shared = await onRequest(ctx('/api/login', { method: 'POST', body: { password: PW }, env: e }));
  assert.equal(shared.status, 401); assert.equal((await shared.json()).needEmail, true);
  const ok = await onRequest(ctx('/api/login', { method: 'POST', body: { email: 'Ana@Meta.com', password: 'correct-horse-1' }, env: e }));
  assert.equal(ok.status, 200);
  const cookie = cookieFrom(ok);
  assert.equal(await (await onRequest(ctx('/api/kv/a', { env: e, headers: { Cookie: cookie } }))).text(), 'NEXT');
  await e.MUSE_KV.put('users:ana@meta.com', JSON.stringify({ email: 'ana@meta.com', role: 'producer', disabled: true }));
  assert.equal((await onRequest(ctx('/api/kv/a', { env: e, headers: { Cookie: cookie } }))).status, 401);
});
test('cross-site login posts are refused', async () => {
  const e = await env();
  assert.equal((await onRequest(ctx('/api/login', { method: 'POST', body: { password: PW }, headers: { Origin: 'https://evil.example' }, env: e }))).status, 403);
});
test('guest demo: public about page; read-only viewer session; voice blocked; GUEST_DEMO=off closes and revokes', async () => {
  const e = await env();
  assert.equal(await (await onRequest(ctx('/about', { env: e }))).text(), 'NEXT');
  assert.equal((await onRequest(ctx('/api/auth/guest', { env: e }))).status, 405);
  const res = await onRequest(ctx('/api/auth/guest', { method: 'POST', body: {}, env: e }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.role, 'viewer');
  assert.match(res.headers.getSetCookie()[0], /Max-Age=86400; HttpOnly/);
  const cookie = cookieFrom(res);
  assert.equal((await (await onRequest(ctx('/api/ping', { env: e, headers: { Cookie: cookie } }))).json()).authed, true);
  assert.equal(await (await onRequest(ctx('/api/kv/a', { env: e, headers: { Cookie: cookie } }))).text(), 'NEXT');
  assert.equal((await onRequest(ctx('/api/voice', { method: 'POST', body: 'x', env: e, headers: { Cookie: cookie } }))).status, 403);
  const off = { ...e, GUEST_DEMO: 'off' };
  assert.equal((await onRequest(ctx('/api/auth/guest', { method: 'POST', body: {}, env: off }))).status, 403);
  assert.equal((await (await onRequest(ctx('/api/ping', { env: off, headers: { Cookie: cookie } }))).json()).authed, false);
});
