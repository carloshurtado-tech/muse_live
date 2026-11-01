import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

// Sun & Shadow panel: the simulator needs an API key (env, via /api/shademap-key) and
// stalls above ~45 degrees of pitch (panels mount at 44). Regression guard for both:
// the panel must report ready, and moving the time-of-day scrubber must repaint the
// shadows (pre-dawn vs afternoon renders differ). Runs against the mock env, which
// has no key — the key endpoint is stubbed with a placeholder so the client wiring is
// exercised without the real secret; the SDK's license call is stubbed too, while
// its draw pipeline runs for real.
test('sun & shadow panel draws and follows the scrubber', async ({ page }) => {
  test.skip(!(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'))), 'no WebGL');
  await page.addInitScript(() => { try { localStorage.setItem('museTheme', 'light'); } catch (e) {} });
  await page.route('**/api/shademap-key', (route) => route.fulfill({ json: { key: 'e2e-placeholder-key' } }));
  await page.route('**/sdk/load', (route) => route.fulfill({ body: 'ok' })); // license check only; draw is local
  const errors = await signIn(page);
  await page.evaluate(() => { window.projSubTab = window.projSubTab || {}; window.projSubTab.museaitour = 'survey'; window.switchView('museaitour'); });
  await page.waitForFunction(() => ((window._shadeMaps || {}).survshade_museaitour || {}).ready, null, { timeout: 90_000 });
  const box = await page.$('.shadebox');
  expect(box, 'shade panel mounted').toBeTruthy();
  await page.waitForTimeout(6000); // tiles + first draw settle
  async function shotAt(mins) {
    await page.evaluate((v) => {
      const sc = document.getElementById('survshade_museaitour_scrub');
      sc.value = String(v); sc.dispatchEvent(new Event('input', { bubbles: true }));
    }, mins);
    await page.waitForTimeout(3500);
    return box.screenshot();
  }
  const dawn = await shotAt(420); // 7:00, before sunrise on the panel date: no shadows
  const afternoon = await shotAt(780); // 13:00: shadows hug the east sides
  expect(dawn.length, 'morning render captured').toBeGreaterThan(50_000);
  expect(afternoon.length, 'afternoon render captured').toBeGreaterThan(50_000);
  expect(dawn.equals(afternoon), 'scrubbing the time of day repainted the shadows').toBe(false);
  expect(errors, errors.join('\n')).toEqual([]);
});
