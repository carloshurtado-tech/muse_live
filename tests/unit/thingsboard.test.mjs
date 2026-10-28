import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

// Broadcast Ops telemetry tiles: label/value and sparkline must never compete
// for the same row. The value sits on the header row; the sparkline renders
// fluid-width below it (regression: fixed 120px SVG crammed beside the text
// overlapped labels and values on narrow cards).
test('KPI tiles stack value over a fluid sparkline', () => {
  const win = loadBrowserModule('js/muse-thingsboard.js', {
    productions: { museaitour: { name: 'Muse AI World Tour 2026' } },
    esc: (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  });
  const html = win.MuseThingsBoard.panelHTML('museaitour');
  for (const label of ['Temp', 'Vibration', 'Voltage', 'Network', 'Humidity', 'UPS load']) {
    assert.ok(html.includes(label), 'panel shows ' + label);
  }
  assert.doesNotMatch(html, /<svg width="120"/, 'no fixed-width sparkline remains');
  const tiles = html.split('tb-kpi"').slice(1);
  assert.equal(tiles.length, 6);
  for (const tile of tiles) {
    const vi = tile.indexOf('data-tb-kpi="');
    const si = tile.indexOf('data-tb-spark="');
    assert.ok(vi > -1 && si > vi, 'sparkline renders below the value row');
    assert.match(tile.slice(si), /<svg width="100%"/, 'sparkline is fluid width');
  }
});
