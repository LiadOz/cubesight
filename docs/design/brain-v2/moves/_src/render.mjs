// usage: node _src/render.mjs [prefix]
// Renders moves/<prefix>*.svg → .png with headless Chromium, then checks every
// <text> for (1) overlap with another <text>, (2) running outside the canvas, and
// (3) running outside its phone screen (groups marked data-clip="x,y,w,h").
const { chromium } = await import(new URL('../../../../../node_modules/playwright/index.mjs', import.meta.url));
import fs from 'fs';
const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const prefix = process.argv[2] || '';
const files = fs.readdirSync(OUT).filter(f => f.endsWith('.svg') && f.startsWith(prefix));
const b = await chromium.launch();
let problems = 0;
for (const f of files) {
  const src = fs.readFileSync(`${OUT}/${f}`, 'utf8');
  const m = src.match(/width="(\d+)" height="(\d+)"/);
  const [w, h] = [+m[1], +m[2]];
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('file://' + OUT + '/' + f);
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/${f.replace('.svg', '.png')}` });
  const issues = await p.evaluate(([W, H]) => {
    const out = [];
    const boxes = [...document.querySelectorAll('text')].filter(e => e.textContent.trim()).map(e => {
      const r = e.getBoundingClientRect();
      const g = e.closest('[data-clip]');
      // shrink the line box to the glyph band so stacked rows are not false positives
      const padY = r.height * 0.22;
      return { s: e.textContent, x0: r.left, x1: r.right, y0: r.top + padY, y1: r.bottom - padY, clip: g?.dataset.clip };
    });
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      if (a.x0 < -0.5 || a.x1 > W + 0.5 || a.y0 < 0 || a.y1 > H) out.push(`outside canvas: "${a.s}"`);
      if (a.clip) { const [x, y, cw, ch] = a.clip.split(',').map(Number); if (a.x0 < x + 4 || a.x1 > x + cw - 4 || a.y0 < y || a.y1 > y + ch) out.push(`outside phone: "${a.s}"`); }
      for (let j = i + 1; j < boxes.length; j++) {
        const c = boxes[j];
        const ix = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0), iy = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
        if (ix > 1 && iy > 1) out.push(`overlap: "${a.s}" × "${c.s}"`);
      }
    }
    return out;
  }, [w, h]);
  await p.close();
  problems += issues.length;
  console.log(issues.length ? `✗ ${f}` : `✓ ${f}`);
  for (const i of issues) console.log('   ', i);
}
await b.close();
console.log(problems ? `${problems} issue(s)` : 'no text overlaps or clipping');
