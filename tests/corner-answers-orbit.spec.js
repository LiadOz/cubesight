import { test, expect } from './helpers/coverage-test.js';

// Regression guards for two user-reported corner drill bugs:
//  1. the six colour buttons (and their keys) must never move between cases;
//  2. in a three-corner case the Orbit shows one arc per guess, coloured by outcome.

const vm = page => page.evaluate(() => window.__cubesightLegacyTrainerHandles.corner.getViewModel());
const buttons = page => page.locator('#answers .answer-button').evaluateAll(list => list.map(button => ({ color: button.dataset.color, key: button.querySelector('kbd').textContent })));
const ready = page => expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible', { timeout: 5_000 });
const filledCount = page => page.locator('#corner-view .cube-stage .orbit__segment-fill').count();
const segmentStates = page => page.locator('#corner-view .cube-stage .orbit__segment').evaluateAll(list => list.map(node => node.getAttribute('class').match(/is-(\w+)/)?.[1]));

async function answerWith(page, wanted) {
  await ready(page);
  const model = await vm(page);
  const pick = model.answers.find(answer => answer.correct === wanted);
  await page.locator(`#answers .answer-button[data-color="${pick.displayKey}"]`).click();
}

test('the six colour buttons keep their order and keys across corners and cases', async ({ page }) => {
  // "any colour" recolours the cube for almost every case. In three-corner mode the buttons of corner 2 and 3 used to be
  // laid out through that case's map while corner 1 was not, so the colours jumped between corners.
  await page.addInitScript(() => { localStorage.setItem('cubesight-case-color-v1', 'any colour'); localStorage.setItem('cubesight-corner-mode', 'triple'); });
  await page.goto('/#/drills/corners');
  const expected = [['white', 'W'], ['yellow', 'Y'], ['green', 'G'], ['blue', 'B'], ['red', 'R'], ['orange', 'O']];
  const tops = new Set(), seeds = new Set();
  for (let index = 0; index < 6; index++) {
    await ready(page);
    const model = await vm(page);
    seeds.add(model.currentCase.seed); tops.add(model.currentCase.topColor);
    expect((await buttons(page)).map(item => [item.color, item.key])).toEqual(expected);
    // Every fixed slot still scores against the colour it shows.
    expect(model.answers.filter(answer => answer.correct)).toHaveLength(1);
    const before = await page.locator('#case-mode').textContent();
    await answerWith(page, true);
    await expect(page.locator('#case-mode')).not.toHaveText(before);
  }
  expect(seeds.size).toBeGreaterThan(1);
  expect(tops.size).toBeGreaterThan(1); // the cube did recolour; only the buttons stayed put
});

test('changing the case colour mid-case does not move the buttons', async ({ page }) => {
  await page.goto('/#/drills/corners');
  await ready(page);
  const before = await buttons(page);
  await page.evaluate(() => { localStorage.setItem('cubesight-case-color-v1', 'white top'); window.dispatchEvent(new CustomEvent('cubesight-case-color-change', { detail: { setting: 'white top' } })); });
  expect(await buttons(page)).toEqual(before);
  await answerWith(page, true);
  await expect(page.locator('.corner-result.is-correct')).toBeVisible();
});

test('the keyboard letters follow the fixed buttons', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cubesight-case-color-v1', 'any colour'));
  await page.goto('/#/drills/corners');
  for (let index = 0; index < 4; index++) {
    await ready(page);
    const model = await vm(page);
    const right = model.answers.find(answer => answer.correct);
    await page.keyboard.press(right.label[0].toLowerCase());
    await expect(page.locator('.corner-result.is-correct')).toBeVisible();
    await expect.poll(async () => (await vm(page)).currentCase.seed, { timeout: 5_000 }).not.toBe(model.currentCase.seed);
  }
});

test('the Orbit shows the three guesses of a case: right, right, wrong', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cubesight-corner-mode', 'triple'));
  await page.goto('/#/drills/corners');
  await ready(page);
  // Every arc starts empty, the one being answered included; only an answer fills it.
  await expect.poll(() => segmentStates(page)).toEqual(['future', 'future', 'future']);
  expect(await filledCount(page)).toBe(0);
  await answerWith(page, true);
  await expect.poll(() => segmentStates(page)).toEqual(['good', 'future', 'future']);
  await answerWith(page, true);
  await expect.poll(() => segmentStates(page)).toEqual(['good', 'good', 'future']);
  await answerWith(page, false);
  await expect.poll(() => segmentStates(page)).toEqual(['good', 'good', 'bad']);
  // The next case starts a fresh, empty set of three.
  await expect.poll(() => segmentStates(page), { timeout: 4_000 }).toEqual(['future', 'future', 'future']);
  expect(await filledCount(page)).toBe(0);
});

const tripleMode = page => page.addInitScript(() => localStorage.setItem('cubesight-corner-mode', 'triple'));
const seed = async page => (await vm(page)).currentCase.seed;

