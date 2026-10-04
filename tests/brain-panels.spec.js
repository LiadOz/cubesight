import { test, expect } from './helpers/coverage-test.js';

// The Brain's isolated controller and real shell: the settings panel (one active
// tab, closes from every path) and its debug drawer (connection log, recordings
// and data). Global app-header drawer shortcuts are covered by ui-foundation.spec.
const STYLES = ['orbit', 'mono'];

async function mountBrain(page, style, { connected = true } = {}) {
  // Mount in the standalone Brain harness so this controller's backtick owner
  // is unambiguous; the full app header has its own global drawer/shortcut.
  await page.goto('/src/brain/_gallery.html?cube=stub');
  await page.evaluate(async ([style, connected]) => {
    localStorage.clear();
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
    const { createBrain } = await import('/src/brain.js');
    const { createSmartCubeSession } = await import('/src/smart-cube-session.js');
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    let observer;
    const connection = {
      deviceName: 'GAN test cube', protocol: { name: 'GAN Gen4' },
      capabilities: { facelets: true },
      events$: { subscribe(value) { observer = value; return { unsubscribe() { observer = null; } }; } },
      async sendCommand() { queueMicrotask(() => observer?.next({ type: 'FACELETS', facelets: solved })); },
      async disconnect() {},
    };
    const session = createSmartCubeSession(() => Promise.resolve(connection));
    window.testBrain = { session };
    const root = document.createElement('div');
    root.id = 'brain-test';
    document.body.append(root);
    await createBrain(root, session).ready;
    if (connected) await session.connect();
  }, [style, connected]);
}

for (const style of STYLES) {
  test(`settings is a clean toggle with one active tab (${style})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mountBrain(page, style);
    const brain = page.locator('#brain-test .brain');
    const brainTab = brain.locator('.b-tab-brain');
    const settingsTab = brain.locator('.b-settings > summary');
    const panel = brain.locator('.b-settings-body');
    const state = async () => ({
      brain: await brainTab.getAttribute('aria-current'),
      settings: await settingsTab.getAttribute('aria-current'),
      open: await brain.locator('.b-settings').evaluate(el => el.open),
    });
    await expect(brain).toHaveAttribute('data-screen', 'idle');
    expect(await state()).toMatchObject({ brain: 'page', settings: null, open: false });
    await expect(panel).toBeHidden();

    // The tab opens the panel: exactly one tab is active, the cube stays mounted.
    await settingsTab.click();
    await expect(panel).toBeVisible();
    expect(await state()).toMatchObject({ brain: null, settings: 'page', open: true });
    await expect(brain).toHaveClass(/is-settings-open/);
    await expect(brain.locator('canvas')).toHaveCount(1);

    // Every way back returns to the solve view with the brain tab active.
    const closers = {
      // The hidden legacy solve tab dispatched the same toggleSettings action
      // as the visible close control; the close-control case covers that action.
      'the settings tab again': async () => { await settingsTab.click(); },
      'the close control': async () => { await brain.locator('.b-settings .b-close').click(); },
      escape: async () => { await page.keyboard.press('Escape'); },
      tab: async () => { await page.keyboard.press('Tab'); },
    };
    for (const [name, close] of Object.entries(closers)) {
      if (!await panel.isVisible()) {
        if (name === 'tab' || name === 'escape') await page.keyboard.press(','); else await settingsTab.click();
      }
      await expect(panel, `open before closing with ${name}`).toBeVisible();
      await close();
      await expect(panel, `closed by ${name}`).toBeHidden();
      expect(await state(), name).toMatchObject({ brain: 'page', settings: null, open: false });
      await expect(brain).not.toHaveClass(/is-settings-open/);
      expect(await page.evaluate(() => window.testBrain.session.getSnapshot().phase)).toBe('tracking');
    }

    // The keyboard opens it too, and escape also works from inside a text field.
    await page.keyboard.press(',');
    await expect(panel).toBeVisible();
    await brain.locator('.b-command input').focus();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    expect(await state()).toMatchObject({ brain: 'page', settings: null, open: false });
    expect(errors).toEqual([]);
  });

  test(`the debug drawer holds the log, recordings and data, and takes no room when closed (${style})`, async ({ page }) => {
    await mountBrain(page, style);
    const brain = page.locator('#brain-test .brain');
    const drawer = brain.locator('#brain-debug');
    const DEBUG_IDS = ['#brain-connection-log', '#brain-clear-log', '#brain-save-recording', '#brain-clear-recording', '#brain-load-recording',
      '#brain-replay-speed', '#brain-toggles', '#brain-export', '#brain-import', '#brain-port-status', '#brain-recording-status'];
    await expect(brain).toHaveAttribute('data-screen', 'idle');

    // Closed: nothing of it is visible, and the page is no taller than the solve view needs.
    await expect(drawer).toBeHidden();
    for (const id of DEBUG_IDS) await expect(brain.locator(id)).toHaveCount(1);
    // Nothing in flow follows the footer row (the old drawers sat there), and the footer is one slim row.
    const rows = await brain.evaluate(el => {
      const foot = el.querySelector('.b-foot').getBoundingClientRect();
      return { foot: foot.height, below: el.getBoundingClientRect().bottom - foot.bottom };
    });
    expect(rows.foot).toBeLessThan(80);
    expect(rows.below).toBeLessThan(60);
    await expect(brain.locator('#brain-debug-toggle')).toHaveAttribute('aria-expanded', 'false');

    // Settings and the backtick key open it; the log is painted; esc or close shuts it.
    await brain.locator('.brain-pill-setup > summary').click();
    await brain.locator('#brain-debug-toggle').click();
    await expect(drawer).toBeVisible();
    await expect(brain.locator('#brain-debug-toggle')).toHaveAttribute('aria-expanded', 'true');
    for (const id of DEBUG_IDS.filter(id => !id.endsWith('-status'))) await expect(brain.locator(id)).toBeVisible();
    await expect(brain.locator('#brain-connection-log li').first()).toBeVisible();
    await expect(brain.locator('#brain-toggles input[data-brain-toggle]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.keyboard.press('`');
    await expect(drawer).toBeVisible();
    await drawer.locator('.b-close').click();
    await expect(drawer).toBeHidden();
    // The controls work from the drawer: a coach switch flips its setting.
    await page.keyboard.press('`');
    const toggle = brain.locator('#brain-toggles input[data-brain-toggle="f2lHint"]');
    const before = await toggle.isChecked();
    await toggle.click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-brain-settings-v2')).toggles.f2lHint)).toBe(!before);
  });
}

