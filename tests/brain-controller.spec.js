import { test, expect } from 'playwright/test';

// The Brain v2 controller end to end in a real browser, with a stub shell (the
// visual shell and styles are tested separately): the real smart-cube session
// with a fake GAN connection, the real live tracker, solve store, recorder and
// keyboard. The stub exposes every view-model the controller renders.

// The solves as stored in IndexedDB (after every queued write has landed).
const storedSolves = page => page.evaluate(async () => {
  await window.testBrain.view.flushHistory();
  const backend = await (await import('/src/store/idb.js')).openIdbBackend();
  const all = await backend.getAll();
  await backend.close();
  return all;
});
async function mountController(page, { fresh = true } = {}) {
  await page.goto('/#/drills/corners');
  await page.evaluate(async fresh => {
    if (fresh) localStorage.clear();
    const { mountBrainController } = await import('/src/brain/controller.js');
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
    const emitTurn = move => {
      if (move.endsWith('2')) {
        tick += 1000; observer?.next({ type: 'MOVE', move: move[0], cubeTimestamp: tick });
        tick += 20; observer?.next({ type: 'MOVE', move: move[0], cubeTimestamp: tick });
      } else {
        tick += 1000; observer?.next({ type: 'MOVE', move, cubeTimestamp: tick });
      }
    };
    const log = { updates: 0, frames: 0, commandOpens: 0, styles: [], vm: null, frame: null };
    const createShell = (root, { dispatch }) => {
      root.innerHTML = '<div class="brain" data-brain-style="orbit"><div class="stub-cube" style="width:200px;height:200px"></div><div id="brain-toggles"></div></div>';
      window.stubDispatch = dispatch;
      return {
        slots: { cube: root.querySelector('.stub-cube'), timeline: null, inspection: null, results: null },
        update(vm) { log.updates++; log.vm = vm; if (vm.commandOpen) log.commandOpens++; },
        frame(f) { log.frames++; log.frame = f; },
        setStyle(mod) { log.styles.push(mod.id); },
        destroy() {},
      };
    };
    const loadStyle = async id => ({ id, layout: 'column', timeline: () => ({ update() {}, destroy() {} }), inspection: () => ({ update() {}, destroy() {} }), results: () => ({ update() {}, destroy() {} }) });
    const root = document.createElement('div');
    root.id = 'brain-test';
    document.body.append(root);
    const view = mountBrainController(root, session, { createShell, loadStyle, rebuild() {} });
    window.testBrain = { session, view, log, emitTurns: moves => moves.split(/\s+/).filter(Boolean).forEach(emitTurn) };
    await session.connect();
  }, fresh);
}

const vm = page => page.evaluate(() => {
  const v = window.testBrain.log.vm;
  return { screen: v.screen, label: v.phaseText.label, detail: v.phaseText.detail, scramble: v.scramble, clock: v.clock, results: v.results, settingsOpen: v.settings.open, style: v.style, error: v.error, timeline: v.timeline };
});
const inverse = moves => moves.split(' ').reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : `${m}'`).join(' ');

