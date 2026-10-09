import { test, expect, beginCoverage } from './helpers/coverage-test.js';
import { visualCell } from './helpers/seed-solve.js';
import { mkdir } from 'node:fs/promises';

async function allCaseLinks(page) {
  const links = new Set();
  for (;;) {
    await page.locator('.alg-case-grid').waitFor();
    for (const href of await page.locator('.alg-case-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) links.add(href);
    const next = page.getByRole('link', { name: 'next ›', exact: true });
    if (!(await next.count())) break;
    const target = await next.getAttribute('href');
    const targetPage = new URLSearchParams(target.split('?')[1]).get('page');
    await next.click();
    await expect(page.locator('.alg-pagination')).toContainText(` · ${targetPage} of `);
  }
  return links;
}

test('curated OLL case page shows verified sources, setup repaint, picked alg and no-cube drill', async ({ page }) => {
  await page.goto('/#/algs/oll');
  expect((await allCaseLinks(page)).size).toBe(57);
  await page.goto('/#/algs/oll');
  await page.locator('#algs-view .alg-case-card').first().click();
  await expect(page).toHaveURL(/#\/algs\/oll\/1$/);
  await expect(page.getByRole('heading', { name: 'Runway, Blank' })).toBeVisible();
  await expect(page.locator('[data-alg-cube] canvas')).toBeVisible();
  await expect(page.locator('.alg-entry')).toHaveCount(2);
  await expect(page.locator('.alg-entry a').first()).toHaveAttribute('href', /speedsolving\.com/);
  await page.locator('[data-pick]').last().click();
  await expect(page.locator('.alg-entry.is-picked')).toHaveCount(1);
  await page.getByRole('button', { name: 'drill alg', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(20);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-drill-result]')).toContainText('Recorded');
});

test('case drill deep link is preserved and opens the requested case', async ({ page }) => {
  await page.goto('/#/algs/pll/Jb/drill');
  await expect(page).toHaveURL(/#\/algs\/pll\/Jb\/drill$/);
  // exact: the open drill panel's own heading is "Jb · Algorithm 1"
  await expect(page.getByRole('heading', { name: 'Jb', exact: true })).toBeVisible();
  await expect(page.locator('[data-drill]')).toBeVisible();
  await expect(page.locator('[data-timer]')).toBeVisible();
});

test('changing to a different algorithm case resets scroll to the page top', async ({ page }) => {
  // The case and drill now fit a 1280x900 window without scrolling, so use a window short enough for the page to scroll.
  await page.setViewportSize({ width: 1280, height: 480 });
  // Opening the drill smooth-scrolls its panel into view (algs/page.js); that animation outlived the scroll this test
  // sets up and left the page part-way down. Reduced motion skips it, so the reset to the top is all that is measured.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/algs/oll/1/drill');
  await expect(page.locator('[data-drill]')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => { location.hash = '#/algs/oll/2'; });
  await expect(page.getByRole('heading', { name: 'Zamboni' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('algorithm drill labels, move counts, theme contrast, and touch targets stay readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const style of ['orbit', 'mono']) {
    await page.addInitScript(style => localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style })), style);
    await page.goto('/#/algs/oll');
    for (const theme of ['light', 'dark']) {
    await visualCell(page, { width: 390, height: 844, theme });
    await page.evaluate(() => { location.hash = '#/algs/oll'; });
    await page.locator('.alg-case-grid').waitFor();
    const radius = await page.locator('.alg-case-card').first().evaluate(node => getComputedStyle(node).borderRadius);
    expect(radius).toBe('0px'); // Approved open rows replace framed cards in both styles.
    await page.locator('.alg-case-card').first().click();
    const firstAlg = page.locator('.alg-entry').first();
    await expect(firstAlg).toContainText('11 moves');
    const sourceLink = page.locator('.alg-entry a').first();
    expect(await sourceLink.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await firstAlg.getByRole('button', { name: 'Drill' }).click();
    const drill = page.locator('[data-drill]');
    await expect(drill.getByRole('heading', { name: 'Runway, Blank · Algorithm 1' })).toBeVisible();
    await expect(drill).not.toContainText('s.oll.1.1');
    const start = drill.locator('[data-action="drill-start"]');
    expect(await start.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const colors = await start.evaluate(node => {
      const style = getComputedStyle(node);
      return [style.color, style.backgroundColor];
    });
    expect(colors[0]).not.toBe(colors[1]);
    await page.evaluate(() => { location.hash = '#/algs/oll'; });
    await page.locator('.alg-case-grid').waitFor();
    const tab = page.locator('.alg-set-tabs a.is-active');
    expect(await tab.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/algs/oll');
  const card = page.locator('.alg-case-card').first();
  await card.hover();
  expect(await card.evaluate(node => getComputedStyle(node).transform)).toBe('none');
});

test('all standard F2L cases, back-slot variants and staged two-look routes are functional', async ({ page }) => {
  await page.goto('/#/algs/f2l');
  expect((await allCaseLinks(page)).size).toBe(41);
  await page.goto('/#/algs/f2l'+(page.url().includes('slot=BR')?'?slot=BR':''));
  await page.locator('.alg-browser__scope > summary').click();
  await expect(page.locator('#algs-view')).toContainText('All 41 standard F2L cases');
  await page.locator('#algs-view .alg-case-card').first().click();
  await expect(page.locator('.alg-case-note')).toContainText('physical setup');
  await page.locator('[data-action="start-case-drill"]').click();
  await expect(page.locator('[data-drill]')).toContainText('self-timed round');
  await expect(page.locator('[data-action="start-cube-drill"]')).toBeDisabled();
  await page.goto('/#/algs/f2l');
  await page.getByRole('navigation', { name: 'F2L slot' }).getByRole('link', { name: 'back right', exact: true }).click();
  expect((await allCaseLinks(page)).size).toBe(41);
  await page.goto('/#/algs/f2l'+(page.url().includes('slot=BR')?'?slot=BR':''));
  await page.locator('#algs-view .alg-case-card').first().click();
  await expect(page).toHaveURL(/#\/algs\/f2l\/1-br$/);
  await expect(page.locator('.alg-case-head')).toContainText('Target: BR');
  await expect(page.locator('[data-alg-cube] canvas')).toHaveCount(1);
  await page.goto('/#/algs/oll2');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(16);
  await page.goto('/#/algs/oll2/eo-line');
  await expect(page.getByRole('heading', { name: 'EO · Line' })).toBeVisible();
  await expect(page.locator('.alg-case-head')).toContainText('All four last-layer edges oriented');
});

test('algorithm case screens render across Orbit/Mono and light/dark at desktop and mobile widths', async ({ browser }, testInfo) => {
  await mkdir('test-results/review-next-2-player', { recursive: true });
  test.setTimeout(60_000);
  for (const style of ['orbit', 'mono']) {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce',
    });
    try {
      await context.addInitScript(([preferredStyle, preferredTheme]) => {
        localStorage.setItem('cubesight-theme', preferredTheme);
        localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: preferredStyle }));
      }, [style, 'light']);
      const page = await context.newPage();
      const finishCoverage = await beginCoverage(page, testInfo);
      try {
        await page.goto('/#/algs/oll/1');
        await page.locator('.alg-entry.is-picked').waitFor();
        for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
          await visualCell(page, { width, height: width === 390 ? 844 : 900, theme });
          const screen = page.locator('#algs-view .alg-detail');
          await expect(screen).toBeVisible();
          await expect(page.locator('#algs-view .alg-page')).toHaveAttribute('data-brain-style', style);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(page.locator('.alg-cube-card')).toBeVisible();
          await expect(page.locator('[data-alg-cube] canvas')).toHaveCount(1);
          const cubeWidth = await page.locator('[data-alg-cube] canvas').evaluate(node => node.getBoundingClientRect().width);
          expect(cubeWidth).toBeGreaterThanOrEqual(width === 390 ? 190 : 240);
          const [ringBox, cubeBox] = await Promise.all([page.locator('.alg-case-orbit').boundingBox(), page.locator('[data-alg-cube] canvas').boundingBox()]);
          expect(Math.abs(ringBox.x + ringBox.width / 2 - cubeBox.x - cubeBox.width / 2)).toBeLessThan(4);
          expect(Math.abs(ringBox.y + ringBox.height / 2 - cubeBox.y - cubeBox.height / 2)).toBeLessThan(4);
          // F4 puts move-group names on the case Orbit, not in a second legacy strip.
          await expect(page.locator('.alg-case-orbit .orbit__label-name').filter({ hasText: 'sledgehammer' })).toBeVisible();
          const orbitLabels = await page.locator('.alg-case-orbit .orbit__label-name').allTextContents();
          expect(orbitLabels).toContain('sledgehammer');
          expect(orbitLabels.join(' ')).not.toMatch(/[−-]0\.00|\d+–\d+\s*[−-]/);
          await expect(page.locator('.alg-entry-grid .alg-entry')).toHaveCount(2);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
          await page.screenshot({ path: `test-results/review-next-2-player/algs-case-${style}-${theme}-${width}.png`, fullPage: true });
        }
      } finally {
        await finishCoverage();
      }
    } finally {
      await context.close();
    }
  }
});

test('a verified personal algorithm can be drilled and its self-timed PB is stored', async ({ page }) => {
  await page.goto('/#/algs/oll/45');
  const moves = await page.locator('.alg-entry code').first().textContent();
  await page.locator('.alg-add-own summary').click();
  await page.locator('[data-new-alg]').fill(moves.replaceAll('′', "'"));
  await page.locator('[data-action="save-alg"]').click();
  await expect(page.locator('[data-own-alg-status]')).toHaveText('Verified and saved.');
  const personal = page.locator('[data-personal-algs] [data-drill-alg]').first();
  await personal.click();
  await expect(page.locator('[data-drill]')).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(20);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-drill-result]')).toContainText('PB (all-time)');
  const attemptCount = await page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open('cubesight-algs', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction(['attempts'], 'readonly');
      const count = tx.objectStore('attempts').count();
      count.onsuccess = () => resolve(count.result);
    };
  }));
  expect(attemptCount).toBeGreaterThan(0);
});

test('case playback changes algorithms without remounting its cube and reaches the exact indexed state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/algs/oll/1');
  const canvas = page.locator('#algs-view [data-alg-cube] canvas');
  await expect(canvas).toHaveCount(1);
  const sequence = page.locator('[data-case-sequence]');
  await expect(sequence.locator('[data-sequence="play"]')).toBeVisible();
  await expect(sequence.locator('.mg-strip i')).toHaveCount(11);

  await page.locator('.alg-entry [data-pick]').last().click();
  await expect(page.locator('.alg-entry.is-picked')).toHaveCount(1);
  await expect(canvas).toHaveCount(1);
  await expect.poll(() => sequence.getAttribute('data-case-sequence-index')).toBe('0');
  const selectedMoveCount = await sequence.locator('.mg-strip i').count();
  expect(selectedMoveCount).toBeGreaterThan(0);
  await sequence.locator('[data-sequence="next"]').click();
  await expect.poll(() => sequence.getAttribute('data-case-sequence-index')).toBe('1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sequence.locator('[data-sequence="play"]').click();
  await expect(sequence.locator('[data-sequence-position]')).toHaveText(`${selectedMoveCount} / ${selectedMoveCount}`);
  await expect(canvas).toHaveCount(1);
});

