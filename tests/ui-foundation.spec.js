import { test, expect } from 'playwright/test';

test('Orbit morph interruption, collapse/expand, keyboard activation and dynamic growth preserve one focused segment', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=results&theme=dark');
  await expect(page.locator('.f0-cube canvas')).toHaveCount(1);
  const segment = page.locator('.f0-orbit [data-segment]').nth(3);
  const key = await segment.getAttribute('data-segment');
  await segment.focus();
  const result = await page.evaluate(async () => {
    const orbit = window.__f0Orbit;
    const current = orbit.options;
    const first = orbit.update({ ...current, shape: 'full', duration: 420 });
    const expanded = orbit.update({ ...current, shape: 'open', size: 'XL', duration: 420,
      segments: [...current.segments, { key: 'interrupted-growth', label: 'undo', weight: 1, state: 'wrong' }] });
    await Promise.all([first, expanded]);
    await orbit.collapse();
    await orbit.expand('L');
    return { shape: orbit.element.dataset.shape, size: orbit.element.dataset.size,
      focused: document.activeElement?.dataset.segment || null,
      oneCanvas: document.querySelectorAll('.f0-cube canvas').length };
  });
  expect(result).toEqual({ shape: 'open', size: 'L', focused: key, oneCanvas: 1 });
  const beforeGrowth = await page.locator('.f0-orbit [data-segment]').count();
  await page.getByRole('button', { name: 'add undo segment' }).click();
  await expect(page.locator('.f0-orbit [data-segment]')).toHaveCount(beforeGrowth + 1);
});

test('crowded Orbit markers expand by keyboard and preserve exact marker lookup', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=results');
  const cluster = page.locator('.f0-orbit [data-marker-cluster].is-cluster').first();
  await expect(cluster).toBeVisible();
  const clusterSize = await cluster.evaluate(node => JSON.parse(node.dataset.markerKeys).length);
  const key = await page.evaluate(() => window.__f0Orbit.current.markers.find(marker => marker.key === 'mark-1')?.key);
  expect(await page.evaluate(keyValue => window.__f0Orbit.getMarkerElement(keyValue)?.dataset.markerKeys, key)).toContain('mark-1');
  await cluster.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.f0-orbit [data-marker-expanded]')).toHaveCount(clusterSize);
  await page.locator('.f0-orbit [data-marker-expanded="mark-1"]').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.f0-coach .ui-coach-line__text')).toContainText(/pause|efficient/);
});

test('case playback keeps a stable color-neutral frame, final state, highlights and a single canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/src/ui/gallery.html?flow=alg');
  const result = await page.evaluate(async () => {
    const [{ Cube }, { stateFromScramble, applyMoves }] = await Promise.all([
      import('/src/ui/cube/index.js'), import('/src/cross-cube.js'),
    ]);
    const host = document.createElement('div'); document.body.append(host);
    const initial = stateFromScramble("R U R' U' F2");
    const cube = new Cube(host, { mode: 'case', size: 'M', state: initial, caseColorSetting: 'any colour', caseSeed: 'f0-case-stable' });
    const canvas = cube.element.querySelector('canvas');
    let recenterCalls = 0;
    cube.cube.recenterGyro = () => { recenterCalls++; };
    document.dispatchEvent(new Event('cubesight-recenter'));
    const chosenTop = cube.displayState.cubies.find(piece => piece.position[1] === 1 && piece.id.length === 1).stickers.U;
    cube.highlight({ slot: 'pair:FR', dimOthers: true });
    const highlighted = Number(canvas.dataset.highlightedStickers);
    const dimmed = Number(canvas.dataset.dimmedStickers);
    const moves = ['R', 'U', "R'", "U'", 'F2'];
    const expected = applyMoves(initial, moves);
    await cube.play(moves, { fullTurns: true, speed: 1000 });
    const afterPlay = cube.displayState.cubies.find(piece => piece.position[1] === 1 && piece.id.length === 1).stickers.U;
    document.dispatchEvent(new Event('cubesight-theme'));
    const afterTheme = cube.displayState.cubies.find(piece => piece.position[1] === 1 && piece.id.length === 1).stickers.U;
    const matches = JSON.stringify(cube.state) === JSON.stringify(expected);
    const sameCanvas = cube.element.querySelector('canvas') === canvas;
    const mode = cube.mode;
    cube.destroy(); host.remove();
    return { chosenTop, afterPlay, afterTheme, matches, sameCanvas, mode, highlighted, dimmed, recenterCalls };
  });
  expect(result.afterPlay).toBe(result.chosenTop);
  expect(result.afterTheme).toBe(result.chosenTop);
  expect(result.matches).toBe(true);
  expect(result.sameCanvas).toBe(true);
  expect(result.mode).toBe('case');
  expect(result.highlighted).toBeGreaterThan(0);
  expect(result.dimmed).toBeGreaterThan(0);
  expect(result.recenterCalls).toBe(1);
});

