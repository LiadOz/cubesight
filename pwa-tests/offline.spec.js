import { test, expect } from 'playwright/test';

test('installs its full app shell and trainers for offline use', async ({ page, context }) => {
  const requestedOrigins = new Set();
  const pageErrors = [];
  page.on('request', (request) => requestedOrigins.add(new URL(request.url()).origin));
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#engine-badge')).toHaveText('RUST · WASM');

  const manifest = await page.evaluate(async () => {
    const manifestURL = document.querySelector('link[rel="manifest"]')?.href;
    if (!manifestURL) throw new Error('Web app manifest link is missing');
    return fetch(manifestURL).then((response) => response.json());
  });
  expect(manifest).toMatchObject({
    name: 'CubeSight — Recognition Training',
    short_name: 'CubeSight',
    display: 'standalone',
    start_url: '/',
  });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192' }),
    expect.objectContaining({ sizes: '512x512' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
  ]));
  const workerScript = await page.evaluate(() => fetch('/sw.js').then((response) => response.text()));
  expect(workerScript).toMatch(/["']use strict["'];self\.skipWaiting\(\),\w+\.clientsClaim\(\)/);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service worker did not take control')), 10_000);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  });
  expect([...requestedOrigins]).toEqual(['http://127.0.0.1:4175']);

  const devtools = await context.newCDPSession(page);
  const manifestReport = await devtools.send('Page.getAppManifest');
  expect(manifestReport.errors).toEqual([]);
  const installability = await devtools.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors).toEqual([]);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#engine-badge')).toHaveText('RUST · WASM');

  await page.getByRole('link', { name: 'F2L deduction', exact: true }).click();
  await expect(page.locator('#f2l-view')).toHaveAttribute('data-case-source', 'wasm');
  await page.getByRole('link', { name: 'PLL recognition', exact: true }).click();
  await expect(page.locator('#pll-view')).toBeVisible();
  await expect(page.locator('#pll-cube canvas')).toBeVisible();
  await expect(page.locator('[data-pll-answer]')).toHaveCount(2);
  await expect(page.locator('.pll-trainer-shell')).toHaveCSS('display', 'flex');
  const pllCase = await page.locator('#pll-view').getAttribute('data-pll-case');
  await page.locator(`[data-pll-answer="${pllCase}"]`).tap();
  await expect(page.locator('#pll-feedback')).toContainText('Correct');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('link', { name: 'Cross Scout', exact: true }).click();
  await expect(page.locator('#scout-highlight')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
