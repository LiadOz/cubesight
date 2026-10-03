import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, test } from 'playwright/test';
import { GOLD } from '../tests/analysis-golden.mjs';
import { mountTestBrain, playSolve } from '../tests/helpers/fake-brain.js';

const outputDir = path.resolve('test-results/perf');

async function startFrameSample(page, durationMs) {
  await page.evaluate((duration) => {
    const sample = { startedAt: performance.now(), frames: [], done: false };
    sample.stop = () => { sample.done = true; };
    window.__f11FrameSample = sample;
    const step = (time) => {
      if (sample.done) return;
      sample.frames.push(time);
      if (time - sample.startedAt < duration) requestAnimationFrame(step);
      else sample.done = true;
    };
    requestAnimationFrame(step);
  }, durationMs);
}

async function finishFrameSample(page, durationMs) {
  await page.waitForFunction(() => window.__f11FrameSample?.done, { timeout: durationMs + 10_000 });
  return page.evaluate(() => {
    const frames = window.__f11FrameSample.frames;
    const deltas = frames.slice(1).map((time, index) => time - frames[index]);
    const sorted = [...deltas].sort((a, b) => a - b);
    return {
      frames: frames.length,
      elapsedMs: frames.length > 1 ? frames.at(-1) - frames[0] : 0,
      fps: frames.length > 1 ? (frames.length - 1) * 1000 / (frames.at(-1) - frames[0]) : 0,
      p95FrameMs: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? null,
    };
  });
}

async function stopFrameSample(page) {
  await page.evaluate(() => window.__f11FrameSample?.stop());
}

async function frameSample(page, durationMs, action) {
  await startFrameSample(page, durationMs);
  await action();
  return finishFrameSample(page, durationMs);
}

