import { test, expect } from './helpers/coverage-test.js';

async function clickPiece(page, piece) {
  const point = await page.evaluate(async selected => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const canvas = document.querySelector('#f2l-cube canvas');
    const rect = canvas.getBoundingClientRect();
    const camera = new THREE.PerspectiveCamera(28, rect.width / rect.height, .1, 100);
    camera.position.fromArray(canvas.dataset.cameraPose.split(',').map(Number));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const position = new THREE.Vector3(selected.includes('R') ? 1 : selected.includes('L') ? -1 : 0,
      selected.includes('U') ? 1 : selected.includes('D') ? -1 : 0,
      selected.includes('F') ? 1 : selected.includes('B') ? -1 : 0);
    if (selected.includes('U')) position.y += .52;
    else position.z += .52;
    position.project(camera);
    return { x: rect.x + (position.x + 1) * rect.width / 2, y: rect.y + (1 - position.y) * rect.height / 2 };
  }, piece);
  await page.mouse.click(point.x, point.y);
}

test('a pinned pseudo scan scores a pseudo pair from the exact saved cube state', async ({ page }) => {
  await page.addInitScript(() => {
    crypto.getRandomValues = array => { array.fill(42); return array; };
    localStorage.setItem('cubesight-f2l-mode', 'scan');
  });
  await page.goto('/');
  const fixture = await page.evaluate(async () => {
    const [{ createPlannerSetup }, { createF2LCaseFromCubeState, createPinnedPseudoScanCase }, { currentDShift }, { openHistory }] = await Promise.all([
      import('/src/f2l-planner.js'), import('/src/f2l-logic.js'), import('/src/solve-tracker.js'), import('/src/store/history.js'),
    ]);
    const setup = createPlannerSetup(1, { shiftD: true });
    const current = createF2LCaseFromCubeState(setup.state, 42);
    const pinned = createPinnedPseudoScanCase(current, currentDShift(setup.state, 'D'));
    const pair = Object.values(pinned.pairOptions).find(option => [option.cornerPiece, option.edgePiece].every(piece => piece.includes('U') || piece.includes('F')));
    if (!pair) throw new Error('Expected a visible pseudo pair in the pinned fixture.');
    const history = await openHistory();
    const at = Date.now() + 100;
    const saved = history.pins.add({ at, moveIdx: 0, stage: 'pair1', kind: 'pseudo', trainer: 'f2l', scramble: setup.scramble, crossFace: 'D', movesUpTo: [], yours: [], better: null });
    await history.pins.flush();
    return { at: saved.at, pair };
  });

  await page.goto(`/#/drills/f2l?setup=review%3A${fixture.at}%3A0&drill=scan&pseudo=1`);
  await expect(page.locator('#f2l-cube canvas')).toBeVisible();
  await expect(page.locator('#f2l-status')).toContainText('Tap start');
  await expect(page.locator('#f2l-continue')).toHaveAttribute('data-action', 'start-scan');
  await page.locator('#f2l-continue').click();
  await clickPiece(page, fixture.pair.cornerPiece);
  await clickPiece(page, fixture.pair.edgePiece);
  await expect(page.locator('#f2l-timings')).toContainText('1 pairs');
  await expect(page.locator('#f2l-status')).toContainText('Pseudo pair!');
});
