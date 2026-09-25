import { test, expect } from 'playwright/test';
import { readFileSync } from 'node:fs';
import { initSync, f2l_case } from '../src/wasm/cubesight_core.js';
import { createF2LCaseFromWasm, createPseudoScanCase } from '../src/f2l-logic.js';

initSync({ module: readFileSync(new URL('../src/wasm/cubesight_core_bg.wasm', import.meta.url)) });
let fixture;
let pseudoFixture;
const colorFaces = { white: 'U', yellow: 'D', green: 'F', blue: 'B', red: 'R', orange: 'L' };
const colors = Object.keys(colorFaces);
for (let seed = 1; seed < 200; seed++) {
  const bottom = colors[seed % colors.length];
  const current = createF2LCaseFromWasm(JSON.parse(f2l_case(BigInt(seed), colorFaces[bottom])), seed, 'neutral');
  const pairs = current.targetPairIds.map((id) => Object.keys(current.pairByPiece).filter((piece) => current.pairByPiece[piece].pairId === id));
  const visible = pairs.filter((members) => members.every((piece) => piece.includes('U') || piece.includes('F')));
  if (visible.length >= 2) { fixture = { seed, current, pairs: visible }; break; }
}
for (let seed = 1; seed < 200; seed++) {
  const bottom = colors[seed % colors.length];
  const current = createF2LCaseFromWasm(JSON.parse(f2l_case(BigInt(seed), colorFaces[bottom])), seed, 'neutral');
  const pseudo = createPseudoScanCase(current, 1 + seed % 3);
  const visible = Object.entries(pseudo.pairOptions).filter(([, pair]) => [pair.cornerPiece, pair.edgePiece].every((piece) => piece.includes('U') || piece.includes('F')));
  if (visible.length >= 2) { pseudoFixture = { seed, current: pseudo, pairs: visible }; break; }
}

async function prepareF2L(page, selectedFixture = fixture) {
  await page.addInitScript(({ seed }) => {
    crypto.getRandomValues = (array) => { array.fill(seed); return array; };
  }, selectedFixture);
  await page.goto('/');
  await expect(page.locator('#engine-badge')).toHaveText('RUST · WASM');
  await page.getByRole('link', { name: 'F2L deduction' }).click();
  await expect(page.locator('#f2l-cube canvas')).toBeVisible();
}

async function clickPiece(page, piece) {
  const point = await page.evaluate(async (piece) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const canvas = document.querySelector('#f2l-cube canvas');
    const rect = canvas.getBoundingClientRect();
    const camera = new THREE.PerspectiveCamera(28, rect.width / rect.height, .1, 100);
    camera.position.fromArray(canvas.dataset.cameraPose.split(',').map(Number));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const point = new THREE.Vector3(piece.includes('R') ? 1 : piece.includes('L') ? -1 : 0,
      piece.includes('U') ? 1 : piece.includes('D') ? -1 : 0,
      piece.includes('F') ? 1 : piece.includes('B') ? -1 : 0);
    if (piece.includes('U')) point.y += .52;
    else point.z += .52;
    point.project(camera);
    return { x: rect.x + (point.x + 1) * rect.width / 2, y: rect.y + (1 - point.y) * rect.height / 2 };
  }, piece);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

test('glance shows the cube first, covers it, and times from reveal', async ({ page }) => {
  await page.goto('/');
  await page.locator('#exposure-select').selectOption('1500');
  await page.locator('#glance-toggle').check();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await expect(page.locator('#cube canvas')).toBeVisible();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'covered', { timeout: 3000 });
  await expect(page.locator('#cube canvas')).toBeHidden();
  expect(parseFloat(await page.locator('#timer').textContent())).toBeGreaterThanOrEqual(1.45);
  await page.locator('[data-action="skip"]').click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'feedback');
  await expect(page.locator('#cube canvas')).toBeVisible();
});

test('switching trainers during feedback cancels the old corner transition', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="skip"]').click();
  await page.getByRole('link', { name: 'F2L deduction' }).click();
  const timer = await page.locator('#timer').textContent();
  await page.waitForTimeout(1300);
  expect(await page.locator('#timer').textContent()).toBe(timer);
  await page.getByRole('link', { name: 'Corner recognition', exact: true }).click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
});

