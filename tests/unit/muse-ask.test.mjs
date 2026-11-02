import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// Every error, notification and conflict must be clickable into Muse with a
// fix request. The app shell cannot boot in node, so these pin the wiring at
// the source: each surface below must call museaiAsk with a fix prompt.
const aSrc = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-a.js'), 'utf8');
const bSrc = fs.readFileSync(path.join(ROOT, 'js', 'muse-app-b.js'), 'utf8');
const sSrc = fs.readFileSync(path.join(ROOT, 'js', 'muse-streaming.js'), 'utf8');

test('snapshot bottleneck / milestone block asks Muse for a fix', () => {
  assert.ok(aSrc.includes('event.stopPropagation();museaiAsk('), 'card bottleneck must open Muse without opening the project');
  assert.ok(aSrc.includes('Suggest a fix.'), 'Muse must be asked for a fix, not just a summary');
});

test('dashboard transmission conflicts ask Muse for a fix', () => {
  assert.ok(bSrc.includes("Transmission conflict: '"), 'conflict notes must build a Muse question');
  assert.ok(bSrc.includes("onclick=\"museaiAsk(\\'"), 'conflict notes must be clickable into Muse');
});

test('document warning banner asks Muse for a fix', () => {
  assert.ok(bSrc.includes("'About '+d.title"), 'doc warn must name the document in the Muse question');
  assert.ok(bSrc.includes('Ask Muse →'), 'doc warn must carry an Ask Muse button');
});

test('stream theater asks Muse about the exact stream on screen', () => {
  assert.ok(sSrc.includes('MuseStreaming.modalAsk()'), 'theater must carry an Ask Muse action');
  assert.ok(sSrc.includes('apply the recommended fix if anything is wrong'), 'inquiries must not force a fix on a healthy stream');
});

test('stream alerts are buttons that ask Muse to apply the fix', () => {
  assert.ok(sSrc.includes('MuseStreaming.askAlert('), 'alerts must call askAlert with the show and stage');
  assert.ok(sSrc.includes('Apply the fix.'), 'Muse must be asked to apply the stream fix');
});

// Wiki↔Muse is two-way: Muse reads the wiki to answer, and every substantive
// answer offers to file the solution back as a Troubleshooting article.
test('Muse answers offer to file the solution back into the wiki', () => {
  assert.ok(aSrc.includes('museaiOfferWikiSave()'), 'answers must offer the wiki save');
  assert.ok(aSrc.includes('_museaiLastQA={q:rawQ,a:t}'), 'the last Q/A must be captured for filing');
  assert.ok(aSrc.includes("title:'Troubleshooting:'+q"), 'solutions must land as Troubleshooting articles');
  assert.ok(aSrc.includes('museaiOpenSavedWiki()'), 'the saved article must open from the chat');
});
