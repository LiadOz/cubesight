import { test, expect } from 'playwright/test';

// Connecting must look like something is happening: a busy chip and button, the
// latest step of the attach as a status line (session detail and connection
// log), an indeterminate sweep (Orbit ring) or lane (Mono), and on failure the
// reason and a retry. The adapter is fake: connect resolves after a delay.
const STYLES = ['orbit', 'mono'];

async function mountConnectingBrain(page, style) {
  await page.goto('/#/drills/corners');
  await page.evaluate(async style => {
    localStorage.clear();
    localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
    const { createBrain } = await import('/src/brain.js');
    const { createSmartCubeSession } = await import('/src/smart-cube-session.js');
    const { logConnection } = await import('/src/smart-cube-diag.js');
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    let observer;
    const connection = {
      deviceName: 'GAN test cube', protocol: { name: 'GAN Gen4' },
      capabilities: { facelets: true },
      events$: { subscribe(value) { observer = value; return { unsubscribe() { observer = null; } }; } },
      async sendCommand() { queueMicrotask(() => observer?.next({ type: 'FACELETS', facelets: solved })); },
      async disconnect() {},
    };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const control = { attempts: 0, failNext: false, release: null };
    // Each step is held until the test releases it, so the test can look at every stage.
    const gate = () => new Promise(resolve => { control.release = resolve; });
    const session = createSmartCubeSession(async ({ onStatus }) => {
      control.attempts++;
      logConnection({ label: 'Starting connection…', kind: 'start' });
      await gate();
      onStatus('Watching for the cube’s advertisements…');
      await gate();
      logConnection({ label: 'Advertising did not expose the address — asking for one-time manual entry.', kind: 'fallback' });
      await gate();
      await wait(50);
      if (control.failNext) { control.failNext = false; throw new Error('GATT server busy'); }
      return connection;
    });
    window.testBrain = { session, control };
    const root = document.createElement('div');
    root.id = 'brain-test';
    document.body.append(root);
    await createBrain(root, session).ready;
  }, style);
}

for (const style of STYLES) {
  test(`connecting shows progress, the latest step, and a busy button (${style})`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mountConnectingBrain(page, style);
    const brain = page.locator('#brain-test .brain');
    const button = brain.locator('.b-start-alt');
    const status = brain.locator('.b-idle-status');
    const release = () => page.evaluate(() => window.testBrain.control.release());
    const indicator = brain.locator(style === 'orbit' ? '.b-oring-connect-sweep' : '.b-progress i');

    await expect(brain).toHaveAttribute('data-screen', 'disconnected');
    await expect(button).toHaveText('connect cube');
    await expect(indicator).toBeHidden();

    await button.click();
    await expect(brain).toHaveAttribute('data-screen', 'connecting');
    // The chip and the primary button are busy; the button cannot be pressed twice.
    await expect(brain.locator('.b-device')).toHaveAttribute('data-phase', 'connecting');
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(button).toHaveClass(/is-connecting/);
    await expect(button).toHaveText('connecting…');
    await expect(indicator).toBeVisible();
    // The line under the button is the newest step: the picker, then the adapter's status.
    await expect(status).toHaveText('Starting connection…');
    const order = await brain.evaluate(el => {
      const y = selector => el.querySelector(selector).getBoundingClientRect().top;
      return y('.b-start-alt') < y('.b-idle-status');
    });
    expect(order, 'the status line is under the button').toBe(true);
    await release();
    await expect(status).toHaveText('Watching for the cube’s advertisements…');
    await release();
    // A step only the connection log sees (the address prompt) is kept as the status too.
    await expect(status).toContainText('asking for one-time manual entry');
    await expect(brain.locator('.b-device')).toHaveAttribute('data-phase', 'connecting');
    await release();
    await expect(brain).toHaveAttribute('data-screen', 'idle');
    await expect(indicator).toBeHidden();
    await expect(brain.locator('.b-device')).toHaveAttribute('data-phase', 'tracking');
    expect(errors).toEqual([]);
  });

  test(`a failed connection shows the reason and a retry (${style})`, async ({ page }) => {
    test.setTimeout(60_000);
    await mountConnectingBrain(page, style);
    const brain = page.locator('#brain-test .brain');
    const button = brain.locator('.b-start-alt');
    const release = () => page.evaluate(() => window.testBrain.control.release());
    await page.evaluate(() => { window.testBrain.control.failNext = true; });
    await button.click();
    await expect(brain).toHaveAttribute('data-screen', 'connecting');
    for (let i = 0; i < 3; i++) { await release(); await page.waitForTimeout(100); }
    await expect(brain).toHaveAttribute('data-screen', 'disconnected');
    await expect(brain.locator('.b-idle-status')).toHaveText('Connection failed: GATT server busy');
    await expect(brain.locator('.b-idle-status')).toHaveAttribute('data-tone', 'error');
    await expect(button).toBeEnabled();
    await expect(button).toHaveText('retry connection');
    await expect(brain.locator('.b-device')).toHaveAttribute('data-phase', 'disconnected');
    // Retry starts a fresh attempt from the first step.
    await button.click();
    await expect(brain).toHaveAttribute('data-screen', 'connecting');
    await expect(brain.locator('.b-idle-status')).not.toContainText('Connection failed');
    expect(await page.evaluate(() => window.testBrain.control.attempts)).toBe(2);
    for (let i = 0; i < 3; i++) { await release(); await page.waitForTimeout(100); }
    await expect(brain).toHaveAttribute('data-screen', 'idle');
  });
}
