import { expect, test } from 'playwright/test';

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`Cross Scout keeps its cube centred and settings reachable at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/#/drills/scout?mode=explore');
    await expect(page.locator('#scout-cube canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot.getViewModel()?.viewModel.drill)).toBe('cross-scout');
    const geometry = await page.evaluate(() => {
      const orbit = document.querySelector('#scout-view .orbit__svg').getBoundingClientRect();
      const cube = document.querySelector('#scout-cube .shared-cube').getBoundingClientRect();
      return { orbit: orbit.toJSON(), cube: cube.toJSON(), height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth };
    });
    expect(geometry.width).toBeLessThanOrEqual(viewport.width);
    expect(geometry.height).toBeLessThanOrEqual(viewport.height);
    expect(geometry.orbit.width).toBeGreaterThan(geometry.cube.width);
    expect(geometry.orbit.x + geometry.orbit.width / 2).toBeCloseTo(geometry.cube.x + geometry.cube.width / 2, 0);
    expect(geometry.orbit.y + geometry.orbit.height / 2).toBeCloseTo(geometry.cube.y + geometry.cube.height / 2, 0);
    await expect(page.locator('.scout-input-settings > summary')).toBeInViewport();
    await page.screenshot({ path: `test-results/scout-centred-${viewport.width}.png` });
  });
}

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

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
test(`corner recognition keeps its Orbit outside the cube and all six answers reachable at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
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
  expect(geometry.width).toBeLessThanOrEqual(viewport.width);
  expect(geometry.height).toBeLessThanOrEqual(viewport.height);
  for (const answer of await page.locator('#answers button').all()) {
    await expect(answer).toBeInViewport();
    expect(await answer.evaluate(node => {
      const box = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
  }
  await expect(page.locator('[data-action="skip"]')).toBeInViewport();
  await expect(page.locator('#corner-view .trainer-progress-details > summary')).toBeInViewport();
});
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`PLL keeps its locked cube centred in a square Orbit at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/#/drills/pll');
    await expect(page.locator('#pll-cube canvas')).toHaveAttribute('data-rotation', 'locked');
    await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot.getViewModel()?.viewModel.drill)).toBe('pll');
    const geometry = await page.evaluate(() => {
      const orbit = document.querySelector('#pll-view .orbit__svg').getBoundingClientRect();
      const cube = document.querySelector('#pll-cube .shared-cube').getBoundingClientRect();
      return { orbit: orbit.toJSON(), cube: cube.toJSON(), frame: getComputedStyle(document.querySelector('.pll-trainer-shell')).borderTopWidth,
        height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth };
    });
    expect(geometry.orbit.width).toBeCloseTo(geometry.orbit.height, 0);
    expect(geometry.orbit.width).toBeGreaterThan(geometry.cube.width);
    expect(geometry.orbit.x + geometry.orbit.width / 2).toBeCloseTo(geometry.cube.x + geometry.cube.width / 2, 0);
    expect(geometry.orbit.y + geometry.orbit.height / 2).toBeCloseTo(geometry.cube.y + geometry.cube.height / 2, 0);
    expect(geometry.frame).toBe('0px');
    expect(geometry.width).toBeLessThanOrEqual(viewport.width);
    expect(geometry.height).toBeLessThanOrEqual(viewport.height);
    for (const answer of await page.locator('[data-pll-answer]').all()) {
      await expect(answer).toBeInViewport();
      expect(await answer.evaluate(node => { const box = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); })).toBe(true);
    }
  });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`F2L remains fitted after the solve styles load at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/#/drills/f2l');
    await expect(page.locator('#f2l-cube canvas')).toBeVisible();
    await page.evaluate(async () => { const { loadStyle } = await import('/src/brain/index.js'); await loadStyle('orbit'); await document.fonts.ready; });
    const geometry = await page.evaluate(() => {
      const orbit = document.querySelector('#f2l-view .orbit__svg').getBoundingClientRect();
      const cube = document.querySelector('#f2l-cube .shared-cube').getBoundingClientRect();
      return { orbit: orbit.toJSON(), cube: cube.toJSON(), height: document.documentElement.scrollHeight };
    });
    expect(geometry.height).toBeLessThanOrEqual(viewport.height);
    expect(geometry.orbit.width).toBeCloseTo(geometry.orbit.height, 0);
    expect(geometry.orbit.width).toBeGreaterThan(geometry.cube.width);
    expect(geometry.orbit.x + geometry.orbit.width / 2).toBeCloseTo(geometry.cube.x + geometry.cube.width / 2, 0);
    expect(geometry.orbit.y + geometry.orbit.height / 2).toBeCloseTo(geometry.cube.y + geometry.cube.height / 2, 0);
    await expect(page.locator('#f2l-continue')).toBeInViewport();
    await expect(page.locator('#f2l-view .trainer-progress-details > summary')).toBeInViewport();
  });
}
