// Solve-review mockups (Orbit dark primary, Mono dark, mobile). Run from the repo root:
//   node docs/design/brain-v2/review/_src/proto.mjs      (writes golden-mock.json: the real cross/pair data)
//   node docs/design/brain-v2/review/_src/gen.mjs        (writes ../R-*.svg)
//   node docs/design/brain-v2/review/_src/render.mjs     (SVG -> PNG with Playwright)
import fs from 'fs';
import { cube, t, svg, MONO, SANS, CUBE_STD, monoW, esc } from '../../_src/lib.mjs';
import { stateFromScramble } from '../../../../../src/cross-cube.js';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// ---- reuse helpers of the existing Orbit generator without touching it ----
process.env.ORBIT_THEME = 'dark';
{
  const src = fs.readFileSync(HERE + '../../_src/genC.mjs', 'utf8');
  let cut = src.slice(0, src.indexOf('const DARK_SET')).replace("from './lib.mjs'", "from '../../_src/lib.mjs'");
  cut += '\nexport { topbar, tpsChart, splitBars, hints, keyCap, arc, polar, circle, spark, tick, C, W, H, svgT, FONTS, phone, mTop, battery, layout, STEPS, CUBE_O, donut };\n';
  fs.writeFileSync(HERE + '_orbit.gen.mjs', cut);
}
const O = await import('./_orbit.gen.mjs');
fs.unlinkSync(HERE + '_orbit.gen.mjs');
const { arc, polar, circle, spark, layout } = O;

