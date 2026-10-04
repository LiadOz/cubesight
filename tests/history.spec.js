import { test, expect } from './helpers/coverage-test.js';

const records = [
  { at: 1000000, scramble: 'R U', solveMs: 12340, penalty: null, focus: 'speed', source: 'smart', solved: true, solveMoves: ["U'", "R'"], moveCount: 2 },
  { at: 1100000, scramble: 'F2', solveMs: 15000, penalty: '+2', focus: 'flow', source: 'manual', solved: true, solveMoves: ['R'], analysis: { v: 1, engine: 0, face: 'D', crossSource: 'default', solved: true, timed: true, marks: {}, pauses: [{ i: 0, ms: 2100, allow: 500, boundary: 'f2l-f2l' }] } },
];
async function seed(page, style = 'orbit') {
  await page.addInitScript(({ records: seeded, style: selectedStyle }) => {
    localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: seeded }));
    if (!localStorage.getItem('cubesight-brain-settings-v2')) localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: selectedStyle }));
  }, { records, style });
  await page.goto('/#/history');
  await expect(page.locator('.history-count')).toContainText('2 solves');
}

test('history filters, opens past solves, replays and edits stored records', async ({ page }) => {
  await seed(page);
  await page.locator('.history-data summary').click();
  await page.locator('select[name="statsSource"]').selectOption('manual');
  await expect(page.locator('.history-context')).toContainText('PB 17.00+');
  const rows = page.locator('.history-solve a');
  await expect(rows).toHaveCount(2);
  await page.locator('select[name="source"]').selectOption('manual');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(page).toHaveURL(/#\/history\/1100000$/);
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await expect(page.locator('.f1-results__history-nav')).toContainText('history');
  await expect(page.locator('.f1-results__actions a', { hasText: 'review' })).toHaveAttribute('href', '#/history/1100000/review/pause-0');
  await page.locator('.f1-results__actions a', { hasText: 'review' }).click();
  await expect(page).toHaveURL(/#\/history\/1100000\/review\/pause-0$/);
  await expect(page.locator('.b-rev-detail')).toBeVisible();
  await page.locator('.f1-results__actions [data-action="next"]').click();
  await expect(page).toHaveURL(/#\/history\/1100000\/replay$/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.history-stage__subline')).toContainText('move 1 of 1');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/history\/1100000$/);

  await page.goto('/#/history');
  await page.locator('.history-data summary').click();
  await expect(page.locator('select[name="statsSource"]')).toHaveValue('manual');
  await page.locator('select[name="source"]').selectOption('smart');
  await page.goto('/#/history/1000000/replay');
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await expect(page.locator('.history-timing-note')).toHaveText('timing not recorded');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.history-stage__subline')).toContainText('move 2 of 2');

  await page.goto('/#/history/1000000');
  await page.locator('.history-data summary').click();
  await page.locator('select[name="source"]').selectOption('all');
  await page.locator('.history-more > summary').click();
  await page.locator('[data-action="plus2"]').click();
  await expect(page.locator('.history-stage__number')).toHaveText('14.34+');
  await page.locator('.history-more > summary').click();
  await page.locator('[data-action="delete"]').click();
  await expect(page.locator('.history-count')).toContainText('1 solves');
  await page.locator('.history-solve a').first().click();
  await page.locator('.history-more > summary').click();
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('.history-count')).toContainText('2 solves');
  await page.reload();
  await expect(page.locator('select[name="statsSource"]')).toHaveValue('manual');
  await expect(page.locator('.history-count')).toContainText('2 solves');
});

for (const viewport of [
  { name: 'desktop dark', width: 1280, height: 900, theme: 'dark' },
  { name: 'desktop light', width: 1280, height: 900, theme: 'light' },
  { name: 'phone dark', width: 390, height: 844, theme: 'dark' },
  { name: 'phone light', width: 390, height: 844, theme: 'light' },
]) {
  test(`history list keeps the selected solve visible while rows scroll (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const longHistory = Array.from({ length: 24 }, (_, index) => ({
      at: 1700000000000 + index * 60_000,
      scramble: 'R U', solveMs: 12340 + index * 10, penalty: null,
      focus: 'speed', source: 'smart', solved: true, solveMoves: ["U'", "R'"], moveCount: 2,
    }));
    await page.addInitScript(({ records: seeded, theme }) => {
      localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: seeded }));
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'orbit' }));
      localStorage.setItem('cubesight-theme', theme);
    }, { records: longHistory, theme: viewport.theme });
    await page.goto('/#/history');

    const historyPage = page.locator('.history-page');
    const details = page.locator('.history-data');
    const stage = page.locator('.history-stage');
    const solveLinks = page.locator('.history-solve a');
    const list = page.locator('.history-list');
    const openSolve = page.getByRole('link', { name: 'open this solve' });
    await expect(historyPage).toHaveAttribute('data-view', 'list');
    await expect(page.locator('html')).toHaveAttribute('data-theme', viewport.theme);
    await expect(details).not.toHaveAttribute('open', '');
    await expect(solveLinks).toHaveCount(24);
    await expect(stage).toBeInViewport();
    await expect(stage.locator('.history-stage__cube canvas')).toBeVisible();
    await expect(solveLinks.first()).toBeInViewport();
    await expect(openSolve).toBeInViewport();

    for (const scroll of [0, 0.5, 1]) {
      await list.evaluate((node, fraction) => { node.scrollTop = (node.scrollHeight - node.clientHeight) * fraction; }, scroll);
      await page.evaluate(fraction => {
        const documentScroller = document.scrollingElement;
        documentScroller.scrollTop = (documentScroller.scrollHeight - documentScroller.clientHeight) * fraction;
      }, scroll);
      await page.waitForTimeout(50);
      const geometry = await page.evaluate(() => {
        const rect = node => {
          const { top, right, bottom, left } = node.getBoundingClientRect();
          return { top, right, bottom, left };
        };
        const viewport = { width: innerWidth, height: innerHeight };
        const header = rect(document.querySelector('.site-header'));
        const stage = rect(document.querySelector('.history-stage'));
        const list = rect(document.querySelector('.history-list'));
        const rows = [...document.querySelectorAll('.history-solve a')].map(rect)
          .filter(row => row.bottom > Math.max(header.bottom, list.top, 0) && row.top < Math.min(viewport.height, list.bottom));
        return { viewport, header, stage, list, rows };
      });
      expect(geometry.rows.length, `visible solve rows at scroll ${scroll}`).toBeGreaterThan(0);
      if (geometry.header.bottom > 0) expect(geometry.stage.top).toBeGreaterThanOrEqual(geometry.header.bottom - 1);
      expect(geometry.stage.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
      expect(geometry.rows.some(row => row.left < geometry.stage.right && row.right > geometry.stage.left
        && row.top < geometry.stage.bottom && row.bottom > geometry.stage.top)).toBe(false);
    }
    await page.evaluate(() => { document.scrollingElement.scrollTop = 0; document.querySelector('.history-list').scrollTop = 0; });
    const screen = viewport.name.startsWith('phone') ? '390' : '1280';
    await page.screenshot({ path: `test-results/F2-0${screen === '390' ? (viewport.theme === 'dark' ? 1 : 2) : (viewport.theme === 'dark' ? 3 : 4)}-history-${viewport.theme}-${screen}.png` });
  });
}

test('history imports csTimer atomically and exports it; gap setting persists', async ({ page }) => {
  await seed(page);
  await page.locator('.history-data summary').click();
  const data = { session1: [[[0, 21340], 'L U', '', 1200], [[-1, 22450], "L'", '', 1201]] };
  await page.locator('[data-import="cstimer"]').setInputFiles({ name: 'cstimer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator('.history-status')).toContainText('Imported 2 solves.');
  await expect(page.locator('.history-count')).toContainText('4 solves');
  await page.locator('[data-import="cstimer"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ session1: [[[99, 1], '', '', 1]] })) });
  await expect(page.locator('.history-status')).toContainText('No data was imported.');
  await expect(page.locator('.history-count')).toContainText('4 solves');
  await page.locator('[name="gap"]').fill('45');
  await page.locator('[name="gap"]').press('Tab');
  await expect(page.locator('.history-status')).toContainText('45 minutes');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'export csTimer', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('cstimer.json');
  await page.reload();
  await page.locator('.history-data summary').click();
  await expect(page.locator('[name="gap"]')).toHaveValue('45');
});

test('history releases its Cube canvas on cross-page navigation and remounts one on return', async ({ page }) => {
  await seed(page);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.goto('/#/timer');
  await expect(page.locator('#timer-view .tm-scramble')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveCount(1);

  await page.goto('/#/history/1000000/replay');
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('history and progress keep one document Cube canvas across route changes', async ({ page }) => {
  await seed(page);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.goto('/#/progress');
  await expect(page.locator('.progress-cube-mount canvas')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.goto('/#/history/1000000/replay');
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('history and algorithms keep one document Cube canvas across route changes', async ({ page }) => {
  await seed(page);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.goto('/#/algs');
  await expect(page.locator('.alg-case-card').first()).toBeVisible();
  const caseHref = await page.locator('.alg-case-card').first().getAttribute('href');
  await page.goto(`/${caseHref}`);
  await expect(page.locator('.alg-detail')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.goto('/#/history/1000000/replay');
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('history review playback ignores an older variant after rapid switching and leaving', async ({ page }) => {
  const record = {
    at: 1000000, scramble: 'R U R', solveMs: 12340, focus: 'speed', source: 'smart', solved: true,
    solveMoves: ['R', 'U', "R'"], moveCount: 3,
    analysis: {
      v: 2, engine: 0, face: 'D', crossSource: 'default', solved: true, timed: true, marks: { pairs: [2] },
      pairs: [{ n: 1, from: 0, to: 2, yours: 'R U R', better: { slot: 'FR', moves: 'U' } }],
    },
  };
  await page.addInitScript(value => localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: [value] })), record);
  await page.goto('/#/history/1000000/review/better-pair-1');
  await expect(page.locator('.b-rev-detail')).toBeVisible();
  const yours = page.locator('.b-rev-variant[data-variant="yours"]');
  const better = page.locator('.b-rev-variant[data-variant="better"]');
  await expect(better).toBeVisible();
  await yours.click();
  await better.click();
  await expect(better).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  await expect(better).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/history');
  await expect(page.locator('.history-page')).toHaveAttribute('data-view', 'list');
  await expect(page.locator('.history-results-host')).toBeHidden();
  await page.waitForTimeout(500);
  await expect(page.locator('.history-page')).toHaveAttribute('data-view', 'list');
  await page.goto('/#/history/1000000/review/better-pair-1');
  await expect(page.locator('.b-rev-detail')).toBeVisible();
  await page.locator('.b-rev-variant[data-variant="yours"]').click();
  await expect(page.locator('.b-rev-variant[data-variant="yours"]')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  await expect(page.locator('.b-rev-variant[data-variant="yours"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('mobile marker review keeps close, variant, and primary actions in the initial viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const record = {
    at: 1100000, scramble: 'R U R', scrambleTurns: ['R', 'U', 'R'], solveMs: 15000, penalty: '+2', focus: 'flow', source: 'manual', solved: true,
    solveMoves: ['R', 'U', "R'"], moveCount: 3,
    analysis: { v: 2, engine: 0, face: 'D', crossSource: 'default', solved: true, timed: true, marks: { pairs: [2] }, pairs: [{ n: 1, from: 0, to: 2, yours: 'R U R', better: { slot: 'FR', moves: 'U' } }] },
  };
  await page.addInitScript(value => localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: [value] })), record);
  await page.goto('/#/history/1100000/review/better-pair-1');
  const close = page.locator('.b-rev-close');
  const variants = page.locator('.b-rev-variant');
  const algorithms = page.locator('.b-rev-alg:visible');
  const primary = page.locator('.f1-results__actions [data-action="next"]');
  await expect(page.locator('.f1-results__history-nav')).toContainText('15.00 +2');
  await expect(close).toBeInViewport();
  await expect(variants).toHaveCount(2);
  await expect(variants.first()).toBeInViewport();
  await expect(variants.last()).toBeInViewport();
  await expect(algorithms).toHaveCount(2);
  await expect(algorithms.first()).toBeInViewport();
  await expect(algorithms.last()).toBeInViewport();
  await expect(primary).toBeInViewport();
  await expect(page).toHaveURL(/#\/history\/1100000\/review\/better-pair-1$/);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  for (const locator of [close, variants.first(), variants.last(), algorithms.first(), algorithms.last(), primary]) {
    expect(await locator.evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(844);
  }
});
