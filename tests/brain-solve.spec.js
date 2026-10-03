import { test, expect } from './helpers/coverage-test.js';

const STYLES = ['orbit', 'mono'];

// The F1 shared Orbit is mounted by the app shell, outside the legacy Brain
// timeline slot. The tests below read its actual SVG groups; Mono keeps its linear timeline.

async function mountTestBrain(page, style = 'orbit') {
  await page.goto('/#/drills/corners');
  await page.evaluate(async style => {
    localStorage.clear();
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
    const { createBrain } = await import('/src/brain.js');
    const { createSmartCubeSession } = await import('/src/smart-cube-session.js');
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    let observer;
    let tick = 0;
    const connection = {
      deviceName: 'GAN test cube', protocol: { name: 'GAN Gen4' },
      capabilities: { facelets: true },
      events$: { subscribe(value) { observer = value; return { unsubscribe() { observer = null; } }; } },
      async sendCommand() { queueMicrotask(() => observer?.next({ type: 'FACELETS', facelets: solved })); },
      async disconnect() {},
    };
    const session = createSmartCubeSession(() => Promise.resolve(connection));
    // Emit a turn the way a GAN cube does: a double is two quarter-turn MOVE
    // events a few cube ticks apart; separate turns are far apart.
    const emitTurn = move => {
      if (move.endsWith('2')) {
        const quarter = move[0];
        tick += 1000; observer?.next({ type: 'MOVE', move: quarter, cubeTimestamp: tick });
        tick += 20; observer?.next({ type: 'MOVE', move: quarter, cubeTimestamp: tick });
      } else {
        tick += 1000; observer?.next({ type: 'MOVE', move, cubeTimestamp: tick });
      }
    };
    window.testBrain = { session, emitTurns: moves => moves.split(/\s+/).filter(Boolean).forEach(emitTurn) };
    const root = document.createElement('div');
    root.id = 'brain-test';
    document.body.append(root);
    await createBrain(root, session).ready;
    await session.connect();
  }, style);
}

async function openBrainSettings(page, brain) {
  const settings = brain.locator('.brain-pill-setup');
  if (!await settings.evaluate(node => node.open)) await page.keyboard.press(',');
  await expect(settings).toHaveJSProperty('open', true);
}

// Regression: the first solving move after a guided scramble used to throw
// inside a Brain live-tracker subscriber (ReferenceError: STAGES is not
// defined). The exception escaped through the session's MOVE handler and
// desynced the cube with "Unsupported move from cube: R".
for (const style of STYLES) {
test(`Brain survives the scramble-to-solve transition and tracks the solve (${style})`, async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });

  await mountTestBrain(page, style);

  const brain = page.locator('#brain-test');
  await expect.poll(() => page.evaluate(() => window.testBrain.session.getSnapshot().phase)).toBe('tracking');
  await expect(brain.locator('.brain')).toHaveAttribute('data-brain-style', style);

  const scramble = "R2 D' F2 U B2 L' U2 F R' D2 B U' L2";
  await openBrainSettings(page, brain);
  await brain.locator('.brain-advanced-scramble > summary').click();
  await brain.locator('#brain-scramble').fill(scramble);
  await brain.locator('#brain-start-custom').click();
  await expect(brain.locator('#brain-phase-label')).toHaveText('apply scramble');

  await page.evaluate(s => window.testBrain.emitTurns(s), scramble);
  await expect(brain.locator('#brain-phase-label')).toHaveText('inspection');

  // First solving move is a plain R, then primes and doubles.
  await page.evaluate(() => window.testBrain.emitTurns("R U' F2 R' D2 L"));
  expect(await page.evaluate(() => window.testBrain.session.getSnapshot().phase)).toBe('tracking');
  await expect(brain.locator('#brain-timeline')).toBeVisible();
  await expect(brain.locator('#brain-phase-detail')).toContainText('6 moves');

  // Undo those and then the scramble: the cube returns to solved and the solve is logged.
  const inverse = moves => moves.split(' ').reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : `${m}'`).join(' ');
  await page.evaluate(s => window.testBrain.emitTurns(s), `${inverse("R U' F2 R' D2 L")} ${inverse(scramble)}`);
  await expect(brain.locator('#brain-phase-label')).toHaveText('solved');
  await expect(brain.locator('#brain-review')).toBeVisible();

  // The tracker re-emits while done (e.g. toggling inspection); the solve is stored once.
  // The solve history lives in IndexedDB; writes land asynchronously.
  const storedSolves = () => page.evaluate(async () => {
    const backend = await (await import('/src/store/idb.js')).openIdbBackend();
    const count = (await backend.getAll()).length;
    await backend.close();
    return count;
  });
  await expect.poll(storedSolves).toBe(1);
  await page.evaluate(() => {
    const box = document.querySelector('#brain-test #brain-inspection');
    for (let i = 0; i < 3; i++) box.click();
  });
  await page.waitForTimeout(300);
  expect(await storedSolves()).toBe(1);
  await brain.getByRole('button', { name: /next scramble/ }).last().click();
  await expect(brain.locator('#brain-generate')).toBeEnabled();

  // Reset view rebuilds the Brain in place: the old WebGL cube is destroyed and the new
  // view keeps tracking the same connected cube.
  const canvases = () => page.evaluate(() => document.querySelectorAll('canvas').length);
  const before = await canvases();
  await brain.locator('#brain-rebuild-view').click();
  await expect(brain.locator('canvas')).toHaveCount(1);
  expect(await canvases()).toBe(before);
  await openBrainSettings(page, brain);
  await brain.locator('.brain-advanced-scramble > summary').click();
  await brain.locator('#brain-scramble').fill("F R' U2");
  await brain.locator('#brain-start-custom').click();
  await expect(brain.locator('#brain-phase-label')).toHaveText('apply scramble');
  await page.evaluate(() => window.testBrain.emitTurns("F R' U2"));
  await expect(brain.locator('#brain-phase-label')).toHaveText('inspection');
  await page.evaluate(() => window.testBrain.emitTurns("U2 R F'"));
  await expect(brain.locator('#brain-phase-label')).toHaveText('solved');
  expect(await storedSolves()).toBe(2);

  const log = await page.evaluate(async () => (await import('/src/smart-cube-diag.js')).getConnectionLog().map(e => e.label));
  expect(log.filter(label => /listener threw|DESYNC/.test(label))).toEqual([]);
  expect(errors).toEqual([]);
});

