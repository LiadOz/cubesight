import { test, expect } from './helpers/coverage-test.js';

async function mountPlayer(page, style = 'orbit') {
  await page.goto('/#/drills');
  await page.evaluate(async selectedStyle => {
    const [{ createPageCube }, { createSequencePlayer }, { createSolvedState }, { getCase }, { caseSetupState }] = await Promise.all([
      import('/src/pages/cube-view.js'), import('/src/moves/sequence-player.js'), import('/src/cross-cube.js'),
      import('/src/algs/seed/cases.js'), import('/src/algs/drill/cube.js'),
    ]);
    const root = document.createElement('section');
    root.className = 'brain'; root.dataset.brainStyle = selectedStyle;
    root.innerHTML = '<div id="sequence-cube" style="width:360px;height:360px"></div><div id="sequence-controls"></div>';
    document.body.append(root);
    const row = getCase('pll/T');
    const cube = await createPageCube(root.querySelector('#sequence-cube'), { state: createSolvedState() });
    const player = createSequencePlayer(root.querySelector('#sequence-controls'), {
      cube3d: cube, startState: caseSetupState(row), moves: row.algs[0].moves,
    });
    window.sequenceFixture = { cube, player, row };
  }, style);
}

for (const style of ['orbit', 'mono']) test(`${style} playback completes the verified algorithm on one persistent cube`, async ({ page }) => {
  await mountPlayer(page, style);
  await expect(page.locator('#sequence-cube canvas')).toHaveCount(1);
  await page.evaluate(() => window.sequenceFixture.player.setSpeed(4));
  await page.locator('#sequence-controls [data-sequence="play"]').click();
  await expect.poll(() => page.evaluate(() => {
    const snapshot = window.sequenceFixture.player.getSnapshot();
    return snapshot.index === snapshot.moves.length && !snapshot.playing;
  })).toBe(true);
  expect(await page.evaluate(async () => {
    const { player, row } = window.sequenceFixture;
    const [{ applyMoves, sameCubeState }, { caseSetupState }, { physicalModelTokens, tokenizeReconstruction }] = await Promise.all([
      import('/src/cross-cube.js'), import('/src/algs/drill/cube.js'), import('/src/review/import-parser.js'),
    ]);
    const expected = applyMoves(caseSetupState(row), physicalModelTokens(tokenizeReconstruction(row.algs[0].moves).tokens));
    return sameCubeState(player.getSnapshot().state, expected);
  })).toBe(true);
  await page.locator('#sequence-controls [data-sequence="back"]').click();
  await page.locator('#sequence-controls [data-sequence="reset"]').click();
  await expect(page.locator('#sequence-controls')).toHaveAttribute('data-sequence-index', '0');
  await expect(page.locator('#sequence-cube canvas')).toHaveCount(1);
});

test('reduced motion finishes in a static pose and paused playback cannot advance later', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mountPlayer(page);
  await page.locator('#sequence-controls [data-sequence="play"]').click();
  expect(await page.evaluate(() => {
    const snapshot = window.sequenceFixture.player.getSnapshot();
    return !snapshot.playing && snapshot.index === snapshot.moves.length;
  })).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const player = window.sequenceFixture.player;
    player.reset(); void player.play(); player.pause();
  });
  await page.waitForTimeout(450);
  await expect(page.locator('#sequence-controls')).toHaveAttribute('data-sequence-index', '0');
  await expect(page.locator('#sequence-controls')).toHaveAttribute('data-sequence-playing', 'false');
});
