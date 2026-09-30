// Trainers & site structure — mockups for the drills hub, contextual "drill this",
// a re-skinned PLL drill, unified progress, the nav across the site, and the
// phone "quick drill" context.
//
// usage (from docs/design/brain-v2/trainers):
//   T_THEME=orbit-dark  node _src/genT.mjs   → T-*.svg        (priority)
//   T_THEME=orbit-light node _src/genT.mjs   → T-light-*.svg
//   T_THEME=mono-dark   node _src/genT.mjs   → T-mono-*.svg
//   node _src/render.mjs [prefix]            → .png + overlap / clipping check
import fs from 'fs';
import { cube, t, svg, MONO, SANS, SOLVE, STATES, HISTORY, histLabel, histValue, cumulative, fmt, CUBE_STD } from '../../_src/lib.mjs';

const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Colours are the tokens.md values (muted = the AA-safe --b-muted).
const THEMES = {
  'orbit-dark': {
    style: 'orbit', dark: true, pfx: 'T-',
    bg: '#141311', canvas: '#0d0c0b', surface: '#1d1b18', surface2: '#2b2925', ink: '#ece6d8', sub: '#9a9486', faint: '#6d675c',
    acc: '#3dbfad', accText: '#3dbfad', accSoft: '#16403a', onAcc: '#0b1f1c', warn: '#e6a642', warnText: '#e6a642', warnSoft: '#4d3715', dnf: '#ec6b5f',
    track: '#34312b', line: '#34312b', slow: '#ece6d8', keyBg: '#2b2925', keyInk: '#d9d2c3', band: '#1b1a17',
    cubeBody: '#1d1b18', masked: '#34312b', shadow: '#000000', shadowOp: 0.35, glow: '#3dbfad', bezel: '#2c2a26', notch: '#000000',
    btn: '#ece6d8', btnInk: '#141311',
  },
  'orbit-light': {
    style: 'orbit', dark: false, pfx: 'T-light-',
    bg: '#f3f0e8', canvas: '#e9e4d8', surface: '#ebe6da', surface2: '#e6e0d3', ink: '#1c1b18', sub: '#65605a', faint: '#b3ad9f',
    acc: '#0a7d71', accText: '#07695e', accSoft: '#d3e6e1', onAcc: '#ffffff', warn: '#c77700', warnText: '#9a5c00', warnSoft: '#f1dcb4', dnf: '#c8372d',
    track: '#dcd6c8', line: '#dcd6c8', slow: '#1c1b18', keyBg: '#37352f', keyInk: '#e9e4d8', band: '#ebe6da',
    cubeBody: '#1c1b18', masked: '#cfc8b8', shadow: '#1c1b18', shadowOp: 0.07, glow: null, bezel: '#1c1b18', notch: '#1c1b18',
    btn: '#1c1b18', btnInk: '#f3f0e8',
  },
  'mono-dark': {
    style: 'mono', dark: true, pfx: 'T-mono-',
    bg: '#16171b', canvas: '#101114', surface: '#1f2126', surface2: '#1f2126', ink: '#d9d6cb', sub: '#8a8e99', faint: '#6b6f7a',
    acc: '#e7b34c', accText: '#e7b34c', accSoft: '#6b5424', onAcc: '#16171b', warn: '#e0675e', warnText: '#e0675e', warnSoft: '#5a2d2a', dnf: '#e0675e',
    track: '#34373f', line: '#34373f', slow: '#e0675e', keyBg: '#1f2126', keyInk: '#d9d6cb', band: '#1b1c20',
    cubeBody: '#0b0c0e', masked: '#34373f', shadow: '#000000', shadowOp: 0, glow: null, bezel: '#2a2c31', notch: '#000000',
    btn: '#e7b34c', btnInk: '#16171b',
  },
};
const THEME = process.env.T_THEME || 'orbit-dark';
const P = THEMES[THEME];
if (!P) throw new Error(`unknown T_THEME ${THEME}`);
const ORBIT = P.style === 'orbit';
const FONTS = ORBIT ? ['manrope', 'mono400', 'mono500'] : ['mono300', 'mono400', 'mono500'];
const WORD = ORBIT ? SANS : MONO;
const MONO_PAL = { w: '#e8e6de', y: '#f2c94c', g: '#3fa66a', b: '#3d6fd6', r: '#d9534a', o: '#e98a3c' };
const PAL = { ...(ORBIT ? CUBE_STD : MONO_PAL), '.': P.masked };
const CUBE_O = ORBIT ? { shadeF: 0.86, shadeR: 0.72 } : { shadeF: 0.84, shadeR: 0.68 };
const W = 1440, H = 900;
const X0 = ORBIT ? 64 : 160, X1 = ORBIT ? 1376 : 1280; // content column

const DEFS = P.glow ? `<defs><radialGradient id="cubeGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${P.glow}" stop-opacity="0.22"/><stop offset="0.55" stop-color="${P.glow}" stop-opacity="0.07"/><stop offset="1" stop-color="${P.glow}" stop-opacity="0"/></radialGradient></defs>` : '';
const page = (w, h, body, bg = P.bg) => svg(w, h, DEFS + body, { fonts: FONTS, bg });
function write(name, content) { fs.writeFileSync(`${OUT}/${P.pfx}${name}.svg`, content); console.log('wrote', `${P.pfx}${name}.svg`, (content.length / 1024).toFixed(0) + 'KB'); }

// ---------- text ----------
const wt = w => (ORBIT ? w : w >= 600 ? 500 : w <= 300 ? 300 : 400);
const lab = (x, y, s, o = {}) => t(x, y, s, { size: 12, fill: P.sub, family: MONO, ...o, weight: o.weight || 400 });
const wd = (x, y, s, o = {}) => t(x, y, s, { size: 15, fill: P.ink, family: WORD, ...o, weight: wt(o.weight || 500) });
const num = (x, y, s, o = {}) => t(x, y, s, { size: 28, fill: P.ink, family: ORBIT ? SANS : MONO, tnum: 1, ...o, weight: wt(o.weight || (ORBIT ? 600 : 300)) });
const big = (x, y, s, o = {}) => t(x, y, s, { fill: P.ink, family: ORBIT ? SANS : MONO, tnum: 1, ls: -3, ...o, weight: 300 });
const ww = (s, size, w = 500) => String(s).length * size * (ORBIT ? (w >= 700 ? 0.6 : w >= 600 ? 0.58 : 0.55) : 0.6);
const mw = (s, size) => String(s).length * size * 0.6;

