import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, test } from 'playwright/test';
import { GOLD } from '../tests/analysis-golden.mjs';
import { mountTestBrain, startGuidedScramble } from '../tests/helpers/fake-brain.js';

const outputDir = path.resolve('test-results/perf');

async function startFrameSample(page, durationMs, key = '__f11FrameSample') {
  await page.evaluate(({ duration, sampleKey }) => {
    const sample = { startedAt: performance.now(), frames: [], done: false };
    sample.stop = () => { sample.done = true; };
    window[sampleKey] = sample;
    const step = (time) => {
      if (sample.done) return;
      sample.frames.push(time);
      if (time - sample.startedAt < duration) requestAnimationFrame(step);
      else sample.done = true;
    };
    requestAnimationFrame(step);
  }, { duration: durationMs, sampleKey: key });
}

async function finishFrameSample(page, durationMs, key = '__f11FrameSample') {
  await page.waitForFunction(name => window[name]?.done, key, { timeout: durationMs + 10_000 });
  return page.evaluate(name => {
    const frames = window[name].frames;
    const deltas = frames.slice(1).map((time, index) => time - frames[index]);
    const sorted = [...deltas].sort((a, b) => a - b);
    return {
      frames: frames.length,
      elapsedMs: frames.length > 1 ? frames.at(-1) - frames[0] : 0,
      fps: frames.length > 1 ? (frames.length - 1) * 1000 / (frames.at(-1) - frames[0]) : 0,
      frameIntervalMs: {
        count: deltas.length,
        median: sorted[Math.floor(sorted.length / 2)] ?? null,
        p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? null,
        max: sorted.at(-1) ?? null,
        buckets: {
          'under-16.7': deltas.filter(value => value < 16.7).length,
          '16.7-to-25': deltas.filter(value => value >= 16.7 && value < 25).length,
          '25-to-33.3': deltas.filter(value => value >= 25 && value < 33.3).length,
          '33.3-to-50': deltas.filter(value => value >= 33.3 && value < 50).length,
          '50-or-more': deltas.filter(value => value >= 50).length,
        },
      },
      p95FrameMs: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? null,
    };
  }, key);
}

async function stopFrameSample(page, key = '__f11FrameSample') {
  await page.evaluate(name => window[name]?.stop(), key);
}

async function frameSample(page, durationMs, action, key = '__f11FrameSample') {
  await startFrameSample(page, durationMs, key);
  await action();
  return finishFrameSample(page, durationMs, key);
}

async function captureMorphFps(page, trigger) {
  await page.evaluate(() => {
    const sample = window.__f11MorphSample = { startedAt: performance.now(), lastMorphAt: null, frames: [], done: false };
    const tick = time => {
      if (document.querySelector('#brain-view .orbit.is-morphing')) {
        sample.lastMorphAt = time;
        sample.frames.push(time);
      }
      sample.done = time - sample.startedAt > 5000 || (sample.lastMorphAt != null && time - sample.lastMorphAt > 100);
      if (!sample.done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await trigger();
  await page.waitForFunction(() => window.__f11MorphSample?.done, undefined, { timeout: 6_000 });
  return page.evaluate(() => {
    const frames = window.__f11MorphSample.frames;
    const elapsedMs = frames.length > 1 ? frames.at(-1) - frames[0] : 0;
    const deltas = frames.slice(1).map((time, index) => time - frames[index]);
    const sorted = [...deltas].sort((a, b) => a - b);
    return {
      frames: frames.length,
      elapsedMs,
      fps: elapsedMs > 0 ? (frames.length - 1) * 1000 / elapsedMs : 0,
      frameIntervalMs: {
        count: deltas.length,
        median: sorted[Math.floor(sorted.length / 2)] ?? null,
        p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? null,
        max: sorted.at(-1) ?? null,
        buckets: {
          'under-16.7': deltas.filter(value => value < 16.7).length,
          '16.7-to-25': deltas.filter(value => value >= 16.7 && value < 25).length,
          '25-to-33.3': deltas.filter(value => value >= 25 && value < 33.3).length,
          '33.3-to-50': deltas.filter(value => value >= 33.3 && value < 50).length,
          '50-or-more': deltas.filter(value => value >= 50).length,
        },
      },
    };
  });
}

async function keyboardResponseMs(page) {
  return page.evaluate(async () => {
    const brain = document.querySelector('#brain-view .brain');
    const settings = brain?.querySelector('.b-settings');
    const panel = settings?.querySelector('.b-settings-body');
    if (!brain) throw new Error('Keyboard sample requires the mounted Brain view.');
    if (!settings || !panel || settings.open) throw new Error('Keyboard sample requires the visible settings drawer to start closed.');
    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const observer = new MutationObserver(() => {
        if (!settings.open) return;
        observer.disconnect();
        let frames = 0;
        const waitForPaint = time => {
          const rect = panel.getBoundingClientRect();
          if (settings.open && rect.width > 0 && rect.height > 0 && getComputedStyle(panel).visibility !== 'hidden') resolve(time - startedAt);
          else if (++frames < 4) requestAnimationFrame(waitForPaint);
          else reject(new Error('Settings opened but its panel did not become visible.'));
        };
        requestAnimationFrame(waitForPaint);
      });
      observer.observe(settings, { attributes: true, attributeFilter: ['open'] });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));
      setTimeout(() => { observer.disconnect(); reject(new Error('Keyboard shortcut did not open the visible settings drawer.')); }, 2000);
    });
  });
}

