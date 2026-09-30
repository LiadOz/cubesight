import { test, expect } from 'playwright/test';

// Brain v2 visual matrix: every style × site mode × key screen, rendered from
// the sample view-models through the real shell and style (no cube needed).
// Baselines live in tests/brain-visual.spec.js-snapshots/. Regenerate after an
// intended visual change with: npx playwright test tests/brain-visual.spec.js --update-snapshots

const STYLES = ['mono', 'orbit'];
const THEMES = ['dark', 'light'];
const SCREENS = { idle: 'idle', 'inspection-overtime': 'overtime', solving: 'solving', results: 'results' };
const GALLERY = { mono: '/src/brain/styles/mono/_gallery.html' };

test.use({ viewport: { width: 1440, height: 900 } });

async function openFixture(page, style, theme, fixture) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${GALLERY[style]}?fx=${fixture}&theme=${theme}`);
  await page.waitForSelector('html[data-gallery-ready]');
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

for (const style of STYLES) {
  for (const theme of THEMES) {
    for (const [screen, fixture] of Object.entries(SCREENS)) {
      test(`${style} · ${theme} · ${screen}`, async ({ page }) => {
        test.fixme(!GALLERY[style], `${style} style is built separately`);
        const errors = await openFixture(page, style, theme, fixture);
        await expect(page.locator('.brain')).toHaveAttribute('data-brain-style', style);
        await expect(page).toHaveScreenshot(`${style}-${theme}-${screen}.png`, {
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
    root.querySelector('#brain-review-close').click();
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
  expect(result.actions).toEqual(['cancel', 'dismissResults']);
});

test('settings rows keep the first UI\'s hooks and dispatch settings', async ({ page }) => {
  await openFixture(page, 'mono', 'dark', 'idle');
  await page.locator('.brain-pill-setup > summary').click();
  await page.locator('[data-brain-method="roux"]').click();
  await page.locator('#brain-pseudo').uncheck();
  await page.locator('.b-configbar-copy .b-cfg[data-value="xcross"]').click();
  const actions = await page.evaluate(() => window.gallery.actions);
  expect(actions).toEqual([
    { type: 'toggleSettings' },
    { type: 'setSetting', path: 'method', value: 'roux' },
    { type: 'setSetting', path: 'f2l', value: 'standard' },
    { type: 'setSetting', path: 'cross', value: 'xcross' },
  ]);
  await expect(page.locator('[data-brain-mode="guided"]')).toHaveCount(1);
  await expect(page.locator('[data-brain-cross="xxcross"]')).toHaveCount(1);
  for (const id of ['#brain-inspection', '#brain-scramble', '#brain-generate', '#brain-start-custom', '#brain-toggles', '#brain-connection-log', '#brain-save-recording', '#brain-replay-speed']) {
    await expect(page.locator(id)).toHaveCount(1);
  }
});
