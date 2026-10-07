import { test, expect } from 'playwright/test';
import { ROUTES, getLayoutDriver, STATE_FIXTURES } from './matrix.js';
import { inspectLayout } from './invariants.js';
import { HISTORY_SEED } from './fixtures/state-seeds.js';
import './state-drivers.js';

// The phone half of the layout rules, run on the phones the product is used on (320 x 568, 360 x 740, 390 x 844), every route and the
// states a person actually reaches on one: nothing scrolls or sticks out sideways, every control is a 40 x 40 target, no text is clipped,
// and the Cube and the Orbit are on screen at rest. They are the same invariants as the full layout matrix (tests/layout/invariants.js),
// narrowed to the phone sizes and the findings that are about fitting, so this runs in seconds and fails on its own.

const PHONES = [[320, 568], [360, 740], [390, 844]];
const FIT_KINDS = new Set(['horizontal-scroll', 'horizontal-scroll-position', 'offscreen-x', 'scroller-offscreen', 'small-touch-target', 'clipped-text', 'sticky-scroll']);
// KNOWN, separate defect (not a phone-fit one): the linked coach line's connector is drawn in a display:contents box, so its path
// has coordinates in the tens of thousands. It is invisible and does not scroll the page; it is reported by the full layout matrix.
const KNOWN = [/ui-coach-line__connector/];

const ROUTE_IDS = ['solve', 'drills', 'corners', 'pll-drill', 'f2l', 'cross-planning', 'oll-drill', 'lookahead', 'algs', 'alg-case-pll', 'alg-case-f2l', 'alg-drill',
  'help', 'recording', 'progress', 'history', 'past-solve', 'replay', 'review-detail', 'review-import', 'timer'];
const STATE_IDS = ['idle', 'guided-scramble', 'wrong-turn', 'inspection', 'solving', 'results', 'debug-open', 'review-detail', 'f1-live-results',
  'f1-marker-detail', 'goal-reached', 'replay-midway'];
const NO_CANVAS = new Set(['algs', 'help', 'review-import', 'recording']);

const describe = report => report.errors.filter(error => FIT_KINDS.has(error.kind) && !KNOWN.some(pattern => pattern.test(error.selector)))
  .map(error => `${error.kind}: ${error.selector} ${JSON.stringify(error.box)} ${error.detail}`);

// Lazy chunks (the solve skin, the Orbit's first draw before its host has a size) land within a few hundred ms: measure the settled page.
async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.waitForTimeout(500);
}

for (const id of ROUTE_IDS) {
  const route = ROUTES.find(item => item.id === id);
  test(`phone fit · route ${id}`, async ({ page }) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(10_000);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(history => {
      localStorage.setItem('cubesight-theme', 'dark');
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'orbit' }));
      localStorage.setItem('cubesight-solves-v1', JSON.stringify(history));
    }, HISTORY_SEED);
    const problems = [];
    for (const [width, height] of PHONES) {
      await page.setViewportSize({ width, height });
      await page.goto('about:blank');
      await page.goto(`/#${route.path}`);
      await page.locator('#app main').waitFor({ state: 'attached' });
      await settle(page);
      const report = await inspectLayout(page, { width, height, routeId: route.id, routeFamily: route.page, routePath: route.path, state: 'route-default', theme: 'dark', expectedCanvasCount: NO_CANVAS.has(id) || route.page === 'scroll' ? 0 : 1 });
      problems.push(...describe(report).map(text => `${width}x${height} ${text}`));
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

for (const id of STATE_IDS) {
  const fixture = STATE_FIXTURES.find(item => item.id === id);
  test(`phone fit · state ${id}`, async ({ page }) => {
    test.setTimeout(150_000);
    page.setDefaultTimeout(10_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await getLayoutDriver(fixture.driver)(page, { ...fixture, id: fixture.id, fixture });
    const problems = [];
    for (const [width, height] of PHONES) {
      await page.setViewportSize({ width, height });
      await settle(page);
      const family = fixture.route.startsWith('/history') ? 'history' : fixture.route.startsWith('/progress') ? 'progress' : 'solve';
      const report = await inspectLayout(page, { width, height, routeId: `state-${id}`, routeFamily: family, routePath: fixture.route, state: id, theme: 'dark', expectedCanvasCount: 1, expectDebugDrawer: id === 'debug-open' });
      problems.push(...describe(report).map(text => `${width}x${height} ${text}`));
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

// The legacy Mono skin is still shipped: its config bar and tabs wrap or fit, they never scroll the page sideways.
test('phone fit · solve in the Mono skin', async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('cubesight-theme', 'dark');
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'mono' }));
  });
  const problems = [];
  for (const [width, height] of PHONES) {
    await page.setViewportSize({ width, height });
    await page.goto('about:blank');
    await page.goto('/#/solve');
    await expect(page.locator('#brain-view .brain')).toHaveAttribute('data-brain-style', 'mono');
    await settle(page);
    const report = await inspectLayout(page, { width, height, routeId: 'solve-mono', routeFamily: 'solve', routePath: '/solve', state: 'idle', theme: 'dark-mono', expectedBrainStyle: 'mono', expectedCanvasCount: 1 });
    problems.push(...describe(report).map(text => `${width}x${height} ${text}`));
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
