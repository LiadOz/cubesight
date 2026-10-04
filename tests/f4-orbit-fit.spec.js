import { expect, test } from 'playwright/test';

test('Orbit SVG uses the fitted host dimensions in a constrained cube stage', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=results');
  const sizes = await page.evaluate(async () => {
    const host = document.querySelector('.f0-orbit');
    host.style.width = '180px'; host.style.height = '220px';
    await window.__f0Orbit.update({ ...window.__f0Orbit.options, size: 'XL' }, { animate: false });
    const svg = host.querySelector('.orbit__svg');
    const box = svg.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    return { svgWidth: box.width, svgHeight: box.height,
      hostCenterX: (hostBox.left + hostBox.right) / 2, hostCenterY: (hostBox.top + hostBox.bottom) / 2,
      svgCenterX: (box.left + box.right) / 2, svgCenterY: (box.top + box.bottom) / 2 };
  });
  expect(sizes.svgWidth).toBe(180);
  expect(sizes.svgHeight).toBe(180);
  expect(Math.abs(sizes.hostCenterX - sizes.svgCenterX)).toBeLessThan(1);
  expect(Math.abs(sizes.hostCenterY - sizes.svgCenterY)).toBeLessThan(1);
});

test('corner recognition keeps its Orbit outside the cube and all six answers reachable at 1280 × 720', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#/drills/corners');
  await expect(page.locator('#cube canvas')).toHaveAttribute('data-rotation', 'locked');
  await expect(page.locator('#corner-view .orbit__svg')).toBeVisible();
  await expect(page.locator('#answers button')).toHaveCount(6);
  const geometry = await page.evaluate(() => {
    const orbit = document.querySelector('#corner-view .orbit__svg').getBoundingClientRect();
    const cube = document.querySelector('#cube .shared-cube').getBoundingClientRect();
    const stage = document.querySelector('#corner-view .trainer-shell');
    return { orbit: orbit.width, cube: cube.width, frame: getComputedStyle(stage).borderTopWidth,
      height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth };
  });
  expect(geometry.orbit).toBeGreaterThan(geometry.cube);
  expect(geometry.frame).toBe('0px');
  expect(geometry.width).toBeLessThanOrEqual(1280);
  expect(geometry.height).toBeLessThanOrEqual(720);
  for (const answer of await page.locator('#answers button').all()) {
    await expect(answer).toBeInViewport();
    expect(await answer.evaluate(node => {
      const box = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
  }
  await expect(page.locator('[data-action="skip"]')).toBeInViewport();
});
