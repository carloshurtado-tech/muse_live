// Muse accuracy eval — drives the real Ask Muse drawer headlessly and grades each answer.
//
//   BASE=http://127.0.0.1:8788 PASSWORD=… CHROME=/path/to/chrome node eval/run.mjs [--only id,id] [--limit n] [--out eval/results.json]
//
// Every question runs in a fresh conversation against the real model (Meta Model API via
// /api/museai), with the live Muse Live data in the page. A question passes when every `must`
// group in eval/questions.json matches (any alternative, case-insensitive) and no `forbid`
// pattern appears. Writes eval/results.json and eval/REPORT.md.
// Needs playwright-core (npm i -D playwright-core) or PLAYWRIGHT_CORE=/abs/path/to/playwright-core.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const PASSWORD = process.env.PASSWORD || process.env.MUSE_PASSWORD;
const only = (opt('only', '') || '').split(',').filter(Boolean);
const limit = +opt('limit', 0) || 0;
const outFile = opt('out', path.join(here, 'results.json'));
if (!PASSWORD) { console.error('Set PASSWORD to the Muse Live access password.'); process.exit(2); }

const pw = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href : 'playwright-core');
const chromium = pw.chromium || (pw.default && pw.default.chromium);
const spec = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
let qs = spec.questions.filter((q) => !only.length || only.includes(q.id));
if (limit) qs = qs.slice(0, limit);

function grade(q, text) {
  const t = String(text || '');
  const missing = (q.must || []).filter((group) => !group.some((re) => new RegExp(re, 'i').test(t))).map((g) => g.join(' | '));
  const forbidden = (q.forbid || []).filter((re) => new RegExp(re, 'i').test(t));
  const groups = (q.must || []).length || 1;
  return { pass: !missing.length && !forbidden.length, score: Math.max(0, (groups - missing.length) / groups - (forbidden.length ? 0.5 : 0)), missing, forbidden };
}

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const login = await ctx.request.post(BASE + '/api/login', { data: { password: PASSWORD } });
if (!login.ok()) { console.error('Login failed', login.status()); process.exit(2); }
const page = await ctx.newPage();
await page.goto(BASE + '/');
await page.waitForFunction(() => window.MuseAgent && window.productions && document.querySelector('.view-pane'), null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { try { localStorage.setItem('muselive_proactive_quiet', '1'); } catch (e) {} if (!window.museaiOpen) window.toggleMuseAi(); });

const results = [];
const t0 = Date.now();
for (const q of qs) {
  await page.evaluate(() => window.MuseAgent.reset());
  const started = Date.now();
  await page.evaluate((text) => window.MuseAgent.ask(text), q.q);
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !window.MuseAgent.busy, null, { timeout: 240000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#museaiMessages .ma-row.ma-bot:not(.mp-row) .ma-md')];
    const last = rows.pop();
    const trace = [...document.querySelectorAll('#museaiMessages .ma-trace')].pop();
    return { answer: last ? last.innerText : '', trace: trace ? trace.innerText.replace(/\s*↗\s*/g, ' ').replace(/\n+/g, ' | ') : '', metric: (window.MuseAgent.metrics || []).slice(-1)[0] || null };
  });
  const g = grade(q, r.answer);
  results.push({ id: q.id, cat: q.cat, q: q.q, ...g, ms: Date.now() - started, effort: r.metric && r.metric.effort, steps: r.metric && r.metric.steps, tokens: r.metric && r.metric.tokens, trace: r.trace, answer: r.answer });
  console.log((g.pass ? 'PASS' : 'FAIL') + '  ' + q.id.padEnd(8) + ' ' + String(Date.now() - started).padStart(6) + ' ms  ' + (g.pass ? '' : 'missing: ' + g.missing.join(' ; ') + (g.forbidden.length ? ' forbidden: ' + g.forbidden.join(',') : '')));
}
await browser.close();

const passed = results.filter((r) => r.pass).length;
const byCat = {};
results.forEach((r) => { const c = byCat[r.cat] || (byCat[r.cat] = { n: 0, pass: 0, ms: 0 }); c.n++; c.pass += r.pass ? 1 : 0; c.ms += r.ms; });
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const summary = { ran_at: new Date().toISOString(), base: BASE, questions: results.length, passed, accuracy: results.length ? +(passed / results.length * 100).toFixed(1) : 0,
  partial_score: results.length ? +(results.reduce((s, r) => s + r.score, 0) / results.length * 100).toFixed(1) : 0,
  median_ms: median(results.map((r) => r.ms)), total_tokens: results.reduce((s, r) => s + (r.tokens || 0), 0), wall_ms: Date.now() - t0, by_category: byCat };
fs.writeFileSync(outFile, JSON.stringify({ summary, results }, null, 1));

const md = ['# Muse accuracy eval', '',
  `Run ${summary.ran_at} against ${BASE}.`, '',
  `**${passed} / ${results.length} passed (${summary.accuracy}%)** · partial credit ${summary.partial_score}% · median answer time ${(summary.median_ms / 1000).toFixed(1)} s · ${summary.total_tokens.toLocaleString()} model tokens`, '',
  '| Category | Passed | Median-ish time |', '|---|---|---|',
  ...Object.keys(byCat).map((c) => `| ${c} | ${byCat[c].pass} / ${byCat[c].n} | ${(byCat[c].ms / byCat[c].n / 1000).toFixed(1)} s avg |`), '',
  '## Failures', '',
  ...(results.filter((r) => !r.pass).map((r) => `- **${r.id}** — ${r.q}\n  - missing: ${r.missing.join(' ; ') || '—'}${r.forbidden.length ? '\n  - forbidden: ' + r.forbidden.join(', ') : ''}\n  - answer: ${r.answer.replace(/\s+/g, ' ').slice(0, 300)}`)),
  results.every((r) => r.pass) ? '_None._' : '', '',
  '## How grading works', '', 'Each question lists required facts as groups of regex alternatives; every group must appear in the answer, and any `forbid` pattern fails it. See `eval/questions.json`.', ''].join('\n');
fs.writeFileSync(path.join(path.dirname(outFile), 'REPORT.md'), md);
console.log(`\n${passed}/${results.length} passed (${summary.accuracy}%), median ${(summary.median_ms / 1000).toFixed(1)} s`);
