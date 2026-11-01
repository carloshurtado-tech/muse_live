import test from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifyToken, verifyTokenFor, fromB64u } from '../../functions/_lib/session.js';
import { onRequestGet as oidcStart } from '../../functions/api/auth/oidc/start.js';
import { onRequestGet as oidcCallback } from '../../functions/api/auth/oidc/callback.js';
import { memoryKV } from './helpers.mjs';

const ENV = { SESSION_SECRET: 'oidc-test-secret' };
const DISCOVERY = {
  authorization_endpoint: 'https://idp.example/authorize',
  token_endpoint: 'https://idp.example/token',
  userinfo_endpoint: 'https://idp.example/userinfo',
};
function mockIdp(email = 'newhire@meta.com') {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/.well-known/openid-configuration')) return Response.json(DISCOVERY);
    if (u === DISCOVERY.token_endpoint) return Response.json({ access_token: 'at-1' });
    if (u === DISCOVERY.userinfo_endpoint) return Response.json({ email, email_verified: true, name: 'New Hire' });
    throw new Error('unexpected fetch ' + u);
  };
  return () => { globalThis.fetch = real; };
}
function payloadOf(token) {
  return JSON.parse(new TextDecoder().decode(fromB64u(token.split('.')[0])));
}
const oidcEnv = (kv) => ({
  ...ENV, MUSE_KV: kv,
  OIDC_ISSUER: 'https://idp.example', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'csecret',
});

test('BUG-34: an OIDC transaction token is not a session (typ claim separates them)', async () => {
  const tx = await signSession(ENV, { u: 'state-1', n: 'verifier|/', r: 'viewer' }, 600, 'oidc_tx');
  assert.equal(payloadOf(tx).typ, 'oidc_tx');
  assert.equal(await verifyToken(ENV, tx), null, 'transaction cookie must not authenticate as a session');
  const seen = await verifyTokenFor(ENV, tx, 'oidc_tx');
  assert.ok(seen && seen.u === 'state-1');
  const session = await signSession(ENV, { u: 'ana@meta.com', n: 'Ana', r: 'producer' });
  assert.equal(payloadOf(session).typ, 'session');
  assert.ok(await verifyToken(ENV, session));
  assert.equal(await verifyTokenFor(ENV, session, 'oidc_tx'), null);
});

test('BUG-36: control characters in ?next= cannot smuggle an open redirect', async () => {
  const done = mockIdp();
  try {
    const kv = memoryKV();
    const res = await oidcStart({ request: new Request('https://muse.test/api/auth/oidc/start?next=' + encodeURIComponent('/\t//evil.example')), env: oidcEnv(kv) });
    assert.equal(res.status, 302);
    const cookie = (res.headers.get('Set-Cookie') || '').split(';')[0].replace('muse_oidc=', '');
    const next = String(payloadOf(cookie).n).split('|')[1];
    assert.ok(![...next].some((ch) => { const c = ch.codePointAt(0) || 0; return c < 0x20 || c === 0x7f; }), 'stored next still carries control characters: ' + JSON.stringify(next));
    assert.ok(next === '/' || (/^\/(?![/\\])/.test(next) && !next.includes('\\')), 'stored next is not a safe same-origin path: ' + JSON.stringify(next));
    const clean = await oidcStart({ request: new Request('https://muse.test/api/auth/oidc/start?next=' + encodeURIComponent('/ops/health')), env: oidcEnv(kv) });
    const cookie2 = (clean.headers.get('Set-Cookie') || '').split(';')[0].replace('muse_oidc=', '');
    assert.equal(String(payloadOf(cookie2).n).split('|')[1], '/ops/health');
  } finally { done(); }
});

test('BUG-35: a first SSO login creates the account record, then lands on next', async () => {
  const done = mockIdp();
  try {
    const kv = memoryKV();
    const env = oidcEnv(kv);
    const start = await oidcStart({ request: new Request('https://muse.test/api/auth/oidc/start?next=/ops'), env });
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('Location')).searchParams.get('state');
    const txCookie = (start.headers.get('Set-Cookie') || '').split(';')[0];
    const cb = await oidcCallback({ request: new Request('https://muse.test/api/auth/oidc/callback?code=abc&state=' + encodeURIComponent(state), { headers: { Cookie: txCookie } }), env });
    assert.equal(cb.status, 302);
    assert.equal(cb.headers.get('Location'), '/ops');
    const record = await kv.get('users:newhire@meta.com', 'json');
    assert.ok(record, 'first SSO login must create the account record');
    assert.equal(record.disabled, false);
    assert.ok(['viewer', 'producer', 'engineer', 'admin'].includes(record.role));
    assert.ok((cb.headers.getSetCookie()[0] || '').includes('muse_session='));
  } finally { done(); }
});
