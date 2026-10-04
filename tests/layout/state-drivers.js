import { expect } from 'playwright/test';
import { registerLayoutDriver } from './matrix.js';
import { HISTORY_SEED, quickRoundSeed } from './fixtures/state-seeds.js';
import { CROWDED_MARKERS, validateCrowdedMarkerFixture } from './fixtures/crowded-markers.js';
import { mountFakeCube, startScramble, completeScramble, solveReverse } from './fake-cube.js';
import { mountTestBrain, playSolve } from '../helpers/fake-brain.js';
import { GOLD } from '../analysis-golden.mjs';
import { seedGoalProgressState } from '../helpers/goal-progress-state.js';
import { selectOrbitMarker } from '../helpers/orbit-markers.js';
import { registerF1OrbitFixture } from './f1-orbit-fixture.js';

const SCRAMBLE = "R2 D' F2 U B2 L' U2 F";
const BRAIN = '#brain-view';

async function readyForRoute(page, path, { clockInstalled = false } = {}) {
  await page.goto(`/#${path}`);
  await page.waitForFunction(hash => location.hash === hash, `#${path}`);
  if (!clockInstalled) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

registerLayoutDriver('main-page', async page => readyForRoute(page, '/solve'));

registerLayoutDriver('demo-fixture', async (page, { fixture, clockInstalled }) => {
  await readyForRoute(page, fixture.route, { clockInstalled });
  await expect(page.locator('#demo-view .demo-cube canvas')).toBeVisible();
  await page.locator('#demo-view [data-action="next-move"]').click();
  if (clockInstalled) await page.clock.runFor(1_000);
  await expect(page.locator('#demo-view .demo-move-description')).toContainText('Move 2');
});

registerLayoutDriver('fake-cube', async (page, { id, clockInstalled }) => {
  await mountFakeCube(page, { delayed: id === 'connecting' });
  if (id === 'connecting') return;
  if (id === 'idle') return;
  const scramble = await startScramble(page, SCRAMBLE);
  if (id === 'guided-scramble') return;
  if (id === 'wrong-turn') {
    await page.evaluate(() => window.testBrain.emitTurns("R2 D' L"));
    await expect(page.locator(`${BRAIN} .orbit__segment.is-wrong[data-key^=undo-]`).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.testBrain.handle.getViewModel().scramble.recovery?.length ?? 0)).toBeGreaterThan(0);
    return;
  }
  if (id === 'inspection' || id === 'inspection-overtime' || id === 'solving' || id === 'results') {
  await completeScramble(page, scramble);
    await expect(page.locator('#brain-phase-label')).toContainText('inspection');
    if (id === 'inspection-overtime') {
      if (!clockInstalled) await page.clock.install();
      await page.evaluate(() => { if (window.__cubesightSnapshotReplayClock) window.__cubesightSnapshotReplayClock.ms += 16000; });
      await page.clock.fastForward(16_000);
    } else if (id === 'solving') {
      await page.evaluate(() => window.testBrain.emitTurns("F'"));
    if (await page.evaluate(() => Boolean(window.__cubesightSnapshotReplayClock))) {
      await page.evaluate(() => { window.__cubesightSnapshotReplayClock.ms += 1200; });
      await page.waitForFunction(() => document.querySelector('#brain-view .b-clock')?.textContent === '1.20');
    }
    } else if (id === 'results') {
      await solveReverse(page, scramble);
      await expect(page.locator('#brain-phase-label')).toHaveText(/solved/i);
    }
    return;
  }
  throw new Error(`unknown fake-cube layout state: ${id}`);
});

registerLayoutDriver('fake-cube-settings', async page => {
  await mountFakeCube(page);
  const summary = page.locator('.b-settings > summary').first();
  if (await summary.count()) await summary.click();
  else {
    const toggle = page.locator('[data-open-settings], [aria-label*="settings" i]').first();
    if (!(await toggle.count())) throw new Error('settings drawer has no opening control');
    await toggle.click();
  }
  await expect.poll(() => page.evaluate(() => window.testBrain?.handle?.getViewModel()?.settings?.open)).toBe(true);
});

registerLayoutDriver('fake-cube-debug', async page => {
  await mountFakeCube(page);
  await page.locator('.brain-pill-setup > summary').click();
  await page.locator('#brain-debug-toggle').click();
  await expect(page.locator('#brain-debug')).toBeVisible();
});

