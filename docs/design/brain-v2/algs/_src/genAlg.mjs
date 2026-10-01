// Algorithm database & drills mockups.
//   ALG_THEME=orbit-dark node _src/genAlg.mjs  -> A-01..A-05 (+ phone)
//   ALG_THEME=mono-dark  node _src/genAlg.mjs  -> A-mono-02-drill
//   node _src/render.mjs [prefix]              -> PNG + overlap/clipping check
// Sample data only (invented cubers and timings).
import fs from 'fs';
import { t, svg, MONO, SANS, CUBE_STD, cube } from '../../_src/lib.mjs';
import { generatePllCase, PLL_CASES } from '../../../../../src/pll-logic.js';

const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const THEMES = {
  'orbit-dark': { style: 'orbit', pfx: 'A-', bg: '#141311', surface: '#1d1b18', surface2: '#2b2925', ink: '#ece6d8', sub: '#9a9486', faint: '#6d675c', acc: '#3dbfad', accSoft: '#16403a', onAcc: '#0b1f1c', warn: '#e6a642', warnSoft: '#4d3715', dnf: '#ec6b5f', track: '#34312b', line: '#34312b', keyBg: '#2b2925', keyInk: '#d9d2c3', cubeBody: '#1d1b18', masked: '#34312b', bezel: '#2c2a26', notch: '#000', btn: '#ece6d8', btnInk: '#141311', glow: '#3dbfad' },
  'mono-dark': { style: 'mono', pfx: 'A-mono-', bg: '#16171b', surface: '#1f2126', surface2: '#1f2126', ink: '#d9d6cb', sub: '#8a8e99', faint: '#6b6f7a', acc: '#e7b34c', accSoft: '#6b5424', onAcc: '#16171b', warn: '#e0675e', warnSoft: '#5a2d2a', dnf: '#e0675e', track: '#34373f', line: '#34373f', keyBg: '#1f2126', keyInk: '#d9d6cb', cubeBody: '#0b0c0e', masked: '#34373f', bezel: '#2a2c31', notch: '#000', btn: '#e7b34c', btnInk: '#16171b', glow: null },
};
const THEME = process.env.ALG_THEME || 'orbit-dark';
const P = THEMES[THEME];
const ORBIT = P.style === 'orbit';
const FONTS = ORBIT ? ['manrope', 'mono400', 'mono500'] : ['mono300', 'mono400', 'mono500'];
const WORD = ORBIT ? SANS : MONO;
const wt = w => (ORBIT ? w : w >= 600 ? 500 : w <= 300 ? 300 : 400);
const MONO_PAL = { w: '#e8e6de', y: '#f2c94c', g: '#3fa66a', b: '#3d6fd6', r: '#d9534a', o: '#e98a3c' };
const PAL = { ...(ORBIT ? CUBE_STD : MONO_PAL), '.': P.masked };
const CUBE_O = ORBIT ? { shadeF: 0.86, shadeR: 0.72 } : { shadeF: 0.84, shadeR: 0.68 };
const W = 1440, H = 900;
const X0 = ORBIT ? 64 : 160, X1 = ORBIT ? 1376 : 1280;
const f1 = n => (+n).toFixed(1);
const mw = (s, size) => String(s).length * size * 0.6;
const ww = (s, size, w = 500) => String(s).length * size * (ORBIT ? (w >= 700 ? 0.6 : 0.55) : 0.6);

