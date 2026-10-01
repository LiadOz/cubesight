// The manual timer (src/timer) on its dev page: keyboard flow, touch flow on a phone, penalty
// edits, persistence across a reload (IndexedDB) and working offline.
// TIMER_SHOTS=1 also writes the visual matrix under test-results/timer-screenshots/.
import { test, expect } from 'playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = '/src/timer/_dev.html';
const SHOTS = process.env.TIMER_SHOTS ? resolve(process.cwd(), 'test-results/timer-screenshots') : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const INSPECTION_OFF = { version: 2, inspection: { mode: 'off' } };

async function open(page, query = '', { settings } = {}) {
  if (settings) await page.addInitScript(value => { if (!localStorage.getItem('cubesight-brain-settings-v2')) localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify(value)); }, settings);
  await page.goto(`${PAGE}?${query}`);
  await page.waitForSelector('html[data-timer-ready]');
  await expect(page.locator('.tm-scramble')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}
const root = page => page.locator('.tm');
const time = page => page.getByTestId('time');
const records = page => page.evaluate(async () => { await window.timerDev.store.flush(); return window.timerDev.store.records; });

async function holdSpace(page, ms = 360) {
  await page.keyboard.down(' ');
  await page.waitForTimeout(ms);
  await page.keyboard.up(' ');
}

test('keyboard: hold space, inspect, hold again to start, any key stops', async ({ page }) => {
  await open(page);
  await expect(root(page)).toHaveAttribute('data-phase', 'idle');
  const scramble = await page.getByTestId('scramble').textContent();
  expect(scramble.replace(/[′2\s]/g, '')).toMatch(/^[UDFBRL]+$/);

  // A short press does nothing.
  await holdSpace(page, 100);
  await expect(root(page)).toHaveAttribute('data-phase', 'idle');

  // The ready indicator shows after the 300 ms hold.
  await page.keyboard.down(' ');
  await expect(root(page)).toHaveAttribute('data-hold', 'holding');
  await expect(root(page)).toHaveAttribute('data-hold', 'ready', { timeout: 1000 });
  await page.keyboard.up(' ');
  await expect(root(page)).toHaveAttribute('data-phase', 'inspecting');
  await expect(page.locator('.tm-insp')).toBeVisible();

  await holdSpace(page);
  await expect(root(page)).toHaveAttribute('data-phase', 'running');
  await page.waitForTimeout(700);
  await page.keyboard.press('x');
  await expect(root(page)).toHaveAttribute('data-phase', 'done');
  await expect(time(page)).toHaveText(/^\d+\.\d\d$/);
  const solved = Number((await time(page).textContent()));
  expect(solved).toBeGreaterThan(0.6);
  expect(solved).toBeLessThan(2);

  const saved = await records(page);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ source: 'manual', focus: 'speed', penalty: null, solveMoves: [], moveCount: 0, inspectionMode: 'wca', solved: true });
  expect(saved[0].scramble).toBe(scramble.replace(/′/g, "'"));
  expect(saved[0].inspectionMs).toBeGreaterThan(0);
  expect(saved[0].sessionId).toBeTruthy();
  await expect(page.getByTestId('stats')).toContainText('1 solve');
  // The scramble moved on to the next one.
  await expect(page.getByTestId('scramble')).not.toHaveText(scramble);
  await page.keyboard.press('r');
  await expect(root(page)).toHaveAttribute('data-phase', 'idle');
  const retryState = await page.evaluate(() => window.timerDev.timer.getPreviewSnapshot());
  const retryMatches = await page.evaluate(async ({ state, text }) => {
    const { stateFromScramble, sameCubeState } = await import('/src/cross-cube.js');
    return sameCubeState(state, stateFromScramble(text));
  }, { state: retryState.state, text: saved[0].scramble });
  expect(retryMatches).toBe(true);
  await expect(page.locator('.tm-preview canvas')).toHaveCount(1);
  await page.keyboard.press('Space');
  await expect(root(page)).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('.tm-scramble')).toHaveAttribute('data-state', 'ready');
  await holdSpace(page);
  await expect(root(page)).toHaveAttribute('data-phase', 'inspecting');
});

test('penalty edit with 2 / d / delete / u, and it persists after a reload', async ({ page }) => {
  await open(page, '', { settings: INSPECTION_OFF });
  await holdSpace(page);
  await expect(root(page)).toHaveAttribute('data-phase', 'running');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await expect(root(page)).toHaveAttribute('data-phase', 'done');
  await expect(time(page)).toHaveText(/^\d+\.\d\d$/);
  const raw = Number(await time(page).textContent());

  await page.keyboard.press('2');
  await expect(time(page)).toHaveText(`${(raw + 2).toFixed(2)}+`);
  await page.keyboard.press('d');
  await expect(time(page)).toHaveText(`DNF(${raw.toFixed(2)})`);
  await page.keyboard.press('d');
  await expect(time(page)).toHaveText(raw.toFixed(2));
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('stats')).toContainText('no manual speed solves yet');
  expect(await records(page)).toHaveLength(0);
  await page.keyboard.press('u');
  await expect(page.getByTestId('stats')).toContainText('1 solve');
  await page.getByRole('button', { name: /^2\s*\+2$/ }).click();   // the on-screen button does the same
  expect((await records(page))[0].penalty).toBe('+2');

  await page.reload();
  await page.waitForSelector('html[data-timer-ready]');
  const after = await records(page);
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ source: 'manual', penalty: '+2', solveMs: Math.round(raw * 1000) });
  await expect(page.getByTestId('stats')).toContainText('1 solve');
});