test('controller: guided scramble, inspection, solve, splits, penalties and keys', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  await mountController(page);
  await expect.poll(async () => (await vm(page)).screen).toBe('idle');
  expect(await page.evaluate(() => window.testBrain.log.styles)).toEqual(['orbit']);

  const scramble = "R2 D' F2 U B2 L' U2 F R' D2 B U' L2";
  await page.evaluate(s => { window.stubDispatch({ type: 'setScrambleText', text: s }); window.stubDispatch({ type: 'start' }); }, scramble);
  let v = await vm(page);
  expect(v.screen).toBe('scramble');
  expect(v.scramble.number).toBe(1);
  expect(v.label).toBe('apply scramble');
  expect(v.scramble.moves.map(m => m.state).slice(0, 2)).toEqual(['current', 'todo']);

  await page.evaluate(s => window.testBrain.emitTurns(s), scramble);
  v = await vm(page);
  expect(v.screen).toBe('inspection');
  await expect.poll(() => page.evaluate(() => window.testBrain.log.frame?.inspection?.bigText)).toMatch(/^\d+$/);

  // Solve: undo the scramble. The cross, pairs, OLL and PLL complete along the way.
  await page.evaluate(s => window.testBrain.emitTurns(s), inverse(scramble));
  await expect.poll(async () => (await vm(page)).screen).toBe('results');
  v = await vm(page);
  expect(v.label).toBe('solved');
  expect(v.results.moves).toBe('13');
  expect(v.results.time.penalty).toBe(null);

  const stored = await storedSolves(page);
  expect(stored).toHaveLength(1);
  const [record] = stored;
  expect(record.moveTimes).toHaveLength(13);
  expect(record.splits.map(s => s.key)).toEqual(['cross', 'pair1', 'pair2', 'pair3', 'pair4', 'eo', 'co', 'cp', 'ep']);
  const splitSum = record.splits.reduce((sum, s) => sum + s.ms, 0);
  expect(Math.abs(splitSum - record.solveMs)).toBeLessThan(1);
  expect(record.config).toMatchObject({ method: 'cfop', oll: '2look', pll: '2look' });

  // Keys on the results screen: 2 toggles +2, d marks DNF, esc opens settings.
  await page.keyboard.press('2');
  expect((await vm(page)).results.time.penalty).toBe('+2');
  await page.keyboard.press('2');
  expect((await vm(page)).results.time.penalty).toBe(null);
  await page.keyboard.press('d');
  expect((await vm(page)).results.time.text).toBe('DNF');
  expect((await storedSolves(page))[0].penalty).toBe('DNF');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.testBrain.log.commandOpens)).toBe(1);
  expect((await vm(page)).settingsOpen).toBe(true);
  await page.keyboard.press('Escape');
  expect((await vm(page)).settingsOpen).toBe(false);

  // r retries the same scramble.
  await page.keyboard.press('r');
  v = await vm(page);
  expect(v.screen).toBe('scramble');
  expect(v.scramble.text).toBe(scramble);
  await page.keyboard.press('Escape');
  expect((await vm(page)).screen).toBe('idle');

  // Settings persist, and a style change loads the style module.
  await page.evaluate(() => window.stubDispatch({ type: 'command', text: 'style mono' }));
  expect((await vm(page)).style).toBe('mono');
  await expect.poll(() => page.evaluate(() => window.testBrain.log.styles)).toEqual(['orbit', 'mono']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-brain-settings-v2')).style)).toBe('mono');
  await page.evaluate(() => window.stubDispatch({ type: 'command', text: 'bogus 3' }));
  expect((await vm(page)).error).toBe('Unknown command: bogus 3');

  // The controller fills the coach switches and applies them.
  expect(await page.locator('#brain-toggles [data-brain-toggle]').count()).toBe(8);
  await page.locator('[data-brain-toggle="f2lHint"]').uncheck();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-brain-settings-v2')).toggles.f2lHint)).toBe(false);

  // Free mode refuses a solved cube with a clear error.
  await page.evaluate(() => { window.stubDispatch({ type: 'setSetting', path: 'scramble', value: 'free' }); window.stubDispatch({ type: 'start' }); });
  expect((await vm(page)).error).toBe('Scramble the cube first.');

  await page.evaluate(() => window.testBrain.view.detach());
  expect(await page.evaluate(() => document.querySelector('#brain-test').innerHTML)).toBe('');
  expect(errors).toEqual([]);
});

test('controller: the solving clock runs per frame and a hidden timer is reported', async ({ page }) => {
  test.setTimeout(60_000);
  await mountController(page);
  await expect.poll(async () => (await vm(page)).screen).toBe('idle');
  await page.evaluate(() => { window.stubDispatch({ type: 'setSetting', path: 'inspection', value: { mode: 'off' } }); window.stubDispatch({ type: 'setScrambleText', text: 'R U' }); window.stubDispatch({ type: 'start' }); });
  await page.evaluate(() => window.testBrain.emitTurns('R U'));
  expect((await vm(page)).screen).toBe('ready');
  await page.evaluate(() => window.testBrain.emitTurns('F'));
  expect((await vm(page)).screen).toBe('solving');
  const first = await page.evaluate(() => window.testBrain.log.frames);
  await expect.poll(() => page.evaluate(() => window.testBrain.log.frames)).toBeGreaterThan(first + 3);
  await page.keyboard.press('t');
  expect((await vm(page)).clock.hidden).toBe(true);
  const timeline = (await vm(page)).timeline;
  expect(timeline.segments[timeline.currentIndex].state).toBe('current');
});