async function runSolveScenario(page, screenshotPath = null) {
  const startedAt = await page.evaluate(() => performance.now());
  const morph = await captureMorphFps(page, async () => {
    await startGuidedScramble(page, GOLD.normal.scramble, '#brain-view');
    await page.evaluate(scramble => window.testBrain.emitTurns(scramble), GOLD.normal.scramble);
    await page.locator('#brain-phase-label').filter({ hasText: 'inspection' }).waitFor();
  });
  expect(morph.frames).toBeGreaterThan(1);
  await startFrameSample(page, 12_000);
  const moves = GOLD.normal.moves.split(/\s+/).filter(Boolean);
  let liveMove;
  const liveMoveSmoothness = await frameSample(page, 1200, async () => {
    liveMove = await page.evaluate(move => window.testBrain.emitMeasuredTurn(move), moves[0]);
    await page.evaluate(solution => window.testBrain.emitTimed(solution, () => 14), moves.slice(1, 8).join(' '));
  }, '__f11LiveMoveSample');
  await page.evaluate(solution => window.testBrain.emitTimed(solution, () => 14), moves.slice(8).join(' '));
  await page.locator('#brain-phase-label').filter({ hasText: 'solved' }).waitFor();
  const resultsShownAt = await page.evaluate(() => performance.now());
  await page.waitForFunction(start => window.testBrain.handle.getViewModel()?.results?.review?.status === 'done'
    || (window.__f11Workers ?? []).some(item => item.createdAt >= start && item.errorAt != null), startedAt, { timeout: 45_000 });
  await page.locator('#brain-timeline .orbit__marker-cluster[data-marker-cluster]').first().waitFor({ state: 'visible', timeout: 5_000 });
  const analysisResultsMs = await page.evaluate(start => performance.now() - start, resultsShownAt);
  const analysisWorker = await page.evaluate(start => {
    const worker = [...(window.__f11Workers ?? [])].reverse().find(item => item.createdAt >= start && new URL(item.url, location.href).pathname.includes('/analysis/worker.js'));
    if (!worker) throw new Error('Solve analysis did not create its own analysis Worker.');
    if (worker.errorAt != null || worker.resultAt == null) throw new Error(`Analysis Worker failed instead of returning a result: ${worker.errorMessage ?? 'no result message'}`);
    return {
      url: worker.url,
      constructorToFirstReplyMs: worker.firstReplyAt == null ? null : worker.firstReplyAt - worker.createdAt,
      constructorToResultMs: worker.resultAt - worker.createdAt,
      terminatedAt: worker.terminatedAt,
    };
  }, startedAt);
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  await stopFrameSample(page);
  const solvePlaybackAndResults = await finishFrameSample(page, 12_000);
  const solveLongTasks = await page.evaluate(start => (window.__f11LongTasks ?? []).filter(entry => entry.startTime >= start), startedAt);
  const finalScreen = await page.locator('#brain-view .brain').getAttribute('data-screen');
  const activeFixtureOwnership = {
    canvases: await page.locator('#brain-view .b-cube-wrap canvas').count(),
    controllers: await page.locator('#brain-view .brain').count(),
    pendingAnimationFrames: await page.evaluate(() => window.__f11PendingAnimationFrames?.() ?? null),
  };
  expect(activeFixtureOwnership.canvases).toBe(1);
  expect(activeFixtureOwnership.controllers).toBe(1);
  const fixtureTeardown = await page.evaluate(async () => {
    window.testBrain.handle.detach();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      canvases: document.querySelectorAll('#brain-view .b-cube-wrap canvas').length,
      controllers: document.querySelectorAll('#brain-view .brain').length,
      pendingAnimationFrames: window.__f11PendingAnimationFrames(),
    };
  });
  expect(fixtureTeardown).toEqual({ canvases: 0, controllers: 0, pendingAnimationFrames: 0 });
  return { morph, liveMove, liveMoveSmoothness, analysisResultsMs, analysisWorker, solvePlaybackAndResults, solveLongTasks, finalScreen, activeFixtureOwnership, fixtureTeardown };
}

