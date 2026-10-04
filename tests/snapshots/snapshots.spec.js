import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { FIXTURE_NAMES, brainFixtures } from '../../src/brain/fixtures.js';
import { getLayoutDriver, getLayoutMatrix } from '../layout/matrix.js';
import { HISTORY_SEED } from '../layout/fixtures/state-seeds.js';
import { SNAPSHOT_ROUTES, SNAPSHOT_STATES, SNAPSHOT_THEMES, SNAPSHOT_VIEWPORTS } from './capture-matrix.js';
import '../layout/state-drivers.js';

const FIXED_TIME = new Date('2026-01-15T12:00:00.000Z');
const FIXED_NOW = FIXED_TIME.getTime();
const MATRIX_ROUTES = getLayoutMatrix().routes;
const ROUTE_BY_ID = new Map(MATRIX_ROUTES.map(route => [route.id, route]));
const ROUTE_BY_PATH = new Map(MATRIX_ROUTES.map(route => [route.path, route]));
const EXPECTED_VIEW = {
  solve: '#brain-view', drills: '#drills-view', corners: '#corner-view', 'pll-drill': '#pll-view',
  f2l: '#f2l-view', 'cross-planning': '#scout-view', 'oll-drill': '#oll-view', lookahead: '#lookahead-view',
  algs: '#algs-view', 'alg-case-pll': '#algs-view', 'alg-case-oll': '#algs-view',
  'alg-case-oll2': '#algs-view', 'alg-case-f2l': '#algs-view', 'alg-drill': '#algs-view', history: '#history-view',
  'past-solve': '#history-view', replay: '#history-view', 'review-detail': '#history-view',
  progress: '#progress-view', timer: '#timer-view', recording: '#recording-view',
  demo: '#demo-view', 'demo-format': '#demo-view',
};
const FIXTURE_BY_ID = new Map(getLayoutMatrix().states.map(fixture => [fixture.id, fixture]));
if (SNAPSHOT_STATES.length !== FIXTURE_BY_ID.size) throw new Error('F9 must cover every registered F8 state fixture');
if (new Set(SNAPSHOT_STATES).size !== SNAPSHOT_STATES.length) throw new Error('F9 state captures cannot repeat a fixture ID');
const ROTATION_RECORDING = readFileSync(new URL('../fixtures/rotation-cross-recording.json', import.meta.url), 'utf8');
const SERVER_ORIGINS = new Set(['http://127.0.0.1:4174', 'http://127.0.0.1:4250']);

test.describe.configure({ mode: 'parallel' });

function slug(value) {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
}

