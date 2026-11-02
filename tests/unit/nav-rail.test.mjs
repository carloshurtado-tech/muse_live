import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// The sidebar owns the only in-app entry to the Meta Ray-Ban Display
// companion. The rail renders from source templates (no DOM in unit tests),
// so pin the contract at the source: a glasses icon plus a button that opens
// /glasses/ in a new tab instead of routing to a view that does not exist.
const src = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-a.js'), 'utf8');

test('nav rail has a glasses icon', () => {
  assert.ok(/glasses:'<rect/.test(src), '_navSvg must define a glasses glyph');
});

test('nav rail links Glasses to the companion app in a new tab', () => {
  assert.ok(src.includes("data-nav=\"glasses\""), 'rail must include a Glasses entry');
  assert.ok(src.includes("window.open(\\'/glasses/\\',\\'_blank\\',\\'noopener\\')"), 'Glasses must open /glasses/ in a new tab');
  assert.ok(!src.includes("navGo('glasses')"), 'Glasses is not an in-app view and must not route through navGo');
});