// The site mode: the header button and the Brain's "mode" row are one theme.
test('opening settings survives a delayed initial style load', async ({ page }) => {
  let releaseStyle;
  const styleReady = new Promise(resolve => { releaseStyle = resolve; });
  await page.route('**/src/brain/styles/orbit/index.js', async route => {
    await styleReady;
    await route.continue();
  });
  await page.goto('/#/solve', { waitUntil: 'domcontentloaded' });
  const brain = page.locator('#brain-view .brain');
  await expect(brain).toBeVisible();
  await brain.locator('.b-settings > summary').click();
  await expect(brain.locator('.b-settings-body')).toBeVisible();
  releaseStyle();
  await expect(brain).toHaveAttribute('data-brain-style', 'orbit');
  await expect(brain.locator('.b-settings-body')).toBeVisible();
  await expect(brain.locator('.b-settings > summary')).toHaveAttribute('aria-expanded', 'true');
});

test('the mode row, the header button and the system setting share one theme; the icon shows the current mode', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/#/brain');
  const brain = page.locator('#brain-view .brain');
  await expect(brain).toBeVisible();
  const html = page.locator('html');
  const tab = brain.locator('.b-settings > summary');
  const row = value => brain.locator(`[data-setting="theme"][data-value="${value}"]`);
  const icon = async () => ({
    sun: await page.locator('#theme-toggle .theme-sun').isVisible(),
    moon: await page.locator('#theme-toggle .theme-moon').isVisible(),
  });
  const pressed = async () => Promise.all(['light', 'dark', 'system'].map(v => row(v).getAttribute('aria-pressed')));
  const stored = () => page.evaluate(() => localStorage.getItem('cubesight-theme'));
  const openSettings = async () => { if (!await brain.locator('.b-settings-body').isVisible()) await tab.click(); };
  const closeSettings = async () => { if (await brain.locator('.b-settings-body').isVisible()) await page.keyboard.press('Escape'); };

  // No stored choice: system, which is light here. The icon shows the current mode: a sun.
  await page.evaluate(() => localStorage.removeItem('cubesight-theme'));
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await icon()).toEqual({ sun: true, moon: false });
  await openSettings();
  await expect(brain.locator('.b-settings-body [data-setting="theme"]')).toHaveCount(3);
  expect(await pressed()).toEqual(['false', 'false', 'true']);

  // The row drives the site theme (and the icon); the button's label stays the action.
  await row('dark').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await pressed()).toEqual(['false', 'true', 'false']);
  expect(await stored()).toBe('dark');
  await closeSettings();
  expect(await icon()).toEqual({ sun: false, moon: true });
  await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', 'Switch to light mode');

  // The header button updates the row.
  await page.locator('#theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await icon()).toEqual({ sun: true, moon: false });
  await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', 'Switch to dark mode');
  await openSettings();
  expect(await pressed()).toEqual(['true', 'false', 'false']);
  expect(await stored()).toBe('light');

  // System follows prefers-color-scheme, live.
  await row('system').click();
  expect(await stored()).toBeNull();
  expect(await pressed()).toEqual(['false', 'false', 'true']);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await pressed()).toEqual(['false', 'false', 'true']);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  // Choosing the mode the page already shows still moves the highlight.
  await row('light').click();
  expect(await pressed()).toEqual(['true', 'false', 'false']);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'light');
});
