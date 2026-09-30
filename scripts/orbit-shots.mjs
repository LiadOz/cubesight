// Screenshot the Orbit dev harness states (dev tool for the Orbit style).
// Usage: node scripts/orbit-shots.mjs [baseUrl] [outDir] state[:theme[:width[:height]]] ...
// Needs a running dev server; prints page errors and exits non-zero on any.
/* global document -- used inside page.waitForFunction/evaluate, which run in the browser page */
import { chromium } from 'playwright';

const [,, base = 'http://127.0.0.1:5194', out = '/tmp/orbit-shots', ...specs] = process.argv;
const browser = await chromium.launch();
const errors = [];
for (const spec of specs) {
  const [state, theme = 'dark', w = '1440', h = '900'] = spec.split(':');
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
  page.on('pageerror', e => errors.push(`${spec}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${spec}: ${m.text()}`); });
  await page.goto(`${base}/src/brain/styles/orbit/_dev.html?state=${state}&theme=${theme}`);
  await page.waitForFunction(() => document.documentElement.dataset.harness === 'ready', null, { timeout: 15000 })
    .catch(() => errors.push(`${spec}: harness not ready`));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${state}-${theme}-${w}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
process.exit(errors.length ? 1 : 0);
