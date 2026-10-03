import { expect, test } from 'playwright/test';
import { applyDemoMove, parseDemoHash, parseDemoPaste, setupState } from '../src/demo/model.js';
import { describeMove, expandToHeld } from '../src/moves/notation.js';
import { GOLD } from './analysis-golden.mjs';
import { mountTestBrain, playSolve } from './helpers/fake-brain.js';

async function watchCubeState(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const { Cube } = await import('/src/ui/cube/index.js');
    const snapshot = cube => {
      window.__demoCubeSnapshot = {
        state: JSON.parse(JSON.stringify(cube.state)),
        displayState: JSON.parse(JSON.stringify(cube.displayState)),
        highlight: JSON.parse(JSON.stringify(cube.lastHighlight)),
        color: cube.caseColorSetting,
      };
    };
    const paint = Cube.prototype.paint;
    Cube.prototype.paint = function (...args) { const result = paint.apply(this, args); snapshot(this); return result; };
    const animateMove = Cube.prototype.animateMove;
    Cube.prototype.animateMove = function (...args) {
      const result = animateMove.apply(this, args);
      snapshot(this);
      return result.then(value => { snapshot(this); return value; });
    };
  });
}

const copyClipboard = async (page, button) => {
  await button.click();
  await expect(button).toHaveText(/link copied/);
  return page.evaluate(() => navigator.clipboard.readText());
};

test('published format example opens, multipart lesson navigates, and offline playback preserves notes, descriptions, highlights, and final model state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const offOrigin = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4174/')) offOrigin.push(request.url());
  });
  await page.route('https://**', route => route.abort());
  await watchCubeState(page);
  await page.goto('/#/demo/format');
  const example = (await page.locator('.demo-format__example').textContent()).split('\n')[0].trim();
  expect(example).toMatch(/^#\/demo\?/);
  await page.locator('#demo-paste-input').fill(example);
  await page.getByRole('button', { name: 'open demo' }).click();
  await expect(page.locator('.demo-heading h1')).toHaveText('F2L pair');
  await expect(page.locator('.demo-cube .shared-cube canvas')).toBeVisible();

  const lesson = '#/demo?title=Two%20cases&part1.title=first%20case&part1.setup=R%20U&part1.alg=F%20R&part1.step1.moves=F&part1.step1.note=Keep%20the%20edge%3B%20observe&part1.step2.moves=R&part1.step2.note=Turn%20the%20corner%20into%20place&part1.highlight=pair%3AFR&part1.case=f2l/1&part1.color=white%20top&part2.title=second%20case&part2.setup=F&part2.alg=U%27&part2.case=f2l/8&part2.speed=4';
  await page.goto(`/${lesson}`);
  await expect(page.locator('.demo-part-title')).toHaveText('first case');
  await expect(page.locator('.demo-part-count')).toHaveText('case 1 of 2');
  await expect(page.locator('.demo-author-note')).toHaveText('Keep the edge; observe');
  const part = parseDemoHash(lesson).parts[0];
  const expectedDescription = describeMove(part.alg[0], expandToHeld(part.alg)[0].held).text;
  await expect(page.locator('.demo-move-description')).toHaveText(`Move 1 · ${expectedDescription}`);
  await expect.poll(() => page.evaluate(() => window.__demoCubeSnapshot?.highlight?.slot)).toBe('pair:FR');
  expect(await page.evaluate(() => window.__demoCubeSnapshot.highlight.dimOthers)).toBe(true);
  expect(await page.evaluate(() => window.__demoCubeSnapshot.color)).toBe('white top');

  const canvas = page.locator('.demo-cube .shared-cube canvas');
  await page.locator('[data-action="play"]').click();
  await expect.poll(() => canvas.getAttribute('data-turning-face')).not.toBeNull();
  await expect(page.locator('.demo-move-description')).toHaveText('Demo complete. The cube shows the final state.', { timeout: 10000 });
  await expect(canvas).not.toHaveAttribute('data-turning-face', /.+/);
  const expectedState = part.alg.reduce((state, move) => applyDemoMove(state, move), setupState(part.setup));
  await expect.poll(() => page.evaluate(() => window.__demoCubeSnapshot?.state)).toEqual(expectedState);
  await expect(page.locator('.demo-author-note')).toHaveText('Turn the corner into place');
  await page.locator('[data-action="previous-part"]').click();
  await expect(page.locator('.demo-part-title')).toHaveText('first case');
  await expect(page.locator('.demo-case-link')).toHaveAttribute('href', '#/algs/f2l/1');
  await page.locator('[data-action="next-part"]').click();
  await expect(page.locator('.demo-part-title')).toHaveText('second case');
  await expect(page.locator('.demo-part-count')).toHaveText('case 2 of 2');
  await expect(page.locator('.demo-case-link')).toHaveAttribute('href', '#/algs/f2l/8');
  await expect(page.locator('.demo-speed [role="combobox"]')).toContainText('4×');
  expect(offOrigin).toEqual([]);
});

