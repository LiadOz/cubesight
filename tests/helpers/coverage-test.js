import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test as base, expect } from 'playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const enabled = process.env.CUBESIGHT_IMPACT_COVERAGE === '1';
    let devtools;
    if (enabled) {
      devtools = await page.context().newCDPSession(page);
      await devtools.send('Profiler.enable');
      await devtools.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
    }
    await use(page);
    if (!enabled) return;

    const { result: coverage } = await devtools.send('Profiler.takePreciseCoverage');
    await devtools.send('Profiler.stopPreciseCoverage');
    await devtools.detach();
    const data = {
      testId: testInfo.testId,
      title: testInfo.titlePath.join(' › '),
      spec: path.relative(process.cwd(), testInfo.file).replaceAll('\\', '/'),
      files: coverage.flatMap((entry) => {
        if (!entry.url.startsWith('http://127.0.0.1:') && !entry.url.startsWith('http://localhost:')) return [];
        const pathname = decodeURIComponent(new URL(entry.url).pathname).replace(/\?.*$/u, '');
        if (!pathname.startsWith('/src/')) return [];
        const executed = entry.functions.some((fn) => fn.ranges.some((range) => range.count > 0));
        return executed ? [pathname.slice(1)] : [];
      }),
    };
    const name = createHash('sha256').update(`${testInfo.testId}:${testInfo.retry}:${testInfo.workerIndex}`).digest('hex');
    const directory = path.resolve('test-results/impact-map/raw');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${name}.json`), `${JSON.stringify(data)}\n`);
  },
});

export { expect };
