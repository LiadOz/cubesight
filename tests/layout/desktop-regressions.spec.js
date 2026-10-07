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

test('past solve: the replay pill does not sit on the keycap row, and there is one "coach" label', async ({ page }) => {
  await seeded(page, '/history/1000000');
  await expect(page.locator('.history-page')).toHaveAttribute('data-view', 'past');
  await page.locator('.f1-results__actions [data-action="next"]').waitFor();
  for (const [width, height] of [[900, 700], [1024, 768], [1280, 720], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => {
      const pill = document.querySelector('.f1-results__actions [data-action="next"]').getBoundingClientRect();
      const keys = [...document.querySelectorAll('.history-keybar-host .ui-key-bar > span, .history-keybar__meta')].map(node => node.getBoundingClientRect()).filter(box => box.width > 0);
      const hits = keys.filter(box => box.left < pill.right && box.right > pill.left && box.top < pill.bottom && box.bottom > pill.top);
      return hits.length;
    }), { message: `${width}x${height}` }).toBe(0);
  }
  const visibleCoachWords = await page.evaluate(() => [...document.querySelectorAll('.f1-results__coach-tag')].filter(node => getComputedStyle(node).display !== 'none').length);
  expect(visibleCoachWords).toBe(0);
});

test('header nav keeps the frame positions, and with doubled text no link is clipped and a too-narrow nav scrolls by keyboard', async ({ page }) => {
  await seeded(page, '/solve');
  await page.locator('.site-header nav a').first().waitFor();
  const nav = () => page.evaluate(() => [...document.querySelectorAll('.site-header nav a')].map(link => [Math.round(link.getBoundingClientRect().left), link.scrollWidth > link.clientWidth + 1]));
  // A-01..: the nav items start at x 198, 268, 346, 408, 503 at the default text size.
  expect((await nav()).map(([x]) => x)).toEqual([198, 268, 346, 408, 503]);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      if (!el.textContent.trim()) continue;
      el.style.setProperty('font-size', `${parseFloat(getComputedStyle(el).fontSize) * 2}px`, 'important');
    }
  });
  expect((await nav()).filter(([, clipped]) => clipped)).toEqual([]);
  // Narrower than the doubled nav: it scrolls (End reaches the last link) instead of cutting links off.
  await page.setViewportSize({ width: 800, height: 720 });
  const scroller = page.locator('.site-header nav[data-scroll-x="true"]');
  expect(await scroller.evaluate(node => getComputedStyle(node).overflowX)).toMatch(/auto|scroll/);
  await scroller.focus();
  await page.keyboard.press('End');
  const scrolled = await scroller.evaluate(node => ({ left: node.scrollLeft, room: node.scrollWidth - node.clientWidth }));
  expect(scrolled.room).toBeGreaterThan(0);
  expect(scrolled.left).toBeGreaterThan(0);
});