test('controller: settings changed during a replay stay in memory', async ({ page }) => {
  await mountController(page);
  await expect.poll(async () => (await vm(page)).screen).toBe('idle');
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-brain-settings-v2') || 'null')?.style ?? null);
  await page.evaluate(async () => {
    const recorder = await import('/src/recorder.js');
    recorder.setReplayHooks({ now: () => 0, speed: 0 });
    window.stubDispatch({ type: 'setSetting', path: 'style', value: 'mono' });
    recorder.setReplayHooks(null);
  });
  expect((await vm(page)).style).toBe('mono');
  expect(await saved()).toBe(null);
  await page.evaluate(() => window.stubDispatch({ type: 'setSetting', path: 'timer', value: 'hide' }));
  expect(await saved()).toBe('mono');
});

test('history: solves survive a reload; any solve can be edited, deleted and restored', async ({ page }) => {
  test.setTimeout(60_000);
  await mountController(page);
  await page.evaluate(async () => { // a clean IndexedDB: the app's own view may have opened it already
    const backend = await (await import('/src/store/idb.js')).openIdbBackend();
    await backend.apply({ clear: true });
    await backend.close();
  });
  await page.reload();
  await mountController(page, { fresh: false });
  await expect.poll(async () => (await vm(page)).screen).toBe('idle');

  const solveOnce = async scramble => {
    await page.evaluate(s => { window.stubDispatch({ type: 'setSetting', path: 'inspection', value: { mode: 'off' } }); window.stubDispatch({ type: 'setScrambleText', text: s }); window.stubDispatch({ type: 'start' }); }, scramble);
    await page.evaluate(s => window.testBrain.emitTurns(s), scramble);
    await page.evaluate(s => window.testBrain.emitTurns(s), inverse(scramble));
    await expect.poll(async () => (await vm(page)).screen).toBe('results');
  };
  await solveOnce("R U R' U'");
  await page.evaluate(() => window.stubDispatch({ type: 'dismissResults' }));
  await solveOnce("F R U' R'");
  expect((await storedSolves(page))).toHaveLength(2);

  // Reload: the history is still there and both solves share one automatic session.
  await page.reload();
  await mountController(page, { fresh: false });
  await expect.poll(() => page.evaluate(() => window.testBrain.log.vm?.stats.allTime.solves)).toBe('2');
  let stored = await storedSolves(page);
  expect(stored.map(r => r.sessionId)).toEqual([stored[0].sessionId, stored[0].sessionId]);
  expect(await page.evaluate(() => window.testBrain.log.vm.stats.session.solves)).toBe('2');

  // Edit the penalty of the OLDER solve, not the latest.
  const [older, newer] = stored;
  await page.evaluate(at => window.stubDispatch({ type: 'setPenalty', at, penalty: '+2' }), older.at);
  stored = await storedSolves(page);
  expect(stored.map(r => r.penalty)).toEqual(['+2', null]);

  // Delete the older solve, then undo: it comes back in place with its penalty.
  await page.evaluate(at => window.stubDispatch({ type: 'deleteSolve', at }), older.at);
  expect((await storedSolves(page)).map(r => r.at)).toEqual([newer.at]);
  expect(await page.evaluate(() => window.testBrain.log.vm.stats.allTime.solves)).toBe('1');
  await page.evaluate(() => window.stubDispatch({ type: 'undoDelete' }));
  stored = await storedSolves(page);
  expect(stored.map(r => [r.at, r.penalty])).toEqual([[older.at, '+2'], [newer.at, null]]);
  expect(await page.evaluate(() => window.testBrain.log.vm.stats.allTime.solves)).toBe('2');

  // The deleted-and-restored state survives another reload.
  await page.reload();
  await mountController(page, { fresh: false });
  await expect.poll(() => page.evaluate(() => window.testBrain.log.vm?.stats.allTime.solves)).toBe('2');
});