registerLayoutDriver('connection-menu-fixture', async page => {
  await readyForRoute(page, '/solve');
  const control = page.locator('.site-header button[data-global-cube-control], .site-header [role="button"][data-global-cube-control], .site-header button[aria-label*="cube" i], .site-header button[aria-label*="GAN" i]').first();
  if (!(await control.count())) throw new Error('F0 global cube connection control is missing');
  await control.click();
  const menu = page.locator('[data-global-cube-menu], [role="menu"], [role="dialog"][aria-label*="cube" i]').first();
  if (!(await menu.count())) throw new Error('global cube control did not expose its menu');
});

registerLayoutDriver('review-fixture', async page => {
  await mountTestBrain(page, 'orbit', { route: true });
  await playSolve(page, GOLD.normal.scramble, GOLD.normal.moves, { brain: BRAIN, base: 1 });
  await expect.poll(() => page.evaluate(() => window.testBrain.handle.getViewModel().results?.review?.markers?.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
  const id = await page.evaluate(() => window.testBrain.handle.getViewModel().results.review.markers[0].id);
  await selectOrbitMarker(page.locator(BRAIN), id);
  await expect(page.locator(`${BRAIN} .b-rev-detail`)).toBeVisible();
});

registerLayoutDriver('recording-fixture', async page => {
  await page.addInitScript(record => localStorage.setItem('cubesight-solves-v1', JSON.stringify(record)), HISTORY_SEED);
  await readyForRoute(page, '/history/1000000/replay');
  await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot?.getViewModel()?.viewModel?.selected?.at)).toBe(1000000);
  await expect(page.locator('.history-stage__orbit .orbit'), 'the replay Orbit is the visible scrub control').toBeVisible();
  const midpoint = Math.floor(HISTORY_SEED.records[0].solveMoves.length / 2);
  for (let index = 0; index < midpoint; index++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.selected.move)).toBe(midpoint);
});

registerLayoutDriver('drill-fixture', async (page, { fixedNow } = {}) => {
  await page.addInitScript(seed => localStorage.setItem('cubesight-shell-v1', JSON.stringify(seed)), quickRoundSeed('corners', fixedNow ?? Date.now()));
  await readyForRoute(page, '/drills/corners');
  await expect(page.locator('.quick-round')).toContainText('1 cases left');
});

registerLayoutDriver('alg-fixture', async (page, { fixture }) => {
  await readyForRoute(page, fixture.route);
  const sequence = page.locator('[data-case-sequence]');
  await expect(sequence.locator('[data-sequence="play"]')).toBeVisible();
  await sequence.locator('[data-sequence="next"]').click();
  await expect.poll(() => sequence.getAttribute('data-case-sequence-index')).toBe('1');
});

registerLayoutDriver('manual-timer', async (page, { id, fixture, clockInstalled, clockTime }) => {
  await readyForRoute(page, '/timer', { clockInstalled });
  await expect(page.locator('.tm-scramble')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  if (!clockInstalled) await page.clock.install();
  await page.clock.pauseAt(clockTime ? new Date(new Date(clockTime).getTime() + 60000) : await page.evaluate(() => new Date(Date.now() + 1000)));
  await page.evaluate(() => { window.__cubesightSnapshotClockPaused = true; });
  const startHold = async () => {
    await page.keyboard.down(' ');
    await page.clock.fastForward(350);
    await page.keyboard.up(' ');
  };
  await startHold();
  if (id === 'timer-inspection') {
    await expect(page.locator('.tm')).toHaveAttribute('data-phase', fixture.phase);
    return;
  }
  await startHold();
  if (id === 'timer-running') {
    await expect(page.locator('.tm')).toHaveAttribute('data-phase', fixture.phase);
    return;
  }
  await page.clock.fastForward(1500);
  await page.keyboard.press('x');
  await expect(page.locator('.tm')).toHaveAttribute('data-phase', fixture.phase);
});

registerLayoutDriver('goal-progress-fixture', async (page, { fixture, fixedNow }) => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  seedGoalProgressState(storage, { state: fixture.goalState, now: fixedNow ?? Date.now() });
  await page.addInitScript(entries => { for (const [key, value] of entries) localStorage.setItem(key, value); }, [...values]);
  await readyForRoute(page, '/progress');
  await expect(page.locator('.progress-page')).toHaveAttribute('data-ready', 'true');
  const view = page.getByRole('combobox', { name: 'view', exact: true });
  if (!(await view.innerText()).includes('ao12 goal')) {
    await view.click(); await page.getByRole('option', { name: 'ao12 goal', exact: true }).click();
  }
});

