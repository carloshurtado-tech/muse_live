import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

test('Live Streams wall and a production Streaming tab render monitors and health', async ({ page }) => {
  const errors = await signIn(page);
  await page.evaluate(() => window.navGo('streams'));
  await expect(page.locator('#view-streams .ms-tile').first()).toBeVisible();
  await page.evaluate(() => { window.projSubTab.museaitour = 'streaming'; window.navGo('museaitour'); });
  await expect(page.locator('#view-museaitour .ms-stage').first()).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Incident Reports search finds the Ray-Ban post-mortems', async ({ page }) => {
  const errors = await signIn(page);
  await page.evaluate(() => window.navGo('incidents'));
  await page.fill('#miSearch', 'rayban');
  await page.waitForTimeout(400);
  const rows = page.locator('#view-incidents .mi-col-list .mi-row');
  expect(await rows.count()).toBeGreaterThanOrEqual(1);
  await expect(rows.first()).toContainText(/Ray-Ban/);
  await expect(page.locator('#miDetail h2')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