test('esc abandons an attempt without saving', async ({ page }) => {
  await open(page, '', { settings: INSPECTION_OFF });
  await holdSpace(page);
  await expect(root(page)).toHaveAttribute('data-phase', 'running');
  await page.keyboard.press('Escape');
  await expect(root(page)).toHaveAttribute('data-phase', 'idle');
  expect(await records(page)).toHaveLength(0);
});

test('inspection modes and overtime penalties stay shared and configurable', async ({ page }) => {
  await open(page, '', { settings: INSPECTION_OFF });
  const insp = page.locator('button[data-action="inspection"]');
  const length = page.locator('button[data-action="inspection-seconds"]');
  const overtime = page.locator('button[data-action="overtime"]');
  await expect(insp).toHaveText('off');
  await expect(insp).toHaveAttribute('aria-label', 'inspection off');
  await insp.click(); await expect(insp).toHaveText('WCA 15 s');
  await expect(insp).toHaveAttribute('aria-label', 'inspection WCA 15 s');
  await insp.click(); await expect(insp).toHaveText('custom 15 s');
  await expect(length).toHaveText('length 15 s');
  await length.click(); await expect(length).toHaveText('length 20 s');
  await insp.click(); await expect(insp).toHaveText('∞');
  await insp.click(); await expect(insp).toHaveText('off');

  await overtime.click(); await expect(overtime).toHaveText('overtime count');
  await overtime.click(); await expect(overtime).toHaveText('overtime grace 2 s · +2');
  await overtime.click(); await expect(overtime).toHaveText('overtime grace 2 s · DNF');
  await overtime.click(); await expect(overtime).toHaveText('overtime grace 2 s · none');
  await overtime.click(); await expect(overtime).toHaveText('overtime auto-start');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-brain-settings-v2')));
  expect(stored.inspection).toMatchObject({ mode: 'off', overtime: 'autostart', gracePenalty: 'none' });
});

test('hold to start is configurable and stats come from the focus history', async ({ page }) => {
  await open(page, 'seed=30');
  await expect(page.getByTestId('stats')).toContainText('30 solves');
  const statsSource = page.locator('button[data-action="stats-source"]');
  await expect(statsSource).toHaveText('stats · manual solves');
  await statsSource.click();
  await expect(statsSource).toHaveText('stats · all solves');
  await statsSource.click();
  await expect(statsSource).toHaveText('stats · manual solves');
  for (const key of ['ao5', 'ao12', 'mo3', 'pb']) await expect(page.locator(`[data-stat="${key}"]`)).toBeVisible();
  await expect(page.locator('[data-stat="ao50"]')).toHaveCount(0);
  await page.getByRole('button', { name: /hold 300/ }).click();
  await expect(page.getByRole('button', { name: /hold 550/ })).toBeVisible();
  await holdSpace(page, 400);   // shorter than 550: not ready
  await expect(root(page)).toHaveAttribute('data-phase', 'idle');
  await holdSpace(page, 620);
  await expect(root(page)).toHaveAttribute('data-phase', 'inspecting');
});

