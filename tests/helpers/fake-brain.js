// Shared by the Brain specs that drive a fake GAN cube: mounts the real Brain on
// a scripted smart-cube connection and exposes window.testBrain.emitTurns().
export async function mountTestBrain(page, style = 'orbit', { route = false, fixture = false, settings = {}, keepStorage = false, connectDelayMs = 0, awaitConnect = true } = {}) {
  // route: mount into an existing #brain-view so the page-level theme rules apply.
  // fixture: use a minimal dev entry with no app router/auto-mounted Brain. This
  // keeps performance scenarios to one controller and one renderer at a time.
  if (!fixture) await page.goto(route ? '/#/brain' : '/');
  if (fixture || route) await page.waitForSelector('#brain-view', { state: 'attached' });
  await page.evaluate(async ({ style, route, settings, keepStorage, connectDelayMs, awaitConnect }) => {
    // The fixture can be remounted on the same SPA route; stop its previous
    // RAF, WebGL renderer, and session subscription before replacing its DOM.
    const previousCanvas = window.testBrain?.root?.querySelector('.b-cube-wrap canvas') ?? null;
    window.testBrain?.handle?.detach?.();
    if (previousCanvas?.isConnected) throw new Error('Previous Brain renderer canvas survived detach.');
    if (!keepStorage) localStorage.clear();
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style, ...settings }));
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
    const session = createSmartCubeSession(async () => {
      if (connectDelayMs > 0) await new Promise(resolve => setTimeout(resolve, connectDelayMs));
      return connection;
    });
    // A double is two quarter-turn MOVE events a few cube ticks apart; separate turns are far apart.
    const emitTurn = raw => {
      const move = raw.replace('2', '');
      if (raw.endsWith('2')) {
        tick += 1000; observer?.next({ type: 'MOVE', move, cubeTimestamp: tick });
        tick += 20; observer?.next({ type: 'MOVE', move, cubeTimestamp: tick });
      } else {
        tick += 1000; observer?.next({ type: 'MOVE', move: raw, cubeTimestamp: tick });
      }
    };
    // Timed turns: real waits between moves (the host clock drives the move times) and matching
    // cube timestamps. gapFor(i, move) returns the wait before move i in ms.
    const emitTimed = async (moves, gapFor = () => 60) => {
      const list = moves.split(/\s+/).filter(Boolean);
      for (let i = 0; i < list.length; i++) {
        const gap = Math.max(1, gapFor(i, list[i]));
        await new Promise(resolve => setTimeout(resolve, gap));
        const raw = list[i];
        if (raw.endsWith('2')) {
          tick += gap; observer?.next({ type: 'MOVE', move: raw[0], cubeTimestamp: tick });
          tick += 20; observer?.next({ type: 'MOVE', move: raw[0], cubeTimestamp: tick });
        } else { tick += gap; observer?.next({ type: 'MOVE', move: raw, cubeTimestamp: tick }); }
      }
    };
    const emitGyroBurst = async (durationMs = 1000, intervalMs = 16) => {
      const started = performance.now();
      let sample = 0;
      while (performance.now() - started < durationMs) {
        const angle = sample++ / 25;
        observer?.next({ type: 'GYRO', quaternion: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) } });
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
      return sample;
    };
    const emitMeasuredTurn = async raw => {
      const eventAt = performance.now();
      emitTurn(raw);
      const frameAt = await new Promise(resolve => requestAnimationFrame(resolve));
      return { eventToFrameMs: frameAt - eventAt, frameAt };
    };
    window.testBrain = { session, emitTurns: moves => moves.split(/\s+/).filter(Boolean).forEach(emitTurn), emitTimed, emitGyroBurst, emitMeasuredTurn };
    const root = route ? document.querySelector('#brain-view') : document.createElement('div');
    if (route) root.replaceChildren(); else { root.id = 'brain-test'; document.body.append(root); }
    window.testBrain.handle = createBrain(root, session);
    window.testBrain.root = root;
    await window.testBrain.handle.ready;
    if (fixture && root.querySelectorAll('.b-cube-wrap canvas').length !== 1) {
      throw new Error(`Expected one owned Cube renderer; found ${root.querySelectorAll('.b-cube-wrap canvas').length}.`);
    }
    const connecting = session.connect();
    window.testBrain.connecting = connecting;
    if (awaitConnect) await connecting;
  }, { style, route, settings, keepStorage, connectDelayMs, awaitConnect });
}

/** Start a guided scramble from the advanced "use a specific scramble" box. */
export async function startGuidedScramble(page, scramble, selector = '#brain-test') {
  const brain = page.locator(selector);
  // The legacy detached Brain test host is hidden by the shared app shell.
  // Mounted-route tests still drive the real settings disclosure directly.
  await brain.locator('.brain-pill-setup').evaluate(node => { node.open = true; });
  await brain.locator('.brain-advanced-scramble').evaluate(node => { node.open = true; });
  await brain.locator('#brain-scramble').fill(scramble);
  await brain.locator('#brain-start-custom').click();
}

/**
 * Scramble, inspect and solve `solution` with real pauses: `gaps` maps a move index to the wait (ms)
 * before it (default 60). Returns when the results screen is showing.
 */
export async function playSolve(page, scramble, solution, { gaps = {}, base = 60, brain = '#brain-test' } = {}) {
  const root = page.locator(brain);
  await root.locator('.brain-pill-setup > summary').click();
  await root.locator('.brain-advanced-scramble > summary').click();
  await root.locator('#brain-scramble').fill(scramble);
  await root.locator('#brain-start-custom').click();
  await page.evaluate(s => window.testBrain.emitTurns(s), scramble);
  await root.locator('#brain-phase-label').filter({ hasText: 'inspection' }).waitFor();
  await page.evaluate(([s, gaps, base]) => window.testBrain.emitTimed(s, i => gaps[i] ?? base), [solution, gaps, base]);
  await root.locator('#brain-phase-label').filter({ hasText: 'solved' }).waitFor();
}
