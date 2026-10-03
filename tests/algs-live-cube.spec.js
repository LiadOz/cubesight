import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';

const recording = JSON.parse(readFileSync(new URL('./fixtures/algs-page-gan-session.json', import.meta.url), 'utf8'));
const cubeEvents = recording.events.filter(event => event.kind === 'cube-event').map(event => event.data.event);
const gyroIndices = cubeEvents.flatMap((event, index) => event.type === 'GYRO' ? [index] : []);

test('algorithm case follows the GAN MOVE and GYRO stream, then playback reaches its modeled state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#/algs/pll');
  await page.locator('.alg-case-card').first().click();
  await expect(page.locator('[data-alg-cube] canvas')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.display.mode)).toBe('case');

  await page.evaluate(async () => {
    const [{ smartCube, setReplayConnectDevice }, { createManualDevice }] = await Promise.all([
      import('/src/smart-cube-bluetooth.js'), import('/src/recording-replay.js'),
    ]);
    const device = createManualDevice({
      deviceName: 'GAN fixture cube', protocol: { id: 'gan-gen4', name: 'GAN Gen4' },
      capabilities: { gyroscope: true, battery: true, facelets: true, hardware: false, reset: false },
    });
    window.__f4FixtureDevice = device;
    setReplayConnectDevice(device.connectDevice);
    await smartCube.connect();
    window.__f4FixtureSession = smartCube;
    let lastSeq = null;
    window.__f4FixtureMoves = [];
    smartCube.subscribe(snapshot => {
      if (!snapshot.moveEvent || snapshot.moveEvent.seq === lastSeq) return;
      lastSeq = snapshot.moveEvent.seq;
      window.__f4FixtureMoves.push(lastSeq);
    });
  });
  await page.locator('[data-display-mode="your cube"]').click();
  await page.evaluate(events => { for (const event of events) window.__f4FixtureDevice.emit(event); }, cubeEvents.slice(0, gyroIndices[0] + 1));
  await expect(page.locator('[data-alg-cube] canvas')).toHaveAttribute('data-gyro-follow', 'on');
  await expect.poll(() => page.locator('[data-alg-cube] canvas').getAttribute('data-gyro-pose')).not.toBeNull();
  const firstGyroPose = await page.locator('[data-alg-cube] canvas').getAttribute('data-gyro-pose');
  await page.evaluate(events => { for (const event of events) window.__f4FixtureDevice.emit(event); }, cubeEvents.slice(gyroIndices[0] + 1, gyroIndices[1] + 1));
  await expect.poll(() => page.locator('[data-alg-cube] canvas').getAttribute('data-gyro-pose')).not.toBe(firstGyroPose);
  await page.evaluate(events => { for (const event of events) window.__f4FixtureDevice.emit(event); }, cubeEvents.slice(gyroIndices[1] + 1));
  await expect.poll(() => page.evaluate(() => window.__f4FixtureMoves.length)).toBe(16);
  await expect.poll(() => page.evaluate(() => {
    const vm = window.__cubesightSnapshot.getViewModel().viewModel;
    return JSON.stringify(vm.display.cubeState) === JSON.stringify(window.__f4FixtureSession.getSnapshot().state);
  })).toBe(true);
  await expect.poll(() => page.locator('[data-alg-cube] canvas').getAttribute('data-gyro-follow')).toBe('on');
  await expect.poll(() => page.locator('[data-alg-cube] canvas').getAttribute('data-gyro-pose')).not.toBeNull();
  await expect(page.locator('canvas')).toHaveCount(1);

  await page.locator('[data-display-mode="case"]').click();
  await page.locator('[data-sequence="play"]').click();
  await expect.poll(() => page.evaluate(() => {
    const playback = window.__cubesightSnapshot.getViewModel().viewModel.playback;
    return playback.index >= playback.moveCount;
  }), { timeout: 12000 }).toBe(true);
  const actual = await page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.display.cubeState);
  const expected = await page.evaluate(async () => {
    const [{ getCase }, { applyMoves }, { caseSetupState }, { parseAlg }, { caseDisplayState }] = await Promise.all([
      import('/src/algs/seed/cases.js'), import('/src/cross-cube.js'), import('/src/algs/drill/cube.js'),
      import('/src/algs/notation.js'), import('/src/ui/cube/orientation.js'),
    ]);
    const vm = window.__cubesightSnapshot.getViewModel().viewModel;
    const row = getCase(vm.caseId);
    const algorithm = row.algs.find(candidate => candidate.id === vm.selectedAlg);
    return caseDisplayState(applyMoves(caseSetupState(row), parseAlg(algorithm.moves)), vm.display.caseColor, row.id).state;
  });
  expect(actual).toEqual(expected);
});
