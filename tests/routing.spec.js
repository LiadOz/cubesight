import { test, expect } from './helpers/coverage-test.js';

// Route logic (redirect table, query keeping, home choice, key scopes) is unit-tested in
// routes-unit.test.mjs. These tests check the wiring once per page, in one browser page each.

const routes = [
  // [path, view id, nav item lit, document title]
  ['solve', 'brain', 'solve', 'solve'],
  ['help', 'help', null, 'help'],
  ['drills', 'drills', 'drills', 'drills'],
  ['drills/corners', 'corner', 'drills', 'corner recognition'],
  ['drills/f2l', 'f2l', 'drills', 'F2L deduction'],
  ['drills/pll', 'pll', 'drills', 'PLL recognition'],
  ['drills/scout', 'scout', 'drills', 'cross planning'],
  ['algs', 'algs', 'algs', 'algs'],
  ['progress', 'progress', 'progress', 'progress'],
  ['history', 'history', 'history', 'history'],
  ['timer', 'timer', 'solve', 'timer'],
  ['dev/studio', 'smart', null, 'studio'],
];
const view = (page, tool) => tool === 'help' ? page.getByRole('dialog', { name: 'help', exact: true }) : page.locator(`#${tool}-view`);
const attempts = page => page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2') || '{"attempts":0}').attempts);

test('every route loads from a direct link and a refresh, lights its nav item, and ignores drill keys', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?source=test');
  await expect(page).toHaveURL(/\?source=test#\/solve$/);
  for (const [path, tool, nav, title] of routes) {
    await page.goto(`/?source=bookmark#/${path}`);
    for (let i = 0; i < 2; i++) {
      await expect(view(page, tool)).toBeVisible();
      if (nav) await expect(page.getByRole('link', { name: nav, exact: true })).toHaveAttribute('aria-current', 'page');
      else await expect(page.locator('.main-nav [aria-current]')).toHaveCount(0);
      await expect(page).toHaveTitle(`${title} · CubeSight`);
      const otherViews = routes.filter(([, other]) => other !== tool).map(([, other]) => `#${other}-view:visible`).join(',');
      await expect(page.locator(otherViews), `only ${tool} is visible`).toHaveCount(0);
      if (i === 0) await page.reload();
    }
    await expect(page).toHaveURL(new RegExp(`\\?source=bookmark#/${path}$`));
    if (!['corner', 'f2l', 'help'].includes(tool)) {
      const before = await attempts(page);
      for (const key of ['w', '1', 's', 'n']) await page.keyboard.press(key);
      expect(await attempts(page), `drill keys on #/${path}`).toBe(before);
      await expect(page.locator('#pause-overlay')).toBeHidden();
    }
  }
  await page.goto('/?source=test#/unknown');
  await expect(page).toHaveURL(/\?source=test#\/unknown$/);
  await expect(page.locator('#not-found-view')).toBeVisible();
  await expect(page.locator('#brain-view')).toBeHidden();
  expect(errors).toEqual([]);
});

test('an old link redirects with its query, and the redirect replaces the history entry', async ({ page }) => {
  await page.goto('/?source=test#/pll-recognition?cases=Aa,Ab&mode=mix');
  await expect(page).toHaveURL(/\?source=test#\/drills\/pll\?cases=Aa,Ab&mode=mix$/);
  await expect(page.locator('#pll-view')).toBeVisible();
  await page.goto('/#/algs');
  await page.evaluate(() => { location.hash = '#/smart-cube'; });
  await expect(page).toHaveURL(/#\/dev\/studio$/);
  await expect(page.locator('#smart-view')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/algs$/);
});

test('navigation supports history, same-page links, home and the studio link', async ({ page }) => {
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
  await page.locator('.brain-pill-setup > summary').click();
  await page.locator('#brain-debug-toggle').click();
  await page.getByTestId('open-studio').click();
  await expect(page).toHaveURL(/#\/dev\/studio$/);
  await expect(page.locator('#smart-view')).toBeVisible();
});

test('help shows the installed build and checks for an update; scout does not arm the corner prompt', async ({ page, request }) => {
  const server = await (await request.get('/version.json')).json();
  await page.clock.install();
  await page.goto('/#/help');
  await page.getByRole('link', { name: 'build and credits', exact: true }).click();
  await expect(page.locator('[data-help-build]')).toHaveText(server.revision === 'development' ? server.revision : server.revision.slice(0, 7));
  await page.locator('[data-help-update]').click();
  await expect(page.locator('[data-help-update-status]')).toContainText('is current');
  await expect(page.locator('.ui-toast-slot .toast')).toContainText('CubeSight build');
  await expect(page.locator('#app > footer')).toHaveCount(0);
  await page.goto('/#/cross-scout?mode=explore');
  await expect(page.locator('#scout-cube canvas')).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(page.locator('#pause-overlay')).toBeHidden();
});
