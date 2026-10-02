/* global document */
// Renders the widget-proposal prototypes (gallery/widgets/<date>-<family>/proto/*.html) to numbered PNGs.
//   node scripts/widget-proposal-shots.mjs buttons|keycaps|status [--only=<substring>]
// It serves the repo root on a random local port (never 5173), loads each prototype view with Playwright,
// stitches dark + light where a view asks for both, and writes <ID>-<name>.png plus manifest.json (IDs, captions)
// into the post folder. Existing files are overwritten only when this script re-renders its own output.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };

const FAMILIES = {
  buttons: {
    dir: 'gallery/widgets/2026-10-02-buttons', page: 'buttons.html', prefix: 'W-04', label: 'W-04 buttons',
    views: [
      { key: 'states', both: true, title: 'states matrix, dark and light', caption: 'every emphasis x every state, then answer states, sizes and the phone touch sizes. Dark on top, light below.' },
      { key: 'results', title: 'results actions (A-05)', caption: 'next scramble · review · more… on the results frame.' },
      { key: 'settings', theme: 'light', title: 'settings drawer, light', caption: 'icon close, row-end secondary S, danger text, one primary.' },
      { key: 'drill', title: 'drill round answers (A-08)', caption: 'answer pills with number keys, skip, and the answered states.' },
      { key: 'phone', title: 'phone (A-09) touch sizes', caption: 'a drill and the results on a 390 px phone.' },
    ],
    compare: { key: 'compare', both: true, name: 'compare-options', title: 'the three options side by side', caption: 'dark above, light below.' },
  },
  keycaps: {
    dir: 'gallery/widgets/2026-10-02-keycaps', page: 'keycaps.html', prefix: 'W-17', label: 'W-17 keycaps',
    views: [
      { key: 'states', both: true, title: 'keycap states, dark and light', caption: 'default, pressed, held, unavailable; sizes; on primary, secondary and plain; the glyph set.' },
      { key: 'idle', title: 'key bar and start key on solve (A-01)', caption: 'start with the space key inside, the key bar bottom-left.' },
      { key: 'button', title: 'keycaps inside buttons (A-08)', caption: 'number keys on the answers, skip s, space on the primary.' },
      { key: 'results', title: 'key bar on results, a key held (A-05)', caption: 'the [ ] pair, one pressed, one resting.' },
    ],
    compare: { key: 'compare', both: true, name: 'compare-options', title: 'the three options side by side', caption: 'dark above, light below.' },
  },
  status: {
    dir: 'gallery/widgets/2026-10-02-status', page: 'status.html', prefix: 'W-16', label: 'W-16 status and toast',
    views: [
      { key: 'states', both: true, title: 'status line and toast states, dark and light', caption: 'tones, working, toast life cycle and the placement of each.' },
      { key: 'connecting', title: 'connecting (A-01, full orbit)', caption: 'the status while the full orbit spins.' },
      { key: 'error', title: 'an error (connect failed)', caption: 'the error line with its one recovery action.' },
      { key: 'toast', title: 'a saved toast over results (A-05)', caption: 'the toast next to the coach line, not on it.' },
      { key: 'phone', title: 'phone (A-09)', caption: 'status line and toast on a 390 px phone.' },
    ],
    compare: { key: 'compare', both: true, name: 'compare-options', title: 'the three options side by side', caption: 'dark above, light below.' },
  },
};

