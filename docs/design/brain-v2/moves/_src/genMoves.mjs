// Move & algorithm guide mockups. usage (from docs/design/brain-v2/moves):
//   node _src/genMoves.mjs && node _src/render.mjs
import fs from 'fs';
import { svg, t, esc } from '../../_src/lib.mjs';
import { THEMES, MONO, SANS, guidedCube, cubeSVG, moveArrows, arrow, netSVG, netSize, ollSVG, chip, describeMove, pill, pillW, mix, f1, FINGER, pathD, centerColors } from './draw.mjs';
import { parseMove, inv, solved, apply, makeCam, camFor, heldMap, add, mul, dot } from './geom.mjs';

const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const write = (name, th, w, h, body) => { fs.writeFileSync(`${OUT}/${name}.svg`, svg(w, h, body, { bg: th.bg, fonts: th.fonts })); console.log('wrote', name); };
const tx = (x, y, s, o) => t(x, y, s, { family: MONO, ...o });
const wrap = (s, n) => { const out = []; let cur = ''; for (const w of s.split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; };
const invSeq = seq => seq.slice().reverse().map(inv);

// ---------- the five example sequences (same in every approach) ----------
const SCR = "D2 F2 U' B2 R2 U2 F2 U' L2 D' B' L' U F' R' D2 R U' F2 L'".split(' ');
const T = "R U R' U' R' F R2 U' R' U' R U R' F'".split(' ');
const EX = [
  { key: 'scramble', title: 'guided scramble', sub: 'current move R\'', seq: SCR, idx: 14, scramble: true, held: { bottom: 'D', front: 'F' }, groups: null },
  { key: 'tperm', title: 'T-perm (PLL)', sub: 'trainer, yellow on top', seq: T, idx: 6, held: { bottom: 'U', front: 'F' }, groups: [[0, 3, 'sexy move'], [4, 9, ''], [10, 13, '']] },
  { key: 'rot', title: 'rotation, then a trigger', sub: "y' then R U R'", seq: ["y'", 'R', 'U', "R'"], idx: 0, held: { bottom: 'D', front: 'F' }, groups: [[1, 3, 'trigger']] },
  { key: 'wide', title: 'wide move', sub: "r U R' U' r' F R F'", seq: "r U R' U' r' F R F'".split(' '), idx: 0, held: { bottom: 'D', front: 'F' }, groups: [[0, 3, ''], [4, 7, '']] },
  { key: 'slice', title: 'slice', sub: "M' U M", seq: ["M'", 'U', 'M'], idx: 0, held: { bottom: 'D', front: 'F' }, groups: null },
];
for (const e of EX) {
  const start = e.scramble ? solved() : apply(solved(), invSeq(e.seq));
  e.state = apply(start, e.seq.slice(0, e.idx));
  e.after = apply(e.state, [e.seq[e.idx]]);
  e.move = e.seq[e.idx];
  e.d = describeMove(e.move, e.held, e.state);
}

function header(th, title, sub, w) {
  let s = '';
  s += t(60, 66, title, { size: th.style === 'orbit' ? 28 : 22, fill: th.ink, family: th.font, weight: th.style === 'orbit' ? 700 : 400 });
  s += tx(60, 94, sub, { size: 13, fill: th.muted });
  s += `<line x1="60" y1="116" x2="${w - 60}" y2="116" stroke="${th.hair}"/>`;
  return s;
}
// sequence as wrapped mono tokens with the current one marked
function seqText(x, y, seq, idx, th, { size = 15, width = 420, from = 0 } = {}) {
  const cw = size * 0.6; let cx = x, cy = y, s = '';
  seq.forEach((m, i) => {
    const w = (m.length + 1) * cw;
    if (cx + w - cw > x + width) { cx = x; cy += size * 1.7; }
    if (i === idx) s += `<rect x="${f1(cx - 4)}" y="${f1(cy - size * 0.95)}" width="${f1(m.length * cw + 8)}" height="${f1(size * 1.35)}" rx="4" fill="${th.acc}"/>`;
    s += tx(f1(cx), cy, m, { size, fill: i === idx ? th.onAcc : i < idx ? th.faint : th.ink, weight: i === idx ? 500 : 400 });
    cx += w;
  });
  return { svg: s, bottom: cy };
}
function kindLabel(mv) {
  return mv.kind === 'rot' ? 'whole-cube rotation' : mv.kind === 'wide' ? 'wide · two layers' : mv.kind === 'slice' ? 'slice · middle layer' : mv.double ? 'face · half turn' : mv.prime ? 'face · counterclockwise' : 'face · clockwise';
}
function textBlock(x, y, e, th, o = {}) {
  let s = '';
  const mv = e.d.mv;
  s += pill(x, y, kindLabel(mv), th, { size: 11 });
  const lines = wrap(e.d.text, o.chars ?? 50);
  lines.forEach((l, i) => { s += t(x, y + 34 + i * 21, l, { size: 14, fill: th.ink, family: th.font, weight: th.style === 'orbit' ? 500 : 400 }); });
  let yy = y + 34 + lines.length * 21 + 12;
  const f = FINGER[e.move];
  if (f && o.finger !== false) { s += tx(x, yy, 'fingers', { size: 11, fill: th.muted }); s += tx(x + 64, yy, f, { size: 12, fill: th.accText }); yy += 22; }
  return { svg: s, bottom: yy };
}
function viewNote(mv) { return (mv.kind === 'face' || mv.kind === 'wide') && 'LBD'.includes(mv.letter); }
function exHead(x, y, e, i, th) {
  let s = tx(x, y, `${i + 1} · ${e.title}`, { size: 12, fill: th.accText });
  s += tx(x, y + 22, `move ${e.idx + 1} of ${e.seq.length}${e.scramble ? '' : ''}`, { size: 11, fill: th.muted });
  const q = seqText(x, y + 54, e.seq.length > 14 && e.scramble ? e.seq.slice(Math.max(0, e.idx - 6), e.idx + 7) : e.seq, e.scramble ? Math.min(e.idx, 6) : e.idx, th, { size: 15, width: 400 });
  return { svg: s + q.svg, bottom: q.bottom };
}
// dashed "lands here" outline: hull of the rest position of the layer slab
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function ghostHull(mv, cam, th) {
  const lo = Math.min(...mv.layers) - 0.5, hi = Math.max(...mv.layers) + 0.5;
  const pts = [];
  for (const a of [lo, hi]) for (const b of [-1.5, 1.5]) for (const c of [-1.5, 1.5]) { const p = [0, 0, 0]; const o = [0, 1, 2].filter(i => i !== mv.ax); p[mv.ax] = a; p[o[0]] = b; p[o[1]] = c; pts.push(cam.P(p)); }
  const h = hull(pts);
  return `<path d="${pathD(h)}Z" fill="none" stroke="${th.acc}" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round"/>`;
}
// approach B drawing: layer lifted and mid-turn, dashed landing outline, arrow overlay
function ghostCube(cx, cy, S, th, state, moveStr, o = {}) {
  const mv = parseMove(moveStr);
  const cam = makeCam(camFor(mv), S, cx, cy);
  let s = '';
  s += th.dark ? `<ellipse cx="${cx}" cy="${f1(cy + S * 2.5)}" rx="${S * 1.9}" ry="${S * 0.36}" fill="${th.acc}" opacity=".10"/>` : `<ellipse cx="${cx}" cy="${f1(cy + S * 2.5)}" rx="${S * 1.9}" ry="${S * 0.3}" fill="#1c1b18" opacity=".07"/>`;
  s += ghostHull(mv, cam, th);
  const lift = mv.kind === 'face' || mv.kind === 'wide' ? 0.3 : 0;
  const frac = o.frac ?? (mv.double ? 0.2 : mv.kind === 'slice' ? 0.13 : mv.kind === 'rot' ? 0.3 : 0.34);
  s += cubeSVG(state, { cam, th, held: o.held, layerMv: mv, dim: mv.kind !== 'rot', frac, lift });
  if (o.arrows !== false) s += moveArrows(mv, cam, th, { belt: false, w: S * 0.1 });
  return s;
}

// ===================== M-03 approach A: arrows on the iso cube =====================
function frameA(th, name) {
  const W = 1440, H = 1420;
  let s = header(th, 'Move guide · A  arrows on an isometric cube', 'curved arrow on the turning face, thin flow arrows on the side faces, the layer lit and everything else dimmed · same five examples as B, C, D', W);
  EX.forEach((e, i) => {
    const y0 = 150 + i * 252;
    const h = exHead(60, y0 + 24, e, i, th); s += h.svg;
    const cx = 690, cy = y0 + 122;
    s += guidedCube(cx, cy, 44, th, e.state, e.move, { held: e.held });
    if (viewNote(e.d.mv)) s += tx(cx, y0 + 244, 'seen from below-left-back (hidden face)', { size: 11, fill: th.muted, anchor: 'middle' });
    s += textBlock(930, y0 + 40, e, th, { chars: 44 }).svg;
    if (i < 4) s += `<line x1="60" y1="${y0 + 250}" x2="${W - 60}" y2="${y0 + 250}" stroke="${th.hair}" stroke-opacity=".6"/>`;
  });
  write(name, th, W, H, s);
}

// ===================== M-04 approach B: live 3D ghost =====================
function frameB(th, name) {
  const W = 1440, H = 1420;
  let s = header(th, 'Move guide · B  3D ghost on the real cube', 'the layer lifts and turns in a loop on the cube the user is holding (static frame = mid-turn) · before, mid-turn, after · arrow overlay optional', W);
  EX.forEach((e, i) => {
    const y0 = 150 + i * 252;
    s += exHead(60, y0 + 24, e, i, th).svg;
    s += guidedCube(520, y0 + 120, 26, th, e.state, e.move, { held: e.held, arrows: false });
    s += tx(520, y0 + 232, 'now', { size: 11, fill: th.muted, anchor: 'middle' });
    s += ghostCube(720, y0 + 112, 40, th, e.state, e.move, { held: e.held });
    s += tx(720, y0 + 243, 'turning (loops, 0.9 s)', { size: 11, fill: th.accText, anchor: 'middle' });
    s += guidedCube(920, y0 + 120, 26, th, e.after, e.move, { held: e.held, arrows: false });
    s += tx(920, y0 + 232, 'after', { size: 11, fill: th.muted, anchor: 'middle' });
    s += `<text x="620" y="${y0 + 128}" font-size="18" fill="${th.faint}" font-family="${MONO}" text-anchor="middle">→</text><text x="820" y="${y0 + 128}" font-size="18" fill="${th.faint}" font-family="${MONO}" text-anchor="middle">→</text>`;
    s += textBlock(1020, y0 + 40, e, th, { chars: 36, finger: false }).svg;
    if (i < 4) s += `<line x1="60" y1="${y0 + 250}" x2="${W - 60}" y2="${y0 + 250}" stroke="${th.hair}" stroke-opacity=".6"/>`;
  });
  write(name, th, W, H, s);
}

// ===================== chips strip =====================
// returns { svg, cx (centre of current chip), bottom }
export function chipStrip(x0, mid, seq, idx, th, { groups = null, win = null, maxW = 1320, fix = null } = {}) {
  let lo = 0, hi = seq.length - 1;
  if (win) { lo = Math.max(0, idx - win[0]); hi = Math.min(seq.length - 1, idx + win[1]); }
  const gOf = i => (groups || []).findIndex(([a, b]) => i >= a && i <= b);
  let x = x0, s = '', pos = {};
  if (lo > 0) { s += tx(x, mid + 4, '…', { size: 16, fill: th.faint }); x += 22; }
  for (let i = lo; i <= hi; i++) {
    const status = i < idx ? 'done' : i === idx ? 'current' : 'next';
    const big = status === 'current';
    const c = chip(x, mid - (big ? 75 : 41), seq[i], th, { status: fix && i === idx ? 'fix' : status });
    s += c.svg; pos[i] = [x, c.w];
    x += c.w + (i < hi && gOf(i) !== gOf(i + 1) ? 16 : 6);
  }
  if (hi < seq.length - 1) s += tx(x + 4, mid + 4, '…', { size: 16, fill: th.faint });
  // group brackets under the chips
  let bottom = mid + 52;
  (groups || []).forEach(([a, b, label]) => {
    if (!pos[a] || !pos[b]) return;
    const xa = pos[a][0], xb = pos[b][0] + pos[b][1];
    const yb = mid + 82;
    s += `<path d="M${f1(xa)} ${yb - 6} V${yb} H${f1(xb)} V${yb - 6}" fill="none" stroke="${th.muted}" stroke-width="1"/>`;
    if (label) s += tx(f1((xa + xb) / 2), yb + 17, label, { size: 11, fill: th.accText, anchor: 'middle' });
    bottom = yb + 22;
  });
  const cur = pos[idx];
  return { svg: s, cx: cur ? cur[0] + cur[1] / 2 : x0, end: x, bottom };
}

// ===================== M-05 approach C: chips =====================
function frameC(th, name) {
  const W = 1440, H = 1440;
  let s = header(th, 'Move guide · C  move chips', 'one glyph per move: schematic cube, turning layer lit, arrow for the sense · current chip enlarged · triggers bracketed · fingertricks for the current move', W);
  EX.forEach((e, i) => {
    const y0 = 136 + i * 256;
    s += tx(60, y0 + 28, `${i + 1} · ${e.title}`, { size: 12, fill: th.accText });
    s += tx(60, y0 + 48, `move ${e.idx + 1} of ${e.seq.length}`, { size: 11, fill: th.muted });
    const mid = y0 + 140;
    const strip = chipStrip(60, mid, e.seq, e.idx, th, { groups: e.scramble ? null : e.groups, win: e.scramble ? [4, 6] : null });
    // the window for the scramble shifts group indices; scramble has no groups
    s += strip.svg;
    // right-hand text for the current chip
    const tb = Math.max(strip.end + 30, 1000);
    const f = FINGER[e.move];
    const lines = wrap(e.d.text, 40);
    const tx0 = 1040;
    lines.forEach((l, k) => { s += t(tx0, y0 + 96 + k * 20, l, { size: 13, fill: th.ink, family: th.font, weight: th.style === 'orbit' ? 500 : 400 }); });
    if (f) { s += tx(tx0, y0 + 96 + lines.length * 20 + 14, 'fingers', { size: 11, fill: th.muted }); s += tx(tx0 + 64, y0 + 96 + lines.length * 20 + 14, f, { size: 11, fill: th.accText }); }
    s += pill(tx0, y0 + 64, kindLabel(e.d.mv), th, { size: 10 });
    if (i < 4) s += `<line x1="60" y1="${y0 + 244}" x2="${W - 60}" y2="${y0 + 244}" stroke="${th.hair}" stroke-opacity=".6"/>`;
  });
  write(name, th, W, H, s);
}

// ===================== M-06 approach D: net + top-down =====================
function frameD(th, name) {
  const W = 1440, H = 1500;
  let s = header(th, 'Move guide · D  unfolded net and top-down (OLL) view', 'every face is seen from outside, so a clockwise arrow on a face IS clockwise · flow arrows on the four side faces · last-layer top-down view with the side strips', W);
  const u = 21; const [nw, nh] = netSize(u);
  EX.forEach((e, i) => {
    const y0 = 140 + i * 272;
    s += exHead(60, y0 + 24, e, i, th).svg;
    s += netSVG(450, y0 + 24, u, th, e.state, e.move, { held: e.held });
    // top-down view
    const o = ollSVG(870, y0 + 100, 34, th, e.state, e.move, { held: e.held });
    s += o.svg;
    s += tx(870, y0 + 204, o.note || 'top-down · F at the bottom', { size: 11, fill: o.note ? th.warnText : th.muted, anchor: 'middle' });
    s += tx(450 + nw / 2, y0 + 24 + nh + 22, 'net · U centre, F below', { size: 11, fill: th.muted, anchor: 'middle' });
    s += textBlock(1040, y0 + 40, e, th, { chars: 36, finger: false }).svg;
    if (i < 4) s += `<line x1="60" y1="${y0 + 266}" x2="${W - 60}" y2="${y0 + 266}" stroke="${th.hair}" stroke-opacity=".6"/>`;
  });
  write(name, th, W, H, s);
}

// ===================== M-01 vocabulary =====================
function frameVocab(th, name) {
  const W = 1440, H = 880;
  let s = header(th, 'Move vocabulary · how every kind of move is drawn', 'solid arrow on a lit layer = turn · dashed ring = whole cube · two heads = half turn · arrow direction = prime · hidden faces are shown from the other corner', W);
  const cells = [
    ['R', 'face · clockwise', 'seen from the right'], ["R'", 'face · counterclockwise', 'arrow reversed'], ['R2', 'face · half turn', 'two heads'],
    ['U', 'face · clockwise', 'seen from above'], ["F'", 'face · counterclockwise', 'seen from the front'], ['L', 'face · hidden face', 'view from below-left'],
    ['Rw', 'wide · two layers', 'R + middle layer'], ["M'", 'slice · middle layer', 'flow arrows only'], ['E2', 'slice · half turn', 'equator, two heads'],
    ['x', 'rotation · like R', 'dashed ring'], ["y'", 'rotation · like U′', 'ring round vertical'], ['z2', 'rotation · half turn', 'two heads'],
  ];
  cells.forEach(([m, k, cap], i) => {
    const col = i % 6, row = Math.floor(i / 6);
    const cx = 60 + 112 + col * 232, y0 = 150 + row * 330;
    const st = apply(solved(), ['F', 'R', "U'", 'B', 'L2']);
    s += guidedCube(cx, y0 + 112, 32, th, st, m, {});
    s += tx(cx, y0 + 228, m, { size: 24, fill: th.ink, anchor: 'middle', weight: 500 });
    s += tx(cx, y0 + 252, k, { size: 11, fill: th.accText, anchor: 'middle' });
    s += tx(cx, y0 + 270, cap, { size: 10, fill: th.muted, anchor: 'middle' });
  });
  write(name, th, W, H, s);
}

// ===================== M-02 orientation =====================
function frameOrient(th, name) {
  const W = 1440, H = 830;
  let s = header(th, 'Move guide · the held orientation', 'the same physical action, the face with the RED centre turned clockwise, is called R, F or L depending on how the cube is held · bottom/front come from the gyro', W);
  const holds = [
    { held: { bottom: 'D', front: 'F' }, label: 'white on top, green in front' },
    { held: { bottom: 'D', front: 'R' }, label: 'white on top, red in front' },
    { held: { bottom: 'U', front: 'F' }, label: 'yellow on top, green in front' },
  ];
  holds.forEach((hd, i) => {
    const hm = heldMap(hd.held.bottom, hd.held.front);
    const redLetter = Object.entries(hm.color).find(([, c]) => c === 'red')[0];
    const cx = 60 + 220 + i * 440;
    s += tx(cx, 160, `hold ${i + 1}`, { size: 12, fill: th.accText, anchor: 'middle' });
    s += t(cx, 190, hd.label, { size: 16, fill: th.ink, family: th.font, weight: th.style === 'orbit' ? 600 : 400, anchor: 'middle' });
    s += tx(cx, 212, `bottom ${hd.held.bottom} · front ${hd.held.front}`, { size: 11, fill: th.muted, anchor: 'middle' });
    const st = apply(solved(), ['F', 'R', "U'"]).map(q => q);
    s += guidedCube(cx, 350, 44, th, solved(), redLetter, { held: hd.held });
    s += tx(cx, 530, redLetter, { size: 64, fill: th.ink, anchor: 'middle', weight: 300 });
    const d = describeMove(redLetter, hd.held);
    wrap(d.text, 46).forEach((l, k) => { s += t(cx, 566 + k * 20, l, { size: 13, fill: th.ink, family: th.font, anchor: "middle" }); });
    s += tx(cx, 626, `top ${hm.color.U} · front ${hm.color.F} · right ${hm.color.R}`, { size: 11, fill: th.muted, anchor: 'middle' });
    s += tx(cx, 646, `${hm.color.L} left · ${hm.color.B} back · ${hm.color.D} bottom`, { size: 11, fill: th.muted, anchor: 'middle' });
    if ('LBD'.includes(redLetter)) s += tx(cx, 676, 'hidden face: the view swings to below-left-back', { size: 11, fill: th.warnText, anchor: 'middle' });
  });
  s += tx(60, 740, 'rule 1  the letter names the face by where it is now (U = top, F = front, R = right), not by its colour', { size: 12, fill: th.muted });
  s += tx(60, 764, 'rule 2  the words add the colour of that face\'s centre, so the user can match it on the real cube', { size: 12, fill: th.muted });
  s += tx(60, 788, 'rule 3  after a rotation (x y z) the held orientation changes; later moves are drawn and named in the new frame', { size: 12, fill: th.muted });
  write(name, th, W, H, s);
}

// ===================== combined composition (recommended) =====================
function ring(cx, cy, r, n, idx, th, groups) {
  let s = '';
  const gapDeg = 3, bigGap = 7;
  const gOf = i => (groups || []).findIndex(([a, b]) => i >= a && i <= b);
  // angular layout with bigger gaps between groups
  const gaps = Array.from({ length: n }, (_, i) => (groups && gOf(i) !== gOf((i + 1) % n)) ? bigGap : gapDeg);
  const total = 360 - gaps.reduce((a, b) => a + b, 0);
  const seg = total / n;
  let a = -90 + gaps[n - 1] / 2;
  const P = (deg, rr = r) => [cx + rr * Math.cos(deg * Math.PI / 180), cy + rr * Math.sin(deg * Math.PI / 180)];
  for (let i = 0; i < n; i++) {
    const a0 = a, a1 = a + seg; a = a1 + gaps[i];
    const p0 = P(a0), p1 = P(a1);
    const col = i < idx ? th.ink : i === idx ? th.acc : th.track;
    const sw = i < idx ? 6 : i === idx ? 8 : 3;
    s += `<path d="M${f1(p0[0])} ${f1(p0[1])} A${r} ${r} 0 0 1 ${f1(p1[0])} ${f1(p1[1])}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
    if (i === idx) { const pm = P((a0 + a1) / 2); s += `<circle cx="${f1(pm[0])}" cy="${f1(pm[1])}" r="8" fill="${th.bg}" stroke="${th.acc}" stroke-width="3"/>`; }
  }
  return s;
}
function monoSeqLine(x, y, seq, idx, th, width) {
  // monkeytype-like word stream: done dim, current accent with caret bar, next muted
  const size = 30, cw = size * 0.6; let cx = x, cy = y, s = '';
  seq.forEach((m, i) => {
    const w = (m.length + 1) * cw;
    if (cx + w - cw > x + width) { cx = x; cy += 46; }
    s += tx(f1(cx), cy, m, { size, fill: i < idx ? th.faint : i === idx ? th.accText : th.muted, weight: i === idx ? 500 : 400 });
    if (i === idx) s += `<rect x="${f1(cx)}" y="${cy + 9}" width="${f1(m.length * cw)}" height="3" fill="${th.acc}"/>`;
    cx += w;
  });
  return s;
}
function combined(th, name, e, opt = {}) {
  const W = 1440, H = 900;
  const orbit = th.style === 'orbit';
  let s = '';
  const held = e.held, hm = heldMap(held.bottom, held.front);
  const mv = e.d.mv;
  s += t(48, 48, 'cubesight', { size: 20, fill: th.ink, family: th.font, weight: orbit ? 700 : 500 });
  s += tx(200, 48, 'brain', { size: 14, fill: th.ink, weight: 500 }) + tx(262, 48, 'history', { size: 14, fill: th.muted }) + tx(340, 48, 'trainers', { size: 14, fill: th.muted });
  s += `<circle cx="1224" cy="44" r="3.5" fill="${th.acc}"/>` + tx(1236, 48, 'GAN 356 i3', { size: 12, fill: th.muted });
  const kicker = opt.kicker;
  const cx = orbit ? 470 : 430, cy = orbit ? 388 : 372;
  if (orbit) s += ring(cx, cy, 236, e.seq.length, e.idx, th, e.groups);
  // 3D ghost on the real cube, arrows on top
  s += ghostCube(cx, cy - 6, 50, th, e.state, e.move, { held });
  const viewTxt = viewNote(mv) ? 'view: below-left-back' : null;
  if (viewTxt) s += tx(cx, cy + 172, viewTxt, { size: 11, fill: th.muted, anchor: 'middle' });
  // right column
  const rx = orbit ? 880 : 800;
  s += tx(rx, 150, kicker, { size: 13, fill: th.accText });
  if (!orbit) s += monoSeqLine(120, 120, [], 0, th, 0);
  s += tx(rx, 290, e.move, { size: orbit ? 132 : 120, fill: th.ink, weight: 300, family: orbit ? SANS : MONO, ...(orbit ? { family: SANS } : {}) });
  const sym = e.d.sym;
  s += t(rx + e.move.length * 48 + 64, 276, sym, { size: 56, fill: th.acc, family: th.font });
  const lines = wrap(e.d.text, orbit ? 42 : 46);
  lines.forEach((l, i) => { s += t(rx, 338 + i * 26, l, { size: 18, fill: th.ink, family: th.font, weight: orbit ? 500 : 400 }); });
  let y = 338 + lines.length * 26 + 18;
  s += pill(rx, y, kindLabel(mv), th, { size: 11 }); y += 40;
  const f = FINGER[e.move]; if (f) { s += tx(rx, y, 'fingers', { size: 12, fill: th.muted }); s += tx(rx + 70, y, f, { size: 13, fill: th.accText }); y += 30; }
  const cc = centerColors(e.state, held);
  s += tx(rx, y, 'you hold', { size: 12, fill: th.muted }); s += tx(rx + 70, y, `${cc.U} on top · ${cc.F} in front`, { size: 13, fill: th.ink });
  const dot = (x, c) => `<circle cx="${x}" cy="${y - 4}" r="5" fill="${th.pal[c]}" stroke="${th.body}" stroke-width="1"/>`;
  y += 26;
  s += tx(rx, y, 'turn', { size: 12, fill: th.muted }); s += tx(rx + 70, y, `the ${cc[mv.kind === 'rot' || mv.kind === 'slice' ? { x: 'R', y: 'U', z: 'F', M: 'L', E: 'D', S: 'F' }[mv.letter] : mv.letter].toLowerCase()}-centre side`, { size: 13, fill: th.ink });
  // chips strip
  const strip = chipStrip(orbit ? 60 : 60, 772, e.seq, e.idx, th, { groups: e.scramble ? null : e.groups, win: e.scramble ? [5, 6] : null });
  s += strip.svg;
  s += `<line x1="60" y1="668" x2="${W - 60}" y2="668" stroke="${th.hair}" stroke-opacity=".6"/>`;
  // key hints
  const keys = [['space', 'next'], ['←', 'back'], ['g', 'ghost on/off'], ['f', 'fingers']];
  let kx = 1000;
  keys.forEach(([k, l]) => { s += `<rect x="${kx}" y="722" width="${k.length * 8 + 14}" height="22" rx="${th.radius}" fill="${th.keyBg}"/>` + tx(kx + (k.length * 8 + 14) / 2, 737, k, { size: 11, fill: th.keyInk, anchor: 'middle' }) + tx(kx + k.length * 8 + 22, 737, l, { size: 11, fill: th.muted }); kx += k.length * 8 + 22 + l.length * 6.6 + 18; });
  if (!orbit) {
    // mono: the word stream sits above the cube
  }
  write(name, th, W, H, s);
}

// Mono composition: monkeytype-like word stream on top
function combinedMono(th, name, e, opt) {
  const W = 1440, H = 900;
  let s = '';
  const held = e.held; const mv = e.d.mv;
  s += tx(48, 48, 'cubesight', { size: 18, fill: th.ink, weight: 500 }) + tx(200, 48, 'brain', { size: 14, fill: th.accText }) + tx(262, 48, 'history', { size: 14, fill: th.muted }) + tx(340, 48, 'trainers', { size: 14, fill: th.muted });
  s += `<circle cx="1224" cy="44" r="3.5" fill="${th.acc}"/>` + tx(1236, 48, 'GAN 356 i3', { size: 12, fill: th.muted });
  s += tx(120, 112, opt.kicker, { size: 13, fill: th.accText });
  const stream = e.scramble ? e.seq : e.seq;
  s += monoSeqLine(120, 160, stream, e.idx, th, 1200);
  const cx = 360, cy = 470;
  s += ghostCube(cx, cy, 52, th, e.state, e.move, { held });
  if (viewNote(mv)) s += tx(cx, cy + 180, 'view: below-left-back', { size: 11, fill: th.muted, anchor: 'middle' });
  const rx = 700;
  s += tx(rx, 410, e.move, { size: 120, fill: th.ink, weight: 300 });
  s += t(rx + e.move.length * 60 + 50, 396, e.d.sym, { size: 52, fill: th.acc, family: MONO });
  const lines = wrap(e.d.text, 50);
  lines.forEach((l, i) => { s += tx(rx, 462 + i * 24, l, { size: 16, fill: th.ink }); });
  let y = 462 + lines.length * 24 + 20;
  s += pill(rx, y, kindLabel(mv), th, { size: 11 }); y += 38;
  const f = FINGER[e.move]; if (f) { s += tx(rx, y, 'fingers', { size: 12, fill: th.muted }); s += tx(rx + 70, y, f, { size: 13, fill: th.accText }); y += 28; }
  const cc = centerColors(e.state, held);
  s += tx(rx, y, 'hold', { size: 12, fill: th.muted }); s += tx(rx + 70, y, `${cc.U} top · ${cc.F} front`, { size: 13, fill: th.ink });
  s += `<line x1="60" y1="668" x2="${W - 60}" y2="668" stroke="${th.hair}" stroke-opacity=".6"/>`;
  s += chipStrip(60, 772, e.seq, e.idx, th, { groups: e.scramble ? null : e.groups, win: e.scramble ? [5, 6] : null }).svg;
  const keys = [['space', 'next'], ['←', 'back'], ['g', 'ghost'], ['f', 'fingers']];
  let kx = 1000;
  keys.forEach(([k, l]) => { s += `<rect x="${kx}" y="722" width="${k.length * 8 + 14}" height="22" rx="${th.radius}" fill="${th.keyBg}"/>` + tx(kx + (k.length * 8 + 14) / 2, 737, k, { size: 11, fill: th.keyInk, anchor: 'middle' }) + tx(kx + k.length * 8 + 22, 737, l, { size: 11, fill: th.muted }); kx += k.length * 8 + 22 + l.length * 6.6 + 18; });
  write(name, th, W, H, s);
}

// ===================== M-08 contexts =====================
// title with notation tokens in mono: parts = strings or {m: 'L2'}
function rich(x, y, parts, th, size = 18) {
  const inner = parts.map(p => typeof p === 'string' ? esc(p) : `<tspan font-family="${MONO}" font-size="${size - 2}" fill="${th.accText}">${esc(p.m)}</tspan>`).join('');
  return t(x, y, inner, { size, fill: th.ink, family: th.font, weight: th.style === 'orbit' ? 600 : 400, raw: true });
}
function frameContexts(th, name) {
  const W = 1440, H = 900;
  let s = header(th, 'Move guide · reused wherever a sequence appears', 'one component, four hosts: wrong-turn recovery, coach best move, algorithm trainer, solve review · warning colour = correction, accent = plan', W);
  const colX = [60, 760], rowY = [150, 540];
  const held = { bottom: 'D', front: 'F' };
  // 1 recovery
  {
    const x = colX[0], y = rowY[0];
    s += tx(x, y + 10, '1 · wrong-turn recovery', { size: 12, fill: th.accText });
    s += rich(x, y + 40, ['You turned ', { m: 'L' }, ' instead of ', { m: "L'" }], th);
    s += tx(x, y + 62, 'the plan is kept; one inserted turn brings you back', { size: 12, fill: th.muted });
    let cxp = x; const mid = y + 190; let out = '';
    const seq = ["D'", "B'", 'L', 'L2', "L'", 'U', "F'"];
    const stat = ['done', 'done', 'wrong', 'cur', 'next', 'next', 'next'];
    const labels = { 0: null };
    seq.forEach((m, i) => {
      if (stat[i] === 'cur') { const c = chip(cxp, mid - 75, m, th, { status: 'current' }); out += c.svg.split(th.acc).join(th.warn); cxp += c.w + 6; }
      else { const c = chip(cxp, mid - 41, m, th, { status: stat[i] }); out += c.svg; if (stat[i] === 'wrong') out += `<line x1="${cxp + 9}" y1="${mid + 33}" x2="${cxp + c.w - 9}" y2="${mid - 33}" stroke="${th.warn}" stroke-width="2"/>`; cxp += c.w + 6; }
    });
    s += out;
    s += tx(x, mid + 70, 'done', { size: 11, fill: th.muted }) + tx(x + 128, mid + 70, 'played', { size: 11, fill: th.warnText }) + tx(x + 200, mid + 100, 'undo', { size: 11, fill: th.warnText }) + tx(x + 302, mid + 70, 'plan resumes', { size: 11, fill: th.muted });
    const rec = apply(solved(), "D2 F2 U' B2 R2 U2 F2 U' L2 D' B'".split(' ').concat(['L']));
    s += guidedCube(x + 610, y + 150, 32, th, rec, 'L2', { held, color: th.warn });
    s += tx(x + 610, y + 270, 'seen from below-left-back', { size: 11, fill: th.muted, anchor: 'middle' });
    s += tx(x + 610, y + 292, 'L2 undoes L and finishes L′', { size: 12, fill: th.warnText, anchor: 'middle' });
  }
  // 2 coach best move
  {
    const x = colX[1], y = rowY[0];
    s += tx(x, y + 10, '2 · coach: best move', { size: 12, fill: th.accText });
    s += rich(x, y + 40, ['Best move was ', { m: "F' R D2" }], th);
    s += tx(x, y + 62, 'you played R U2 L; the best line fixes the cross edge in 3', { size: 12, fill: th.muted });
    const played = ['R', 'U2', 'L'], best = ["F'", 'R', 'D2'];
    let xx = x + 54; s += tx(x, y + 126, 'you', { size: 11, fill: th.muted });
    played.forEach(m => { const c = chip(xx, y + 86, m, th, { status: 'done' }); s += c.svg; xx += c.w + 6; });
    xx = x + 54; s += tx(x, y + 236, 'best', { size: 11, fill: th.accText });
    best.forEach((m, i) => { const c = chip(xx, y + 196, m, th, { status: 'next' }); s += c.svg; s += tx(xx + 4, y + 192, String(i + 1), { size: 10, fill: th.accText }); xx += c.w + 6; });
    const st = apply(solved(), ['F', 'R', "D'", 'B2', "U'", 'L']);
    s += guidedCube(x + 500, y + 150, 34, th, st, "F'", { held });
    s += tx(x + 500, y + 280, "hover a chip to see that turn", { size: 11, fill: th.muted, anchor: 'middle' });
  }
  // 3 algorithm trainer
  {
    const x = colX[0], y = rowY[1];
    s += tx(x, y + 10, '3 · algorithm trainer', { size: 12, fill: th.accText });
    s += rich(x, y + 40, ['T-perm  ', { m: "R U R' U' R' F R2 U' R' U' R U R' F'" }], th);
    s += tx(x, y + 62, '14 moves · yellow on top, green in front', { size: 12, fill: th.muted });
    const heldT = { bottom: 'U', front: 'F' };
    const caseState = apply(solved(), invSeq(T));
    const o = ollSVG(x + 70, y + 170, 30, th, caseState, null, { held: heldT }); s += o.svg;
    s += tx(x + 70, y + 262, 'the case', { size: 11, fill: th.muted, anchor: 'middle' });
    s += chipStrip(x + 172, y + 170, T, 6, th, { groups: null, win: [2, 3] }).svg;
    s += tx(x + 180, y + 282, 'drill mode hides the chips after 3 clean runs; the ghost stays on demand', { size: 11, fill: th.muted });
  }
  // 4 solve review
  {
    const x = colX[1], y = rowY[1];
    s += tx(x, y + 10, '4 · solve review', { size: 12, fill: th.accText });
    s += t(x, y + 40, 'Pair 3 · 1.52 s · 7 moves', { size: 18, fill: th.ink, family: th.font, weight: th.style === 'orbit' ? 600 : 400 });
    s += tx(x, y + 62, "pseudo pair · inserting y' would have saved 0.3 s", { size: 12, fill: th.muted });
    const moves = ["U'", 'R', 'U', "R'", 'U2', "F'", 'U'];
    let xx = x; s += tx(x, y + 112, 'as solved', { size: 11, fill: th.muted });
    moves.forEach((m, i) => { const c = chip(xx, y + 122, m, th, { status: i < 3 ? 'done' : 'next' }); s += c.svg; xx += c.w + 6; });
    xx = x; s += tx(x, y + 236, 'suggested', { size: 11, fill: th.accText });
    ["y'", 'R', 'U', "R'"].forEach(m => { const c = chip(xx, y + 246, m, th, { status: 'next' }); s += c.svg; xx += c.w + 6; });
    const st = apply(solved(), ['R', "U'", 'F']);
    s += guidedCube(x + 520, y + 190, 30, th, st, "y'", { held });
    s += tx(x + 520, y + 306, 'scrub the timeline; the ghost follows', { size: 11, fill: th.muted, anchor: 'middle' });
  }
  write(name, th, W, H, s);
}

// ---------- run ----------
const OD = THEMES['orbit-dark'], OL = THEMES['orbit-light'], MD = THEMES['mono-dark'], ML = THEMES['mono-light'];
frameVocab(OD, 'M-01-vocabulary-orbit-dark');
frameOrient(OD, 'M-02-orientation-orbit-dark');
frameA(OD, 'M-03-A-arrows-orbit-dark');
frameB(OD, 'M-04-B-ghost-orbit-dark');
frameC(OD, 'M-05-C-chips-orbit-dark');
frameD(OD, 'M-06-D-net-orbit-dark');
combined(OD, 'M-07-recommended-scramble-orbit-dark', EX[0], { kicker: 'guided scramble · turn 15 of 20' });
frameContexts(OD, 'M-08-contexts-orbit-dark');
combinedMono(MD, 'M-09-recommended-wide-mono-dark', EX[3], { kicker: 'algorithm · wide-move OLL · move 1 of 8' });
combined(OL, 'M-10-recommended-tperm-orbit-light', EX[1], { kicker: 'algorithm trainer · T-perm · move 7 of 14' });
frameA(MD, 'M-11-A-arrows-mono-dark');
frameC(ML, 'M-12-C-chips-mono-light');