test('sequence playback ends at the exact physical model state for the selected alg', async ({ page }) => {
  await page.goto('/#/algs/oll/1');
  const result = await page.evaluate(async () => {
    const [{ createSequencePlayer }, { getCase }, { caseSetupState }, cube, parser] = await Promise.all([
      import('/src/moves/sequence-player.js'), import('/src/algs/seed/cases.js'), import('/src/algs/drill/cube.js'),
      import('/src/cross-cube.js'), import('/src/review/import-parser.js'),
    ]);
    const row = getCase('oll/1'), alg = row.algs[0], startState = caseSetupState(row);
    const moves = parser.physicalModelTokens(parser.tokenizeReconstruction(alg.moves).tokens);
    const expected = cube.applyMoves(startState, moves);
    const host = document.createElement('div');
    const pageRoot = document.createElement('section'); pageRoot.className = 'brain'; pageRoot.dataset.brainStyle = 'orbit';
    pageRoot.append(host); document.body.append(pageRoot);
    const cubeView = { update() {}, animateMove: async () => {}, clearCue() {} };
    const player = createSequencePlayer(host, { cube3d: cubeView, startState, moves: alg.moves });
    await player.play();
    const snapshot = player.getSnapshot();
    const same = snapshot.state.cubies.every(actual => {
      const wanted = expected.cubies.find(item => item.id === actual.id);
      return wanted && actual.position.every((value, index) => value === wanted.position[index])
        && Object.entries(actual.stickers).every(([face, color]) => wanted.stickers[face] === color);
    });
    const report = { same, index: snapshot.index, moveCount: snapshot.moves.length };
    player.destroy(); pageRoot.remove(); return report;
  });
  expect(result).toEqual({ same: true, index: 11, moveCount: 11 });
});

test('a completed no-cube attempt plays its chosen alg on the same cube', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/algs/oll/1');
  const canvas = page.locator('#algs-view [data-alg-cube] canvas');
  await expect(canvas).toHaveCount(1);
  await page.getByRole('button', { name: 'drill alg', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(20);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(async () => page.locator('[data-case-sequence] [data-sequence-position]').textContent(), { timeout: 8_000 }).toMatch(/^(\d+) \/ \1$/);
  await expect(page.locator('[data-drill-result]')).toContainText('Recorded');
  await expect(canvas).toHaveCount(1);
});
