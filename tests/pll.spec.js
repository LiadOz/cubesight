import { test, expect } from 'playwright/test';

async function openPLL(page) {
  await page.goto('/#/pll-recognition');
  await expect(page.locator('#pll-cube canvas')).toBeVisible();
}

async function answerCurrent(page, correct = true) {
  const id = await page.locator('#pll-view').getAttribute('data-pll-case');
  const choices = page.locator('[data-pll-answer]');
  const wrongId = correct ? null : await choices.evaluateAll((buttons, expected) => buttons.map((button) => button.dataset.pllAnswer).find((value) => value !== expected), id);
  const answer = page.locator(`[data-pll-answer="${correct ? id : wrongId}"]`);
  await answer.click();
  return id;
}

test('PLL recognition uses a fixed full cube and beginner-sized learn block', async ({ page }) => {
  await openPLL(page);
  await expect(page.locator('#pll-cube canvas')).toHaveAttribute('data-rotation', 'locked');
  await expect(page.locator('#pll-case-number')).toContainText('TRIAL');
  await expect(page.locator('[data-pll-answer]')).toHaveCount(2);
  await page.waitForTimeout(700);
  await expect(page.locator('#pll-glance-overlay')).toBeHidden();
  await expect(page.locator('#pll-cube canvas')).toBeVisible();
  await answerCurrent(page, true);
  await expect(page.locator('#pll-cube canvas')).toBeVisible();
  await expect(page.locator('#pll-feedback')).toContainText('Correct');
  await expect(page.locator('#pll-accuracy')).toHaveText('100%');
});

test('PLL errors become a contrastive retry only after two intervening answers', async ({ page }) => {
  await openPLL(page);
  const missed = await answerCurrent(page, false);
  await expect(page.locator('#pll-due')).toHaveText('1');
  await expect(page.locator('#pll-case-list')).toContainText('confused with');
  for (let index = 0; index < 2; index += 1) {
    await page.locator('#pll-next').click();
    await expect(page.locator('#pll-view')).not.toHaveAttribute('data-pll-case', missed);
    await answerCurrent(page, true);
  }
  await page.locator('#pll-next').click();
  await expect(page.locator('#pll-view')).toHaveAttribute('data-pll-case', missed);
});

test('PLL adaptive glance is accuracy-gated and slow attempts stay usable without being logged', async ({ page }) => {
  await openPLL(page);
  await page.locator('#pll-glance').check();
  for (let index = 0; index < 10; index += 1) {
    await answerCurrent(page, true);
    if (index < 9) await page.locator('#pll-next').click();
  }
  await expect(page.locator('#pll-glance-caption')).toContainText('450 ms · 0/10');

  const attemptsBefore = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('cubesight-pll-progress-v1'))).reduce((sum, item) => sum + item.attempts, 0));
  await page.clock.install();
  await page.locator('#pll-next').click();
  await page.clock.fastForward(10_050);
  await expect(page.locator('#pll-pause')).toBeHidden();
  await expect(page.locator('#pll-feedback')).toContainText('practice only');
  await expect(page.locator('[data-pll-answer]').first()).toBeEnabled();
  await answerCurrent(page, true);
  await expect(page.locator('#pll-feedback')).toContainText('practice only');
  const attemptsAfter = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('cubesight-pll-progress-v1'))).reduce((sum, item) => sum + item.attempts, 0));
  expect(attemptsAfter).toBe(attemptsBefore);
});

test('PLL stays within a mobile viewport and collapses settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPLL(page);
  await expect(page.locator('.pll-settings')).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('PLL canvas stays bounded on a high-density Android display', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/#/pll-recognition');
  const canvas = page.locator('#pll-cube canvas');
  await expect(canvas).toBeVisible();
  const sizes = [];
  for (const delay of [100, 250, 500]) {
    await page.waitForTimeout(delay);
    sizes.push(await page.evaluate(() => {
      const mount = document.querySelector('#pll-cube').getBoundingClientRect();
      const cubeCanvas = document.querySelector('#pll-cube canvas').getBoundingClientRect();
      return { mountHeight: mount.height, canvasWidth: cubeCanvas.width, canvasHeight: cubeCanvas.height, documentHeight: document.documentElement.scrollHeight };
    }));
  }
  for (const size of sizes) {
    expect(size.mountHeight).toBeLessThanOrEqual(221);
    expect(size.canvasWidth).toBeLessThanOrEqual(337);
    expect(size.canvasHeight).toBeLessThanOrEqual(221);
    expect(size.documentHeight).toBeLessThan(2_500);
  }
  expect(Math.max(...sizes.map((size) => size.mountHeight)) - Math.min(...sizes.map((size) => size.mountHeight))).toBeLessThan(1);
  await context.close();
});

test('PLL remains usable with the SVG compatibility view when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto('/#/pll-recognition');
  await expect(page.locator('#pll-cube svg')).toBeVisible();
  await expect(page.locator('.pll-stage-topline .view-lock')).toHaveText('Fixed 2D compatibility view');
  await expect(page.locator('#pll-cube [data-kind="corner"]')).toHaveCount(12);
  await expect(page.locator('#pll-cube [data-masked="true"]')).toHaveCount(0);
  await expect(page.locator('[data-pll-answer]')).toHaveCount(2);
  await answerCurrent(page, true);
  await expect(page.locator('#pll-feedback')).toContainText('Correct');
});
