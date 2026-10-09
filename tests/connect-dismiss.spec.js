import { test, expect } from './helpers/coverage-test.js';

// Closing the device chooser is the person's own choice. It must leave no
// troubleshooting text anywhere, and nothing connection-related may linger in
// the top bar or sit there twice.
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.1234) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const STALE = /No cube chosen|Turn on Bluetooth|turn the cube a few times/i;
const dismissStub = `Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => ({
  getAvailability: async () => true,
  requestDevice: async () => { throw Object.assign(new Error('User cancelled the requestDevice() chooser.'), { name: 'NotFoundError' }); },
}) });`;
const gattStub = `Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => ({
  getAvailability: async () => true,
  requestDevice: async () => ({ name: 'X', id: 'abcdefgh12345', addEventListener() {}, removeEventListener() {},
    gatt: { connected: false, disconnect() {}, getPrimaryServices: async () => [],
      connect: async () => { throw Object.assign(new Error('Connection attempt failed.'), { name: 'NetworkError' }); } } }),
}) });`;

// Desktop Chrome at 1440x900 is the primary case (the header shows its status
// line there); the phone profile is secondary (the header line is hidden).
async function open(browser, stub, phone = false) {
  const context = await browser.newContext(phone
    ? { userAgent: ANDROID, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
    : { userAgent: DESKTOP, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(source => { localStorage.clear(); new Function(source)(); }, stub);
  await page.goto('/#/');
  return { context, page };
}
const connect = async page => { await page.locator('.ui-cube-chip').click(); await page.locator('[data-cube-action="connect"]').click(); };

test('dismissing the chooser shows no troubleshooting text, top or bottom, even after a wait', async ({ browser }) => {
  const { context, page } = await open(browser, dismissStub);
  await connect(page);
  await expect(page.locator('html')).toHaveAttribute('data-cube-phase', 'disconnected');
  await page.waitForTimeout(500);
  await expect(page.locator('.ui-toast-slot')).not.toContainText(STALE);
  await expect(page.locator('.ui-header-status')).not.toContainText(STALE);
  await page.goto('/#/solve');
  await expect(page.locator('body')).not.toContainText(STALE);
  await context.close();
});

test('a real failure is said once, in the toast only, and the top bar stays clear', async ({ browser }) => {
  const { context, page } = await open(browser, gattStub);
  await connect(page);
  await expect(page.locator('.ui-toast-slot')).toContainText('Found the cube but could not connect');
  await expect(page.locator('.ui-header-status')).toHaveText('');
  await context.close();
});

test('the toast for a failed connection goes away when the person leaves the page or tries again', async ({ browser }) => {
  const { context, page } = await open(browser, gattStub);
  await connect(page);
  await expect(page.locator('.ui-toast-slot')).toContainText('Found the cube but could not connect');
  await page.goto('/#/drills');
  await expect(page.locator('.ui-toast-slot')).not.toContainText('Found the cube');
  await expect(page.locator('.ui-header-status')).toHaveText('');
  await context.close();
});

test('a header note clears after a while and when the page changes', async ({ browser }) => {
  const { context, page } = await open(browser, dismissStub);
  await page.evaluate(() => document.querySelector('.ui-header-status').textContent = 'stale');
  await page.goto('/#/drills');
  await expect(page.locator('.ui-header-status')).toHaveText('');
  await context.close();
});

test('phone: dismissing the chooser shows nothing, and a real failure is a single toast', async ({ browser }) => {
  let { context, page } = await open(browser, dismissStub, true);
  await connect(page);
  await expect(page.locator('html')).toHaveAttribute('data-cube-phase', 'disconnected');
  await page.waitForTimeout(400);
  await expect(page.locator('body')).not.toContainText(STALE);
  await context.close();
  ({ context, page } = await open(browser, gattStub, true));
  await connect(page);
  await expect(page.locator('.ui-toast-slot')).toContainText('Found the cube but could not connect');
  await expect(page.locator('.ui-toast-slot .toast')).toHaveCount(1);
  await context.close();
});
