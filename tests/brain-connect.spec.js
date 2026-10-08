import { test, expect } from './helpers/coverage-test.js';

// Connecting must look like something is happening: a busy chip and button, the
// latest step of the attach as a status line (session detail and connection
// log), an indeterminate sweep (Orbit ring) or lane (Mono), and on failure the
// reason and a retry. The adapter is fake: connect resolves after a delay.
const STYLES = ['orbit', 'mono'];

async function mountConnectingBrain(page, style) {
  await page.addInitScript(style => {
    localStorage.clear();
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
    window.__CUBESIGHT_TEST_CUBE_FACTORY__ = async () => {
      const { logConnection } = await import('/src/smart-cube-diag.js');
      const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
      let observer;
      const control = { attempts: 0, failNext: false, release: null, step: 0 };
      const connection = {
        deviceName: 'GAN test cube', protocol: { name: 'GAN Gen4' },
        capabilities: { facelets: true },
        events$: { subscribe(value) { observer = value; return { unsubscribe() { observer = null; } }; } },
        async sendCommand() { queueMicrotask(() => observer?.next({ type: 'FACELETS', facelets: solved })); },
        async disconnect() {},
      };
      const gate = () => new Promise(resolve => { control.step++; control.release = resolve; });
      const connectDevice = async ({ onStatus }) => {
        control.attempts++;
        control.step = 0;
        logConnection({ label: 'Starting connection…', kind: 'start' });
        await gate();
        onStatus('Watching for the cube’s advertisements…');
        await gate();
        logConnection({ label: 'Advertising did not expose the address — asking for one-time manual entry.', kind: 'fallback' });
        await gate();
        if (control.failNext) { control.failNext = false; throw new Error('GATT server busy'); }
        return connection;
      };
      return { control, connectDevice };
    };
  }, style);
  await page.goto('/#/solve');
  await page.waitForFunction(() => window.testBrain?.handle);
}

async function connectFromHeader(page) {
  await page.getByRole('button', { name: /open cube and recording actions/ }).click();
  await page.getByRole('dialog', { name: 'Cube and recording actions' }).getByRole('menuitem', { name: 'connect', exact: true }).click();
}

async function releaseSteps(page) {
  for (const step of [1, 2, 3]) {
    await page.waitForFunction(value => window.testBrain.control.step === value, step);
    await page.evaluate(() => window.testBrain.control.release());
  }
}

for (const style of STYLES) {
  test(`connecting shows progress, the latest step, and a busy button (${style})`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mountConnectingBrain(page, style);
    const brain = page.locator('#brain-view .brain');
    const button = page.getByRole('dialog', { name: 'Cube and recording actions' }).getByRole('menuitem', { name: 'connect', exact: true });
    const status = brain.locator('.b-idle-status');
    const release = () => page.evaluate(() => window.testBrain.control.release());
    const indicator = brain.locator(style === 'orbit' ? '.orbit__svg' : '.b-progress i');

    await expect(brain).toHaveAttribute('data-screen', 'disconnected');
    await expect(page.locator('.ui-cube-menu')).toHaveAttribute('data-phase', 'disconnected');

    await connectFromHeader(page);
    await expect(brain).toHaveAttribute('data-screen', 'connecting');
    // The chip and the primary button are busy; the button cannot be pressed twice.
    await expect(page.locator('.ui-cube-menu')).toHaveAttribute('data-phase', 'connecting');
    await page.getByRole('button', { name: /open cube and recording actions/ }).click();
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(page.getByRole('button', { name: /open cube and recording actions/ })).toHaveAttribute('aria-label', /connecting/);
    await expect(indicator).toBeVisible();
    // The ring sweeps alone while connecting: a static 0.00 behind it means nothing (orbit layout).
    if (style === 'orbit') await expect(brain.locator('.b-clock')).toBeHidden();
    // Exactly one animation runs: the ring sweep (Orbit) or the lane (Mono). The chip and button are static.
    await page.getByRole('dialog', { name: 'Cube and recording actions' }).getByRole('button', { name: 'close', exact: true }).click();
    const animated = await page.evaluate(() => {
      const still = root => [root, ...root.querySelectorAll('*')].every(n => n.getAnimations().length === 0
        && ['::before', '::after'].every(pseudo => getComputedStyle(n, pseudo).animationName === 'none'));
      return { chip: still(document.querySelector('.ui-cube-chip')), button: still(document.querySelector('[data-cube-action=connect]')) };
    });
    expect(animated).toEqual({ chip: true, button: true });
    await expect.poll(() => indicator.evaluate(n => n.getAnimations().length)).toBeGreaterThan(0);
    // The line under the button is the newest step: the picker, then the adapter's status.
    await expect(status).toHaveText('Starting connection…');
    const [header, statusBox] = await Promise.all([page.locator('.site-header').boundingBox(), status.boundingBox()]);
    expect(statusBox.y, 'connection detail stays below the header').toBeGreaterThanOrEqual(header.y + header.height);
    await release();
    await expect(status).toHaveText('Watching for the cube’s advertisements…');
    await release();
    // A step only the connection log sees (the address prompt) is kept as the status too.
    await expect(status).toContainText('asking for one-time manual entry');
    await expect(page.locator('.ui-cube-menu')).toHaveAttribute('data-phase', 'connecting');
    await release();
    await expect(brain).toHaveAttribute('data-screen', 'idle');
    expect(await indicator.evaluate(n => n.getAnimations().length)).toBe(0);
    await expect(page.locator('.ui-cube-menu')).toHaveAttribute('data-phase', 'tracking');
    expect(errors).toEqual([]);
  });

  test(`a failed connection shows the reason and a retry (${style})`, async ({ page }) => {
    test.setTimeout(60_000);
    await mountConnectingBrain(page, style);
    const brain = page.locator('#brain-view .brain');
    const button = page.getByRole('dialog', { name: 'Cube and recording actions' }).getByRole('menuitem', { name: 'connect', exact: true });
    await page.evaluate(() => { window.testBrain.control.failNext = true; });
    await connectFromHeader(page);
    await expect(brain).toHaveAttribute('data-screen', 'connecting');
    await releaseSteps(page);
    await expect(brain).toHaveAttribute('data-screen', 'disconnected');
    await expect(brain.locator('.b-idle-status')).toHaveText('Connection failed: GATT server busy');
    await expect(brain.locator('.b-idle-status')).toHaveAttribute('data-tone', 'error');
    await page.getByRole('button', { name: /open cube and recording actions/ }).click();
    await expect(button).toBeEnabled();
    await expect(button).toHaveText('connect');
    await page.getByRole('dialog', { name: 'Cube and recording actions' }).getByRole('button', { name: 'close', exact: true }).click();
    await expect(page.locator('.ui-cube-menu')).toHaveAttribute('data-phase', 'disconnected');
    // Retry starts a fresh attempt from the first step.
    await connectFromHeader(page);
    await expect(brain).toHaveAttribute('data-screen', 'connecting');
    await expect(brain.locator('.b-idle-status')).not.toContainText('Connection failed');
    expect(await page.evaluate(() => window.testBrain.control.attempts)).toBe(2);
    await releaseSteps(page);
    await expect(brain).toHaveAttribute('data-screen', 'idle');
  });
}