const lab = (x, y, s, o = {}) => t(x, y, s, { size: 12, fill: P.sub, family: MONO, ...o, weight: o.weight || 400 });
const wd = (x, y, s, o = {}) => t(x, y, s, { size: 15, fill: P.ink, family: WORD, ...o, weight: wt(o.weight || 500) });
const mono = (x, y, s, o = {}) => t(x, y, s, { size: 14, fill: P.ink, family: MONO, ...o, weight: o.weight || 400 });
const big = (x, y, s, o = {}) => t(x, y, s, { fill: P.ink, family: ORBIT ? SANS : MONO, tnum: 1, ls: -3, ...o, weight: 300 });
const rect = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${rx}" fill="${fill}" ${extra}/>`;
const hline = (x0, x1, y, col = P.line, w = 1, extra = '') => `<line x1="${f1(x0)}" y1="${f1(y)}" x2="${f1(x1)}" y2="${f1(y)}" stroke="${col}" stroke-width="${w}" ${extra}/>`;
const vline = (x, y0, y1, col = P.line, w = 1, extra = '') => `<line x1="${f1(x)}" y1="${f1(y0)}" x2="${f1(x)}" y2="${f1(y1)}" stroke="${col}" stroke-width="${w}" ${extra}/>`;
const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="${fill}" ${extra}/>`;
const DEFS = P.glow ? `<defs><radialGradient id="cubeGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${P.glow}" stop-opacity="0.22"/><stop offset="0.55" stop-color="${P.glow}" stop-opacity="0.07"/><stop offset="1" stop-color="${P.glow}" stop-opacity="0"/></radialGradient></defs>` : '';
const page = (w, h, body) => svg(w, h, DEFS + body, { fonts: FONTS, bg: P.bg });
function write(name, content) { fs.writeFileSync(`${OUT}/${P.pfx}${name}.svg`, content); console.log('wrote', `${P.pfx}${name}.svg`); }

// ---------- real case data ----------
const CMAP = { white: 'y', yellow: 'w', green: 'g', blue: 'b', red: 'o', orange: 'r' }; // yellow-top colour scheme (z2 relabel)
function stickerAt(state, x, y, z, face) {
  const c = state.cubies.find(q => q.position[0] === x && q.position[1] === y && q.position[2] === z);
  return c ? CMAP[c.stickers[face]] || '.' : '.';
}
function caseFaces(name, auf = '') {
  const s = generatePllCase(name, { auf }).state;
  let U = '', F = '', R = '';
  for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) U += stickerAt(s, x, 1, z, 'U');
  for (let y = 1; y >= -1; y--) for (let x = -1; x <= 1; x++) F += stickerAt(s, x, y, 1, 'F');
  for (let y = 1; y >= -1; y--) for (let z = 1; z >= -1; z--) R += stickerAt(s, 1, y, z, 'R');
  const top = { B: [-1, 0, 1].map(x => stickerAt(s, x, 1, -1, 'B')), Fr: [-1, 0, 1].map(x => stickerAt(s, x, 1, 1, 'F')), L: [-1, 0, 1].map(z => stickerAt(s, -1, 1, z, 'L')), Rr: [-1, 0, 1].map(z => stickerAt(s, 1, 1, z, 'R')) };
  return { U, F, R, top };
}
// top-down LL thumbnail (PLL diagram style)
function thumb(cx, cy, size, faces, o = {}) {
  const c = size / 5, x0 = cx - size / 2, y0 = cy - size / 2;
  let s = '';
  const col = ch => PAL[ch] || PAL['.'];
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) s += rect(x0 + c + q * c, y0 + c + r * c, c - 1.2, c - 1.2, col(faces.U[r * 3 + q]), 1.5);
  const t4 = faces.top;
  for (let i = 0; i < 3; i++) {
    s += rect(x0 + c + i * c, y0, c - 1.2, c * 0.42, col(t4.B[i]), 1);
    s += rect(x0 + c + i * c, y0 + size - c * 0.42, c - 1.2, c * 0.42, col(t4.Fr[i]), 1);
    s += rect(x0, y0 + c + i * c, c * 0.42, c - 1.2, col(t4.L[i]), 1);
    s += rect(x0 + size - c * 0.42, y0 + c + i * c, c * 0.42, c - 1.2, col(t4.Rr[i]), 1);
  }
  return `<g opacity="${o.opacity ?? 1}">${s}</g>`;
}
function cubeAt(cx, cy, s, faces, extra = {}) {
  let g = '';
  if (P.glow) g += `<ellipse cx="${cx}" cy="${cy + s * 1.2}" rx="${s * 1.05}" ry="${s * 0.2}" fill="url(#cubeGlow)"/>`;
  if (ORBIT) g += `<ellipse cx="${cx}" cy="${cy + s * 1.18}" rx="${s * 0.78}" ry="${s * 0.1}" fill="#000" opacity="0.35"/>`;
  return g + cube(cx, cy + s * 0.5, s, faces, { palette: PAL, body: P.cubeBody, ...CUBE_O, ...extra });
}
// solved F2L on the sides: fix F/R side rows below the top row so the lower two rows read solved
function dispFaces(name, auf = '') { const f = caseFaces(name, auf); return { U: f.U, F: f.F, R: f.R }; }

// ---------- chrome ----------
function keycap(x, y, label, o = {}) {
  const size = o.size || 11, w = Math.max(22, mw(label, size) + 14);
  return { w, s: rect(x, y - 14, w, 20, o.fill || P.keyBg, ORBIT ? 5 : 4) + t(x + w / 2, y, label, { size, fill: o.col || P.keyInk, family: MONO, anchor: 'middle', weight: 500 }) };
}
function hints(y, items, cx = W / 2) {
  const parts = items.map(([k, l]) => { const kw = Math.max(22, mw(k, 11) + 14); return { k, l, kw, w: kw + 8 + mw(l, 12) }; });
  const total = parts.reduce((a, p) => a + p.w, 0) + 32 * (parts.length - 1);
  let x = cx - total / 2, s = '';
  for (const p of parts) { s += keycap(x, y, p.k).s + lab(x + p.kw + 8, y, p.l); x += p.w + 32; }
  return s;
}
function battery(x, y, pct, col) { return `<rect x="${x}" y="${y}" width="22" height="11" rx="2.5" fill="none" stroke="${col}" stroke-width="1.2"/><rect x="${x + 22.5}" y="${y + 3.5}" width="2" height="4" rx="1" fill="${col}"/><rect x="${x + 2}" y="${y + 2}" width="${(18 * pct) / 100}" height="7" rx="1.2" fill="${col}"/>`; }
function topbar(o = {}) {
  const x0 = ORBIT ? 48 : 160, x1 = ORBIT ? W - 48 : W - 160, y = 44;
  let s = '', x = x0;
  s += t(x, y, 'cubesight', { size: 18, fill: P.ink, family: WORD, weight: ORBIT ? 800 : 500, ls: ORBIT ? -0.3 : 0 });
  x = ORBIT ? x0 + 128 : x0 + 120;
  const size = ORBIT ? 14 : 13;
  for (const n of ['brain', 'drills', 'progress']) { const on = n === 'drills'; s += t(x, y, n, { size, fill: on ? P.ink : P.sub, family: WORD, weight: wt(on ? 700 : 500) }); x += ww(n, size, on ? 700 : 500) + 28; }
  s += t(x - 14, y, `/ ${o.crumb || 'algs'}`, { size, fill: P.ink, family: WORD, weight: wt(500) }); x += ww(`/ ${o.crumb || 'algs'}`, size) + 14;
  if (o.back) {
    const label = `← ${o.back}`, lw = mw(label, 12), bx = x + 12, bw = lw + 54;
    s += rect(bx, y - 18, bw, 26, P.accSoft, 13) + t(bx + 12, y, label, { size: 12, fill: P.acc, family: MONO, weight: 500 });
    s += keycap(bx + lw + 20, y + 1, 'b', { fill: P.bg, col: P.ink }).s;
  }
  if (o.cube !== false) s += circle(x1 - 148, y - 4.5, 3.5, P.acc) + lab(x1 - 138, y, 'GAN 356 i3', {}) + battery(x1 - 50, y - 10, 84, P.sub) + lab(x1, y, '84%', { anchor: 'end' });
  return s;
}
function chip(x, y, label, o = {}) { // pill tag, returns {w, s}
  const size = o.size || 11, w = mw(label, size) + 18;
  return { w, s: rect(x, y - 14, w, 22, o.fill || P.accSoft, ORBIT ? 11 : 4, o.stroke ? `stroke="${o.stroke}" stroke-width="1"` : '') + t(x + w / 2, y + 1, label, { size, fill: o.col || P.acc, family: MONO, weight: 500, anchor: 'middle' }) };
}
function pill(x, y, w, h, label, o = {}) {
  let s = ORBIT ? rect(x, y, w, h, P.btn, h / 2) : rect(x + 1, y + 1, w - 2, h - 2, 'none', 8, `stroke="${P.acc}" stroke-width="2"`);
  const tc = ORBIT ? P.btnInk : P.acc;
  s += wd(x + (o.key ? 28 : w / 2), y + h / 2 + 6, label, { size: o.size || 16, fill: tc, weight: 700, anchor: o.key ? 'start' : 'middle' });
  if (o.key) { const k = keycap(0, 0, o.key); s += keycap(x + w - 24 - k.w, y + h / 2 + 4, o.key, { fill: ORBIT ? '#2b2925' : P.accSoft, col: ORBIT ? '#e9e4d8' : P.ink }).s; }
  return s;
}
const sample = (x, y, o = {}) => lab(x, y, 'sample data', { fill: P.faint, anchor: o.anchor || 'end' });
const ext = (x, y) => { // outbound link glyph + "needs internet"
  const c = chip(x, y, '↗ needs internet', { fill: 'none', col: P.sub, stroke: P.line, size: 10 });
  return c;
};

// ---------- sample data ----------
const ALG = "R U R' F' R U R' U' R' F R2 U' R'"; // Jb, AUF-stripped
const TOK = ALG.split(' ');
const DT = [0, 92, 84, 190, 104, 96, 88, 101, 112, 98, 210, 118, 106];   // this attempt, ms
const PBDT = [0, 86, 80, 120, 98, 90, 84, 96, 104, 92, 150, 108, 98];    // PB run
const cum = a => a.reduce((r, v, i) => (r.push((r[i - 1] || 0) + v), r), []);
const sec = ms => (ms / 1000).toFixed(2);
const HOT = new Set([3, 10]);

// move-guide token row. done: count done; hot: set
function tokenRow(x, y, toks, done, o = {}) {
  const size = o.size || 26, gap = o.gap || 18; let cx = x, s = '';
  toks.forEach((tk, i) => {
    const w = mw(tk, size);
    const state = i < done ? 'done' : i === done ? 'cur' : 'todo';
    const col = state === 'done' ? (o.hot && o.hot.has(i) ? P.warn : P.ink) : state === 'cur' ? P.acc : P.sub;
    if (state === 'cur') s += rect(cx - 8, y - size + 2, w + 16, size + 14, P.accSoft, ORBIT ? 8 : 4) + hline(cx - 2, cx + w + 2, y + 13, P.acc, 2.5);
    s += t(cx, y, tk, { size, fill: col, family: MONO, weight: state === 'cur' ? 500 : 400 });
    if (o.regrip && o.regrip.includes(i)) s += lab(cx + w / 2, y - size - 4, '↺', { size: 12, fill: P.faint, anchor: 'middle' });
    cx += w + gap;
  });
  return { s, x: cx };
}
// per-move timing bars. n tokens; area (x,y,w,h); done = tokens done; ghost = PB
function moveBars(x, y, w, h, toks, dt, ghost, done, o = {}) {
  const n = toks.length, slot = w / n, bw = Math.min(40, slot - 12), maxv = 240;
  let s = hline(x, x + w, y + h, P.line);
  [100, 200].forEach(v => { const yy = y + h - (v / maxv) * h; s += hline(x, x + w, yy, P.line, 1, 'stroke-dasharray="2 6" opacity="0.7"') + lab(x - 8, yy + 4, `${v}`, { anchor: 'end', fill: P.faint, size: 10 }); });
  toks.forEach((tk, i) => {
    const cx = x + slot * i + slot / 2, bx = cx - bw / 2;
    if (i < done) {
      const bh = Math.max(3, (dt[i] / maxv) * h), hot = (o.hot && o.hot.has(i));
      s += rect(bx, y + h - bh, bw, bh, hot ? P.warn : P.acc, ORBIT ? 3 : 1);
      if (o.values !== false && dt[i] > 0) s += lab(cx, y + h - bh - 6, `${dt[i]}`, { anchor: 'middle', size: 10, fill: hot ? P.warn : P.sub });
    } else s += rect(bx, y + h - 3, bw, 3, P.track, 1);
    if (ghost && i > 0) { const gy = y + h - (ghost[i] / maxv) * h; s += hline(bx - 4, bx + bw + 4, gy, P.ink, 2); }
    s += t(cx, y + h + 22, tk, { size: 12, fill: i === done ? P.acc : P.sub, family: MONO, anchor: 'middle', weight: i === done ? 500 : 400 });
  });
  return s;
}

// ======================================================================
// A-01 algorithm browser
// ======================================================================
function browser() {
  let b = topbar({ crumb: 'algs', cube: false });
  b += wd(X0, 112, 'algorithms', { size: 30, weight: 700 });
  // set tabs
  const tabs = [['pll', 21, true], ['oll', 57, false], ['2-look oll', 10, false], ['f2l', 41, false]];
  let x = X0 + 210;
  tabs.forEach(([n, c, on]) => { const lbl = `${n} ${c}`; b += t(x, 112, lbl, { size: 14, fill: on ? P.acc : P.sub, family: MONO, weight: on ? 500 : 400 }); x += mw(lbl, 14) + 26; });
  b += lab(X0, 146, 'one database behind every drill, guide, and review · offline · 21 cases · 2 have a pick', {});
  // filters
  let fx = X0; const fy = 186;
  [['all', 1], ['my picks', 0], ['not learned', 0], ['slowest', 0], ['due', 0]].forEach(([l, on]) => { const c = chip(fx, fy, l, { fill: on ? P.accSoft : P.surface, col: on ? P.acc : P.sub }); b += c.s; fx += c.w + 10; });
  // grid 7x3 of cases (left), detail right
  const names = PLL_CASES.map(c => c.name);
  const gx = X0, gy = 214, cw = 98, ch = 112;
  const status = { Aa: 'pick', Ab: 'pick', Jb: 'sel', Ga: 'slow', Gb: 'slow', Gc: 'slow', Gd: 'slow', E: 'none', Na: 'none', Nb: 'none', V: 'none', Y: 'none', Ra: 'none', Rb: 'none' };
  names.forEach((n, i) => {
    const col = i % 6, row = Math.floor(i / 6), cx = gx + col * (cw + 8), cy = gy + row * (ch + 8);
    const st = status[n] || 'pick', sel = st === 'sel';
    b += rect(cx, cy, cw, ch, sel ? P.accSoft : P.surface, ORBIT ? 14 : 6, sel ? `stroke="${P.acc}" stroke-width="1.5"` : '');
    b += thumb(cx + cw / 2, cy + 44, 62, caseFaces(n));
    b += wd(cx + cw / 2, cy + 94, n, { size: 15, weight: 700, anchor: 'middle', fill: sel ? P.acc : P.ink });
    const dot = st === 'slow' ? P.warn : st === 'none' ? P.track : P.acc;
    b += circle(cx + cw - 12, cy + 12, 4, dot);
    if (st === 'pick' || sel) b += lab(cx + 10, cy + 16, '★', { size: 11, fill: P.acc });
  });
  b += circle(gx + 8, gy + 4 * 120 + 28, 4, P.acc) + lab(gx + 20, gy + 4 * 120 + 32, 'picked · fast', {}) + circle(gx + 170, gy + 4 * 120 + 28, 4, P.warn) + lab(gx + 182, gy + 4 * 120 + 32, 'picked · slow vs pb', {}) + circle(gx + 350, gy + 4 * 120 + 28, 4, P.track) + lab(gx + 362, gy + 4 * 120 + 32, 'no pick yet', {});
  // detail
  const dx = 760;
  b += vline(dx - 28, 192, 820, P.line);
  b += wd(dx, 236, 'Jb', { size: 34, weight: 700 }) + lab(dx + 70, 236, 'pll · adjacent corners · mirror of Ja', {});
  b += cubeAt(dx + 560, 232, 62, dispFaces('Jb'));
  b += lab(dx, 266, 'one pair of headlights, one adjacent corner swap; Jb direction', { fill: P.sub });
  // algs
  const algs = [
    { n: '#1', mine: false, nt: "R U2 R' U' R U2 L' U R' U' L", c: '11 htm · 11 stm', pb: 'not drilled', tags: ['uses L\'', 'OH-friendly'], src: [['site', 'speedcubedb · case page'], ['reconstruction', 'used in 11 of your imports']] },
    { n: '#2', mine: true, nt: "R U R' F' R U R' U' R' F R2 U' R'", c: '13 htm · 13 stm', pb: 'pb 1.21 s · 9.9 tps', tags: ['no rotation', 'right-hand'], src: [['video', 'J Perm · PLL video · 4:12'], ['standard', 'common notation']] },
  ];
  let ay = 312;
  algs.forEach(a => {
    const h = 176;
    b += rect(dx, ay, 600, h, P.surface, ORBIT ? 16 : 6, a.mine ? `stroke="${P.acc}" stroke-width="1.5"` : '');
    b += wd(dx + 20, ay + 34, a.n, { size: 17, weight: 700 });
    if (a.mine) { const c = chip(dx + 62, ay + 29, '★ my pick'); b += c.s; }
    b += lab(dx + 580, ay + 34, a.c, { anchor: 'end' });
    b += mono(dx + 20, ay + 70, a.nt, { size: 17 });
    let tx = dx + 20; a.tags.forEach(tg => { const c = chip(tx, ay + 100, tg, { fill: P.surface2, col: P.sub }); b += c.s; tx += c.w + 8; });
    b += lab(dx + 580, ay + 104, a.pb, { anchor: 'end', fill: a.pb.startsWith('pb') ? P.acc : P.faint });
    // sources
    let sy = ay + 132, sx = dx + 20;
    a.src.forEach(([ty, nm]) => {
      b += lab(sx, sy + 4, ty === 'video' ? '▶' : ty === 'site' ? '◆' : ty === 'reconstruction' ? '≡' : '○', { fill: P.acc });
      b += t(sx + 18, sy + 4, nm, { size: 12, fill: P.ink, family: WORD, weight: wt(500) });
      sx += 18 + ww(nm, 12) + 14;
      if (ty === 'video' || ty === 'site') { const c = ext(sx, sy + 3); b += c.s; sx += c.w + 18; }
    });
    ay += h + 12;
  });
  b += rect(dx, ay, 600, 60, 'none', ORBIT ? 14 : 6, `stroke="${P.line}" stroke-width="1" stroke-dasharray="4 5"`);
  b += wd(dx + 20, ay + 36, '+ add my alg or a source', { size: 14, fill: P.sub });
  b += lab(dx + 580, ay + 36, 'paste notation · it tells you which case it solves', { anchor: 'end' });
  b += sample(X1, 120);
  b += hints(868, [['↵', 'open case'], ['d', 'drill this alg'], ['m', 'make it mine'], ['a', 'add alg'], ['/', 'search']]);
  return page(W, H, b);
}

// ======================================================================
// A-02 drill in progress (Orbit: ring-free column; Mono: one column)
// ======================================================================
function drill() {
  let b = topbar({ crumb: 'algs / jb', back: 'case' });
  const done = 7;
  const cx0 = ORBIT ? 64 : X0;
  // config line
  const cfg = 'jb · alg #2 · repeat · rep 7 of 10 · auf random · cube: smart';
  b += sample(X1, 108) + t(W / 2, 108, cfg, { size: 13, fill: P.sub, family: MONO, anchor: 'middle' });
  // left: virtual cube
  const cx = ORBIT ? 250 : 330, cy = 158, s = 84;
  b += cubeAt(cx, cy, s, dispFaces('Jb', "U'"));
  const c1 = chip(cx - 96, cy + 200, 'virtual LL · repainted 6×', { size: 11 });
  b += c1.s;
  b += lab(cx, cy + 236, 'the screen shows the drilled case,', { anchor: 'middle' }) + lab(cx, cy + 254, 'not your physical top', { anchor: 'middle' });
  // right: clock
  const rx = ORBIT ? 540 : 560;
  b += lab(rx, 176, 'execution', {});
  b += big(rx - 6, 290, sec(cum(DT)[done - 1]), { size: 132, fill: P.acc });
  b += wd(rx + (ORBIT ? 272 : 330), 290, 's', { size: 30, fill: P.sub });
  b += lab(rx, 322, `${done} of 13 moves`, { size: 13 }) + lab(rx + 140, 322, '10.6 tps', { size: 13 }) + lab(rx + 240, 322, '+0.03 s vs pb at this move', { size: 13, fill: P.warn });
  // match line
  b += rect(rx + 560, 184, 256, 140, P.surface, ORBIT ? 14 : 6);
  b += lab(rx + 580, 208, 'live match', {});
  [['✓', 'frame y0 (no rotation)'], ['✓', "pre-auf U' done"], ['✓', 'F2L intact'], ['✓', 'no mistakes']].forEach(([m, l], i) => { b += t(rx + 580, 234 + i * 22, m, { size: 13, fill: P.acc, family: MONO, weight: 500 }) + t(rx + 604, 234 + i * 22, l, { size: 13, fill: P.ink, family: WORD, weight: wt(500) }); });
  // alg tokens
  const ty = 474;
  b += lab(cx0, ty - 44, 'alg #2 · normalised 13 moves · J Perm video source', {});
  const row = tokenRow(cx0, ty + 12, TOK, done, { size: 30, gap: 16, hot: HOT });
  b += row.s;
  b += t(row.x + 4, ty + 12, "U'", { size: 30, fill: P.faint, family: MONO });
  b += lab(row.x + 4, ty + 34, 'auf · optional', { fill: P.faint });
  // move bars
  const by = 540;
  b += lab(cx0, by, 'per-move time (ms since the previous move)', {}) ;
  b += rect(cx0 + 560, by - 12, 14, 3, P.ink) + lab(cx0 + 582, by - 8, 'your pb run', {}) + rect(cx0 + 690, by - 14, 10, 10, P.acc, 2) + lab(cx0 + 708, by - 8, 'this rep', {}) + rect(cx0 + 780, by - 14, 10, 10, P.warn, 2) + lab(cx0 + 798, by - 8, 'pause', {});
  b += moveBars(cx0 + 40, by + 30, X1 - cx0 - 60, 150, TOK, DT, PBDT, done, { hot: HOT });
  // previous reps strip
  const ry = 790;
  b += lab(cx0, ry, 'this block', {});
  const reps = [1.38, 1.44, 1.29, 1.41, 1.52, 1.36];
  reps.forEach((v, i) => { const rx2 = cx0 + 120 + i * 92; b += t(rx2, ry, v.toFixed(2), { size: 15, fill: v < 1.4 ? P.ink : P.sub, family: MONO, tnum: 1 }); });
  b += t(cx0 + 120 + 6 * 92, ry, '···', { size: 15, fill: P.acc, family: MONO, weight: 500 });
  b += lab(X1, ry, 'pb 1.21 · median 1.39 · ao12 1.41', { anchor: 'end' });
  b += hints(868, [['space', 'skip rep'], ['p', 'peek real top'], ['r', 'reset rep'], ['esc', 'end block']]);
  return page(W, H, b);
}

// ======================================================================
// A-03 drill results
// ======================================================================
function results() {
  let b = topbar({ crumb: 'algs / jb / results', back: 'case' });
  b += lab(X0, 120, 'jb · alg #2 · block of 10', {});
  b += lab(X0, 156, 'median execution', {});
  b += big(X0 - 4, 252, '1.36', { size: 120, fill: P.acc }) + wd(X0 + 250, 252, 's', { size: 28, fill: P.sub });
  const stats = [['best this block', '1.29', P.ink], ['vs pb', '+0.15', P.warn], ['vs ao12', '−0.05', P.acc], ['clean', '9/10', P.ink]];
  stats.forEach(([l, v, c], i) => { const x = X0 + i * 150; b += lab(x, 300, l, {}) + t(x, 334, v, { size: 26, fill: c, family: ORBIT ? SANS : MONO, weight: ORBIT ? 600 : 300, tnum: 1 }); });
  // attempt history chart (right)
  const cx = 660, cy = 150, cw = 716, chh = 220;
  b += lab(cx, 130, 'execution time · last 28 reps', {});
  const vals = [1.62, 1.55, 1.58, 1.49, 1.51, 1.47, 1.52, 1.44, 1.48, 1.43, 1.46, 1.41, 1.45, 1.39, 1.44, 1.42, 1.38, 1.44, 1.4, 1.52, 1.38, 1.44, 1.29, 1.41, 1.52, 1.36, 1.33, 1.37];
  const lo = 1.15, hi = 1.7, yv = v => cy + 10 + chh - ((v - lo) / (hi - lo)) * chh, xv = i => cx + 30 + (i / (vals.length - 1)) * (cw - 50);
  [1.2, 1.4, 1.6].forEach(v => { b += hline(cx + 30, cx + cw - 10, yv(v), P.line, 1, 'stroke-dasharray="2 6"') + lab(cx + 20, yv(v) + 4, v.toFixed(1), { anchor: 'end', size: 10, fill: P.faint }); });
  // block bracket
  b += rect(xv(18) - 8, cy + 10, xv(27) - xv(18) + 16, chh, P.surface, 6, 'opacity="0.8"') + lab(xv(22.5), cy + 30, 'this block', { anchor: 'middle', size: 10 });
  b += hline(cx + 30, cx + cw - 10, yv(1.206), P.acc, 1.5, 'stroke-dasharray="6 4"') + lab(cx + cw - 10, yv(1.206) + 18, 'pb 1.21', { anchor: 'end', fill: P.acc });
  b += `<path d="M${vals.map((v, i) => `${f1(xv(i))},${f1(yv(v))}`).join(' L')}" fill="none" stroke="${P.sub}" stroke-width="1.6" stroke-linejoin="round"/>`;
  vals.forEach((v, i) => { const bad = i === 19; b += bad ? `<path d="M${f1(xv(i) - 4)},${f1(yv(v) - 4)} l8,8 M${f1(xv(i) + 4)},${f1(yv(v) - 4)} l-8,8" stroke="${P.dnf}" stroke-width="1.8" stroke-linecap="round"/>` : circle(xv(i), yv(v), i >= 18 ? 4 : 2.6, i >= 18 ? P.acc : P.sub); });
  b += lab(cx + 30, cy + chh + 34, '4 sessions ago', {}) + lab(cx + cw - 10, cy + chh + 34, 'now', { anchor: 'end' }) + lab(cx + 330, cy + chh + 34, '✕ = mistake, not a pb candidate', { fill: P.faint, anchor: 'middle' });
  b += hline(X0, X1, 428);
  // hotspots
  b += lab(X0, 464, 'where the time goes · median per move (ms) vs your pb run', {});
  const med = [0, 90, 86, 188, 106, 98, 90, 102, 114, 99, 206, 120, 108];
  b += moveBars(X0 + 40, 500, 720, 150, TOK, med, PBDT, 13, { hot: HOT, values: true });
  // hotspot cards
  const hx = 880;
  b += wd(hx, 484, 'hesitation hotspots', { size: 15, weight: 700 });
  [["F'", 'move 4', 'pause in 8 of 10 reps', '+68 ms vs pb', 'after the R U R\' trigger: look ahead to the F\''], ['R2', 'move 11', 'pause in 7 of 10 reps', '+56 ms vs pb', 'regrip marked here; it is the same hand shift every rep']].forEach(([m, n, a, d, tip], i) => {
    const y = 504 + i * 100;
    b += rect(hx, y, 496, 88, P.surface, ORBIT ? 14 : 6);
    b += t(hx + 20, y + 40, m, { size: 28, fill: P.warn, family: MONO, weight: 500 });
    b += lab(hx + 100, y + 30, `${n} · ${a}`, { fill: P.ink }) + lab(hx + 100, y + 52, d, { fill: P.warn });
    b += lab(hx + 20, y + 76, tip, { fill: P.sub });
  });
  // bottom
  b += pill(X0, 740, 290, 56, 'another block', { key: 'space' });
  b += wd(X0 + 320, 774, 'or', { size: 14, fill: P.sub }) + keycap(X0 + 350, 774, 'h').s + wd(X0 + 384, 774, 'drill only the pause at F\'', { size: 14 });
  b += lab(hx, 774, 'next review of alg #2: in 2 days · target 1.44 s', {});
  b += hints(868, [['space', 'another block'], ['h', 'hotspot drill'], ['b', 'back to case'], ['m', 'make alg #2 mine']]);
  return page(W, H, b);
}

// ======================================================================
// A-04 top solves use
// ======================================================================
function topSolves() {
  let b = topbar({ crumb: 'algs / jb', back: 'case', cube: false });
  b += wd(X0, 116, 'Jb · used in top solves', { size: 30, weight: 700 });
  b += lab(X0, 146, 'from the 41 reconstructions you imported · 12 cubers · 19 of them contain a Jb', {});
  b += sample(X1, 146);
  b += lab(X0, 196, 'alg', {}) + lab(840, 196, 'share', {}) + lab(1130, 196, 'uses', { anchor: 'end' }) + lab(1200, 196, 'cubers', { anchor: 'end' }) + lab(X1, 196, 'you', { anchor: 'end' });
  b += hline(X0, X1, 208);
  const rows = [
    { n: '#1', nt: "R U2 R' U' R U2 L' U R' U' L", sh: 0.58, u: 11, c: 7, me: 'not drilled' },
    { n: '#2', nt: "R U R' F' R U R' U' R' F R2 U' R'", sh: 0.26, u: 5, c: 3, me: '★ mine · pb 1.21', mine: true },
    { n: '#3', nt: "L' U' L F L' U' L U L F' L2 U L", sh: 0.11, u: 2, c: 2, me: '' },
    { n: '?', nt: "unmatched · 1 use · not in your database", sh: 0.05, u: 1, c: 1, me: '+ add', unk: true },
  ];
  rows.forEach((r, i) => {
    const y = 250 + i * 64;
    b += wd(X0, y, r.n, { size: 16, weight: 700, fill: r.unk ? P.faint : P.ink }) + mono(X0 + 40, y, r.nt, { size: 16, fill: r.unk ? P.sub : P.ink });
    b += rect(840 - 0, y - 12, 240, 12, P.track, 3) + rect(840, y - 12, 240 * r.sh / 0.58, 12, r.mine ? P.acc : P.ink, 3);
    b += t(1130, y, `${r.u}`, { size: 15, fill: P.ink, family: MONO, anchor: 'end', tnum: 1 }) + t(1200, y, `${r.c}`, { size: 15, fill: P.ink, family: MONO, anchor: 'end', tnum: 1 });
    b += t(840 + 250, y + 0, '', {});
    b += lab(X1, y, r.me, { anchor: 'end', fill: r.mine || r.unk ? P.acc : P.faint });
    b += lab(1090, y - 20, `${Math.round(r.sh * 100)}%`, { anchor: 'start', size: 11, fill: P.sub });
  });
  b += hline(X0, X1, 500);
  // by cuber
  b += wd(X0, 540, 'by cuber', { size: 16, weight: 700 }) + lab(X0 + 110, 540, 'who uses which alg, and from which reconstruction', {});
  const cubers = [['Ilya K.', "#1 × 3", 'wca 2024 final', 3, 0], ['Noor A.', '#1 × 2 · #2 × 1', 'cubesolv.es', 2, 1], ['Mateo R.', '#2 × 3', 'forum post', 3, 1], ['Hana S.', '#1 × 2 · #3 × 1', 'wca 2023 semi', 2, 2]];
  cubers.forEach(([nm, use, src, n, alt], i) => {
    const y = 584 + i * 46;
    b += wd(X0, y, nm, { size: 15, weight: 600 }) + mono(X0 + 160, y, use, { size: 14 });
    for (let k = 0; k < n; k++) b += rect(X0 + 440 + k * 18, y - 13, 12, 16, [P.acc, P.ink, P.sub][k === 0 ? 0 : alt] || P.acc, 2);
    b += lab(X0 + 520, y, src, { fill: P.sub }) + ext(X0 + 660, y).s;
  });
  // right insight panel
  const ix = 940, iy = 540;
  b += rect(ix, iy, 436, 240, P.surface, ORBIT ? 16 : 6);
  b += lab(ix + 24, iy + 34, 'for you', {});
  b += wd(ix + 24, iy + 70, 'You use #2. 26% of top solves do.', { size: 17, weight: 700 });
  b += wd(ix + 24, iy + 98, '#1 leads with 58% (11 uses, 7 cubers) and is', { size: 13, fill: P.sub }) + wd(ix + 24, iy + 118, 'the shorter alg: 11 moves against 13.', { size: 13, fill: P.sub });
  b += pill(ix + 24, iy + 146, 190, 48, 'drill #1', { size: 15, key: 'd' });
  b += pill(ix + 226, iy + 146, 186, 48, 'make #1 mine', { size: 15, key: 'm' });
  b += lab(ix + 24, iy + 224, 'counts: only reconstructions you imported', { fill: P.faint });
  b += lab(X0, 836, 'import reconstructions:  paste text · alg.cubing.net link (parsed on the device) · file   ·   nothing is fetched', { fill: P.sub });
  b += hints(868, [['i', 'import'], ['d', 'drill'], ['m', 'make mine'], ['b', 'back']]);
  return page(W, H, b);
}

// ======================================================================
// A-05 phone (3 screens)
// ======================================================================
function phone(x, y, inner, label) {
  const w = 390, h = 844;
  let s = rect(x - 10, y - 10, w + 20, h + 20, P.bezel, 56);
  s += `<clipPath id="ph${x}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="46"/></clipPath>`;
  s += `<g clip-path="url(#ph${x})" data-clip="${x},${y},${w},${h}">` + rect(x, y, w, h, P.bg) + rect(x + 140, y + 12, 110, 30, P.notch, 15);
  s += t(x + 34, y + 36, '9:41', { size: 15, fill: P.ink, family: SANS, weight: 700 }) + battery(x + 330, y + 26, 84, P.sub);
  s += `<g transform="translate(${x},${y})">${inner}</g></g>`;
  return s + lab(x + w / 2, y + h + 44, label, { size: 13, anchor: 'middle' });
}
function tabBar() {
  let s = hline(0, 390, 770, P.line);
  [['drills', 65], ['brain', 195], ['progress', 325]].forEach(([n, x]) => { const on = n === 'drills'; s += rect(x - 6, 790, 12, 12, on ? P.acc : P.sub, 3) + t(x, 824, n, { size: 11, fill: on ? P.acc : P.sub, family: MONO, weight: on ? 500 : 400, anchor: 'middle' }); });
  return s;
}
function mobile() {
  const PX = [70, 510, 950], PY = 90;
  let b = lab(64, 44, 'orbit · phone · algorithm browser, case, self-timed drill (works offline, no cube needed)', {});
  // 1 browser
  let s = wd(24, 112, 'algorithms', { size: 24, weight: 700 }) + lab(366, 112, 'sample data', { anchor: 'end', fill: P.faint });
  let tx = 24; [['pll', 1], ['oll', 0], ['2-look', 0], ['f2l', 0]].forEach(([n, on]) => { s += t(tx, 146, n, { size: 13, fill: on ? P.acc : P.sub, family: MONO, weight: on ? 500 : 400 }); tx += mw(n, 13) + 22; });
  const names = PLL_CASES.map(c => c.name);
  names.forEach((n, i) => { const col = i % 3, row = Math.floor(i / 3), cx = 24 + col * 120, cy = 172 + row * 84; const sel = n === 'Jb';
    s += rect(cx, cy, 112, 76, sel ? P.accSoft : P.surface, 12, sel ? `stroke="${P.acc}" stroke-width="1.5"` : '') + thumb(cx + 34, cy + 38, 50, caseFaces(n)) + wd(cx + 84, cy + 44, n, { size: 14, weight: 700, anchor: 'middle', fill: sel ? P.acc : P.ink }) + circle(cx + 100, cy + 12, 3.5, ['Ga', 'Gb', 'Gc', 'Gd'].includes(n) ? P.warn : ['E', 'Na', 'Nb', 'V', 'Y', 'Ra', 'Rb'].includes(n) ? P.track : P.acc); });
  s += tabBar();
  b += phone(PX[0], PY, s, 'browser · 21 pll cases, status dot per case');
  // 2 case detail
  s = t(24, 112, '←', { size: 22, fill: P.ink, family: SANS }) + wd(56, 112, 'Jb', { size: 24, weight: 700 }) + lab(366, 112, 'pll', { anchor: 'end' });
  s += cubeAt(195, 150, 50, dispFaces('Jb'));
  [['#1', false, "R U2 R' U' R U2 L' U R' U' L", 'not drilled', 'speedcubedb · link', '11 moves'], ['#2', true, "R U R' F' R U R' U' R' F R2 U' R'", 'pb 1.21 s', 'J Perm · video 4:12', '13 moves']].forEach(([n, mine, nt, pb, src, mv], i) => {
    const y = 284 + i * 172;
    s += rect(20, y, 350, 160, P.surface, 16, mine ? `stroke="${P.acc}" stroke-width="1.5"` : '');
    s += wd(36, y + 32, n, { size: 16, weight: 700 }) + (mine ? chip(68, y + 27, '★ mine', { size: 10 }).s : '') + lab(354, y + 32, mv, { anchor: 'end' });
    s += mono(36, y + 62, nt.split(' ').slice(0, 7).join(' '), { size: 13 }) + mono(36, y + 82, nt.split(' ').slice(7).join(' '), { size: 13 });
    s += lab(36, y + 108, pb, { fill: mine ? P.acc : P.faint }) + lab(36, y + 132, '▶ ' + src, { fill: P.sub }) + chip(354 - mw('↗ needs internet', 10) - 18, y + 136, '↗ needs internet', { fill: 'none', col: P.sub, stroke: P.line, size: 10 }).s;
  });
  s += rect(24, 640, 342, 52, P.btn, 26) + wd(195, 672, 'drill alg #2', { size: 16, weight: 700, fill: P.btnInk, anchor: 'middle' });
  s += lab(195, 716, 'used by 7 of 12 cubers in your imports', { anchor: 'middle' });
  s += tabBar();
  b += phone(PX[1], PY, s, 'case · algs, sources as links, my pick');
  // 3 self-timed drill
  s = t(24, 112, '✕', { size: 18, fill: P.ink, family: SANS }) + t(195, 112, 'jb #2 · self-timed · 4 of 10', { size: 13, fill: P.sub, family: MONO, anchor: 'middle' });
  s += cubeAt(195, 190, 62, dispFaces('Jb', 'U'));
  s += chip(104, 352, 'you do it on your cube', { size: 11 }).s;
  s += big(24, 470, '0.81', { size: 92, fill: P.acc }) + wd(215, 470, 's', { size: 22, fill: P.sub });
  s += lab(24, 500, 'recognition', {}) + lab(366, 500, 'execution next', { anchor: 'end' });
  s += rect(24, 524, 342, 4, P.track, 2) + rect(24, 524, 120, 4, P.acc, 2);
  s += mono(24, 570, "R U R' F' R U R'", { size: 15, fill: P.sub }) + mono(24, 594, "U' R' F R2 U' R'", { size: 15, fill: P.sub });
  s += lab(24, 622, 'set up with the inverse, or alternate alg/inverse', { fill: P.faint, size: 11 });
  s += rect(24, 650, 342, 64, P.btn, 32) + wd(195, 688, 'tap: I know it', { size: 18, weight: 700, fill: P.btnInk, anchor: 'middle' });
  s += lab(195, 738, 'tap again when done · clean / hesitated / slip', { anchor: 'middle', size: 11 });
  s += lab(195, 760, 'manual timing: no per-move data', { anchor: 'middle', fill: P.faint, size: 11 });
  b += phone(PX[2], PY, s, 'self-timed drill · recognition split + execution, no cube');
  return page(W, H + 100, b).replace(`height="${H}"`, `height="${H + 100}"`);
}


