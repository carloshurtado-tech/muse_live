import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

// The collapsed rail clips anything past its box (overflow hidden), so the count bubbles
// must end inside it — ring included. A rail-width change that leaves them hanging over
// the edge slices them flat (regressed when the rail narrowed to 48px).
test('rail count bubbles fit inside the collapsed rail', async ({ page }) => {
  const errors = await signIn(page);
  const m = await page.evaluate(() => {
    const rail = document.querySelector('#navRail').getBoundingClientRect();
    const badges = [];
    document.querySelectorAll('#navRail .muse-badge, #navRail .nav-rail-attn, #navRail .nav-rail-badge').forEach((b) => {
      if (!b.textContent.trim()) return;
      const r = b.getBoundingClientRect();
      if (r.width === 0) return;
      badges.push({ text: b.textContent, left: r.left, right: r.right });
    });
    return { rail: { left: rail.left, right: rail.right }, badges };
  });
  expect(m.badges.length, 'expected some rail badges to check').toBeGreaterThan(0);
  for (const b of m.badges) {
    expect(b.left, `bubble "${b.text}" hangs off the rail's left edge`).toBeGreaterThanOrEqual(m.rail.left - 1);
    expect(b.right, `bubble "${b.text}" is cut off by the rail's right edge`).toBeLessThanOrEqual(m.rail.right - 2);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
