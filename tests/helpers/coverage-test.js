import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test as base, expect } from 'playwright/test';
import { buildFunctionTable, executedFunctionKeys } from '../../scripts/test-functions.mjs';

const unionSorted = (a = [], b = []) => [...new Set([...a, ...b])].sort();

export function mergeCoverageObservations(previous, current) {
  if (previous?.testId !== current.testId || previous.retry !== current.retry) {
    return { ...current, coverageContexts: 1 };
  }
  const union = (field, merge) => {
    const result = {};
    for (const source of new Set([...Object.keys(previous[field] ?? {}), ...Object.keys(current[field] ?? {})])) {
      result[source] = merge(previous[field]?.[source], current[field]?.[source]);
    }
    return result;
  };
  const merged = {
    ...current,
    files: unionSorted(previous.files, current.files),
    coverageContexts: (previous.coverageContexts ?? 1) + 1,
  };
  if (previous.lineCoverage || current.lineCoverage) merged.lineCoverage = union('lineCoverage', (a, b) => unionSorted(a, b).sort((x, y) => x - y));
  if (previous.functions || current.functions) merged.functions = union('functions', unionSorted);
  return merged;
}

// Parsing a 2,000-line module costs ~100 ms, so each worker parses a given
// source text once. The served text (Vite-transformed) is what V8's offsets refer to.
const tableCache = new Map();
function tableFor(source) {
  const key = createHash('sha1').update(source).digest('hex');
  if (!tableCache.has(key)) {
    let table = null;
    try { table = buildFunctionTable(source); } catch { /* unparsable: record the module only */ }
    tableCache.set(key, table);
  }
  return tableCache.get(key);
}

// One instrumentation per page, however many paths ask for it (the `page` fixture,
// a context a test opened itself, a page it opened on that context).
const instrumented = new WeakMap();

export async function beginCoverage(page, testInfo) {
  if (process.env.CUBESIGHT_IMPACT_COVERAGE !== '1') return async () => {};
  if (!instrumented.has(page)) instrumented.set(page, startCoverage(page, testInfo));
  return instrumented.get(page);
}

async function startCoverage(page, testInfo) {
  const finish = await begin(page, testInfo);
  let done = null;
  return async () => { done ??= finish(); await done; };
}

async function begin(page, testInfo) {
  const devtools = await page.context().newCDPSession(page);
  await devtools.send('Profiler.enable');
  await devtools.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
  return async () => {
    const { result: coverage } = await devtools.send('Profiler.takePreciseCoverage');
    await devtools.send('Profiler.stopPreciseCoverage');
    const functions = {};
    const files = [];
    const executedScripts = [];
    for (const entry of coverage) {
      if (!entry.url.startsWith('http://127.0.0.1:') && !entry.url.startsWith('http://localhost:')) continue;
      const pathname = decodeURIComponent(new URL(entry.url).pathname).replace(/\?.*$/u, '');
      if (!pathname.startsWith('/src/')) continue;
      if (!entry.functions.some((fn) => fn.ranges.some((range) => range.count > 0))) continue;
      executedScripts.push({ source: pathname.slice(1), entry });
    }
    if (executedScripts.length) await devtools.send('Debugger.enable');
    for (const { source, entry } of executedScripts) {
      files.push(source);
      try {
        const { scriptSource } = await devtools.send('Debugger.getScriptSource', { scriptId: entry.scriptId });
        const table = tableFor(scriptSource);
        if (table) functions[source] = unionSorted(functions[source], executedFunctionKeys(table, entry.functions));
      } catch { /* module-level coverage only */ }
    }
    if (executedScripts.length) await devtools.send('Debugger.disable').catch(() => {});
    await devtools.detach();
    const data = {
      testId: testInfo.testId,
      retry: testInfo.retry,
      workerIndex: testInfo.workerIndex,
      title: testInfo.titlePath.join(' › '),
      grepTitle: testInfo.titlePath.join(' '),
      titlePath: testInfo.titlePath,
      spec: path.relative(process.cwd(), testInfo.file).replaceAll('\\', '/'),
      files: [...new Set(files)],
      functions,
    };
    const name = createHash('sha256').update(`${testInfo.testId}:${testInfo.retry}:${testInfo.workerIndex}`).digest('hex');
    const directory = path.resolve(process.env.CUBESIGHT_IMPACT_COVERAGE_DIR || 'test-results/impact-map/raw');
    await mkdir(directory, { recursive: true });
    const outputPath = path.join(directory, `${name}.json`);
    let previous;
    try { previous = JSON.parse(await readFile(outputPath, 'utf8')); } catch { previous = null; }
    await writeFile(outputPath, `${JSON.stringify(mergeCoverageObservations(previous, data))}\n`);
  };
}

// Tests that open their own contexts (`browser.newContext()`, `browser.newPage()`) bypass the
// `page` fixture. Instrument those pages too, finishing before the page or context closes,
// because coverage cannot be read from a closed page.
async function trackPage(page, testInfo, finishers) {
  const finish = await beginCoverage(page, testInfo);
  finishers.push(finish);
  const close = page.close.bind(page);
  page.close = async (...args) => { await finish().catch(() => {}); return close(...args); };
}

async function watchContext(context, testInfo, finishers) {
  context.on('page', (page) => { trackPage(page, testInfo, finishers).catch(() => {}); });
  for (const page of context.pages()) await trackPage(page, testInfo, finishers);
  const close = context.close.bind(context);
  context.close = async (...args) => {
    await Promise.all(context.pages().map((page) => beginCoverage(page, testInfo).then((finish) => finish()).catch(() => {})));
    return close(...args);
  };
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const finishCoverage = await beginCoverage(page, testInfo);
    await use(page);
    await finishCoverage();
  },
  coverageOwnContexts: [async ({ browser }, use, testInfo) => {
    if (process.env.CUBESIGHT_IMPACT_COVERAGE !== '1') { await use(); return; }
    const finishers = [];
    const newContext = browser.newContext.bind(browser);
    const newPage = browser.newPage.bind(browser);
    browser.newContext = async (...args) => { const context = await newContext(...args); await watchContext(context, testInfo, finishers); return context; };
    browser.newPage = async (...args) => { const page = await newPage(...args); await trackPage(page, testInfo, finishers); return page; };
    try { await use(); } finally {
      browser.newContext = newContext;
      browser.newPage = newPage;
      await Promise.all(finishers.map((finish) => finish().catch(() => {})));
    }
  }, { auto: true }],
});

export { expect };
