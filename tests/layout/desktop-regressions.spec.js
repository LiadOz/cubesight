import { test, expect } from 'playwright/test';
import { HISTORY_SEED } from './fixtures/state-seeds.js';

async function seeded(page, hash) {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(history => {
    localStorage.setItem('cubesight-theme', 'dark');
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'orbit' }));
    localStorage.setItem('cubesight-solves-v1', JSON.stringify(history));
  }, HISTORY_SEED);
  await page.goto(`/#${hash}`);
  await page.evaluate(() => document.fonts.ready);
}

test('history list: the Orbit stays inside the window and its ring is the A-07 radius, not the solve screen radius', async ({ page }) => {
  await seeded(page, '/history');
  await page.locator('.history-stage__orbit .orbit__svg').waitFor();
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    // The Orbit's SVG is inside the window, and the ring (the arc's box is at most its diameter) is the frame's r=190 at canvas scale.
    await expect.poll(() => page.evaluate(() => {
      const svg = document.querySelector('.history-stage__orbit .orbit__svg').getBoundingClientRect();
      const track = document.querySelector('.history-stage__orbit .orbit__track').getBoundingClientRect();
      const unit = Math.min(1.25, innerWidth / 1440, innerHeight / 900);
      return svg.left >= 0 && svg.right <= innerWidth && track.width / unit <= 2 * 190 + 2;
    }), { message: `${width}x${height}` }).toBe(true);
  }
});

test('Escape closes the developer drawer without also leaving a past solve', async ({ page }) => {
  await seeded(page, '/history/1000000');
  await expect(page.locator('.history-page')).toHaveAttribute('data-view', 'past');
  await page.keyboard.press('Backquote');
  await expect(page.locator('dialog.ui-dev-drawer[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.ui-dev-drawer[open]')).toHaveCount(0);
  expect(await page.evaluate(() => location.hash)).toBe('#/history/1000000');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/history');
});

test('the settings panel starts below the site header', async ({ page }) => {
  await seeded(page, '/solve');
  await page.locator('#brain-view .brain[data-brain-style="orbit"]').waitFor();
  for (const [width, height] of [[1024, 768], [1280, 720], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.keyboard.press('Tab');
    const body = page.locator('.b-settings-body');
    await expect(body).toBeVisible();
    const gap = await page.evaluate(() => document.querySelector('.b-settings-body').getBoundingClientRect().top - document.querySelector('.site-header').getBoundingClientRect().bottom);
    expect(gap, `${width}x${height}`).toBeGreaterThanOrEqual(-1);
    await page.keyboard.press('Escape');
    await expect(body).toBeHidden();
  }
});
