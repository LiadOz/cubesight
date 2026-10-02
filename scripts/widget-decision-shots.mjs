/* global document */
// Builds the one-image decision sheets (<ID>-00-decide.png) for the containers and lists posts.
//   node scripts/widget-decision-shots.mjs containers|lists [--scale=1|2|3]
// Captures the real prototype frames (dark theme) and lays out 3 options side by side with up to 3 questions
// (Q1-Q3) drawn inside the image. Serves the repo on a random port (never 5173).
// Resolution: the sheet is rendered at --scale (default 2). Every region is captured at the device scale it needs to
// land 1:1 on the sheet's device pixels (capture DPR = ceil(display zoom x scale)), so nothing is a shrunk or
// stretched bitmap. Outputs are NEW files (<ID>-decide-hd.png, <ID>-opt<n>-hd.png: each option's regions at full
// capture resolution, for opening alone); an existing file is never overwritten.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };

const SETS = {
  containers: {
    dir: 'gallery/widgets/2026-10-02-containers', page: 'containers.html', id: 'C-00', file: 'C-00-decide.png',
    title: 'containers: which look?',
    names: ['frameless: sections are space + a head; only lists and logs get a panel', 'soft panels: groups and disclosures sit in a soft fill with a hairline', 'hairline rules: no fills; structure by hairlines'],
    shots: [['settings', 'settings drawer', [960, 0, 480, 540]], ['confirm', 'delete dialog', [440, 300, 560, 320]]],
    q: [
      { t: 'Q1  which option?', kind: 'pick' },
      { t: 'Q2  the review detail: left rail or right drawer?', kind: 'thumbs', thumbs: [['review', 1, 'A  left rail (as in 1)', [0, 60, 720, 520]], ['review', 2, 'B  right drawer (as in 2)', [720, 60, 720, 520]]] },
      { t: 'Q3  one option for every container, or a mix?', kind: 'text', opts: ['A  one option for all', 'B  mix: say which container takes which'] },
    ],
  },
  lists: {
    dir: 'gallery/widgets/2026-10-02-lists-data', page: 'lists.html', id: 'L-00', file: 'L-00-decide.png',
    title: 'lists and data: which look?',
    names: ['open rows: no frame, only the selected row has a fill; stats are bare numbers', 'banded rows: every row a soft block; tags are pills; stats are tiles', 'hairline list: rows cut by hairlines; stats read as one line'],
    shots: [['history', 'history', [20, 130, 760, 420]], ['drill', 'drill case list', [20, 90, 760, 440]]],
    q: [
      { t: 'Q1  which option?', kind: 'pick' },
      { t: 'Q2  mini Orbit glyph on algs rows: keep or drop?', kind: 'thumbs', thumbs: [['algs', 1, 'A  keep the glyph (algs list)', [30, 190, 400, 250]], [null, 0, 'B  drop it: number, name, status only']] },
      { t: 'Q3  section head: where does the count go?', kind: 'text', opts: ['A  at the right (1)', 'B  as a pill (2)', 'C  hairline to it (3)'] },
    ],
  },
};
const SCALE = Number((process.argv.find((a) => a.startsWith('--scale=')) || '--scale=2').slice(8));
if (![1, 2, 3].includes(SCALE)) { console.error('--scale must be 1, 2 or 3'); process.exit(2); }
const SUF = SCALE === 1 ? '' : SCALE === 2 ? '-hd' : `-hd${SCALE}`;
const CELL = 900;   // CSS px per option column on the sheet (1800 device px at 2x)
const set = SETS[process.argv[2]];
if (!set) { console.error('usage: widget-decision-shots.mjs containers|lists'); process.exit(2); }

const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/${set.dir}/proto/${set.page}`;
const browser = await chromium.launch();
const ctxs = {};
const pageFor = async (dpr) => ctxs[dpr] || (ctxs[dpr] = await (await browser.newContext({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: dpr })).newPage());
const cache = {};
// capture one region at device scale `dpr`; returns { src (data url), raw (png buffer), w, h (CSS px of the clip) }
async function frame(view, opt, clip, dpr) {
  const k = `${view}|${opt}|${clip}|${dpr}`;
  if (cache[k]) return cache[k];
  const page = await pageFor(dpr);
  await page.goto(`${base}?${new URLSearchParams({ view, opt: String(opt), theme: 'dark', legend: '0', id: 'x' })}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
  await page.waitForTimeout(150);
  // hide the numbered callouts: the decision sheet is about the look, not the notes
  await page.addStyleTag({ content: '.co{display:none!important}' });
  const box = await page.locator('#board .frame').first().boundingBox();
  const [cx, cy, cw, ch] = clip;
  const raw = await page.screenshot({ animations: 'disabled', clip: { x: box.x + cx, y: box.y + cy, width: cw, height: ch } });
  return (cache[k] = { src: 'data:image/png;base64,' + raw.toString('base64'), raw, w: cw, h: ch });
}
// the display zoom of a clip shown `shownW` CSS px wide, and the capture DPR that makes it 1:1 on device pixels
const need = (clipW, shownW) => Math.max(1, Math.ceil((shownW / clipW) * SCALE));
const shotsHtml = [];
const optFiles = [];   // [option, shot index, raw png] for the stand-alone full-resolution images
for (let o = 1; o <= 3; o++) {
  const row = [];
  for (const [i, [v, , c]] of set.shots.entries()) { const f = await frame(v, o, c, need(c[2], CELL)); row.push(f); optFiles.push([o, i, f]); }
  shotsHtml.push(row);
}
const thumbW = CELL;   // a question column (same width as an option column); two thumbs share it
const thumbs = {};
for (const q of set.q) if (q.kind === 'thumbs') for (const [v, o, , c] of q.thumbs) if (v) thumbs[`${v}${o}`] = await frame(v, o, c, need(c[2], (thumbW - 12) / 2));

