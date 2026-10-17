import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

test('Muse runs a tool loop against the (mock) model and answers with trace chips', async ({ page }) => {
  const errors = await signIn(page);
  await page.evaluate(() => window.toggleMuseAi());
  await page.fill('#museaiInput', 'Has audio finished on Orion? what is missing');
  await page.press('#museaiInput', 'Enter');
  await page.waitForFunction(() => window.MuseAgent && !window.MuseAgent.busy && document.querySelectorAll('.ma-bot .ma-md').length > 0, null, { timeout: 90_000 });
  const answer = await page.locator('.ma-bot .ma-md').last().innerText();
  expect(answer).toMatch(/Mock answer/);
  await expect(page.locator('.ma-trace .ma-chip').first()).toContainText(/Audio/);
  expect(errors, errors.join('\n')).toEqual([]);
});
