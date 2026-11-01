import { test, expect } from '@playwright/test';
import { signIn } from './helpers.mjs';

// The demo runs on whatever window the viewer happens to have, so every step must hold the same
// arrangement at any size: the highlight whole and inside the window, the card whole and inside it,
// and the card never on top of the highlight. Each step is checked at a different awkward size
// (tiny, letterbox, tall and narrow, huge) so one pass covers the tour and the extremes.
const SIZES = [{ width: 320, height: 480 }, { width: 1920, height: 420 }, { width: 360, height: 1400 }, { width: 2560, height: 1440 }];

test('the tour highlight and card fit any window, on every step', async ({ page }) => {
  const errors = await signIn(page);
  await page.evaluate(() => window.MuseLazy.ensureTour()); // the tour loads on demand, never at boot
  await page.waitForFunction(() => window.MuseTour, null, { timeout: 30_000 });
  await page.evaluate(() => { document.documentElement.classList.remove('muse-intro'); window.MuseTour.start({ auto: false }); });
  await page.waitForSelector('.mt-card', { timeout: 30_000 });
  const steps = await page.evaluate(() => window.MuseTour.steps.length);

  for (let s = 0; s < steps; s++) {
    await page.waitForTimeout(1400);
    await page.setViewportSize(SIZES[s % SIZES.length]);
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const sp = document.querySelector('.mt-spot'), cd = document.querySelector('.mt-card');
      const spot = sp.getBoundingClientRect(), card = cd.getBoundingClientRect();
      const clear = spot.right <= card.left + 1 || spot.left >= card.right - 1 || spot.bottom <= card.top + 1 || spot.top >= card.bottom - 1;
      const inside = (r) => r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
      // The step's own target: the highlight's top-left corner must sit exactly on the
      // target's (plus the 8px pad), or the frame drifts off what it is meant to frame.
      const title = document.querySelector('#mtTitle').textContent;
      const step = window.MuseTour.steps.find((x) => x.title === title);
      let tgt = null;
      for (const e of ((step && step.target) || [])) {
        const el = (typeof e === 'function') ? e() : document.querySelector(e);
        const r = el && el.getBoundingClientRect();
        if (r && r.width > 0) {
          const h = document.querySelector('header.sticky');
          const head = getComputedStyle(el).position === 'fixed' ? 0 : Math.max(0, Math.min(h ? h.getBoundingClientRect().bottom : 0, innerHeight / 4));
          tgt = { left: r.left, top: r.top, head };
          break;
        }
      }
      return {
        title,
        none: sp.classList.contains('is-none'), // steps that dim the whole page have no target
        spotInside: inside(spot), spotSize: Math.min(spot.width, spot.height), cardInside: inside(card), clear,
        spot: { left: spot.left, top: spot.top, w: spot.width, h: spot.height },
        vw: innerWidth, vh: innerHeight, tgt,
      };
    });
    const where = `step ${s + 1} "${m.title}" at ${JSON.stringify(SIZES[s % SIZES.length])}`;
    if (!m.none) {
      expect(m.spotInside, `highlight left the window on ${where}`).toBe(true);
      expect(m.spotSize, `highlight collapsed on ${where}`).toBeGreaterThanOrEqual(24);
      expect(m.clear, `card covers the highlight on ${where}`).toBe(true);
      if (m.tgt) { // the frame sits on the target: same placement formula as the tour
        const padL = m.tgt.left <= 1 ? 0 : 8, padT = m.tgt.top <= 1 ? 0 : 8;
        const expL = Math.min(Math.max(m.tgt.left - padL, 0), Math.max(0, m.vw - m.spot.w));
        const expT = Math.min(Math.max(m.tgt.top - padT, m.tgt.head), Math.max(0, m.vh - 16 - m.spot.h));
        expect(Math.abs(m.spot.left - expL), `highlight drifted horizontally on ${where} (want ${expL.toFixed(1)})`).toBeLessThanOrEqual(4);
        expect(Math.abs(m.spot.top - expT), `highlight drifted vertically on ${where} (want ${expT.toFixed(1)})`).toBeLessThanOrEqual(4);
      }
    }
    else expect(m.spotSize, `stale highlight on target-less ${where}`).toBe(0);
    expect(m.cardInside, `card left the window on ${where}`).toBe(true);
    if (s < steps - 1) { await page.setViewportSize({ width: 1440, height: 900 }); await page.click('#mtNext'); }
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
