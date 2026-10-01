// usage: node render.mjs [prefix]  renders docs/design/orbit-v3/<prefix>*.svg -> .png (headless Chromium, like brain-v2/_src/render.mjs)
const { chromium } = await import(new URL('../../../../node_modules/playwright/index.mjs', import.meta.url));
import fs from 'fs';
const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const prefix = process.argv[2] || '';
const files = fs.readdirSync(OUT).filter(f => f.endsWith('.svg') && f.startsWith(prefix));
const b = await chromium.launch();
for (const f of files) {
  const src = fs.readFileSync(`${OUT}/${f}`, 'utf8');
  const m = src.match(/width="(\d+)" height="(\d+)"/);
  const p = await b.newPage({ viewport: { width: +m[1], height: +m[2] } });
  await p.goto('file://' + OUT + '/' + f);
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await p.waitForTimeout(120);
  await p.screenshot({ path: `${OUT}/${f.replace('.svg', '.png')}` });
  await p.close();
  console.log('png', f);
}
await b.close();
