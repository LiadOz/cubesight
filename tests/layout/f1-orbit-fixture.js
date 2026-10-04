// Real-page F1 layout driver. The route owns the only Brain controller and
// header cube session; the replay adapter replaces only the physical device
// connection behind that shared session.
import { mountFakeCube, completeScramble, solveReverse } from './fake-cube.js';
import { getCase } from '../../src/algs/seed/cases.js';
import { invertAlg } from '../../src/algs/notation.js';
import { applyMoves, stateFromScramble } from '../../src/cross-cube.js';

const cubeKey = state => JSON.stringify(state?.cubies?.map(({ id, position, stickers }) => [id, position, stickers]) ?? null);

const SCRAMBLE = "R2 D' F2 U B2 L' U2 F";

function mountedView(page) {
  return page.evaluate(() => window.__cubesightSnapshot?.getViewModel?.() ?? null);
}

async function requireView(page, screen) {
  const envelope = await mountedView(page);
  if (!envelope || envelope.owner !== 'F1' || !envelope.viewModel) throw new Error('F1 fixture requires the real mounted Brain handle through the F0 snapshot bridge');
  if (screen && envelope.viewModel.screen !== screen) throw new Error(`expected mounted F1 screen ${screen}, received ${envelope.viewModel.screen}`);
  return envelope.viewModel;
}

async function startF1(page, { delayed = false } = {}) {
  await mountFakeCube(page, { delayed });
  await page.waitForFunction(() => Boolean(window.__cubesightSnapshot?.getViewModel?.()?.viewModel));
  // Brain loads the Orbit style asynchronously after first mount. Do not begin
  // interacting while that swap can still replace the settings controls.
  await page.waitForFunction(() => document.querySelector('#brain-view .brain')?.dataset.brainStyle === 'orbit');
}

async function startGuided(page, scramble = SCRAMBLE) {
  await page.locator('#brain-view .brain-pill-setup > summary').click();
  await page.locator('#brain-view .brain-advanced-scramble > summary').click();
  await page.locator('#brain-scramble').fill(scramble);
  await page.locator('#brain-start-custom').click();
  await page.waitForFunction(() => window.__cubesightSnapshot?.getViewModel?.()?.viewModel?.screen === 'scramble');
}

async function finishInspection(page, scramble = SCRAMBLE) {
  await completeScramble(page, scramble);
  await page.waitForFunction(() => window.__cubesightSnapshot?.getViewModel?.()?.viewModel?.screen === 'inspection');
}

async function finishSolve(page, scramble = SCRAMBLE) {
  await startGuided(page, scramble);
  await finishInspection(page, scramble);
  await solveReverse(page, scramble);
  await page.waitForFunction(() => window.__cubesightSnapshot?.getViewModel?.()?.viewModel?.screen === 'results');
}

function caseSolveMoves() {
  const f2l = "F' D' F D B D' R D' R U R' U' L' U' L U R' U R U' L U L' U'".split(' ');
  const oll = getCase('oll/1')?.algs?.find(alg => alg.verified) ?? getCase('oll/1')?.algs?.[0];
  const pll = getCase('pll/T')?.algs?.find(alg => alg.verified) ?? getCase('pll/T')?.algs?.[0];
  if (!oll?.moves || !pll?.moves) throw new Error('positive OLL 1 and PLL T algorithms are missing from the case library');
  return [...f2l, ...oll.moves.split(/\s+/), ...pll.moves.split(/\s+/)];
}

async function finishCaseSolve(page) {
  const solution = caseSolveMoves();
  const scramble = invertAlg(solution.join(' ')).join(' ');
  await startGuided(page, scramble);
  await completeScramble(page, scramble);
  await page.waitForFunction(() => window.__cubesightSnapshot.getViewModel().viewModel.screen === 'inspection');
  await page.evaluate(moves => window.testBrain.emitTimed(moves.join(' '), () => 24), solution);
  await page.waitForFunction(() => window.__cubesightSnapshot.getViewModel().viewModel.screen === 'results');
  await page.waitForFunction(() => {
    const record = window.__cubesightSnapshot.getViewModel().viewModel.results?.record;
    return record?.analysis?.lastLayer?.oll || record?.analysis?.ollCase;
  }, null, { timeout: 30_000 });
  return requireView(page, 'results');
}

