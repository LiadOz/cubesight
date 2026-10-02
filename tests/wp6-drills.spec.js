import { test, expect } from './helpers/coverage-test.js';

test('the OLL drill opens the selected canonical case, scores it, and reveals a credited alg', async ({ page }) => {
  await page.goto('/#/drills/oll?cases=oll%2F1');
  await expect(page.locator('#oll-view')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'OLL recognition' })).toBeVisible();
  await expect(page.getByRole('button', { name: /1 · Runway, Blank/ })).toBeVisible();
  await page.getByRole('button', { name: /1 · Runway, Blank/ }).click();
  await expect(page.locator('#oll-reveal')).toContainText('OLL 1 · Runway, Blank');
  await expect(page.locator('#oll-reveal a')).toHaveAttribute('href', /speedsolving\.com/);
  await expect(page.locator('#oll-combo')).toHaveText('combo 1');
});

test('changing the OLL case query while staying on the route loads the new setup', async ({ page }) => {
  await page.goto('/#/drills/oll?cases=oll%2F1');
  await expect(page.getByRole('button', { name: /1 · Runway, Blank/ })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/drills/oll?cases=oll%2F2'; });
  await expect(page.getByRole('button', { name: /2 · Zamboni/ })).toBeVisible();
});

test('the canonical OLL 26 setup with a whole-cube rotation loads and reveals', async ({ page }) => {
  await page.goto('/#/drills/oll?cases=oll%2F26');
  const answer = page.getByRole('button', { name: /26 · Antisune/ });
  await expect(answer).toBeVisible();
  await expect(page.locator('#oll-feedback')).not.toContainText('could not be loaded');
  await answer.click();
  await expect(page.locator('#oll-reveal')).toContainText('OLL 26 · Antisune');
});

test('the lookahead drill offers planner-verified next-pair choices', async ({ page }) => {
  await page.goto('/#/drills/lookahead');
  await expect(page.locator('#lookahead-view')).toBeVisible();
  await page.getByRole('button', { name: 'start 20-case round' }).click();
  const choices = page.locator('.lookahead-choice');
  await expect(choices.first()).toBeVisible({ timeout: 18_000 });
  await expect(choices.first()).toContainText('verified');
  await expect(page.locator('#la-clock')).toHaveText(/^[0-3]\.\d{2} s$/);
  await choices.first().click();
  await expect(page.locator('#la-feedback')).not.toHaveText('Pick the pair you would solve first.');
});

test('lookahead timeout records an unanswered case without inventing a response time', async ({ page }) => {
  await page.goto('/#/drills/lookahead?cases=17');
  await expect(page.locator('.lookahead-choice').first()).toBeVisible({ timeout: 18_000 });
  await expect(page.locator('#la-feedback')).toContainText('Time is up.', { timeout: 5000 });
  const answer = await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-shell-v1')).round.answers[0]);
  expect(answer.correct).toBe(false);
  expect(answer.ms).toBeNull();
});

test('lookahead cases filter selects only requested pair slots', async ({ page }) => {
  await page.goto('/#/drills/lookahead?cases=FR');
  const choices = page.locator('.lookahead-choice');
  await expect(choices.first()).toBeVisible({ timeout: 25_000 });
  await expect(choices).toHaveCount(1);
  await expect(choices.first()).toContainText('FR');
});

test('lookahead planner finds the fourth pair in a plain three-pair setup', async ({ page }) => {
  await page.goto('/');
  const scramble = await page.evaluate(async () => {
    const { createPlannerSetup } = await import('/src/f2l-planner.js');
    const setup = createPlannerSetup(3);
    return [setup.scramble, ...setup.recoveryPlans[0]].join(' ');
  });
  await page.goto(`/#/drills/lookahead?scramble=${encodeURIComponent(scramble)}`);
  const choices = page.locator('.lookahead-choice');
  await expect(choices.first()).toBeVisible({ timeout: 30000 });
  await expect(choices).toHaveCount(1);
  await expect(page.locator('#la-feedback')).toContainText('Only one pair remains');
});

test('cross planning cases filter limits both choices and comparison to requested crosses', async ({ page }) => {
  await page.goto('/#/drills/scout?cases=D');
  const choices = page.locator('.cp-face');
  await expect(choices).toHaveCount(1);
  await expect(choices.first()).toHaveAttribute('data-face', 'D');
  await expect(page.locator('#cp-feedback')).not.toContainText('Unknown cross face');
});

test('cross planning honors a linked face when no cases filter overrides it', async ({ page }) => {
  await page.goto('/#/drills/scout?face=F');
  const choices = page.locator('.cp-face');
  await expect(choices).toHaveCount(1);
  await expect(choices.first()).toHaveAttribute('data-face', 'F');
});

test('Cross Scout accepts a linked setup without replacing it with a random scramble', async ({ page }) => {
  await page.goto('/#/drills/scout?mode=explore&setup=R%20U%20R%27');
  await expect(page.locator('#scout-scramble')).toHaveValue("R U R'");
  await expect(page.locator('#scout-message')).toContainText('Pinned position loaded');
});

test('corner recognition opens an exact linked position', async ({ page }) => {
  await page.goto('/#/drills/corners?scramble=R_U_F');
  await expect(page.locator('#cube canvas')).toBeVisible();
  await expect(page.locator('#prompt-text')).toContainText('Which color');
  await expect(page.locator('.answer-button').first()).toBeEnabled();
});

test('a pinned F2L pair 4 start offers the one remaining verified pair', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cubesight-f2l-mode', 'planner'));
  await page.goto('/');
  const pin = await page.evaluate(async () => {
    const [{ openHistory }, { createPlannerSetup }] = await Promise.all([
      import('/src/store/history.js'), import('/src/f2l-planner.js'),
    ]);
    const store = await openHistory();
    const setup = createPlannerSetup(3);
    const movesUpTo = setup.recoveryPlans[0];
    const at = Date.now() + 100;
    const saved = store.pins.add({ at, moveIdx: movesUpTo.length, stage: 'pair4', trainer: 'f2l', scramble: setup.scramble, crossFace: 'D', movesUpTo, yours: [], better: ['U', 'R', "U'", "R'"] });
    await store.pins.flush();
    return { at: saved.at, moveIdx: saved.moveIdx };
  });
  await page.goto(`/#/drills/f2l?setup=review%3A${pin.at}%3A${pin.moveIdx}`);
  const choices = page.locator('.planner-choice');
  await expect(choices.first()).toBeVisible({ timeout: 25_000 });
  await expect(choices).toHaveCount(1);
  await expect(page.locator('#f2l-status')).toContainText('Which pair');
});

test('cross planning checks six crosses before revealing a replayable plan', async ({ page }) => {
  await page.goto('/#/drills/scout');
  await expect(page.locator('.cp-question')).toBeVisible();
  const choice = page.locator('.cp-face:not(:disabled)').first();
  await expect(choice).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press(await choice.getAttribute('data-face'));
  await expect(page.locator('#cp-reveal')).toBeVisible();
  await expect(page.locator('#cp-playback')).toBeVisible();
  await expect(page.locator('#cp-step')).toContainText(/scrambled state|move/);
});
