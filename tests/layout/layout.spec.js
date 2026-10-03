import { test, expect } from 'playwright/test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROUTES, VIEWPORTS, THEMES, STATE_FIXTURES, getLayoutDriver } from './matrix.js';
import { inspectLayout, saveFailure } from './invariants.js';
import { HISTORY_SEED } from './fixtures/state-seeds.js';
import './state-drivers.js';

const output = path.resolve('test-results/layout');

async function setTheme(page, theme) {
  await page.evaluate(async themeMode => {
    const { setThemePreference } = await import('/src/theme.js');
    setThemePreference(themeMode);
  }, theme);
}

async function installShiftObserver(page) {
  await page.addInitScript(() => {
    window.__layoutShiftSamples = [];
    window.__layoutShiftCheckpoint = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        for (const source of entry.sources || []) {
          const a = source.previousRect, b = source.currentRect;
          window.__layoutShiftSamples.push(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)));
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function checkCell(page, cell, testInfo) {
  let report;
  try {
    report = await inspectLayout(page, cell);
  } catch (error) {
    report = {
      totalErrors: 1,
      counts: { 'layout-harness': 1 },
      errors: [{ kind: 'layout-harness', selector: 'body', box: null, detail: error?.stack || error?.message || String(error) }],
      cell: { width: cell.width, height: cell.height, route: cell.routeId, state: cell.state, theme: cell.theme },
    };
  }
  if (!report.totalErrors) return report;
  await mkdir(output, { recursive: true });
  const name = `${cell.routeId}-${cell.state}-${cell.width}x${cell.height}-${cell.theme}`.replaceAll(/[^a-z0-9-]/gi, '-');
  const frameId = `F8-${name}`;
  const screenshot = `${name}.png`;
  const json = `${name}.json`;
  await saveFailure(page, { ...report, errors: report.errors.slice(0, 1) }, path.join(output, screenshot), frameId);
  await writeFile(path.join(output, json), JSON.stringify({ ...report, screenshot }, null, 2));
  await testInfo.attach('layout-failure', { path: path.join(output, json), contentType: 'application/json' });
  return report;
}

const viewFor = {
  solve: '#brain-view', drills: '#drills-view', corners: '#corner-view', 'pll-drill': '#pll-view',
  f2l: '#f2l-view', 'cross-planning': '#scout-view', 'oll-drill': '#oll-view', lookahead: '#lookahead-view',
  algs: '#algs-view', demo: '#demo-view', 'demo-format': '#demo-view', 'alg-case-pll': '#algs-view', 'alg-case-oll': '#algs-view',
  'alg-case-oll2': '#algs-view', 'alg-case-f2l': '#algs-view', 'alg-drill': '#algs-view',
  'review-import': '#review-view', 'review-record': '#review-view', progress: '#progress-view', history: '#history-view',
  review: '#review-view', recording: '#recording-view', 'not-found': '#not-found-view',
  'past-solve': '#history-view', replay: '#history-view', 'review-detail': '#history-view', timer: '#timer-view',
  'debug-studio': '#smart-view', help: '#help-view', unknown: '#not-found-view',
};

const stateView = {
  '/solve': '#brain-view', '/history': '#history-view', '/history/1000000/replay': '#history-view',
  '/drills/corners': '#corner-view', '/algs/oll/1': '#algs-view', '/algs/pll/T': '#algs-view', '/timer': '#timer-view',
  '/demo': '#demo-view',
};

const canvasCountFor = route => route === '/algs' || route === '/help' || route === '/demo/format' ? 0 : 1;

const familyFor = (route, id) => id === 'results' || id === 'review-detail' ? 'results'
  : route.startsWith('/solve') ? 'solve'
  : route.startsWith('/drills') ? 'drills'
    : route.startsWith('/algs') ? 'algs'
      : route.startsWith('/timer') ? 'timer'
        : route.startsWith('/history') ? 'history'
            : route.startsWith('/progress') ? 'progress'
              : route.startsWith('/demo?') ? 'demo'
              : route.startsWith('/review') ? 'review' : 'scroll';

for (const fixture of STATE_FIXTURES) {
  test(`state ${fixture.id} · ${fixture.route}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await installShiftObserver(page);
    const driver = getLayoutDriver(fixture.driver);
    let driverFailure = '';
    try {
      if (!driver) throw new Error(`missing F8 state driver ${fixture.driver}`);
      await driver(page, { id: fixture.id, fixture });
    } catch (error) {
      driverFailure = error?.stack || error?.message || String(error);
    }
    await page.keyboard.press('Tab');
    const failures = [];
    const cells = [[1280, 720, 'dark'], ...THEMES.flatMap(theme => VIEWPORTS.map(([width, height]) => [width, height, theme])).filter(([width, height, theme]) => width !== 1280 || height !== 720 || theme !== 'dark')];
    for (const [width, height, theme] of cells) {
      await test.step(`${width}×${height} · ${theme}`, async () => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await setTheme(page, theme);
        if (fixture.id === 'inspection-overtime' || fixture.driver === 'manual-timer') await page.clock.fastForward(32);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(() => { window.__layoutShiftCheckpoint = (window.__layoutShiftSamples || []).length; });
        const report = await checkCell(page, {
          width, height, routeId: `state-${fixture.id}`, routeFamily: familyFor(fixture.route, fixture.id),
          routePath: fixture.route, expectedView: stateView[fixture.route] ?? (fixture.route.startsWith('/demo?') ? '#demo-view' : undefined), expectedCanvasCount: canvasCountFor(fixture.route), state: fixture.id, theme, driverFailure,
          expectDebugDrawer: fixture.id === 'debug-open',
          expectSettingsDrawer: fixture.id === 'settings-open',
          expectConnectionMenu: fixture.id === 'connection-menu-open',
        }, testInfo);
        if (report?.totalErrors) failures.push({ width, height, theme, counts: report.counts });
      });
    }
    expect(failures, `state ${fixture.id}: ${JSON.stringify(failures)}`).toEqual([]);
  });
}

for (const route of ROUTES) {
  test(`route ${route.id} · ${route.path}`, async ({ page }, testInfo) => {
    await installShiftObserver(page);
    await page.addInitScript(history => {
      localStorage.setItem('cubesight-theme', 'dark');
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'orbit' }));
      localStorage.setItem('cubesight-solves-v1', JSON.stringify(history));
    }, HISTORY_SEED);
    await page.goto(`/#${route.path}`);
    await page.waitForFunction(hash => location.hash === hash, `#${route.path}`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { window.__layoutShiftCheckpoint = (window.__layoutShiftSamples || []).length; });
    await page.keyboard.press('Tab');

    const failures = [];
    for (const theme of THEMES) for (const [width, height] of VIEWPORTS) {
      await test.step(`${width}×${height} · ${theme}`, async () => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await setTheme(page, theme);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const report = await checkCell(page, {
          width, height, routeId: route.id, routeFamily: route.page,
          state: 'route-default', theme,
          expectedView: viewFor[route.id], expectedCanvasCount: canvasCountFor(route.path), routePath: route.path,
        }, testInfo);
        if (report?.totalErrors) failures.push({ route: route.id, counts: report.counts });

        // Shared drawer/menu states get full viewport/theme coverage in their
        // dedicated fixture tests. Sample both ends of the layout range here
        // on each route so page-specific stacking is still covered.
        const sampleSharedState = (width === 320 && theme === 'dark') || (width === 1280 && theme === 'light');
        if (sampleSharedState) {
          await page.keyboard.press('Backquote');
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const drawerReport = await checkCell(page, {
            width, height, routeId: route.id, routeFamily: route.page, state: 'debug-drawer-open', theme,
            routePath: route.path, expectedView: viewFor[route.id], expectedCanvasCount: canvasCountFor(route.path), expectDebugDrawer: true,
          }, testInfo);
          if (drawerReport?.totalErrors) failures.push({ route: route.id, state: 'debug-drawer-open', counts: drawerReport.counts });
          await page.keyboard.press('Escape');
        }
      });
    }
    expect(failures, `F8 baseline failures by route: ${JSON.stringify(failures)}`).toEqual([]);
  });
}

