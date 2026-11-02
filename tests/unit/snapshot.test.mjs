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

// Reference-size cards (owner-approved look): a roomy 3-column grid with a
// large title, percent and milestone panel, reversing the half-size tiles.
// Only classes that exist in the shipped css/muse.css may be used here —
// there is no local CSS build, so unknown utilities silently do nothing.
test('snapshot grid renders reference-size cards', () => {
  const i = src.indexOf('function renderSnapshot');
  const fn = src.slice(i, src.indexOf('function _snapshotCard', i));
  assert.ok(fn.includes('md:grid-cols-2'), 'md shows 2 large cards');
  assert.ok(fn.includes('xl:grid-cols-3'), 'xl shows 3 large cards');
  assert.ok(!fn.includes('md:grid-cols-4'), 'half-size md columns gone');
  assert.ok(!fn.includes('xl:grid-cols-6'), 'half-size xl columns gone');
  assert.ok(!fn.includes('2xl:grid-cols-8'), 'half-size 2xl columns gone');
  assert.ok(fn.includes("closest('[data-drill]')"), 'Drill Down clicks are delegated');
  assert.ok(fn.includes('snapDrillBound'), 'the delegated listener is installed once');
  const card = cardSource();
  assert.ok(card.includes('rounded-xl p-5'), 'card padding roomy');
  assert.ok(card.includes('text-lg font-semibold'), 'card title large');
  assert.ok(card.includes('text-3xl font-bold'), 'percent large');
  assert.ok(card.includes('Drill Down →'), 'panel carries a Drill Down link');
  assert.ok(card.includes('data-drill='), 'Drill Down carries its project key for the delegated listener');
  assert.ok(!card.includes('onclick="event.stopPropagation();openProject('), 'no inline drill handler inside the Ask-Muse button (axe nested-interactive)');
  assert.ok(card.includes('snap-panel'), 'panel keeps card corners instead of the global button pill');
  assert.ok(card.includes("'NEXT MILESTONE'"), 'milestone label is literal caps (uppercase is banned in CSS)');
  assert.ok(card.includes("'CRITICAL PATH BOTTLENECK'"), 'bottleneck label is literal caps');
});