// ======================================================================
// A-06 entry point: from the solve review (link chips -> route -> drill armed, back pill)
// ======================================================================
function fromReview() {
  let b = topbar({ crumb: 'algs / Jb / drill', back: 'review · solve 23' });
  // --- review excerpt (how the links look where the case is mentioned)
  b += lab(X0, 100, '1 · in the solve review: every case and alg is a link', {});
  b += rect(X0, 116, 1312, 176, P.surface, ORBIT ? 16 : 6);
  b += lab(X0 + 24, 146, 'solve 23 · 14.07 s · last layer', {});
  b += hline(X0 + 24, X1 - 24, 158);
  // row 1: oll
  const ly = 196;
  b += t(X0 + 24, ly, 'pll', { size: 12, fill: P.acc, family: MONO, weight: 500 });
  let x = X0 + 76;
  b += wd(x, ly, 'You used', { size: 16, fill: P.sub }); x += ww('You used ', 16) + 6;
  const cj = chip(x, ly - 3, 'Jb', { size: 13, fill: P.accSoft }); b += cj.s + hline(x + 6, x + cj.w - 6, ly + 14, P.acc, 1.5); x += cj.w + 10;
  b += wd(x, ly, 'perm', { size: 16, fill: P.sub }); x += ww('perm ', 16) + 8;
  const ca = chip(x, ly - 3, 'alg #2', { size: 13, fill: P.accSoft }); b += ca.s + hline(x + 6, x + ca.w - 6, ly + 14, P.acc, 1.5); x += ca.w + 10;
  b += wd(x, ly, '(J Perm video)  ·  1.12 s  ·  your drilled pb 0.98 s', { size: 16, fill: P.ink }); x += ww('(J Perm video)  ·  1.12 s  ·  your drilled pb 0.98 s', 16) + 24;
  const cd = chip(x, ly - 3, 'drill it', { size: 13, fill: P.btn, col: P.btnInk }); b += cd.s; x += cd.w + 8;
  b += keycap(x, ly - 2, 'd').s;
  b += t(X0 + 24, ly + 44, 'oll', { size: 12, fill: P.acc, family: MONO, weight: 500 });
  x = X0 + 76;
  b += wd(x, ly + 44, 'You used', { size: 16, fill: P.sub }); x += ww('You used ', 16) + 6;
  const c1 = chip(x, ly + 41, 'Sune', { size: 13, fill: P.accSoft }); b += c1.s + hline(x + 6, x + c1.w - 6, ly + 58, P.acc, 1.5); x += c1.w + 10;
  b += wd(x, ly + 44, '·  0.91 s  ·  no drilled pb yet', { size: 16, fill: P.ink }); x += ww('·  0.91 s  ·  no drilled pb yet', 16) + 24;
  const c2 = chip(x, ly + 41, 'drill it', { size: 13, fill: P.surface2, col: P.ink }); b += c2.s; x += c2.w + 8;
  b += keycap(x, ly + 42, 'd').s;
  b += lab(X1 - 24, 146, 'a link never leaves the app · works offline', { anchor: 'end', fill: P.faint });
  // --- arrow + route
  b += lab(X0, 332, '2 · the link is a local route; from= carries the way back', {});
  b += rect(X0, 346, 1312, 40, P.surface, ORBIT ? 20 : 6);
  b += mono(X0 + 24, 372, '#/algs/pll/Jb/drill', { size: 15, fill: P.acc });
  b += mono(X0 + 24 + mw('#/algs/pll/Jb/drill', 15), 372, '?alg=s.pll.Jb.2&from=review:solve-23', { size: 15, fill: P.sub });
  b += lab(X1 - 24, 372, 'no cube? the same route opens the self-timed drill', { anchor: 'end', fill: P.faint });
  // --- the drill, armed
  b += lab(X0, 452, '3 · the drill, armed: pre-filled with the alg from the review', {});
  b += rect(X0, 466, 1312, 356, P.bg, 0, `stroke="${P.line}" stroke-width="1"`);
  const cx = X0 + 170, cy = 552, s = 70;
  b += cubeAt(cx, cy, s, dispFaces('Jb'));
  b += chip(cx - 88, cy + 168, 'virtual LL · drilled case', { size: 11 }).s;
  b += lab(cx, cy + 206, 'start turning, no button', { anchor: 'middle' });
  const rx = X0 + 380;
  b += lab(rx, 506, 'jb · alg #2 · repeat · 10 reps · from your solve 23', {});
  b += big(rx - 4, 620, '0.00', { size: 100, fill: P.faint });
  b += wd(rx + 230, 620, 's', { size: 26, fill: P.faint });
  b += lab(rx, 650, 'the clock starts on your first move', {});
  b += tokenRow(rx, 716, TOK, 0, { size: 26, gap: 14 }).s;
  b += lab(rx, 752, 'your solve 23: 1.12 s · 11.6 tps  ·  drilled pb 0.98 s  ·  target 1.06 s', { fill: P.sub });
  const cr = chip(rx + 640, 506, '✓ F2L intact · cube synced', { size: 11 }); b += cr.s;
  b += rect(rx + 640, 560, 250, 100, P.surface, ORBIT ? 14 : 6) + lab(rx + 660, 588, 'back', {}) + wd(rx + 660, 618, 'after the block: back to review', { size: 13, fill: P.ink });
  b += lab(rx + 660, 642, 'with 1.12 → new median', { fill: P.sub });
  b += hints(868, [['b', 'back to review'], ['space', 'skip rep'], ['p', 'peek real top'], ['esc', 'end block']]);
  return page(W, H, b);
}

if (ORBIT) {
  write('01-browser', browser());
  write('02-drill', drill());
  write('03-results', results());
  write('04-top-solves', topSolves());
  write('05-mobile', mobile());
  write('06-from-review', fromReview());
} else {
  write('02-drill', drill());
}