// Mono is a legacy skin. Keep a narrow representative check at the requested sizes.
for (const width of [390, 1440]) for (const theme of THEMES) {
  test(`legacy Mono · ${width} · ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(({ mode }) => {
      localStorage.setItem('cubesight-theme', mode);
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'mono' }));
    }, { mode: theme });
    await page.goto('/#/solve');
    await page.locator('#brain-view').waitFor({ state: 'visible' });
    const pageStyle = await page.locator('#brain-view .brain').getAttribute('data-brain-style').catch(() => null);
    const report = await checkCell(page, { width, height: width === 390 ? 844 : 900, routeId: 'solve-mono', routeFamily: 'solve', state: 'idle', theme: `${theme}-mono`, expectedBrainStyle: 'mono' }, testInfo);
    if (report?.totalErrors || pageStyle !== 'mono') expect({ errors: report?.counts, pageStyle }).toEqual({ errors: {}, pageStyle: 'mono' });
  });
}

// Real browser text zoom equivalent: double the root text scale at desktop width.
test('200% text zoom · 1280×720', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/#/solve');
  await page.locator('#brain-view').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      if (!el.textContent.trim()) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      el.style.setProperty('font-size', `${size * 2}px`, 'important');
    }
  });
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Tab');
  const report = await checkCell(page, { width: 1280, height: 720, routeId: 'solve', routeFamily: 'solve', state: 'text-zoom-200', theme: 'dark', expectedView: '#brain-view', routePath: '/solve' }, testInfo);
  expect(report?.counts || {}).toEqual({});
});

test.afterAll(async () => {
  await mkdir(output, { recursive: true });
  const files = await readdir(output).catch(() => []);
  const entries = [];
  const routeOrder = new Map(ROUTES.map((route, index) => [route.id, index]));
  const stateOrder = new Map(STATE_FIXTURES.map((state, index) => [state.id, index]));
  const viewportOrder = new Map(VIEWPORTS.map((size, index) => [`${size[0]}x${size[1]}`, index]));
  const reports = await Promise.all(files.filter(name => name.endsWith('.json')).map(async file => JSON.parse(await readFile(path.join(output, file), 'utf8'))));
  reports.sort((a, b) => (routeOrder.get(a.cell.route) ?? 999) - (routeOrder.get(b.cell.route) ?? 999)
    || (stateOrder.get(a.cell.state) ?? 999) - (stateOrder.get(b.cell.state) ?? 999)
    || (viewportOrder.get(`${a.cell.width}x${a.cell.height}`) ?? 999) - (viewportOrder.get(`${b.cell.width}x${b.cell.height}`) ?? 999)
    || a.cell.theme.localeCompare(b.cell.theme));
  for (const value of reports) {
    const id = `L-${String(entries.length + 1).padStart(3, '0')}`;
    const first = value.errors[0];
    entries.push(`<article data-gallery-frame><h2>${id} · ${value.cell.route} · ${value.cell.state} · ${value.cell.width}×${value.cell.height} · ${value.cell.theme}</h2><p>① ${first?.kind}: ${first?.selector} — ${first?.detail} (${value.totalErrors} findings; groups: ${JSON.stringify(value.counts)})</p><a href="${value.screenshot}"><img src="${value.screenshot}" alt="${id}, callout 1: ${first?.kind}"></a><pre>${value.errors.map(e => `${e.kind}: ${e.selector} ${JSON.stringify(e.box)} — ${e.detail}`).join('\n')}</pre></article>`);
  }
  await writeFile(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Layout invariant failures</title><link rel="stylesheet" href="../../docs/design/_gallery/lightbox.css"><style>body{font:16px system-ui;background:#101820;color:#e8eef2;margin:2rem}article{margin:2rem 0;padding:1rem;border:1px solid #52636f}img{max-width:100%;height:auto}pre{white-space:pre-wrap}</style><h1>Layout invariant failures (${entries.length})</h1>${entries.join('\n') || '<p>No layout failures recorded.</p>'}<script defer src="../../docs/design/_gallery/lightbox.js"></script>`);
});
