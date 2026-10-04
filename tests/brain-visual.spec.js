import { test, expect } from './helpers/coverage-test.js';

// Brain v2 visual matrix: every style × site mode × key screen, rendered from
// the sample view-models through the real shell and style (no cube needed).
// Baselines live in tests/brain-visual.spec.js-snapshots/. Regenerate after an
// intended visual change with: npx playwright test tests/brain-visual.spec.js --update-snapshots=missing

const STYLES = ['mono', 'orbit'];
const THEMES = ['dark', 'light'];
const SCREENS = { idle: 'idle', 'inspection-overtime': 'overtime', solving: 'solving', results: 'results' };
const GALLERY = '/src/brain/_gallery.html';

test.use({ viewport: { width: 1440, height: 900 } });

async function openFixture(page, style, theme, fixture) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${GALLERY}?cube=stub&style=${style}&fx=${fixture}&theme=${theme}`);
  await page.waitForSelector('html[data-gallery-ready]');
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

for (const style of STYLES) {
  for (const theme of THEMES) {
    for (const [screen, fixture] of Object.entries(SCREENS)) {
      test(`${style} · ${theme} · ${screen}`, async ({ page }) => {
        const errors = await openFixture(page, style, theme, fixture);
        await expect(page.locator('.brain')).toHaveAttribute('data-brain-style', style);
        await expect(page).toHaveScreenshot(`${style}-${theme}-${screen}-direction-a-20261004-clear-dial.png`, {
          fullPage: screen === 'results',
          animations: 'disabled',
          mask: [page.locator('#brain-cube canvas')],
          maxDiffPixelRatio: 0.01,
        });
        expect(errors).toEqual([]);
      });
    }
  }
}

test('the shell updates in place and turns clicks into actions', async ({ page }) => {
  await openFixture(page, 'mono', 'dark', 'solving');
  const result = await page.evaluate(() => {
    const { shell, vm, actions } = window.gallery;
    const root = shell.root;
    const segment = root.querySelector('.m-seg[data-key="pair3"]');
    const coachLine = root.querySelector('#brain-coach .brain-coach-line');
    // Next emit: the pair finishes and pair 4 becomes current.
    const next = structuredClone(vm);
    next.timeline.currentIndex = 4;
    next.timeline.segments[3] = { ...next.timeline.segments[3], state: 'done', fill: 1, splitText: '1.52' };
    next.timeline.segments[4] = { ...next.timeline.segments[4], state: 'current', fill: 0.1 };
    shell.update(next, vm);
    // A frame moves only the clock and the live segment.
    shell.frame({ startedAtSolve: 0, clockText: '7.40', currentFill: 0.3, currentSplitText: '0.21', currentOver: false, inspection: null });
    root.querySelector('.b-key[data-action="cancel"]').click();
    // F1 removes the old dismiss button; controller dismissal remains covered
    // in brain-controller.spec.js. Exercise the shared drawer action here.
    root.querySelector('.b-debug [data-action=toggleDebug]').click();
    return {
      sameSegment: root.querySelector('.m-seg[data-key="pair3"]') === segment,
      sameCoach: root.querySelector('#brain-coach .brain-coach-line') === coachLine,
      states: [...root.querySelectorAll('.m-seg')].slice(3, 5).map(s => s.dataset.state),
      clock: root.querySelector('.b-clock').textContent,
      fill: root.querySelector('.m-seg[data-key="pair4"]').style.getPropertyValue('--fill'),
      actions: actions.map(a => a.type),
    };
  });
  expect(result.sameSegment).toBe(true);
  expect(result.sameCoach).toBe(true);
  expect(result.states).toEqual(['done', 'current']);
  expect(result.clock).toBe('7.40');
  expect(Number(result.fill)).toBeCloseTo(0.3, 3);
  expect(result.actions).toEqual(['cancel', 'toggleDebug']);
});

test('settings rows keep the first UI\'s hooks and dispatch settings', async ({ page }) => {
  await openFixture(page, 'mono', 'dark', 'idle');
  await page.locator('.brain-pill-setup > summary').click();
  await page.locator('#brain-pseudo + .trainer-settings-control').getByRole('switch').click();
  await expect(page.locator('#brain-pseudo')).not.toBeChecked();
  await page.locator('.b-configbar-copy .b-cfg[data-setting="oll"][data-value="1look"]').click();
  const actions = await page.evaluate(() => window.gallery.actions);
  expect(actions).toEqual([
    { type: 'toggleSettings' },
    { type: 'setSetting', path: 'f2l', value: 'standard' },
    { type: 'setSetting', path: 'oll', value: '1look' },
  ]);
  await expect(page.locator('[data-brain-mode="guided"]')).toHaveCount(1);
  await expect(page.locator('[data-brain-method="roux"]')).toHaveCount(0);
  await expect(page.locator('[data-setting="cross"]')).toHaveCount(0);   // x-cross is an opportunity, not a target
  for (const id of ['#brain-inspection', '#brain-scramble', '#brain-generate', '#brain-start-custom', '#brain-toggles', '#brain-connection-log', '#brain-save-recording', '#brain-replay-speed']) {
    await expect(page.locator(id)).toHaveCount(1);
  }
});

test('switching style keeps the cube mount and moves the parts between layouts', async ({ page }) => {
  await openFixture(page, 'orbit', 'dark', 'solving');
  const result = await page.evaluate(() => {
    const { shell, vm, styles } = window.gallery;
    const cube = shell.slots.cube;
    const canvases = () => shell.root.querySelectorAll('canvas').length;
    const before = { canvases: canvases(), ring: Boolean(shell.root.querySelector('.orbit__svg')), aside: !shell.slots.timelineAside.hidden };
    shell.setStyle(styles.mono);
    shell.update({ ...vm, style: 'mono' }, null);
    const mono = { canvases: canvases(), ring: Boolean(shell.root.querySelector('.orbit__svg')), linear: Boolean(shell.root.querySelector('.m-seg')), aside: !shell.slots.timelineAside.hidden, layout: shell.root.dataset.layout };
    shell.setStyle(styles.orbit);
    return { before, mono, sameCube: shell.slots.cube === cube && document.querySelector('#brain-cube') === cube, layout: shell.root.dataset.layout };
  });
  expect(result.before).toEqual({ canvases: 1, ring: true, aside: true });
  expect(result.mono).toEqual({ canvases: 1, ring: false, linear: true, aside: false, layout: 'column' });
  expect(result.sameCube).toBe(true);
  expect(result.layout).toBe('orbit');
});