const inverse = moves => moves.split(/\s+/).filter(Boolean).reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : `${m}'`).join(' ');

// The guidance text must not be rebuilt on every move (that replays its fade-in and
// flickers), and the timeline marker sits on the stage currently being worked on.
test(`Brain guidance is stable across moves and the timeline tracks the current stage (${style})`, async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.stack || error.message}`));
  await mountTestBrain(page, style);
  const brain = page.locator('#brain-test');
  await expect.poll(() => page.evaluate(() => window.testBrain.session.getSnapshot().phase)).toBe('tracking');

  // A solve built stage by stage (D cross): cross, one F2L pair, EO, CO, AUF + T-perm.
  const steps = {
    cross: "R' F2",
    f2l: "R U' R'",
    eo: "F R U R' U' F'",
    co: "R U R' U R U2 R'",
    pll: "U R U R' U' R' F R2 U' R' U' R U R' F'",
  };
  const scramble = inverse(Object.values(steps).join(' '));
  await openBrainSettings(page, brain);
  await brain.locator('.brain-advanced-scramble > summary').click();
  await brain.locator('#brain-scramble').fill(scramble);
  await brain.locator('#brain-start-custom').click();
  await expect(brain.locator('#brain-phase-label')).toHaveText('apply scramble');
  await expect(brain.locator('#brain-coach .brain-coach-line')).toHaveCount(1);
  await page.waitForTimeout(400);  // let the line's fade-in finish

  // Watch the coach and the scramble cue while a few scramble turns are made.
  await page.evaluate(() => {
    const root = document.querySelector('#brain-test');
    window.guidanceMutations = [];
    window.guidanceLine = root.querySelector('#brain-coach .brain-coach-line');
    window.firstCueChip = root.querySelector('#brain-moves i');
    const record = list => window.guidanceMutations.push(...list.map(m => `${m.target.id || m.target.tagName}:${m.type}:${m.attributeName ?? ''}`));
    window.coachObserver = new MutationObserver(record);
    window.coachObserver.observe(root.querySelector('#brain-coach'), { childList: true, subtree: true, characterData: true, attributes: true });
    // A correct turn may move the class of the chips and update the screen-reader line; nothing else may change.
    const srLine = m => m.target.closest?.('.mg-sr') || m.target.parentElement?.closest?.('.mg-sr');
    window.cueObserver = new MutationObserver(list => record(list.filter(m => !srLine(m) && (m.type !== 'attributes' || m.attributeName !== 'class'))));
    window.cueObserver.observe(root.querySelector('#brain-moves'), { childList: true, subtree: true, characterData: true, attributes: true });
  });
  const firstFour = scramble.split(' ').slice(0, 4).join(' ');
  await page.evaluate(s => window.testBrain.emitTurns(s), firstFour);
  await expect(brain.locator('#brain-phase-detail')).toHaveText(/Scramble move 5 of/);
  const stable = await page.evaluate(() => {
    const root = document.querySelector('#brain-test');
    window.coachObserver.disconnect(); window.cueObserver.disconnect();
    const line = root.querySelector('#brain-coach .brain-coach-line');
    return {
      mutations: window.guidanceMutations,
      sameLine: line === window.guidanceLine,
      sameChip: root.querySelector('#brain-moves i') === window.firstCueChip,
      chipClasses: [...root.querySelectorAll('#brain-moves i')].slice(0, 6).map(i => i.className),
      // A replayed fade-in would restart the line's animation; it finished long ago.
      animating: line.getAnimations().some(a => a.playState === 'running'),
    };
  });
  expect(stable.mutations).toEqual([]);
  expect(stable.sameLine).toBe(true);
  expect(stable.sameChip).toBe(true);
  expect(stable.animating).toBe(false);
  expect(stable.chipClasses).toEqual(['done', 'done', 'done', 'done', 'current', '']);  // the live cue still moves

  // Finish the scramble: inspection shows the timeline sitting on Cross, with no Scramble stage.
  await page.evaluate(s => window.testBrain.emitTurns(s), scramble.split(' ').slice(4).join(' '));
  await expect(brain.locator('#brain-phase-label')).toHaveText('inspection');
  const timeline = brain.locator('#brain-timeline');
  await expect(timeline).toBeVisible();
  const keys = state => page.evaluate(([style, state]) => {
    const orbit = style === 'orbit';
    return [...document.querySelectorAll(orbit ? '.orbit__segment[data-key]' : '#brain-timeline :is(.m-seg, .b-oring-seg)')]
      .filter(el => !state || (orbit ? el.classList.contains(`is-${state}`) : el.dataset.state === state))
      .map(el => el.dataset.key);
  }, [style, state]);
  expect(await keys()).toEqual(style === 'orbit' ? ['inspection', 'plus2', 'dnf'] : ['cross', 'pair1', 'pair2', 'pair3', 'pair4', 'eo', 'co', 'cp', 'ep']);
  const current = async () => (await keys('current'))[0] ?? null;
  const finished = async () => [...await keys('done'), ...await keys('skipped')];
  await expect.poll(current).toBe(style === 'orbit' ? 'inspection' : 'cross');
  expect(await finished()).toEqual([]);
  await page.waitForTimeout(600);  // let the swoop-in finish before the screenshot
  const shot = async name => {
    await page.waitForTimeout(500);  // fill/dot transitions
    await page.screenshot({ path: test.info().outputPath(`${style}-${name}.png`) });
  };
  await shot('1-inspection');

  await page.evaluate(() => window.testBrain.emitTurns("R'"));
  await expect(brain.locator('#brain-phase-label')).toHaveText('cross');
  await expect.poll(current).toBe('cross');
  await shot('2-pre-cross');

  // Coach lines that don't change keep their nodes between solving moves too.
  const coachNodes = () => page.evaluate(() => { window.coachNodes = [...document.querySelectorAll('#brain-test #brain-coach .brain-coach-line')]; });
  const coachKept = () => page.evaluate(() => window.coachNodes.filter(n => n.isConnected).length);
  await page.evaluate(() => window.testBrain.emitTurns('F2'));
  await expect.poll(current).toMatch(/^pair[1-4]$/);   // the cross is done; F2L is next
  expect(await keys('done')).toContain('cross');
  await shot('3-after-cross');
  await coachNodes();
  await page.evaluate(s => window.testBrain.emitTurns(s), "R U'");
  expect(await coachKept()).toBeGreaterThan(0);
  await page.evaluate(() => window.testBrain.emitTurns("R'"));
  await expect.poll(current).toBe('eo');
  expect(await finished()).toEqual(expect.arrayContaining(['cross', 'pair1', 'pair2', 'pair3', 'pair4']));
  await shot('4-after-f2l');

  await page.evaluate(s => window.testBrain.emitTurns(s), steps.eo);
  await expect.poll(current).toBe('co');
  await page.evaluate(s => window.testBrain.emitTurns(s), steps.co);
  await expect.poll(current).toBe('cp');
  await shot('5-after-oll');
  await page.evaluate(s => window.testBrain.emitTurns(s), steps.pll);
  await expect(brain.locator('#brain-phase-label')).toHaveText('solved');
  expect((await finished()).sort()).toEqual(['co', 'cp', 'cross', 'eo', 'ep', 'pair1', 'pair2', 'pair3', 'pair4']);
  await expect(brain.locator('#brain-review')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: test.info().outputPath('6-solved-review.png') });
  // The review is not rebuilt (and its entry animation not replayed) when the tracker re-emits.
  const card = await brain.locator('#brain-review .b-results-host > *').first().elementHandle();
  await page.evaluate(() => { const box = document.querySelector('#brain-test #brain-inspection'); box.click(); box.click(); });
  expect(await card.evaluate(el => el.isConnected)).toBe(true);
  await page.evaluate(() => { document.querySelector('#brain-test #brain-review').style.display = 'none'; });
  await shot('7-solved');
  expect(errors).toEqual([]);
});
}
