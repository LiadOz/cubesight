// usage: node docs/design/brain-v2/review/_src/render.mjs [prefix]   renders ../<prefix>*.svg -> .png (Playwright, headless Chromium)
const { chromium } = await import(new URL('../../../../../node_modules/playwright/index.mjs', import.meta.url));
import fs from 'fs';
const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const prefix = process.argv[2] || '';
const files = fs.readdirSync(OUT).filter(f => f.endsWith('.svg') && f.startsWith(prefix));
const b = await chromium.launch();
for (const f of files) {
  const src = fs.readFileSync(`${OUT}/${f}`, 'utf8');
  const m = src.match(/width="(\d+)" height="(\d+)"/);
  const [w, h] = [+m[1], +m[2]];
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('file://' + OUT + '/' + f);
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${OUT}/${f.replace('.svg', '.png')}` });
  await p.close();
  console.log('png', f);
}
await b.close();
