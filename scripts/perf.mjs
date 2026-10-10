#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { gpuLaunchOptions, inspectBrowserGpu, requireHardwareWebGL } from './browser-gpu.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'test-results/perf');
const reportPath = path.join(outputDir, 'report.json');
const browserReportPath = path.join(outputDir, 'playwright-report.json');
await mkdir(outputDir, { recursive: true });

const storageCheck = spawnSync('df', ['-Pk', outputDir], { cwd: root, encoding: 'utf8' });
const storageRow = storageCheck.stdout.trim().split('\n').at(-1)?.trim().split(/\s+/) ?? [];
const availableKb = Number(storageRow[3]);
const allowCiStorage = process.env.CUBESIGHT_PERF_ALLOW_NON_HOST_ARTIFACTS === '1';
const isHostBacked = storageRow[0] === 'host' || storageRow[0]?.startsWith('/dev/');
if (storageCheck.status !== 0 || (!isHostBacked && !allowCiStorage) || availableKb < 10 * 1024 * 1024) {
  throw new Error(`Performance output needs a host-backed disk with at least 10 GiB free; keep sandbox output under .agents/. CI may set CUBESIGHT_PERF_ALLOW_NON_HOST_ARTIFACTS=1 for other storage.\n${storageCheck.stdout}${storageCheck.stderr}`);
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

// Fail before builds, engine benchmarks or cube rendering when no hardware
// backend is available. The perf spec verifies its own browser again.
const browserEnv = { ...process.env, GITHUB_SHA: commit, PLAYWRIGHT_JSON_OUTPUT_NAME: browserReportPath };
if (process.argv.includes('--gpu')) {
  const attempts = [];
  let selected = null;
  for (const backend of process.env.CUBESIGHT_GPU_BACKEND ? [process.env.CUBESIGHT_GPU_BACKEND] : ['auto', 'vulkan']) {
    const launch = gpuLaunchOptions({ ...process.env, CUBESIGHT_GPU_BACKEND: backend });
    let browser;
    try {
      browser = await chromium.launch(launch);
      const report = await inspectBrowserGpu(browser);
      attempts.push({ backend, launch, ...report });
      if (report.hardwareWebGL) { selected = backend; break; }
    } catch (error) { attempts.push({ backend, launch, hardwareWebGL: false, error: error.message }); }
    finally { await browser?.close(); }
  }
  await mkdir(path.join(root, 'test-results/gpu'), { recursive: true });
  await writeFile(path.join(root, 'test-results/gpu/info.json'), `${JSON.stringify(attempts, null, 2)}\n`);
  requireHardwareWebGL(attempts.at(-1));
  browserEnv.CUBESIGHT_PERF_GPU = '1';
  browserEnv.VITE_CUBESIGHT_TEST_STUB = '0';
  browserEnv.CUBESIGHT_GPU_BACKEND = selected;
  console.log(`Hardware WebGL2 verified: ${attempts.at(-1).webgl.renderer} (${selected})`);
}

const benchmark = spawnSync('node', ['scripts/benchmark-pair-search.mjs'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (benchmark.status !== 0) throw new Error(`Pair-search benchmark failed (exit ${benchmark.status}):\n${benchmark.stderr}`);
let engine;
try { engine = JSON.parse(benchmark.stdout); }
catch { throw new Error('Pair-search benchmark did not return valid JSON.'); }

const browserRun = spawnSync('npx', ['playwright', 'test', '--config=playwright.perf.config.js', '--reporter=json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: browserEnv,
});
if (browserRun.status !== 0) throw new Error(`Performance browser capture failed (exit ${browserRun.status}):\n${browserRun.stderr}`);

const browser = JSON.parse(await readFile(path.join(outputDir, 'scenarios.json'), 'utf8'));
const metrics = {
  ...browser.metrics,
  'engine.pairSearchTableColdMs': engine.tableColdMs,
  'engine.pairSearchMedianMs': engine.latencyMs.median,
  'engine.pairSearchP95Ms': engine.latencyMs.p95,
  'engine.pairSearchMaxMs': engine.latencyMs.max,
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit,
  environment: browser.environment,
  scenarioEnvironment: browser.scenarioEnvironment,
  metrics,
  scenarios: browser.scenarios,
  engine: {
    fixture: engine.fixture,
    fixtureSeed: engine.fixtureSeed,
    inputs: engine.inputs,
    tableColdMs: engine.tableColdMs,
    latencyMs: engine.latencyMs,
    proven: engine.proven,
    partial: engine.partial,
    verificationFailures: engine.verificationFailures,
    memory: engine.memory,
  },
  trace: browser.trace,
  screenshot: browser.screenshot,
  playwrightReport: path.relative(root, browserReportPath),
  limitations: browser.limitations,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const readable = [
  '# CubeSight performance report',
  '',
  `Generated ${report.generatedAt} at commit ${commit}.`,
  `Environment: Chromium ${browser.environment.browserVersion}, ${browser.environment.renderer}, desktop CPU ×${browser.environment.cpuThrottleDesktop}, phone CPU ×${browser.environment.cpuThrottlePhone}.`,
  'Startup figures use the production preview after the service worker controls the page; desktop and phone measurements are cache-backed.',
  `Interaction scenarios use ${browser.scenarioEnvironment.origin} with metricsAreProduction=${browser.scenarioEnvironment.metricsAreProduction}; the fixture owns a single Brain controller and renderer.`,
  '',
  '| Measurement | Value |',
  '| --- | ---: |',
  ...Object.entries(metrics).map(([name, value]) => `| ${name} | ${typeof value === 'number' ? `${Number(value.toFixed(2))}` : String(value)} |`),
  '',
  `CDP trace: ${browser.trace}.`,
  `Limitations: ${browser.limitations.join(' ')}`,
  '',
];
await writeFile(path.join(outputDir, 'report.md'), readable.join('\n'));
console.log(readable.join('\n'));
