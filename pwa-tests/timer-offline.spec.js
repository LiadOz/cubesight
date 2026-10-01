import { test, expect } from 'playwright/test';

test('manual timer route and history work offline after install', async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ inspection: { mode: 'off' } }));
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service worker did not take control')), 10_000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
  });

  await context.setOffline(true);
  await page.goto('/#/timer');
  const timer = page.locator('.tm');
  await expect(timer).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('.tm-scramble')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.tm-preview canvas')).toHaveCount(1, { timeout: 30_000 });
  const preview = page.locator('.tm-preview-tools');
  await expect(preview.locator('[data-sequence-speed]')).toBeVisible();
  await expect(page.locator('.tm-preview')).toHaveAttribute('data-index', /\d+/);
  await preview.locator('[data-sequence="play"]').click();
  await expect(preview).toHaveAttribute('data-sequence-playing', 'true');
  await page.waitForTimeout(400);
  await preview.locator('[data-sequence="play"]').click();
  await expect(preview).toHaveAttribute('data-sequence-playing', 'false');
  await expect(timer).toHaveAttribute('data-phase', 'idle');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(' ');
  await page.waitForTimeout(350);
  await page.keyboard.up(' ');
  await expect(timer).toHaveAttribute('data-phase', 'running');
  await page.waitForTimeout(350);
  await page.keyboard.press('x');
  await expect(timer).toHaveAttribute('data-phase', 'done');
  await expect(page.locator('.tm-preview canvas')).toHaveCount(1);
  await expect(page.getByTestId('stats')).toContainText('1 solve');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.tm')).toBeVisible();
  await expect(page.getByTestId('stats')).toContainText('1 solve');
  expect(errors).toEqual([]);
});
