/* global console, process, document */
// Renders the prototype into the post folder: node gallery/widgets/2026-10-02-selection-controls/proto/render.mjs [only-option] [--scale=1|2|3]
// --scale (default 2) is the device scale factor; at 2 or 3 files are NEW (<name>-hd.png / -hd3.png) and an existing file is never overwritten.
// At scale 2 it renders only the composites (the overview and the state matrices).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..');
const page0 = 'file://' + path.join(here, 'proto.html');
const args = process.argv.slice(2);
const SCALE = Number((args.find(a => a.startsWith('--scale=')) || '--scale=2').slice(8));
const only = args.find(a => !a.startsWith('--'));
const SUF = SCALE === 1 ? '' : SCALE === 2 ? '-hd' : `-hd${SCALE}`;
const fresh = (f) => { if (fs.existsSync(f)) { console.log('exists, skipped', path.basename(f)); return false; } return true; };

// [suffix, scene, theme, width, height, selector(null = full page)]
const SHOTS = [
  ['states', 'states', 'dark', 1440, 900, null],
  ['states-light', 'states', 'light', 1440, 900, null],
  ['drawer', 'drawer', 'dark', 1440, 900, '.frame'],
  ['phone-drawer', 'phone', 'dark', 390, 844, '.frame'],
  ['speed', 'speed', 'dark', 1440, 900, '.frame'],
  ['history-filters', 'history', 'dark', 1440, 900, '.frame'],
  ['drill-answers', 'drill', 'dark', 1440, 900, '.frame'],
  ['phone-drill', 'phone-drill', 'dark', 390, 844, '.frame'],
];

const browser = await chromium.launch();
for (const opt of [1, 2, 3]) {
  if (only && String(opt) !== only) continue;
  for (const [i, [suffix, scene, theme, w, h, sel]] of SHOTS.entries()) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: SCALE });
    const page = await ctx.newPage();
    await page.goto(`${page0}?opt=${opt}&theme=${theme}&scene=${scene}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    if (SCALE > 1 && !['states', 'states-light'].includes(suffix)) continue;   // HD only for the composites
    const name = `W-SEL-${opt}${i + 1}-option${opt}-${suffix}${SUF}.png`;
    const file = path.join(out, name);
    if (!fresh(file)) continue;
    if (sel) await page.locator(sel).screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: true });
    console.log(name);
    await ctx.close();
  }
}
if (!only || only === 'overview') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  await page.goto(`${page0}?opt=1&theme=dark&scene=overview`);
  await page.evaluate(() => document.fonts.ready);
  const ovf = path.join(out, `W-SEL-01-overview-three-options${SUF}.png`);
  if (fresh(ovf)) await page.locator('.frame').screenshot({ path: path.join(out, `W-SEL-01-overview-three-options${SUF}.png`) });
  console.log(`W-SEL-01-overview-three-options${SUF}.png`);
}
await browser.close();