export async function driveF1OrbitFixture(page, { f1State, clockInstalled = false, clockTime } = {}) {
  if (!f1State) throw new Error('F1 fixture state is required');
  const delayed = f1State === 'connecting-full';
  if (['inspection-plus2', 'inspection-dnf-ticks'].includes(f1State) && !clockInstalled) {
    await page.clock.install(clockTime ? { time: new Date(clockTime) } : {});
  }
  await startF1(page, { delayed });

  if (f1State === 'connecting-full') {
    const envelope = await mountedView(page);
    if (envelope?.viewModel?.screen !== 'connecting') throw new Error('connecting fixture did not reach the full real connecting screen');
    return;
  }
  if (f1State === 'idle' || f1State === 'settings-open') {
    await requireView(page, 'idle');
    if (f1State === 'settings-open') {
      await page.locator('.brain-pill-setup > summary').click();
      await page.waitForFunction(() => window.testBrain?.handle?.getViewModel()?.settings?.open === true);
    }
    return;
  }

  if (['live-results', 'case-choices', 'staged-detail-comparison', 'marker-detail', 'past-results-review-deeplink'].includes(f1State)) {
    const vm = ['case-choices', 'staged-detail-comparison', 'marker-detail'].includes(f1State)
      ? await finishCaseSolve(page)
      : (await finishSolve(page), await requireView(page, 'results'));
    if (f1State === 'live-results') return;
    if (f1State === 'case-choices') {
      const cases = vm.results?.caseLinks ?? {};
      if (cases.oll?.id !== '1' || cases.pll?.id !== 'T' || !Object.values(cases).some(item => item.kind === 'f2l' && item.id === '4' && item.targetPair === 'FR')) throw new Error('real completed solve did not produce canonical OLL 1 / PLL T / F2L case 4 for the FR slot');
      const caseChecks = [
        { stage: 'co', kind: 'oll', id: '1' },
        { stage: 'ep', kind: 'pll', id: 'T' },
        { stage: 'pair1', kind: 'f2l', id: '4' },
      ];
      for (const item of caseChecks) {
        const segment = page.locator(`#brain-view [data-segment="${item.stage}"]`).first();
        if (!(await segment.count())) throw new Error(`results Orbit has no real ${item.stage} stage`);
        await segment.evaluate(node => {
          node.focus();
          node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });
        const prompt = page.locator('#brain-view .f1-results__case-prompt');
        if (!(await prompt.isVisible())) throw new Error(`selecting the ${item.stage} segment did not expose its case prompt`);
        if (!(await prompt.evaluate(node => node.closest('details')?.open))) await prompt.click();
        const links = await page.locator('#brain-view .f1-results__case-links a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
        const algorithm = `#/algs/${item.kind}/${item.id}?`;
        const drill = item.kind === 'pll' ? '#/drills/pll?cases=T&' : `#/drills/${item.kind}?cases=${item.id}&`;
        if (links.length !== 2 || !links.some(href => href.startsWith(algorithm)) || !links.some(href => href.startsWith(drill))) throw new Error(`${item.stage} case prompt must expose exactly its algorithm and case-specific drill routes`);
        if (links.some(href => !href.includes('from=%23%2Fsolve'))) throw new Error(`${item.stage} case links must preserve the exact source route`);
        if (item.kind !== 'f2l' && links.some(href => !href.includes('recognitionMs=') || !href.includes('executionMs='))) throw new Error(`${item.stage} case links must preserve finite recognition/execution timings`);
      }
      return;
    }
    if (f1State === 'staged-detail-comparison') {
      const segment = page.locator('#brain-view [data-segment="cross"]');
      if (!(await segment.count())) throw new Error('real Orbit has no cross stage for the proven comparison fixture');
      await segment.evaluate(node => { node.focus(); node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      await page.waitForFunction(() => window.__cubesightSnapshot.getViewModel().viewModel.results?.review?.detail?.stageKey === 'cross');
      const initial = await page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.results.record);
      const compare = await page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.results.review.detail.compare);
      if (compare.status !== 'better' || !compare.better.length || compare.better.length >= compare.yours.length) throw new Error('actual cross analysis did not prove a shorter comparison for the real solve');
      const yours = page.locator('#brain-view .b-rev-variant[data-variant="yours"]');
      const better = page.locator('#brain-view .b-rev-variant[data-variant="better"]');
      if (!(await yours.isVisible()) || !(await better.isVisible())) throw new Error('selected cross stage has no yours/better comparison controls');
      const expectedYours = cubeKey(applyMoves(stateFromScramble(initial.scramble), initial.solveMoves.slice(0, compare.from).concat(compare.yours)));
      await yours.click();
      await page.waitForFunction(() => window.__cubesightSnapshot.getViewModel().viewModel.results?.review?.detail?.variant === 'yours');
      await page.waitForFunction(expected => {
        const state = window.testBrain?.handle?.getCubeState?.();
        return JSON.stringify(state?.cubies?.map(({ id, position, stickers }) => [id, position, stickers]) ?? null) === expected;
      }, expectedYours, { timeout: 10_000 });
      const expectedBetter = cubeKey(applyMoves(stateFromScramble(initial.scramble), initial.solveMoves.slice(0, compare.from).concat(compare.better)));
      await better.click();
      await page.waitForFunction(() => window.__cubesightSnapshot.getViewModel().viewModel.results?.review?.detail?.variant === 'better');
      await page.waitForFunction(expected => {
        const state = window.testBrain?.handle?.getCubeState?.();
        return JSON.stringify(state?.cubies?.map(({ id, position, stickers }) => [id, position, stickers]) ?? null) === expected;
      }, expectedBetter, { timeout: 10_000 });
      if (expectedYours === expectedBetter) throw new Error('the proven review variants do not lead to distinct cube states');
      return;
    }
    const marker = page.locator('#brain-view .orbit__marker-cluster, #brain-view [data-marker-detail-key]').first();
    if (f1State === 'marker-detail') {
      if (!(await marker.count())) throw new Error('actual results Orbit did not render any review marker');
      await marker.click();
      await page.waitForFunction(() => Boolean(window.__cubesightSnapshot.getViewModel().viewModel.results?.review?.detail));
      return;
    }
    const review = page.locator('#brain-view .f1-results__actions a[href^="#/review/"]').first();
    const href = await review.getAttribute('href');
    if (!href || !href.startsWith('#/review/')) throw new Error('live results review link is not a local deep link');
    await review.click();
    await page.waitForFunction(() => location.hash.startsWith('#/review/'));
    await page.waitForFunction(() => Boolean(document.querySelector('#review-view .solve-review-page .sr-layout')), null, { timeout: 45_000 });
    if (!page.url().includes('#/review/')) throw new Error('review deep link did not navigate from actual live results');
    const reviewModel = await page.evaluate(() => ({ mounted: Boolean(document.querySelector('#review-view .solve-review-page .sr-layout')), hasMoves: Boolean(document.querySelector('#review-view .solve-review-page .sr-moves li')), route: location.hash }));
    if (!reviewModel.mounted || !reviewModel.hasMoves) throw new Error(`deep review route did not render the selected solve: ${JSON.stringify(reviewModel)}`);
    return;
  }

  await startGuided(page);
  if (f1State === 'guided-scramble-current-progress') {
    await page.evaluate(() => window.testBrain.emitTurns("R2 D'"));
    const vm = await requireView(page, 'scramble');
    if (vm.scramble?.step !== 2 || !vm.scramble.moves.some(move => move.state === 'current')) throw new Error('guided scramble progress did not use the real tracked move position');
    return;
  }
  if (f1State === 'wrong-turn-undo') {
    await page.evaluate(() => window.testBrain.emitTurns("R2 D' L"));
    const vm = await requireView(page, 'scramble');
    if (!vm.scramble?.recovery?.length || !vm.scramble.wrongTurn) throw new Error('wrong-turn state did not expose a real recovery sequence');
    const segments = await page.locator('#brain-view [data-segment]').evaluateAll(nodes => nodes.map(node => node.dataset.segment));
    if (!segments.some(key => key.startsWith('undo-'))) throw new Error('Orbit did not append recovery turns after the original scramble');
    return;
  }

  if (f1State === 'inspection-normal' || f1State === 'inspection-plus2' || f1State === 'inspection-dnf-ticks') {
    await finishInspection(page);
    if (f1State !== 'inspection-normal') {
      await page.clock.fastForward(f1State === 'inspection-plus2' ? 16_000 : 18_000);
      await page.waitForTimeout(60);
    }
    const vm = await requireView(page, 'inspection');
    const fills = await page.locator('#brain-view .orbit__segment[data-key]')
      .evaluateAll(groups => Object.fromEntries(groups.map(group => [group.dataset.key, group.querySelector('.orbit__segment-fill')?.getAttribute('d') ?? ''])));
    if (f1State === 'inspection-normal' && vm.inspection?.penalty) throw new Error(`normal inspection unexpectedly has ${vm.inspection.penalty}`);
    if (f1State === 'inspection-plus2' && (vm.inspection?.penalty !== '+2' || !fills.inspection || !fills.plus2 || fills.dnf)) throw new Error('at 16s, mounted model and Orbit paths must show normal complete, +2 filling, and DNF empty');
    if (f1State === 'inspection-dnf-ticks' && (vm.inspection?.penalty !== 'DNF' || !(vm.inspection?.ticks ?? []).some(tick => tick.passed) || !fills.inspection || !fills.plus2 || !fills.dnf)) throw new Error('at 18s, mounted model and Orbit paths must show DNF with passed ticks and all three zone fills');
    return;
  }

  if (f1State === 'solving-fill') {
    await finishInspection(page);
    await page.evaluate(() => window.testBrain.emitTurns('F\''));
    await page.waitForFunction(() => window.__cubesightSnapshot.getViewModel().viewModel.screen === 'solving');
    const vm = await requireView(page, 'solving');
    if (!vm.timeline?.segments?.some(segment => segment.state === 'current')) throw new Error('solve in progress has no current stage');
    return;
  }

  throw new Error(`unknown F1 Orbit fixture state: ${f1State}`);
}

export function registerF1OrbitFixture(registerLayoutDriver) {
  if (typeof registerLayoutDriver !== 'function') throw new TypeError('F1 fixture registration requires registerLayoutDriver');
  return registerLayoutDriver('f1-orbit-fixture', driveF1OrbitFixture);
}
