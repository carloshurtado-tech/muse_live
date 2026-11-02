import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// The demo window runs to Nov 10, so the seeded calendar must stay full past
// the current week — with one deliberate double-booking for the Muse
// conflict-resolution demo. Pinned at the source: seed() needs a browser.
const src = fs.readFileSync(path.join(ROOT, 'js', 'muse-schedule.js'), 'utf8');

function seedSource() {
  const i = src.indexOf('function seed()');
  return src.slice(i, src.indexOf('/* ---------------- queries', i));
}

test('seed fills the next-week head (through Nov 10)', () => {
  const seed = seedSource();
  assert.ok(seed.includes('addDays(mon, 7)'), 'seed must book next Monday');
  assert.ok(seed.includes('addDays(mon, 8)'), 'seed must book next Tuesday');
  assert.ok(seed.includes('World Tour — stop feed · LIVE'), 'Tuesday must carry a live stop feed');
});

test('seed carries a deliberate PCR 4 double-booking for the demo', () => {
  const seed = seedSource();
  assert.ok(seed.includes('Deliberate conflict #3'), 'conflict #3 marker present');
  assert.ok(seed.includes("add('PCR 4', 'orion', 'Orion reveal — emergency line-up'"), 'Orion line-up overlaps the Ray-Ban follow-up on PCR 4');
});
