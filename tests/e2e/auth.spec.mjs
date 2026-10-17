import { test, expect } from '@playwright/test';

test('signed-out visitors get the gate, no secrets, and no app code', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/muse-gated/);
  const html = await page.content();
  expect(html).not.toMatch(/b774222f|PW_HASH/);
  expect(await (await request.get('/js/muse-app-a.min.js')).text()).toContain('sign in required');
  expect((await request.get('/api/kv/live-status')).status()).toBe(401);
  const cfg = await (await request.get('/api/auth/config')).json();
  expect(cfg.ok).toBe(true);
});

test('wrong password is refused; right password signs in and identifies the user', async ({ page }) => {
  expect((await page.request.post('/api/login', { data: { password: 'nope' } })).status()).toBe(401);
  expect((await page.request.post('/api/login', { data: { password: 'localtest' } })).ok()).toBe(true);
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(me.user.role).toBe('admin');
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/muse-gated/, { timeout: 30_000 });
});