// ---------- geometry ----------
const rad = d => (d * Math.PI) / 180;
const polar = (cx, cy, r, a) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];
const f1 = n => (+n).toFixed(1);
function arcPath(cx, cy, r, a0, a1) {
  if (a1 - a0 >= 359.99) return arcPath(cx, cy, r, a0, a0 + 180) + ' ' + arcPath(cx, cy, r, a0 + 180, a1).replace(/^M[^A]+/, '');
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${f1(x0)},${f1(y0)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(x1)},${f1(y1)}`;
}
const arc = (cx, cy, r, a0, a1, stroke, w, extra = '') => `<path d="${arcPath(cx, cy, r, a0, a1)}" fill="none" stroke="${stroke}" stroke-width="${w}" ${extra.includes('stroke-linecap') ? '' : 'stroke-linecap="round"'} ${extra}/>`;
const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="${fill}" ${extra}/>`;
const ring = (cx, cy, r, stroke, w, extra = '') => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
const rect = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${rx}" fill="${fill}" ${extra}/>`;
const hline = (x0, x1, y, col = P.line, w = 1, extra = '') => `<line x1="${f1(x0)}" y1="${f1(y)}" x2="${f1(x1)}" y2="${f1(y)}" stroke="${col}" stroke-width="${w}" ${extra}/>`;
const vline = (x, y0, y1, col = P.line, w = 1, extra = '') => `<line x1="${f1(x)}" y1="${f1(y0)}" x2="${f1(x)}" y2="${f1(y1)}" stroke="${col}" stroke-width="${w}" ${extra}/>`;
function tick(cx, cy, r0, r1, a, stroke, w = 1.5) {
  const [x0, y0] = polar(cx, cy, r0, a), [x1, y1] = polar(cx, cy, r1, a);
  return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
}
const spark = (x, y, s, fill) => `<path d="M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s} Z" fill="${fill}"/>`;
const cross = (x, y, s, col, w = 1.8) => `<path d="M${f1(x - s)},${f1(y - s)} L${f1(x + s)},${f1(y + s)} M${f1(x + s)},${f1(y - s)} L${f1(x - s)},${f1(y + s)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
const check = (x, y, s, col, w = 2) => `<path d="M${f1(x - s)},${f1(y)} L${f1(x - s * 0.3)},${f1(y + s * 0.7)} L${f1(x + s)},${f1(y - s * 0.7)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
function smoothPath(pts) {
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d;
}
// tiny trend line; lowerBetter flips nothing, it just scales to the box
function trendLine(x, y, w, h, vals, col = P.sub, o = {}) {
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pts = vals.map((v, i) => [x + (i / (vals.length - 1)) * w, y + h - ((v - lo) / span) * h]);
  let s = `<path d="${smoothPath(pts)}" fill="none" stroke="${col}" stroke-width="${o.w || 1.6}" stroke-linejoin="round"/>`;
  if (o.dot !== false) s += circle(pts.at(-1)[0], pts.at(-1)[1], o.dotR || 3.5, o.dotCol || P.acc);
  return s;
}

// ---------- chrome ----------
function battery(x, y, pct, col) {
  return `<rect x="${x}" y="${y}" width="22" height="11" rx="2.5" fill="none" stroke="${col}" stroke-width="1.2"/><rect x="${x + 22.5}" y="${y + 3.5}" width="2" height="4" rx="1" fill="${col}"/><rect x="${x + 2}" y="${y + 2}" width="${(18 * pct) / 100}" height="7" rx="1.2" fill="${col}"/>`;
}
function gridIcon(x, y, col = P.sub) { let s = ''; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += rect(x + c * 6, y + r * 6, 4, 4, col, 0.8); return s; }
function gear(cx, cy, col) {
  let s = `<circle cx="${cx}" cy="${cy}" r="4.2" fill="none" stroke="${col}" stroke-width="1.6"/>`;
  for (let i = 0; i < 8; i++) s += tick(cx, cy, 5.2, 7.4, i * 45, col, 2);
  return s;
}
// device need glyph: none (hollow) / optional (half) / required (solid)
function devGlyph(x, y, kind, r = 4.5) {
  if (kind === 'required') return circle(x, y, r, P.acc);
  if (kind === 'optional') return ring(x, y, r, P.sub, 1.4) + `<path d="M${f1(x)},${f1(y - r)} A${r},${r} 0 0 0 ${f1(x)},${f1(y + r)} Z" fill="${P.sub}"/>`;
  return ring(x, y, r, P.sub, 1.4);
}
const DEV_LABEL = { none: 'no cube', optional: 'cube optional', required: 'smart cube' };
function keycap(x, y, label, o = {}) {
  const size = o.size || 11, w = Math.max(22, mw(label, size) + 14);
  return { w, s: rect(x, y - 14, w, 20, o.fill || P.keyBg, ORBIT ? 5 : 4) + t(x + w / 2, y, label, { size, fill: o.col || P.keyInk, family: MONO, anchor: 'middle', weight: 500 }) };
}
function hints(y, items, cx = W / 2) {
  const size = 12, parts = items.map(([k, l]) => { const kw = Math.max(22, mw(k, 11) + 14); return { k, l, kw, w: kw + 8 + mw(l, size) }; });
  const total = parts.reduce((a, p) => a + p.w, 0) + 32 * (parts.length - 1);
  let x = cx - total / 2, s = '';
  for (const p of parts) { s += keycap(x, y, p.k).s; s += lab(x + p.kw + 8, y, p.l); x += p.w + 32; }
  return s;
}
// top bar. o: { active, device: connected|dim|off|none|optional-off, back, dimNav, w, note }
function topbar(o = {}) {
  const w = o.w || W, x0 = ORBIT ? 48 : 160, x1 = ORBIT ? w - 48 : w - 160, y = 44;
  let nav = '', x = x0;
  if (!ORBIT) { nav += gridIcon(x, y - 14); x += 28; }
  nav += t(x, y, 'cubesight', { size: 18, fill: P.ink, family: WORD, weight: ORBIT ? 800 : 500, ls: ORBIT ? -0.3 : 0 });
  x = ORBIT ? x0 + 128 : x0 + 180;
  const size = ORBIT ? 14 : 13;
  for (const n of ['brain', 'drills', 'progress']) {
    const on = n === o.active;
    nav += t(x, y, n, { size, fill: on ? P.ink : P.sub, family: WORD, weight: wt(on ? 700 : 500) });
    if (on && o.underline) nav += hline(x, x + ww(n, size, 700), y + 10, P.acc, 2);
    x += ww(n, size, on ? 700 : 500) + 28;
  }
  if (o.crumb) { nav += t(x - 14, y, `/ ${o.crumb}`, { size, fill: P.ink, family: WORD, weight: wt(500) }); x += ww(`/ ${o.crumb}`, size) + 14; }
  let s = `<g opacity="${o.dimNav ? 0.35 : 1}">${nav}</g>`;
  if (o.back) {
    const label = `← ${o.back}`, lw = mw(label, 12);
    const bx = x + 12, bw = lw + 24 + 30;
    s += rect(bx, y - 18, bw, 26, P.accSoft, 13) + t(bx + 12, y, label, { size: 12, fill: P.accText, family: MONO, weight: 500 });
    s += keycap(bx + lw + 20, y + 1, 'b', { fill: P.bg, col: P.ink }).s;
  }
  const dev = o.device ?? 'connected';
  if (dev === 'connected' || dev === 'dim') {
    const col = dev === 'dim' ? P.faint : P.sub;
    s += circle(x1 - 148, y - 4.5, 3.5, dev === 'dim' ? P.faint : P.acc) + lab(x1 - 138, y, 'GAN 356 i3', { fill: col }) + battery(x1 - 50, y - 10, 84, col) + lab(x1, y, '84%', { fill: col, anchor: 'end' });
    if (o.note) s += lab(x1 - 160, y, o.note, { fill: P.faint, anchor: 'end' });
  } else if (dev === 'optional-off') {
    const txt = 'connect cube · optional';
    s += devGlyph(x1 - mw(txt, 12) - 12, y - 4.5, 'optional', 4) + lab(x1, y, txt, { anchor: 'end' });
  } else if (dev === 'none' && o.note) {
    s += lab(x1, y, o.note, { fill: P.faint, anchor: 'end' });
  }
  return s;
}
// monkeytype-style config line. groups: [[label, on], ...][]
function configLine(cy, groups, o = {}) {
  const size = 13, gi = 16, sep = 32, cx = o.cx ?? W / 2;
  let total = 0;
  groups.forEach((g, k) => { g.forEach(([l], i) => { total += mw(l, size) + (i ? gi : 0); }); if (k) total += sep; });
  if (o.title) total += mw(o.title, size) + sep;
  let x = cx - total / 2, s = '';
  if (!ORBIT) s += rect(x - 18, cy - 23, total + 36, 36, P.surface, 8);
  if (o.title) { s += t(x, cy, o.title, { size, fill: P.ink, family: MONO, weight: 500 }); x += mw(o.title, size); s += vline(x + sep / 2, cy - 12, cy + 2); x += sep; }
  groups.forEach((g, k) => {
    if (k) { s += vline(x + sep / 2, cy - 12, cy + 2); x += sep; }
    g.forEach(([l, on], i) => { if (i) x += gi; s += t(x, cy, l, { size, fill: on ? P.accText : P.sub, family: MONO, weight: on ? 500 : 400 }); x += mw(l, size); });
  });
  return s;
}
function pill(x, y, w, h, label, o = {}) { // primary action
  const fill = o.fill || P.btn, ink = o.ink || P.btnInk;
  let s = ORBIT || o.solid ? rect(x, y, w, h, fill, h / 2) : rect(x + 1, y + 1, w - 2, h - 2, 'none', 8, `stroke="${P.acc}" stroke-width="2"`);
  const tc = ORBIT || o.solid ? ink : P.acc;
  if (o.key) {
    s += wd(x + 28, y + h / 2 + 6, label, { size: o.size || 17, fill: tc, weight: 700 });
    const k = keycap(0, 0, o.key); const kx = x + w - 24 - k.w;
    s += keycap(kx, y + h / 2 + 4, o.key, { fill: ORBIT ? (P.dark ? '#2b2925' : '#37352f') : P.accSoft, col: ORBIT ? '#e9e4d8' : P.ink }).s;
  } else s += wd(x + w / 2, y + h / 2 + 6, label, { size: o.size || 17, fill: tc, weight: 700, anchor: 'middle' });
  return s;
}

// ---------- cube ----------
function cubeAt(cx, cy, s, state, extra = {}) {
  let g = '';
  if (P.glow) g += `<ellipse cx="${cx}" cy="${cy + s * 1.2}" rx="${s * 1.05}" ry="${s * 0.2}" fill="url(#cubeGlow)"/>`;
  if (P.shadowOp) g += `<ellipse cx="${cx}" cy="${cy + s * 1.18}" rx="${s * 0.78}" ry="${s * 0.1}" fill="${P.shadow}" opacity="${P.shadowOp}"/>`;
  return g + cube(cx, cy + s * 0.5, s, state, { palette: PAL, body: P.cubeBody, ...CUBE_O, ...extra });
}
// outline of the U-F-R corner cubie of a cube drawn with cubeAt(cx, cy, s), plus a "?" on its hidden F sticker
function cornerMark(cx, cy, s) {
  const c = Math.cos(Math.PI / 6);
  const L = [-c * s, -0.5 * s], R = [c * s, -0.5 * s], D = [0, s];
  const at = (...v) => v.reduce((a, [dx, dy, k]) => [a[0] + dx * k, a[1] + dy * k], [cx, cy]);
  const pts = [at([...L, 1 / 3]), at([...L, 1 / 3], [...R, 1 / 3]), at([...R, 1 / 3]), at([...R, 1 / 3], [...D, 1 / 3]), at([...D, 1 / 3]), at([...L, 1 / 3], [...D, 1 / 3])];
  const q = at([...L, 1 / 6], [...D, 1 / 6]);
  return `<polygon points="${pts.map(p => p.map(f1).join(',')).join(' ')}" fill="none" stroke="${P.acc}" stroke-width="${Math.max(2, s * 0.03)}" stroke-linejoin="round"/>` +
    t(f1(q[0]), f1(q[1] + s * 0.07), '?', { size: Math.round(s * 0.2), fill: P.ink, family: MONO, weight: 500, anchor: 'middle' });
}
const CORNER_STATE = { U: 'gowybrwyw', F: 'rb.gwgobw', R: 'gwbrrogbg' };
const PLL_STATE = { U: 'yyyyyyyyy', F: 'bgoggggggg'.slice(0, 9), R: 'rrgrrrrrr' };

// ---------- round progress: Orbit ring / Mono lane ----------
// res: 'f' fast · 's' slow · 'm' miss ; cur: index of the live case ; n: round length
function roundRing(cx, cy, r, res, cur, n, o = {}) {
  const gap = o.gap ?? 3, seg = (360 - gap * n) / n, w = o.w || 6;
  let s = '';
  for (let i = 0; i < n; i++) {
    const a0 = gap / 2 + i * (seg + gap), a1 = a0 + seg;
    if (i < res.length) s += arc(cx, cy, r, a0, a1, res[i] === 'f' ? P.acc : res[i] === 's' ? P.slow : P.dnf, w, 'stroke-linecap="butt"');
    else if (i === cur) {
      const af = a0 + (a1 - a0) * (o.frac ?? 0.5);
      s += arc(cx, cy, r, a0, a1, P.track, o.thin || 3) + arc(cx, cy, r, a0, af, P.acc, w + 2);
      const [dx, dy] = polar(cx, cy, r, af);
      s += circle(dx, dy, (w + 2) * 1.7, P.acc, 'opacity="0.14"') + circle(dx, dy, (w + 2) * 0.9, P.acc) + circle(dx, dy, (w + 2) * 0.34, P.bg);
    } else s += arc(cx, cy, r, a0, a1, P.track, o.thin || 3);
  }
  s += tick(cx, cy, r - 14, r + 14, 0, P.ink, 1.5);
  return s;
}
function roundLane(x, y, w, res, cur, n, o = {}) {
  const gap = o.gap ?? 6, seg = (w - gap * (n - 1)) / n, h = o.h || 6;
  let s = '';
  for (let i = 0; i < n; i++) {
    const sx = x + i * (seg + gap);
    if (i < res.length) s += rect(sx, y - h / 2, seg, h, res[i] === 'f' ? P.acc : P.warn, 1);
    else {
      s += rect(sx, y - h / 2, seg, h, P.track, 1);
      if (i === cur) { const fx = sx + seg * (o.frac ?? 0.5); s += rect(sx, y - h / 2, fx - sx, h, P.acc, 1) + rect(fx - 1.5, y - 11, 3, 22, P.acc, 1); }
    }
  }
  return s;
}
// time-left ring (a timed round drains like inspection)
function timerRing(cx, cy, r, frac, o = {}) {
  const w = o.w || 7;
  let s = ring(cx, cy, r, P.track, o.thin || 3);
  const end = 360 * frac;
  s += arc(cx, cy, r, 0, end, P.acc, w);
  const [dx, dy] = polar(cx, cy, r, end);
  s += circle(dx, dy, w * 1.7, P.acc, 'opacity="0.14"') + circle(dx, dy, w * 0.9, P.acc) + circle(dx, dy, w * 0.34, P.bg);
  s += tick(cx, cy, r - 12, r + 12, 0, P.ink, 1.5);
  return s;
}

// ---------- phone ----------
function phone(x, y, inner, label, o = {}) {
  const w = 390, h = 844;
  let s = rect(x - 10, y - 10, w + 20, h + 20, P.bezel, 56);
  s += `<clipPath id="ph${x}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="46"/></clipPath>`;
  s += `<g clip-path="url(#ph${x})" data-clip="${x},${y},${w},${h}">` + rect(x, y, w, h, P.bg);
  s += rect(x + 140, y + 12, 110, 30, P.notch, 15);
  s += t(x + 34, y + 36, '9:41', { size: 15, fill: P.ink, family: SANS, weight: 700 });
  s += battery(x + 330, y + 26, 84, P.sub);
  s += `<g transform="translate(${x},${y})">${inner}</g></g>`;
  if (label) s += lab(x + w / 2, y + h + 44, label, { size: 13, anchor: 'middle' });
  return s;
}
function tabBar(active) { // phone bottom tabs
  let s = hline(0, 390, 770, P.line);
  [['drills', 65], ['brain', 195], ['progress', 325]].forEach(([n, x]) => {
    const on = n === active;
    if (n === 'drills') { s += rect(x - 9, 787, 7, 7, on ? P.acc : P.sub, 1.5) + rect(x + 2, 787, 7, 7, on ? P.acc : P.sub, 1.5) + rect(x - 9, 798, 7, 7, on ? P.acc : P.sub, 1.5) + rect(x + 2, 798, 7, 7, on ? P.acc : P.sub, 1.5); }
    if (n === 'brain') { s += ring(x, 796, 9, on ? P.acc : P.sub, 1.6) + circle(x, 796, 3, on ? P.acc : P.sub); }
    if (n === 'progress') { s += `<path d="M${x - 10},${804} L${x - 4},${795} L${x + 1},${799} L${x + 10},${788}" fill="none" stroke="${on ? P.acc : P.sub}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`; }
    s += t(x, 824, n, { size: 11, fill: on ? P.accText : P.sub, family: MONO, weight: on ? 500 : 400, anchor: 'middle' });
  });
  return s;
}

// ======================================================================
// data
// ======================================================================
const DRILLS = [
  { key: 'c', id: 'corners', name: 'corner recognition', what: 'name the hidden sticker at a glance', modes: 'single · three · recall · glance', dev: 'none', level: '0.71 s · 94%', trend: [0.98, 0.95, 0.91, 0.86, 0.84, 0.8, 0.78, 0.74, 0.71], due: '14 due', preset: '2 min round' },
  { key: 'p', id: 'pll', name: 'pll recognition', what: 'call the PLL from two sides', modes: 'learn · mix · transfer · glance', dev: 'none', level: '0.92 s · 88%', trend: [1.4, 1.32, 1.28, 1.2, 1.12, 1.08, 1.0, 0.95, 0.92], due: '5 due', flag: 'slow in brain', preset: '20 cases' },
  { key: 'f', id: 'f2l', name: 'f2l deduction', what: 'spot pairs, then pick the best next one', modes: 'deduction · timed scan · best pair', dev: 'none', level: '11 in 30 s', trend: [-7, -8, -8, -9, -9, -10, -10, -11, -11], due: '3 due', preset: '30 s scan' },
  { key: 'x', id: 'scout', name: 'cross scout', what: 'plan cross and x-cross from a scramble', modes: 'explore · retrieval practice', dev: 'optional', level: '4 of 6 found', trend: null, due: '', preset: 'open' },
  { key: '', id: 'oll', name: 'oll recognition', what: 'later · fed by brain’s oll step', modes: '', dev: 'none', later: true },
];
const FORYOU = [
  ['1', 'g-perm recognition', 'brain: 1.9 s pause before G perms (others 0.6 s)', '20 cases · ~2 min'],
  ['2', 'corner review', '14 cases due · spaced repetition', '2 min round'],
  ['3', 'f2l timed scan', 'best 11 pairs · last played 4 days ago', '30 s'],
];
const ROUND = ['f', 'f', 'f', 's', 'f', 'f', 'm', 'f', 'f', 'f', 's', 'f']; // 12 of 20 answered
const ROUND_DONE = ['f', 'f', 'f', 's', 'f', 'f', 'm', 'f', 'f', 'f', 's', 'f', 'f', 'f', 'm', 'f', 'f', 's', 'f', 'f'];
const PLL_ROWS = [ // name, median, before, correct/total
  ['Ga', 0.74, 1.15, '4/4'], ['Gb', 0.69, 0.98, '4/4'], ['Gc', 1.21, 1.09, '2/4'], ['Gd', 0.81, 1.22, '4/4'], ['Aa', 0.62, 0.71, '4/4'],
];

// ======================================================================
// T-00 site map
// ======================================================================
function sitemap() {
  let b = topbar({ active: null, device: 'none' });
  b += wd(X0, 118, 'site map', { size: 30, weight: 700 });
  b += wd(X0, 148, 'two front doors, one shell: brain for the desk and the smart cube, drills for the phone and spare minutes.', { size: 15, fill: P.sub });
  // resolver
  const ry = 214;
  b += rect(X0, ry - 26, 1312, 44, P.surface, ORBIT ? 22 : 8);
  b += lab(X0 + 20, ry + 1, '#/', { size: 14, fill: P.accText, weight: 500 });
  b += wd(X0 + 60, ry + 1, 'home resolves by context:', { size: 14, weight: 600 });
  b += wd(X0 + 262, ry + 1, 'cube connected, or desktop and brain used last → brain.  phone, or no cube → drills.  an explicit route always wins.', { size: 14, fill: P.sub });
  // columns
  const cols = [
    { x: X0, title: 'brain', route: '#/brain', glyph: 'required', items: [['idle · scramble', ''], ['inspection · solving', ''], ['results', ''], ['  f  drill this weakness', 'acc'], ['  x  this cross in scout', 'acc']] },
    { x: X0 + 272, title: 'drills', route: '#/drills', glyph: 'none', items: [['corners', '#/drills/corners'], ['pll', '#/drills/pll'], ['f2l', '#/drills/f2l'], ['scout', '#/drills/scout'], ['oll (later)', '#/drills/oll']] },
    { x: X0 + 544, title: 'progress', route: '#/progress', glyph: null, items: [['overview', '#/progress'], ['brain solves', '#/progress/brain'], ['one per drill', '#/progress/pll …'], ['due for review', ''], ['export · import', '']] },
    { x: X0 + 816, title: 'settings', route: 'esc · #/settings', glyph: null, items: [['style: orbit / mono', ''], ['theme: dark / light', ''], ['brain: method, inspection', ''], ['drills: round length', ''], ['diagnostics →', 'acc']] },
    { x: X0 + 1088, title: 'dev (hidden)', route: '#/dev', glyph: 'required', items: [['studio', '#/dev/studio'], ['recordings · replay', '#/dev/replay'], ['device log', '#/dev/log']] },
  ];
  const cy0 = 300;
  for (const c of cols) {
    b += vline(c.x, cy0 - 24, cy0 + 250, P.line);
    b += wd(c.x + 16, cy0, c.title, { size: 20, weight: 700, fill: c.title.startsWith('dev') ? P.sub : P.ink });
    b += lab(c.x + 16, cy0 + 24, c.route, { size: 12, fill: P.accText, weight: 500 });
    if (c.glyph) b += devGlyph(c.x + 16 + ww(c.title, 20, 700) + 14, cy0 - 7, c.glyph, 4.5);
    c.items.forEach(([n, r], i) => {
      const y = cy0 + 70 + i * 40;
      const isAcc = r === 'acc';
      b += wd(c.x + 16, y, n, { size: 14, fill: isAcc ? P.accText : P.ink, weight: isAcc ? 600 : 500 });
      if (r && !isAcc) b += lab(c.x + 16, y + 17, r, { size: 11 });
    });
  }
  // flows
  const fy = 604;
  b += hline(X0, X1, fy - 36, P.line);
  b += lab(X0, fy, 'flows', { size: 13 });
  const flows = [
    ['brain results', '→ f', 'drill, pre-filtered to the weak cases', '→ b', 'back to brain, next scramble ready'],
    ['progress step row', '→ enter', 'the drill mapped to that step (cross → scout, f2l → f2l, pll → pll)', '', ''],
    ['phone home', '→ tap', 'continue last round in about 2 s; no connect prompt', '', ''],
    ['drill results', '→ space', 'one more round, same settings', '→ p', 'this drill’s progress'],
  ];
  flows.forEach(([a, k1, d1, k2, d2], i) => {
    const y = fy + 34 + i * 30;
    b += wd(X0, y, a, { size: 14, weight: 600 });
    b += lab(X0 + 170, y, k1, { size: 13, fill: P.accText, weight: 500 });
    b += wd(X0 + 250, y, d1, { size: 14, fill: P.sub });
    if (k2) { b += lab(X0 + 800, y, k2, { size: 13, fill: P.accText, weight: 500 }); b += wd(X0 + 860, y, d2, { size: 14, fill: P.sub }); }
  });
  // legend + redirects
  const ly = 800;
  b += hline(X0, X1, ly - 30, P.line);
  let lx = X0;
  for (const k of ['none', 'optional', 'required']) { b += devGlyph(lx + 5, ly - 4, k); b += lab(lx + 16, ly, DEV_LABEL[k]); lx += 150; }
  b += lab(X0 + 470, ly, 'old links redirect:', { fill: P.ink });
  b += lab(X0 + 620, ly, '#/corners  #/f2l  #/pll-recognition  #/cross-scout → #/drills/…', {});
  b += lab(X0 + 620, ly + 22, '#/debug  #/smart-cube → #/dev/studio', {});
  return page(W, H, b);
}

// ======================================================================
// T-01 drills hub (desktop)
// ======================================================================
function hub() {
  let b = topbar({ active: 'drills', device: 'connected' });
  const x0 = X0, x1 = X1;
  b += wd(x0, 122, 'drills', { size: ORBIT ? 34 : 28, weight: 700 });
  b += wd(x0, 152, 'short rounds, one key to start. no cube needed unless marked.', { size: 15, fill: P.sub });
  b += lab(x1, 116, 'today  3 rounds · 64 cases · 9 min', { anchor: 'end', size: 13, fill: P.ink });
  b += lab(x1, 140, '4-day streak', { anchor: 'end', size: 12, fill: P.accText });
  // for you
  b += lab(x0, 212, 'for you', { size: 13 });
  b += lab(x0 + 80, 212, 'from brain solves and review schedules', { size: 12, fill: P.faint });
  FORYOU.forEach(([k, title, why, len], i) => {
    const y = 250 + i * 38;
    if (i === 0) b += rect(x0 - 12, y - 25, x1 - x0 + 24, 36, P.accSoft, ORBIT ? 18 : 6, 'opacity="0.55"');
    b += keycap(x0, y, k).s;
    b += wd(x0 + 36, y, title, { size: 16, weight: 600, fill: i === 0 ? P.accText : P.ink });
    b += wd(x0 + 270, y, why, { size: 14, fill: P.sub });
    b += lab(x1, y, len, { anchor: 'end', size: 13, fill: i === 0 ? P.accText : P.sub });
  });
  b += hline(x0, x1, 376);
  // table
  const C = { name: x0 + 36, modes: x0 + 420, dev: x0 + 750, level: x0 + 880, due: x1 };
  const hy = 412;
  b += lab(C.name, hy, 'drill') + lab(C.modes, hy, 'modes') + lab(C.dev, hy, 'cube') + lab(C.level, hy, 'your level · 30 d') + lab(C.due, hy, 'review', { anchor: 'end' });
  DRILLS.forEach((d, i) => {
    const y = 458 + i * 72, op = d.later ? 0.45 : 1;
    let r = '';
    if (d.key) r += keycap(x0, y, d.key).s;
    r += wd(C.name, y, d.name, { size: 20, weight: 600 });
    if (d.flag) r += lab(C.name + ww(d.name, 20, 600) + 14, y - 2, d.flag, { size: 11, fill: P.warnText });
    r += wd(C.name, y + 22, d.what, { size: 14, fill: P.sub });
    if (d.modes) r += lab(C.modes, y, d.modes, { size: 13, fill: P.ink });
    if (d.preset) r += lab(C.modes, y + 22, `quick round: ${d.preset}`, { size: 12 });
    r += devGlyph(C.dev + 5, y - 4, d.dev) + lab(C.dev + 16, y, DEV_LABEL[d.dev], { size: 12 });
    if (d.trend) r += trendLine(C.level, y - 16, 64, 18, d.trend, P.sub, { dotR: 3 });
    if (d.level) r += lab(C.level + 80, y, d.level, { size: 13, fill: P.ink });
    if (d.due) r += lab(C.due, y, d.due, { anchor: 'end', size: 13, fill: P.warnText, weight: 500 });
    b += `<g opacity="${op}">${r}</g>`;
    if (i < DRILLS.length - 1) b += hline(x0, x1, y + 40, P.line, 1, 'opacity="0.6"');
  });
  b += hints(856, [['1–3', 'suggested'], ['c p f x', 'open drill'], ['enter', 'quick round'], ['esc', 'settings']]);
  return page(W, H, b);
}

// ======================================================================
// T-02 brain results + contextual "drill this"
// ======================================================================
const STEPS = SOLVE.steps;
const GAP = 3.2;
function layout(weights) {
  const total = weights.reduce((a, b) => a + b, 0), avail = 360 - GAP * weights.length;
  let a = GAP / 2; return weights.map(w => { const a0 = a, a1 = a + (w / total) * avail; a = a1 + GAP; return { a0, a1, mid: (a0 + a1) / 2 }; });
}
function ringLabel(cx, cy, r, a, lines) {
  const [x, y] = polar(cx, cy, r, a);
  const s = Math.sin(rad(a)), c = Math.cos(rad(a));
  const anchor = s > 0.25 ? 'start' : s < -0.25 ? 'end' : 'middle';
  const lh = 16, n = lines.length;
  let y0 = y + 4 - ((n - 1) * lh) / 2;
  if (c > 0.6) y0 = y - (n - 1) * lh;
  if (c < -0.6) y0 = y + 12;
  return lines.map((l, i) => t(f1(x), f1(y0 + i * lh), l.s, { size: l.size || 12, fill: l.fill || P.sub, family: MONO, weight: l.w || 400, anchor })).join('');
}
function donut(cx, cy, r, w = 14) {
  let s = '';
  const L = layout(STEPS.map(st => Math.max(st.t, 0.0001)));
  STEPS.forEach((st, i) => {
    const { a0, a1, mid } = L[i];
    if (st.skip) { const [x, y] = polar(cx, cy, r, mid); s += circle(x, y, 4, P.acc) + spark(x + 9, y - 9, 5, P.acc); return; }
    s += arc(cx, cy, r, a0, a1, st.t <= st.avg ? P.acc : P.slow, w, 'stroke-linecap="butt"');
    s += ringLabel(cx, cy, r + 22, mid, [{ s: st.key, fill: P.sub, size: 11 }]);
  });
  return s;
}
function tpsChart(x, y, w, h) {
  let s = '';
  const tot = SOLVE.time, ymax = 8;
  const X = v => x + (v / tot) * w, Y = v => y + h - (v / ymax) * h;
  const cum = cumulative(STEPS);
  let prev = 0;
  STEPS.forEach((st, i) => {
    if (st.skip) { s += spark(X(prev), y - 20, 5, P.acc); return; }
    const a = prev, e = cum[i];
    if (i % 2 === 0) s += rect(X(a), y, X(e) - X(a), h, P.band);
    s += lab(f1((X(a) + X(e)) / 2), y - 12, st.key, { size: 11, anchor: 'middle' });
    prev = e;
  });
  for (const g of [0, 2, 4, 6, 8]) { s += hline(x, x + w, Y(g), P.line, g === 0 ? 1 : 0.6); s += lab(x - 10, Y(g) + 4, String(g), { size: 11, anchor: 'end' }); }
  const raw = SOLVE.tpsCurve, sm = raw.map((v, i) => 0.25 * (raw[i - 1] ?? v) + 0.5 * v + 0.25 * (raw[i + 1] ?? v));
  const pts = sm.map((v, i) => [X(Math.min(i * 0.5, tot)), Y(v)]);
  const d = smoothPath(pts);
  s += `<path d="${d} L${f1(pts.at(-1)[0])},${Y(0)} L${x},${Y(0)} Z" fill="${P.acc}" opacity="0.08"/><path d="${d}" fill="none" stroke="${P.acc}" stroke-width="2.2" stroke-linejoin="round"/>`;
  s += hline(x, x + w, Y(4.52), P.ink, 1, 'stroke-dasharray="4 5" opacity="0.5"');
  s += lab(x + w, y - 40, 'your avg 4.52', { size: 11, anchor: 'end' });
  for (const sec of [0, 2, 4, 6, 8, 10, 12, 14]) s += lab(X(sec), y + h + 20, `${sec}s`, { size: 11, anchor: 'middle' });
  return s;
}
function splitBars(x, y, w, rowH = 30) {
  let s = '';
  const maxT = 3, bx = x + 90, bw = w - 90 - 150;
  STEPS.forEach((st, i) => {
    const yy = y + i * rowH;
    s += lab(x, yy + 5, st.key + (st.pseudo ? '*' : ''), { size: 13 });
    s += rect(bx, yy - 3, bw, 6, P.track, 3);
    if (!st.skip) s += rect(bx, yy - 3, (st.t / maxT) * bw, 6, st.t <= st.avg ? P.acc : P.slow, 3); else s += spark(bx + 6, yy, 6, P.acc);
    s += vline(bx + (st.avg / maxT) * bw, yy - 9, yy + 9, P.ink, 1.5);
    s += lab(bx + bw + 16, yy + 5, st.skip ? 'skip' : fmt(st.t), { size: 13, fill: st.skip ? P.acc : P.ink, weight: 500 });
    const dd = st.t - st.avg;
    s += lab(bx + bw + 150, yy + 5, `${dd <= 0 ? '−' : '+'}${Math.abs(dd).toFixed(2)}`, { size: 12, fill: dd <= 0 ? P.accText : P.warnText, anchor: 'end' });
  });
  return s;
}
function sparkline(x, y, w, h) {
  let s = '';
  const vals = HISTORY.map(histValue), lo = 12, hi = 20;
  const X = i => x + (i / (HISTORY.length - 1)) * w, Y = v => y + h - ((v - lo) / (hi - lo)) * h;
  let d = '';
  HISTORY.forEach((hh, i) => { const v = vals[i]; if (v == null) return; d += `${d ? ' L' : 'M'}${f1(X(i))},${f1(Y(v))}`; });
  s += `<path d="${d}" fill="none" stroke="${P.sub}" stroke-width="1.4" stroke-linejoin="round"/>`;
  HISTORY.forEach((hh, i) => {
    if (hh.pen === 'DNF') s += cross(X(i), y + 2, 4, P.dnf);
    else if (hh.pen === '+2') s += circle(X(i), Y(vals[i]), 3.5, P.warn);
    else if (hh.t === SOLVE.pb) s += circle(X(i), Y(vals[i]), 3.5, P.ink);
  });
  return s + circle(X(HISTORY.length - 1), Y(vals.at(-1)), 5, P.acc);
}
function brainResults() {
  let b = topbar({ active: 'brain' });
  const X = 64;
  b += lab(X, 140, 'time', { size: 14 });
  b += big(X - 6, 244, '14.07', { size: 120, fill: P.acc });
  b += wd(X + 330, 244, 's', { size: 28, fill: P.sub });
  [['moves', '68'], ['tps', '4.83'], ['inspection', '8.70'], ['vs ao12', '−0.96']].forEach(([k, v], i) => {
    const x = X + i * 104;
    b += lab(x, 302, k, { size: 13 }) + num(x, 336, v, { fill: k === 'vs ao12' ? P.acc : P.ink });
  });
  b += lab(X, 376, 'cfop · 2-look · pseudo pairs · wca · no penalty', { size: 12.5 });
  b += lab(520, 140, 'turns per second', { size: 14 });
  b += tpsChart(520, 180, 540, 180);
  const dcx = 1236, dcy = 262;
  b += donut(dcx, dcy, 96, 14);
  b += num(dcx, dcy - 4, '68', { size: 30, anchor: 'middle' }) + lab(dcx, dcy + 20, 'moves', { anchor: 'middle' });
  b += hline(64, 1376, 432);
  b += lab(X, 476, 'splits', { size: 14 });
  b += vline(X + 330, 464, 478, P.ink, 1.5) + lab(X + 342, 476, 'your average');
  b += lab(X + 580, 476, 'vs avg', { anchor: 'end' });
  b += splitBars(X, 516, 580, 32);
  const R = 760;
  b += lab(R, 476, 'session', { size: 14 });
  [['ao5', '14.62'], ['ao12', '15.03'], ['pb', '12.41'], ['mean', '15.21']].forEach(([k, v], i) => { const x = R + i * 104; b += lab(x, 512, k) + num(x, 540, v, { size: 22 }); });
  b += sparkline(1190, 494, 186, 50);
  // coach — the recognition line is new: it is the evidence for the drill below
  b += lab(R, 590, 'coach', { size: 14 });
  const coach = [
    [P.ink, "Cross took 8 moves — optimal was 6:", "F' R D2 L' B2 D"],
    [P.warn, 'Paused 0.9 s before your PLL (Aa). Your average pause is 0.55 s.', ''],
    [P.warn, 'Across this session G perms cost you most: 1.9 s pause, others 0.6 s.', ''],
  ];
  coach.forEach(([col, text, alg], i) => {
    const y = 620 + i * 26;
    b += circle(R + 4, y - 5, 3, col) + wd(R + 18, y, text, { size: 14 });
    if (alg) b += lab(R + 18 + ww(text, 14) + 10, y, alg, { size: 13, fill: P.accText, weight: 500 });
  });
  // fix next — one key each
  b += lab(R, 718, 'fix next', { size: 14 });
  b += lab(R + 80, 718, 'one key, pre-filtered, comes back here', { size: 12, fill: P.faint });
  const fx = [
    ['f', 'drill pll recognition', 'G perms + Aa · 20 cases · ~2 min', true],
    ['x', 'open this cross in cross scout', 'same scramble · 8 → 6 moves', false],
  ];
  fx.forEach(([k, title, meta, hot], i) => {
    const y = 754 + i * 40;
    if (hot) b += rect(R - 12, y - 24, 628, 36, P.accSoft, ORBIT ? 18 : 6);
    b += keycap(R, y, k, hot ? { fill: P.bg, col: P.ink } : {}).s;
    b += wd(R + 34, y, title, { size: 15, weight: 600, fill: hot ? P.accText : P.ink });
    b += lab(R + 604, y, meta, { anchor: 'end', size: 12, fill: hot ? P.accText : P.sub });
  });
  b += hints(860, [['space', 'next scramble'], ['r', 'retry scramble'], ['f', 'drill this'], ['x', 'scout'], ['esc', 'settings']]);
  return page(W, H, b);
}

// ======================================================================
// T-03 PLL drill (in a round) — Orbit
// ======================================================================
function answerRow(x, y, names, o = {}) {
  const cw = o.cw || 84, gap = o.gap || 10, h = o.h || 46;
  let s = '';
  names.forEach((n, i) => {
    const cx = x + i * (cw + gap);
    const hl = o.hl === n;
    s += rect(cx, y, cw, h, hl ? P.accSoft : P.surface, ORBIT ? h / 2 : 6);
    s += wd(cx + 16, y + h / 2 + 6, n, { size: 18, weight: 700, fill: hl ? P.accText : P.ink });
    s += keycap(cx + cw - 34, y + h / 2 + 4, String(i + 1)).s;
  });
  return s;
}
const PLL_CFG = [[['learn', 0], ['mix', 1], ['transfer', 0]], [['all 21', 0], ['g perms + aa', 1]], [['20 cases', 1], ['60 s', 0], ['open', 0]], [['glance off', 0]]];
function pllDrill() {
  let b = topbar({ active: 'drills', back: 'brain · solve 23', device: 'dim' });
  b += configLine(104, PLL_CFG, { title: 'pll recognition' });
  const cx = 520, cy = 492, r = 236;
  b += roundRing(cx, cy, r, ROUND, 12, 20, { frac: 0.55 });
  b += cubeAt(cx, cy - 10, 108, PLL_STATE);
  b += lab(cx, cy - r - 30, 'case 13 of 20', { anchor: 'middle', size: 13, fill: P.accText, weight: 500 });
  // legend
  let lx = cx - 150; const ly = cy + r + 50;
  for (const [c, l] of [[P.acc, 'fast'], [P.slow, 'slower than your avg'], [P.dnf, 'miss']]) { b += rect(lx, ly - 7, 14, 6, c, 3) + lab(lx + 20, ly, l, { size: 11 }); lx += 34 + mw(l, 11) + 10; }
  const X = 900;
  b += lab(X, 268, 'mix · g perms + aa', { size: 13, fill: P.accText, weight: 500 });
  b += wd(X, 306, 'which pll is this?', { size: 26, weight: 700 });
  b += wd(X, 336, 'recognise first, then press its key. accuracy first.', { size: 15, fill: P.sub });
  b += big(X - 6, 500, '0.84', { size: 150 });
  b += wd(X + 316, 500, 's', { size: 26, fill: P.sub });
  b += answerRow(X, 548, ['Ga', 'Gb', 'Gc', 'Gd', 'Aa']);
  [['streak', '6'], ['best', '9'], ['median', '0.71'], ['correct', '11/12']].forEach(([k, v], i) => { const x = X + i * 112; b += lab(x, 666, k) + num(x, 698, v, { size: 26 }); });
  b += check(X + 6, 746, 6, P.acc) + wd(X + 22, 751, 'last: Gb in 0.71 s', { size: 14, fill: P.ink });
  b += lab(X + 172, 751, 'cue: diagonal corners + adjacent edges', { size: 12 });
  b += hints(856, [['1–5', 'answer'], ['s', 'skip'], ['enter', 'next'], ['esc', 'settings'], ['b', 'back to brain']]);
  return page(W, H, b);
}
// Mono version: one column, lane instead of ring
function pllDrillMono() {
  let b = topbar({ active: 'drills', back: 'brain · solve 23', device: 'dim' });
  b += configLine(108, PLL_CFG, { title: 'pll' });
  b += cubeAt(720, 262, 88, PLL_STATE);
  b += lab(720, 408, 'case 13 of 20 · which pll is this?', { anchor: 'middle', size: 13, fill: P.sub });
  b += big(720, 530, '0.84', { size: 120, anchor: 'middle' });
  b += answerRow(720 - (5 * 84 + 4 * 10) / 2, 572, ['Ga', 'Gb', 'Gc', 'Gd', 'Aa']);
  b += roundLane(X0, 680, X1 - X0, ROUND, 12, 20, { frac: 0.55 });
  b += lab(X0, 710, 'round', { size: 11 }) + lab(X1, 710, '12 answered · 1 miss · 2 slow', { size: 11, anchor: 'end' });
  const stats = [['streak', '6'], ['best', '9'], ['median', '0.71'], ['correct', '11/12']];
  let s = '', parts = stats.map(([k, v]) => `${k} ${v}`), tot = parts.join('     ').length * 13 * 0.6, x = 720 - tot / 2;
  for (const [k, v] of stats) { s += lab(x, 760, k, { size: 13 }); x += mw(k + ' ', 13); s += lab(x, 760, v, { size: 13, fill: P.ink }); x += mw(v + '     ', 13); }
  b += s;
  b += hints(846, [['1–5', 'answer'], ['s', 'skip'], ['enter', 'next'], ['tab', 'settings'], ['b', 'back to brain']]);
  return page(W, H, b);
}

// ======================================================================
// T-04 PLL drill results
// ======================================================================
function pllResults() {
  let b = topbar({ active: 'drills', back: 'brain · solve 23', device: 'dim' });
  const X = 64;
  b += lab(X, 140, 'median recognition', { size: 14 });
  b += big(X - 6, 244, '0.78', { size: 120, fill: P.acc });
  b += wd(X + 252, 244, 's', { size: 28, fill: P.sub });
  [['correct', '18/20'], ['round', '1:42'], ['best streak', '11'], ['vs before', '−0.41']].forEach(([k, v], i) => { const x = X + i * 110; b += lab(x, 302, k, { size: 13 }) + num(x, 336, v, { fill: k === 'vs before' ? P.acc : P.ink }); });
  b += lab(X, 376, 'mix · g perms + aa · 20 cases · glance off · from brain', { size: 12.5 });
  // per case
  const MX = 540;
  b += lab(MX, 140, 'per case', { size: 14 });
  b += vline(MX + 330, 128, 142, P.ink, 1.5) + lab(MX + 342, 140, 'before this round');
  const bx = MX + 60, bw = 300, maxv = 1.5;
  PLL_ROWS.forEach(([n, med, before, acc], i) => {
    const y = 190 + i * 40;
    b += wd(MX, y + 6, n, { size: 18, weight: 700 });
    b += rect(bx, y - 3, bw, 6, P.track, 3) + rect(bx, y - 3, (med / maxv) * bw, 6, med <= before ? P.acc : P.slow, 3);
    b += vline(bx + (before / maxv) * bw, y - 9, y + 9, P.ink, 1.5);
    b += lab(bx + bw + 18, y + 5, med.toFixed(2), { size: 14, fill: P.ink, weight: 500 });
    const d = med - before;
    b += lab(bx + bw + 118, y + 5, `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`, { size: 12, fill: d <= 0 ? P.accText : P.warnText, anchor: 'end' });
    b += lab(bx + bw + 134, y + 5, acc, { size: 12, fill: acc === '4/4' ? P.sub : P.warnText });
  });
  // donut of the round
  const dcx = 1236, dcy = 262;
  b += roundRing(dcx, dcy, 96, ROUND_DONE, -1, 20, { w: 14, gap: 3 });
  b += num(dcx, dcy + 2, '18/20', { size: 28, anchor: 'middle' }) + lab(dcx, dcy + 26, 'correct', { anchor: 'middle' });
  let lx = dcx - 120;
  for (const [c, l] of [[P.acc, 'fast'], [P.slow, 'slow'], [P.dnf, 'miss']]) { b += rect(lx, dcy + 144, 14, 6, c, 3) + lab(lx + 20, dcy + 151, l, { size: 11 }); lx += 84; }
  b += hline(64, 1376, 432);
  // confusions + review + trend
  b += lab(X, 476, 'confusions', { size: 14 });
  b += wd(X, 510, 'Gc read as Ga, twice', { size: 17, weight: 600 });
  b += wd(X, 536, 'Gc: find the bar pattern first. Ga: find the anchor.', { size: 14, fill: P.sub });
  b += lab(X, 584, 'spaced review', { size: 14 });
  b += wd(X, 614, 'Gc comes back in 10 min · Ga, Gb tomorrow · Gd, Aa in 3 days', { size: 14 });
  b += lab(X, 664, 'g-perm median · last 5 rounds', { size: 14 });
  const tv = [1.42, 1.2, 1.05, 0.93, 0.78];
  b += hline(X, X + 560, 780, P.line);
  b += trendLine(X, 690, 560, 80, tv, P.acc, { w: 2 });
  tv.forEach((v, i) => b += lab(X + (i / 4) * 560, 800, v.toFixed(2), { size: 11, anchor: i === 0 ? 'start' : i === 4 ? 'end' : 'middle', fill: i === 4 ? P.accText : P.sub }));
  // back to brain
  const R = 760;
  b += lab(R, 476, 'back in brain', { size: 14 });
  b += wd(R, 510, 'Your pause before G perms in brain was 1.9 s (last 23 solves).', { size: 15 });
  b += wd(R, 536, 'Brain watches your next G perms and reports the change here', { size: 15, fill: P.sub });
  b += wd(R, 558, 'and on progress.', { size: 15, fill: P.sub });
  b += pill(R, 600, 300, 56, 'back to brain', { key: 'b' });
  b += wd(R + 330, 634, 'solve 24 is scrambled and ready', { size: 14, fill: P.sub });
  b += lab(R, 712, 'or', { size: 13 });
  b += keycap(R + 30, 713, 'space').s + wd(R + 94, 713, 'one more round', { size: 15, weight: 600 });
  b += keycap(R + 260, 713, 'r').s + wd(R + 292, 713, 'retry the 2 misses', { size: 15, weight: 600 });
  b += hints(860, [['b', 'back to brain'], ['space', 'one more round'], ['r', 'retry misses'], ['p', 'progress'], ['esc', 'settings']]);
  return page(W, H, b);
}

// ======================================================================
// T-05 unified progress
// ======================================================================
function progressPage() {
  let b = topbar({ active: 'progress' });
  b += configLine(104, [[['all', 1], ['brain', 0], ['corners', 0], ['pll', 0], ['f2l', 0], ['scout', 0]], [['7 d', 0], ['30 d', 1], ['all time', 0]]]);
  const X = 64;
  // brain trend
  b += lab(X, 156, 'brain · ao12, 30 days', { size: 14 });
  b += num(X, 198, '15.03', { size: 34 }) + lab(X + 108, 198, '−0.84 in 30 d', { size: 13, fill: P.accText });
  b += lab(X + 250, 198, 'pb 12.41 · 412 solves', { size: 13 });
  const ao = [15.9, 15.8, 15.85, 15.7, 15.62, 15.66, 15.5, 15.44, 15.48, 15.35, 15.3, 15.34, 15.2, 15.12, 15.18, 15.03];
  b += hline(X, X + 620, 380, P.line);
  b += hline(X, X + 620, 300, P.line, 0.6, 'stroke-dasharray="3 5"');
  b += trendLine(X, 230, 620, 140, ao, P.acc, { w: 2.2 });
  b += lab(X, 400, '31 aug', { size: 11 }) + lab(X + 620, 400, 'today', { size: 11, anchor: 'end' });
  // where your time goes → drill map
  const R = 780;
  b += lab(R, 156, 'where your time goes', { size: 14 });
  b += lab(X1, 156, 'step → drill', { size: 12, anchor: 'end' });
  const steps = [['cross', 2.41, 'cross scout', 'x'], ['f2l', 7.79, 'f2l deduction', 'f'], ['oll', 2.53, 'oll recognition · later', ''], ['pll', 3.11, 'pll recognition', 'p']];
  const tot = steps.reduce((a, s) => a + s[1], 0);
  steps.forEach(([n, v, drill, k], i) => {
    const y = 200 + i * 48;
    b += lab(R, y + 5, n, { size: 13, fill: P.ink });
    b += rect(R + 60, y - 3, 250, 6, P.track, 3) + rect(R + 60, y - 3, (v / 8) * 250, 6, n === 'pll' ? P.warn : P.slow, 3);
    b += lab(R + 326, y + 5, `${v.toFixed(2)}`, { size: 13, fill: P.ink }) + lab(R + 372, y + 5, `${Math.round((v / tot) * 100)}%`, { size: 12 });
    if (k) { b += lab(X1 - 30, y + 5, drill, { size: 13, fill: n === 'pll' ? P.accText : P.sub, anchor: 'end', weight: n === 'pll' ? 500 : 400 }); b += keycap(X1 - 22, y + 5, k).s; }
    else b += lab(X1, y + 5, drill, { size: 13, fill: P.faint, anchor: 'end' });
  });
  b += wd(R, 396, 'pll pause is 1.9 s on G perms: the biggest gap to your average.', { size: 13, fill: P.warnText });
  b += hline(64, 1376, 432);
  // drills table
  b += lab(X, 476, 'drills', { size: 14 });
  const cols = [X, X + 210, X + 330, X + 480, X + 600];
  ['', 'rounds', 'median · trend', 'accuracy', 'due'].forEach((h, i) => { if (h) b += lab(cols[i], 476, h, { size: 12 }); });
  const rows = [
    ['corner recognition', '14', '0.71 s', [0.98, 0.9, 0.86, 0.8, 0.78, 0.71], '94%', '14'],
    ['pll recognition', '9', '0.92 s', [1.4, 1.3, 1.2, 1.1, 1.0, 0.92], '88%', '5'],
    ['f2l timed scan', '6', '11 pairs', [-7, -8, -9, -10, -10, -11], '—', '3'],
    ['cross scout', '4', '4 of 6', null, '67%', '—'],
  ];
  rows.forEach(([n, r, m, tr, a, d], i) => {
    const y = 516 + i * 40;
    b += wd(X, y, n, { size: 15, weight: 600 });
    b += lab(cols[1], y, r, { size: 13, fill: P.ink });
    b += lab(cols[2], y, m, { size: 13, fill: P.ink });
    if (tr) b += trendLine(cols[2] + 72, y - 14, 56, 16, tr, P.sub, { dotR: 2.5 });
    b += lab(cols[3], y, a, { size: 13, fill: P.ink });
    b += lab(cols[4], y, d, { size: 13, fill: d !== '—' ? P.warnText : P.sub, weight: 500 });
  });
  b += lab(X, 700, 'due for review', { size: 14 });
  b += num(X, 742, '22', { size: 34 }) + wd(X + 56, 742, 'items across corners, pll and f2l. one round clears about 10.', { size: 14, fill: P.sub });
  b += pill(X, 766, 260, 44, 'review now', { key: 'enter', size: 15 });
  // activity heatmap
  const HX = 900;
  b += lab(HX, 476, 'activity · solves + drill cases per day', { size: 14 });
  const weeks = 13, cell = 16, g = 5;
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const v = rnd(), last = w === weeks - 1 && d > 3;
    const op = last ? 0 : v < 0.25 ? 0 : v < 0.5 ? 0.3 : v < 0.75 ? 0.6 : 1;
    b += rect(HX + w * (cell + g), 500 + d * (cell + g), cell, cell, op ? P.acc : P.track, 3, op ? `opacity="${op}"` : '');
  }
  b += lab(HX, 665, 'jul', { size: 11 }) + lab(HX + 12 * (cell + g) + cell, 665, 'sep', { size: 11, anchor: 'end' });
  b += lab(HX, 712, 'data', { size: 14 });
  b += wd(HX, 742, 'everything stays on this device.', { size: 14, fill: P.sub });
  b += keycap(HX, 786, 'e').s + lab(HX + 30, 786, 'export', { size: 13, fill: P.ink }) + keycap(HX + 110, 786, 'i').s + lab(HX + 140, 786, 'import', { size: 13, fill: P.ink });
  b += hints(860, [['b', 'brain'], ['d', 'drills'], ['enter', 'review now'], ['e', 'export'], ['esc', 'settings']]);
  return page(W, H, b);
}

