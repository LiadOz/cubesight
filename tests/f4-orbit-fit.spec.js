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
