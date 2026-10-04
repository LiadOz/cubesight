// Shared by the Brain specs that drive a fake GAN cube: mounts the real Brain on
// a scripted smart-cube connection and exposes window.testBrain.emitTurns().
function installTestCubeFactory(config = null) {
  if (!config) {
    try {
      const encoded = new URL(location.href).searchParams.get('__f11CubeTest');
      if (encoded) config = JSON.parse(encoded);
    } catch { /* A normal application page has no test fixture configuration. */ }
  }
  if (!config) return;
  const { style, settings, keepStorage, connectDelayMs, deferConnect } = config;
  if (!keepStorage) localStorage.clear();
  localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style, ...settings }));
  window.__CUBESIGHT_TEST_CUBE_FACTORY__ = async () => {
    // Snapshot replay uses the production recorder's injectable replay clock.
    // Real frame scheduling stays available, while solve timings come from
    // deterministic event gaps instead of browser/CDP latency.
    const replayClock = window.__cubesightSnapshotReplayClock;
    if (replayClock) {
      const { setReplayHooks } = await import('/src/recorder.js');
      setReplayHooks({ now: () => replayClock.ms, speed: 0, read: (kind, fallback) => {
        if (!kind.startsWith('brain.crossSuggestion:') && !kind.startsWith('brain.analysis:')) return fallback();
        const input = window.__cubesightSnapshotReplayInputs?.[kind];
        if (!input) throw new Error(`Snapshot replay has no recorded input for ${kind}`);
        return structuredClone(input);
      } });
    }
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    let observer;
    let resolveConnection;
    let tick = 0;
    const connection = {
      deviceName: 'GAN test cube', protocol: { name: 'GAN Gen4' },
      capabilities: { facelets: true },
      events$: { subscribe(value) { observer = value; return { unsubscribe() { observer = null; } }; } },
      async sendCommand() { queueMicrotask(() => observer?.next({ type: 'FACELETS', facelets: solved })); },
      async disconnect() {},
    };
    const connectDevice = async () => {
      if (deferConnect) await new Promise(resolve => { resolveConnection = resolve; });
      if (connectDelayMs > 0) await new Promise(resolve => setTimeout(resolve, connectDelayMs));
      return connection;
    };
    // A double is two quarter-turn MOVE events a few cube ticks apart; separate turns are far apart.
    const emitTurn = raw => {
      if (replayClock) replayClock.ms += 1000;
      const move = raw.replace('2', '');
      if (raw.endsWith('2')) {
        tick += 1000; observer?.next({ type: 'MOVE', move, cubeTimestamp: tick });
        tick += 20; if (replayClock) replayClock.ms += 20;
        observer?.next({ type: 'MOVE', move, cubeTimestamp: tick });
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
        if (replayClock) replayClock.ms += gap;
        else await new Promise(resolve => setTimeout(resolve, gap));
        const raw = list[i];
        if (raw.endsWith('2')) {
          tick += gap; observer?.next({ type: 'MOVE', move: raw[0], cubeTimestamp: tick });
          tick += 20; if (replayClock) replayClock.ms += 20;
          observer?.next({ type: 'MOVE', move: raw[0], cubeTimestamp: tick });
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
      const canvas = window.testBrain.root.querySelector('.b-cube-wrap canvas');
      const animationStarted = new Promise((resolve, reject) => {
        let observer;
        const timer = setTimeout(() => { observer?.disconnect(); reject(new Error('Live move did not reach the Cube animation start.')); }, 5000);
        observer = new MutationObserver(() => {
          const startedAt = performance.now();
          if (canvas.hasAttribute('data-turning-face')) { clearTimeout(timer); observer.disconnect(); resolve(startedAt); }
        });
        observer.observe(canvas, { attributes: true, attributeFilter: ['data-turning-face'] });
      });
      emitTurn(raw);
      const animationAt = await animationStarted;
      const frameAt = await new Promise(resolve => requestAnimationFrame(resolve));
      return { eventToAnimationStartMs: animationAt - eventAt, eventToFirstFrameMs: frameAt - eventAt, frameAt };
    };
    return {
      fixtureId: config.fixtureId,
      connectDevice,
      resolveConnection: () => resolveConnection?.(connection),
      emitTurns: moves => moves.split(/\s+/).filter(Boolean).forEach(emitTurn),
      emitTimed,
      emitGyroBurst,
      emitMeasuredTurn,
    };
  };
}

export async function mountTestBrain(page, style = 'orbit', { route = false, fixture = false, settings = {}, keepStorage = false, connectDelayMs = 0, deferConnect = false, awaitConnect = true } = {}) {
  const config = { style, settings, keepStorage, connectDelayMs, deferConnect };
  // Route tests install a scripted adapter before the app starts, then drive
  // the single Brain controller that main.js owns on the shared smartCube.
  if (route && !fixture) {
    config.fixtureId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.addInitScript(installTestCubeFactory);
    await page.goto(`/?__f11CubeTest=${encodeURIComponent(JSON.stringify(config))}#/brain`);
    await page.waitForFunction(id => window.testBrain?.fixtureId === id
      && window.testBrain.handle && window.testBrain.root === document.querySelector('#brain-view'), config.fixtureId, { timeout: 10_000 });
  } else {
    if (!fixture) await page.goto('/');
    if (fixture) await page.waitForSelector('#brain-view', { state: 'attached' });
    await page.evaluate(installTestCubeFactory, config);
    await page.evaluate(async ({ fixture }) => {
      const previous = window.testBrain;
      const previousCanvas = previous?.root?.querySelector('.b-cube-wrap canvas') ?? null;
      previous?.handle?.detach?.();
      if (fixture && previous?.session) await previous.session.disconnect();
      if (fixture) await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (previousCanvas?.isConnected) throw new Error('Previous Brain renderer canvas survived detach.');
      if (fixture && window.__f11PendingAnimationFrames?.() !== 0) {
        throw new Error(`Brain teardown left ${window.__f11PendingAnimationFrames()} animation frame callback(s) pending.`);
      }
      const fake = await window.__CUBESIGHT_TEST_CUBE_FACTORY__();
      const [{ createBrain }, { smartCube, setReplayConnectDevice }] = await Promise.all([
        import('/src/brain.js'), import('/src/smart-cube-bluetooth.js'),
      ]);
      setReplayConnectDevice(fake.connectDevice);
      const root = fixture ? document.querySelector('#brain-view') : document.createElement('div');
      if (fixture) root.replaceChildren(); else { root.id = 'brain-test'; document.body.append(root); }
      const handle = createBrain(root, smartCube);
      window.testBrain = { ...fake, session: smartCube, handle, root };
      await handle.ready;
      if (fixture && root.querySelectorAll('.b-cube-wrap canvas').length !== 1) {
        throw new Error(`Expected one owned Cube renderer; found ${root.querySelectorAll('.b-cube-wrap canvas').length}.`);
      }
    }, { fixture });
  }
  await page.evaluate(() => {
    window.testBrain.connecting = window.testBrain.session.connect();
  });
  if (awaitConnect) await page.waitForFunction(() => window.testBrain?.session.getSnapshot().phase === 'tracking', undefined, { timeout: 10_000 });
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
  if (await page.evaluate(() => Boolean(window.__cubesightSnapshotReplayClock))) {
    await page.waitForFunction(() => Boolean(window.__cubesightSnapshot.getViewModel().viewModel.inspection?.bestStart));
  }
  await page.evaluate(([s, gaps, base]) => window.testBrain.emitTimed(s, i => gaps[i] ?? base), [solution, gaps, base]);
  await root.locator('#brain-phase-label').filter({ hasText: 'solved' }).waitFor();
}
