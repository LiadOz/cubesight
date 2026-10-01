import { test, expect } from 'playwright/test';

async function mountTrackedCube(page) {
  await page.goto('/#/drills/corners');
  await page.evaluate(async () => {
    const { createSmartCubeStudio } = await import('/src/smart-cube-studio.js');
    const { createSolvedState, applyMoves } = await import('/src/cross-cube.js');
    const solved = createSolvedState();
    let snapshot = { phase: 'tracking', detail: 'Solved baseline synced.', deviceName: 'Test GAN', protocol: 'GAN Gen4', gyro: null,
      state: solved, moves: [], lastMove: null };
    let stateListener;
    let eventListener;
    const session = {
      getSnapshot: () => snapshot,
      subscribe(fn) { stateListener = fn; fn(snapshot); return () => {}; },
      subscribeEvents(fn) { eventListener = fn; return () => {}; },
      connect() {}, syncSolved() {}, disconnect() {},
    };
    const root = document.createElement('div');
    root.id = 'studio-test';
    document.body.append(root);
    const studio = createSmartCubeStudio(root, session);
    studio.setActive(true);
    window.studioHarness = {
      raw(event) { eventListener({ receivedAt: Date.now(), cubeTimestamp: null, localTimestamp: null, ...event }); },
      move(move) {
        const next = applyMoves(snapshot.state, move);
        eventListener({ type: 'MOVE', move, receivedAt: Date.now(), cubeTimestamp: 1200, localTimestamp: 1300 });
        snapshot = { ...snapshot, state: next, moves: [...snapshot.moves, move], lastMove: move };
        stateListener(snapshot);
      },
      gyro() {
        const quaternion = { x: 0, y: 0, z: 0, w: 1 };
        eventListener({ type: 'GYRO', receivedAt: Date.now(), quaternion });
        snapshot = { ...snapshot, gyro: quaternion };
        stateListener(snapshot);
      },
    };
  });
}

test('opens as a connection-first diagnostic, not a simulated player', async ({ page }) => {
  await page.goto('/#/dev/studio');
  await expect(page.getByRole('tab', { name: 'Inspect tracking' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#studio-cube canvas')).toBeVisible();
  await expect(page.locator('#studio-start')).toBeDisabled();
  await expect(page.locator('#studio-cube canvas')).not.toHaveAttribute('data-hint-move', /.+/);
  await expect(page.locator('#studio-wide-status')).toHaveText('Not reported separately');
  await expect(page.locator('#studio-slice-status')).toHaveText('Not reported separately');
});

test('reports raw turns and gyro without interrupting live animation', async ({ page }) => {
  await mountTrackedCube(page);
  const result = await page.evaluate(() => {
    window.studioHarness.move('R');
    const canvas = document.querySelector('#studio-test canvas');
    const duringMove = canvas.dataset.turningFace;
    window.studioHarness.gyro();
    return { duringMove, afterGyro: canvas.dataset.turningFace };
  });
  expect(result).toEqual({ duringMove: 'R', afterGyro: 'R' });
  await expect(page.locator('#studio-reported-move')).toHaveText('R');
  await expect(page.locator('#studio-gyro-count')).toHaveText('1');
  await expect(page.locator('#studio-event-log')).toContainText('MOVE  R · serial —');
  await page.evaluate(() => window.studioHarness.raw({ type: 'MOVE', move: 'M' }));
  await expect(page.locator('#studio-slice-status')).toContainText('Raw label seen');
  await expect(page.locator('#studio-event-log')).toContainText('MOVE  M');
});

test('scramble rehearsal advances only on device state and explains a mistake', async ({ page }) => {
  await mountTrackedCube(page);
  await page.locator('#studio-test #studio-scramble-tab').click();
  await page.locator('#studio-test #studio-scramble-input').fill('R U');
  await page.locator('#studio-test #studio-start').click();
  await expect(page.locator('#studio-test #studio-scramble-status')).toContainText('Matched 0 of 2');
  await expect(page.locator('#studio-test canvas')).toHaveAttribute('data-hint-move', 'R');
  await page.evaluate(() => window.studioHarness.move('R'));
  await expect(page.locator('#studio-test #studio-scramble-status')).toContainText('Matched 1 of 2');
  await expect(page.locator('#studio-test canvas')).toHaveAttribute('data-hint-move', 'U');
  await page.evaluate(() => window.studioHarness.move('F'));
  await expect(page.locator('#studio-test #studio-scramble-status')).toContainText("Return with F′");
  await expect(page.locator('#studio-test canvas')).toHaveAttribute('data-hint-move', "F'");
  await page.evaluate(() => window.studioHarness.move("F'"));
  await expect(page.locator('#studio-test #studio-scramble-status')).toContainText('Matched 1 of 2');
  await page.evaluate(() => window.studioHarness.move('U'));
  await expect(page.locator('#studio-test #studio-scramble-status')).toContainText('Scramble complete');
  await expect(page.locator('#studio-test canvas')).not.toHaveAttribute('data-hint-move', /.+/);
});

test('debug controls fit a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/dev/studio');
  await expect(page.locator('#studio-cube canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Scramble rehearsal' }).click();
  await expect(page.locator('#studio-scramble')).toBeVisible();
});
