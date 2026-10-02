// The dev-only gallery (#/dev/gallery). Needs the dev server: the data comes from the /__gallery plugin.
import { test, expect } from 'playwright/test';

const open = page => page.locator('.lb-root.lb-open');

test('folders: lists the orbit-v3 group, opens an image and browses with the arrow keys', async ({ page }) => {
  await page.goto('/#/dev/gallery');
  const card = page.locator('[data-testid=group-card][data-group="docs/design/orbit-v3"]');
  await expect(card).toBeVisible();
  await expect(page.locator('[data-testid=group-card][data-group="docs/design/brain-v2/trainers"]')).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/#\/dev\/gallery\/docs\/design\/orbit-v3$/);
  const first = page.locator('.g-card img').first();
  await expect(first).toHaveAttribute('loading', 'lazy');
  await first.click();
  await expect(open(page)).toBeVisible();
  await expect(page.locator('.lb-count')).toHaveText(/^1 \/ \d+$/);
  await expect(page).toHaveURL(/\?img=00-flow-storyboard\.png$/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.lb-count')).toHaveText(/^2 \/ \d+$/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.lb-count')).toHaveText(/^1 \/ \d+$/);
  await page.keyboard.press('Escape');
  await expect(open(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/img=/);
});

test('a deep link with ?img= opens the lightbox on that image', async ({ page }) => {
  await page.goto('/#/dev/gallery/docs/design/orbit-v3?img=A-05-results.png');
  await expect(open(page)).toBeVisible();
  await expect(page.locator('.lb-title')).toHaveText(/A-05/);
  await expect(page.locator('.lb-img')).toHaveAttribute('src', /\/docs\/design\/orbit-v3\/A-05-results\.png$/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.lb-img')).toHaveAttribute('src', /A-05-results\.svg$/);
});

test('blog, post, timeline and compare views render from the posts', async ({ page }) => {
  await page.goto('/#/dev/gallery/blog');
  await expect(page.locator('[data-testid=post]').first()).toBeVisible();
  await expect(page.locator('[data-post=orbit-v3] .g-status-chosen')).toBeVisible();
  await page.goto('/#/dev/gallery/post/orbit-v3?img=A-10-past-solve.png');
  await expect(page.getByRole('heading', { name: /Orbit v3/ }).first()).toBeVisible();
  await expect(open(page)).toBeVisible();
  await expect(page.locator('.lb-title')).toHaveText(/A-10/);
  await page.keyboard.press('Escape');
  await page.goto('/#/dev/gallery/timeline');
  await expect(page.locator('[data-testid=timeline-node]').first()).toBeVisible();
  expect(await page.locator('[data-testid=timeline-node]').count()).toBeGreaterThan(20);
  await page.locator('[data-cmp=brain-v2-orbit]').check();
  await page.locator('[data-cmp=orbit-v3]').check();
  await page.getByTestId('compare-go').click();
  await expect(page).toHaveURL(/#\/dev\/gallery\/compare\?a=brain-v2-orbit&b=orbit-v3/);
  await expect(page.locator('.g-pane')).toHaveCount(2);
  await expect(page.locator('.g-big')).toHaveCount(2);
});

test('search and the root filter narrow the list; no horizontal scroll at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/#/dev/gallery');
  await expect(page.locator('[data-testid=group-card]').first()).toBeVisible();
  await page.getByRole('button', { name: 'agent screenshots' }).click();
  await expect(page.locator('[data-testid=group-card][data-group="docs/design/orbit-v3"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'all', exact: true }).click();
  await page.locator('[data-search]').fill('A-05 results');
  await expect(page.locator('.g-card').first()).toBeVisible();
  expect(await page.locator('.g-card').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/#/dev/gallery/timeline');
  await expect(page.locator('[data-testid=timeline-node]').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the approved widget gallery keeps select, field and right-drawer states accessible', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/dev/gallery/widgets');
  const filter = page.getByRole('combobox', { name: 'filter', exact: true });
  await filter.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(filter).toHaveAttribute('data-value', 'recent');
  await expect(page.getByRole('combobox', { name: 'disabled filter' })).toBeDisabled();

  const field = page.getByLabel('validation state');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await field.getAttribute('aria-describedby');
  await expect(page.locator(`#${describedBy.split(' ').at(-1)}`)).toHaveText('Choose a name to continue.');

  await page.getByRole('button', { name: 'open right drawer' }).click();
  const drawer = page.getByRole('dialog', { name: 'Review detail' });
  await expect(drawer).toBeVisible();
  const bounds = await drawer.boundingBox();
  await page.mouse.click(bounds.x + 8, bounds.y + bounds.height - 10);
  await expect(drawer).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(drawer).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
