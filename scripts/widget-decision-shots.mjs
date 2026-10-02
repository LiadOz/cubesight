/* global document */
// Builds the one-image decision sheets (<ID>-00-decide.png) for the containers and lists posts.
//   node scripts/widget-decision-shots.mjs containers|lists
// Crops the real prototype frames (dark theme), shrinks them, and lays out 3 options side by side
// with up to 3 questions (Q1-Q3) drawn inside the image. Serves the repo on a random port (never 5173).
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
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const cache = {};
async function frame(view, opt, clip) {
  const k = `${view}${opt}${clip}`;
  if (cache[k]) return cache[k];
  await page.goto(`${base}?${new URLSearchParams({ view, opt: String(opt), theme: 'dark', legend: '0', id: 'x' })}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
  await page.waitForTimeout(150);
  // hide the numbered callouts: the decision sheet is about the look, not the notes
  await page.addStyleTag({ content: '.co{display:none!important}' });
  const box = await page.locator('#board .frame').first().boundingBox();
  const [cx, cy, cw, ch] = clip;
  const buf = await page.screenshot({ animations: 'disabled', clip: { x: box.x + cx, y: box.y + cy, width: cw, height: ch } });
  return (cache[k] = 'data:image/png;base64,' + buf.toString('base64'));
}
const shotsHtml = [];
for (let o = 1; o <= 3; o++) { const row = []; for (const [v, , c] of set.shots) row.push(await frame(v, o, c)); shotsHtml.push(row); }
const thumbs = {};
for (const q of set.q) if (q.kind === 'thumbs') for (const [v, o, , c] of q.thumbs) if (v) thumbs[`${v}${o}`] = await frame(v, o, c);

const circ = '①②③';
const cols = [0, 1, 2].map((o) => `<div class="col"><div class="oh"><b class="n">${circ[o]}</b><span>${set.names[o]}</span></div>${shotsHtml[o].map((src, i) => `<figure><img src="${src}"><figcaption>${set.shots[i][1]}</figcaption></figure>`).join('')}</div>`).join('');
const qs = set.q.map((q) => {
  let body = '';
  if (q.kind === 'pick') body = `<div class="opts">${[0, 1, 2].map((o) => `<span class="chip"><b>${circ[o]}</b></span>`).join('')}</div>`;
  else if (q.kind === 'text') body = `<div class="opts">${q.opts.map((t) => `<span class="chip">${t}</span>`).join('')}</div>`;
  else body = `<div class="th">${q.thumbs.map(([v, o, l]) => `<figure>${v ? `<img src="${thumbs[v + o]}">` : '<div class="none">no glyph at the left of the row</div>'}<figcaption>${l}</figcaption></figure>`).join('')}</div>`;
  return `<div class="q"><h3>${q.t}</h3>${body}</div>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:1440px;background:#141311;color:#ede8dc;font:15px/1.35 "Manrope",system-ui,sans-serif}
.top{display:flex;gap:14px;align-items:baseline;padding:18px 28px;border-bottom:1px solid #2c2a26}
.top .id{font:13px ui-monospace,monospace;color:#2fb7a6}.top h1{margin:0;font-size:22px;font-weight:600}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:20px 28px}
.oh{display:flex;gap:10px;align-items:flex-start;min-height:56px;font-size:15px}.n{font-size:30px;line-height:1;color:#2fb7a6}
figure{margin:0 0 10px}figure img{width:100%;display:block;border-radius:8px;border:1px solid #2c2a26}
figcaption{font:12px ui-monospace,monospace;color:#9b958a;margin-top:4px}
.qs{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:18px 28px 28px;border-top:1px solid #2c2a26;background:#1a1916}
.q h3{margin:0 0 12px;font-size:17px;font-weight:600;color:#ede8dc}
.opts{display:flex;gap:10px;flex-wrap:wrap}.chip{background:#ede8dc;color:#141311;border-radius:999px;padding:8px 18px;font-weight:600;font-size:16px}
.th{display:grid;grid-template-columns:1fr 1fr;gap:12px}.none{aspect-ratio:16/10;border:1px dashed #5a564e;border-radius:8px;display:grid;place-items:center;text-align:center;padding:10px;color:#9b958a;font-size:13px}
</style><body><div id="b"><div class="top"><span class="id">${set.id}</span><h1>${set.title}</h1></div>
<div class="cols">${cols}</div><div class="qs">${qs}</div></div></body>`;
const p2 = await ctx.newPage();
await p2.setContent(html);
await p2.waitForFunction(() => [...document.images].every((i) => i.complete));
const out = path.join(root, set.dir, set.file);
fs.writeFileSync(out, await p2.locator('#b').screenshot());
console.log('wrote', out);
await browser.close();
server.close();
