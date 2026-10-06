// Captures the live app for every frame in frames.mjs. Run through `npm run design:diff`, not by hand.
// Reuses the Tier 2 snapshot machinery (tests/layout/state-drivers.js, tests/helpers/fake-brain.js): a fake
// smart cube injected through window.__CUBESIGHT_TEST_CUBE_FACTORY__ (?__f11CubeTest=...), localStorage
// seeding (cubesight-solves-v1, HISTORY_SEED), a seeded Math.random and a fixed clock.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from 'playwright/test';
import { getLayoutDriver, getLayoutMatrix } from '../../tests/layout/matrix.js';
import { HISTORY_SEED } from '../../tests/layout/fixtures/state-seeds.js';
import '../../tests/layout/state-drivers.js';
import { FRAMES, RICH_AT } from './frames.mjs';
import { buildRichSeed } from './rich-seed.mjs';
import { ollRoundStorage } from './drill-seed.mjs';

const readJson = name => JSON.parse(readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url), 'utf8'));
// Recorded cross-suggestion / analysis answers, so the app never waits on the real solver worker.
const REPLAY_INPUTS = { ...readJson('cross-suggestion-replay-inputs.json'), ...readJson('solve-analysis-replay-inputs.json') };
const OUT = process.env.DESIGN_DIFF_OUT;
const FIXED_TIME = new Date('2026-01-15T12:00:00.000Z');
const FIXTURES = new Map(getLayoutMatrix().states.map(state => [state.id, state]));

test.describe.configure({ mode: 'parallel' });

for (const frame of FRAMES) {
  test(`capture ${frame.frame}`, async ({ page }) => {
    test.setTimeout(90_000);
    mkdirSync(join(OUT, frame.frame), { recursive: true });
    const [width, height] = frame.viewport;
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(inputs => {
      window.__cubesightSnapshotReplayClock = { ms: 0 };
      window.__cubesightSnapshotReplayInputs = inputs;
      localStorage.setItem('cubesight-theme', 'dark');
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'orbit' }));
      if (!localStorage.getItem('cubesight-solves-v1')) localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: [] }));
      let state = 0x51f15e;
      Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; };
    }, REPLAY_INPUTS);
    await page.clock.setFixedTime(FIXED_TIME);

    if (frame.driver.fixture) {
      const fixture = FIXTURES.get(frame.driver.fixture);
      if (!fixture) throw new Error(`no layout fixture ${frame.driver.fixture}`);
      await getLayoutDriver(fixture.driver)(page, { ...fixture, id: fixture.id, fixture, fixedNow: FIXED_TIME.getTime(), clockInstalled: false, clockTime: FIXED_TIME });
      if (frame.driver.fixture === 'inspection') {
        await expect.poll(() => page.evaluate(() => Boolean(window.__cubesightSnapshot.getViewModel().viewModel.inspection?.bestStart)), { timeout: 10_000 }).toBe(true);
      }
      if (frame.driver.fixture === 'results') {
        await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.results.review.status), { timeout: 30_000 }).toBe('done');
        await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.toast)).toBeNull();
      }
      if (fixture.route !== frame.route) throw new Error(`fixture ${fixture.id} lives on ${fixture.route}, table says ${frame.route}`);
    } else {
      const seed = frame.driver.seed === 'rich' ? await buildRichSeed() : HISTORY_SEED;
      const selectedAt = frame.driver.seed === 'rich' ? RICH_AT : HISTORY_SEED.records[0].at;
      await page.addInitScript(records => localStorage.setItem('cubesight-solves-v1', JSON.stringify(records)), seed);
      if (frame.driver.storage === 'oll-round') await page.addInitScript(entries => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value)); }, ollRoundStorage());
      await page.goto(`/#${frame.route}`);
      await page.waitForFunction(hash => location.hash === hash, `#${frame.route}`);
      await expect.poll(() => page.evaluate(() => Boolean(window.__cubesightSnapshot?.getViewModel()?.viewModel)), { timeout: 20_000 }).toBe(true);
      if (/^\/history\/\d/.test(frame.route)) {
        await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.selected?.at), { timeout: 20_000 }).toBe(selectedAt);
      }
      if (frame.driver.replayFraction != null) {
        const total = seed.records.find(record => record.at === selectedAt).solveMoves.length;
        const target = Math.round(total * frame.driver.replayFraction);
        for (let index = 0; index < target; index++) await page.keyboard.press('ArrowRight');
        await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.selected.move)).toBe(target);
      }
    }

    await page.evaluate(async () => {
      await Promise.all([document.fonts.load('500 14px "Manrope Variable"', 'CubeSight'), document.fonts.load('500 12px "DM Mono"', 'R U 12.34')]);
      await document.fonts.ready;
    });
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Settled means two consecutive frames are byte-identical (late async paints, canvas loads).
    const shot = () => page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
    let previous = await shot(), current = previous;
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.waitForTimeout(150);
      current = await shot();
      if (current.equals(previous)) break;
      previous = current;
    }
    writeFileSync(join(OUT, frame.frame, 'app.png'), current);
  });
}
