// Pixel comparison for design:diff. No runtime dependency is added: `sharp` is only used to decode/encode PNGs
// and is already installed as a transitive dev dependency of @vite-pwa/assets-generator; the comparison itself is
// implemented here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

let sharp;
try { sharp = (await import('sharp')).default; }
catch { throw new Error('design:diff needs the dev dependency `sharp` (installed transitively by @vite-pwa/assets-generator); run npm ci'); }

export const THRESHOLD = 24;   // max per-channel delta (0-255) below which two pixels count as equal
const CELL = 16;               // region grid cell size in px
const MIN_CELL_PIXELS = 6;     // a cell is "hot" when at least this many of its pixels differ
const BG = [0x14, 0x13, 0x11]; // Orbit dark page colour, used to find the reference's ink for the overlay

async function loadRaw(file, crop, [width, height]) {
  let image = sharp(file);
  if (crop) image = image.extract({ left: crop[0], top: crop[1], width, height });
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height) throw new Error(`${file} is ${info.width}x${info.height}, expected ${width}x${height}`);
  return data; // RGB
}

function insideBezel(x, y, w, h, r) {
  const cx = x < r ? r : x >= w - r ? w - r - 1 : x, cy = y < r ? r : y >= h - r ? h - r - 1 : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function countCells(diff, w, h) {
  const cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL);
  const count = new Uint32Array(cols * rows);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (diff[y * w + x]) count[(y / CELL | 0) * cols + (x / CELL | 0)]++;
  return { count, cols, rows };
}

export async function compareFrame(frame, { refDir, outDir, bezel }) {
  const [w, h] = frame.viewport;
  const dir = join(outDir, frame.frame);
  mkdirSync(dir, { recursive: true });
  const ref = await loadRaw(join(refDir, frame.ref), frame.crop, frame.viewport);
  const app = await loadRaw(join(dir, 'app.png'), null, frame.viewport);
  writeFileSync(join(dir, 'ref.png'), await sharp(ref, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer());

  const valid = new Uint8Array(w * h), diff = new Uint8Array(w * h);
  let compared = 0, differing = 0;
  const out = Buffer.alloc(w * h * 3), overlay = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = i / w | 0, o = i * 3;
    valid[i] = bezel && !insideBezel(x, y, w, h, bezel) ? 0 : 1;
    const dr = Math.abs(ref[o] - app[o]), dg = Math.abs(ref[o + 1] - app[o + 1]), db = Math.abs(ref[o + 2] - app[o + 2]);
    const refGrey = (ref[o] * 3 + ref[o + 1] * 6 + ref[o + 2]) / 10, appGrey = (app[o] * 3 + app[o + 1] * 6 + app[o + 2]) / 10;
    if (!valid[i]) { out[o] = out[o + 1] = out[o + 2] = 0; overlay[o] = overlay[o + 1] = overlay[o + 2] = 0; continue; }
    compared++;
    const bad = Math.max(dr, dg, db) > THRESHOLD;
    if (bad) { diff[i] = 1; differing++; }
    // diff.png: faded reference in grey, differing pixels in red scaled by how wrong they are.
    if (bad) { const k = Math.min(255, 120 + Math.max(dr, dg, db)); out[o] = k; out[o + 1] = 30; out[o + 2] = 30; }
    else { const g = refGrey * 0.45; out[o] = out[o + 1] = out[o + 2] = g; }
    // overlay.png: app in dim greyscale, reference ink (anything off the page colour) in one hot magenta.
    const ink = Math.max(Math.abs(ref[o] - BG[0]), Math.abs(ref[o + 1] - BG[1]), Math.abs(ref[o + 2] - BG[2]));
    const base = appGrey * 0.7 + 8;
    if (ink > 14) {
      const a = Math.min(1, ink / 60) * 0.85;
      overlay[o] = base * (1 - a) + 255 * a; overlay[o + 1] = base * (1 - a) + 43 * a; overlay[o + 2] = base * (1 - a) + 214 * a;
    } else overlay[o] = overlay[o + 1] = overlay[o + 2] = base;
  }
  await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(join(dir, 'diff.png'));
  await sharp(overlay, { raw: { width: w, height: h, channels: 3 } }).png().toFile(join(dir, 'overlay.png'));

  const { count, cols, rows } = countCells(diff, w, h);
  // Connected components (8-neighbour) of hot cells, biggest first.
  const comp = new Int32Array(cols * rows).fill(-1);
  const boxes = [];
  for (let start = 0; start < count.length; start++) {
    if (comp[start] !== -1 || count[start] < MIN_CELL_PIXELS) continue;
    const id = boxes.length, stack = [start]; comp[start] = id;
    const box = { cx0: Infinity, cy0: Infinity, cx1: -1, cy1: -1, pixels: 0 };
    while (stack.length) {
      const c = stack.pop(), cx = c % cols, cy = c / cols | 0;
      box.pixels += count[c]; box.cx0 = Math.min(box.cx0, cx); box.cx1 = Math.max(box.cx1, cx); box.cy0 = Math.min(box.cy0, cy); box.cy1 = Math.max(box.cy1, cy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, n = ny * cols + nx;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && comp[n] === -1 && count[n] >= MIN_CELL_PIXELS) { comp[n] = id; stack.push(n); }
      }
    }
    boxes.push(box);
  }
  const top = boxes.map(box => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = box.cy0 * CELL; y < Math.min(h, (box.cy1 + 1) * CELL); y++) for (let x = box.cx0 * CELL; x < Math.min(w, (box.cx1 + 1) * CELL); x++) {
      if (diff[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, pixels: box.pixels };
  }).sort((a, b) => b.pixels - a.pixels || a.y - b.y || a.x - b.x).slice(0, 8);
  return { frame: frame.frame, viewport: `${w}x${h}`, diffPixels: differing, comparedPixels: compared, diffPercent: Math.round(differing / compared * 10000) / 100, regions: top };
}

export function readSummary(file) { return JSON.parse(readFileSync(file, 'utf8')); }
