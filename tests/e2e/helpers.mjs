// Shared helpers for the end-to-end specs.
import { expect } from '@playwright/test';

// Third-party noise we don't own: YouTube's embedded player and browser permission chatter.
export const NOISE = /isExternalMethodAvailable|compute-pressure|Permissions policy violation|youtube|ytimg|googlevideo|Failed to load resource|ERR_|net::|NS_BINDING_ABORTED|tile|openfreemap|cartocdn|arcgis|ResizeObserver/i;

/** Sign in with the test password and open the app. Returns the collected page errors. */
export async function signIn(page) {
  const errors = [];
  page.on('pageerror', (e) => { if (!NOISE.test(e.message + ' ' + (e.stack || ''))) errors.push('pageerror: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text()); });
  const r = await page.request.post('/api/login', { data: { password: 'localtest' } });
  expect(r.ok()).toBeTruthy();
  await page.goto('/');
  await page.waitForFunction(() => typeof window.productions === 'object' && document.querySelector('.view-pane.active'), null, { timeout: 60_000 });
  await page.waitForTimeout(1200);
  return errors;
}
