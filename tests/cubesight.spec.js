import { test, expect } from 'playwright/test';

test('loads the 3D trainer and Rust engine', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');

  await expect(page.locator('#cube canvas')).toBeVisible();
  await expect(page.locator('#engine-badge')).toHaveText('RUST · WASM');
  await expect(page.locator('.answer-button')).toHaveCount(6);
  await expect(page.locator('.answer-button kbd')).toHaveText(['W', 'Y', 'G', 'B', 'R', 'O']);
  await expect(page.locator('#known-colors')).toBeHidden();
  await expect(page.locator('#case-mode')).toHaveAttribute('data-target-corner', /^(UFL|UBR|DFR)$/);
  await expect(page.locator('#cube canvas')).toHaveAttribute('data-rotation', 'locked');
  expect(errors).toEqual([]);
});

test('accepts color initials and advances all three corners', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Three corners' }).click();
  await expect(page.locator('#corner-sequence span')).toHaveCount(3);
  await expect(page.locator('#case-mode')).toContainText('1/3');
  await expect(page.locator('#cube canvas')).toHaveAttribute('data-corner-presentation', 'full');

  const key = (await page.locator('.answer-button kbd').first().textContent()).toLowerCase();
  await page.keyboard.press(key);
  expect(await page.locator('#cube canvas').getAttribute('aria-label')).toMatch(/Result: (correct|wrong)\. Correct color: (White|Yellow|Green|Blue|Red|Orange)\./);
  await expect(page.locator('#case-mode')).toContainText('2/3', { timeout: 3_000 });
  await expect(page.locator('#corner-sequence .active')).toHaveText(/02/);
});

test('F2L is always color neutral with a limited camera and three drills', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#engine-badge')).toHaveText('RUST · WASM');
  await page.getByRole('link', { name: 'F2L deduction' }).click();

  await expect(page.locator('#f2l-view')).toBeVisible();
  await expect(page.locator('#f2l-view')).toHaveAttribute('data-case-source', 'wasm');
  await expect(page.locator('[data-f2l-drill]')).toHaveCount(3);
  await expect(page.locator('#f2l-cube canvas')).toHaveAttribute('data-rotation', 'limited-horizontal');
  await expect(page.locator('#f2l-cube canvas')).toHaveAttribute('data-azimuth-limit', '0.62');
  await expect(page.locator('#f2l-total')).not.toHaveText('0');

  await expect(page.locator('#f2l-view')).toHaveAttribute('data-preference', 'neutral');
  const firstBottom = await page.locator('#f2l-view').getAttribute('data-bottom-color');
  await page.getByRole('button', { name: /New cube/ }).click();
  await expect(page.locator('#f2l-view')).toHaveAttribute('data-preference', 'neutral');
  await expect(page.locator('#f2l-view')).toHaveAttribute('data-bottom-color', /^(white|yellow|green|blue|red|orange)$/);
  expect(firstBottom).toMatch(/^(white|yellow|green|blue|red|orange)$/);
  expect(errors).toEqual([]);
});

test('corner cube ignores drag gestures', async ({ page }) => {
  await page.goto('/');
  const cube = page.locator('#cube canvas');
  await expect(cube).toHaveAttribute('data-rotation', 'locked');
  const before = await cube.getAttribute('data-camera-pose');
  const box = await cube.boundingBox();
  await page.mouse.move(box.x + box.width * .35, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .5, { steps: 8 });
  await page.mouse.up();
  const after = await cube.getAttribute('data-camera-pose');
  expect(after).toBe(before);
});

test('corner cases use stable, bounded viewing angles that vary between cases', async ({ page }) => {
  await page.goto('/');
  const cube = page.locator('#cube canvas');
  const firstPose = await cube.getAttribute('data-view-pose');
  const firstCamera = await cube.getAttribute('data-camera-pose');
  expect(Math.abs(Number(await cube.getAttribute('data-view-yaw')))).toBeLessThanOrEqual(8);
  expect(Math.abs(Number(await cube.getAttribute('data-view-pitch')))).toBeLessThanOrEqual(4.5);
  await page.locator('.answer-button').first().click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'feedback');
  await expect(cube).toHaveAttribute('data-view-pose', firstPose);
  await expect(cube).toHaveAttribute('data-camera-pose', firstCamera);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1).viewPose)).toBe(firstPose);
  await expect(cube).not.toHaveAttribute('data-view-pose', firstPose, { timeout: 3_000 });
  await expect(cube).toHaveAttribute('data-rotation', 'locked');
  await expect(cube).toHaveAttribute('aria-label', /locked .* solve view/);
});

test('a vertical touch that begins on a cube scrolls the page', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 600 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/#/pll-recognition');
  const cube = page.locator('#pll-cube canvas');
  await expect(cube).toBeVisible();
  await expect(cube).toHaveCSS('touch-action', 'pan-y');
  const box = await cube.boundingBox();
  const x = box.x + box.width / 2;
  const start = box.y + box.height * .8;
  const end = start - 180;
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
  for (let index = 1; index <= 8; index += 1) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: start + (end - start) * index / 8 }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(50);
  await context.close();
});
