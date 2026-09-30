// Shared by the Brain specs that drive a fake GAN cube: mounts the real Brain on
// a scripted smart-cube connection and exposes window.testBrain.emitTurns().
export async function mountTestBrain(page, style = 'orbit') {
  await page.goto('/');
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
    window.testBrain = { session, emitTurns: moves => moves.split(/\s+/).filter(Boolean).forEach(emitTurn) };
    const root = document.createElement('div');
    root.id = 'brain-test';
    document.body.append(root);
    await createBrain(root, session).ready;
    await session.connect();
  }, style);
}

/** Start a guided scramble from the advanced "use a specific scramble" box. */
export async function startGuidedScramble(page, scramble) {
  const brain = page.locator('#brain-test');
  await brain.locator('.brain-pill-setup > summary').click();
  await brain.locator('.brain-advanced-scramble > summary').click();
  await brain.locator('#brain-scramble').fill(scramble);
  await brain.locator('#brain-start-custom').click();
}
