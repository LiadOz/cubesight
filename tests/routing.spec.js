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
  // [path, view id, nav item lit, document title]
  ['solve', 'brain', 'solve', 'solve'],
  ['drills', 'drills', 'drills', 'drills'],
  ['drills/corners', 'corner', 'drills', 'corner recognition'],
  ['drills/f2l', 'f2l', 'drills', 'F2L deduction'],
  ['drills/pll', 'pll', 'drills', 'PLL recognition'],
  ['drills/scout', 'scout', 'drills', 'cross planning'],
  ['algs', 'algs', 'algs', 'algs'],
  ['progress', 'progress', 'progress', 'progress'],
  ['history', 'history', null, 'history'],
  ['timer', 'timer', null, 'timer'],
  ['dev/studio', 'smart', null, 'studio'],
];

for (const [path, tool, nav, title] of routes) {
  test(`#/${path} supports direct links and refresh`, async ({ page }) => {
    await page.goto(`/?source=bookmark#/${path}`);
    for (let i = 0; i < 2; i++) {
      await expect(page.locator(`#${tool}-view`)).toBeVisible();
      if (nav) await expect(page.getByRole('link', { name: nav, exact: true })).toHaveAttribute('aria-current', 'page');
      else await expect(page.locator('.main-nav [aria-current]')).toHaveCount(0);
      await expect(page).toHaveTitle(`${title} · CubeSight`);
      for (const [, other] of routes) {
        if (other !== tool) await expect(page.locator(`#${other}-view`)).toBeHidden();
      }
      if (i === 0) await page.reload();
    }
    await expect(page).toHaveURL(new RegExp(`\\?source=bookmark#/${path}$`));
  });
}

// Old hash -> new hash, with a query string in the hash and one before it.
const redirects = [
  ['brain', 'solve', 'brain'],
  ['corners', 'drills/corners', 'corner'],
  ['f2l', 'drills/f2l', 'f2l'],
  ['pll-recognition', 'drills/pll', 'pll'],
  ['pll', 'drills/pll', 'pll'],
  ['cross-scout', 'drills/scout', 'scout'],
  ['scout', 'drills/scout', 'scout'],
  ['debug', 'dev/studio', 'smart'],
  ['smart-cube', 'dev/studio', 'smart'],
  ['dev', 'dev/studio', 'smart'],
];
for (const [oldPath, newPath, tool] of redirects) {
  test(`old #/${oldPath} redirects to #/${newPath}, keeping query parameters`, async ({ page }) => {
    await page.goto(`/?source=test#/${oldPath}?cases=Aa,Ab&mode=mix`);
    await expect(page).toHaveURL(new RegExp(`\\?source=test#/${newPath}\\?cases=Aa,Ab&mode=mix$`));
    await expect(page.locator(`#${tool}-view`)).toBeVisible();
    await page.goto(`/#/${oldPath}`);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`#/${newPath}$`));
    await expect(page.locator(`#${tool}-view`)).toBeVisible();
  });
}

test('redirects replace the old entry, so Back does not loop', async ({ page }) => {
  await page.goto('/#/algs');
  await page.evaluate(() => { location.hash = '#/pll-recognition'; });
  await expect(page).toHaveURL(/#\/drills\/pll$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/algs$/);
});

test('navigation supports history, same-page links and home', async ({ page }) => {
  await page.goto('/#/solve');
  await page.getByRole('link', { name: 'drills', exact: true }).click();
  await expect(page.locator('#drills-view')).toBeVisible();
  await page.locator('[data-drill="f2l"]').click();
  await expect(page.locator('#f2l-view')).toBeVisible();
  await page.getByRole('link', { name: 'drills', exact: true }).click();
  await page.locator('[data-drill="scout"]').click();
  await expect(page.locator('#scout-view')).toBeVisible();
  await page.getByRole('link', { name: 'drills', exact: true }).click();
  await expect(page.locator('#drills-view')).toBeVisible();
  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole('link', { name: 'drills', exact: true }).click();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.goBack();
  await expect(page.locator('#scout-view')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#drills-view')).toBeVisible();
  await page.getByRole('link', { name: 'CubeSight home' }).click();
  await expect(page.locator('#brain-view')).toBeVisible();
  await expect(page).toHaveURL(/#\/solve$/);
});

test('the desktop home is the solve screen, with or without a cube', async ({ page }) => {
  await page.goto('/?source=test');
  await expect(page).toHaveURL(/\?source=test#\/solve$/);
  await expect(page.locator('#brain-view')).toBeVisible();
});

test('unknown routes fall back to home without dropping query parameters', async ({ page }) => {
  await page.goto('/?source=test#/unknown');
  await expect(page).toHaveURL(/\?source=test#\/solve$/);
  await expect(page.locator('#brain-view')).toBeVisible();
});

test('the solve screen debug drawer links to the studio', async ({ page }) => {
  await page.goto('/#/solve');
  await page.locator('#brain-debug-toggle').click();
  await expect(page.getByTestId('open-studio')).toBeVisible();
  await page.getByTestId('open-studio').click();
  await expect(page).toHaveURL(/#\/dev\/studio$/);
  await expect(page.locator('#smart-view')).toBeVisible();
});

test('direct Scout navigation does not arm the corner inactivity prompt', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#/cross-scout?mode=explore');
  await expect(page.locator('#scout-highlight')).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('#scout-view')).toBeVisible();
});

test('drill keys do nothing on other pages', async ({ page }) => {
  const attempts = () => page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2') || '{"attempts":0}').attempts);
  await page.goto('/#/drills/corners');
  await expect(page.locator('#cube canvas')).toBeVisible();
  for (const hash of ['#/dev/studio', '#/algs', '#/progress', '#/drills']) {
    await page.goto(`/${hash}`);
    const before = await attempts();
    await page.keyboard.press('w');
    await page.keyboard.press('1');
    await page.keyboard.press('s');
    await page.keyboard.press('n');
    expect(await attempts()).toBe(before);
    await expect(page.locator('#pause-overlay')).toBeHidden();
  }
});
