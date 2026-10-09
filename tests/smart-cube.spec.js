import { test, expect } from './helpers/coverage-test.js';

test('Cross Scout explains how to find a GAN MAC in Chrome', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText(value) { window.copiedMacHelpAddress = value; return Promise.resolve(); } } });
  });
  await page.goto('/#/drills/scout?mode=explore');
  await page.locator('.scout-input-settings > summary').click();
  await page.locator('#scout-mac-help summary').click();
  await expect(page.locator('#scout-mac-help')).toContainText('chrome://bluetooth-internals/#devices');
  await expect(page.locator('#scout-mac-help')).toContainText('start scan');
  await expect(page.locator('#scout-mac-help')).toContainText('address');
  await page.locator('#scout-mac-copy').click();
  await expect.poll(() => page.evaluate(() => window.copiedMacHelpAddress)).toBe('chrome://bluetooth-internals/#devices');
  await expect(page.locator('#scout-mac-copy-status')).toContainText('Copied');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

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
  await page.goto('/#/drills/scout?mode=explore');
  await page.locator('.scout-input-settings > summary').click();
  await page.locator('#scout-smart-connect').click();
  await expect.poll(() => page.evaluate(() => window.smartCubePickerOptions?.acceptAllDevices)).toBe(true);
});

test('scramble turn guide names the next face and direction', async ({ page }) => {
  await page.goto('/#/drills/scout?mode=explore');
  const scramble = page.locator('#scout-scramble');
  await scramble.fill("R U' F2");
  await expect(page.locator('#scout-turn-guide')).toContainText('scramble move 1 of 3');
  await expect(page.locator('#scout-turn-guide')).toContainText('right face (orange center) clockwise');
  await page.locator('#scout-turn-guide .smart-turn-next').click();
  await expect(page.locator('#scout-turn-guide')).toContainText('top face (yellow center) counterclockwise');
  await page.locator('#scout-turn-guide .smart-turn-next').click();
  await expect(page.locator('#scout-turn-guide')).toContainText('front face (green center) 180°');
});

test('Cross Scout mirrors smart-cube turns and advances a selected plan', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice() {} } });
  });
  await page.goto('/#/drills/corners');
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
  await scout.locator('.scout-input-settings > summary').click();
  await scout.locator('#scout-smart-connect').click();
  await expect(scout.locator('#scout-smart-title')).toContainText('GAN test cube');
  await expect(scout.locator('#scout-smart-status')).toContainText('Cube synced');
  await expect(scout.locator('#scout-scramble')).toHaveAttribute('readonly', '');
  await page.evaluate(() => {
    window.testSmartCube.emitGyro({ x: 0, y: 0, z: 0, w: 1 });
    window.testSmartCube.emitGyro({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
  });
  await expect(scout.locator('#scout-smart-recenter')).toBeVisible();
  await page.evaluate(() => window.testSmartCube.emit('R'));
  await scout.locator('#scout-reset-view').click();
  await page.evaluate(() => window.testSmartCube.emitGyro({ x: 0, y: 0, z: 1, w: 0 }));
  await scout.locator('#scout-smart-recenter').click();
  await page.evaluate(() => ['U', 'F'].forEach(move => window.testSmartCube.emit(move)));
  await expect(scout.locator('#scout-scramble')).toHaveValue('R U F');
  await expect(scout.locator('#scout-message')).toContainText('Cube mirrored');

  await scout.locator('#scout-analyze').click();
  await expect(scout.locator('#scout-message')).toContainText('plans found', { timeout: 30_000 });
  await scout.locator('.scout-result').filter({ hasText: /[1-9]\d* moves/ }).first().click();
  await expect(scout.locator('#scout-turn-guide')).toContainText('plan move 1 of');
  const detour = await page.evaluate(async () => {
    const { applyMoves, stateFromScramble, sameCubeState, movesForInspection } = await import('/src/cross-cube.js');
    const root = document.querySelector('#smart-scout-test');
    const plan = root.dataset.scoutCanonicalMoves.split(' ');
    const states = [stateFromScramble('R U F')];
    for (const move of plan) states.push(applyMoves(states.at(-1), [move]));
    const wrong = ['U', 'D', 'R', 'L', 'F', 'B', 'U2', 'D2'].find(move => !states.some(state => sameCubeState(state, applyMoves(states[0], [move]))));
    const undo = wrong.endsWith('2') ? wrong : `${wrong}'`;
    const shownUndo = movesForInspection([undo], 'D', 'F')[0];
    window.testSmartCube.emit(wrong);
    return { undo, shownUndo };
  });
  await expect(scout.locator('#scout-step')).toContainText('Off plan');
  await expect(scout.locator('#scout-turn-guide')).toContainText('back on plan');
  await expect(scout.locator('.scout-result[aria-pressed="true"]')).toHaveCount(1);
  await expect(scout.locator('#scout-analyze')).toHaveText('find plans for this cube');
  await page.evaluate(move => window.testSmartCube.emit(move), detour.undo);
  await expect(scout.locator('#scout-turn-guide')).toContainText('plan move 1 of');
  await expect(scout.locator('#scout-analyze')).toHaveText('find plans');
  await page.evaluate(() => {
    const move = document.querySelector('#smart-scout-test').dataset.scoutCanonicalMoves.split(' ')[0];
    window.testSmartCube.emit(move);
  });
  await expect(scout.locator('#scout-step')).toContainText('Move 1 of');
  await expect(scout.locator('#scout-turn-guide')).toContainText(/plan move 2 of|plan complete/);
  await expect(scout.locator('#scout-message')).toContainText('matched move 1');
  await scout.locator('#scout-smart-disconnect').click();
  await expect(scout.locator('#scout-scramble')).not.toHaveAttribute('readonly');
  await expect(scout.locator('#scout-smart-recenter')).toBeHidden();
});
