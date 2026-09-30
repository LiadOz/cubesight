import { test, expect } from 'playwright/test';
import { createSmartCubeSession } from '../src/smart-cube-session.js';
import { createSolveLive } from '../src/solve-live.js';
import {
  recordingConnectDevice, recordSessionCalls, recordLiveCalls, recordRead, setCheckpointProvider,
  resetRecording, serializeRecording, now as recorderNow,
} from '../src/recorder.js';
import { createManualDevice } from '../src/recording-replay.js';

const inverse = moves => moves.split(' ').reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : `${m}'`).join(' ');

// A real-shaped recording made through the app's own seams around a fake GAN
// cube: connect + solved handshake, a gyro stream between turns, 480 warm-up
// turns, then a guided scramble and its solve (which the Brain stores).
async function makeRecording() {
  const log = console.log;
  console.log = (...a) => { if (!String(a[0]).startsWith('[smart-cube]')) log(...a); };
  try {
    resetRecording();
    const device = createManualDevice({ deviceName: 'GAN test cube', protocol: { id: 'gan-gen4', name: 'GAN Gen4' }, capabilities: { gyroscope: true, battery: true, facelets: true, hardware: false, reset: false } });
    const session = recordSessionCalls(createSmartCubeSession(recordingConnectDevice(device.connectDevice)));
    setCheckpointProvider(() => session.getSnapshot());
    const live = recordLiveCalls(createSolveLive(session, { now: recorderNow, getOrientation: () => recordRead('orientation', () => ({ bottom: 'D', front: 'F' })) }));
    await session.connect();
    await new Promise(resolve => setImmediate(resolve));
    let ts = 0;
    const gyro = () => { for (let g = 0; g < 5; g++) device.emit({ type: 'GYRO', quaternion: { x: 0.01 * g, y: 0.2, z: -0.3, w: 0.93 }, timestamp: ts + g }); };
    const turn = move => {
      if (move.endsWith('2')) { device.move(move[0], ts += 300); device.move(move[0], ts += 15); }
      else device.move(move, ts += 300);
      gyro();
    };
    const cycle = ['R', 'U', "R'", "U'"];
    for (let i = 0; i < 480; i++) turn(cycle[i % 4]);
    live.setInspection({ enabled: false });
    const scramble = "R2 D' F2 U B2 L' U2 F R' D2 B U' L2";
    live.startGuided(scramble);
    scramble.split(' ').forEach(turn);
    inverse(scramble).split(' ').forEach(turn);
    const json = serializeRecording();
    await session.disconnect();
    live.detach();
    return { json, events: JSON.parse(json).events.length };
  } finally { console.log = log; }
}

async function openReplay(page, json, speed) {
  await page.route('**/replay-fixture.json', route => route.fulfill({ body: json, contentType: 'application/json' }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/?replay=/replay-fixture.json&replaySpeed=${speed}#/brain`);
}

async function expectCleanDisconnected(page) {
  const view = page.locator('#brain-view');
  await expect(view.locator('#brain-connect')).toBeVisible();
  await expect(view.locator('#brain-disconnect')).toBeHidden();
  await expect(view.locator('#brain-device')).toHaveText('No cube connected');
  expect(await page.evaluate(() => document.documentElement.dataset.cubePhase)).toBe('disconnected');
  const state = await page.evaluate(async () => {
    const { smartCube, isReplayAdapterInstalled } = await import('/src/smart-cube-bluetooth.js');
    const { isReplaying } = await import('/src/recorder.js');
    return { phase: smartCube.getSnapshot().phase, adapter: isReplayAdapterInstalled(), replaying: isReplaying(), solves: localStorage.getItem('cubesight-solves-v1') };
  });
  expect(state).toEqual({ phase: 'disconnected', adapter: false, replaying: false, solves: null });
  // Connect goes to Web Bluetooth again (unavailable headless), not to the recording.
  const detail = await page.evaluate(async () => {
    const { smartCube } = await import('/src/smart-cube-bluetooth.js');
    await smartCube.connect();
    return smartCube.getSnapshot();
  });
  expect(detail.phase).toBe('disconnected');
  expect(detail.detail).toMatch(/^Connection failed: /);
}

test('an instant replay of a few thousand events finishes fast and leaves a clean, disconnected Brain', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const { json, events } = await makeRecording();
  expect(events).toBeGreaterThan(3000);

  await openReplay(page, json, 0);
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'running', null, { polling: 10 });
  const started = Date.now();
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'done', null, { polling: 10, timeout: 30_000 });
  const elapsed = Date.now() - started;
  expect(elapsed, `instant replay of ${events} events took ${elapsed} ms`).toBeLessThan(2000);

  // The replayed solve finished: its review stays on screen, but it is not in the history.
  const view = page.locator('#brain-view');
  await expect(view.locator('#brain-phase-label')).toHaveText('Solved');
  await expect(view.locator('#brain-replay-banner')).toContainText('Replay finished · Connect your cube');
  await expectCleanDisconnected(page);
  expect(errors).toEqual([]);
});

test('stopping a replay returns the Brain to a clean, disconnected state', async ({ page }) => {
  test.setTimeout(60_000);
  const { json } = await makeRecording();
  await openReplay(page, json, 1);
  const view = page.locator('#brain-view');
  await expect(view.locator('#brain-replay-banner')).toContainText('Replaying a recording');
  await expect(view.locator('.brain-connect-chip')).toHaveAttribute('data-phase', 'tracking');   // the replayed cube is "connected"
  expect(await page.evaluate(async () => (await import('/src/smart-cube-bluetooth.js')).isReplayAdapterInstalled())).toBe(true);
  await view.locator('#brain-replay-banner button').click();
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'stopped');
  await expect(view.locator('#brain-replay-banner')).toContainText('Replay stopped · Connect your cube');
  await expect(view.locator('#brain-replay-banner button')).toBeHidden();
  // Back to the no-cube screen: connecting is the next step, nothing is mid-solve.
  await expect(view.locator('[data-primary="connect"]')).toBeVisible();
  await expect(view.locator('#brain-stop')).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/smart-cube-bluetooth.js')).smartCube.getSnapshot().phase)).toBe('disconnected');
  await expectCleanDisconnected(page);
});
