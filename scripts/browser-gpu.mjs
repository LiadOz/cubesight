// A launch flag is not evidence of hardware acceleration. Verify an actual
// WebGL2 context before allowing the real-cube performance capture to start.
export function gpuLaunchOptions(env = process.env) {
  const backend = env.CUBESIGHT_GPU_BACKEND || 'auto';
  if (!['auto', 'vulkan', 'gl'].includes(backend)) throw new Error('CUBESIGHT_GPU_BACKEND must be auto, vulkan, or gl');
  const headless = env.CUBESIGHT_GPU_HEADED !== '1';
  return {
    channel: 'chromium', headless, timeout: 15_000,
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
    args: ['--enable-gpu', ...(backend === 'auto' ? [] : ['--use-gl=angle', `--use-angle=${backend}`]),
      ...(!headless && env.WAYLAND_DISPLAY && !env.DISPLAY ? ['--ozone-platform=wayland'] : [])],
  };
}

export function isHardwareWebGL(report) {
  const renderer = report.webgl?.renderer || '';
  const software = /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i;
  return Boolean(report.webgl?.available && renderer && !software.test(renderer)
    && /^enabled/.test(report.features?.webgl || ''));
}

export async function inspectBrowserGpu(browser) {
  const session = await browser.newBrowserCDPSession();
  let gpu;
  try { ({ gpu } = await session.send('SystemInfo.getInfo')); }
  finally { await session.detach(); }
  const page = await browser.newPage();
  let webgl;
  try {
    webgl = await page.evaluate(() => {
      const canvas = globalThis.document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true });
      if (!gl) return { available: false, renderer: null };
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return { available: true, renderer };
    });
  } finally { await page.close(); }
  const report = { browserVersion: browser.version(), renderer: gpu.auxAttributes?.glRenderer ?? '', devices: gpu.devices, features: gpu.featureStatus, webgl };
  return { ...report, hardwareWebGL: isHardwareWebGL(report) };
}

export function requireHardwareWebGL(report) {
  if (!isHardwareWebGL(report)) throw new Error(`Hardware WebGL2 unavailable (${report.webgl?.renderer || report.renderer || 'no renderer'}). Hardware cube capture cannot proceed. Run on a GPU-enabled host; inspect test-results/gpu/info.json.`);
}
