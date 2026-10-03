const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

export async function mountFakeCube(page, { delayed = false } = {}) {
  await page.goto('/#/solve');
  await page.evaluate(async ({ delayed, solved }) => {
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'orbit' }));
    const [{ createBrain }, { createSmartCubeSession }] = await Promise.all([
      import('/src/brain.js'), import('/src/smart-cube-session.js'),
    ]);
    let observer;
    let resolveConnection;
    let tick = 0;
    const connection = {
      deviceName: 'GAN F8 layout fixture',
      protocol: { name: 'GAN Gen4' },
      capabilities: { facelets: true },
      events$: { subscribe(value) { observer = value; return { unsubscribe() { observer = null; } }; } },
      async sendCommand() { queueMicrotask(() => observer?.next({ type: 'FACELETS', facelets: solved })); },
      async disconnect() {},
    };
    const session = createSmartCubeSession(() => delayed ? new Promise(resolve => { resolveConnection = resolve; }) : Promise.resolve(connection));
    const emitTurns = moves => moves.split(/\s+/).filter(Boolean).forEach(raw => {
      if (raw.endsWith('2')) {
        tick += 1000; observer?.next({ type: 'MOVE', move: raw[0], cubeTimestamp: tick });
        tick += 20; observer?.next({ type: 'MOVE', move: raw[0], cubeTimestamp: tick });
      } else { tick += 1000; observer?.next({ type: 'MOVE', move: raw, cubeTimestamp: tick }); }
    });
    const root = document.querySelector('#brain-view');
    root.replaceChildren();
    window.testBrain = { session, emitTurns, resolveConnection: () => resolveConnection?.(connection) };
    window.testBrain.handle = createBrain(root, session);
    await window.testBrain.handle.ready;
    window.testBrain.connectPromise = session.connect();
    if (!delayed) await window.testBrain.connectPromise;
  }, { delayed, solved: SOLVED });
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
