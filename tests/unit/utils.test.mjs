import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

test('canonical esc covers all five characters, including quotes', () => {
  const w = loadBrowserModule('js/muse-utils.js', {});
  assert.equal(w.esc('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(w.esc(null), '');
  assert.equal(w.esc(undefined), '');
  assert.equal(w.esc('Levi\u2019s Stadium'), 'Levi\u2019s Stadium', 'unicode apostrophe is text, not markup');
  assert.equal(w.MuseUtils.version, '0.2.0');
  assert.equal(w.MuseUtils.esc('&'), '&amp;');
});

test('setText assigns plain text, never markup', () => {
  const w = loadBrowserModule('js/muse-utils.js', {});
  const el = w.document.createElement('span');
  w.setText(el, '<img src=x onerror=alert(1)>');
  assert.equal(el.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(w.setText(null, 'x'), null);
  assert.equal(w.setText(el, null).textContent, '');
});

test('museParseRichCb accepts only the exact callback shape', () => {
  const w = loadBrowserModule('js/muse-utils.js', {});
  const p = w.museParseRichCb;
  // The parser runs in a separate vm realm (different Object.prototype), so compare structurally.
  const shape = (expr) => JSON.stringify(p(expr));
  assert.equal(shape("function(v){surveySetFinding('museaitour','f1','text',v)}"),
    JSON.stringify({ name: 'surveySetFinding', args: ['museaitour', 'f1', 'text'] }));
  assert.equal(shape('function(v){panoNotesSet(v)}'), JSON.stringify({ name: 'panoNotesSet', args: [] }));
  assert.equal(shape("function(x){setDeptNote('k',0,x)}"), 'null'); // unquoted fixed arg
  assert.equal(shape('function(v){surveySetFinding("a\\"b",v)}'),
    JSON.stringify({ name: 'surveySetFinding', args: ['a"b'] }));
  assert.equal(shape("function(v){surveySetFinding('k,0',v)}"),
    JSON.stringify({ name: 'surveySetFinding', args: ['k,0'] }));
  for (const bad of [
    '', 'setDeptNote(\'k\',0)', 'fetch(\'https://evil.example\')',
    'function(v){alert(1)}', 'function(v){x=document.cookie}',
    "function(v){surveySetFinding('a',v);evil()}",
    "function(v){surveySetFinding('a'+location,v)}",
    "function(v){surveySetFinding('a' 'b',v)}",
    "function(v){surveySetFinding('a',w)}",
    "function(v){surveySetFinding('unterminated,v)}",
    'function(v){while(1){}}',
  ]) assert.equal(p(bad), null, bad);
});
