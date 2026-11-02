import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// A single unbalanced tag in a card template breaks the whole grid: the first
// card renders in-grid (narrow) while a stray close pops the grid element, so
// every following card drops out as a full-width block. Pin the balance at
// the source instead of eyeballing screenshots.
const src = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-a.js'), 'utf8');

function cardSource() {
  const i = src.indexOf('function _snapshotCard');
  const tail = src.indexOf('</button></div>', i) + '</button></div>'.length;
  return src.slice(i, tail);
}

test('snapshot card template has balanced tags', () => {
  const fn = cardSource();
  assert.ok(fn.length > 1000, 'template found');
  for (const t of ['div', 'button', 'p', 'span', 'h3']) {
    const opens = fn.match(new RegExp('<' + t + '(\\s|>)', 'g')) || [];
    const closes = fn.match(new RegExp('</' + t + '>', 'g')) || [];
    assert.equal(opens.length, closes.length, `<${t}> opens (${opens.length}) must equal closes (${closes.length})`);
  }
});

// Half-size tiles: doubled column counts halve each tile's width, and the card
// itself is compacted (p-3, text-sm title) so content fits the smaller tile.
test('snapshot grid renders half-size tiles', () => {
  const i = src.indexOf('function renderSnapshot');
  const fn = src.slice(i, src.indexOf('function _snapshotCard', i));
  assert.ok(fn.includes('md:grid-cols-4'), 'md doubles 2 -> 4');
  assert.ok(fn.includes('xl:grid-cols-6'), 'xl doubles 3 -> 6');
  assert.ok(fn.includes('2xl:grid-cols-8'), '2xl doubles 4 -> 8');
  assert.ok(!fn.includes('md:grid-cols-2'), 'old full-size md columns gone');
  const card = cardSource();
  assert.ok(card.includes('rounded-xl p-3'), 'card padding compacted');
  assert.ok(card.includes('text-sm font-semibold'), 'card title compacted');
});
