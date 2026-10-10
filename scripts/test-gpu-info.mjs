// Diagnose the browser backend without drawing the cube or assuming --enable-gpu
// means hardware acceleration. Run on the host to check GPUs unavailable in a container.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gpuLaunchOptions, inspectBrowserGpu } from './browser-gpu.mjs';

const reports = [];
for (const launch of [{ headless: true, args: [] }, gpuLaunchOptions(), gpuLaunchOptions({ ...process.env, CUBESIGHT_GPU_BACKEND: 'vulkan' })]) {
  let browser;
  try {
    browser = await chromium.launch(launch);
    reports.push({ launch, ...await inspectBrowserGpu(browser) });
  } catch (error) {
    reports.push({ launch, hardwareWebGL: false, error: error.message });
  } finally {
    await browser?.close();
  }
}
const out = path.resolve('test-results/gpu/info.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(reports, null, 2)}\n`);
for (const report of reports) {
  console.log(`${report.launch.channel || 'headless-shell'} ${report.launch.args.join(' ')}: ${report.renderer || report.error?.split('\n')[0]}`);
  console.log(`  hardware WebGL2: ${report.hardwareWebGL}; context renderer: ${report.webgl?.renderer || 'unavailable'}`);
}
console.log(`GPU report: ${out}`);