const G = JSON.parse(fs.readFileSync(HERE + 'golden-mock.json', 'utf8'));
const W = 1440, H = 900;
const f1 = n => Number(n).toFixed(1);
const PR = "′";                       // typographic prime used in the UI
const mv = m => m.replace(/'/g, PR);

// ---------------- themes ----------------
const OC = O.C;
const ORBIT = {
  id: 'orbit', bg: OC.bg, canvas: OC.canvas, surf: OC.faint, surf2: OC.keyBg, ink: OC.ink, muted: OC.sub, faint: OC.ghost,
  acc: OC.acc, accSoft: OC.accSoft, onAcc: OC.onAcc, good: OC.acc, warn: OC.amber, sev: OC.red, line: OC.line, band: OC.band,
  words: SANS, cubeBody: OC.cubeBody, glow: OC.glow, shadow: OC.shadow, shadowOp: OC.shadowOp, bezel: OC.bezel,
  pal: CUBE_STD, shadeF: 0.86, shadeR: 0.72, wW: 500, radius: 999,
};
const MONO_PAL = { w: '#e8e6de', y: '#f2c94c', g: '#3fa66a', b: '#3d6fd6', r: '#d9534a', o: '#e98a3c', '.': '#2a2d33' };
const MONOT = {
  id: 'mono', bg: '#16171b', canvas: '#101114', surf: '#1f2126', surf2: '#1f2126', ink: '#d9d6cb', muted: '#8a8e99', faint: '#6b6f7a',
  acc: '#e7b34c', accSoft: '#6b5424', onAcc: '#16171b', good: '#e7b34c', warn: '#e0675e', sev: '#e0675e', line: '#34373f', band: '#1b1c20',
  words: MONO, cubeBody: '#0b0c0e', glow: null, shadow: '#000', shadowOp: 0, bezel: '#2c2f36',
  pal: MONO_PAL, shadeF: 0.84, shadeR: 0.68, wW: 400, radius: 6,
};
const tw = (T, x, y, s, o = {}) => t(x, y, s, { family: T.words, weight: T.wW, ...o });
const tm = (x, y, s, o = {}) => t(x, y, s, { family: MONO, ...o });

function wrap(T, text, maxPx, size) {
  const cw = T.id === 'mono' ? 0.6 * size : 0.545 * size;
  const out = []; let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (next.length * cw > maxPx && line) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

// ---------------- badge system ----------------
const LBL = {
  optimal: { n: 'Optimal', tone: 'good', st: 'solid', g: 'bull' },
  efficient: { n: 'Efficient', tone: 'good', st: 'ring', g: 'check' },
  clean: { n: 'Clean', tone: 'good', st: 'solid', g: 'check' },
  flow: { n: 'Flow', tone: 'good', st: 'ring', g: 'wave' },
  skip: { n: 'Skip', tone: 'good', st: 'solid', g: 'spark' },
  freepair: { n: 'Free pair', tone: 'good', st: 'ring', g: 'pair' },
  xcross: { n: 'X-cross', tone: 'good', st: 'ring', g: 'x' },
  pseudo: { n: 'Pseudo pair', tone: 'good', st: 'solid', g: 'offset' },
  fine: { n: 'Fine', tone: 'neutral', st: 'dot' },
  ok: { n: 'OK', tone: 'neutral', st: 'ring', g: 'none' },
  dfix: { n: 'D fix', tone: 'neutral', st: 'ring', g: 'offset' },
  extra: { n: 'Extra move', tone: 'warn', st: 'ring', g: 'plus1' },
  detour: { n: 'Detour', tone: 'warn', st: 'solid', g: 'uturn' },
  cancel: { n: 'Cancel', tone: 'warn', st: 'ring', g: 'cancel' },
  betterpair: { n: 'Better pair', tone: 'warn', st: 'ring', g: 'compare' },
  bettercross: { n: 'Better cross', tone: 'warn', st: 'ring', g: 'compare' },
  missedx: { n: 'Missed X-cross', tone: 'warn', st: 'ring', g: 'x' },
  pause: { n: 'Pause', tone: 'warn', st: 'solid', g: 'pause' },
  slow: { n: 'Slow recog', tone: 'warn', st: 'ring', g: 'eye' },
  rotation: { n: 'Rotation', tone: 'warn', st: 'ring', g: 'rot' },
  auf: { n: 'Extra AUF', tone: 'warn', st: 'ring', g: 'auf' },
  stray: { n: 'Stray offset', tone: 'warn', st: 'ring', g: 'offset' },
  regrip: { n: 'Regrip (likely)', tone: 'warn', st: 'dash', g: 'cancel' },
  lockup: { n: 'Lockup (likely)', tone: 'warn', st: 'dash', g: 'x' },
};
function glyph(g, gc, k) {
  const a = (w = 1.5) => `fill="none" stroke="${gc}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  const body = {
    bull: `<circle r="4.3" ${a()}/><circle r="1.6" fill="${gc}"/>`,
    check: `<path d="M-3.6 .4L-1.2 3L3.8 -2.8" ${a()}/>`,
    wave: `<path d="M-4.6 1.4Q-2.3 -3 0 .2T4.6 -1.4" ${a()}/>`,
    spark: `<path d="M0 -5.6Q0 0 5.6 0Q0 0 0 5.6Q0 0 -5.6 0Q0 0 0 -5.6Z" fill="${gc}"/>`,
    pair: `<circle cx="-2.4" r="3" ${a()}/><circle cx="2.4" r="3" ${a()}/>`,
    x: `<path d="M-3.2 -3.2L3.2 3.2M3.2 -3.2L-3.2 3.2" ${a()}/>`,
    offset: `<path d="M-4.6 -1.8H2.4M-2.4 2H4.6" ${a(1.8)}/>`,
    plus1: `<text y="3.2" font-family="${MONO}" font-size="8.6" font-weight="600" text-anchor="middle" fill="${gc}">+1</text>`,
    uturn: `<path d="M-2.8 3.8V-.4A2.8 2.8 0 0 1 2.8 -.4V3.6M.9 1.8L2.8 4L4.7 1.8" ${a()}/>`,
    cancel: `<path d="M-4.4 -1.8H3.6M1.6 -3.6L3.6 -1.8L1.6 0M4.4 1.8H-3.6M-1.6 0L-3.6 1.8L-1.6 3.6" ${a(1.3)}/>`,
    pause: `<path d="M-2 -3.6V3.6M2 -3.6V3.6" ${a(2)}/>`,
    eye: `<path d="M-5 0Q0 -5 5 0Q0 5 -5 0Z" ${a()}/><circle r="1.5" fill="${gc}"/>`,
    rot: `<path d="M3.7 -1.4A3.8 3.8 0 1 0 3.3 2.4" ${a()}/><path d="M1.4 -3.6L3.9 -1.3L1.2 .2" ${a()}/>`,
    compare: `<rect x="-4.4" y="-3.8" width="3.4" height="7.6" rx=".8" ${a(1.3)}/><rect x="1" y=".6" width="3.4" height="3.2" rx=".8" fill="${gc}"/>`,
    auf: `<text y="3.4" font-family="${MONO}" font-size="9.4" font-weight="600" text-anchor="middle" fill="${gc}">U</text>`,
    none: '',
  }[g] || '';
  return `<g transform="scale(${k})">${body}</g>`;
}
function badge(T, id, cx, cy, r = 9, o = {}) {
  const L = LBL[id];
  const col = o.costly ? T.sev : L.tone === 'good' ? T.good : L.tone === 'warn' ? T.warn : T.muted;
  if (L.st === 'dot') return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r * 0.3)}" fill="${T.muted}"/>`;
  const k = r / 9, solid = L.st === 'solid' || o.costly;
  let s = `<g transform="translate(${f1(cx)} ${f1(cy)})">`;
  if (solid) s += `<circle r="${r}" fill="${col}"/>`;
  else s += `<circle r="${r - 0.7 * k}" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="${1.4 * k}"${L.st === 'dash' ? ` stroke-dasharray="${2.4 * k} ${2.2 * k}"` : ''}/>`;
  s += glyph(L.g, solid ? T.onAcc : col, k) + '</g>';
  return s;
}
const toneOf = (T, id, costly) => costly ? T.sev : LBL[id].tone === 'good' ? T.good : LBL[id].tone === 'warn' ? T.warn : T.muted;

// ---------------- real cube states ----------------
function x2(st) {   // view the cube from below: swap U/D and F/B (keeps R on the right)
  const sw = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'R', L: 'L' };
  return { cubies: st.cubies.map(c => ({ id: c.id, position: [c.position[0], -c.position[1] || 0, -c.position[2] || 0], stickers: Object.fromEntries(Object.entries(c.stickers).map(([f, col]) => [sw[f], col])) })) };
}
function facelets(st) {
  const m = new Map(); const L = { white: 'w', yellow: 'y', green: 'g', blue: 'b', red: 'r', orange: 'o' };
  for (const c of st.cubies) for (const [f, col] of Object.entries(c.stickers)) m.set(`${c.position.map(v => v || 0).join()}|${f}`, L[col]);
  const at = (x, y, z, f) => m.get(`${x},${y},${z}|${f}`) || '.';
  const U = [], F = [], R = [];
  for (const z of [-1, 0, 1]) for (const x of [-1, 0, 1]) U.push(at(x, 1, z, 'U'));
  for (const y of [1, 0, -1]) for (const x of [-1, 0, 1]) F.push(at(x, y, 1, 'F'));
  for (const y of [1, 0, -1]) for (const z of [1, 0, -1]) R.push(at(1, y, z, 'R'));
  return { U: U.join(''), F: F.join(''), R: R.join('') };
}
const SC = G.scramble;
const stateAt = k => facelets(x2(stateFromScramble(SC + ' ' + G.userCross.slice(0, k).join(' '))));
const CUBE_BEFORE_4 = stateAt(3), CUBE_CROSS_DONE = facelets(x2(stateFromScramble(SC + ' ' + ['F\'', 'D\'', 'F', 'R', 'D\'', 'F'].join(' '))));
const CUBE_START = stateAt(0);
const CUBE_AFTER_R = facelets(x2(stateFromScramble(SC + ' ' + [...G.userCross.slice(0, 3), 'R'].join(' '))));

function cubeC(T, cx, cy, s, faces, extra = '') {
  const glow = T.glow ? `<ellipse cx="${cx}" cy="${cy + s * 1.12}" rx="${s * 1.05}" ry="${s * 0.2}" fill="url(#cubeGlow)"/>` : '';
  const shadow = T.shadowOp ? `<ellipse cx="${cx}" cy="${cy + s * 1.1}" rx="${s * 0.78}" ry="${s * 0.1}" fill="${T.shadow}" opacity="${T.shadowOp}"/>` : '';
  return glow + shadow + cube(cx, cy + s * 0.5, s, faces, { palette: T.pal, body: T.cubeBody, shadeF: T.shadeF, shadeR: T.shadeR, gap: T.id === 'mono' ? 0.1 : 0.09 }) + extra;
}
// curved best-move arrow over the R face (view: cross side up, R on the right)
function arrowR(cx, cy, s, col, cw = true, r = 0.3) {
  const c30 = Math.cos(Math.PI / 6), P = (a, d) => [cx + c30 * s * a, cy - 0.5 * s * a + s * d];
  const pts = []; const a0 = cw ? -60 : 240, a1 = cw ? 200 : -20, n = 28;
  for (let i = 0; i <= n; i++) { const th = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push(P(0.5 + r * Math.cos(th), 0.5 + r * Math.sin(th))); }
  const last = pts[n], prev = pts[n - 2]; const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
  const hl = 11, hw = 7, tip = [last[0] + Math.cos(ang) * 6, last[1] + Math.sin(ang) * 6];
  const b1 = [tip[0] - Math.cos(ang) * hl + Math.sin(ang) * hw, tip[1] - Math.sin(ang) * hl - Math.cos(ang) * hw], b2 = [tip[0] - Math.cos(ang) * hl - Math.sin(ang) * hw, tip[1] - Math.sin(ang) * hl + Math.cos(ang) * hw];
  return `<path d="M${pts.map(p => p.map(f1).join(',')).join(' L')}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" opacity="0.92"/><polygon points="${[tip, b1, b2].map(p => p.map(f1).join(',')).join(' ')}" fill="${col}" opacity="0.92"/>`;
}

// ---------------- the mock solve (cross + pair options are real; the rest is illustrative) ----------------
const T_STAGE = [2.08, 1.71, 1.96, 1.52, 2.31, 0, 1.64, 1.47, 1.38];
const KEYS = ['cross', 'p1', 'p2', 'p3', 'p4', 'eo', 'co', 'cp', 'ep'];
const T_END = [], T_START = []; { let c = 0; T_STAGE.forEach((v, i) => { T_START.push(c); c += v; T_END.push(c); }); }
const TOTAL = 14.07;
// events of the ledger: t (s), LU (negative = loss, positive = bonus), badge, stage, costly?
const EV = [
  { t: 0.70, lu: -2.0, b: 'detour', st: 0 },
  { t: 2.08, lu: -1.0, b: 'betterpair', st: 1 },
  { t: 4.56, lu: -1.6, b: 'pause', st: 2 },
  { t: 5.05, lu: -2.0, b: 'cancel', st: 2 },
  { t: 6.30, lu: -2.0, b: 'rotation', st: 3 },
  { t: 6.95, lu: +3.0, b: 'pseudo', st: 3 },
  { t: 8.17, lu: -2.4, b: 'pause', st: 4 },
  { t: 8.90, lu: -3.0, b: 'extra', st: 4 },
  { t: 9.58, lu: +6.0, b: 'skip', st: 5 },
  { t: 12.50, lu: -1.3, b: 'pause', st: 7 },
  { t: 13.85, lu: -1.0, b: 'auf', st: 8 },
];
const PAUSES = [[3.79, 4.56, '0.8 s pause'], [7.27, 8.17, '0.9 s pause'], [11.95, 12.50, '']];
const LU = { cross: 2.0, f2l: 12.0, ll: 2.3 }, REF = { cross: 6, f2l: 28, ll: 24 };
const acc = (lu, ref) => Math.round(100 * Math.exp(-lu / (1.5 * ref)));
const ACC = { cross: acc(LU.cross, REF.cross), f2l: acc(LU.f2l, REF.f2l), ll: acc(LU.ll, REF.ll), all: acc(LU.cross + LU.f2l + LU.ll, REF.cross + REF.f2l + REF.ll) };
console.log('accuracy', JSON.stringify(ACC));
const STAGE_ACC = [ACC.cross, acc(1, 7), acc(3.6, 7), acc(2, 6), acc(5.4, 8), null, 100, acc(1.3, 9), acc(1, 8)];
const STAGE_TONE = ['warn', 'warn', 'warn', 'good', 'sev', 'good', 'ink', 'warn', 'warn'];   // worst label in the stage

const ROWS = [
  { k: 'cross', label: 'cross', mv: [['F\'', 'optimal'], ['D\'', 'optimal'], ['F', 'optimal'], ['D', 'detour'], ['B', 'optimal'], ['D\'', 'optimal'], ['R', 'optimal'], ['D\'', 'optimal']] },
  { k: 'p1', label: 'pair 1', tag: 'FR', mv: ['R', 'F', 'R', 'U\'', 'F\'', 'U\'', 'R\''].map(m => [m, 'fine']), stage: 'betterpair' },
  { k: 'p2', label: 'pair 2', tag: 'BR', mv: [['U\'', 'pause'], ['L\'', 'fine'], ['U', 'fine'], ['L', 'fine'], ['U\'', 'fine'], ['L\'', 'cancel'], ['L', 'cancel'], ['U', 'fine'], ['L', 'fine']] },
  { k: 'p3', label: 'pair 3', tag: 'pseudo', mv: [['y', 'rotation'], ['D', 'fine'], ['R\'', 'fine'], ['U', 'fine'], ['R', 'fine'], ['U\'', 'fine'], ['D\'', 'dfix']], stage: 'pseudo' },
  { k: 'p4', label: 'pair 4', tag: 'BL', mv: [['U', 'pause'], ['F\'', 'extra'], ['U\'', 'fine'], ['F', 'extra'], ['R', 'fine'], ['U', 'extra'], ['R\'', 'fine'], ['U2', 'fine'], ['R', 'fine'], ['U\'', 'fine']] },
  { k: 'eo', label: 'eo', skip: true, mv: [] },
  { k: 'co', label: 'co', tag: 'Sune', mv: ['R', 'U', 'R\'', 'U', 'R', 'U2', 'R\''].map(m => [m, 'fine']) },
  { k: 'cp', label: 'cp', tag: 'Aa', mv: [['R\'', 'fine'], ['F', 'fine'], ['R\'', 'fine'], ['B2', 'fine'], ['R', 'pause'], ['F\'', 'fine'], ['R\'', 'fine'], ['B2', 'fine'], ['R2', 'fine']] },
  { k: 'ep', label: 'ep', tag: 'Ub', mv: [['R\'', 'fine'], ['U', 'fine'], ['R\'', 'fine'], ['U\'', 'fine'], ['R\'', 'fine'], ['U\'', 'fine'], ['R\'', 'fine'], ['U', 'fine'], ['R', 'fine'], ['U2', 'auf']] },
];
const KEYMOMENTS = [
  { n: 1, t: 0.70, b: 'detour', title: 'Detour', sub: 'move 4 · +2', mv: 4 },
  { n: 2, t: 2.08, b: 'betterpair', title: 'Better pair', sub: 'pair 1 · +1', mv: 9 },
  { n: 3, t: 6.95, b: 'pseudo', title: 'Pseudo pair', sub: 'p3 · saved 3', mv: 31 },
  { n: 4, t: 8.17, b: 'pause', title: 'Pause 0.9 s', sub: 'p4 · +2.4', mv: 33 },
  { n: 5, t: 9.58, b: 'skip', title: 'EO skip', sub: 'saved 6', mv: 41 },
];

// ---------------- UI atoms ----------------
const pillBtn = (T, x, y, w, h, label, o = {}) => {
  const fill = o.primary ? T.acc : 'none', stroke = o.primary ? T.acc : T.line, ink = o.primary ? T.onAcc : (o.ink || T.ink);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(T.radius, h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>` +
    tw(T, x + w / 2, y + h / 2 + 5, label, { size: o.size || 14, fill: ink, weight: 600, anchor: 'middle' });
};
function tri(cx, cy, s, dir, fill) {
  const p = dir > 0 ? [[cx - s * 0.6, cy - s], [cx - s * 0.6, cy + s], [cx + s, cy]] : [[cx + s * 0.6, cy - s], [cx + s * 0.6, cy + s], [cx - s, cy]];
  return `<polygon points="${p.map(q => q.map(f1).join(',')).join(' ')}" fill="${fill}"/>`;
}
function stepControls(T, cx, y) {
  let s = '';
  const btn = (x, r, inner, fill = T.surf) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>` + inner;
  const c = T.ink;
  s += btn(cx - 120, 18, `<rect x="${cx - 129}" y="${y - 7}" width="2.4" height="14" fill="${c}"/>` + tri(cx - 122, y, 6, -1, c));
  s += btn(cx - 60, 18, tri(cx - 60, y, 7, -1, c));
  s += btn(cx, 25, tri(cx + 1, y, 10, 1, T.onAcc), T.acc);
  s += btn(cx + 60, 18, tri(cx + 60, y, 7, 1, c));
  s += btn(cx + 120, 18, tri(cx + 118, y, 6, 1, c) + `<rect x="${cx + 125.6}" y="${y - 7}" width="2.4" height="14" fill="${c}"/>`);
  return s;
}
function keyHints(T, y, items, cx = W / 2) {
  const size = 12, parts = items.map(([k, l]) => { const kw = Math.max(22, monoW(k, 11) + 14); return { k, l, kw, w: kw + 8 + monoW(l, size) }; });
  const total = parts.reduce((a, p) => a + p.w, 0) + 32 * (parts.length - 1);
  let x = cx - total / 2, s = '';
  for (const p of parts) {
    s += `<rect x="${f1(x)}" y="${y - 14}" width="${p.kw}" height="20" rx="${T.id === 'mono' ? 4 : 5}" fill="${T.id === 'mono' ? T.surf : T.surf2}"/>` + tm(f1(x + p.kw / 2), y, p.k, { size: 11, fill: T.ink, anchor: 'middle' });
    s += tm(f1(x + p.kw + 8), y, p.l, { size: 12, fill: T.muted }); x += p.w + 32;
  }
  return s;
}
const avatar = (T, cx, cy, r = 20) => {
  // the coach: a friendly cube face (3x3 stickers, two "eyes", one smile sticker row)
  const s = r * 1.3, x0 = cx - s / 2, y0 = cy - s / 2, g = s / 3;
  let o = `<rect x="${f1(x0 - 3)}" y="${f1(y0 - 3)}" width="${f1(s + 6)}" height="${f1(s + 6)}" rx="${T.id === 'mono' ? 4 : 10}" fill="${T.cubeBody}" stroke="${T.line}"/>`;
  for (let r2 = 0; r2 < 3; r2++) for (let c2 = 0; c2 < 3; c2++) {
    const eye = r2 === 0 && c2 !== 1, smile = r2 === 2 && c2 !== 1;
    const fill = eye ? T.ink : smile ? T.acc : r2 === 1 && c2 === 1 ? T.acc : T.surf2;
    o += `<rect x="${f1(x0 + c2 * g + 1.4)}" y="${f1(y0 + r2 * g + 1.4)}" width="${f1(g - 2.8)}" height="${f1(g - 2.8)}" rx="${T.id === 'mono' ? 1.5 : 3.5}" fill="${fill}"${eye || smile || (r2 === 1 && c2 === 1) ? '' : ' opacity="0.9"'}/>`;
  }
  return o;
};
function coachBubble(T, x, y, w, h, d) {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${T.id === 'mono' ? 8 : 18}" fill="${T.surf}"/>`;
  s += `<path d="M${x},${y + 30} l-9,8 l9,8 Z" fill="${T.surf}"/>`;
  const tx = x + 24;
  s += badge(T, d.badge, tx + 10, y + 30, 10, { costly: d.costly });
  s += tw(T, tx + 30, y + 36, d.title, { size: 17, fill: T.ink, weight: 700 });
  const tl = toneOf(T, d.badge, d.costly);
  const lw = d.label.length * (T.id === 'mono' ? 7.2 : 7) + 22;
  s += `<rect x="${tx + 30 + d.title.length * (T.id === 'mono' ? 10 : 9.2) + 10}" y="${y + 16}" width="${lw}" height="24" rx="${T.id === 'mono' ? 4 : 12}" fill="${tl}" fill-opacity="0.16"/>` + tm(tx + 30 + d.title.length * (T.id === 'mono' ? 10 : 9.2) + 10 + lw / 2, y + 32, d.label, { size: 12, fill: tl, weight: 500, anchor: 'middle' });
  const bs = T.id === 'mono' ? 14 : 15.5;
  const lines = wrap(T, d.body, w - 48 - 10, bs);
  lines.forEach((ln, i) => { let m = esc(ln); for (const L of d.links || []) m = m.replace(L, `<tspan fill="${T.acc}" style="text-decoration:underline dotted;text-underline-offset:4px">${L}</tspan>`); s += tw(T, tx, y + 68 + i * 23, m, { size: bs, fill: T.ink, weight: T.id === 'mono' ? 400 : 500, raw: true }); });
  const by = y + h - 16;
  s += tm(tx, by, d.alg, { size: 15, fill: T.acc, weight: 500 });
  s += tm(tx + monoW(d.alg, 15) + 14, by, d.algNote, { size: 12, fill: T.muted });
  return s;
}

// ---------------- solve graph ----------------
function solveGraph(T, x, y, w, h, o = {}) {
  const yMax = 8, yMin = -16, Y = v => y + (yMax - v) / (yMax - yMin) * h, X = tt => x + tt / TOTAL * w;
  let s = '';
  // stage bands
  KEYS.forEach((k, i) => { if (!T_STAGE[i]) return; if (i % 2 === 0) s += `<rect x="${f1(X(T_START[i]))}" y="${y}" width="${f1(X(T_END[i]) - X(T_START[i]))}" height="${h}" fill="${T.band}"/>`; });
  // grid
  for (const g of [8, 0, -8, -16]) { s += `<line x1="${x}" y1="${f1(Y(g))}" x2="${x + w}" y2="${f1(Y(g))}" stroke="${T.line}" stroke-width="${g === 0 ? 1.2 : 0.6}"${g === 0 ? ' stroke-dasharray="5 5"' : ''}/>` + tm(x - 10, Y(g) + 4, g > 0 ? `+${g}` : `${g}`.replace('-', '−'), { size: 11, fill: T.muted, anchor: 'end' }); }
  s += tm(x + w - 4, Y(0) - 6, 'par', { size: 11, fill: T.muted, anchor: 'end' });
  // pauses: hatched bands
  s += `<defs><pattern id="hatch${T.id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${T.warn}" stroke-width="1.6" opacity="0.5"/></pattern></defs>`;
  for (const [a, b, lab] of PAUSES) {
    s += `<rect x="${f1(X(a))}" y="${y}" width="${f1(X(b) - X(a))}" height="${h}" fill="url(#hatch${T.id})" opacity="0.55"/>`;
    if (lab && !o.noPauseLabels) s += tm(f1((X(a) + X(b)) / 2), y + h - 8, lab, { size: 10.5, fill: T.warn, anchor: 'middle' });
  }
  // ledger line (stepped)
  let cum = 0, d = `M${f1(X(0))},${f1(Y(0))}`, area = d;
  const pts = [];
  for (const e of EV) { d += ` H${f1(X(e.t))} V${f1(Y(cum + e.lu))}`; area += ` H${f1(X(e.t))} V${f1(Y(cum + e.lu))}`; cum += e.lu; pts.push({ e, y: Y(cum), x: X(e.t) }); }
  d += ` H${f1(X(TOTAL))}`; area += ` H${f1(X(TOTAL))} V${f1(Y(0))} H${f1(X(0))} Z`;
  s += `<path d="${area}" fill="${T.warn}" opacity="0.10"/>`;
  s += `<path d="${d}" fill="none" stroke="${T.ink}" stroke-width="2.2" stroke-linejoin="round"/>`;
  // markers
  for (const p of pts) { const sev = -p.e.lu >= 4; s += badge(T, p.e.b, p.x, p.y, 8.5, { costly: sev }); }
  // cursor
  const cx = X(o.cursor ?? 0.70);
  s += `<line x1="${f1(cx)}" y1="${y - 8}" x2="${f1(cx)}" y2="${y + h}" stroke="${T.acc}" stroke-width="1.6"/>` + circle(cx, y - 8, 4.5, T.acc);
  // x ticks
  for (const sec of [0, 2, 4, 6, 8, 10, 12, 14]) s += tm(f1(X(sec)), y + h + 18, `${sec}s`, { size: 11, fill: T.muted, anchor: 'middle' });
  return { svg: s, X, Y };
}
function pins(T, X, y, sel = 1) {
  let s = '';
  for (const k of KEYMOMENTS) {
    const col = toneOf(T, k.b, false), on = k.n === sel;
    s += `<circle cx="${f1(X(k.t))}" cy="${y}" r="10" fill="${on ? col : T.bg}" stroke="${col}" stroke-width="1.8"/>` + tm(f1(X(k.t)), y + 4, String(k.n), { size: 11.5, fill: on ? T.onAcc : col, weight: 600, anchor: 'middle' });
  }
  return s;
}

// ---------------- move list ----------------
function chipW(label) { return label.length > 1 ? 34 : 28; }
function moveList(T, x, y, rowH, o = {}) {
  let s = '', pos = null; const tags = {};
  ROWS.forEach((r, ri) => {
    const cy = y + ri * rowH;
    const tone = STAGE_TONE[ri];
    s += tm(x, cy + 4, r.label, { size: 12, fill: T.muted });
    let cx = x + 72;
    if (r.skip) {
      s += badge(T, 'skip', cx + 10, cy, 10) + tw(T, cx + 28, cy + 5, 'EO skip · saved about 6 moves', { size: 13, fill: T.good, weight: 600 });
    }
    r.mv.forEach(([m, id], mi) => {
      const w = chipW(m); const cur = ri === (o.cur?.[0] ?? 0) && mi === (o.cur?.[1] ?? 3); const hov = o.hover && o.hover[0] === ri && o.hover[1] === mi;
      const notable = id !== 'fine' && id !== 'optimal';
      const col = id === 'fine' ? T.muted : toneOf(T, id, (ri === 4 && id === 'extra' && false));
      s += `<rect x="${f1(cx)}" y="${cy - 12}" width="${w}" height="24" rx="${T.id === 'mono' ? 4 : 7}" fill="${cur || hov ? T.surf2 : T.surf}"${cur || hov ? ` stroke="${T.acc}" stroke-width="1.6"` : ''}/>`;
      s += tm(f1(cx + w / 2), cy + 4.5, mv(m), { size: 13, fill: id === 'fine' ? T.ink : (id === 'optimal' ? T.ink : col), weight: notable ? 500 : 400, anchor: 'middle' });
      if (id === 'optimal') s += `<rect x="${f1(cx + 5)}" y="${cy + 8}" width="${w - 10}" height="2.2" rx="1.1" fill="${T.good}"/>`;
      else if (notable) s += badge(T, id, cx + w - 1, cy - 12, 6.5);
      if (cur || hov) pos = [cx + w / 2, cy];
      if (ri === o.hover?.[0] && mi === o.hover?.[1]) pos = [cx + w / 2, cy];
      cx += w + 5;
    });
    const right = x + 752;
    if (r.tag) {
      const hov2 = o.linkHover === r.tag, tcol = hov2 ? T.acc : r.tag === 'pseudo' ? T.good : T.muted;
      s += tm(right - 84, cy + 4, `<tspan style="text-decoration:underline dotted ${T.acc};text-underline-offset:4px">${r.tag}</tspan>${hov2 ? ' ›' : ''}`, { size: 11.5, fill: tcol, anchor: 'end', raw: true, weight: hov2 ? 500 : 400 });
      tags[r.tag] = [right - 84 - (r.tag.length * 6.9) / 2 - (hov2 ? 4 : 0), cy];
    }
    if (r.stage) s += badge(T, r.stage, right - 66 + 0, cy, 8.5);
    if (STAGE_ACC[ri] != null) s += tm(right, cy + 4.5, String(STAGE_ACC[ri]), { size: 13, fill: STAGE_ACC[ri] >= 88 ? T.good : STAGE_ACC[ri] >= 75 ? T.ink : STAGE_TONE[ri] === 'sev' ? T.sev : T.warn, weight: 500, anchor: 'end' });
  });
  return { svg: s, pos, tags };
}
function keyMomentCards(T, x, y, w, sel = 1) {
  const cw = (w - 4 * 12) / 5; let s = '';
  KEYMOMENTS.forEach((k, i) => {
    const cx = x + i * (cw + 12), col = toneOf(T, k.b, false), on = k.n === sel;
    s += `<rect x="${f1(cx)}" y="${y}" width="${f1(cw)}" height="46" rx="${T.id === 'mono' ? 6 : 14}" fill="${T.surf}"${on ? ` stroke="${T.acc}" stroke-width="1.6"` : ''}/>`;
    s += `<circle cx="${f1(cx + 20)}" cy="${y + 23}" r="10" fill="${on ? col : T.bg}" stroke="${col}" stroke-width="1.6"/>` + tm(f1(cx + 20), y + 27, String(k.n), { size: 11.5, fill: on ? T.onAcc : col, weight: 600, anchor: 'middle' });
    s += tw(T, cx + 38, y + 21, k.title, { size: 13, fill: T.ink, weight: 700 });
    s += tm(cx + 38, y + 37, k.sub, { size: 10.5, fill: T.muted });
  });
  return s;
}

// ---------------- left visual: ring (Orbit) or lane (Mono) ----------------
function leftVisual(T, cx, cy, r, o = {}) {
  let s = '';
  if (T.id === 'orbit') {
    const L = layout(T_STAGE.map(v => Math.max(v, 0.0001)));
    KEYS.forEach((k, i) => {
      const { a0, a1, mid } = L[i]; const tone = STAGE_TONE[i];
      if (!T_STAGE[i]) { const [x, yy] = polar(cx, cy, r, mid); s += circle(x, yy, 4.5, T.good) + spark(x + 10, yy - 12, 6, T.good) + spark(x + 19, yy - 3, 3.2, T.good); return; }
      const col = tone === 'good' ? T.good : tone === 'ink' ? T.ink : tone === 'sev' ? T.sev : T.warn;
      s += arc(cx, cy, r, a0, a1, col, i === 0 ? 8 : 6);
    });
    // stage labels
    KEYS.forEach((k, i) => {
      const { mid } = L[i]; const [x, yy] = polar(cx, cy, r + 46, mid);
      s += tm(f1(x), f1(yy + 4), k === 'cross' ? 'cross' : k, { size: 10.5, fill: T.muted, anchor: 'middle' });
    });
    const angleOf = tt => { const i = T_END.findIndex(e => tt <= e + 1e-6); const k = Math.max(0, i); const span = T_STAGE[k] || 0.0001; return L[k].a0 + (tt - T_START[k]) / span * (L[k].a1 - L[k].a0); };
    for (const k of KEYMOMENTS) {
      const [px, py] = polar(cx, cy, r + 20, angleOf(k.t)); const col = toneOf(T, k.b, false), on = k.n === (o.sel ?? 1);
      s += `<circle cx="${f1(px)}" cy="${f1(py)}" r="10" fill="${on ? col : T.bg}" stroke="${col}" stroke-width="1.8"/>` + tm(f1(px), f1(py + 4), String(k.n), { size: 11.5, fill: on ? T.onAcc : col, weight: 600, anchor: 'middle' });
    }
    const [dx, dy] = polar(cx, cy, r, angleOf(o.cursor ?? 0.70));
    s += circle(dx, dy, 11, T.accSoft) + circle(dx, dy, 6, T.acc);
  }
  return s;
}
function laneVisual(T, x, y, w) {
  let s = ''; const gap = 5; const total = T_STAGE.reduce((a, b) => a + Math.max(b, 0.35), 0); const avail = w - gap * (KEYS.length - 1);
  let cx = x; const pos = {};
  KEYS.forEach((k, i) => {
    const seg = Math.max(T_STAGE[i], 0.35) / total * avail; const tone = STAGE_TONE[i];
    const col = tone === 'good' ? T.good : tone === 'ink' ? T.ink : tone === 'sev' ? T.sev : T.warn;
    s += `<rect x="${f1(cx)}" y="${y}" width="${f1(seg)}" height="6" rx="3" fill="${T_STAGE[i] ? col : T.good}"/>`;
    s += tm(f1(cx + seg / 2), y + 26, k, { size: 10.5, fill: T.muted, anchor: 'middle' });
    pos[i] = [cx, seg]; cx += seg + gap;
  });
  const at = tt => { const i = T_END.findIndex(e => tt <= e + 1e-6); const [sx, sw] = pos[Math.max(0, i)]; return sx + (tt - T_START[i]) / (T_STAGE[i] || 1) * sw; };
  for (const k of KEYMOMENTS) { const px = at(k.t), col = toneOf(T, k.b, false), on = k.n === 1; s += `<circle cx="${f1(px)}" cy="${y - 20}" r="10" fill="${on ? col : T.bg}" stroke="${col}" stroke-width="1.8"/>` + tm(f1(px), y - 16, String(k.n), { size: 11.5, fill: on ? T.onAcc : col, weight: 600, anchor: 'middle' }) + `<line x1="${f1(px)}" y1="${y - 10}" x2="${f1(px)}" y2="${y - 2}" stroke="${col}" stroke-width="1.4"/>`; }
  const cx0 = at(0.70); s += `<rect x="${f1(cx0 - 1.5)}" y="${y - 8}" width="3" height="22" fill="${T.acc}"/>`;
  return s;
}

// ---------------- chrome ----------------
function chrome(T, title) {
  if (T.id === 'orbit') return O.topbar();
  // Mono top bar (same as the A-* frames)
  let o = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o += `<rect x="${64 + c * 6}" y="${38 + r * 6}" width="4" height="4" rx="1" fill="${r === 1 && c === 1 ? T.acc : T.muted}"/>`;
  o += tm(92, 52, 'cubesight', { size: 20, fill: T.ink, weight: 500, ls: -0.5 });
  let x = 272; for (const n of ['brain', 'history', 'trainers', 'settings']) { o += tm(x, 51, n, { size: 13, fill: n === 'brain' ? T.ink : T.muted }); x += monoW(n, 13) + 24; }
  o += circle(W - 244, 47, 3.5, T.acc) + tm(W - 232, 51, 'GAN 356 i3', { size: 13, fill: T.muted }) + O.battery(W - 140, 41, 84, T.muted) + tm(W - 64, 51, '84%', { size: 13, fill: T.muted, anchor: 'end' });
  return o;
}
const DEFS_GLOW = `<defs><radialGradient id="cubeGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${OC.glow}" stop-opacity="0.22"/><stop offset="0.55" stop-color="${OC.glow}" stop-opacity="0.07"/><stop offset="1" stop-color="${OC.glow}" stop-opacity="0"/></radialGradient></defs>`;
const FONTS = ['manrope', 'mono400', 'mono500'];
const frame = (T, body, w = W, h = H, bg = T.bg) => svg(w, h, (T.glow ? DEFS_GLOW : '') + body, { fonts: T.id === 'mono' ? ['mono300', 'mono400', 'mono500'] : FONTS, bg });

// ============================================================ R-02 review screen ============================================================
const COACH_4 = {
  badge: 'detour', label: 'Detour  +2', title: 'Move 4 · D',
  body: `That one turned you away from the cross. The shortest way from here was R\u00a0D${PR}\u00a0F, 3 more moves. You took 5 more (6 vs your 8 for the cross).`,
  alg: `R D${PR} F`, algNote: `best from here · also ${mv("B' F R")}...`.replace(/ · also .*/, ' · 3 more, you needed 5'),
};
const LL_STATE = { U: 'wwwwwwwww', F: 'ogobggggg', R: 'grrrrrrrr' };   // illustrative last-layer view (not computed)
const COACH_AA = {
  badge: 'pause', label: 'Pause  +1.3', title: 'Move 53 · R',
  body: `A 0.6 s stop in the middle of Aa. The rest of the alg ran at 7 TPS. Worth drilling Aa until your hands run it without a look.`,
  links: ['Aa'], alg: `R${PR} F R${PR} B2 R F${PR} R${PR} B2 R2`, algNote: 'Aa · your alg · 9 moves',
};
function review(T, o = {}) {
  const aa = o.scene === 'aa';
  const sc = aa ? { faces: LL_STATE, arrow: '', coach: COACH_AA, cursor: 12.2, sel: 0, cur: [7, 4], moveText: 'move 53 of 68 · 12.20 s', view: 'illustrative last-layer view' }
    : { faces: CUBE_BEFORE_4, arrow: null, coach: COACH_4, cursor: 0.70, sel: 1, cur: [0, 3], moveText: 'move 4 of 68 · 0.70 s', view: 'viewed from below · cross side up' };
  let b = chrome(T);
  const orbit = T.id === 'orbit';
  b += tm(orbit ? 64 : 64, 104, 'review', { size: 13, fill: T.acc, weight: 500, ls: 1 });
  b += tm(orbit ? 132 : 132, 104, 'solve 23 · 14.07 s · 68 moves', { size: 13, fill: T.muted });
  // accuracy chip (header right)
  b += tm(W - 64, 104, 'accuracy', { size: 12, fill: T.muted, anchor: 'end' });
  b += tw(T, W - 64 - 76, 108, String(ACC.all), { size: 22, fill: T.acc, weight: 700, anchor: 'end' });
  // left
  const LX = orbit ? 322 : 330, LY = orbit ? 424 : 330;
  if (orbit) { b += leftVisual(T, LX, LY, 172, { cursor: sc.cursor, sel: sc.sel }); }
  const s = orbit ? 88 : 100;
  const arrow = sc.arrow ?? arrowR(LX, LY, s, T.acc, true);
  b += cubeC(T, LX, LY, s, sc.faces, arrow);
  // chip "cross side up"
  b += tm(LX, orbit ? 656 : 520, sc.view, { size: 11, fill: T.muted, anchor: 'middle' });
  if (!aa) b += tm(LX + 70, LY - s * 0.62 - 8, 'R', { size: 13, fill: T.acc, weight: 600, anchor: 'middle' });
  if (!orbit) b += laneVisual(T, 100, 560, 460);
  const cy = orbit ? 704 : 640;
  b += stepControls(T, LX, cy);
  b += tm(LX, cy + 52, sc.moveText, { size: 13, fill: T.muted, anchor: 'middle' });
  b += pillBtn(T, LX - 126, cy + 70, 252, 40, `Retry this moment  ↻`, { primary: true });
  // right column
  const RX = 640;
  b += avatar(T, RX + 4, 176, 19);
  b += coachBubble(T, RX + 34, 124, 718, 134, sc.coach);
  b += tm(RX + 24, 294, 'solve graph', { size: 13, fill: T.muted });
  b += tm(RX + 752 - 200, 294, 'moves vs par', { size: 11.5, fill: T.muted });
  b += `<rect x="${RX + 752 - 92}" y="281" width="92" height="20" rx="10" fill="${T.surf}"/><rect x="${RX + 752 - 92}" y="281" width="46" height="20" rx="10" fill="${T.surf2}"/>` + tm(RX + 752 - 69, 295, 'time', { size: 11, fill: T.ink, anchor: 'middle' }) + tm(RX + 752 - 23, 295, 'moves', { size: 11, fill: T.muted, anchor: 'middle' });
  const gx = RX + 24, gw = 728 - 0, gy = 334, gh = 132;
  const g = solveGraph(T, gx, gy, gw - 0, gh, { cursor: sc.cursor });
  b += g.svg + pins(T, g.X, 316, sc.sel);
  // stage labels under axis
  KEYS.forEach((k, i) => { if (T_STAGE[i]) b += tm(f1(g.X((T_START[i] + T_END[i]) / 2)), gy + gh + 36, k, { size: 10.5, fill: i === 3 ? T.good : T.muted, anchor: 'middle' }); });
  b += tm(RX + 24, 540, 'moves', { size: 13, fill: T.muted });
  b += badgeLegend(T, RX + 752 - 0, 540);
  const ml = moveList(T, RX + 24 - 24, 568, 25.5, { hover: o.hover, cur: sc.cur, linkHover: o.linkHover });
  b += ml.svg;
  b += keyMomentCards(T, RX + 24, 802, 728, sc.sel);
  b += keyHints(T, 874, [['←→', 'move'], ['[ ]', 'key moment'], ['b', 'show best move'], ['r', 'retry'], ['esc', 'close']]);
  if (o.tooltip) b += tooltip(T, ml.pos);
  if (o.popover) b += drillPopover(T, ml.tags[o.linkHover][0], ml.tags[o.linkHover][1] - 10);
  return frame(T, b);
}
function drillPopover(T, tipX, tipY) {
  const w = 372, h = 262, x = W - 48 - w, y = tipY - 12 - h;
  let s = `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${T.id === 'mono' ? 8 : 20}" fill="${T.surf2}" stroke="${T.line}" stroke-width="1.2"/>`;
  s += `<path d="M${f1(tipX - 10)},${f1(y + h - 0.6)} L${f1(tipX)},${f1(tipY)} L${f1(tipX + 10)},${f1(y + h - 0.6)} Z" fill="${T.surf2}" stroke="${T.line}" stroke-width="1.2"/><rect x="${f1(tipX - 11)}" y="${f1(y + h - 2)}" width="22" height="3" fill="${T.surf2}"/>`;
  s += arc(x + 34, y + 38, 12, 0, 359.9, T.line, 3) + arc(x + 34, y + 38, 12, 0, 230, T.acc, 3.4) + circle(...polar(x + 34, y + 38, 12, 230), 3, T.acc);
  s += tw(T, x + 60, y + 44, 'Drill Aa', { size: 19, fill: T.ink, weight: 700 }) + tm(x + w - 22, y + 43, 'pll recognition', { size: 11.5, fill: T.muted, anchor: 'end' });
  s += tw(T, x + 24, y + 82, '20 cases · Aa, Ab, E · about 2 min', { size: 14.5, fill: T.ink, weight: 600 });
  s += tm(x + 24, y + 104, 'look-alikes Ab and E · random AUF', { size: 11.5, fill: T.muted });
  s += `<rect x="${x + 22}" y="${y + 118}" width="${w - 44}" height="50" rx="${T.id === 'mono' ? 6 : 12}" fill="${T.surf}"/>`;
  s += tm(x + 36, y + 140, 'why', { size: 11, fill: T.muted }) + tm(x + 76, y + 140, '1.05 s, mid-alg, in this solve', { size: 12, fill: T.ink });
  s += tm(x + 76, y + 158, 'your PLL median is 0.62 s', { size: 11.5, fill: T.muted });
  s += pillBtn(T, x + 22, y + 184, 140, 36, 'Start drill  ›', { primary: true, size: 13.5 }) + pillBtn(T, x + 174, y + 184, 112, 36, 'Alg page', { size: 13.5 });
  s += tm(x + 22, y + 238, '#/drills/pll?cases=Aa,Ab,E&round=20', { size: 10.5, fill: T.faint });
  s += tm(x + 22, y + 254, '&from=review:…:53  ·  enter or tap again', { size: 10.5, fill: T.faint });
  return s + '</g>';
}
function badgeLegend(T, xr, y) {
  const items = [['optimal', 'optimal'], ['extra', 'extra move'], ['pause', 'pause'], ['skip', 'skip']]; let x = xr; let s = '';
  for (const [id, lab] of items.reverse()) { const w = monoW(lab, 11); x -= w; s += tm(f1(x), y, lab, { size: 11, fill: T.muted }); x -= 16; s += badge(T, id, x + 4, y - 4, 6.5); x -= 18; }
  return s;
}
function tooltip(T, pos) {
  const w = 316, h = 176; let x = Math.min(pos[0] - 40, W - 64 - w), y = pos[1] + 26;
  let s = `<g><path d="M${f1(pos[0])},${f1(y - 8)} l-8,8 h16 Z" fill="${T.surf2}"/><rect x="${f1(x)}" y="${y}" width="${w}" height="${h}" rx="${T.id === 'mono' ? 8 : 16}" fill="${T.surf2}" stroke="${T.line}" stroke-width="1"/>`;
  s += badge(T, 'detour', x + 30, y + 30, 11);
  s += tw(T, x + 52, y + 35, 'Move 4 · D', { size: 16, fill: T.ink, weight: 700 });
  s += tm(x + w - 18, y + 35, 'Detour  +2', { size: 12.5, fill: T.warn, weight: 500, anchor: 'end' });
  s += `<line x1="${x + 18}" y1="${y + 50}" x2="${x + w - 18}" y2="${y + 50}" stroke="${T.line}"/>`;
  const rows = [['cross distance', '3 → 4  (+1)'], ['best here', `R  then D${PR} F`], ['from here', 'best 3 more · you 5'], ['accuracy', 'cross 80 → 100 if fixed']];
  rows.forEach(([k, v], i) => { s += tm(x + 18, y + 76 + i * 24, k, { size: 12, fill: T.muted }) + tm(x + w - 18, y + 76 + i * 24, v, { size: 12.5, fill: i === 1 ? T.acc : T.ink, weight: i === 1 ? 500 : 400, anchor: 'end' }); });
  s += tm(x + 18, y + h - 10, 'click to jump · r to retry', { size: 11, fill: T.faint });
  return s + '</g>';
}

// ============================================================ R-00 badge sheet ============================================================
function badges(T) {
  let b = chrome(T);
  b += tw(T, 64, 110, 'Review labels', { size: 28, fill: T.ink, weight: 700, ls: -0.5 });
  b += tm(64, 138, 'cubing words, one icon each · ring = light, solid = strong, dashed = inferred (low confidence) · amber = could be better, red = costly (4+ moves)', { size: 12.5, fill: T.muted });
  const cols = [
    { head: 'good', items: [['optimal', 'on a shortest path (distance −1)', 'solver · proven'], ['efficient', 'stage within 1 move of optimal', 'solver'], ['clean', 'no waste, pause, cancel or rotation', 'derived'], ['flow', 'moved on without stopping', 'timing · needs times'], ['skip', 'EO, CO, OLL or PLL done for free', 'measured'], ['freepair', 'a pair came with no moves of its own', 'measured'], ['xcross', 'cross finished with a pair attached', 'measured'], ['pseudo', 'pair in a D offset that saved moves', 'solver + measured']] },
    { head: 'neutral and could be better', items: [['fine', 'nothing to flag', ''], ['ok', 'within one move of par', 'derived'], ['dfix', 'the free D turn that ends a pseudo offset', 'measured'], ['extra', '+1 move over the shortest path', 'solver'], ['detour', '+2, the move turned away from the goal', 'solver'], ['cancel', 'moves that undo each other (R R′)', 'exact · from the moves'], ['betterpair', 'a cheaper pair was on the table', 'planner · greedy'], ['bettercross', 'another face was 2+ moves shorter', 'solver']] },
    { head: 'time, hands and the rest', items: [['pause', 'a stop longer than lookahead allows', 'timing · needs times'], ['slow', 'long stop before an OLL or PLL alg', 'timing · needs times'], ['rotation', 'cube turned in hand between moves', 'gyro only'], ['auf', 'more U turns than the best AUF', 'exact · PLL table'], ['stray', 'D offset that no pair used', 'measured'], ['missedx', 'an X-cross was as short as your cross', 'solver'], ['regrip', 'pause inside an alg, gyro still', 'inferred · off by default'], ['lockup', 'quick undo pair, jam-like', 'inferred · off by default']] },
  ];
  cols.forEach((c, ci) => {
    const x = 64 + ci * 448;
    b += tm(x, 200, c.head, { size: 13, fill: ci === 0 ? T.good : T.muted, weight: 500 });
    b += `<line x1="${x}" y1="212" x2="${x + 410}" y2="212" stroke="${T.line}"/>`;
    c.items.forEach(([id, def, src], i) => {
      const y = 252 + i * 66;
      b += badge(T, id, x + 20, y, 15);
      b += tw(T, x + 50, y - 2, LBL[id].n, { size: 16, fill: T.ink, weight: 700 });
      b += tm(x + 50, y + 18, def, { size: 11.5, fill: T.muted });
      if (src) b += tm(x + 410, y - 2, src, { size: 10.5, fill: src.includes('inferred') ? T.warn : T.faint, anchor: 'end' });
    });
  });
  // severity strip
  const sy = 800; b += tm(64, sy, 'negative severity', { size: 12, fill: T.muted });
  [['extra', 'minor · under 2 moves', false], ['detour', 'major · 2 to 4 moves', false], ['detour', 'costly · 4+ moves', true]].forEach(([id, lab, costly], i) => { const x = 260 + i * 250; b += badge(T, id, x, sy - 4, 12, { costly }) + tm(x + 22, sy, lab, { size: 12, fill: T.ink }); });
  b += tm(64, sy + 30, 'no gyro: rotation hidden · no move times (older or imported solves): pause, slow recog and flow hidden', { size: 11.5, fill: T.muted });
  b += keyHints(T, 866, [['esc', 'close']]);
  return frame(T, b);
}

// ============================================================ R-01 results ============================================================
function results(T) {
  let b = O.topbar();
  const X = 64;
  b += tm(X, 140, 'time', { size: 14, fill: T.muted });
  b += tw(T, X - 6, 244, '14.07', { size: 120, fill: T.acc, weight: 300, tnum: 1, ls: -3 });
  b += tw(T, X + 330, 244, 's', { size: 28, fill: T.muted, weight: 500 });
  [['moves', '68'], ['tps', '4.83'], ['inspection', '8.70'], ['vs ao12', '−0.96']].forEach(([k, v], i) => { const x = X + i * 104; b += tm(x, 302, k, { size: 13, fill: T.muted }) + tw(T, x, 336, v, { size: 28, fill: k === 'vs ao12' ? T.acc : T.ink, weight: 600, tnum: 1 }); });
  b += tm(X, 376, 'cfop · 2-look · pseudo pairs · wca · no penalty', { size: 12.5, fill: T.muted });
  // middle: tps chart with pause marks
  b += tm(520, 140, 'turns per second', { size: 14, fill: T.muted });
  b += O.tpsChart(520, 180, 540, 180);
  const px = v => 520 + v / 14.07 * 540;
  for (const [a, e] of [[7.27, 8.17]]) b += `<rect x="${f1(px(a))}" y="180" width="${f1(px(e) - px(a))}" height="180" fill="${T.warn}" opacity="0.14"/>` + tm(f1(px((a + e) / 2)), 352, '0.9 s pause', { size: 10.5, fill: T.warn, anchor: 'middle' });
  // accuracy ring (replaces the moves donut)
  const cx = 1236, cy = 262, r = 96;
  const L = layout([REF.cross, REF.f2l, REF.ll]);
  const accCol = a => a >= 88 ? T.acc : a >= 75 ? T.ink : T.warn;
  [ACC.cross, ACC.f2l, ACC.ll].forEach((a, i) => {
    b += arc(cx, cy, r, L[i].a0, L[i].a1, T.line, 14, 'stroke-linecap="butt"');
    b += arc(cx, cy, r, L[i].a0, L[i].a0 + (L[i].a1 - L[i].a0) * a / 100, accCol(a), 14, 'stroke-linecap="butt"');
    const sn = Math.sin(L[i].mid * Math.PI / 180); const [lx, ly] = polar(cx, cy, r + 24, L[i].mid); b += tm(f1(lx), f1(ly + 4), ['cross', 'f2l', 'll'][i] + ' ' + a, { size: 11.5, fill: accCol(a), anchor: sn > 0.3 ? 'start' : sn < -0.3 ? 'end' : 'middle', weight: 500 });
  });
  b += tw(T, cx, cy + 8, String(ACC.all), { size: 40, fill: T.ink, weight: 600, anchor: 'middle', tnum: 1 });
  b += tm(cx, cy + 32, 'accuracy · solid', { size: 12, fill: T.muted, anchor: 'middle' });
  // splits with review badges
  b += `<line x1="64" y1="432" x2="1376" y2="432" stroke="${T.line}"/>`;
  b += tm(X, 476, 'splits', { size: 14, fill: T.muted });
  b += `<line x1="${X + 330}" y1="464" x2="${X + 330}" y2="478" stroke="${T.ink}" stroke-width="1.5"/>` + tm(X + 342, 476, 'your average', { size: 12, fill: T.muted });
  b += tm(X + 580, 476, 'vs avg', { size: 12, fill: T.muted, anchor: 'end' });
  b += O.splitBars(X, 516, 580, 32);
  const split = [['detour'], ['betterpair'], ['cancel'], ['pseudo'], ['pause'], ['skip'], [], ['pause'], ['auf']];
  split.forEach((ids, i) => { const y = 516 + i * 32; ids.forEach((id, j) => { b += badge(T, id, X + 62 + j * 20, y, 8); }); });
  // right lower: review block
  const R = 760;
  b += tm(R, 476, 'review', { size: 14, fill: T.muted });
  b += tm(R + 616, 476, '5 key moments', { size: 12, fill: T.muted, anchor: 'end' });
  const lines = [
    ['betterpair', `Pair 1 took 7 moves. BL was 5 away as a pseudo pair: D L${PR} U${PR} L D${PR}.`, false],
    ['detour', `Cross: 8 moves, best was 6 (${mv("F' D' F R D' F")}). Move 4 turned you away.`, false],
    ['pseudo', 'Pair 3 went in pseudo: 3 moves fewer than the best normal pair.', true],
    ['skip', 'EO skip. About 6 moves saved.', true],
  ];
  lines.forEach(([id, txt, good], i) => { const y = 512 + i * 30; b += badge(T, id, R + 10, y - 5, 9) + tw(T, R + 30, y, txt, { size: 14, fill: T.ink, weight: 500 }); });
  // three stage scores under the list
  [['cross', ACC.cross], ['f2l', ACC.f2l], ['ll', ACC.ll]].forEach(([k, v], i) => { const x = R + i * 120; b += tm(x, 660, k, { size: 12, fill: T.muted }) + tw(T, x, 696, String(v), { size: 30, fill: accCol(v), weight: 600, tnum: 1 }); });
  // CTA
  b += `<rect x="${R + 380}" y="648" width="236" height="56" rx="28" fill="${T.acc}"/>` + tw(T, R + 380 + 118, 683, 'Review solve  →', { size: 17, fill: T.onAcc, weight: 700, anchor: 'middle' });
  b += tm(R + 380 + 118, 726, 'takes a second · runs on this device', { size: 11, fill: T.muted, anchor: 'middle' });
  b += O.hints(860, [['v', 'review solve'], ['space', 'next scramble'], ['r', 'retry this scramble'], ['esc', 'settings']]);
  return frame(T, b);
}

// ============================================================ R-04 retry ============================================================
function retry(T) {
  let b = O.topbar();
  b += tm(64, 104, 'review', { size: 13, fill: T.acc, weight: 500, ls: 1 }) + tm(132, 104, 'retry · move 4 of 68 · cross', { size: 13, fill: T.muted });
  const PW = 410, xs = [64, 514, 964];
  const titles = [['1', 'Set the cube', 'guided, like a scramble'], ['2', 'Your turn', 'try the moment again'], ['3', 'Re-graded', 'same engine, same rules']];
  titles.forEach(([n, ti, sub], i) => {
    const x = xs[i];
    b += `<circle cx="${x + 14}" cy="168" r="14" fill="${i === 1 ? T.acc : T.surf2}"/>` + tm(x + 14, 173, n, { size: 13, fill: i === 1 ? T.onAcc : T.ink, weight: 600, anchor: 'middle' });
    b += tw(T, x + 40, 166, ti, { size: 22, fill: T.ink, weight: 700 }) + tm(x + 40, 188, sub, { size: 12, fill: T.muted });
    b += `<rect x="${x}" y="212" width="${PW}" height="560" rx="${T.id === 'mono' ? 8 : 24}" fill="${T.surf}"/>`;
    if (i < 2) b += tri(x + PW + 25, 492, 8, 1, T.faint);
  });
  // panel 1
  { const x = xs[0], cx = x + PW / 2, cy = 400;
    b += arc(cx, cy, 128, 0, 359.9, T.line, 4) + arc(cx, cy, 128, 0, 359.9 * 19 / 23, T.acc, 7);
    const [dx, dy] = polar(cx, cy, 128, 359.9 * 19 / 23); b += circle(dx, dy, 8, T.accSoft) + circle(dx, dy, 4.5, T.acc);
    b += cubeC(T, cx, cy, 70, CUBE_START);
    b += tw(T, cx, 584, '19 of 23 turns', { size: 22, fill: T.ink, weight: 600, anchor: 'middle' });
    b += tm(cx, 608, 'scramble, then your first 3 moves', { size: 12, fill: T.muted, anchor: 'middle' });
    const cues = [['…', 'done'], [`U${PR}`, 'done'], ['F2', 'done'], [`L${PR}`, 'cur'], [`F${PR}`, 'todo'], [`D${PR}`, 'todo'], ['F', 'todo']];
    let cxp = cx - (cues.length * 40) / 2 + 4; cues.forEach(([m, st]) => { const cur = st === 'cur'; b += `<rect x="${f1(cxp)}" y="636" width="34" height="30" rx="8" fill="${cur ? T.acc : T.surf2}" opacity="${st === 'done' ? 0.45 : 1}"/>` + tm(f1(cxp + 17), 656, m, { size: 14, fill: cur ? T.onAcc : T.ink, weight: cur ? 600 : 400, anchor: 'middle' }); cxp += 40; });
    b += tm(cx, 700, 'wrong turn? I show the way back, as in a scramble', { size: 11.5, fill: T.muted, anchor: 'middle' });
    b += tm(cx, 742, 'no smart cube: the 3D cube takes keys or an on-screen pad', { size: 11.5, fill: T.faint, anchor: 'middle' });
  }
  // panel 2
  { const x = xs[1], cx = x + PW / 2;
    b += tm(x + 28, 252, 'goal', { size: 12, fill: T.muted });
    b += `<rect x="${x + 70}" y="234" width="170" height="26" rx="13" fill="${T.accSoft}"/>` + tm(x + 155, 252, 'finish the cross', { size: 12.5, fill: T.acc, weight: 500, anchor: 'middle' });
    b += tm(x + PW - 28, 252, 'best known: 3 more', { size: 12, fill: T.muted, anchor: 'end' });
    b += cubeC(T, cx, 372, 80, CUBE_AFTER_R);
    b += tw(T, cx, 566, '0.61', { size: 72, fill: T.ink, weight: 300, anchor: 'middle', tnum: 1, ls: -2 });
    let cxp = cx - 31; [[`R`, 'optimal']].forEach(([m, id]) => { b += `<rect x="${cxp}" y="594" width="62" height="34" rx="9" fill="${T.surf2}"/>` + tm(cxp + 31, 617, m, { size: 16, fill: T.ink, anchor: 'middle' }) + badge(T, id, cxp + 56, 594, 8); cxp += 78; });
    b += tm(cx, 672, 'no best-move arrow here: it is your turn', { size: 12, fill: T.muted, anchor: 'middle' });
    b += tm(cx, 696, 'nothing here counts towards ao5 or ao12', { size: 12, fill: T.faint, anchor: 'middle' });
    b += tm(cx, 740, 'esc give up · u undo', { size: 11.5, fill: T.faint, anchor: 'middle' });
  }
  // panel 3
  { const x = xs[2], cx = x + PW / 2;
    b += cubeC(T, cx, 330, 70, CUBE_CROSS_DONE);
    b += tw(T, cx, 464, 'Cross done in 3 moves', { size: 22, fill: T.ink, weight: 700, anchor: 'middle' });
    const row = (y, tag, moves, id, txt, col) => { let s = tm(x + 28, y, tag, { size: 11.5, fill: T.muted }); s += tm(x + 100, y, moves, { size: 14, fill: col, weight: 500 }); s += badge(T, id, x + PW - 34, y - 4, 10); s += tm(x + PW - 52, y, txt, { size: 12, fill: col, anchor: 'end' }); return s; };
    b += row(510, 'original', `D B D${PR} R D${PR}`, 'detour', '5 moves', T.warn);
    b += row(544, 'retry', `R D${PR} F`, 'optimal', '3 moves', T.good);
    b += `<line x1="${x + 28}" y1="566" x2="${x + PW - 28}" y2="566" stroke="${T.line}"/>`;
    b += tm(x + 28, 600, 'cross accuracy', { size: 12, fill: T.muted }) + tw(T, x + PW - 28, 606, '80  →  100', { size: 24, fill: T.acc, weight: 700, anchor: 'end', tnum: 1 });
    b += tm(x + 28, 640, 'You found the shortest way. Sharp.', { size: 13, fill: T.ink });
    b += pillBtn(T, x + 28, 672, 160, 40, 'Try again') + pillBtn(T, x + PW - 28 - 170, 672, 170, 40, 'Next moment  2/5', { primary: true });
    b += tm(x + PW / 2, 744, 'saved in "moments you improved"', { size: 11.5, fill: T.faint, anchor: 'middle' });
  }
  b += O.hints(860, [['r', 'again'], ['n', 'next moment'], ['esc', 'back to review']]);
  return frame(T, b);
}

// ============================================================ R-05 accuracy ============================================================
function accuracy(T) {
  let b = O.topbar();
  b += tm(64, 104, 'review', { size: 13, fill: T.acc, weight: 500, ls: 1 }) + tm(132, 104, 'accuracy · solve 23', { size: 13, fill: T.muted });
  const cx = 290, cy = 400, r = 150;
  const L = layout([REF.cross, REF.f2l, REF.ll]); const col = a => a >= 88 ? T.acc : a >= 75 ? T.ink : T.warn;
  [ACC.cross, ACC.f2l, ACC.ll].forEach((a, i) => {
    b += arc(cx, cy, r, L[i].a0, L[i].a1, T.line, 16, 'stroke-linecap="butt"') + arc(cx, cy, r, L[i].a0, L[i].a0 + (L[i].a1 - L[i].a0) * a / 100, col(a), 16, 'stroke-linecap="butt"');
    const sn = Math.sin(L[i].mid * Math.PI / 180); const [lx, ly] = polar(cx, cy, r + 26, L[i].mid); b += tm(f1(lx), f1(ly + 4), ['cross', 'f2l', 'last layer'][i], { size: 12, fill: T.muted, anchor: sn > 0.3 ? 'start' : sn < -0.3 ? 'end' : 'middle' });
  });
  b += tw(T, cx, cy + 22, String(ACC.all), { size: 88, fill: T.ink, weight: 300, anchor: 'middle', tnum: 1, ls: -2 });
  b += tm(cx, cy + 56, 'accuracy · solid', { size: 14, fill: T.muted, anchor: 'middle' });
  b += tm(64, 628, 'luck and cleverness', { size: 12, fill: T.muted });
  b += badge(T, 'skip', 76, 654, 9) + tw(T, 96, 659, 'EO skip  +6 moves', { size: 14, fill: T.ink, weight: 500 });
  b += badge(T, 'pseudo', 76, 686, 9) + tw(T, 96, 691, 'Pseudo pair 3  +3 moves', { size: 14, fill: T.ink, weight: 500 });
  b += tm(64, 726, 'shown on the graph, not counted in accuracy', { size: 11.5, fill: T.faint });
  const cards = [
    { k: 'cross', a: ACC.cross, vs: '+3', lu: LU.cross, ref: REF.cross, items: [['detour', 'Detour · move 4', -2.0]], best: ['optimal', '7 of 8 moves optimal'] },
    { k: 'f2l', a: ACC.f2l, vs: '−2', lu: LU.f2l, ref: REF.f2l, items: [['betterpair', 'Better pair · pair 1', -1.0], ['pause', 'Pause · pair 2', -1.6], ['cancel', 'Cancel · L′ L', -2.0], ['rotation', 'Rotation · pair 3', -2.0], ['pause', 'Pause · pair 4', -2.4], ['extra', 'Extra moves · pair 4', -3.0]], best: ['pseudo', 'Pseudo pair 3 saved 3 moves'] },
    { k: 'last layer', a: ACC.ll, vs: '+5', lu: LU.ll, ref: REF.ll, items: [['pause', 'Pause inside Aa', -1.3], ['auf', 'Extra AUF · ep', -1.0]], best: ['skip', 'EO skip'] },
  ];
  cards.forEach((c, i) => {
    const x = 560 + i * 272, w = 250;
    b += `<rect x="${x}" y="150" width="${w}" height="640" rx="${T.id === 'mono' ? 8 : 24}" fill="${T.surf}"/>`;
    b += tm(x + 24, 190, c.k, { size: 13, fill: T.muted });
    b += tw(T, x + 24, 262, String(c.a), { size: 72, fill: col(c.a), weight: 300, tnum: 1, ls: -2 });
    b += `<rect x="${x + 24}" y="284" width="${w - 48}" height="6" rx="3" fill="${T.line}"/><rect x="${x + 24}" y="284" width="${(w - 48) * c.a / 100}" height="6" rx="3" fill="${col(c.a)}"/>`;
    b += tm(x + 24, 316, `vs your last 20: ${c.vs}`, { size: 11.5, fill: c.vs.startsWith('+') ? T.good : T.warn });
    b += tm(x + 24, 360, 'where it went', { size: 12, fill: T.muted });
    c.items.forEach(([id, txt, lu], j) => { const y = 392 + j * 34; b += badge(T, id, x + 32, y - 4, 9) + tw(T, x + 52, y, txt, { size: 13, fill: T.ink, weight: 500 }) + tm(x + w - 24, y, `${lu.toFixed(1)}`.replace('-', '−'), { size: 12.5, fill: T.warn, anchor: 'end' }); });
    b += `<line x1="${x + 24}" y1="${392 + Math.max(6, c.items.length) * 34 - 12}" x2="${x + w - 24}" y2="${392 + Math.max(6, c.items.length) * 34 - 12}" stroke="${T.line}"/>`;
    const by = 392 + Math.max(6, c.items.length) * 34 + 12;
    b += tm(x + 24, by + 6, 'where you were really good', { size: 12, fill: T.good });
    b += badge(T, c.best[0], x + 32, by + 34, 9) + tw(T, x + 52, by + 39, c.best[1], { size: 13, fill: T.ink, weight: 500 });
    b += tm(x + 24, 762, `${c.lu.toFixed(1)} lost of par ${c.ref}`.replace('.', '.'), { size: 11, fill: T.faint });
  });
  b += tm(560, 822, 'accuracy = 100 · e^( −moves lost / (1.5 · par) )', { size: 11.5, fill: T.muted }) + tm(560, 842, 'a move lost: an extra move, a cancel, a rotation, or a pause converted to moves', { size: 11.5, fill: T.faint });
  b += O.hints(872, [['tab', 'stage'], ['enter', 'open review'], ['esc', 'close']]);
  return frame(T, b);
}

// ============================================================ R-07 import ============================================================
function importFrame(T) {
  let b = O.topbar();
  b += tm(64, 104, 'review', { size: 13, fill: T.acc, weight: 500, ls: 1 }) + tm(132, 104, 'import a solve', { size: 13, fill: T.muted });
  // tabs
  [['paste text', true], ['file', false], ['alg.cubing.net link (read locally)', false]].forEach(([l, on], i) => { const x = 64 + [0, 120, 190][i]; b += tw(T, x, 148, l, { size: 14, fill: on ? T.ink : T.muted, weight: on ? 700 : 500 }); if (on) b += `<rect x="${x}" y="156" width="${l.length * 7.4}" height="2.4" rx="1.2" fill="${T.acc}"/>`; });
  // editor card
  const ex = 64, ey = 184, ew = 640, eh = 520;
  b += `<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" rx="${T.id === 'mono' ? 8 : 20}" fill="${T.surf}"/>`;
  const code = [
    [['// scramble', 'c']],
    [["D2 F2 U' B2 R2 U2 F2 U' L2 D' B' L' U F' R'", 'm']],
    [["D2 R U' F2 L'", 'm']],
    [['', 'm']],
    [['// solution', 'c']],
    [["F' D' F D B D' R D'", 'm'], ['  // cross (2.08)', 'c']],
    [["R F R U' F' U' R'", 'm'], ['  // pair 1', 'c']],
    [["U' L' U L U' L' L U L", 'm'], ['  // pair 2', 'c']],
    [["y", 'r'], [" D R' U R U' D'", 'm'], ['  // pair 3, pseudo', 'c']],
    [["U F' U' F R U R' U2 R U' R'", 'm'], ['  // pair 4', 'c']],
    [["R U R' U R U2 R'", 'm'], ['  // Sune (EO skip)', 'c']],
    [["Rw U R' U' Rw' F R F'", 'w'], ['  // wide-move alg', 'c']],
    [["M2 U M U2 M' U M2 x'", 's'], ['  // Ua with slices, then rotate', 'c']],
  ];
  code.forEach((segs, i) => {
    const y = ey + 44 + i * 30; b += tm(ex + 22, y, String(i + 1), { size: 12, fill: T.faint, anchor: 'end' });
    let x = ex + 44; segs.forEach(([txt, kind]) => { const lead = txt.length - txt.trimStart().length; x += lead * 8.1; const col = kind === 'c' ? T.faint : kind === 'r' ? T.warn : kind === 'w' ? T.acc : kind === 's' ? T.acc : T.ink; b += tm(f1(x), y, txt.trim(), { size: 13.5, fill: col }); x += monoW(txt.trim(), 13.5); });
  });
  b += tm(ex + 22, ey + eh - 26, `61 tokens · wide moves, slices and rotations are converted`, { size: 11.5, fill: T.muted });
  // right: what I found
  const rx = 744, rw = 632;
  b += tm(rx, 200, 'what I found', { size: 14, fill: T.muted });
  const found = [
    ['check', 'scramble', '20 moves, WCA orientation'],
    ['check', 'solution', `68 turns (4 wide, 2 slices, 3 rotations converted)`],
    ['check', 'it solves the cube', 'ends solved; nothing left over'],
    ['check', 'method', 'CFOP · cross on D · pseudo pairs seen'],
    ['check', 'rotations', 'read from the text (y, x′): rotation labels work'],
    ['pause', 'timing', 'no per-move times · total 14.07 s from the text'],
  ];
  found.forEach(([id, k, v], i) => { const y = 240 + i * 38; b += badge(T, id === 'check' ? 'efficient' : 'pause', rx + 10, y - 5, 10) + tw(T, rx + 34, y, k, { size: 15, fill: T.ink, weight: 700 }) + tm(rx + 170, y, v, { size: 12.5, fill: T.muted }); });
  b += `<line x1="${rx}" y1="480" x2="${rx + rw}" y2="480" stroke="${T.line}"/>`;
  b += tm(rx, 510, 'the review will include', { size: 12, fill: T.good });
  const inc = ['cross optimality and best continuation', 'extra moves and detours', 'cancels', 'pair choice and pseudo pairs', 'skips and X-cross', 'rotations (from the text)', 'PLL case and AUF'];
  inc.forEach((l, i) => { const y = 540 + i * 26; b += badge(T, 'efficient', rx + 10, y - 4, 7.5) + tw(T, rx + 28, y, l, { size: 13, fill: T.ink, weight: 500 }); });
  b += tm(rx + 330, 510, 'needs per-move times, so not here', { size: 12, fill: T.muted });
  ['pause', 'slow recog', 'flow', 'turns per second'].forEach((l, i) => { const y = 540 + i * 26; b += `<circle cx="${rx + 340}" cy="${y - 4}" r="7" fill="none" stroke="${T.faint}" stroke-width="1.3" stroke-dasharray="3 3"/>` + tw(T, rx + 358, y, l, { size: 13, fill: T.faint, weight: 500 }); });
  b += tm(rx + 330, 660, 'the graph uses moves instead of time', { size: 11.5, fill: T.faint });
  b += `<rect x="${rx}" y="728" width="236" height="52" rx="26" fill="${T.acc}"/>` + tw(T, rx + 118, 760, 'Review this solve  →', { size: 16, fill: T.onAcc, weight: 700, anchor: 'middle' });
  b += tm(rx + 256, 760, 'parsed on this device · nothing is uploaded', { size: 12, fill: T.muted });
  b += tm(64, 740, 'also opens your older solves: they have moves but no move times', { size: 12, fill: T.muted });
  b += O.hints(860, [['ctrl v', 'paste'], ['enter', 'review'], ['esc', 'close']]);
  return frame(T, b);
}

// ============================================================ R-06 mobile ============================================================
function mobile(T) {
  const card = (x, y, w, h, r = 18) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${T.surf}"/>`;
  // phone 1: review
  let a = O.mTop();
  a += tm(24, 128, 'review', { size: 12, fill: T.acc, weight: 500 }) + tm(366, 128, 'accuracy 83', { size: 12, fill: T.muted, anchor: 'end' });
  a += cubeC(T, 195, 196, 62, CUBE_BEFORE_4, arrowR(195, 196, 62, T.acc, true));
  a += tm(195, 306, 'move 4 · viewed from below', { size: 11, fill: T.muted, anchor: 'middle' });
  a += avatar(T, 40, 356, 14) + card(62, 330, 304, 158, 16) + `<path d="M62,352 l-8,7 l8,7 Z" fill="${T.surf}"/>`;
  a += badge(T, 'detour', 84, 360, 9) + tw(T, 100, 365, 'Move 4 · D', { size: 14.5, fill: T.ink, weight: 700 }) + tm(352, 365, 'Detour +2', { size: 11.5, fill: T.warn, anchor: 'end' });
  wrap(T, `That turned you away from the cross. Shortest way home from here: R D${PR} F, 3 more. You took 5 (6 vs your 8).`, 268, 13.5).forEach((ln, i) => { a += tw(T, 78, 394 + i * 20, ln, { size: 13.5, fill: T.ink, weight: 500 }); });
  a += tm(78, 472, `R D${PR} F`, { size: 14, fill: T.acc, weight: 500 }) + tm(150, 472, 'show best move', { size: 11.5, fill: T.muted });
  a += stepControls(T, 195, 536).replace(/<circle cx="(\d+(\.\d+)?)" cy="536" r="18"/g, (m0, cx0) => `<circle cx="${cx0}" cy="536" r="18"`);
  a += tm(195, 584, 'move 4 of 68 · 0.70 s', { size: 12, fill: T.muted, anchor: 'middle' });
  const gm = solveGraph(T, 44, 620, 322, 92, { cursor: 0.70, noPauseLabels: true });
  a += gm.svg.replace(/font-size="11"/g, 'font-size="9"') + pins(T, gm.X, 606, 1).replace(/r="10"/g, 'r="8"');
  a += `<rect x="24" y="764" width="342" height="52" rx="26" fill="${T.acc}"/>` + tw(T, 195, 796, 'Retry this moment', { size: 16, fill: T.onAcc, weight: 700, anchor: 'middle' });
  // phone 2: move list + key moments
  let s = O.mTop();
  s += tm(24, 128, 'moves', { size: 12, fill: T.muted }) + tm(366, 128, 'tap a move', { size: 11, fill: T.faint, anchor: 'end' });
  const mrows = ROWS.slice(0, 6);
  mrows.forEach((r, ri) => {
    const y = 160 + ri * 44; s += tm(24, y + 4, r.label, { size: 11, fill: T.muted });
    let cx = 78; const maxChips = Math.min(r.mv.length, 8);
    r.mv.slice(0, maxChips).forEach(([m, id]) => { const w = chipW(m) - 4; const notable = id !== 'fine' && id !== 'optimal'; s += `<rect x="${cx}" y="${y - 12}" width="${w}" height="24" rx="6" fill="${T.surf}"${ri === 0 && m === 'D' && id === 'detour' ? ` stroke="${T.acc}" stroke-width="1.5"` : ''}/>` + tm(cx + w / 2, y + 4.5, mv(m), { size: 11.5, fill: id === 'fine' || id === 'optimal' ? T.ink : toneOf(T, id), anchor: 'middle' }); if (id === 'optimal') s += `<rect x="${cx + 4}" y="${y + 8}" width="${w - 8}" height="2" rx="1" fill="${T.good}"/>`; else if (notable) s += badge(T, id, cx + w - 1, y - 12, 5.5); cx += w + 3; });
    if (r.skip) s += badge(T, 'skip', 88, y, 9) + tw(T, 104, y + 4, 'EO skip', { size: 12, fill: T.good, weight: 600 });
    if (r.mv.length > maxChips) s += tm(cx + 2, y + 4, '…', { size: 12, fill: T.muted });
    if (STAGE_ACC[ri] != null) s += tm(366, y + 4, String(STAGE_ACC[ri]), { size: 12, fill: STAGE_ACC[ri] >= 88 ? T.good : STAGE_ACC[ri] >= 75 ? T.ink : T.warn, anchor: 'end' });
  });
  s += tm(24, 446, 'key moments', { size: 12, fill: T.muted });
  KEYMOMENTS.forEach((k, i) => { const y = 466 + i * 58, on = i === 0, col = toneOf(T, k.b, false); s += `<rect x="24" y="${y}" width="342" height="48" rx="14" fill="${T.surf}"${on ? ` stroke="${T.acc}" stroke-width="1.5"` : ''}/><circle cx="46" cy="${y + 24}" r="10" fill="${on ? col : T.bg}" stroke="${col}" stroke-width="1.6"/>` + tm(46, y + 28, String(k.n), { size: 11.5, fill: on ? T.onAcc : col, weight: 600, anchor: 'middle' }) + tw(T, 66, y + 21, k.title, { size: 13.5, fill: T.ink, weight: 700 }) + tm(66, y + 38, k.sub, { size: 11, fill: T.muted }) + badge(T, k.b, 340, y + 24, 10); });
  s += `<rect x="24" y="764" width="342" height="52" rx="26" fill="none" stroke="${T.line}" stroke-width="1.4"/>` + tw(T, 195, 796, 'Show accuracy by stage', { size: 15, fill: T.ink, weight: 700, anchor: 'middle' });
  // phone 3: retry
  let r = O.mTop();
  r += tm(24, 128, 'retry · move 4', { size: 12, fill: T.acc, weight: 500 });
  r += tw(T, 24, 168, 'Your turn', { size: 24, fill: T.ink, weight: 700 });
  r += `<rect x="24" y="184" width="152" height="26" rx="13" fill="${T.accSoft}"/>` + tm(100, 202, 'finish the cross', { size: 12, fill: T.acc, weight: 500, anchor: 'middle' }) + tm(366, 202, 'best: 3 more', { size: 11.5, fill: T.muted, anchor: 'end' });
  r += cubeC(T, 195, 290, 66, CUBE_AFTER_R);
  r += tw(T, 195, 432, '0.61', { size: 64, fill: T.ink, weight: 300, anchor: 'middle', tnum: 1, ls: -2 });
  // on-screen pad (no smart cube)
  r += tm(24, 470, 'no cube connected: use the pad', { size: 11.5, fill: T.muted });
  const padM = ['U', 'D', 'R', 'L', 'F', 'B'];
  padM.forEach((m, i) => { const x = 24 + i * 58, y = 486; r += `<rect x="${x}" y="${y}" width="52" height="44" rx="12" fill="${T.surf2}"/>` + tm(x + 26, y + 28, m, { size: 17, fill: T.ink, weight: 500, anchor: 'middle' }); r += `<rect x="${x}" y="${y + 50}" width="25" height="36" rx="9" fill="${T.surf}"/>` + tm(x + 12.5, y + 74, PR, { size: 19, fill: T.muted, anchor: 'middle' }) + `<rect x="${x + 27}" y="${y + 50}" width="25" height="36" rx="9" fill="${T.surf}"/>` + tm(x + 39.5, y + 73, '2', { size: 14, fill: T.muted, anchor: 'middle' }); });
  r += tm(24, 648, 'your moves', { size: 11.5, fill: T.muted });
  [['R', 'optimal']].forEach(([m, id], i) => { const x = 24 + i * 68; r += `<rect x="${x}" y="660" width="60" height="34" rx="9" fill="${T.surf2}"/>` + tm(x + 30, 683, m, { size: 15, fill: T.ink, anchor: 'middle' }) + badge(T, id, x + 54, 660, 8); });
  r += `<rect x="24" y="764" width="342" height="52" rx="26" fill="none" stroke="${T.line}" stroke-width="1.4"/>` + tw(T, 195, 796, 'Give up', { size: 15, fill: T.ink, weight: 700, anchor: 'middle' });
  let bb = tm(64, 48, 'orbit · portrait · review', { size: 14, fill: T.muted });
  bb += O.phone(84, 80, a, 'review · coach bubble, graph, retry') + O.phone(525, 80, s, 'moves with badges · key moments') + O.phone(966, 80, r, 'retry · cube or on-screen pad');
  return frame(T, bb, 1440, 960, T.canvas);
}

// ============================================================ R-09 the drill, with the way back ============================================================
function drillReturn(T) {
  let b = O.topbar(W, 'trainers');
  b += `<rect x="${W - 330}" y="24" width="300" height="34" fill="${T.bg}"/>`;
  b += `<rect x="${W - 320}" y="26" width="268" height="32" rx="16" fill="${T.accSoft}"/>` + tm(W - 186, 47, '←  review · solve 23 · move 53', { size: 12.5, fill: T.acc, weight: 500, anchor: 'middle' });
  b += tm(W / 2, 104, 'pll · mix · cases Aa Ab E · 20 cases · glance off · from review', { size: 13, fill: T.acc, anchor: 'middle' });
  const cx = 720, cy = 430, r = 190;
  for (let i = 0; i < 20; i++) { const a0 = i * 18 + 1.6, a1 = (i + 1) * 18 - 1.6; const done = i < 3; b += arc(cx, cy, r, a0, a1, done ? (i === 1 ? T.warn : T.ink) : T.line, done ? 6 : 3); }
  const [dx, dy] = polar(cx, cy, r, 3 * 18 + 9); b += circle(dx, dy, 9, T.accSoft) + circle(dx, dy, 5, T.acc);
  b += cubeC(T, cx, cy, 96, LL_STATE);
  b += tw(T, cx, 706, 'Which case?', { size: 30, fill: T.ink, weight: 700, anchor: 'middle' });
  ['Aa', 'Ab', 'E'].forEach((n, i) => { const x = cx - 204 + i * 140; b += `<rect x="${x}" y="732" width="128" height="52" rx="26" fill="${T.surf}" stroke="${T.line}"/>` + tw(T, x + 50, 765, n, { size: 19, fill: T.ink, weight: 600, anchor: 'middle' }) + `<rect x="${x + 86}" y="750" width="22" height="20" rx="5" fill="${T.surf2}"/>` + tm(x + 97, 764, String(i + 1), { size: 11, fill: T.ink, anchor: 'middle' }); });
  b += tm(64, 190, 'from your review', { size: 12, fill: T.muted });
  b += tw(T, 64, 222, 'Aa stopped you for 0.6 s', { size: 20, fill: T.ink, weight: 700 });
  b += tm(64, 250, 'in the middle of the alg · move 53', { size: 12, fill: T.muted });
  b += tm(64, 300, 'after this round', { size: 12, fill: T.muted });
  b += tw(T, 64, 330, 'back to your review', { size: 15, fill: T.ink, weight: 600 }) + tm(64, 352, 'with the result shown on the Aa label', { size: 12, fill: T.muted });
  b += pillBtn(T, 64, 372, 200, 38, '←  back to review', { size: 13.5 });
  b += O.hints(860, [['1 2 3', 'answer'], ['s', 'skip'], ['b', '← review'], ['esc', 'settings']]);
  return frame(T, b);
}

const write = (name, content) => { fs.writeFileSync(`${OUT}/${name}`, content); console.log('wrote', name, (content.length / 1024).toFixed(0) + 'KB'); };
write('R-dark-00-badges.svg', badges(ORBIT));
write('R-dark-01-results.svg', results(ORBIT));
write('R-dark-02-review.svg', review(ORBIT));
write('R-dark-03-tooltip.svg', review(ORBIT, { hover: [0, 3], tooltip: true }));
write('R-dark-04-retry.svg', retry(ORBIT));
write('R-dark-05-accuracy.svg', accuracy(ORBIT));
write('R-dark-06-mobile.svg', mobile(ORBIT));
write('R-dark-07-import.svg', importFrame(ORBIT));
write('R-mono-dark-02-review.svg', review(MONOT));
write('R-dark-08-drill-link.svg', review(ORBIT, { scene: 'aa', popover: true, linkHover: 'Aa' }));
write('R-dark-09-drill-return.svg', drillReturn(ORBIT));
