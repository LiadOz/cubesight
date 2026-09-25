import { test, expect } from 'playwright/test';

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
});
