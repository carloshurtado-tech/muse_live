import test from 'node:test';
import assert from 'node:assert/strict';
import { abuseTake, checkContentType, checkLength, checkOrigin, guardJsonWrite, readCappedBody, resolveModelBase } from '../../functions/_lib/abuse.js';

const post = (headers = {}, body = '{}') =>
  new Request('https://muse.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

test('checkOrigin refuses a foreign Origin, passes same/absent origin', () => {
  assert.equal(checkOrigin(post({ Origin: 'https://evil.example' })).status, 403);
  assert.equal(checkOrigin(post({ Origin: 'https://muse.test' })), null);
  assert.equal(checkOrigin(post()), null);
});

test('checkContentType passes JSON bodies', () => {
  assert.equal(checkContentType(post()), null);
});

test('checkContentType refuses non-JSON bodies', () => {
  const r = new Request('https://muse.test/api/x', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(checkContentType(r).status, 415);
  assert.equal(checkContentType(post({ 'Content-Type': 'application/json; charset=utf-8' })), null);
});

test('checkLength fast-rejects a huge Content-Length', () => {
  const r = new Request('https://muse.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '99999999' }, body: '{}' });
  assert.equal(checkLength(r, 1024).status, 413);
  assert.equal(checkLength(post(), 1024), null);
});

test('readCappedBody caps lying Content-Length bodies', async () => {
  assert.equal(await readCappedBody(post(), 1024), '{}');
  const big = 'x'.repeat(2000);
  const r = new Request('https://muse.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ s: big }) });
  const capped = await readCappedBody(r, 1024);
  assert.ok(capped instanceof Response && capped.status === 413);
});

test('abuseTake admits then refuses with a retry delay', () => {
  const key = 'abuse:test:' + Math.random();
  assert.equal(abuseTake(key, { perMin: 2 }), 0);
  assert.equal(abuseTake(key, { perMin: 2 }), 0);
  assert.ok(abuseTake(key, { perMin: 2 }) > 0);
});

test('guardJsonWrite runs origin, content-type, length and rate in order', () => {
  const evil = new Request('https://muse.test/api/x', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(guardJsonWrite(evil, { maxBytes: 1024, ns: 'order' }).status, 403); // origin first
  const plain = new Request('https://muse.test/api/x', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(guardJsonWrite(plain, { maxBytes: 1024, ns: 'order' }).status, 415);
  const ns = 'rate-' + Math.random();
  const mk = () => new Request('https://muse.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'muse_session=' + ns }, body: '{}' });
  assert.equal(guardJsonWrite(mk(), { maxBytes: 1024, perMin: 1, ns }), null);
  assert.equal(guardJsonWrite(mk(), { maxBytes: 1024, perMin: 1, ns }).status, 429);
});

test('resolveModelBase: default, loopback dev, allowlist and fail-closed', () => {
  assert.deepEqual(resolveModelBase({}), { ok: true, base: 'https://api.meta.ai/v1' });
  assert.deepEqual(resolveModelBase({ MUSE_API_BASE: 'https://api.meta.ai/v1/' }), { ok: true, base: 'https://api.meta.ai/v1' });
  assert.deepEqual(resolveModelBase({ MUSE_API_BASE: 'http://127.0.0.1:8799/v1' }), { ok: true, base: 'http://127.0.0.1:8799/v1' });
  assert.deepEqual(resolveModelBase({ MUSE_API_BASE: 'https://models.example.com/v1', MUSE_API_BASE_ALLOWLIST: 'models.example.com' }),
    { ok: true, base: 'https://models.example.com/v1' });
  assert.deepEqual(resolveModelBase({ MUSE_API_BASE: 'https://models.example.com/v1', MUSE_API_BASE_ALLOWLIST: 'https://other.example, https://models.example.com/' }),
    { ok: true, base: 'https://models.example.com/v1' });
  // Fail closed: evil https host, plain-http remote, non-URL, non-http(s) scheme.
  for (const bad of ['https://evil.example/v1', 'http://10.0.0.9:8080/v1', 'http://models.example.com/v1',
    'not a url', 'ftp://api.meta.ai/v1', 'https://api.meta.ai.evil.example/v1']) {
    const r = resolveModelBase({ MUSE_API_BASE: bad });
    assert.equal(r.ok, false, bad);
  }
  // Malformed allowlist entries are ignored, not fatal.
  const r = resolveModelBase({ MUSE_API_BASE: 'https://models.example.com/v1', MUSE_API_BASE_ALLOWLIST: 'nota url {{{, models.example.com' });
  assert.deepEqual(r, { ok: true, base: 'https://models.example.com/v1' });
});
