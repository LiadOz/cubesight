import { test, expect } from 'playwright/test';

// The Brain v2 controller end to end in a real browser, with a stub shell (the
// visual shell and styles are tested separately): the real smart-cube session
// with a fake GAN connection, the real live tracker, solve store, recorder and
// keyboard. The stub exposes every view-model the controller renders.
async function mountController(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
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
    const log = { updates: 0, frames: 0, styles: [], vm: null, frame: null };
    const createShell = (root, { dispatch }) => {
      root.innerHTML = '<div class="brain" data-brain-style="orbit"><div class="stub-cube" style="width:200px;height:200px"></div></div>';
      window.stubDispatch = dispatch;
      return {
        slots: { cube: root.querySelector('.stub-cube'), timeline: null, inspection: null, results: null },
        update(vm) { log.updates++; log.vm = vm; },
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
  });
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
  expect(v.label).toBe('Perform the scramble');
  expect(v.scramble.moves.map(m => m.state).slice(0, 2)).toEqual(['current', 'todo']);

  await page.evaluate(s => window.testBrain.emitTurns(s), scramble);
  v = await vm(page);
  expect(v.screen).toBe('inspection');
  await expect.poll(() => page.evaluate(() => window.testBrain.log.frame?.inspection?.bigText)).toMatch(/^\d+$/);

  // Solve: undo the scramble. The cross, pairs, OLL and PLL complete along the way.
  await page.evaluate(s => window.testBrain.emitTurns(s), inverse(scramble));
  await expect.poll(async () => (await vm(page)).screen).toBe('results');
  v = await vm(page);
  expect(v.label).toBe('Solved');
  expect(v.results.moves).toBe('13');
  expect(v.results.time.penalty).toBe(null);

  const stored = await page.evaluate(async () => (await import('/src/solve-store.js')).loadSolves(localStorage));
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
  expect((await page.evaluate(async () => (await import('/src/solve-store.js')).loadSolves(localStorage)))[0].penalty).toBe('DNF');
  await page.keyboard.press('Escape');
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
