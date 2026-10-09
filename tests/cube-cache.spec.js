import { expect, test } from './helpers/coverage-test.js';

test('shared Cube keeps custom render data through theme changes', async ({ page }) => {
  await page.goto('/src/ui/gallery.html');
  const result = await page.evaluate(async () => {
    const [{ Cube }, { stateFromScramble, toRenderData }] = await Promise.all([
      import('/src/ui/cube/index.js'), import('/src/cross-cube.js'),
    ]);
    const host = document.createElement('div'); document.body.append(host);
    const state = stateFromScramble('R U');
    const renderData = { ...toRenderData(state), mode: 'scout', dimOthers: true, highlightedPieces: ['UF'] };
    const cube = new Cube(host, { mode: 'replay', state });
    const updates = [];
    const originalUpdate = cube.cube.update.bind(cube.cube);
    cube.cube.update = data => { updates.push(JSON.parse(JSON.stringify(data))); return originalUpdate(data); };
    cube.update(renderData);
    const before = cube.getSnapshot();
    document.dispatchEvent(new Event('cubesight-theme'));
    const after = cube.getSnapshot();
    const oneCanvas = cube.element.querySelectorAll('canvas').length === 1;
    cube.destroy(); host.remove();
    return { before, after, updates, oneCanvas };
  });
  expect(result.before.state).toBe(null);
  expect(result.before.renderData).toMatchObject({ mode: 'scout', dimOthers: true, highlightedPieces: ['UF'] });
  expect(result.after.renderData).toEqual(result.before.renderData);
  expect(result.updates).toHaveLength(2);
  expect(result.updates[1]).toMatchObject({ mode: 'scout', dimOthers: true, highlightedPieces: ['UF'] });
  expect(result.oneCanvas).toBe(true);
});