test('scramble preview matches the WCA state, keeps one canvas, and owns its keyboard controls', async ({ page }) => {
  await open(page);
  const canvas = page.locator('.tm-preview canvas');
  await expect(canvas).toHaveCount(1);
  expect(await page.locator('.tm-preview').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  const snapshot = await page.evaluate(() => window.timerDev.timer.getPreviewSnapshot());
  expect(snapshot).toMatchObject({ index: snapshot.moves.length, playing: false });
  const matches = await page.evaluate(async ({ state, text }) => {
    const { stateFromScramble, sameCubeState } = await import('/src/cross-cube.js');
    return sameCubeState(state, stateFromScramble(text.replace(/′/g, "'")));
  }, { state: snapshot.state, text: await page.getByTestId('scramble').textContent() });
  expect(matches).toBe(true);

  const player = page.locator('.tm-preview-tools');
  const play = player.locator('[data-sequence="play"]');
  await play.focus();
  await page.keyboard.press('Space');
  await expect(root(page)).toHaveAttribute('data-phase', 'idle');
  await expect(root(page)).toHaveAttribute('data-hold', '');
  await page.waitForTimeout(80);
  await expect(canvas).toHaveCount(1);
  await expect(page.locator('.tm-preview-tools')).toHaveAttribute('data-sequence-playing', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tm-preview-tools')).toHaveAttribute('data-sequence-playing', 'false');

  await page.evaluate(() => document.activeElement?.blur());
  await holdSpace(page);
  await expect(root(page)).toHaveAttribute('data-phase', 'inspecting');
  await expect(canvas).toHaveCount(1);
  await holdSpace(page);
  await expect(root(page)).toHaveAttribute('data-phase', 'running');
  await expect(canvas).toHaveCount(1);
});

test.describe('works offline', () => {
  test('a full solve and a new scramble with no network', async ({ page, context }) => {
    await open(page, '', { settings: INSPECTION_OFF });
    await context.setOffline(true);
    await page.getByRole('button', { name: 'new scramble' }).click();
    await expect(page.locator('.tm-scramble')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
    await holdSpace(page);
    await page.waitForTimeout(400);
    await page.keyboard.press('k');
    await expect(root(page)).toHaveAttribute('data-phase', 'done');
    expect(await records(page)).toHaveLength(1);
    await context.setOffline(false);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  async function touch(page) {
    const cdp = await page.context().newCDPSession(page);
    const box = await page.getByTestId('pad').boundingBox();
    const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), id: 1 };
    return {
      at,
      start: (point = at) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }),
      end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    };
  }

  test('touch and hold to start, touch anywhere to stop; no accidental start, no scroll', async ({ page }) => {
    await open(page, 'seed=12', { settings: INSPECTION_OFF });
    const playerPlay = page.locator('.tm-preview-tools [data-sequence="play"]');
    await playerPlay.tap();
    await expect(root(page)).toHaveAttribute('data-phase', 'idle');
    await expect(page.locator('.tm-preview-tools')).toHaveAttribute('data-sequence-playing', 'true');
    await playerPlay.tap();
    await expect(page.locator('.tm-preview-tools')).toHaveAttribute('data-sequence-playing', 'false');
    await page.reload();
    await page.waitForSelector('html[data-timer-ready]');
    await expect(page.locator('.tm-scramble')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('button[data-action="hold"]').click();
    await expect(page.locator('button[data-action="hold"]')).toHaveText('hold 550');
    const finger = await touch(page);

    // A quick tap does not start.
    await finger.start(); await page.waitForTimeout(80); await finger.end();
    await expect(root(page)).toHaveAttribute('data-phase', 'idle');

    // A tap outside the timer area does not start either.
    await finger.start({ x: 195, y: 20, id: 1 }); await page.waitForTimeout(400); await finger.end();
    await expect(root(page)).toHaveAttribute('data-phase', 'idle');

    // Hold: ready after 300 ms, release starts the solve.
    await finger.start();
    await expect(root(page)).toHaveAttribute('data-hold', 'ready', { timeout: 1500 });
    await expect(page.getByRole('button', { name: 'stats · manual solves' })).toBeHidden();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-orbit-dark-ready.png` });
    await finger.end();
    await expect(root(page)).toHaveAttribute('data-phase', 'running');
    await page.waitForTimeout(600);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-orbit-dark-running.png` });

    // A touch anywhere stops it; the release that follows does not start another.
    await finger.start({ x: 40, y: 700, id: 1 });
    await expect(root(page)).toHaveAttribute('data-phase', 'done');
    await finger.end();
    await page.waitForTimeout(100);
    await expect(root(page)).toHaveAttribute('data-phase', 'done');
    await expect(time(page)).toHaveText(/^\d+\.\d\d$/);
    const saved = await records(page);
    expect(saved).toHaveLength(13);
    expect(saved.at(-1)).toMatchObject({ source: 'manual' });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-orbit-dark-done.png` });

    // The touch buttons edit the last solve.
    await page.getByRole('button', { name: 'dnf' }).tap();
    await expect(time(page)).toHaveText(/^DNF\(\d+\.\d\d\)$/);
  });
});

test.describe('screenshots', () => {
  test.skip(!SHOTS, 'set TIMER_SHOTS=1');
  for (const [style, theme] of [['orbit', 'dark'], ['orbit', 'light'], ['mono', 'dark'], ['mono', 'light']]) {
    test(`${style}-${theme}`, async ({ page }) => {
      await open(page, `style=${style}&theme=${theme}&seed=30`);
      await page.screenshot({ path: `${SHOTS}/${style}-${theme}-idle.png` });
      await holdSpace(page);
      await page.waitForTimeout(3100);
      await page.screenshot({ path: `${SHOTS}/${style}-${theme}-inspection.png` });
      await holdSpace(page);
      await page.waitForTimeout(1234);
      await page.keyboard.press('x');
      await page.keyboard.press('2');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/${style}-${theme}-done.png` });
    });
  }
});

test.describe('phone screenshot matrix', () => {
  test.skip(!SHOTS, 'set TIMER_SHOTS=1');
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('Orbit and Mono in dark and light', async ({ page }) => {
    for (const [style, theme] of [['orbit', 'dark'], ['orbit', 'light'], ['mono', 'dark'], ['mono', 'light']]) {
      await open(page, `style=${style}&theme=${theme}&seed=30`);
      await expect(page.locator('.tm-preview canvas')).toHaveCount(1);
      await page.screenshot({ path: `${SHOTS}/${style}-${theme}-phone-idle.png` });
    }
  });
});