function snapshotJsonValue(value, path = '$', seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    return { $number: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError(`${path} cannot contain cycles`);
    seen.add(value);
    const copy = value.map((item, index) => snapshotJsonValue(item, `${path}[${index}]`, seen));
    seen.delete(value);
    return copy;
  }
  if (typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${path} must contain only JSON-safe values`);
  }
  if (seen.has(value)) throw new TypeError(`${path} cannot contain cycles`);
  seen.add(value);
  const copy = {};
  for (const [key, item] of Object.entries(value)) copy[key] = snapshotJsonValue(item, `${path}.${key}`, seen);
  seen.delete(value);
  return copy;
}

async function installDeterminism(page, theme, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const configuredOrigin = new URL(test.info().project.use.baseURL).origin;
    return SERVER_ORIGINS.has(url.origin) || url.origin === configuredOrigin ? route.continue() : route.abort();
  });
  await page.addInitScript(({ themeMode, fixedNow }) => {
    if (!localStorage.getItem('cubesight-theme')) localStorage.setItem('cubesight-theme', themeMode);
    if (!localStorage.getItem('cubesight-brain-settings-v2')) localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'orbit' }));
    if (!localStorage.getItem('cubesight-solves-v1')) localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: [] }));
    let state = 0x51f15e ^ fixedNow;
    Math.random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
  }, { themeMode: theme, fixedNow: FIXED_NOW });
}

async function freezeTime(page, fixture) {
  const fakeClockDriver = fixture?.id === 'inspection-overtime'
    || fixture?.id === 'demo-playback-midway'
    || fixture?.driver === 'manual-timer';
  if (fakeClockDriver) await page.clock.install({ time: FIXED_TIME });
  else await page.clock.setFixedTime(FIXED_TIME);
  return fakeClockDriver;
}

async function applyThemeAndSettle(page, theme) {
  await page.evaluate(async themeMode => {
    const { setThemePreference } = await import('/src/theme.js');
    setThemePreference(themeMode);
  }, theme);
  await page.evaluate(() => document.fonts.ready);
  const loadedFonts = await page.evaluate(() => ({
    manrope: document.fonts.check('500 14px "Manrope Variable"', 'CubeSight'),
    dmMono: document.fonts.check('500 12px "DM Mono"', 'R U′ 12.34'),
  }));
  expect(loadedFonts.manrope, 'bundled Manrope face is available before capture').toBe(true);
  expect(loadedFonts.dmMono, 'bundled DM Mono face is available before capture').toBe(true);
  await page.addStyleTag({ content: `
    *,*::before,*::after {
      animation-delay: 0s !important;
      animation-duration: 0s !important;
      transition-delay: 0s !important;
      transition-duration: 0s !important;
      scroll-behavior: auto !important;
      caret-color: transparent !important;
    }
  ` });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function snapshotCell(page, cell) {
  const name = slug(`${cell.route}-${cell.state}-${cell.width}x${cell.height}-${cell.theme}`);
  await applyThemeAndSettle(page, cell.theme);
  const canvasCount = await page.locator('canvas').count();
  const expectedCanvasCount = cell.expectedCanvasCount ?? 1;
  expect(canvasCount, `${name} keeps ${expectedCanvasCount} page canvas(es)`).toBe(expectedCanvasCount);
  const cubeState = canvasCount ? await page.locator('canvas').first().evaluate(canvas => ({
    cameraPose: canvas.dataset.cameraPose || null,
    cameraUp: canvas.dataset.cameraUp || null,
    gyroPose: canvas.dataset.gyroPose || null,
    gyroTarget: canvas.dataset.gyroTarget || null,
  })) : null;
  if (cell.expectCube) {
    expect(cubeState.cameraPose, `${name} must keep the cube camera at its fixed pose`).toBe('6.7000,5.6000,7.7000');
    expect(cubeState.cameraUp, `${name} must keep the cube camera up vector at its fixed pose`).toBe('0.0000,1.0000,0.0000');
  }

  const snapshot = await page.evaluate(() => window.__cubesightSnapshot?.getViewModel?.() ?? null);
  expect(snapshot, `${cell.owner} must provide its active page snapshot for ${cell.route} · ${cell.state}`).toBeTruthy();
  expect(snapshot.schemaVersion).toBe(1);
  expect(snapshot.owner).toBe(cell.owner);
  expect(snapshot.dataOwner).toBe(cell.dataOwner ?? cell.owner);
  expect(snapshot).toHaveProperty('shared');
  expect(snapshot.shared, 'F0 shared shell model is included in every page snapshot').toBeTruthy();
  expect(snapshot.viewModel, `${cell.owner} returns the model consumed by the renderer`).toBeTruthy();
  const jsonSnapshot = snapshotJsonValue({
    ...snapshot,
    capture: { fixtureRoute: cell.route, fixtureState: cell.state, viewport: { width: cell.width, height: cell.height }, theme: cell.theme, cubeState },
  });
  await expect(JSON.stringify(jsonSnapshot, null, 2))
    .toMatchSnapshot(`${name}.vm.json`);

  // Validate the live view model before pixel baselines can short-circuit a
  // first capture with missing or stale image artifacts.
  // SwiftShader renders canvas pixels directly; no canvas mask is used.
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixelRatio: 0.001, threshold: 0.1,
  });
  await expect(page.locator('body')).toMatchAriaSnapshot({ name: `${name}.aria.yml` });
}

async function captureVariants(page, capture) {
  const failures = [];
  for (const viewport of SNAPSHOT_VIEWPORTS) for (const theme of SNAPSHOT_THEMES) {
    await test.step(`${viewport.id} · ${theme}`, async () => {
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await capture(viewport, theme);
      } catch (error) {
        failures.push(`${viewport.id} · ${theme}: ${error.stack || error}`);
      }
    });
  }
  expect(failures, failures.join('\n')).toEqual([]);
}

for (const fixtureId of SNAPSHOT_STATES) {
  const fixture = FIXTURE_BY_ID.get(fixtureId);
  if (!fixture) throw new Error(`F9 state ${fixtureId} is missing from the shared F8 matrix`);
  const driver = getLayoutDriver(fixture.driver);
  const missingDriver = !driver;
  const owner = fixture.owner || (fixture.route.startsWith('/history') ? 'F2'
      : fixture.route.startsWith('/drills') || fixture.route.startsWith('/algs') || fixture.route.startsWith('/timer') ? 'F4'
        : fixture.route.startsWith('/progress') ? 'F5' : fixture.route.startsWith('/demo') ? 'F17' : 'F1');

  {
    test(`fixture ${fixture.id} · all cells`, async ({ page }) => {
      const viewport = SNAPSHOT_VIEWPORTS[1], theme = 'dark';
      if (missingDriver) throw new Error(`F9 state ${fixture.id} is missing fixture driver "${fixture.driver}"; see tests/layout/F1-FIXTURES.md`);
      test.setTimeout(90_000);
      await installDeterminism(page, theme, viewport);
      const clockInstalled = await freezeTime(page, fixture);
      await driver(page, { ...fixture, id: fixture.id, fixture, fixedNow: FIXED_NOW, clockInstalled, clockTime: FIXED_TIME });
      if (fixture.id === 'debug-open') {
        await page.keyboard.press('Backquote');
        await expect(page.locator('[data-global-dev-drawer]'), 'the shared debug drawer opens from the keyboard').toBeVisible();
      }
      const routeEntry = ROUTE_BY_PATH.get(fixture.route);
      const expectedView = EXPECTED_VIEW[routeEntry?.id];
      if (!expectedView) throw new Error(`F9 state ${fixture.id} route ${fixture.route} has no visible view selector`);
      await expect(page.locator(expectedView), `${fixture.id} route view`).toBeVisible();
      await captureVariants(page, (viewport, theme) => snapshotCell(page, {
        route: fixture.route, state: fixture.id, width: viewport.width, height: viewport.height, theme,
        owner, dataOwner: fixture.dataOwner, expectCube: true, expectedCanvasCount: 1,
      }));
    });
  }
}

for (const routeId of SNAPSHOT_ROUTES) {
  const route = ROUTE_BY_ID.get(routeId);
  if (!route) throw new Error(`F9 route ${routeId} is missing from the shared F8 matrix`);
  const owner = route.id === 'recording' ? 'F0'
      : route.page === 'history' ? 'F2'
        : route.page === 'demo' ? 'F17'
        : ['drills', 'algs', 'timer'].includes(route.page) ? 'F4'
        : route.page === 'progress' ? 'F5' : 'F1';

  {
    test(`route ${route.id} · all cells`, async ({ page }) => {
      test.setTimeout(90_000);
      const viewport = SNAPSHOT_VIEWPORTS[1], theme = 'dark';
      await installDeterminism(page, theme, viewport);
      await page.addInitScript(records => localStorage.setItem('cubesight-solves-v1', JSON.stringify(records)), HISTORY_SEED);
      await freezeTime(page);
      await page.goto(`/#${route.path}`);
      await page.waitForFunction(hash => location.hash === hash, `#${route.path}`);
      const expectedView = EXPECTED_VIEW[route.id];
      if (!expectedView) throw new Error(`F9 route ${route.id} has no registered visible view selector`);
      await expect(page.locator(expectedView), `${route.id} route view`).toBeVisible();
      await captureVariants(page, (viewport, theme) => snapshotCell(page, {
        route: route.path, state: 'default', width: viewport.width, height: viewport.height, theme,
        owner, dataOwner: route.id === 'progress' ? 'F6' : null, expectCube: route.id === 'demo' || ['solve', 'history', 'timer'].includes(route.page),
        expectedCanvasCount: route.id === 'demo-format' ? 0 : 1,
      }));
    });
  }
}

