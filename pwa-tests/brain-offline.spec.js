import { test, expect } from 'playwright/test';

// The site is an offline, installed PWA: after one online visit the Brain must
// load with no network, in both styles (Orbit, Mono) and both modes. Its style
// modules load lazily, so this proves they (and their CSS and fonts) are
// precached, not just the app shell. Runs against the production build.
test('Brain renders offline in both styles and modes', async ({ page, context }) => {
  const pageErrors = [];
  const failed = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failed.push(`${request.url()} ${request.failure()?.errorText}`));

  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service worker did not take control')), 10_000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
  });

  await context.setOffline(true);
  for (const style of ['orbit', 'mono']) {
    for (const theme of ['dark', 'light']) {
      await page.evaluate(([style, theme]) => {
        localStorage.setItem('cubesight-theme', theme);
        localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
      }, [style, theme]);
      await page.goto('/#/brain');
      await page.reload({ waitUntil: 'domcontentloaded' });
      const brain = page.locator('#brain-view .brain');
      await expect(brain).toHaveAttribute('data-brain-style', style);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(brain.locator('#brain-cube canvas')).toBeVisible();
      await expect(brain).toHaveAttribute('data-screen', 'disconnected');
      await expect(brain.locator('#brain-connect')).toBeVisible();
      // The style's own parts mounted (its lazy chunk loaded from the cache).
      await expect(brain.locator(style === 'orbit' ? '.b-oring' : '.m-tl')).toHaveCount(1);
      // Its fonts are available offline too.
      const font = style === 'mono' ? '300 20px "DM Mono"' : '400 20px "Manrope Variable"';
      expect(await page.evaluate(async f => { await document.fonts.load(f); return document.fonts.check(f); }, font)).toBe(true);
      // Dev-server-only features are not in the production build.
      await expect(brain.locator('#brain-send-log')).toHaveCount(0);
      await expect(brain.locator('#brain-save-recording')).toHaveCount(1);
    }
  }
  expect(failed).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('site navigation and every WP1 route load offline after installation', async ({ page, context }) => {
  const failed = [];
  const pageErrors = [];
  page.on('requestfailed', request => failed.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service worker did not take control')), 10_000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
  });
  await context.setOffline(true);
  const routes = [
    ['drills', 'drills-view'], ['drills/corners', 'corner-view'], ['drills/pll', 'pll-view'],
    ['drills/f2l', 'f2l-view'], ['drills/scout', 'scout-view'], ['algs', 'algs-view'], ['progress', 'progress-view'],
    ['dev/studio', 'smart-view'],
  ];
  for (const [route, view] of routes) {
    await page.goto(`/#/${route}`);
    await expect(page.locator(`#${view}`)).toBeVisible();
  }
  expect(failed).toEqual([]);
  expect(pageErrors).toEqual([]);
});
