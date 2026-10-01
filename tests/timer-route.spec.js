import { test, expect } from 'playwright/test';

test('routed timer saves a solve and its keys stay scoped after navigation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ inspection: { mode: 'off' } }));
  });
  await page.goto('/#/timer');
  await expect(page.locator('#timer-view .tm-scramble')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  const paletteMatches = () => page.evaluate(() => {
    const token = getComputedStyle(document.querySelector('#timer-view')).getPropertyValue('--b-bg').trim();
    const pageColor = getComputedStyle(document.querySelector('#timer-view')).backgroundColor;
    return token === getComputedStyle(document.documentElement).getPropertyValue('--cs-page').trim()
      && pageColor === getComputedStyle(document.querySelector('.site-header')).backgroundColor
      && pageColor === getComputedStyle(document.documentElement).backgroundColor;
  });
  await expect.poll(paletteMatches).toBe(true);
  await page.locator('#theme-toggle').click();
  await expect.poll(paletteMatches).toBe(true);
  await page.keyboard.down(' ');
  await expect(page.locator('#timer-view.tm')).toHaveAttribute('data-hold', 'ready');
  await page.keyboard.up(' ');
  await expect(page.locator('#timer-view.tm')).toHaveAttribute('data-phase', 'running');
  await page.waitForTimeout(150);
  await page.keyboard.press('x');
  await expect(page.locator('#timer-view.tm')).toHaveAttribute('data-phase', 'done');
  await expect(page.locator('#timer-view [data-testid="stats"]')).toContainText('1 solve');
  await page.getByRole('link', { name: 'drills', exact: true }).click();
  await expect(page.locator('#timer-view')).toBeHidden();
  await page.keyboard.press('r');
  await expect(page.locator('#timer-view.tm')).toHaveAttribute('data-phase', 'done');
  await page.getByRole('link', { name: 'manual timer', exact: true }).click();
  await expect(page.locator('#timer-view [data-testid="stats"]')).toContainText('1 solve');
  await page.reload();
  await expect(page.locator('#timer-view [data-testid="stats"]')).toContainText('1 solve');
});