test('gallery algorithm flow shows the actual PLL case with its requested red top', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=alg');
  const result = await page.evaluate(async () => {
    const { createSolvedState } = await import('/src/cross-cube.js');
    const cube = window.__f0Cube;
    const topLayer = cube.displayState.cubies.filter(piece => piece.position[1] === 1);
    const frontTop = cube.displayState.cubies.filter(piece => piece.position[1] === 1 && piece.stickers.F).map(piece => piece.stickers.F);
    return {
      topCenter: cube.displayState.cubies.find(piece => piece.id === 'U').stickers.U,
      topColorCount: new Set(topLayer.map(piece => piece.stickers.U)).size,
      hasPLLPattern: new Set(frontTop).size > 1,
      logicalCaseIsUnsolved: JSON.stringify(cube.state) !== JSON.stringify(createSolvedState()),
      oneCanvas: document.querySelectorAll('.f0-cube canvas').length,
    };
  });
  expect(result.topCenter).toBe('red');
  expect(result.topColorCount).toBe(1);
  expect(result.hasPLLPattern).toBe(true);
  expect(result.logicalCaseIsUnsolved).toBe(true);
  expect(result.oneCanvas).toBe(1);
});

test('Cube seek cancels an in-flight turn and mount, mode changes and session binding preserve its canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/src/ui/gallery.html');
  const result = await page.evaluate(async () => {
    const [{ Cube }, { createSolvedState, stateFromScramble }] = await Promise.all([
      import('/src/ui/cube/index.js'), import('/src/cross-cube.js'),
    ]);
    const host = document.createElement('div'), nextHost = document.createElement('div');
    document.body.append(host, nextHost);
    const base = createSolvedState();
    const cube = new Cube(host, { mode: 'case', state: base, size: 'M' });
    const canvas = cube.element.querySelector('canvas');
    const stalePlayback = cube.play(['R', 'U', 'F'], { startState: base, speed: .25 });
    await new Promise(resolve => setTimeout(resolve, 60));
    const expectedAfterSeek = cube.seek(1, ['R', 'U', 'F'], { startState: base });
    await stalePlayback;
    const seekStayedCurrent = JSON.stringify(cube.state) === JSON.stringify(expectedAfterSeek);
    cube.mount(nextHost);
    cube.setMode('replay'); cube.setMode('case');
    let gyroApplied = false;
    cube.cube.setGyroOrientation = () => { gyroApplied = true; };
    const unsubscribe = cube.bindSession({ subscribe(listener) { listener({ state: stateFromScramble('R'), gyro: { x: 0, y: 0, z: 0, w: 1 } }); return () => {}; } });
    const sessionApplied = cube.mode === 'live' && JSON.stringify(cube.state) === JSON.stringify(stateFromScramble('R')) && gyroApplied;
    const sameCanvas = canvas === nextHost.querySelector('canvas');
    unsubscribe(); cube.destroy(); host.remove(); nextHost.remove();
    return { seekStayedCurrent, sessionApplied, sameCanvas };
  });
  expect(result).toEqual({ seekStayedCurrent: true, sessionApplied: true, sameCanvas: true });
});

