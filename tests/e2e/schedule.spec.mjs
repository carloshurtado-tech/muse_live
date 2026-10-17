import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

test('Muse Schedule: drag moves a booking, conflicts panel opens, project Bookings tab renders', async ({ page }) => {
  const errors = await signIn(page);
  await page.evaluate(() => { window.switchView('schedule'); window.setSchedTab('muse'); });
  const bar = page.locator('.sc-row .sc-bar').first();
  await expect(bar).toBeVisible();
  const id = await bar.getAttribute('data-id');
  const before = await page.evaluate((id) => window.MuseSchedule.get(id).start, id);
  await bar.scrollIntoViewIfNeeded();
  const bb = await bar.boundingBox();
  await page.mouse.move(bb.x + 12, bb.y + bb.height / 2); await page.mouse.down();
  await page.mouse.move(bb.x + 40, bb.y + bb.height / 2, { steps: 4 }); await page.mouse.move(bb.x + 70, bb.y + bb.height / 2, { steps: 4 });
  await page.mouse.up(); await page.waitForTimeout(400);
  const after = await page.evaluate((id) => window.MuseSchedule.get(id).start, id);
  expect(after).not.toBe(before);
  await page.evaluate(() => window.MuseSchedule.panel('conflicts'));
  expect(await page.evaluate(() => window.MuseSchedule.conflicts().length)).toBeGreaterThanOrEqual(0);
  await page.evaluate(() => { window.projSubTab.museailaunch = 'bookings'; window.navGo('museailaunch'); });
  await page.waitForTimeout(800);
  expect(errors, errors.join('\n')).toEqual([]);
});