const circ = '①②③';
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cols = [0, 1, 2].map((o) => `<div class="col"><div class="oh"><b class="n">${circ[o]}</b><span>${set.names[o]}</span></div>${shotsHtml[o].map((f, i) => `<figure><img src="${f.src}"><figcaption>${set.shots[i][1]}</figcaption></figure>`).join('')}</div>`).join('');
const qs = set.q.map((q) => {
  let body = '';
  if (q.kind === 'pick') body = `<div class="opts">${[0, 1, 2].map((o) => `<span class="chip"><b>${circ[o]}</b></span>`).join('')}</div>`;
  else if (q.kind === 'text') body = `<div class="opts">${q.opts.map((t) => `<span class="chip">${t}</span>`).join('')}</div>`;
  else body = `<div class="th">${q.thumbs.map(([v, o, l]) => `<figure>${v ? `<img src="${thumbs[v + o].src}">` : '<div class="none">no glyph at the left of the row</div>'}<figcaption>${l}</figcaption></figure>`).join('')}</div>`;
  return `<div class="q"><h3>${q.t}</h3>${body}</div>`;
}).join('');
// Sizes are CSS px at 1x of the sheet (the PNG is SCALE times bigger): text stays well above 14 px.
const W = CELL * 3 + 2 * 40 + 2 * 40;
const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:${W}px;background:#141311;color:#ede8dc;font:26px/1.35 "Manrope",system-ui,sans-serif}
.top{display:flex;gap:24px;align-items:baseline;padding:30px 40px;border-bottom:1px solid #2c2a26}
.top .id{font:24px ui-monospace,monospace;color:#2fb7a6}.top h1{margin:0;font-size:40px;font-weight:600}
.cols{display:grid;grid-template-columns:repeat(3,${CELL}px);gap:40px;padding:34px 40px}
.oh{display:flex;gap:16px;align-items:flex-start;min-height:96px;font-size:26px}.n{font-size:56px;line-height:1;color:#2fb7a6}
figure{margin:0 0 20px}figure img{width:100%;display:block;border-radius:12px;border:1px solid #2c2a26}
figcaption{font:22px ui-monospace,monospace;color:#9b958a;margin-top:8px}
.qs{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;padding:30px 40px 44px;border-top:1px solid #2c2a26;background:#1a1916}
.q h3{margin:0 0 20px;font-size:30px;font-weight:600;color:#ede8dc}
.opts{display:flex;gap:16px;flex-wrap:wrap}.chip{background:#ede8dc;color:#141311;border-radius:999px;padding:12px 30px;font-weight:600;font-size:28px}
.th{display:grid;grid-template-columns:1fr 1fr;gap:12px}.none{aspect-ratio:16/10;border:1px dashed #5a564e;border-radius:12px;display:grid;place-items:center;text-align:center;padding:16px;color:#9b958a;font-size:22px}
</style><body><div id="b"><div class="top"><span class="id">${set.id}</span><h1>${set.title}</h1></div>
<div class="cols">${cols}</div><div class="qs">${qs}</div></div></body>`;
const sheetPage = await pageFor(SCALE);
await sheetPage.setViewportSize({ width: W, height: 1000 });
await sheetPage.setContent(html);
await sheetPage.waitForFunction(() => [...document.images].every((i) => i.complete));
const writeNew = (name, buf) => {
  const out = path.join(root, set.dir, name);
  if (fs.existsSync(out)) { console.log('exists, skipped', out); return; }
  fs.writeFileSync(out, buf);
  console.log('wrote', out);
};
writeNew(set.file.replace(/\.png$/, `${SUF}.png`), await sheetPage.locator('#b').screenshot());
// the stand-alone full-resolution regions of each option (open these from the post to read the detail)
for (const [o, i, f] of optFiles) writeNew(`${set.id}-opt${o}-${slug(set.shots[i][1])}${SUF || '-1x'}.png`, f.raw);
for (const q of set.q) if (q.kind === 'thumbs') for (const [v, o, l] of q.thumbs) if (v) writeNew(`${set.id}-${slug(q.t.split('  ')[0])}-${slug(l)}${SUF || '-1x'}.png`, thumbs[v + o].raw);
await browser.close();
server.close();
