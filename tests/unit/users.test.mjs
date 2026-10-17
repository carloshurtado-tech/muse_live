import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, safeEqual, normEmail, validEmail, publicUser } from '../../functions/_lib/users.js';

test('PBKDF2 hashes verify and are salted', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.notEqual(a.hash, b.hash);
  assert.ok(await verifyPassword(a, 'correct horse battery'));
  assert.ok(!(await verifyPassword(a, 'wrong')));
  assert.equal(a.iter, 100000);
});
test('helpers', () => {
  assert.ok(safeEqual('abc', 'abc')); assert.ok(!safeEqual('abc', 'abd')); assert.ok(!safeEqual('abc', 'ab'));
  assert.equal(normEmail('  Ana@Meta.COM '), 'ana@meta.com');
  assert.ok(validEmail('ana@meta.com')); assert.ok(!validEmail('ana@meta')); assert.ok(!validEmail('no spaces@meta.com'));
  assert.deepEqual(Object.keys(publicUser({ email: 'a@b.co', name: 'A', role: 'viewer', hash: 'x', salt: 'y' })).sort(), ['created', 'disabled', 'email', 'name', 'role', 'updated']);
});