test('a completed three-corner case holds its three-teal Orbit before the next case', async ({ page }) => {
  await tripleMode(page);
  await page.goto('/#/drills/corners');
  await ready(page);
  const first = await seed(page);
  await answerWith(page, true); await answerWith(page, true); await answerWith(page, true);
  // Right after the third right answer the reward is on screen, not already replaced by the next case.
  expect(await segmentStates(page)).toEqual(['good', 'good', 'good']);
  expect(await seed(page)).toBe(first);
  await page.waitForTimeout(700);
  expect(await segmentStates(page)).toEqual(['good', 'good', 'good']);
  await expect.poll(() => segmentStates(page), { timeout: 4_000 }).toEqual(['future', 'future', 'future']);
});

test('the end-of-case dwell is the same for right and wrong, and any answer key or skip ends it early', async ({ page }) => {
  await tripleMode(page);
  await page.goto('/#/drills/corners');
  for (const finalAnswer of [true, false]) {
    await ready(page);
    const first = await seed(page);
    await answerWith(page, true); await answerWith(page, true);
    await answerWith(page, finalAnswer);
    expect(await segmentStates(page)).toEqual(['good', 'good', finalAnswer ? 'good' : 'bad']);
    await page.waitForTimeout(500);
    expect(await seed(page)).toBe(first); // both endings are still held
    const before = Date.now();
    await page.keyboard.press('s'); // skip ends the dwell now
    await expect.poll(() => seed(page), { timeout: 600 }).not.toBe(first); // the next case, well before the 1.1 s dwell ends
    expect(Date.now() - before).toBeLessThan(900);
    await expect.poll(() => segmentStates(page), { timeout: 4_000 }).toEqual(['future', 'future', 'future']);
  }
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`the result toast does not cover the cube at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await tripleMode(page);
    await page.goto('/#/drills/corners');
    await answerWith(page, false);
    const toast = page.locator('.corner-result');
    await expect(toast).toContainText('Not quite, it was');
    const [box, cube] = await Promise.all([toast.boundingBox(), page.locator('#cube').boundingBox()]);
    const overlap = !(box.x + box.width <= cube.x || cube.x + cube.width <= box.x || box.y + box.height <= cube.y || cube.y + cube.height <= box.y);
    expect(overlap, `toast ${JSON.stringify(box)} vs cube ${JSON.stringify(cube)}`).toBe(false);
  });
}

test('answered arcs fill in teal or amber with no dot or marker on the Orbit', async ({ page }) => {
  await tripleMode(page);
  await page.goto('/#/drills/corners');
  await ready(page);
  const orbit = page.locator('#corner-view .cube-stage .orbit');
  const dots = () => orbit.locator('.orbit__current-dot, .orbit__marker-cluster, .orbit__marker-ring').count();
  const fills = () => page.locator('#corner-view .cube-stage .orbit__segment-fill').evaluateAll(list => list.map(node => node.getAttribute('stroke').toLowerCase()));
  expect(await dots()).toBe(0);
  await answerWith(page, true);
  await expect.poll(fills).toEqual(['#3dbfad']);
  await answerWith(page, false);
  await expect.poll(fills).toEqual(['#3dbfad', '#e6a642']);
  expect(await dots()).toBe(0);
});

test('the no-answer screen uses the Orbit tokens, DM Mono label and Manrope text', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#/drills/corners');
  await ready(page);
  await page.clock.fastForward(10_500);
  const overlay = page.locator('#pause-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('h2')).toHaveText('Taking a break?');
  await expect(overlay.locator('.pause-note')).toHaveText("No answer in 10 s. This one won't count.");
  const look = await page.evaluate(() => {
    const view = document.querySelector('#corner-view');
    const resolve = (property, value) => { const probe = document.createElement('i'); probe.style[property] = value; view.append(probe); const out = getComputedStyle(probe)[property]; probe.remove(); return out; };
    const style = selector => getComputedStyle(document.querySelector(`#pause-overlay ${selector}`));
    const card = style('> div'), label = style('.pause-label'), title = style('h2'), note = style('.pause-note'), button = style('button');
    return {
      card: [card.backgroundColor, resolve('backgroundColor', 'var(--b-surface)')], border: [card.borderTopColor, resolve('borderTopColor', 'var(--b-hairline)')], ink: [card.color, resolve('color', 'var(--b-ink)')],
      muted: [note.color, resolve('color', 'var(--b-muted)')], buttonBg: [button.backgroundColor, resolve('backgroundColor', 'var(--b-ink)')],
      label: label.fontFamily, title: title.fontFamily, note: note.fontFamily, button: button.fontFamily,
    };
  });
  for (const key of ['card', 'border', 'ink', 'muted', 'buttonBg']) expect(look[key][0], key).toBe(look[key][1]);
  expect(look.label).toContain('DM Mono');
  for (const key of ['title', 'note', 'button']) expect(look[key], key).toContain('Manrope');
  await overlay.locator('[data-action="resume"]').click();
  await expect(overlay).toBeHidden();
});
