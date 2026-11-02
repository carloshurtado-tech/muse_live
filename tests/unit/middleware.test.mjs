import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/_middleware.js';
import { sha256hex, signSession } from '../../functions/_lib/session.js';
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
test('judge entry: public about page; read-write producer session; voice accepted; GUEST_DEMO=off closes and revokes', async () => {
  const e = await env();
  assert.equal(await (await onRequest(ctx('/about', { env: e }))).text(), 'NEXT');
  assert.equal((await onRequest(ctx('/api/auth/guest', { env: e }))).status, 405);
  const res = await onRequest(ctx('/api/auth/guest', { method: 'POST', body: {}, env: e }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.role, 'producer');
  assert.match(res.headers.getSetCookie()[0], /Max-Age=86400; HttpOnly/);
  const cookie = cookieFrom(res);
  assert.equal((await (await onRequest(ctx('/api/ping', { env: e, headers: { Cookie: cookie } }))).json()).authed, true);
  assert.equal(await (await onRequest(ctx('/api/kv/a', { env: e, headers: { Cookie: cookie } }))).text(), 'NEXT');
  assert.equal(await (await onRequest(ctx('/api/voice', { method: 'POST', body: 'x', env: e, headers: { Cookie: cookie } }))).text(), 'NEXT');
  const off = { ...e, GUEST_DEMO: 'off' };
  assert.equal((await onRequest(ctx('/api/auth/guest', { method: 'POST', body: {}, env: off }))).status, 403);
  assert.equal((await (await onRequest(ctx('/api/ping', { env: off, headers: { Cookie: cookie } }))).json()).authed, false);
});
test('BUG-03: case and trailing-slash variants cannot skip the voice or disabled-account checks', async () => {
  const e = await env();
  await e.MUSE_KV.put('users:v@meta.com', JSON.stringify({ email: 'v@meta.com', name: 'V', role: 'viewer', disabled: false, ...(await hashPassword('correct-horse-2')) }));
  const vToken = await signSession(e, { u: 'v@meta.com', n: 'V', r: 'viewer' });
  const gCookie = 'muse_session=' + vToken;
  for (const p of ['/api/voice/', '/API/VOICE', '/Api/Voice/']) {
    assert.equal((await onRequest(ctx(p, { method: 'POST', body: 'x', env: e, headers: { Cookie: gCookie } }))).status, 403, p);
  }
  await e.MUSE_KV.put('users:ana@meta.com', JSON.stringify({ email: 'ana@meta.com', name: 'Ana', role: 'producer', disabled: false, ...(await hashPassword('correct-horse-1')) }));
  const ok = await onRequest(ctx('/api/login', { method: 'POST', body: { email: 'ana@meta.com', password: 'correct-horse-1' }, env: e }));
  const cookie = cookieFrom(ok);
  await e.MUSE_KV.put('users:ana@meta.com', JSON.stringify({ email: 'ana@meta.com', role: 'producer', disabled: true }));
  assert.equal((await onRequest(ctx('/API/KV/productions', { env: e, headers: { Cookie: cookie } }))).status, 401);
  assert.equal((await onRequest(ctx('/api/kv/a/', { env: e, headers: { Cookie: cookie } }))).status, 401);
  // Normalisation must not widen what is public: an unknown API path stays gated.
  assert.equal((await onRequest(ctx('/API/SECRET', { env: e }))).status, 401);
});
test('BUG-14: rotating the session cookie cannot reset the login throttle', async () => {
  const e = await env();
  const ip = { 'X-Forwarded-For': '198.51.100.77' };
  for (let i = 0; i < 10; i++) {
    const r = await onRequest(ctx('/api/login', { method: 'POST', body: { password: 'nope' }, env: e, headers: { ...ip, Cookie: 'muse_session=rotated-' + i + '-' + 'x'.repeat(i) } }));
    assert.equal(r.status, 401, 'attempt ' + i);
  }
  const blocked = await onRequest(ctx('/api/login', { method: 'POST', body: { password: 'nope' }, env: e, headers: { ...ip, Cookie: 'muse_session=brand-new-cookie' } }));
  assert.equal(blocked.status, 429);
});
test('QoE beacons from read-only sessions are accepted but not stored', async () => {
  const { onRequestPost } = await import('../../functions/api/qoe.js');
  const env = { MUSE_KV: memoryKV() };
  const beacon = { show: 'museaitour', stream: 'main', session: 's1', rebuffer_ms: 864e5, play_ms: 1000 };
  const v = await (await onRequestPost(ctx('/api/qoe', { method: 'POST', body: beacon, env, user: { u: 'guest', r: 'viewer' } }))).json();
  assert.equal(v.stored, false);
  assert.equal(await env.MUSE_KV.get('qoe:museaitour'), null);
  await onRequestPost(ctx('/api/qoe', { method: 'POST', body: beacon, env, user: { u: 'team', r: 'admin' } }));
  assert.notEqual(await env.MUSE_KV.get('qoe:museaitour'), null);
});
