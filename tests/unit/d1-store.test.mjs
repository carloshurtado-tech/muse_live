import test from 'node:test';
import assert from 'node:assert/strict';
import { seg, ftsPhrase } from '../../functions/_lib/store.js';

test('seg keeps R2 path segments safe', () => {
  assert.equal(seg('Muse AI World Tour', 'general'), 'muse-ai-world-tour');
  assert.equal(seg('../../etc', 'file'), 'etc');
  assert.equal(seg('', 'general'), 'general');
  assert.ok(seg('a'.repeat(100), 'x').length <= 48);
});

test('ftsPhrase fences user text as one phrase', () => {
  assert.equal(ftsPhrase('srt loss'), '"srt loss"');
  assert.equal(ftsPhrase('say "hi"'), '"say ""hi"""');
  assert.equal(ftsPhrase(''), '""');
});
