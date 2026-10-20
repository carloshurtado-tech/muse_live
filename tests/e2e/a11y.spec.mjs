import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './helpers.mjs';

// Backs the README's "0 axe violations" claim: WCAG 2.1 AA over the main views, light and dark, and the public About page.
const VIEWS = ['dashboard', 'streams', 'incidents', 'finance'];
const axe = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('iframe').exclude('.maplibregl-map').exclude('.muse-sync-pill') // the sync toast fades out over 400 ms; a mid-fade frame reads as low contrast
  // Nav buttons show a count badge (aria-hidden) next to their label; axe compares the name against ALL visible text, so "Finance" vs "Finance 3" trips this rule.
  .disableRules(['label-content-name-mismatch']);

// One line per violation: rule, first nodes, and axe's own data (colours and ratio for contrast) so a failure says where and why.
const describe = (x) => x.id + ': ' + x.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + n.html.slice(0, 100) + ' ' + JSON.stringify((n.any[0] || {}).data || {})).join(' | ');

test('main views have no WCAG 2.1 AA violations in light and dark', async ({ page }) => {
  await signIn(page);
  for (const dark of [false, true]) {
    await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark);
    for (const v of VIEWS) {
      await page.evaluate((v) => (window.navGo || window.switchView)(v), v);
      await page.waitForTimeout(800);
      const { violations } = await axe(page).analyze();
      expect(violations.map(describe), `${v} ${dark ? 'dark' : 'light'}`).toEqual([]);
    }
  }
});
test('the About page has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/about');
  await page.waitForLoadState('networkidle');
  const { violations } = await axe(page).analyze();
  expect(violations.map(describe)).toEqual([]);
});
