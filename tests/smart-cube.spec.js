import { test, expect } from 'playwright/test';

test('smart-cube picker does not hide devices behind name filters', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice(options) {
          window.smartCubePickerOptions = options;
          return Promise.reject(new DOMException('Selection cancelled', 'NotFoundError'));
        },
      },
    });
  });
  await page.goto('/#/cross-scout');
  await page.locator('#scout-smart-connect').click();
  await expect.poll(() => page.evaluate(() => window.smartCubePickerOptions?.acceptAllDevices)).toBe(true);
});

test('Cross Scout mirrors smart-cube turns and advances a selected plan', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice() {} } });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createCrossScout } = await import('/src/cross-scout.js');
    const { createSmartCubeSession } = await import('/src/smart-cube-session.js');
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    let observer;
    const connection = {
      deviceName: 'GAN test cube', protocol: { name: 'GAN Gen4' },
      capabilities: { facelets: true },
      events$: { subscribe(value) { observer = value; return { unsubscribe() { observer = null; } }; } },
      async sendCommand() { queueMicrotask(() => observer?.next({ type: 'FACELETS', facelets: solved })); },
      async disconnect() {},
    };
    const session = createSmartCubeSession(() => Promise.resolve(connection));
    window.testSmartCube = {
      emit(move) { observer?.next({ type: 'MOVE', move }); },
      emitGyro(quaternion) { observer?.next({ type: 'GYRO', quaternion }); },
    };
    const root = document.createElement('div');
    root.id = 'smart-scout-test';
    document.body.append(root);
    createCrossScout(root, session);
  });
  const scout = page.locator('#smart-scout-test');
  await scout.locator('#scout-smart-connect').click();
  await expect(scout.locator('#scout-smart-title')).toContainText('GAN test cube');
  await expect(scout.locator('#scout-smart-status')).toContainText('Solved baseline synced');
  await expect(scout.locator('#scout-scramble')).toHaveAttribute('readonly', '');
  await page.evaluate(() => {
    window.testSmartCube.emitGyro({ x: 0, y: 0, z: 0, w: 1 });
    window.testSmartCube.emitGyro({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
  });
  const canvas = scout.locator('canvas');
  await expect(canvas).toHaveAttribute('data-gyro-follow', 'on');
  await expect(scout.locator('#scout-smart-recenter')).toBeVisible();
  // GAN +Z is the white axis, so a turn around it maps to renderer +Y.
  await expect.poll(async () => Number((await canvas.getAttribute('data-gyro-target')).split(',')[1])).toBeGreaterThan(.65);
  await expect.poll(async () => Number((await canvas.getAttribute('data-gyro-pose')).split(',')[1])).toBeGreaterThan(.65);
  await scout.locator('#scout-smart-recenter').click();
  await expect.poll(async () => Number((await canvas.getAttribute('data-gyro-target')).split(',')[1])).toBeCloseTo(0, 2);
  await page.evaluate(() => ['R', 'U', 'F'].forEach(move => window.testSmartCube.emit(move)));
  await expect(scout.locator('#scout-scramble')).toHaveValue('R U F');
  await expect(scout.locator('#scout-message')).toContainText('Smart cube mirrored');

  await scout.locator('#scout-analyze').click();
  await expect(scout.locator('#scout-message')).toContainText('plans found', { timeout: 30_000 });
  await scout.locator('.scout-result').filter({ hasText: /[1-9]\d* moves/ }).first().click();
  await page.evaluate(() => {
    const move = document.querySelector('#smart-scout-test').dataset.scoutCanonicalMoves.split(' ')[0];
    window.testSmartCube.emit(move);
  });
  await expect(scout.locator('#scout-step')).toContainText('Move 1 of');
  await expect(scout.locator('#scout-message')).toContainText('matched move 1');
  await scout.locator('#scout-smart-disconnect').click();
  await expect(scout.locator('#scout-scramble')).not.toHaveAttribute('readonly');
  await expect(canvas).toHaveAttribute('data-gyro-follow', 'off');
  await expect(scout.locator('#scout-smart-recenter')).toBeHidden();
});
