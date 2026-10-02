const hookedPages = new WeakSet();

export async function installBrainSnapshotHook(page) {
  if (hookedPages.has(page)) return;
  hookedPages.add(page);
  await page.route('**/src/brain/index.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const anchor = 'view = mountBrainController(root, cubeSession, { createShell, loadStyle, rebuild: mount });';
    if (!source.includes(anchor)) throw new Error('F9 could not attach the view-model capture hook to the shared Brain controller.');
    await route.fulfill({
      response,
      body: source.replace(anchor, `${anchor}\n    if (globalThis.testBrain) globalThis.testBrain.handle = { getViewModel: () => view?.getViewModel() ?? null };`),
    });
  });
}

export async function mountFakeCube(page, { delayed = false } = {}) {
  await installBrainSnapshotHook(page);
  // Let main.js build the shared header and its one lifetime-owned cube session
  // before installing the adapter. The actual solve page must consume this same
  // session so the shared cube chip and the Brain never show different states.
  await page.goto('/');
  await page.evaluate(async ({ delayed }) => {
    const [{ smartCube, setReplayConnectDevice }, { createManualDevice }] = await Promise.all([
      import('/src/smart-cube-bluetooth.js'), import('/src/recording-replay.js'),
    ]);
    const device = createManualDevice({ deviceName: 'GAN F8 layout fixture' });
    let resolveConnection;
    let tick = 0;
    setReplayConnectDevice(() => delayed
      ? new Promise(resolve => { resolveConnection = () => resolve(device.connection); })
      : Promise.resolve(device.connection));
    const emitTurns = moves => moves.split(/\s+/).filter(Boolean).forEach(raw => {
      if (raw.endsWith('2')) {
        tick += 1000; device.move(raw[0], tick);
        tick += 20; device.move(raw[0], tick);
      } else { tick += 1000; device.move(raw, tick); }
    });
    const emitTimed = async (moves, gapMs = 24) => {
      for (const raw of moves.split(/\s+/).filter(Boolean)) {
        await new Promise(resolve => setTimeout(resolve, Math.max(1, gapMs)));
        if (raw.endsWith('2')) {
          tick += 1000; device.move(raw[0], tick);
          tick += 20; device.move(raw[0], tick);
        } else { tick += 1000; device.move(raw, tick); }
      }
    };
    window.testBrain = { session: smartCube, device, emitTurns, emitTimed, resolveConnection: () => resolveConnection?.() };
  }, { delayed });
  await page.goto('/#/solve');
  await page.waitForSelector('#brain-view .brain', { state: 'attached' });
  await page.evaluate(() => { window.testBrain.connectPromise = window.testBrain.session.connect(); });
  if (!delayed) await page.evaluate(() => window.testBrain.connectPromise);
}

export async function startScramble(page, scramble = "R2 D' F2 U B2 L' U2 F") {
  const brain = page.locator('#brain-view');
  await brain.locator('.brain-pill-setup > summary').click();
  await brain.locator('.brain-advanced-scramble > summary').click();
  await brain.locator('#brain-scramble').fill(scramble);
  await brain.locator('#brain-start-custom').click();
  return scramble;
}

export async function completeScramble(page, scramble) {
  await page.evaluate(moves => window.testBrain.emitTurns(moves), scramble);
}

export async function solveReverse(page, scramble) {
  const solution = scramble.split(/\s+/).reverse().map(move => {
    if (move.endsWith('2')) return move;
    return move.endsWith("'") ? move[0] : `${move}'`;
  }).join(' ');
  await page.evaluate(moves => window.testBrain.emitTurns(moves), solution);
  return solution;
}