async function startupSample(page, label) {
  await page.reload();
  await page.locator('#brain-view .brain').waitFor();
  await page.waitForFunction(() => performance.getEntriesByName('f11-first-meaningful').length > 0, undefined, { timeout: 30_000 });
  return page.evaluate((name) => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const meaningful = performance.getEntriesByName('f11-first-meaningful')[0];
    const scripts = performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'script' && entry.name.startsWith(location.origin));
    const firstContentfulPaint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    return {
      profile: name,
      controlledByServiceWorker: Boolean(navigator.serviceWorker?.controller),
      serviceWorkerUrl: navigator.serviceWorker?.controller?.scriptURL ?? null,
      firstContentfulPaintMs: firstContentfulPaint,
      firstMeaningfulRenderMs: meaningful.startTime,
      responseStartMs: navigation.responseStart,
      routeScriptEncodedBytes: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      routeScriptTransferBytes: scripts.reduce((sum, entry) => sum + entry.transferSize, 0),
      routeScriptUrls: [...new Set(scripts.map((entry) => new URL(entry.name).pathname))].sort(),
      longTasks: [...(window.__f11LongTasks ?? [])],
    };
  }, label);
}

async function readLongTasks(page) {
  return page.evaluate(() => [...(window.__f11LongTasks ?? [])]);
}

async function writeTrace(cdp) {
  let timeout;
  const complete = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Timed out waiting for CDP Tracing.tracingComplete.')), 15_000);
    cdp.once('Tracing.tracingComplete', (event) => { clearTimeout(timeout); resolve(event); });
  });
  await cdp.send('Tracing.end');
  const { stream } = await complete;
  const chunks = [];
  let eof = false;
  while (!eof) {
    const next = await cdp.send('IO.read', { handle: stream, size: 1024 * 1024 });
    chunks.push(next.data);
    eof = next.eof;
  }
  await cdp.send('IO.close', { handle: stream });
  const output = path.join(outputDir, 'chrome-trace.json');
  await writeFile(output, chunks.join(''));
  return output;
}

