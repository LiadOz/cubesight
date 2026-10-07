import { test, expect } from 'playwright/test';
import { inspectLayout } from './invariants.js';

const cell = { width: 1280, height: 720, routeFamily: 'drills', expectedView: '#corner-view', expectedCanvasCount: 1, theme: 'dark' };

async function openTrainer(page) {
  await page.addInitScript(() => localStorage.setItem('cubesight-theme', 'dark'));
  await page.goto('/#/drills/corners');
  await expect(page.locator('#corner-view canvas')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

test('cube collision checks distinguish the rendered puzzle from empty canvas framing', async ({ page }) => {
  await openTrainer(page);
  await page.evaluate(() => {
    const canvas = document.querySelector('#corner-view canvas');
    const rect = canvas.getBoundingClientRect();
    const bounds = canvas.getRenderedCubeBounds();
    for (const [id, x, y] of [
      ['label-on-puzzle', (bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2],
      ['label-in-framing', rect.left + 2, rect.top + 2],
    ]) {
      const label = document.createElement('div'); label.id = id; label.className = 'orbit__label'; label.textContent = 'test';
      label.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:14px;height:14px;z-index:100`;
      document.body.append(label);
    }
  });
  const report = await inspectLayout(page, cell);
  const collisions = report.errors.filter(error => error.kind === 'orbit-label-key-overlap');
  expect(collisions.some(error => error.selector === '#label-on-puzzle' && error.detail.includes('cube'))).toBe(true);
  expect(collisions.some(error => error.selector === '#label-in-framing' && error.detail.includes('cube'))).toBe(false);
});

test('touch checks skip closed disclosure contents and check them when opened', async ({ page }) => {
  await openTrainer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const details = document.createElement('details'); details.id = 'disclosure-probe';
    details.innerHTML = '<summary style="min-width:44px;min-height:44px">Probe</summary><button id="small-control" style="width:8px;height:8px;min-width:0;min-height:0;padding:0">x</button>';
    document.body.append(details);
  });
  const phone = { ...cell, width: 390, height: 844 };
  let report = await inspectLayout(page, phone);
  expect(report.errors.some(error => error.kind === 'small-touch-target' && error.selector === '#small-control')).toBe(false);
  await page.locator('#disclosure-probe').evaluate(node => { node.open = true; });
  report = await inspectLayout(page, phone);
  expect(report.errors.some(error => error.kind === 'small-touch-target' && error.selector === '#small-control')).toBe(true);
});

test('clipped-text flags text that is actually clipped and not text whose overflow is visible', async ({ page }) => {
  await openTrainer(page);
  await page.evaluate(() => {
    // Overflow stays visible: an absolutely placed child past the box is not clipped text (the replay total, "/ 14.07").
    const visible = document.createElement('p'); visible.id = 'visible-overflow'; visible.textContent = 'ok';
    visible.style.cssText = 'position:fixed;left:20px;top:200px;width:60px;margin:0';
    const small = document.createElement('small'); small.textContent = '/ 14.07'; small.style.cssText = 'position:absolute;left:100%;white-space:nowrap';
    visible.append(small);
    // Overflow hidden with no ellipsis label: genuinely clipped.
    const clipped = document.createElement('p'); clipped.id = 'really-clipped'; clipped.textContent = 'a long run of text that cannot fit';
    clipped.style.cssText = 'position:fixed;left:20px;top:260px;width:60px;margin:0;overflow:hidden;white-space:nowrap';
    document.body.append(visible, clipped);
  });
  const errors = (await inspectLayout(page, cell)).errors.filter(error => error.kind === 'clipped-text');
  expect(errors.some(error => error.selector === '#really-clipped')).toBe(true);
  expect(errors.some(error => error.selector === '#visible-overflow')).toBe(false);
});