test('global header keeps sync and disconnect available through recovery phases', async ({ page }) => {
  await page.goto('/src/ui/gallery.html');
  const enabled = await page.evaluate(async () => {
    const { createHeader } = await import('/src/ui/shared/index.js');
    const host = document.createElement('div'); document.body.append(host);
    let listener;
    let snapshot = { phase: 'connecting', canSync: false, canDisconnect: true };
    const session = { getSnapshot: () => snapshot, subscribe(callback) { listener = callback; callback(snapshot); return () => {}; } };
    const header = createHeader(host, { session, showDevDrawer: false });
    const result = {};
    for (const phase of ['connecting', 'awaiting-solved', 'desynced', 'interrupted']) {
      snapshot = { phase, canSync: phase !== 'connecting', canDisconnect: true };
      listener(snapshot);
      result[phase] = Object.fromEntries(['connect', 'sync', 'recenter', 'disconnect'].map(action => [action, !header.querySelector(`[data-cube-action="${action}"]`).disabled]));
    }
    snapshot = { phase: 'disconnected', link: { status: 'lost' }, canSync: false, canDisconnect: false };
    listener(snapshot);
    result.lostLink = {
      status: header.querySelector('.ui-cube-chip').getAttribute('aria-label'),
      phase: header.querySelector('.ui-cube-menu').dataset.phase,
      connect: !header.querySelector('[data-cube-action="connect"]').disabled,
    };
    header.destroy(); host.remove(); return result;
  });
  expect(enabled.connecting).toEqual({ connect: false, sync: false, recenter: true, disconnect: true });
  for (const phase of ['awaiting-solved', 'desynced', 'interrupted']) expect(enabled[phase]).toEqual({ connect: false, sync: true, recenter: true, disconnect: true });
  expect(enabled.lostLink).toEqual({ status: 'cube, interrupted; open cube and recording actions', phase: 'interrupted', connect: true });
});

test('the shared header tracks history and solve routes and opens the dev drawer globally', async ({ page }) => {
  for (const [route, active] of [['/history', 'history'], ['/timer', 'solve']]) {
    await page.goto(`/#${route}`);
    await expect(page.locator(`.site-header [data-nav="${active}"]`)).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Backquote');
    await expect(page.locator('.ui-dev-drawer')).toBeVisible();
    await page.locator('.ui-dev-drawer__close').click();
  }
});

test('header themes stay readable and recorder survives a fast full-page reload with anonymized export', async ({ page }) => {
  await page.goto('/#/solve');
  const header = page.locator('.site-header.ui-header');
  await expect(header).toBeVisible();
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  const light = await header.locator('.ui-cube-chip').evaluate(element => getComputedStyle(element).color);
  await page.locator('#theme-toggle').click();
  const changedTheme = await page.locator('html').getAttribute('data-theme');
  expect(changedTheme).not.toBe(initialTheme);
  const dark = await header.locator('.ui-cube-chip').evaluate(element => getComputedStyle(element).color);
  expect(light).not.toBe(dark);
  await page.evaluate(async () => {
    const recorder = await import('/src/recorder.js');
    await recorder.enableRecordingPersistence();
    recorder.resetRecording();
    recorder.record('f0-fast-reload', { deviceName: 'GAN 356 i3', deviceMAC: 'AA:BB:CC:DD:EE:FF', detail: 'device id: device-id-secret-92345' });
  });
  await page.reload();
  await expect.poll(() => page.evaluate(async () => {
    const { getRecording } = await import('/src/recorder.js');
    const recording = getRecording();
    return recording.events.some(event => event.kind === 'f0-fast-reload') && recording.events.some(event => event.kind === 'reload');
  })).toBe(true);
  const exported = await page.evaluate(async () => {
    const { getRecording } = await import('/src/recorder.js');
    return JSON.stringify(getRecording());
  });
  expect(exported).toContain('GAN cube');
  expect(exported).toContain('XX:XX:XX:XX:XX:XX');
  expect(exported).not.toContain('GAN 356 i3');
  expect(exported).not.toContain('AA:BB:CC:DD:EE:FF');
  expect(exported).not.toContain('device-id-secret-92345');
  await page.locator('.ui-cube-chip').click();
  await page.locator('[data-cube-action="report-problem"]').click();
  await expect(page).toHaveURL(/#\/recording$/);
  await expect(page.locator('#recording-view')).toBeVisible();
  await expect(page.locator('#recording-count')).toContainText('local buffer');
  await page.evaluate(async () => {
    const recorder = await import('/src/recorder.js');
    recorder.clearRecording();
    recorder.record('f0-after-clear', {});
  });
  await page.reload();
  await expect.poll(() => page.evaluate(async () => {
    const { getRecording } = await import('/src/recorder.js');
    return getRecording().events.some(event => event.kind === 'f0-after-clear')
      && getRecording().events.some(event => event.kind === 'reload');
  })).toBe(true);
  const afterClear = await page.evaluate(async () => (await import('/src/recorder.js')).getRecording().events.map(event => event.kind));
  expect(afterClear).not.toContain('f0-fast-reload');
});
