import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

const productions = { raybangen3: { name: 'Ray-Ban Meta Gen 3 Launch', venue: 'NYC Harbor Remote · Pier 26' }, museaitour: { name: 'Muse AI World Tour 2026' } };
const SEV = (s) => +String(s).replace(/\D/g, '');

test('"what happened at Rayban" finds the Ray-Ban incidents, most severe first', () => {
  const w = loadBrowserModule('js/muse-incidents.js', { productions, order: Object.keys(productions) });
  const hits = w.MuseIncidents.search('rayban');
  assert.ok(hits.length >= 1, 'no hits');
  assert.ok(hits.every((i) => i.production === 'raybangen3'), 'non Ray-Ban hit');
  for (let i = 1; i < hits.length; i++) assert.ok(SEV(hits[i - 1].severity) <= SEV(hits[i].severity), 'not sorted by severity');
});
test('filters narrow by severity and status', () => {
  const w = loadBrowserModule('js/muse-incidents.js', { productions, order: Object.keys(productions) });
  const all = w.MuseIncidents.search('', {});
  const sev2 = w.MuseIncidents.search('', { severity: 'SEV-2' });
  assert.ok(sev2.length >= 1 && sev2.length < all.length);
  assert.ok(sev2.every((i) => i.severity === 'SEV-2'));
});

const ESC11 = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

test('BUG-11: incident rows carry ids via data-* (never raw inline handlers) and escape id text', () => {
  const w = loadBrowserModule('js/muse-incidents.js', { productions, order: Object.keys(productions), esc: ESC11 });
  const evil = {
    id: 'INC-1\'"><img src=x onerror=alert(1)>', production: 'raybangen3', title: 't', severity: 'SEV-2',
    status: 'Open', category: 'Audio', started: '2026-06-26T09:14:32-04:00', actions: [], impact: {},
  };
  const html = w.MuseIncidents.listHTML([evil]);
  assert.ok(!html.includes('<img src=x onerror'), 'raw id reached the page as markup: ' + html);
  assert.ok(!/MuseIncidents\.open\('INC-1'/.test(html), 'raw id interpolated into an inline handler: ' + html);
  assert.ok(html.includes('data-mi-act="open"'), 'row does not use the delegated data-* contract: ' + html);
  assert.ok(html.includes('data-mi-id="INC-1&#39;&quot;&gt;&lt;img'), 'id attribute is not esc()-encoded: ' + html);
});

test('BUG-11: incidents source has no id-interpolated inline handlers left', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../js/muse-incidents.js', import.meta.url), 'utf8');
  assert.ok(!/onclick="MuseIncidents\.(open|openEdit|copy|draftPostmortem)\('\\s*' \+/.test(src), 'open/edit/copy/draft still interpolate ids into onclick');
  assert.ok(!/onchange="MuseIncidents\.setStatus\('\\s*' \+/.test(src), 'setStatus still interpolates ids into onchange');
  assert.ok(!/onchange="MuseIncidents\.toggleAction\('\\s*' \+/.test(src), 'toggleAction still interpolates ids into onchange');
  assert.ok(!/'<span class="mi-id">' \+ i\.id/.test(src), 'incident id still inserted as raw text');
  assert.ok(src.includes('data-mi-act'), 'delegated data-mi-act contract missing');
});