test('F2L matches visible pieces without duplicate scoring during feedback', async ({ page }) => {
  await prepareF2L(page);
  const [a, b] = fixture.pairs[0];
  await clickPiece(page, a);
  await expect(page.locator('#f2l-selection')).toContainText(a);
  await clickPiece(page, b);
  await expect(page.locator('#f2l-found')).toHaveText('1');
  await clickPiece(page, b);
  await expect(page.locator('#f2l-found')).toHaveText('1');
  await expect(page.locator('#f2l-status')).toContainText('Find another');
  for (const piece of fixture.pairs[1]) await clickPiece(page, piece);
  await expect(page.locator('#f2l-found')).toHaveText('2');
});

test('F2L mistakes persist for inspection and continue explicitly', async ({ page }) => {
  await prepareF2L(page);
  const corner = fixture.pairs[0].find((piece) => piece.length === 3);
  const wrongEdge = fixture.pairs[1].find((piece) => piece.length === 2);
  await clickPiece(page, corner);
  await clickPiece(page, wrongEdge);
  await expect(page.locator('#f2l-status')).toContainText('Those do not match');
  const caseNumber = await page.locator('#f2l-case-number').textContent();
  await page.waitForTimeout(1700);
  await expect(page.locator('#f2l-case-number')).toHaveText(caseNumber);
  await page.getByRole('button', { name: 'Continue to the next F2L case' }).click();
  await expect(page.locator('#f2l-case-number')).not.toHaveText(caseNumber);
});

test('F2L allows completing a partially selected pair after ten seconds', async ({ page }) => {
  await page.clock.install();
  await prepareF2L(page);
  const before = await page.evaluate(() => JSON.stringify(localStorage));
  await clickPiece(page, fixture.pairs[0][0]);
  await expect(page.locator('#f2l-selection')).toContainText(fixture.pairs[0][0]);
  await page.clock.fastForward(10_001);
  await expect(page.locator('#pause-overlay')).toBeHidden();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(before);
  await clickPiece(page, fixture.pairs[0][1]);
  await expect(page.locator('#f2l-found')).toHaveText('1');
});

test('F2L correction inspection is not interrupted by the trial timeout', async ({ page }) => {
  await page.clock.install();
  await prepareF2L(page);
  await clickPiece(page, fixture.pairs[0].find(piece => piece.length === 3));
  await clickPiece(page, fixture.pairs[1].find(piece => piece.length === 2));
  await expect(page.locator('#f2l-status')).toContainText('Those do not match');
  await page.clock.fastForward(20_000);
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('#f2l-status')).toContainText('Those do not match');
});

test('F2L distractors accept clicks, and mobile layout stays within the screen', async ({ page }) => {
  await prepareF2L(page);
  const distractor = Object.entries(fixture.current.pieceByPiece).find(([piece, item]) => !item.pairId && (piece.includes('U') || piece.includes('F')))?.[0];
  expect(distractor).toBeTruthy();
  await clickPiece(page, distractor);
  await expect(page.locator('#f2l-selection')).toContainText(distractor);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: 'F2L deduction' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('timed F2L scan scores matching pieces and keeps the limited camera', async ({ page }) => {
  await prepareF2L(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-f2l-drill="scan"]').click();
  await page.locator('#f2l-scan-duration').selectOption('15');
  await expect(page.locator('#f2l-status')).toContainText('Tap Start 15s scan above the cube');
  await page.locator('#f2l-scan-start').click();
  for (const piece of fixture.pairs[0]) await clickPiece(page, piece);
  await expect(page.locator('#f2l-found')).toHaveText('1');
  await expect(page.locator('#f2l-timings')).toContainText('left');
  await expect(page.locator('#f2l-cube canvas')).toHaveAttribute('data-rotation', 'limited-horizontal');
});

test('timed scan accepts real touch taps on a phone-sized canvas', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4174', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await prepareF2L(page);
  await page.locator('#f2l-view summary').tap();
  await page.locator('[data-f2l-drill="scan"]').click();
  await page.locator('#f2l-scan-start').tap();
  for (const piece of fixture.pairs[0]) await clickPiece(page, piece);
  await expect(page.locator('#f2l-found')).toHaveText('1');
  await context.close();
});

test('timed scan scores a pseudo pair with phone taps under a visible D offset', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4174', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await prepareF2L(page, pseudoFixture);
  await page.locator('#f2l-view summary').tap();
  await page.locator('[data-f2l-drill="scan"]').tap();
  await page.locator('#f2l-scan-pseudo').check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('#f2l-view')).toHaveAttribute('data-case-source', 'wasm-pseudo-scan');
  await expect(page.locator('#f2l-orientation')).toContainText(`${pseudoFixture.current.dShift} offset`);
  await page.locator('#f2l-scan-start').tap();
  const [, pair] = pseudoFixture.pairs[0];
  await clickPiece(page, pair.cornerPiece);
  await clickPiece(page, pair.edgePiece);
  await expect(page.locator('#f2l-found')).toHaveText('1');
  await expect(page.locator('#f2l-status')).toContainText('Pseudo pair found');
  await context.close();
});