async function startupSample(page, label) {
  await page.reload();
  await page.locator('#brain-view .brain').waitFor();
  await page.waitForFunction(() => performance.getEntriesByName('f11-first-meaningful').length > 0);
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
  test.setTimeout(180_000);
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
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), { timeout: 30_000 });
  const desktopStartup = await startupSample(page, 'desktop-installed-pwa');
  expect(desktopStartup.controlledByServiceWorker).toBe(true);

  await startupCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.setViewportSize({ width: 390, height: 844 });
  const phoneStartup = await startupSample(page, 'phone-installed-pwa-cpu-x4');
  expect(phoneStartup.controlledByServiceWorker).toBe(true);
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
  await page.goto('http://127.0.0.1:4177/#/solve');
  const cdp = await page.context().newCDPSession(page);
  const scenarioEnvironment = { origin: 'Vite development server at http://127.0.0.1:4177', metricsAreProduction: false };
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const brain = {};
  await mountTestBrain(page, 'orbit', { route: true });
  brain.idleGyroPhone = await frameSample(page, 1200, () => page.evaluate(() => window.testBrain.emitGyroBurst(1100, 16)));

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.setViewportSize({ width: 1280, height: 900 });
  const traceStarted = new Promise((resolve) => cdp.once('Tracing.tracingStarted', resolve));
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing,loading,v8,disabled-by-default-devtools.timeline',
    transferMode: 'ReturnAsStream',
  });
  await traceStarted;

  await mountTestBrain(page, 'orbit', { route: true, connectDelayMs: 900, awaitConnect: false });
  const connectStart = performance.now();
  brain.connectSpin = await frameSample(page, 850, () => page.waitForFunction(() => window.testBrain?.session.getSnapshot().phase === 'tracking', { timeout: 5_000 }));
  brain.connectElapsedMs = Math.round(performance.now() - connectStart);

  const gyroStart = await page.evaluate(() => performance.now());
  brain.idleGyro = await frameSample(page, 1200, () => page.evaluate(() => window.testBrain.emitGyroBurst(1100, 16)));
  brain.idleGyroLongTasks = (await readLongTasks(page)).filter((entry) => entry.startTime >= gyroStart && entry.startTime <= gyroStart + 1200);
  brain.simulatedMoveInput = await page.evaluate(() => window.testBrain.emitMeasuredTurn('R'));

  await mountTestBrain(page, 'orbit', { route: true });
  const solveStart = await page.evaluate(() => performance.now());
  await startFrameSample(page, 12_000);
  await playSolve(page, GOLD.normal.scramble, GOLD.normal.moves, { brain: '#brain-view', base: 14 });
  const resultsShownAt = await page.evaluate(() => performance.now());
  await page.locator('#brain-view .b-rev-chip').first().waitFor({ timeout: 30_000 });
  brain.analysisResultsMs = await page.evaluate((startedAt) => performance.now() - startedAt, resultsShownAt);
  const screenshotPath = path.join(outputDir, 'solve-results.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await stopFrameSample(page);
  brain.solvePlaybackAndResults = await finishFrameSample(page, 12_000);
  brain.solveLongTasks = (await readLongTasks(page)).filter((entry) => entry.startTime >= solveStart);
  brain.finalSolveScreen = await page.locator('#brain-view .brain').getAttribute('data-screen');

  await page.goto('/#/algs/oll/1');
  const sequence = page.locator('[data-case-sequence]');
  await sequence.waitFor();
  brain.algorithmPlayback = await frameSample(page, 4000, () => sequence.locator('[data-sequence="play"]').click());
  brain.algorithmLongTasks = await readLongTasks(page);

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
    }, selector);
  }
  await cdp.send('HeapProfiler.collectGarbage');
  const afterHeap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  brain.routeSwitches = { count: 30, beforeHeapBytes: beforeHeap, afterHeapBytes: afterHeap, growthBytes: afterHeap - beforeHeap, growthMb: (afterHeap - beforeHeap) / (1024 * 1024) };

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? null,
    environment,
    scenarioEnvironment,
    scenarios: {
      startupDesktop: desktopStartup,
      startupPhone: phoneStartup,
      connectingRing: { fps: brain.connectSpin.fps, p95FrameMs: brain.connectSpin.p95FrameMs, elapsedMs: brain.connectElapsedMs },
      phoneIdleGyro: brain.idleGyroPhone,
      idleGyro: { ...brain.idleGyro, longTaskCount: brain.idleGyroLongTasks.length, longestTaskMs: Math.max(0, ...brain.idleGyroLongTasks.map((entry) => entry.durationMs)) },
      simulatedMoveInput: brain.simulatedMoveInput,
      solvePlaybackAndResults: { ...brain.solvePlaybackAndResults, analysisResultsMs: brain.analysisResultsMs, longTaskCount: brain.solveLongTasks.length, longestTaskMs: Math.max(0, ...brain.solveLongTasks.map((entry) => entry.durationMs)), finalScreen: brain.finalSolveScreen },
      algorithmPlayback: { ...brain.algorithmPlayback, longTaskCount: brain.algorithmLongTasks.length, longestTaskMs: Math.max(0, ...brain.algorithmLongTasks.map((entry) => entry.durationMs)) },
      routeSwitches: brain.routeSwitches,
    },
    metrics: {
      'startup.desktopFirstMeaningfulMs': desktopStartup.firstMeaningfulRenderMs,
      'startup.phoneFirstMeaningfulMs': phoneStartup.firstMeaningfulRenderMs,
      'startup.routeScriptEncodedBytes': desktopStartup.routeScriptEncodedBytes,
      'smoothness.desktopIdleGyroFps': brain.idleGyro.fps,
      'smoothness.phoneIdleGyroFps': brain.idleGyroPhone.fps,
      'smoothness.connectingRingFps': brain.connectSpin.fps,
      'smoothness.solvePlaybackFps': brain.solvePlaybackAndResults.fps,
      'smoothness.algorithmPlaybackFps': brain.algorithmPlayback.fps,
      'input.simulatedMoveToNextFrameMs': brain.simulatedMoveInput.eventToFrameMs,
      'analysis.resultRevealMs': brain.analysisResultsMs,
      'memory.routeSwitchGrowthMb': brain.routeSwitches.growthMb,
      'longTasks.maxDuringSolveMs': Math.max(0, ...brain.solveLongTasks.map((entry) => entry.durationMs)),
    },
    trace: null,
    screenshot: path.relative(process.cwd(), screenshotPath),
    limitations: ['BLE-to-frame latency uses an explicitly simulated MOVE event; no physical cube was connected.', 'Route-switch heap deltas are Chromium JS heap measurements after explicit garbage collection; they do not include GPU memory.'],
  };
  // Preserve completed measurements before the separate trace phase. Tracing
  // stays out of every frame-timing window and its completion is bounded.
  await writeFile(path.join(outputDir, 'scenarios.json'), `${JSON.stringify(report, null, 2)}\n`);
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing,loading,v8,disabled-by-default-devtools.timeline',
    transferMode: 'ReturnAsStream',
  });
  await page.goto('/#/solve');
  await page.locator('#brain-view .brain').waitFor();
  await mountTestBrain(page, 'orbit', { route: true });
  await frameSample(page, 1000, () => page.evaluate(() => window.testBrain.emitGyroBurst(900, 16)));
  const tracePath = await writeTrace(cdp);
  report.trace = path.relative(process.cwd(), tracePath);
  await writeFile(path.join(outputDir, 'scenarios.json'), `${JSON.stringify(report, null, 2)}\n`);
  await testInfo.attach('f11-performance-scenarios', { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json' });
  await cdp.detach();
  expect(brain.finalSolveScreen).toBe('results');
});
