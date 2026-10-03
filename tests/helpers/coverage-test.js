import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test as base, expect } from 'playwright/test';

export function mergeCoverageObservations(previous, current) {
  if (previous?.testId !== current.testId || previous.retry !== current.retry) {
    return { ...current, coverageContexts: 1 };
  }
  return {
    ...current,
    files: [...new Set([...(previous.files ?? []), ...(current.files ?? [])])].sort(),
    coverageContexts: (previous.coverageContexts ?? 1) + 1,
  };
}

export function executedLineNumbers(source, functions) {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) if (source[index] === '\n') lineStarts.push(index + 1);
  const ranges = functions.flatMap((fn) => fn.ranges ?? []).filter((range) => Number.isInteger(range.startOffset)
    && Number.isInteger(range.endOffset) && range.endOffset > range.startOffset);
  const executed = [];
  for (let index = 0; index < lineStarts.length; index += 1) {
    const start = lineStarts[index];
    const end = index + 1 < lineStarts.length ? lineStarts[index + 1] : source.length;
    if (!source.slice(start, end).trim()) continue;
    const boundaries = [...new Set([start, end, ...ranges.flatMap(({ startOffset, endOffset }) => [startOffset, endOffset])
      .filter((offset) => offset > start && offset < end)])].sort((a, b) => a - b);
    for (let point = 0; point + 1 < boundaries.length; point += 1) {
      const middle = (boundaries[point] + boundaries[point + 1]) / 2;
      const innermost = ranges.reduce((selected, range) => {
        if (range.startOffset > middle || range.endOffset <= middle) return selected;
        return !selected || range.endOffset - range.startOffset < selected.endOffset - selected.startOffset ? range : selected;
      }, null);
      if (innermost?.count > 0) {
        executed.push(index + 1);
        break;
      }
    }
  }
  return executed;
}

export async function beginCoverage(page, testInfo) {
  if (process.env.CUBESIGHT_IMPACT_COVERAGE !== '1') return async () => {};
  const devtools = await page.context().newCDPSession(page);
  await devtools.send('Profiler.enable');
  await devtools.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
  return async () => {
    const { result: coverage } = await devtools.send('Profiler.takePreciseCoverage');
    await devtools.send('Profiler.stopPreciseCoverage');
    await devtools.detach();
    const lineCoverage = {};
    const files = [];
    for (const entry of coverage) {
      if (!entry.url.startsWith('http://127.0.0.1:') && !entry.url.startsWith('http://localhost:')) continue;
      const pathname = decodeURIComponent(new URL(entry.url).pathname).replace(/\?.*$/u, '');
      if (!pathname.startsWith('/src/')) continue;
      if (!entry.functions.some((fn) => fn.ranges.some((range) => range.count > 0))) continue;
      const source = pathname.slice(1);
      files.push(source);
      const contents = await readFile(path.resolve(source), 'utf8');
      lineCoverage[source] = executedLineNumbers(contents, entry.functions);
    }
    const data = {
      testId: testInfo.testId,
      retry: testInfo.retry,
      workerIndex: testInfo.workerIndex,
      title: testInfo.titlePath.join(' › '),
      grepTitle: testInfo.titlePath.join(' '),
      titlePath: testInfo.titlePath,
      spec: path.relative(process.cwd(), testInfo.file).replaceAll('\\', '/'),
      files: [...new Set(files)],
      lineCoverage,
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

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const finishCoverage = await beginCoverage(page, testInfo);
    await use(page);
    await finishCoverage();
  },
});

export { expect };