test('best-next-pair drill shows locally verified weighted choices', async ({ page }) => {
  test.setTimeout(40_000);
  await prepareF2L(page);
  await page.locator('[data-f2l-drill="planner"]').click();
  await expect(page.locator('#f2l-view')).toHaveAttribute('data-case-source', 'verified-planner', { timeout: 25_000 });
  await expect.poll(() => page.locator('.planner-choice').count()).toBeGreaterThanOrEqual(2);
  await page.locator('.planner-choice').nth(1).click();
  await expect.poll(() => page.locator('.planner-choice.best').count()).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#f2l-timings')).toContainText('F/B = 5');
  await page.locator('#planner-shift-d').check();
  await expect(page.locator('#f2l-view')).toHaveAttribute('data-case-source', 'verified-planner', { timeout: 25_000 });
  await expect(page.locator('#f2l-status')).toContainText('D layer starts shifted');
});

test('opening help pauses the trial until explicit resume', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to play' }).click();
  await page.getByRole('button', { name: 'Start training' }).click();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Resume with a fresh case' }).click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
});

test('extreme F2L drags clamp the actual camera without exposing back or bottom', async ({ page }) => {
  await prepareF2L(page);
  const canvas = page.locator('#f2l-cube canvas');
  const box = await canvas.boundingBox();
  const initial = await canvas.getAttribute('data-camera-pose');
  for (const direction of [-1, 1]) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + direction * 1800, box.y + box.height / 2 - 600, { steps: 8 });
    await page.mouse.up();
    const [x, y, z] = (await canvas.getAttribute('data-camera-pose')).split(',').map(Number);
    expect(Math.abs(Math.atan2(x, z))).toBeLessThanOrEqual(.6201);
    expect(Math.acos(y / Math.hypot(x, y, z))).toBeCloseTo(.99, 3);
    expect(y).toBeGreaterThan(1.5);
    expect(z).toBeGreaterThan(1.5);
  }
  expect(await canvas.getAttribute('data-camera-pose')).not.toBe(initial);
});

test.describe('phone touch layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('starts compact and keeps all six touch answers within the first screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#corner-view .training-settings')).not.toHaveAttribute('open', '');
    await expect(page.locator('#cube canvas')).toBeVisible();
    const answers = await page.locator('#answers').boundingBox();
    expect(answers.y + answers.height).toBeLessThanOrEqual(844);
    for (const button of await page.locator('.answer-button').all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('[data-color="white"]').tap();
    await expect(page.locator('#case-number')).toHaveText('CASE 002');
    await page.locator('#corner-view .training-settings > summary').tap();
    await page.locator('[data-mode="triple"]').tap();
    await expect(page.locator('#corner-sequence')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test('F2L pairs respond to real touch taps and CN drill controls fit', async ({ page }) => {
    await prepareF2L(page);
    for (const piece of fixture.pairs[0]) await clickPiece(page, piece);
    await expect(page.locator('#f2l-found')).toHaveText('1');
    await page.locator('#f2l-view summary').tap();
    await expect(page.locator('[data-f2l-drill="scan"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
