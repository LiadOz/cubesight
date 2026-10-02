import { test, expect } from './helpers/coverage-test.js';
import { mkdir } from 'node:fs/promises';

test('curated OLL case page shows verified sources, setup repaint, picked alg and no-cube drill', async ({ page }) => {
  await page.goto('/#/algs/oll');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(57);
  await page.locator('#algs-view .alg-case-card').first().click();
  await expect(page).toHaveURL(/#\/algs\/oll\/1$/);
  await expect(page.getByRole('heading', { name: 'Runway, Blank' })).toBeVisible();
  await expect(page.locator('[data-alg-cube] canvas')).toBeVisible();
  await expect(page.locator('.alg-entry')).toHaveCount(2);
  await expect(page.locator('.alg-entry a').first()).toHaveAttribute('href', /speedsolving\.com/);
  await page.locator('[data-pick]').last().click();
  await expect(page.locator('.alg-entry.is-picked')).toHaveCount(1);
  await page.getByRole('button', { name: 'Start no-cube drill' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(20);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-drill-result]')).toContainText('Recorded');
});

test('case drill deep link is preserved and opens the requested case', async ({ page }) => {
  await page.goto('/#/algs/pll/Jb/drill');
  await expect(page).toHaveURL(/#\/algs\/pll\/Jb\/drill$/);
  await expect(page.getByRole('heading', { name: 'Jb' })).toBeVisible();
  await expect(page.locator('[data-drill]')).toBeVisible();
  await expect(page.locator('[data-timer]')).toBeVisible();
});

test('changing to a different algorithm case resets scroll to the page top', async ({ page }) => {
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
  for (const style of ['orbit', 'mono']) for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate(([style, theme]) => {
      localStorage.setItem('cubesight-theme', theme);
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
    }, [style, theme]);
    await page.reload();
    await page.goto('/#/algs/oll');
    const radius = await page.locator('.alg-case-card').first().evaluate(node => getComputedStyle(node).borderRadius);
    expect(radius).toBe(style === 'mono' ? '8px' : '12px');
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
    await page.goto('/#/algs/oll');
    const tab = page.locator('.alg-set-tabs a.is-active');
    expect(await tab.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/algs/oll');
  const card = page.locator('.alg-case-card').first();
  await card.hover();
  expect(await card.evaluate(node => getComputedStyle(node).transform)).toBe('none');
});

test('all standard F2L cases, back-slot variants and staged two-look routes are functional', async ({ page }) => {
  await page.goto('/#/algs/f2l');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(41);
  await expect(page.locator('#algs-view')).toContainText('All 41 standard F2L cases');
  await page.locator('#algs-view .alg-case-card').first().click();
  await expect(page.locator('.alg-cube-card')).toContainText('Set up this F2L case on your cube before each round');
  await expect(page.locator('.alg-cube-card')).toContainText('do not use the no-reset virtual repaint flow');
  await page.goto('/#/algs/f2l');
  await page.getByRole('navigation', { name: 'F2L slot' }).getByRole('link', { name: 'back right', exact: true }).click();
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(41);
  await page.locator('#algs-view .alg-case-card').first().click();
  await expect(page).toHaveURL(/#\/algs\/f2l\/1-br$/);
  await expect(page.locator('.alg-detail__head')).toContainText('BR pair needs insertion');
  await expect(page.locator('[data-alg-cube] canvas')).toHaveCount(1);
  await page.goto('/#/algs/oll2');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(16);
  await page.goto('/#/algs/oll2/eo-line');
  await expect(page.getByRole('heading', { name: 'EO · Line' })).toBeVisible();
  await expect(page.locator('.alg-detail__head')).toContainText('All four last-layer edges oriented');
});

test('algorithm case screens render across Orbit/Mono and light/dark at desktop and mobile widths', async ({ page }) => {
  await mkdir('test-results/review-next-2-player', { recursive: true });
  for (const width of [1280, 390]) for (const style of ['orbit', 'mono']) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/');
    await page.evaluate(([style, theme]) => {
      localStorage.setItem('cubesight-theme', theme);
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
    }, [style, theme]);
    await page.reload();
    await page.goto('/#/algs/oll/1');
    const screen = page.locator('#algs-view .alg-detail');
    await expect(screen).toBeVisible();
    await expect(page.locator('#algs-view .alg-page')).toHaveAttribute('data-brain-style', style);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.alg-cube-card')).toBeVisible();
    await expect(page.locator('[data-alg-cube] canvas')).toHaveCount(1);
    const cubeWidth = await page.locator('[data-alg-cube] canvas').evaluate(node => node.getBoundingClientRect().width);
    expect(cubeWidth).toBeGreaterThanOrEqual(width === 390 ? 190 : 240);
    const playbackText = await page.locator('.alg-cube-card .sequence-progress').textContent();
    expect(playbackText).toContain('group');
    expect(playbackText).not.toMatch(/[−-]0\.00/);
    expect(playbackText).not.toMatch(/\d+–\d+\s*[−-]/);
    await expect(page.locator('.alg-entry-grid .alg-entry')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: `test-results/review-next-2-player/algs-case-${style}-${theme}-${width}.png`, fullPage: true });
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
  await page.getByRole('button', { name: 'Start no-cube drill' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(20);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(async () => page.locator('[data-case-sequence] [data-sequence-position]').textContent(), { timeout: 8_000 }).toMatch(/^(\d+) \/ \1$/);
  await expect(page.locator('[data-drill-result]')).toContainText('Recorded');
  await expect(canvas).toHaveCount(1);
});
