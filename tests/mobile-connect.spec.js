import { test, expect } from './helpers/coverage-test.js';

// A phone cannot be driven through real Web Bluetooth, so these tests put a stub
// navigator.bluetooth under the REAL connect path (header drawer -> session ->
// recorder seam -> connectBluetooth -> the library) at a phone viewport. They pin
// that every way of falling out of `connecting` ends in a visible, specific
// message, and that the saved recording tells the whole story without
// identifying the person or the cube.
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.1234) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function openAndConnect(page, stub) {
  await page.addInitScript(source => { localStorage.clear(); new Function(source)(); }, stub);
  await page.goto('/#/');
  await page.locator('.ui-cube-chip').click();
  await page.locator('[data-cube-action="connect"]').click();
}
const recording = page => page.evaluate(async () => JSON.parse((await import('/src/recorder.js')).serializeRecording()));

test('iPhone: no Web Bluetooth at all gives a clear toast, never a silent stall', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openAndConnect(page, `Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => undefined });`);
  const toast = page.locator('.ui-toast-slot');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('iPhone and iPad browsers cannot connect to a Bluetooth cube');
  await expect(page.locator('html')).toHaveAttribute('data-cube-phase', 'disconnected');
  const rec = await recording(page);
  expect(rec.env.bluetooth).toMatchObject({ bluetooth: false, platform: 'ios', secure: true });
  expect(rec.env.userAgent).not.toContain('17_5');
  expect(rec.events.some(event => event.kind === 'connect-error')).toBe(true);
  await context.close();
});

test('Android: a dismissed chooser says what to check and the recording keeps the error', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: ANDROID, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openAndConnect(page, `Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => ({
    getAvailability: async () => true,
    requestDevice: async () => { throw Object.assign(new Error('User cancelled the requestDevice() chooser.'), { name: 'NotFoundError' }); },
  }) });`);
  await expect(page.locator('.ui-toast-slot')).toContainText('Turn on Bluetooth and Location');
  await expect(page.locator('html')).toHaveAttribute('data-cube-phase', 'disconnected');
  const diag = (await recording(page)).events.filter(event => event.kind === 'diag').map(event => event.data.label);
  expect(diag.some(label => /Connection failed at picker: NotFoundError: User cancelled/.test(label))).toBe(true);
  await context.close();
});

test('Android: GATT failing after the cube is picked reports the step and identifies nothing', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: ANDROID, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openAndConnect(page, `Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => ({
    getAvailability: async () => true,
    requestDevice: async () => ({ name: 'GANi3-SECRET-NAME', id: 'SECRETDEVICEID123456',
      addEventListener() {}, removeEventListener() {},
      gatt: { connected: false, disconnect() {}, getPrimaryServices: async () => [],
        connect: async () => { throw Object.assign(new Error('Connection attempt failed.'), { name: 'NetworkError' }); } } }),
  }) });`);
  await expect(page.locator('.ui-toast-slot')).toContainText('Found the cube but could not connect');
  const rec = await recording(page);
  const text = JSON.stringify(rec);
  expect(text).not.toContain('SECRET-NAME');
  expect(text).not.toContain('SECRETDEVICEID');
  const diag = rec.events.filter(event => event.kind === 'diag').map(event => event.data.label);
  expect(diag.some(label => /Connection failed at gatt: NetworkError: Connection attempt failed/.test(label))).toBe(true);
  await context.close();
});

test('Android: a cube that never answers does not leave the app stuck in connecting', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: ANDROID, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openAndConnect(page, `window.__cubesightStallMs = 600; Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => ({
    getAvailability: async () => true,
    requestDevice: async () => ({ name: 'GANi3-X', id: 'abcdefgh12345', addEventListener() {}, removeEventListener() {},
      gatt: { connected: false, disconnect() {}, getPrimaryServices: async () => [], connect: () => new Promise(() => {}) } }),
  }) });`);
  await expect(page.locator('.ui-toast-slot')).toContainText('The cube did not answer');
  await expect(page.locator('html')).toHaveAttribute('data-cube-phase', 'disconnected');
  await context.close();
});
