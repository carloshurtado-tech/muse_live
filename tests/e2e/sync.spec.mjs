import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

test('shared storage: MuseSync writes reach KV and another session reads them', async ({ page, browser }) => {
  await signIn(page);
  if (!(await page.evaluate(() => !!window.MuseSync))) await page.addScriptTag({ url: '/js/muse-sync.js' });
  await page.evaluate(() => window.MuseSync.put('e2e-probe', { hello: 'world', at: 1 }));
  await expect.poll(async () => (await page.request.get('/api/kv/e2e-probe')).status(), { timeout: 15_000 }).toBe(200);
  // a second, independent browser session sees the same value
  const other = await browser.newContext({ baseURL: page.url().replace(/\/[^/]*$/, '') });
  const p2 = await other.newPage();
  expect((await p2.request.post('/api/login', { data: { password: 'localtest' } })).ok()).toBe(true);
  expect(await (await p2.request.get('/api/kv/e2e-probe')).json()).toEqual({ hello: 'world', at: 1 });
  await other.close();
});
