import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { signIn } from './helpers.mjs';

test('techbook PDF exports from live data', async ({ page }) => {
  const errors = await signIn(page);
  const dl = page.waitForEvent('download', { timeout: 90_000 });
  await page.evaluate(() => window.downloadTechbook('museaitour'));
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/\.pdf$/);
  const file = await d.path();
  const buf = fs.readFileSync(file);
  expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  expect(buf.length).toBeGreaterThan(50_000);
  expect(errors, errors.join('\n')).toEqual([]);
});