test('local absolute-hash and alg.cubing links paste into CubeSight without a network fetch', async ({ page }) => {
  const offOrigin = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4174/')) offOrigin.push(request.url());
  });
  await page.route('https://**', route => route.abort());
  await page.goto('/#/demo/format');
  const input = page.locator('#demo-paste-input');
  await input.fill('Here is the demo: https://learn.example.org/app/#/demo?title=shared&setup=F&alg=R%27');
  await page.getByRole('button', { name: 'open demo' }).click();
  await expect(page.locator('.demo-heading h1')).toHaveText('shared');
  await input.fill('https://alg.cubing.net/?alg=R_U&setup=F');
  await page.getByRole('button', { name: 'open demo' }).click();
  await expect(page.locator('.demo-heading h1')).toHaveText('cube demo');
  const imported = parseDemoPaste('https://alg.cubing.net/?alg=R_U&setup=F');
  await expect(page.locator('.demo-cube .shared-cube canvas')).toBeVisible();
  expect(imported.parts[0].alg).toEqual(['R', 'U']);
  expect(imported.parts[0].setup).toEqual(['F']);
  expect(offOrigin).toEqual([]);
});

test('algorithm case and history review copy actions produce pasteable demo links', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/algs/f2l/1');
  const caseButton = page.locator('.alg-entry [data-demo-alg]').first();
  await expect(caseButton).toBeVisible();
  const caseUrl = await copyClipboard(page, caseButton);
  const caseDemo = parseDemoPaste(caseUrl);
  expect(caseDemo.parts[0].caseId).toBe('f2l/1');
  expect(caseDemo.parts[0].highlight).toEqual(['pair:FR']);
  expect(caseDemo.parts[0].colorSetting).toBeTruthy();

  const record = {
    at: 1700000000000, scramble: 'R U', solveMs: 12340, penalty: null, focus: 'speed', source: 'smart', solved: true,
    solveMoves: ["U'", "R'"], moveCount: 2,
    analysis: { v: 1, engine: 0, face: 'D', crossSource: 'default', solved: true, timed: true, marks: {},
      pauses: [{ i: 0, ms: 2100, allow: 500, boundary: 'f2l-f2l' }], cross: { done: true, best: 'U', extra: 1, proven: true } },
  };
  await page.addInitScript(value => localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: [value] })), record);
  await page.goto(`/#/history/${record.at}/review/pause-0`);
  const reviewButton = page.locator('.b-rev-detail [data-act="copy-demo"][data-variant="yours"]');
  await expect(reviewButton).toBeVisible();
  const reviewUrl = await copyClipboard(page, reviewButton);
  const reviewDemo = parseDemoPaste(reviewUrl);
  expect(reviewDemo.parts[0].setup).toEqual(['R', 'U']);
  expect(reviewDemo.parts[0].alg).toEqual(["U'", "R'"]);
});

test('the coach tip can copy a demo link for its selected review moment', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mountTestBrain(page, 'orbit', { route: true });
  await playSolve(page, GOLD.normal.scramble, GOLD.normal.moves, { brain: '#brain-view', base: 100, gaps: { 14: 1800 } });
  const share = page.locator('.b-rev-share-coach');
  await expect(share).toBeVisible();
  const link = await copyClipboard(page, share);
  const demo = parseDemoPaste(link);
  expect(demo.parts[0].alg.length).toBeGreaterThan(0);
  await expect(page.locator('.b-rev-detail')).toBeVisible();
});

test('pausing mid-turn restores the committed state; repeated next cannot double-advance; any-colour display stays stable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await watchCubeState(page);
  await page.goto("/#/demo?title=Interrupted&setup=R%20U&alg=F%20R&color=any%20colour&speed=0.25");
  const parsed = parseDemoHash("#/demo?title=Interrupted&setup=R%20U&alg=F%20R&color=any%20colour&speed=0.25");
  const part = parsed.parts[0];
  const baseline = await page.evaluate(() => window.__demoCubeSnapshot.displayState.cubies.find(cubie => cubie.id.length === 1 && cubie.position[1] === 1).stickers);
  const topColor = Object.values(baseline)[0];
  await page.locator('[data-action="play"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.demo-move-description')).toContainText('Move 1');
  const initialState = part.setup.length ? setupState(part.setup) : setupState([]);
  await expect.poll(() => page.evaluate(() => window.__demoCubeSnapshot.state)).toEqual(initialState);
  await expect.poll(() => page.evaluate(() => Object.values(window.__demoCubeSnapshot.displayState.cubies.find(cubie => cubie.id.length === 1 && cubie.position[1] === 1).stickers)[0])).toBe(topColor);

  await page.locator('[data-action="next-move"]').click();
  await page.evaluate(() => document.querySelector('[data-action="next-move"]').click());
  await expect(page.locator('.demo-move-description')).toContainText('Move 2', { timeout: 5000 });
  const firstState = applyDemoMove(initialState, part.alg[0]);
  await expect.poll(() => page.evaluate(() => window.__demoCubeSnapshot.state)).toEqual(firstState);
  await page.locator('[data-action="previous-move"]').click();
  await expect.poll(() => page.evaluate(() => window.__demoCubeSnapshot.state)).toEqual(initialState);
  await expect.poll(() => page.evaluate(() => Object.values(window.__demoCubeSnapshot.displayState.cubies.find(cubie => cubie.id.length === 1 && cubie.position[1] === 1).stickers)[0])).toBe(topColor);
});
