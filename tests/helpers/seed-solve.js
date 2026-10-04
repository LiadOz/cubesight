import { analyzeSolveAsync, analysisInputFromRecord, summarizeAnalysis } from '../../src/analysis/index.js';
import { loadNodeSolver } from '../../src/analysis/node-solver.js';
import { HISTORY_SEED } from '../layout/fixtures/state-seeds.js';

const preparedRecords = new Map();

export function prepareScreenRecord(record) {
  const key = JSON.stringify(record);
  if (!preparedRecords.has(key)) preparedRecords.set(key, (async () => {
    const { input } = analysisInputFromRecord(record);
    if (record.analysis || !input) return record;
    const analysis = summarizeAnalysis(await analyzeSolveAsync(input, await loadNodeSolver(), { pairs: true }));
    return { ...record, analysis };
  })());
  return preparedRecords.get(key);
}

// Screen tests seed stored data before app startup. End-to-end tracker tests
// continue to send real cube events through fake-brain.js.
export async function seedSolve(page, { record = HISTORY_SEED.records[0], style = 'orbit', theme = 'dark' } = {}) {
  record = await prepareScreenRecord(record);
  await page.addInitScript(value => {
    localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: [value.record] }));
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: value.style }));
    localStorage.setItem('cubesight-theme', value.theme);
  }, { record, style, theme });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-01-15T12:00:00Z'));
}

export async function visualCell(page, { theme, width, height }) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.evaluate(async mode => (await import('/src/theme.js')).setThemePreference(mode), theme);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
