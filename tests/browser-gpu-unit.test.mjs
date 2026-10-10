import assert from 'node:assert/strict';
import test from 'node:test';
import { gpuLaunchOptions, isHardwareWebGL, requireHardwareWebGL } from '../scripts/browser-gpu.mjs';

const report = renderer => ({ webgl: { available: true, renderer }, features: { webgl: 'enabled' } });

test('GPU flags and enabled feature status cannot disguise software rendering', () => {
  for (const renderer of ['ANGLE (Google, SwiftShader Device)', 'llvmpipe (LLVM)', 'softpipe', 'Microsoft Basic Render Driver', 'ANGLE (Microsoft, WARP)']) {
    assert.equal(isHardwareWebGL(report(renderer)), false, renderer);
  }
});

test('hardware capture requires an identified usable WebGL2 context and an enabled backend', () => {
  const hardware = report('ANGLE (Intel, Mesa Intel UHD Graphics)');
  assert.equal(isHardwareWebGL(hardware), true);
  assert.equal(isHardwareWebGL({ ...hardware, webgl: { available: false } }), false);
  assert.equal(isHardwareWebGL({ ...hardware, features: { webgl: 'disabled_software' } }), false);
  assert.equal(isHardwareWebGL(report(null)), false);
  assert.throws(() => requireHardwareWebGL({ ...report('SwiftShader'), hardwareWebGL: true }), /capture cannot proceed/);
  assert.doesNotThrow(() => requireHardwareWebGL(hardware));
});

test('hardware launches use full Chromium without forcing SwiftShader or ignoring the blocklist', () => {
  const launch = gpuLaunchOptions({ CUBESIGHT_GPU_BACKEND: 'vulkan' });
  assert.equal(launch.channel, 'chromium');
  assert.equal(launch.headless, true);
  assert.ok(launch.args.includes('--use-angle=vulkan'));
  assert.ok(!launch.args.some(arg => /swiftshader|ignore-gpu-blocklist/.test(arg)));
  assert.ok(launch.ignoreDefaultArgs.includes('--enable-unsafe-swiftshader'));
  const wayland = gpuLaunchOptions({ CUBESIGHT_GPU_HEADED: '1', WAYLAND_DISPLAY: 'wayland-0' });
  assert.equal(wayland.headless, false);
  assert.ok(wayland.args.includes('--ozone-platform=wayland'));
  assert.throws(() => gpuLaunchOptions({ CUBESIGHT_GPU_BACKEND: 'swiftshader' }), /must be auto, vulkan, or gl/);
});