test('captures production-cache startup and deterministic solve/render performance', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await mkdir(outputDir, { recursive: true });
  await page.addInitScript(() => {
    window.__f11LongTasks = [];
    try {
      new PerformanceObserver((list) => window.__f11LongTasks.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, durationMs: entry.duration })))).observe({ type: 'longtask', buffered: true });
    } catch { /* longtask entries are not available in every Chromium build */ }
    const mark = () => {
      const brain = document.querySelector('#brain-view .brain');
      const canvas = brain?.querySelector('.b-cube-wrap canvas');
      const visible = node => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
      };
      if (visible(brain) && visible(canvas) && canvas.width > 0 && canvas.height > 0
        && !performance.getEntriesByName('f11-first-meaningful').length && !window.__f11MeaningfulPending) {
        window.__f11MeaningfulPending = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (visible(brain) && visible(canvas)) performance.mark('f11-first-meaningful');
          window.__f11MeaningfulPending = false;
        }));
      }
    };
    new MutationObserver(mark).observe(document, { subtree: true, childList: true } );
  });

  const startupCdp = await page.context().newCDPSession(page);
  const browserVersion = browser.version();
  const environment = {
    browserVersion,
    nodeVersion: process.version,
    hostPlatform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    viewport: { width: 1280, height: 900 },
    cpuThrottleDesktop: 1,
    cpuThrottlePhone: 4,
    renderer: 'SwiftShader',
    serviceWorkerCacheRequired: true,
  };

  await page.goto('/#/solve');
  await page.locator('#brain-view .brain').waitFor();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 30_000 });
  const desktopStartup = await startupSample(page, 'desktop-installed-pwa');
  expect(desktopStartup.controlledByServiceWorker).toBe(true);

  await startupCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.setViewportSize({ width: 390, height: 844 });
  const phoneStartup = await startupSample(page, 'phone-installed-pwa-cpu-x4');
  expect(phoneStartup.controlledByServiceWorker).toBe(true);
  console.log('F11 checkpoint: installed-cache startup complete');
  expect(desktopStartup.routeScriptEncodedBytes).toBeGreaterThan(0);
  expect(phoneStartup.routeScriptEncodedBytes).toBeGreaterThan(0);
  await writeFile(path.join(outputDir, 'startup.json'), `${JSON.stringify({
    commit: process.env.GITHUB_SHA ?? null,
    environment,
    desktopStartup,
    phoneStartup,
  }, null, 2)}\n`);

  await startupCdp.detach();
  await page.close();
  const scenarioContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4177', viewport: { width: 390, height: 844 } });
  await scenarioContext.addInitScript(() => {
    window.__f11LongTasks = [];
    try {
      new PerformanceObserver((list) => window.__f11LongTasks.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, durationMs: entry.duration })))).observe({ type: 'longtask', buffered: true });
    } catch { /* longtask entries are not available in every Chromium build */ }
  });
  page = await scenarioContext.newPage();
  await page.goto('http://127.0.0.1:4177/perf/fixture.html');
  const cdp = await page.context().newCDPSession(page);
  const scenarioEnvironment = { origin: 'Vite development server at http://127.0.0.1:4177', metricsAreProduction: false };
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const brain = {};
  await mountTestBrain(page, 'orbit', { route: true, fixture: true });
  const initialCanvas = await page.locator('#brain-view .b-cube-wrap canvas').count();
  const phoneIdleStart = await page.evaluate(() => performance.now());
  brain.idleGyroPhone = await frameSample(page, 1200, () => page.evaluate(() => window.testBrain.emitGyroBurst(1100, 16)));
  brain.idleGyroPhoneLongTasks = (await readLongTasks(page)).filter(entry => entry.startTime >= phoneIdleStart);
  console.log('F11 checkpoint: phone gyro sample complete');
  brain.keyboardResponseMs = await keyboardResponseMs(page);

  await mountTestBrain(page, 'orbit', { route: true, fixture: true, connectDelayMs: 900, awaitConnect: false });
  const phoneConnectStart = await page.evaluate(() => performance.now());
  brain.connectSpinPhone = await frameSample(page, 850, () => page.waitForFunction(() => window.testBrain?.session.getSnapshot().phase === 'tracking', undefined, { timeout: 5_000 }));
  brain.connectElapsedPhoneMs = await page.evaluate(start => performance.now() - start, phoneConnectStart);
  brain.connectLongTasksPhone = (await readLongTasks(page)).filter(entry => entry.startTime >= phoneConnectStart);
  console.log('F11 checkpoint: phone connecting ring sample complete');
  await page.locator('#brain-view .orbit.is-morphing').waitFor({ state: 'hidden', timeout: 3_000 });
  brain.solvePhone = await runSolveScenario(page);
  console.log('F11 checkpoint: phone solve and analysis sample complete');
  await page.goto('/#/algs/oll/1');
  let sequence = page.locator('[data-case-sequence]');
  await sequence.waitFor();
  const phoneAlgorithmStart = await page.evaluate(() => performance.now());
  brain.algorithmPlaybackPhone = await frameSample(page, 4000, () => sequence.locator('[data-sequence="play"]').click());
  brain.algorithmLongTasksPhone = (await readLongTasks(page)).filter(entry => entry.startTime >= phoneAlgorithmStart);

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:4177/perf/fixture.html');
  await mountTestBrain(page, 'orbit', { route: true, fixture: true, connectDelayMs: 900, awaitConnect: false });
  const desktopConnectStart = await page.evaluate(() => performance.now());
  brain.connectSpin = await frameSample(page, 850, () => page.waitForFunction(() => window.testBrain?.session.getSnapshot().phase === 'tracking', undefined, { timeout: 5_000 }));
  brain.connectElapsedMs = await page.evaluate(start => performance.now() - start, desktopConnectStart);
  brain.connectLongTasksDesktop = (await readLongTasks(page)).filter(entry => entry.startTime >= desktopConnectStart);
  console.log('F11 checkpoint: desktop connecting ring sample complete');
  await page.locator('#brain-view .orbit.is-morphing').waitFor({ state: 'hidden', timeout: 3_000 });
  brain.keyboardResponseDesktopMs = await keyboardResponseMs(page);

  const gyroStart = await page.evaluate(() => performance.now());
  brain.idleGyro = await frameSample(page, 1200, () => page.evaluate(() => window.testBrain.emitGyroBurst(1100, 16)));
  brain.idleGyroLongTasks = (await readLongTasks(page)).filter((entry) => entry.startTime >= gyroStart && entry.startTime <= gyroStart + 1200);
  console.log('F11 checkpoint: desktop gyro sample complete');

  await mountTestBrain(page, 'orbit', { route: true, fixture: true });
  brain.solveDesktop = await runSolveScenario(page, path.join(outputDir, 'solve-results.png'));
  const screenshotPath = path.join(outputDir, 'solve-results.png');
  brain.fixtureOwnership = { canvasesAfterFirstMount: initialCanvas, ...brain.solveDesktop.fixtureOwnership };
  console.log('F11 checkpoint: solve and analysis sample complete');

  await page.goto('/#/algs/oll/1');
  sequence = page.locator('[data-case-sequence]');
  await sequence.waitFor();
  const desktopAlgorithmStart = await page.evaluate(() => performance.now());
  brain.algorithmPlayback = await frameSample(page, 4000, () => sequence.locator('[data-sequence="play"]').click());
  brain.algorithmLongTasks = (await readLongTasks(page)).filter(entry => entry.startTime >= desktopAlgorithmStart);
  console.log('F11 checkpoint: algorithm playback sample complete');

  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const beforeHeap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const routeCases = [
    ['#/solve', '#brain-view'],
    ['#/history', '#history-view'],
    ['#/progress', '#progress-view'],
    ['#/algs/oll/1', '#algs-view'],
  ];
  for (let index = 0; index < 30; index += 1) {
    const [hash, selector] = routeCases[index % routeCases.length];
    await page.evaluate((nextHash) => { location.hash = nextHash; }, hash);
    await page.waitForFunction((id) => {
      const view = document.querySelector(id);
      return view && !view.hidden;
    }, selector, { timeout: 10_000 });
  }
  await cdp.send('HeapProfiler.collectGarbage');
  const afterHeap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  brain.routeSwitches = { count: 30, beforeHeapBytes: beforeHeap, afterHeapBytes: afterHeap, growthBytes: afterHeap - beforeHeap, growthMb: (afterHeap - beforeHeap) / (1024 * 1024) };
  console.log('F11 checkpoint: heap and route-switch sample complete');

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? null,
    environment,
    scenarioEnvironment,
    scenarios: {
      startupDesktop: desktopStartup,
      startupPhone: phoneStartup,
      connectingRingDesktop: { ...brain.connectSpin, elapsedMs: brain.connectElapsedMs },
      connectingRingPhone: { ...brain.connectSpinPhone, elapsedMs: brain.connectElapsedPhoneMs },
      phoneIdleGyro: brain.idleGyroPhone,
      idleGyro: { ...brain.idleGyro, longTaskCount: brain.idleGyroLongTasks.length, longestTaskMs: Math.max(0, ...brain.idleGyroLongTasks.map((entry) => entry.durationMs)) },
      keyboardResponseMs: brain.keyboardResponseMs,
      keyboardResponseDesktopMs: brain.keyboardResponseDesktopMs,
      solvePhone: brain.solvePhone,
      solveDesktop: brain.solveDesktop,
      algorithmPlaybackPhone: brain.algorithmPlaybackPhone,
      algorithmPlaybackDesktop: brain.algorithmPlayback,
      longTasksPhone: [...brain.idleGyroPhoneLongTasks, ...brain.connectLongTasksPhone, ...brain.solvePhone.solveLongTasks, ...brain.algorithmLongTasksPhone],
      longTasksDesktop: [...brain.connectLongTasksDesktop, ...brain.idleGyroLongTasks, ...brain.solveDesktop.solveLongTasks, ...brain.algorithmLongTasks],
      routeSwitches: brain.routeSwitches,
      fixtureOwnership: brain.fixtureOwnership,
    },
    metrics: {
      'startup.desktopFirstMeaningfulMs': desktopStartup.firstMeaningfulRenderMs,
      'startup.phoneFirstMeaningfulMs': phoneStartup.firstMeaningfulRenderMs,
      'startup.routeScriptEncodedBytes': desktopStartup.routeScriptEncodedBytes,
      'smoothness.desktopIdleGyroFps': brain.idleGyro.fps,
      'smoothness.phoneIdleGyroFps': brain.idleGyroPhone.fps,
      'smoothness.connectingRingDesktopFps': brain.connectSpin.fps,
      'smoothness.connectingRingPhoneFps': brain.connectSpinPhone.fps,
      'smoothness.openFullOrbitMorphDesktopFps': brain.solveDesktop.morph.fps,
      'smoothness.openFullOrbitMorphPhoneFps': brain.solvePhone.morph.fps,
      'smoothness.liveMoveDesktopFps': brain.solveDesktop.liveMoveSmoothness.fps,
      'smoothness.liveMovePhoneFps': brain.solvePhone.liveMoveSmoothness.fps,
      'smoothness.solvePlaybackDesktopFps': brain.solveDesktop.solvePlaybackAndResults.fps,
      'smoothness.solvePlaybackPhoneFps': brain.solvePhone.solvePlaybackAndResults.fps,
      'smoothness.algorithmPlaybackDesktopFps': brain.algorithmPlayback.fps,
      'smoothness.algorithmPlaybackPhoneFps': brain.algorithmPlaybackPhone.fps,
      'input.liveMoveDesktopToAnimationStartMs': brain.solveDesktop.liveMove.eventToAnimationStartMs,
      'input.liveMovePhoneToAnimationStartMs': brain.solvePhone.liveMove.eventToAnimationStartMs,
      'input.keyboardVisualResponseMs': brain.keyboardResponseMs,
      'input.keyboardVisualResponseDesktopMs': brain.keyboardResponseDesktopMs,
      'analysis.resultRevealDesktopMs': brain.solveDesktop.analysisResultsMs,
      'analysis.resultRevealPhoneMs': brain.solvePhone.analysisResultsMs,
      'analysis.workerDesktopConstructorToFirstReplyMs': brain.solveDesktop.analysisWorker?.constructorToFirstReplyMs ?? null,
      'analysis.workerDesktopConstructorToResultMs': brain.solveDesktop.analysisWorker?.constructorToResultMs ?? null,
      'analysis.workerPhoneConstructorToFirstReplyMs': brain.solvePhone.analysisWorker?.constructorToFirstReplyMs ?? null,
      'analysis.workerPhoneConstructorToResultMs': brain.solvePhone.analysisWorker?.constructorToResultMs ?? null,
      'memory.routeSwitchGrowthMb': brain.routeSwitches.growthMb,
      'longTasks.maxDuringDesktopSolveMs': Math.max(0, ...brain.solveDesktop.solveLongTasks.map((entry) => entry.durationMs)),
      'longTasks.maxDuringPhoneSolveMs': Math.max(0, ...brain.solvePhone.solveLongTasks.map((entry) => entry.durationMs)),
      'longTasks.maxDuringDesktopAnimationsMs': Math.max(0, ...[...brain.connectLongTasksDesktop, ...brain.idleGyroLongTasks, ...brain.solveDesktop.solveLongTasks, ...brain.algorithmLongTasks].map(entry => entry.durationMs)),
      'longTasks.maxDuringPhoneAnimationsMs': Math.max(0, ...[...brain.idleGyroPhoneLongTasks, ...brain.connectLongTasksPhone, ...brain.solvePhone.solveLongTasks, ...brain.algorithmLongTasksPhone].map(entry => entry.durationMs)),
    },
    trace: null,
    screenshot: path.relative(process.cwd(), screenshotPath),
    limitations: ['BLE-to-frame latency uses an explicitly simulated MOVE event; no physical cube was connected.', 'Route-switch heap deltas are Chromium JS heap measurements after explicit garbage collection; they do not include GPU memory.'],
  };
  // Preserve completed measurements before the separate trace phase. Tracing
  // stays out of every frame-timing window and its completion is bounded.
  await writeFile(path.join(outputDir, 'scenarios.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('F11 checkpoint: scenario report persisted; starting trace');
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing,loading,v8,disabled-by-default-devtools.timeline',
    transferMode: 'ReturnAsStream',
  });
  await page.goto('http://127.0.0.1:4177/perf/fixture.html');
  await mountTestBrain(page, 'orbit', { route: true, fixture: true });
  await frameSample(page, 1000, () => page.evaluate(() => window.testBrain.emitGyroBurst(900, 16)));
  const tracePath = await writeTrace(cdp);
  console.log('F11 checkpoint: trace saved');
  report.trace = path.relative(process.cwd(), tracePath);
  await writeFile(path.join(outputDir, 'scenarios.json'), `${JSON.stringify(report, null, 2)}\n`);
  await testInfo.attach('f11-performance-scenarios', { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json' });
  await cdp.detach();
  expect(brain.solvePhone.finalScreen).toBe('results');
  expect(brain.solveDesktop.finalScreen).toBe('results');
});
