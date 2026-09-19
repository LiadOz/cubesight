import { test, expect } from 'playwright/test';

test('exposes the installed build and a network version marker', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('#app-build')).toHaveText(/^(development|[0-9a-f]{7})$/);
  const response = await request.get('/version.json');
  expect(response.ok()).toBe(true);
  const server = await response.json();
  expect(await page.locator('#app-build').textContent()).toBe(server.revision === 'development' ? server.revision : server.revision.slice(0, 7));
  await page.locator('[data-action="open-help"]').click();
  await page.locator('.build-info [data-action="check-update"]').click();
  await expect(page.locator('#update-status')).toContainText('is current');
});

const routes = [
  ['corners', 'corner', 'Corner recognition'],
  ['f2l', 'f2l', 'F2L deduction'],
  ['pll-recognition', 'pll', 'PLL recognition'],
  ['cross-scout', 'scout', 'Cross Scout'],
];

for (const [path, tool, title] of routes) {
  test(`${title} supports direct links and refresh`, async ({ page }) => {
    await page.goto(`/?source=bookmark#/${path}`);
    for (let i = 0; i < 2; i++) {
      await expect(page.locator(`#${tool}-view`)).toBeVisible();
      await expect(page.getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page).toHaveTitle(`${title} · Cubesight`);
      for (const [, other] of routes) {
        if (other !== tool) await expect(page.locator(`#${other}-view`)).toBeHidden();
      }
      if (i === 0) await page.reload();
    }
    await expect(page).toHaveURL(new RegExp(`\\?source=bookmark#/${path}$`));
  });
}

test('navigation supports history, same-page links and home', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/corners$/);
  await page.getByRole('link', { name: 'F2L deduction', exact: true }).click();
  await expect(page.locator('#f2l-view')).toBeVisible();
  await page.getByRole('link', { name: 'Cross Scout', exact: true }).click();
  await expect(page.locator('#scout-view')).toBeVisible();
  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole('link', { name: 'Cross Scout', exact: true }).click();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.goBack();
  await expect(page.locator('#f2l-view')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#corner-view')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#f2l-view')).toBeVisible();
  await page.getByRole('link', { name: 'Cubesight home' }).click();
  await expect(page.locator('#corner-view')).toBeVisible();
  await expect(page).toHaveURL(/#\/corners$/);
});

test('unknown routes fall back to corners without dropping query parameters', async ({ page }) => {
  await page.goto('/?source=test#/unknown');
  await expect(page).toHaveURL(/\?source=test#\/corners$/);
  await expect(page.locator('#corner-view')).toBeVisible();
});

test('direct Scout navigation does not arm the corner inactivity prompt', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#/cross-scout');
  await expect(page.locator('#scout-highlight')).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('#scout-view')).toBeVisible();
});
