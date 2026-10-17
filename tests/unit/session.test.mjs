import test from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifyToken, sha256hex, pwHash, DEFAULT_PW_HASH, fromB64u, b64u } from '../../functions/_lib/session.js';

const env = { SESSION_SECRET: 'unit-test-secret' };

test('signed sessions round-trip and carry user + role', async () => {
  const t = await signSession(env, { u: 'ana@meta.com', n: 'Ana', r: 'producer' });
  const s = await verifyToken(env, t);
  assert.equal(s.u, 'ana@meta.com'); assert.equal(s.r, 'producer'); assert.equal(s.n, 'Ana');
});
test('tampered payloads and foreign secrets are rejected', async () => {
  const t = await signSession(env, { u: 'ana@meta.com', r: 'viewer' });
  const [p, sig] = t.split('.');
  const forged = b64u(new TextEncoder().encode(new TextDecoder().decode(fromB64u(p)).replace('viewer', 'admin')));
  assert.equal(await verifyToken(env, forged + '.' + sig), null);
  assert.equal(await verifyToken({ SESSION_SECRET: 'other' }, t), null);
  assert.equal(await verifyToken(env, 'garbage'), null);
});
test('expired sessions are rejected', async () => {
  const t = await signSession(env, { u: 'a@b.co', r: 'admin' }, -10);
  assert.equal(await verifyToken(env, t), null);
});
test('unknown roles are rejected', async () => {
  const t = await signSession(env, { u: 'a@b.co', r: 'superuser' });
  assert.equal(await verifyToken(env, t), null);
});
test('pre-account (legacy) sessions still sign in as the shared team admin', async () => {
  const legacy = await sha256hex('muse-session-v1:' + pwHash({}));
  const s = await verifyToken({}, legacy);
  assert.equal(s.u, 'team'); assert.equal(s.r, 'admin'); assert.ok(s.legacy);
  assert.equal(pwHash({}), DEFAULT_PW_HASH);
});