registerLayoutDriver('case-colour-fixture', async (page, { fixture }) => {
  await readyForRoute(page, fixture.route);
  await page.locator('#algs-view .alg-detail').waitFor({ state: 'visible' });
  const cycle = page.locator('[data-case-colors]:visible, [data-case-colours]:visible').first();
  if (await cycle.count()) {
    await expect(cycle).toBeVisible();
    for (let i = 0; i < 8 && !(await cycle.innerText()).includes(fixture.colour); i++) await cycle.click();
    await expect(cycle).toContainText(fixture.colour);
    await expect.poll(() => page.evaluate(async () => (await import('/src/ui/cube/case-color.js')).readCaseColorSetting(localStorage))).toBe(fixture.colour);
    return;
  }
  const select = page.locator('select[aria-label*="case colour" i]:visible, select[aria-label*="case color" i]:visible').first();
  if (!(await select.count())) throw new Error(`F4 visible case-colour control is missing (${fixture.colour})`);
  await select.selectOption({ label: fixture.colour });
});

registerLayoutDriver('orbit-fixture', async page => {
  const fixture = validateCrowdedMarkerFixture();
  expect(fixture.count).toBeGreaterThanOrEqual(12);
  await readyForRoute(page, '/solve');
  const result = await page.evaluate(async markers => {
    let module;
    try { module = await import('/src/ui/orbit/index.js'); }
    catch { return { available: false, reason: 'shared Orbit module has not landed yet' }; }
    const host = document.createElement('section');
    host.dataset.crowdedMarkerFixture = 'true';
    host.style.cssText = 'position:fixed;z-index:10000;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,95vw);height:min(620px,80vh);background:#101820';
    document.body.append(host);
    const options = {
      shape: 'open', gap: 70, size: 'XL', direction: 'clockwise',
      segments: [{ key: 'solve', weight: 1, state: 'current', label: 'solve' }],
      markers,
      onMarkerCluster: cluster => { window.__f8ExpandedCluster = cluster; },
    };
    try { window.__f8CrowdedOrbit = module.Orbit(host, options); }
    catch { window.__f8CrowdedOrbit = new module.Orbit(host, options); }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const labels = [...host.querySelectorAll('.orbit__label')]
      .map(el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() }))
      .filter(item => item.rect.width && item.rect.height);
    const cluster = [...host.querySelectorAll('[data-marker-keys]')].find(node => JSON.parse(node.dataset.markerKeys).length >= 3);
    const clusterCount = cluster ? Number(cluster.querySelector('.orbit__marker-count')?.textContent ?? 0) : 0;
    const keyboardOperable = Boolean(cluster && (cluster.tabIndex >= 0 || cluster.matches('button,[role="button"]')));
    if (cluster && keyboardOperable) {
      cluster.focus();
      cluster.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const expandedCount = Array.isArray(window.__f8ExpandedCluster) ? window.__f8ExpandedCluster.length : 0;
    const expandedText = host.innerText;
    const preservesMarkerFacts = markers.slice(0, 4).every(marker => expandedText.includes(marker.label.split(' · ').at(-1)));
    return { available: true, labels, markerInput: markers.length, svgCount: host.querySelectorAll('svg').length, clusterCount, keyboardOperable, expandedCount, preservesMarkerFacts };
  }, CROWDED_MARKERS);
  expect(result.available, result.reason).toBe(true);
  expect(result.markerInput).toBeGreaterThanOrEqual(12);
  expect(result.svgCount).toBeGreaterThan(0);
  expect(result.clusterCount, 'close markers must appear in a counted cluster badge').toBeGreaterThanOrEqual(3);
  expect(result.keyboardOperable, 'cluster badge must accept keyboard focus/activation').toBe(true);
  expect(result.expandedCount, 'activating a cluster must expose its markers').toBeGreaterThanOrEqual(2);
  expect(result.preservesMarkerFacts, 'expanded cluster must preserve marker key/time details').toBe(true);
  for (let i = 0; i < result.labels.length; i++) for (let j = i + 1; j < result.labels.length; j++) {
    const a = result.labels[i].rect, b = result.labels[j].rect;
    const overlap = a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
    expect(overlap, `${result.labels[i].text} overlaps ${result.labels[j].text}`).toBe(false);
  }
});

registerF1OrbitFixture(registerLayoutDriver);
