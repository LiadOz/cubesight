import { test, expect } from 'playwright/test';

test('help drawer keeps inside clicks, closes with Escape, and resumes the exact trainer route', async ({ page }) => {
  await page.goto('/#/drills/corners?mode=trace');
  const helpButton = page.getByRole('button', { name: 'help' });
  await helpButton.click();
  const drawer = page.locator('.ui-cube-menu__drawer:has(.help-page)');
  await expect(drawer).toBeVisible();
  const bounds = await drawer.boundingBox();
  await page.mouse.click(bounds.x + bounds.width - 3, bounds.y + bounds.height / 2);
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/drills\/corners\?mode=trace$/);
  await expect(drawer).toBeHidden();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect(helpButton).toBeFocused();
});

test('gallery blog and timeline links are rendered only on development builds', async ({ page }) => {
  await page.goto('/#/help');
  await expect(page.getByRole('link', { name: 'gallery blog' })).toHaveAttribute('href', '#/dev/gallery/blog');
  await expect(page.getByRole('link', { name: 'gallery timeline' })).toHaveAttribute('href', '#/dev/gallery/timeline');
  await page.getByRole('link', { name: 'gallery blog' }).click();
  await expect(page).toHaveURL(/#\/dev\/gallery\/blog$/);
  await expect(page.locator('.ui-cube-menu__drawer:has(.help-page)')).toBeHidden();
});
