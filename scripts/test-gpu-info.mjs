// Diagnose the browser backend without drawing the cube or assuming --enable-gpu
// means hardware acceleration. Run on the host to check GPUs unavailable in a container.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const reports = [];
for (const args of [[], ['--enable-gpu']]) {
  const browser = await chromium.launch({ headless: true, args });
  try {
    const session = await browser.newBrowserCDPSession();
    const { gpu } = await session.send('SystemInfo.getInfo');
    const renderer = gpu.auxAttributes?.glRenderer ?? '';
    reports.push({
      args, renderer,
      softwareRenderer: /swiftshader|llvmpipe|softpipe/i.test(renderer),
      devices: gpu.devices,
      features: gpu.featureStatus,
    });
  } finally {
    await browser.close();
  }
}
const out = path.resolve('test-results/gpu/info.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(reports, null, 2)}\n`);
for (const report of reports) {
  console.log(`${report.args.length ? '--enable-gpu' : 'default'}: ${report.renderer}`);
  console.log(`  compositing: ${report.features?.gpu_compositing}; rasterization: ${report.features?.rasterization}`);
}
console.log(`GPU report: ${out}`);
