import { test, expect } from './helpers/coverage-test.js';

// The solve page holds a screen wake lock while it is in view. navigator.wakeLock
// is stubbed so the sequence of requests and releases is observable.
async function stubWakeLock(page, { rejectFirst = 0 } = {}) {
  await page.addInitScript(rejectFirst => {
    const log = { requests: 0, released: 0, active: 0, rejectLeft: rejectFirst };
    window.__wake = log;
    let state = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    window.__setVisibility = value => { state = value; if (value === 'hidden') window.__wake.dropAll?.(); document.dispatchEvent(new Event('visibilitychange')); };
    const sentinels = new Set();
    log.dropAll = () => { for (const s of [...sentinels]) s._drop(); };   // the browser frees locks on hide
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
      async request() {
        log.requests++;
        if (log.rejectLeft > 0) { log.rejectLeft--; throw new DOMException('refused', 'NotAllowedError'); }
        const s = new EventTarget();
        s.released = false; log.active++; sentinels.add(s);
        s._drop = () => { if (s.released) return; s.released = true; log.active--; log.released++; sentinels.delete(s); s.dispatchEvent(new Event('release')); };
        s.release = async () => s._drop();
        return s;
      } } });
  }, rejectFirst);
}
const snap = page => page.evaluate(() => ({ requests: window.__wake.requests, active: window.__wake.active, released: window.__wake.released }));

test('the solve page holds a wake lock, re-acquires it after the page was hidden, and releases on leaving', async ({ page }) => {
  await stubWakeLock(page);
  await page.goto('/#/solve');
  await expect(page.locator('#brain-view > *').first()).toBeAttached();
  await expect.poll(() => snap(page).then(s => s.active)).toBe(1);

  await page.evaluate(() => window.__setVisibility('hidden'));
  expect((await snap(page)).active).toBe(0);
  await page.evaluate(() => window.__setVisibility('visible'));
  await expect.poll(() => snap(page).then(s => s.active)).toBe(1);
  expect((await snap(page)).requests).toBe(2);

  await page.evaluate(() => { location.hash = '#/history'; });
  await expect.poll(() => snap(page).then(s => s.active)).toBe(0);
  // Back to the page while it is not wanted: becoming visible must not take it again.
  await page.evaluate(() => { window.__setVisibility('hidden'); window.__setVisibility('visible'); });
  expect((await snap(page)).active).toBe(0);
  await page.evaluate(() => { location.hash = '#/solve'; });
  await expect.poll(() => snap(page).then(s => s.active)).toBe(1);
});

test('a refused wake lock request neither breaks the solve page nor shows an error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await stubWakeLock(page, { rejectFirst: 1 });
  await page.goto('/#/solve');
  await expect(page.locator('#brain-view > *').first()).toBeAttached();
  await expect.poll(() => snap(page).then(s => s.requests)).toBe(1);
  expect((await snap(page)).active).toBe(0);
  await expect(page.locator('#brain-view')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Later visibility changes retry, and a later grant works.
  await page.evaluate(() => { window.__setVisibility('hidden'); window.__setVisibility('visible'); });
  await expect.poll(() => snap(page).then(s => s.active)).toBe(1);
  expect(errors).toEqual([]);
});