{
  test('recorded rotation-cross replay · all cells', async ({ page }) => {
    const viewport = SNAPSHOT_VIEWPORTS[1], theme = 'dark';
    test.setTimeout(90_000);
    await installDeterminism(page, theme, viewport);
    await freezeTime(page);
    await page.route('**/replay-fixture.json', route => route.fulfill({ body: ROTATION_RECORDING, contentType: 'application/json' }));
    await page.goto('/?replay=/replay-fixture.json&replaySpeed=0#/brain');
    await page.waitForFunction(() => document.documentElement.dataset.replay === 'done', null, { timeout: 60_000, polling: 20 });
    await expect(page.locator('#brain-view #brain-phase-label')).toHaveText('solved');
    await captureVariants(page, (viewport, theme) => snapshotCell(page, {
      route: '/brain', state: 'rotation-cross-recording', width: viewport.width, height: viewport.height,
      theme, owner: 'F1', expectCube: true,
    }));
  });
}

for (const fixtureName of FIXTURE_NAMES) {
  test(`brain buildViewModel fixture · ${fixtureName}`, async () => {
    const vm = brainFixtures({ style: 'orbit', theme: 'dark' })[fixtureName];
    expect(vm, `brainFixtures() exports ${fixtureName}`).toBeDefined();
    const json = JSON.stringify(snapshotJsonValue({ schemaVersion: 1, source: 'src/brain/view-model.js buildViewModel()', viewModel: vm }), null, 2);
    await expect(json).toMatchSnapshot(`${slug(fixtureName)}.vm.json`);
  });
}
