import { test, expect } from 'playwright/test';

const PAGES = [['solve', 'brain'], ['drills', 'drills'], ['algs', 'algs'], ['progress', 'progress']];

for (const theme of ['dark', 'light']) {
  for (const style of ['orbit', 'mono']) {
  test(`the nav reaches solve, drills, algs and progress in ${style} / ${theme}`, async ({ page }) => {
    await page.addInitScript(({ mode, pageStyle }) => {
      localStorage.setItem('cubesight-theme', mode);
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: pageStyle }));
    }, { mode: theme, pageStyle: style });
    await page.goto('/#/drills');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.main-nav .nav-link')).toHaveText(['solve', 'drills', 'algs', 'progress']);
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
  await expect(page.locator('[data-drill="scout"] .hub-cube')).toHaveText('cube optional');
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

  test('the whole nav fits on a phone', async ({ page }) => {
    await page.goto('/#/drills');
    const box = await page.locator('.main-nav').boundingBox();
    const last = await page.getByRole('link', { name: 'progress', exact: true }).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(last.x + last.width).toBeLessThanOrEqual(390);
    const actions = await page.locator('.header-actions').boundingBox();
    expect(actions.x + actions.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