// ======================================================================
// T-06 the top bar across the site
// ======================================================================
function navSheet() {
  const HH = 1140;
  let b = wd(64, 58, 'one shell, one top bar', { size: 28, weight: 700 });
  b += wd(64, 88, 'brand · brain · drills · progress on the left; context on the right. the cube chip only appears when the page can use a cube.', { size: 15, fill: P.sub });
  const rows = [
    ['a', 'brain · idle', 'the cube is connected: full chip with battery', { active: 'brain' }],
    ['b', 'brain · solving', 'nav fades to 35 %; the chip stays readable (it is the live input)', { active: 'brain', dimNav: true }],
    ['c', 'drills hub · desktop', 'chip shown because cross scout can follow the cube', { active: 'drills' }],
    ['d', 'drill opened from brain results', 'back pill + b key; the chip dims because this drill does not use the cube', { active: 'drills', back: 'brain · solve 23', device: 'dim' }],
    ['e', 'drill opened directly, no cube', 'no chip at all, no connect prompt', { active: 'drills', device: 'none' }],
    ['f', 'cube-optional drill, not connected', 'a quiet offer, never a modal', { active: 'drills', device: 'optional-off' }],
    ['g', 'progress', 'same bar; chip as on the hub', { active: 'progress' }],
  ];
  const y0 = 130, rh = 104;
  rows.forEach(([k, title, note, o], i) => {
    const y = y0 + i * rh;
    b += lab(64, y + 22, k, { size: 12, fill: P.accText, weight: 500 }) + wd(84, y + 22, title, { size: 14, weight: 600 }) + lab(84 + ww(title, 14, 600) + 16, y + 22, note, { size: 12 });
    b += rect(0, y + 36, W, 60, P.dark ? P.canvas : P.surface);
    b += `<g transform="translate(0,${y + 22})">${topbar(o)}</g>`;
  });
  // developer area
  const dy = y0 + rows.length * rh;
  b += lab(64, dy + 22, 'h', { size: 12, fill: P.accText, weight: 500 }) + wd(84, dy + 22, 'developer area', { size: 14, weight: 600 }) + lab(84 + ww('developer area', 14, 600) + 16, dy + 22, 'reached only from settings → diagnostics, or #/dev; never in the main nav', { size: 12 });
  b += rect(0, dy + 36, W, 60, P.dark ? P.canvas : P.surface);
  let d = t(48, dy + 66, 'cubesight', { size: 18, fill: P.ink, family: WORD, weight: ORBIT ? 800 : 500 });
  d += rect(150, dy + 50, 44, 22, P.warnSoft, 11) + lab(172, dy + 65, 'dev', { size: 11, fill: P.warnText, weight: 500, anchor: 'middle' });
  let x = 222;
  for (const [n, on] of [['studio', 1], ['recordings', 0], ['device log', 0]]) { d += wd(x, dy + 66, n, { size: 14, weight: on ? 700 : 500, fill: on ? P.ink : P.sub }); x += ww(n, 14, on ? 700 : 500) + 28; }
  d += lab(x + 12, dy + 66, '← back to the app', { size: 12, fill: P.accText });
  d += circle(W - 196, dy + 61.5, 3.5, P.acc) + lab(W - 186, dy + 66, 'GAN 356 i3', {}) + battery(W - 98, dy + 56, 84, P.sub) + lab(W - 48, dy + 66, '84%', { anchor: 'end' });
  b += d;
  // phone bars
  const py = dy + 140;
  b += lab(64, py, 'i', { size: 12, fill: P.accText, weight: 500 }) + wd(84, py, 'phone', { size: 14, weight: 600 }) + lab(84 + ww('phone', 14, 600) + 16, py, 'no top nav: bottom tabs on home screens, a single close + round status inside a round', { size: 12 });
  const crop = (x, inner, cap) => {
    let s = rect(x, py + 18, 390, 64, P.bg, 16, `stroke="${P.line}"`);
    s += `<g transform="translate(${x},${py + 18})">${inner}</g>`;
    return s + lab(x + 195, py + 104, cap, { size: 11, anchor: 'middle' });
  };
  const home = wd(24, 38, 'cubesight', { size: 16, weight: ORBIT ? 800 : 500 }) + lab(366, 38, 'streak 4 d', { anchor: 'end', size: 12, fill: P.accText });
  const inRound = cross(30, 33, 7, P.sub, 2) + lab(195, 38, 'corners · 2 min', { anchor: 'middle', size: 13, fill: P.ink }) + lab(366, 38, '1:12', { anchor: 'end', size: 14, fill: P.accText, weight: 500 });
  const brainPh = wd(24, 38, 'cubesight', { size: 16, weight: ORBIT ? 800 : 500 }) + circle(262, 33.5, 3.5, P.acc) + lab(272, 38, 'i3', {}) + battery(296, 28, 84, P.sub) + lab(366, 38, '84%', { anchor: 'end', size: 11 });
  b += crop(64, home, 'home · drills tab, no cube');
  b += crop(525, inRound, 'inside a round');
  b += crop(986, brainPh, 'brain tab · cube connected');
  return page(W, HH, b);
}

