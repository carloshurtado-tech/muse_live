import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// One canonical esc() in muse-utils.js; lazy standalone engines (CAD, pano) keep
// their own so they work without the app shell. Every definition must neutralise
// the five HTML-significant characters, single quote included (attribute values
// in the string templates are often single-quoted).
const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /^[\w-]+\.js$/.test(f) && !/\.min\.js$/.test(f));
const ESC_ALLOW = new Set(['muse-utils.js', 'cad-viewer-engine.js', 'pano-engine.js']);
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
    assert.ok(ESC_ALLOW.has(f), f + ' defines its own esc() — use the shared one from muse-utils.js');
    const esc = new Function('global', 'return (' + fn + ')')({});
    assert.equal(esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;', f);
    seen++;
  }
  assert.ok(seen >= 1, 'canonical esc() missing');
});
// No dynamic code compilation in first-party scripts: museRichFire dispatches through an
// allowlist (RICH_CALLBACKS + museParseRichCb) instead of new Function/eval. Comments are
// stripped before matching so prose about the ban cannot trip the ratchet.
test('no new Function() or eval() calls in first-party scripts', () => {
  const hits = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/\/\/(?![a-z]+:\/\/).*/, '')).join('\n');
    for (const re of [/(^|[^a-zA-Z0-9_$])new\s+Function\s*\(/, /(^|[^a-zA-Z0-9_$])eval\s*\(/]) {
      const at = src.search(re);
      if (at >= 0) hits.push(f + ': ' + src.slice(Math.max(0, at - 60), at + 40).replace(/\n/g, ' '));
    }
  }
  assert.deepEqual(hits, []);
});
/* ---- app-bundle bug contracts (BUG-05/11/12/39, COORD-8/11) ----
   muse-app-a.js / muse-app-b.js are classic-script monoliths that need the full
   page to boot, so these pin the fixed source contracts the same way the
   ratchets above pin esc(). Behavioural coverage for the loadable modules
   lives in their own test files. */
const appA = () => fs.readFileSync(path.join(ROOT, 'js/muse-app-a.js'), 'utf8');
const appB = () => fs.readFileSync(path.join(ROOT, 'js/muse-app-b.js'), 'utf8');

test('BUG-05a: drawer offers bind Confirm/Cancel to a per-offer id, not the newest global', () => {
  const a = appA();
  assert.ok(a.includes('_museaiOffers'), 'per-offer store missing — Confirm still runs the newest offer');
  assert.ok(a.includes('museaiRegisterOffer'), 'offer registration helper missing');
  assert.ok(/onclick=\\"museaiConfirmAction\('\\"\s*\+\s*id/.test(a) || a.includes("museaiConfirmAction(\\''+id"), 'Confirm button is not bound to its offer id');
  assert.ok(!a.includes('onclick="museaiConfirmAction()" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-2.5 py-1">Confirm</button>\'+\n    \'<button type="button" onclick="museaiCancelAction()"'), 'legacy unbound Confirm button still rendered');
});

test('BUG-05b: Omni Confirm states the action and show, pinned to the thread production', () => {
  const b = appB();
  assert.ok(b.includes('omniDescribeAction'), 'Omni bar does not describe the pending action');
  assert.ok(/pend\.prod|_omniMuseAiPend\s*=\s*\{/.test(b), 'Omni pending does not pin the thread production');
  assert.ok(b.includes('omniCurrentProd()'), 'Omni must resolve the thread production via omniCurrentProd()');
});

test('BUG-11: Omni Muse answers render through md(), personnel names are escaped', () => {
  const b = appB();
  assert.ok(/MuseAgent[^\n]*\.md\(/.test(b), 'Omni Muse answers are not rendered with the drawer md() renderer');
  const a = appA();
  assert.ok(a.includes('esc(m.name)'), 'personnel directory still inserts the imported name raw');
  assert.ok(a.includes('esc(m.group'), 'personnel directory still inserts the group raw');
});

test('BUG-39/CLI-018: the global-search button escapes its JSON argument', () => {
  const b = appB();
  assert.ok(b.includes('esc(JSON.stringify(q))'), 'search button must use esc(JSON.stringify(q))');
  assert.ok(!b.includes("JSON.stringify(q).replace(/</g"), 'unescaped JSON.stringify(q) still breaks out of the onclick attribute');
});

test('BUG-12: the CAD PDF path disables pdf.js eval', () => {
  const b = appB();
  assert.ok(/getDocument\(\{data:buf,isEvalSupported:false\}\)/.test(b), 'getDocument must pass isEvalSupported:false');
});

test('COORD-8/11: a missing ShadeMap key fails visibly, and the fallback note stays neutral', () => {
  const a = appA();
  assert.ok(/if\(!k\)\s*throw/.test(a), 'empty ShadeMap key must throw instead of building a shadowless map');
  assert.ok(!a.includes('could not be reached on this network'), 'fallback note must not always blame the network');
  assert.ok(/_shadeFail[\s\S]{0,600}key or map configuration/.test(a), 'fallback note must name the key/configuration as a possible cause');
  assert.ok(a.includes('pitch:44'), 'the pitch-44 shadow cap must be preserved');
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
