import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

test('canonical esc covers all five characters, including quotes', () => {
  const w = loadBrowserModule('js/muse-utils.js', {});
  assert.equal(w.esc('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(w.esc(null), '');
  assert.equal(w.esc(undefined), '');
  assert.equal(w.esc('Levi\u2019s Stadium'), 'Levi\u2019s Stadium', 'unicode apostrophe is text, not markup');
  assert.equal(w.MuseUtils.version, '0.1.0');
  assert.equal(w.MuseUtils.esc('&'), '&amp;');
});
