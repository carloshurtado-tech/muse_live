import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// Every browser module has its own esc(); all of them must neutralise the five HTML-significant characters,
// single quote included (attribute values in the string templates are often single-quoted).
const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /^[\w-]+\.js$/.test(f) && !/\.min\.js$/.test(f));
function escSource(src) {
  const at = src.search(/function esc\s*\(/); if (at < 0) return null;
  let depth = 0, i = src.indexOf('{', at);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(at, i + 1);
}
test('every esc() escapes & < > " and \'', () => {
  let seen = 0;
  for (const f of files) {
    const fn = escSource(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')); if (!fn) continue;
    const esc = new Function('global', 'return (' + fn + ')')({});
    assert.equal(esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;', f);
    seen++;
  }
  assert.ok(seen >= 10, 'found ' + seen + ' esc() definitions');
});
// innerHTML sites that concatenate data without esc() on the same line. shortcut: same-line heuristic, so
// it is a ratchet (the number may fall, never rise) rather than a precise lint; tighten when the bundles are modularised.
test('innerHTML assignments without esc() do not multiply', () => {
  const BASELINE = 79; // 2026-10-19
  let n = 0, where = [];
  for (const f of files) {
    fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').split('\n').forEach((l, i) => {
      if (!/\.innerHTML\s*\+?=\s*[^;]*\+/.test(l) || /esc\(|\.innerHTML\s*\+?=\s*'[^']*'\s*;/.test(l)) return;
      n++; where.push(f + ':' + (i + 1));
    });
  }
  assert.ok(n <= BASELINE, 'new un-escaped innerHTML sites:\n' + where.join('\n'));
  console.log('innerHTML-without-esc sites: ' + n);
});
