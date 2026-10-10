import { test, expect } from './helpers/coverage-test.js';

test('drills share keyboard settings, keep modes working and center the case', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const route of ['corners', 'pll', 'f2l', 'oll', 'lookahead', 'scout']) {
    await page.goto(`/#/drills/${route}`);
    const trigger = page.locator('.trainer-settings-trigger:visible');
    await expect(trigger).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('Tab');
    const drawer = page.getByRole('dialog', { name: 'drill settings' });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(drawer).toBeVisible();
    if (route === 'corners') {
      await drawer.getByRole('button', { name: 'three corners', exact: true }).click();
      await expect(drawer.locator('[data-mode="triple"]')).toHaveAttribute('aria-pressed', 'true');
    }
    await drawer.getByRole('button', { name: '20 cases', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    const stage = page.locator('.trainer-orbit-stage:visible, .oll-stage:visible').first();
    const box = await stage.boundingBox();
    expect(Math.abs(box.x + box.width / 2 - 640), route).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollHeight), route).toBeLessThanOrEqual(722);
  }
});
