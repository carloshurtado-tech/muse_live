import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// Every finance bubble must name its origin and land on it: rail badge ->
// Accounts Payable tab, AP row -> the invoice document, project Finance tab
// -> AP when that show has overdue invoices. The app shell cannot boot in
// node, so these pin the wiring at the source (same convention as xss.test.mjs).
const aSrc = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-a.js'), 'utf8');
const bSrc = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-b.js'), 'utf8');

test('rail finance bubble routes overdue AP straight to Accounts Payable', () => {
  assert.ok(aSrc.includes('navGoFin()'), 'rail must define a finance deep-link');
  assert.ok(aSrc.includes("finWsTab['all']='ap'"), 'deep-link must open the AP tab');
  assert.ok(aSrc.includes('overdue AP invoice'), 'bubble tooltip must name its origin');
});

test('AP rows open the invoice document, not the project ledger', () => {
  assert.ok(bSrc.includes('openFinDoc(\\\'inv\\\','), 'AP rows must open the invoice doc');
  assert.ok(!/openProjFinance\(\\''\+v\.prod\+\\''\)/.test(bSrc.split("function finAPHTML")[1].split("function finARHTML")[0]),
    'AP rows must not route to the project workspace');
});

test('project Finance tab defaults to AP when the show has overdue invoices', () => {
  assert.ok(aSrc.includes("finWsTab[key]='ap'") || aSrc.includes('finWsTab[key]="ap"'), 'project finance must prefer AP on overdue');
});

test('finance tabs carry their own counts so the bubble origin is visible', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-b.js'), 'utf8');
  assert.ok(src.includes("finOverdueList(scope==='all'?undefined:scope)"), 'AP tab must count overdue invoices per scope');
  assert.ok(src.includes('finARAging(scope).n'), 'AR tab must count open invoices per scope');
});

test('finance badges count overdue invoices per scope', () => {
  assert.ok(bSrc.includes('function finOverdueList(key)'), 'overdue list must exist');
  assert.ok(bSrc.includes('finTabBadge(key)'), 'per-project badge must exist');
});