// W-21 moves: a hand-numbered job list (explicit IDs per option and view)
const MV = [['option', 'states', 'states, dark and light', 'every token state, the section forms and how the Orbit grows. Dark on top, light below.', true], ['option', 'solve', 'scramble on the Orbit and cube (desktop 1440 x 900)', 'mid scramble, move 13 of 20, as A-02.'], ['option', 'wrong', 'wrong turn, the Orbit grows (desktop)', 'the undo move is inserted and the ring gets a segment, as A-02b.'], ['option', 'phone', 'phone 390 x 844, scramble and wrong turn', 'the same two states on a phone.'], ['option', 'alg', 'alg playback with sections (T-perm), light', 'sections with an optional name; playing move 6 of 14.', false, 'light'], ['option', 'long', 'long sequence, rolling window (45 moves), light', 'what happens past the lookahead capacity.', false, 'light']];
const FAM_MOVES = { dir: 'gallery/widgets/2026-10-02-W-21-moves', page: 'moves.html', prefix: 'W-21', label: 'W-21 moves', jobs: [] };
FAM_MOVES.jobs.push({ id: 'W-21-01', file: 'W-21-01-overview.png', title: 'the three options side by side', caption: 'desktop mid scramble above, phone wrong turn below; dark above, light below.', both: true, params: { view: 'compare' } });
for (const o of [1, 2, 3]) MV.forEach(([, key, title, caption, both, th], i) => { const id = `W-21-${o}${i + 1}`; FAM_MOVES.jobs.push({ id, file: `${id}-option${o}-${key === 'solve' ? 'scramble-desktop' : key === 'wrong' ? 'wrong-turn-desktop' : key === 'phone' ? 'phone' : key === 'alg' ? 'alg-sections' : key === 'long' ? 'long-rolling' : key}.png`, title: `option ${o}: ${title}`, caption, both: !!both, theme: th || 'dark', params: { view: key, opt: String(o) } }); });
FAM_MOVES.jobs.push({ id: 'W-21-91', file: 'W-21-91-mini-form-lists.png', title: 'mini form in list rows, the three options', caption: 'history, alg, playing and review rows. Dark above, light below.', both: true, params: { view: 'mini' } });
FAMILIES.moves = FAM_MOVES;

const fam = FAMILIES[process.argv[2]];
if (!fam) { console.error('usage: widget-proposal-shots.mjs buttons|keycaps|status|moves [--only=text]'); process.exit(2); }
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/${fam.dir}/proto/${fam.page}`;
const outDir = path.join(root, fam.dir);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('page error:', e.message));

async function shot(params) {
  await page.goto(`${base}?${new URLSearchParams(params)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
  await page.waitForTimeout(150);
  return page.locator('#board').screenshot({ animations: 'disabled' });
}
async function stitch(a, b) {
  const p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;background:#888"><div id="wrap" style="width:max-content"><img id="a" src="data:image/png;base64,${a.toString('base64')}" style="display:block"><img id="b" src="data:image/png;base64,${b.toString('base64')}" style="display:block"></div></body>`);
  await p.waitForFunction(() => [...document.images].every(i => i.complete));
  const buf = await p.locator('#wrap').screenshot();
  await p.close();
  return buf;
}

const manifest = fs.existsSync(path.join(outDir, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')) : {};
const pad = n => String(n).padStart(2, '0');
const jobs = fam.jobs ? [...fam.jobs] : [];
let n = 0;
if (!fam.jobs) jobs.push({ ...fam.compare, id: `${fam.prefix}-${pad(n)}`, file: `${fam.prefix}-${pad(n)}-${fam.compare.name}.png`, params: { view: 'compare' } });
for (const opt of fam.jobs ? [] : [1, 2, 3]) {
  for (const v of fam.views) {
    n++;
    const id = `${fam.prefix}-${pad(n)}`;
    jobs.push({ ...v, id, opt, file: `${id}-option${opt}-${v.key}.png`, params: { view: v.key, opt: String(opt) }, title: `option ${opt}: ${v.title}` });
  }
}
for (const j of jobs) {
  if (only && !j.file.includes(only)) continue;
  const common = { ...j.params, id: j.id };
  let buf;
  if (j.both) {
    const dark = await shot({ ...common, theme: 'dark' });
    const light = await shot({ ...common, theme: 'light', legend: '0', id: `${j.id} (light)` });
    buf = await stitch(dark, light);
  } else {
    buf = await shot({ ...common, theme: j.theme || 'dark' });
  }
  fs.writeFileSync(path.join(outDir, j.file), buf);
  manifest[j.file] = { id: j.id, title: j.title, caption: j.caption };
  console.log('wrote', j.file);
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await browser.close();
server.close();
