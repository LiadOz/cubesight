import { test, expect } from 'playwright/test';

// X-cross is an opportunity, not a stage: the timeline always plans the cross
// and four pairs; when the cross completes together with a pair the cross
// segment is tagged, the merged pair is done at the same moment (not a skip),
// and the coach and a toast celebrate it.
const STYLES = ['orbit', 'mono'];
const SEGMENTS = '#brain-timeline :is(.m-seg, .b-oring-seg)';

// Solving "B R B2 R' F2 R F2 B2": after "B R" the cross is complete together with one F2L pair (found by search).
const SCRAMBLE = "B2 F2 R' F2 R B2 R' B'";

async function mountTestBrain(page, style) {
  await page.goto('/#/drills/corners');
  await page.evaluate(async style => {
    localStorage.clear();
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style, cross: 'xxcross' }));   // an old stored target is ignored
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

for (const style of STYLES) {
  test(`an x-cross is tagged, its pair is merged, and the coach celebrates it (${style})`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mountTestBrain(page, style);
    const brain = page.locator('#brain-test');
    const states = () => page.evaluate(sel => Object.fromEntries([...document.querySelectorAll(sel)].map(el => [el.dataset.key, el.dataset.state])), SEGMENTS);

    // No cross target anywhere: the bar, the panel and the command line.
    await expect(brain.locator('[data-setting="cross"]')).toHaveCount(0);
    await brain.locator('.brain-pill-setup > summary').click();
    await brain.locator('.brain-advanced-scramble > summary').click();
    await brain.locator('#brain-scramble').fill(SCRAMBLE);
    await brain.locator('#brain-start-custom').click();
    await page.evaluate(s => window.testBrain.emitTurns(s), SCRAMBLE);
    await expect(brain.locator('#brain-phase-label')).toHaveText('Inspection');
    expect(Object.keys(await states())).toEqual(['cross', 'pair1', 'pair2', 'pair3', 'pair4', 'eo', 'co', 'cp', 'ep']);

    // "B R": crosses complete on two faces at once (D with one pair, B with two).
    // The cross locks to the face with more solved pairs (the same rule as
    // src/analysis inferCrossFace), so this is a double X-cross on B.
    await page.evaluate(() => window.testBrain.emitTurns('B R'));
    await expect.poll(states).toMatchObject({ cross: 'done', pair1: 'done', pair2: 'done', pair3: 'current' });
    await expect(brain.locator(`${SEGMENTS}[data-key="pair2"]`)).not.toHaveAttribute('data-state', 'skipped');
    await expect(brain.locator(`${SEGMENTS}[data-key="pair1"]`)).not.toHaveAttribute('data-state', 'skipped');
    await expect(brain.locator('#brain-coach')).toContainText('X-cross!');
    await expect(brain.locator('.b-toast')).toContainText('x-cross');
    const tags = await brain.locator(`${SEGMENTS}[data-key="cross"]`).evaluate((node, style) => {
      if (style === 'mono') return node.querySelector('.m-seg-tags').textContent;
      return [...document.querySelectorAll('.b-oring-name')].map(n => n.textContent).join('|');
    }, style);
    expect(tags).toContain('x-cross');

    // Finish the solve: the stored splits keep the merged pair out of the skips.
    await page.evaluate(s => window.testBrain.emitTurns(s), "B2 R' F2 R F2 B2");
    await expect(brain.locator('#brain-phase-label')).toHaveText('Solved');
    await expect.poll(() => page.evaluate(async () => {
      const backend = await (await import('/src/store/idb.js')).openIdbBackend();
      const n = (await backend.getAll()).length;
      await backend.close();
      return n;
    })).toBe(1);   // the history is written to IndexedDB asynchronously
    const splits = await page.evaluate(async () => {
      const backend = await (await import('/src/store/idb.js')).openIdbBackend();
      const all = await backend.getAll();
      await backend.close();
      return all[0].splits;
    });
    for (const key of ['pair1', 'pair2']) {
      const pair = splits.find(s => s.key === key);
      expect([pair.ms, pair.moves, pair.skipped]).toEqual([0, 0, false]);
    }
    await expect(brain.locator('#brain-review')).toContainText(/x-cross/i);
    expect(errors).toEqual([]);
  });
}
