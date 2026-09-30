import { test, expect } from 'playwright/test';

// The Brain's panels and navigation in a real browser with the real shell: the
// settings panel (one active tab, closes from every path) and the debug drawer
// (keeps the connection log, recordings and data off the solve view).
const STYLES = ['orbit', 'mono'];

async function mountBrain(page, style, { connected = true } = {}) {
  await page.goto('/');
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
    test.setTimeout(90_000);
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
      'the brain tab': async () => { await brainTab.click(); },
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

    // The footer button and the backtick key open it; the log is painted; esc or close shuts it.
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