// ======================================================================
// T-07 phone: quick drills home · 2-minute corner round · round results
// ======================================================================
function phoneHome() {
  let s = wd(24, 88, 'cubesight', { size: 16, weight: ORBIT ? 800 : 500 }) + lab(366, 88, 'streak 4 d', { anchor: 'end', size: 12, fill: P.accText });
  s += lab(24, 142, 'continue', { size: 12, fill: P.accText, weight: 500 });
  s += wd(24, 174, 'corner recognition', { size: 24, weight: 700 });
  s += wd(24, 198, 'three corners · glance 300 ms · last 38/40', { size: 13, fill: P.sub });
  s += pill(24, 220, 342, 60, 'play 2 min', { size: 18 });
  s += lab(24, 330, 'quick drills', { size: 12 });
  const rows = [
    ['corner recognition', '2 min · 0.71 s median', 'none', '14 due'],
    ['pll recognition', '20 cases · 0.92 s', 'none', '5 due'],
    ['f2l timed scan', '30 s · best 11 pairs', 'none', ''],
    ['cross scout', 'explore a scramble', 'optional', ''],
  ];
  rows.forEach(([n, m, dev, due], i) => {
    const y = 370 + i * 66;
    s += wd(24, y, n, { size: 17, weight: 600 });
    s += wd(24, y + 22, m, { size: 13, fill: P.sub });
    if (due) s += lab(334, y, due, { anchor: 'end', size: 12, fill: P.warnText, weight: 500 });
    if (dev === 'optional') s += devGlyph(328, y - 4, 'optional', 4);
    s += `<path d="M352,${y + 1} l6,6 l-6,6" fill="none" stroke="${P.sub}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,-10)"/>`;
    if (i < rows.length - 1) s += hline(24, 366, y + 40, P.line, 1, 'opacity="0.6"');
  });
  s += rect(16, 648, 358, 62, P.accSoft, ORBIT ? 20 : 8, 'opacity="0.7"');
  s += lab(32, 672, 'from your last brain session', { size: 11, fill: P.accText });
  s += wd(32, 696, 'G perms were slow · drill 20 cases', { size: 14, weight: 600, fill: P.ink });
  s += `<path d="M348,677 l6,6 l-6,6" fill="none" stroke="${P.accText}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += lab(195, 746, 'desk + smart cube? open the brain tab', { anchor: 'middle', size: 11, fill: P.faint });
  s += tabBar('drills');
  return s;
}
function phoneCornerRound() {
  let s = cross(30, 84, 7, P.sub, 2) + lab(195, 89, 'corners · 2 min', { anchor: 'middle', size: 13, fill: P.ink }) + lab(366, 89, '1:12', { anchor: 'end', size: 15, fill: P.accText, weight: 500 });
  const cx = 195, cy = 270;
  if (ORBIT) s += timerRing(cx, cy, 132, 72 / 120);
  s += cubeAt(cx, cy - 8, 74, CORNER_STATE) + cornerMark(cx, cy - 8, 74);
  if (!ORBIT) { s += rect(24, 440, 342, 6, P.track, 1) + rect(24, 440, 342 * 0.6, 6, P.acc, 1) + rect(24 + 342 * 0.6 - 1.5, 432, 3, 22, P.acc, 1); }
  s += wd(24, 488, 'combo ×7', { size: 28, weight: 700, fill: P.accText });
  s += lab(366, 480, 'score 23', { anchor: 'end', size: 13, fill: P.ink });
  const last = ['f', 'f', 'm', 'f', 'f', 'f', 'f', 'f', 'f', 'f'];
  last.forEach((r, i) => { const x = 366 - (9 - i) * 12; s += r === 'm' ? cross(x - 3, 496, 3.2, P.dnf, 1.6) : circle(x - 3, 496, 3.2, P.acc); });
  s += wd(24, 540, 'which colour is hidden?', { size: 17, weight: 600 });
  const cols = [['white', '#f4f4f0'], ['yellow', '#ffd43b'], ['green', '#16a34a'], ['blue', '#2563eb'], ['red', '#e5302b'], ['orange', '#ff7a1a']];
  cols.forEach(([n, hex], i) => {
    const bx = 24 + (i % 3) * 116, by = 562 + Math.floor(i / 3) * 96;
    s += rect(bx, by, 110, 88, P.surface, ORBIT ? 22 : 8);
    s += circle(bx + 55, by + 34, 15, ORBIT ? hex : MONO_PAL[n[0]], P.dark ? '' : `stroke="${P.faint}" stroke-width="1"`);
    s += wd(bx + 55, by + 72, n, { size: 13, fill: P.sub, anchor: 'middle' });
  });
  s += check(30, 784, 5, P.acc) + wd(44, 789, 'white-green-red · 0.58 s', { size: 13, fill: P.sub });
  s += lab(366, 789, 'or w y g b r o', { anchor: 'end', size: 11, fill: P.faint });
  return s;
}
function phoneRoundResults() {
  let s = cross(30, 84, 7, P.sub, 2) + lab(195, 89, 'corners · round done', { anchor: 'middle', size: 13, fill: P.ink });
  s += rect(16, 118, 358, 424, P.surface, ORBIT ? 28 : 10);
  s += lab(40, 158, 'correct', { size: 12 });
  s += big(34, 238, '38', { size: 84, fill: P.acc });
  s += num(146, 238, '/ 40', { size: 26, fill: P.sub });
  s += lab(350, 158, 'new best combo', { anchor: 'end', size: 12, fill: P.accText });
  s += spark(338, 196, 8, P.acc) + num(326, 236, '17', { size: 34, anchor: 'end' });
  [['median', '0.71 s'], ['vs last week', '−0.08'], ['accuracy', '95%']].forEach(([k, v], i) => { const x = 40 + i * 110; s += lab(x, 284, k, { size: 11 }) + num(x, 310, v, { size: 19, fill: k === 'vs last week' ? P.acc : P.ink }); });
  // answer strip: 40 bars, height = time
  const times = [0.9, 0.8, 0.85, 0.7, 0.75, 1.1, 0.6, 0.65, 0.7, 0.55, 0.62, 0.9, 0.7, 0.58, 0.66, 0.72, 0.5, 0.6, 0.64, 0.7, 0.8, 0.55, 0.62, 0.66, 0.5, 0.58, 0.61, 0.7, 1.12, 0.6, 0.55, 0.57, 0.62, 0.5, 0.54, 0.6, 0.58, 0.52, 0.56, 0.5];
  const miss = new Set([5, 28]);
  s += lab(40, 350, 'every answer, in order', { size: 11 });
  times.forEach((v, i) => { const h = v * 60, x = 40 + i * 7.8; s += rect(x, 430 - h, 5, h, miss.has(i) ? P.dnf : P.acc, 1.5, miss.has(i) ? '' : 'opacity="0.85"'); });
  s += hline(40, 350, 431, P.line);
  s += lab(40, 470, 'slowest', { size: 11 });
  s += wd(40, 494, 'yellow–red–green · 1.12 s', { size: 14 });
  s += wd(40, 516, 'it comes back in the next round', { size: 12, fill: P.sub });
  s += lab(195, 580, '12 more due in 3 h · 4-day streak kept', { anchor: 'middle', size: 12, fill: P.sub });
  s += pill(24, 612, 342, 60, 'one more round', { size: 18 });
  s += wd(110, 722, 'change drill', { size: 15, weight: 600, fill: P.ink, anchor: 'middle' });
  s += wd(280, 722, 'done', { size: 15, weight: 600, fill: P.sub, anchor: 'middle' });
  s += lab(195, 790, 'the next open resumes this drill and setting', { anchor: 'middle', size: 11, fill: P.faint });
  return s;
}
function mobileQuick() {
  const WW = 1440, HH = 980;
  let b = lab(64, 48, `${ORBIT ? 'orbit' : 'mono'} · phone · no cube · spare two minutes`, { size: 14 });
  b += phone(84, 80, phoneHome(), 'home = drills when no cube · one tap to play');
  b += phone(525, 80, phoneCornerRound(), ORBIT ? '2-minute round · ring is the clock · combo' : '2-minute round · lane is the clock · combo');
  b += phone(966, 80, phoneRoundResults(), 'results card · one more round');
  return page(WW, HH, b, P.canvas);
}

// ======================================================================
// T-08 phone: PLL drill · PLL results · progress
// ======================================================================
const ALL_PLL = ['Aa', 'Ab', 'E', 'F', 'Ga', 'Gb', 'Gc', 'Gd', 'H', 'Ja', 'Jb', 'Na', 'Nb', 'Ra', 'Rb', 'T', 'Ua', 'Ub', 'V', 'Y', 'Z'];
function phonePll() {
  let s = cross(30, 84, 7, P.sub, 2) + lab(195, 89, 'pll · mix · all 21', { anchor: 'middle', size: 13, fill: P.ink }) + lab(366, 89, '13/20', { anchor: 'end', size: 14, fill: P.accText, weight: 500 });
  const cx = 195, cy = 250;
  s += roundRing(cx, cy, 118, ROUND, 12, 20, { frac: 0.55, w: 5, gap: 4 });
  s += cubeAt(cx, cy - 6, 64, PLL_STATE);
  s += big(24, 468, '0.84', { size: 76 }) + wd(190, 468, 's', { size: 18, fill: P.sub });
  s += lab(366, 446, 'streak 6', { anchor: 'end', size: 13, fill: P.accText, weight: 500 });
  s += lab(366, 468, 'median 0.71', { anchor: 'end', size: 12 });
  const cw = 44, gap = 5.3;
  ALL_PLL.forEach((n, i) => {
    const x = 24 + (i % 7) * (cw + gap), y = 500 + Math.floor(i / 7) * 58;
    s += rect(x, y, cw, 50, P.surface, ORBIT ? 14 : 6);
    s += wd(x + cw / 2, y + 31, n, { size: 15, weight: 700, anchor: 'middle' });
  });
  s += wd(24, 700, 'which pll? tap it, or type its key.', { size: 13, fill: P.sub });
  s += wd(366, 700, 'skip', { size: 14, weight: 600, fill: P.ink, anchor: 'end' });
  s += check(30, 746, 5, P.acc) + wd(44, 751, 'last: Gb in 0.71 s', { size: 13, fill: P.sub });
  return s;
}
function phonePllResults() {
  let s = cross(30, 84, 7, P.sub, 2) + lab(195, 89, 'pll · round done', { anchor: 'middle', size: 13, fill: P.ink });
  s += lab(24, 138, 'median recognition', { size: 12 });
  s += big(18, 218, '0.78', { size: 84, fill: P.acc }) + wd(196, 218, 's', { size: 20, fill: P.sub });
  [['correct', '18/20'], ['round', '1:42'], ['streak', '11']].forEach(([k, v], i) => { const x = 24 + i * 116; s += lab(x, 258, k, { size: 11 }) + num(x, 284, v, { size: 20 }); });
  s += lab(24, 330, 'slowest cases', { size: 12 });
  [['Gc', 1.21, '2/4'], ['Gd', 0.81, '4/4'], ['Ga', 0.74, '4/4']].forEach(([n, v, a], i) => {
    const y = 364 + i * 34;
    s += wd(24, y + 6, n, { size: 16, weight: 700 });
    s += rect(72, y - 3, 190, 6, P.track, 3) + rect(72, y - 3, (v / 1.5) * 190, 6, n === 'Gc' ? P.slow : P.acc, 3);
    s += lab(290, y + 5, v.toFixed(2), { size: 13, fill: P.ink }) + lab(366, y + 5, a, { size: 12, anchor: 'end', fill: a === '4/4' ? P.sub : P.warnText });
  });
  s += hline(24, 366, 484, P.line);
  s += wd(24, 514, 'Gc read as Ga, twice.', { size: 15, weight: 600 });
  s += wd(24, 536, 'Find the bar pattern first.', { size: 13, fill: P.sub });
  s += wd(24, 572, 'Gc comes back in 10 min.', { size: 13, fill: P.sub });
  s += pill(24, 612, 342, 60, 'one more round', { size: 18 });
  s += wd(110, 722, 'retry misses', { size: 15, weight: 600, anchor: 'middle' });
  s += wd(280, 722, 'done', { size: 15, weight: 600, fill: P.sub, anchor: 'middle' });
  return s;
}
function phoneProgress() {
  let s = wd(24, 88, 'progress', { size: 22, weight: 700 }) + lab(366, 88, '30 d', { anchor: 'end', size: 12, fill: P.accText });
  s += lab(24, 136, 'brain · ao12', { size: 12 });
  s += num(24, 170, '15.03', { size: 28 }) + lab(124, 170, '−0.84', { size: 13, fill: P.accText });
  s += trendLine(24, 188, 342, 60, [15.9, 15.8, 15.85, 15.7, 15.62, 15.66, 15.5, 15.44, 15.48, 15.35, 15.3, 15.2, 15.12, 15.03], P.acc, { w: 2 });
  s += lab(24, 290, 'where your time goes', { size: 12 });
  [['cross', 2.41, 'scout'], ['f2l', 7.79, 'f2l'], ['oll', 2.53, ''], ['pll', 3.11, 'pll']].forEach(([n, v, d], i) => {
    const y = 322 + i * 32;
    s += lab(24, y + 5, n, { size: 12, fill: P.ink });
    s += rect(70, y - 3, 170, 6, P.track, 3) + rect(70, y - 3, (v / 8) * 170, 6, n === 'pll' ? P.warn : P.slow, 3);
    s += lab(252, y + 5, v.toFixed(2), { size: 12, fill: P.ink });
    if (d) s += lab(366, y + 5, `→ ${d}`, { size: 12, anchor: 'end', fill: n === 'pll' ? P.accText : P.sub });
  });
  s += hline(24, 366, 460, P.line);
  s += lab(24, 492, 'drills', { size: 12 });
  [['corners', '0.71 s', '94%', '14 due'], ['pll', '0.92 s', '88%', '5 due'], ['f2l scan', '11 pairs', '—', '3 due']].forEach(([n, m, a, d], i) => {
    const y = 528 + i * 40;
    s += wd(24, y, n, { size: 15, weight: 600 }) + lab(150, y, m, { size: 12, fill: P.ink }) + lab(240, y, a, { size: 12 }) + lab(366, y, d, { size: 12, anchor: 'end', fill: P.warnText, weight: 500 });
  });
  s += pill(24, 668, 342, 52, 'review 22 due items', { size: 16 });
  s += tabBar('progress');
  return s;
}
function mobilePll() {
  const WW = 1440, HH = 980;
  let b = lab(64, 48, 'orbit · phone · pll drill, its results, and progress', { size: 14 });
  b += phone(84, 80, phonePll(), 'pll drill · all 21 cases fit a 7 × 3 grid');
  b += phone(525, 80, phonePllResults(), 'pll results · slowest cases first');
  b += phone(966, 80, phoneProgress(), 'progress · steps map to drills');
  return page(WW, HH, b, P.canvas);
}

// ======================================================================
const FRAMES = {
  'orbit-dark': { '00-sitemap': sitemap, '01-hub': hub, '02-brain-results-drill': brainResults, '03-pll-drill': pllDrill, '04-pll-results': pllResults, '05-progress': progressPage, '06-nav': navSheet, '07-mobile-quick': mobileQuick, '08-mobile-pll': mobilePll },
  'orbit-light': { '01-hub': hub, '03-pll-drill': pllDrill, '07-mobile-quick': mobileQuick },
  'mono-dark': { '01-hub': hub, '03-pll-drill': pllDrillMono, '07-mobile-quick': mobileQuick },
}[THEME];
for (const [name, fn] of Object.entries(FRAMES)) write(name, fn());
