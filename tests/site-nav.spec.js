import { test, expect } from './helpers/coverage-test.js';

const PAGES = [['solve', 'brain'], ['drills', 'drills'], ['algs', 'algs'], ['progress', 'progress'], ['history', 'history']];

for (const theme of ['dark', 'light']) {
  for (const style of ['orbit', 'mono']) {
  test(`the nav reaches solve, drills, algs, progress and history in ${style} / ${theme}`, async ({ page }) => {
    await page.addInitScript(({ mode, pageStyle }) => {
      localStorage.setItem('cubesight-theme', mode);
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: pageStyle }));
    }, { mode: theme, pageStyle: style });
    await page.goto('/#/drills');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.main-nav .nav-link')).toHaveText(['solve', 'drills', 'algs', 'progress', 'history']);
    for (const [label, view] of PAGES) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#/${label}$`));
      await expect(page.locator(`#${view}-view`)).toBeVisible();
      if (view !== 'brain') await expect(page.locator(`#${view}-view .cs-page`)).toHaveAttribute('data-brain-style', style);
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      // The header stays readable: nav text contrasts with the bar behind it.
      const { ink, bar } = await page.evaluate(() => ({
        ink: getComputedStyle(document.querySelector('.nav-link.active')).color,
        bar: getComputedStyle(document.querySelector('.site-header')).backgroundColor,
      }));
      expect(ink).not.toBe(bar);
    }
  });
  }
}

test('the theme button shows the current mode and switches it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cubesight-theme', 'dark'));
  await page.goto('/#/algs');
  const toggle = page.locator('#theme-toggle');
  await expect(toggle).toContainText('dark');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toContainText('light');
});

test('the drills hub lists each drill with its cube marker and opens it by key', async ({ page }) => {
  await page.goto('/#/drills');
  await expect(page.locator('.hub-row')).toHaveCount(6);
  await expect(page.locator('[data-drill="corners"] .hub-cube')).toHaveText('no cube needed');
  await expect(page.locator('[data-drill="scout"] .hub-cube')).toHaveText('no cube needed');
  await page.keyboard.press('p');
  await expect(page).toHaveURL(/#\/drills\/pll$/);
  await expect(page.locator('#pll-view')).toBeVisible();
});

test('continue on the hub returns to the last drill', async ({ page }) => {
  await page.goto('/#/drills/f2l');
  await expect(page.locator('#f2l-view')).toBeVisible();
  await page.getByRole('link', { name: 'drills', exact: true }).click();
  await expect(page.locator('[data-hub-continue="f2l"]')).toBeVisible();
  await page.locator('[data-hub-continue]').click();
  await expect(page).toHaveURL(/#\/drills\/f2l$/);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('home is the drills hub when no cube is connected', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/#\/drills$/);
    await expect(page.locator('#drills-view')).toBeVisible();
  });

  test('the phone header is one 72 px row and the nav is reached through the drawer on the wordmark', async ({ page }) => {
    await page.goto('/#/drills');
    const header = await page.locator('.site-header').boundingBox();
    expect(header.height).toBe(72);
    // One row: the wordmark on the left and the cube pill on the right, nothing else visible in it (A-09 / A-12).
    await expect(page.locator('.site-header .main-nav')).toBeHidden();
    await expect(page.locator('.site-header #theme-toggle')).toHaveCount(0);
    const brand = await page.locator('.ui-header__brand').boundingBox();
    const chip = await page.locator('.ui-cube-chip').boundingBox();
    expect(brand.x).toBeCloseTo(24, 0);
    expect(chip.x + chip.width).toBeCloseTo(366, 0);
    expect(brand.y + brand.height / 2).toBeCloseTo(44, 0);
    // Tapping the wordmark opens the nav drawer; every page is reachable in it and nothing leaves the viewport.
    await page.locator('.ui-header__brand').tap();
    const drawer = page.locator('.ui-nav-drawer');
    await expect(drawer).toBeVisible();
    const nav = drawer.locator('.main-nav');
    await expect(nav.locator('.nav-link')).toHaveText(['solve', 'drills', 'algs', 'progress', 'history']);
    for (const name of ['solve', 'drills', 'algs', 'progress', 'history']) {
      const box = await nav.getByRole('link', { name, exact: true }).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    await expect(nav.getByRole('link', { name: 'drills', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(drawer.locator('#theme-toggle')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await nav.getByRole('link', { name: 'history', exact: true }).tap();
    await expect(page).toHaveURL(/#\/history$/);
    await expect(drawer).toBeHidden();
    await expect(page.locator('#history-view')).toBeVisible();
  });
});
