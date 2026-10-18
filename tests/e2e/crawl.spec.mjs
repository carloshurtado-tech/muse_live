import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

const VIEWS = ['streams', 'incidents', 'dashboard', 'kb', 'schedule', 'engrequests', 'personnel', 'finance', 'portal', 'comms', 'equipment', 'telemetry', 'vendors'];
const TABS = ['overview', 'ops', 'streaming', 'survey', 'finance', 'schedule', 'travel', 'crew', 'vendors', 'tracking', 'workflow', 'packlist', 'omni'];
const PRODUCTIONS = ['museaitour', 'raybangen3', 'orion', 'museailaunch', 'whatsapp', 'igcreators', 'charm'];

test('every top-level view renders without errors (light + dark)', async ({ page }) => {
  const errors = await signIn(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => window.applyTheme(t), theme);
    for (const v of VIEWS) { await page.evaluate((v) => window.navGo(v), v); await page.waitForTimeout(200); }
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const key of PRODUCTIONS) {
  test(`production "${key}": every tab renders without errors`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await signIn(page);
    const exists = await page.evaluate((k) => !!(window.productions && window.productions[k]), key);
    test.skip(!exists, 'production not in this build');
    await page.evaluate((k) => window.switchView(k), key);
    for (const t of TABS) { await page.evaluate(([k, t]) => window.setProjTab(k, t), [key, t]); await page.waitForTimeout(t === 'ops' ? 600 : 120); }
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
