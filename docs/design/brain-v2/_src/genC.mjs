// Direction C — "Orbit": light, editorial, circular timeline ring around the cube.
import { cube, t, svg, write, MONO, SANS, SOLVE, SCRAMBLE, SCR_DONE, STATES, HISTORY, histLabel, histValue, cumulative, fmt, monoW } from './lib.mjs';

// Theme: ORBIT_THEME=dark → C-dark-* frames. Every colour in this file is a token below.
const DARK = process.env.ORBIT_THEME === 'dark';
const LIGHT_T = { bg: '#f3f0e8', ink: '#1c1b18', sub: '#8a857a', line: '#dcd6c8', faint: '#e9e4d8', acc: '#0a7d71', accSoft: '#d3e6e1', amber: '#c77700', red: '#c8372d',
  ghost: '#b3ad9f', zero: '#cfc8b8', keyBg: '#37352f', keyTxt: '#e9e4d8', doneMove: '#c3bcad', warnSoft: '#f6e3c2', warnBand: '#f1dcb4', grace: '#d6d0c2', band: '#ebe6da', track: '#e6e0d3', canvas: '#e9e4d8', onAcc: '#ffffff', bezel: '#1c1b18',
  shadow: '#1c1b18', shadowOp: 0.07, glow: null, cubeBody: '#1c1b18' };
const DARK_T = { bg: '#141311', ink: '#ece6d8', sub: '#9a9486', line: '#34312b', faint: '#1d1b18', acc: '#3dbfad', accSoft: '#16403a', amber: '#e6a642', red: '#ec6b5f',
  ghost: '#6d675c', zero: '#3b3832', keyBg: '#2b2925', keyTxt: '#d9d2c3', doneMove: '#57524a', warnSoft: '#3d2d12', warnBand: '#4d3715', grace: '#3d3a33', band: '#1b1a17', track: '#2b2925', canvas: '#0d0c0b', onAcc: '#0b1f1c', bezel: '#2c2a26',
  shadow: '#000000', shadowOp: 0.35, glow: '#3dbfad', cubeBody: '#1d1b18' };
const C = DARK ? DARK_T : LIGHT_T;
const PFX = DARK ? 'C-dark-' : 'C-';
const DEFS = C.glow ? `<defs><radialGradient id="cubeGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${C.glow}" stop-opacity="0.22"/><stop offset="0.55" stop-color="${C.glow}" stop-opacity="0.07"/><stop offset="1" stop-color="${C.glow}" stop-opacity="0"/></radialGradient></defs>` : '';
const svgT = (w, h, b, o) => svg(w, h, DEFS + b, o);
const FONTS = ['manrope', 'mono400', 'mono500'];
const CUBE_O = { body: C.cubeBody, shadeF: 0.86, shadeR: 0.72 };
const W = 1440, H = 900;

// ---------- geometry ----------
const rad = d => (d * Math.PI) / 180;
const polar = (cx, cy, r, a) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];
const f1 = n => n.toFixed(1);
function arcPath(cx, cy, r, a0, a1) {
  if (a1 - a0 >= 359.99) return arcPath(cx, cy, r, a0, a0 + 180) + ' ' + arcPath(cx, cy, r, a0 + 180, a1).replace(/^M[^A]+/, '');
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${f1(x0)},${f1(y0)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(x1)},${f1(y1)}`;
}
const arc = (cx, cy, r, a0, a1, stroke, w, extra = '') =>
  `<path d="${arcPath(cx, cy, r, a0, a1)}" fill="none" stroke="${stroke}" stroke-width="${w}" ${extra.includes('stroke-linecap') ? '' : 'stroke-linecap="round"'} ${extra}/>`;
const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="${fill}" ${extra}/>`;
function tick(cx, cy, r0, r1, a, stroke, w = 1.5) {
  const [x0, y0] = polar(cx, cy, r0, a), [x1, y1] = polar(cx, cy, r1, a);
  return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
}
const spark = (x, y, s, fill) => `<path d="M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s} Z" fill="${fill}"/>`;
// label anchored outside a ring at angle a
function ringLabel(cx, cy, r, a, lines) {
  const [x, y] = polar(cx, cy, r, a);
  const s = Math.sin(rad(a)), c = Math.cos(rad(a));
  const anchor = s > 0.25 ? 'start' : s < -0.25 ? 'end' : 'middle';
  const lh = 16, n = lines.length;
  let y0 = y + 4 - ((n - 1) * lh) / 2;
  if (c > 0.6) y0 = y - (n - 1) * lh;      // top: grow upward
  if (c < -0.6) y0 = y + 12;               // bottom: grow downward
  return lines.map((l, i) => t(f1(x), f1(y0 + i * lh), l.s, { size: l.size || 12, fill: l.fill || C.sub, family: MONO, weight: l.w || 400, anchor })).join('');
}

// ---------- step ring layout (arc length ∝ your average per step) ----------
const STEPS = SOLVE.steps;
const GAP = 3.2;
function layout(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  const avail = 360 - GAP * weights.length;
  let a = GAP / 2; return weights.map(w => { const a0 = a, a1 = a + (w / total) * avail; a = a1 + GAP; return { a0, a1, mid: (a0 + a1) / 2 }; });
}
const AVG_LAYOUT = layout(STEPS.map(s => s.avg));
const stepName = s => s.key === 'cross' ? 'cross' : s.key.startsWith('p') ? s.key : s.key;

// ---------- chrome ----------
function battery(x, y, pct, col) {
  return `<rect x="${x}" y="${y}" width="22" height="11" rx="2.5" fill="none" stroke="${col}" stroke-width="1.2"/><rect x="${x + 22.5}" y="${y + 3.5}" width="2" height="4" rx="1" fill="${col}"/><rect x="${x + 2}" y="${y + 2}" width="${(18 * pct) / 100}" height="7" rx="1.2" fill="${col}"/>`;
}
function topbar(w = W, active = 'brain') {
  let s = t(48, 44, 'cubesight', { size: 18, fill: C.ink, family: SANS, weight: 800, ls: -0.3 });
  let x = 176;
  for (const n of ['brain', 'history', 'trainers']) {
    s += t(x, 44, n, { size: 14, fill: n === active ? C.ink : C.sub, family: SANS, weight: n === active ? 700 : 500 });
    x += n.length * 8.2 + 28;
  }
  s += circle(w - 196, 39.5, 3.5, C.acc);
  s += t(w - 186, 44, 'GAN 356 i3', { size: 12, fill: C.sub, family: MONO });
  s += battery(w - 98, 34, 84, C.sub);
  s += t(w - 48, 44, '84%', { size: 12, fill: C.sub, family: MONO, anchor: 'end' });
  return s;
}
// monkeytype-style config bar: groups of [label, on]
const CONFIG = [
  [['cfop', 1], ['roux', 0]],
  [['cross', 1], ['x-cross', 0]],
  [['pseudo pairs', 1]],
  [['oll 2-look', 1]],
  [['pll 2-look', 1]],
  [['insp 15s', 1]],
  [['wca penalties', 1]],
];
function configBar(cy, cxCenter = W / 2, dim = false) {
  const size = 13, gapItem = 16, sep = 32;
  let total = 0;
  CONFIG.forEach((g, gi) => { g.forEach(([l], i) => { total += monoW(l, size) + (i ? gapItem : 0); }); if (gi) total += sep; });
  total += 32; // gear
  let x = cxCenter - total / 2, s = '';
  s += gear(x + 7, cy - 4.5, C.sub); x += 32;
  CONFIG.forEach((g, gi) => {
    if (gi) { s += `<line x1="${x + sep / 2}" y1="${cy - 12}" x2="${x + sep / 2}" y2="${cy + 2}" stroke="${C.line}" stroke-width="1"/>`; x += sep; }
    g.forEach(([l, on], i) => {
      if (i) x += gapItem;
      s += t(x, cy, l, { size, fill: on ? C.acc : C.sub, family: MONO, weight: on ? 500 : 400 });
      x += monoW(l, size);
    });
  });
  return `<g opacity="${dim ? 0.45 : 1}">${s}</g>`;
}
function gear(cx, cy, col) {
  let s = `<circle cx="${cx}" cy="${cy}" r="4.2" fill="none" stroke="${col}" stroke-width="1.6"/>`;
  for (let i = 0; i < 8; i++) s += tick(cx, cy, 5.2, 7.4, i * 45, col, 2);
  return s;
}
function keyCap(x, y, label, o = {}) {
  const size = o.size || 11, w = Math.max(22, monoW(label, size) + 14);
  return { w, s: `<rect x="${x}" y="${y - 14}" width="${w}" height="20" rx="5" fill="${o.fill || C.faint}"/>` + t(x + w / 2, y, label, { size, fill: o.col || C.ink, family: MONO, anchor: 'middle' }) };
}
function hints(y, items, cx = W / 2) {
  // items: [[key, label]]
  const size = 12, parts = items.map(([k, l]) => { const kw = Math.max(22, monoW(k, 11) + 14); return { k, l, kw, w: kw + 8 + monoW(l, size) }; });
  const total = parts.reduce((a, p) => a + p.w, 0) + 32 * (parts.length - 1);
  let x = cx - total / 2, s = '';
  for (const p of parts) { s += keyCap(x, y, p.k).s; s += t(x + p.kw + 8, y, p.l, { size, fill: C.sub, family: MONO }); x += p.w + 32; }
  return s;
}
const RING = { cx: 520, cy: 492, r: 236 };
function cubeAt(cx, cy, s, state, extra = {}) { return (C.glow ? `<ellipse cx="${cx}" cy="${cy + s * 1.2}" rx="${s * 1.05}" ry="${s * 0.2}" fill="url(#cubeGlow)"/>` : '') + `<ellipse cx="${cx}" cy="${cy + s * 1.18}" rx="${s * 0.78}" ry="${s * 0.1}" fill="${C.shadow}" opacity="${C.shadowOp}"/>` + cube(cx, cy + s * 0.5, s, state, { ...CUBE_O, ...extra }); }

// full step ring: stateFn(i) -> 'done' | 'current' | 'future' | 'skip'
function stepRing({ cx, cy, r }, o) {
  let s = '';
  const L = o.layout || AVG_LAYOUT;
  STEPS.forEach((st, i) => {
    const { a0, a1, mid } = L[i];
    const state = o.state(i);
    if (state === 'skip') {
      const [x, y] = polar(cx, cy, r, mid);
      s += circle(x, y, 4.5, C.acc);
      s += spark(x + 10, y - 12, 6, C.acc) + spark(x + 19, y - 3, 3.2, C.acc);
      s += ringLabel(cx, cy, r + 30, mid, [{ s: 'eo skip', fill: C.acc, w: 500 }, { s: '0.00', fill: C.acc }]);
      return;
    }
    if (state === 'future') s += arc(cx, cy, r, a0, a1, C.line, 3);
    if (state === 'done') s += arc(cx, cy, r, a0, a1, C.ink, 6);
    if (state === 'current') {
      const frac = o.frac;
      const af = a0 + (a1 - a0) * frac;
      s += arc(cx, cy, r, a0, a1, C.line, 3) + arc(cx, cy, r, a0, af, C.acc, 8);
      const [dx, dy] = polar(cx, cy, r, af);
      s += circle(dx, dy, 14, C.acc, 'opacity="0.14"') + circle(dx, dy, 7, C.acc) + circle(dx, dy, 2.6, C.bg);
    }
    if (st.pseudo && o.pseudo !== false) s += arc(cx, cy, r - 16, a0 + 2, a1 - 2, state === 'future' ? C.line : C.acc, 1.5, 'stroke-dasharray="2 5"');
    const nm = st.pseudo ? `${stepName(st)} · pseudo` : stepName(st);
    const lines = [{ s: nm, fill: state === 'current' ? C.acc : state === 'done' ? C.ink : C.sub, w: state === 'current' ? 500 : 400 }];
    if (state === 'done') {
      const d = st.t - st.avg;
      lines.push({ s: o.noDelta ? fmt(st.t) : `${fmt(st.t)}  ${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`, fill: C.sub });
    } else if (state === 'current') lines.push({ s: o.curText, fill: C.acc });
    else lines.push({ s: `~${fmt(st.avg)}`, fill: C.ghost });
    s += ringLabel(cx, cy, r + 30, mid, lines);
  });
  // 12 o'clock start mark
  s += tick(cx, cy, r - 14, r + 14, 0, C.ink, 1.5);
  return s;
}

// ============ 01 idle ============
function idle() {
  const { cx, cy } = RING;
  let b = topbar() + configBar(104);
  // ghost ring = your pace map, drawn faint
  b += `<g opacity="0.9">` + stepRing(RING, { state: () => 'future' }) + `</g>`;
  b += cubeAt(cx, cy, 128, STATES.solved);
  const X = 900;
  b += t(X, 300, 'ready', { size: 13, fill: C.acc, family: MONO, weight: 500, ls: 1 });
  b += t(X, 336, 'cube connected, solved and centred.', { size: 16, fill: C.sub, family: SANS, weight: 500 });
  b += t(X - 6, 488, '0.00', { size: 150, fill: C.zero, family: SANS, weight: 300, tnum: 1, ls: -4 });
  // primary action
  b += `<rect x="${X}" y="544" width="264" height="56" rx="28" fill="${C.ink}"/>`;
  b += t(X + 32, 579, 'Scramble', { size: 17, fill: C.bg, family: SANS, weight: 700 });
  b += `<rect x="${X + 170}" y="559" width="70" height="26" rx="6" fill="${C.keyBg}"/>` + t(X + 205, 577, 'space', { size: 12, fill: C.keyTxt, family: MONO, anchor: 'middle' });
  // mini stats
  const stats = [['ao5', '14.62'], ['ao12', '15.03'], ['pb', '12.41'], ['today', '23']];
  stats.forEach(([k, v], i) => { const x = X + i * 112; b += t(x, 672, k, { size: 12, fill: C.sub, family: MONO }); b += t(x, 700, v, { size: 22, fill: C.ink, family: SANS, weight: 600, tnum: 1 }); });
  b += t(X, 760, 'the ring is your pace map — each arc is your average for that step.', { size: 13, fill: C.sub, family: SANS, weight: 500 });
  b += hints(860, [['space', 'scramble'], ['p', 'paste scramble'], ['esc', 'settings'], ['h', 'history']]);
  return svgT(W, H, b, { fonts: FONTS, bg: C.bg });
}

// ============ 02 scramble ============
function scramble() {
  const { cx, cy, r } = RING;
  let b = topbar() + configBar(104, W / 2, true);
  // ring = 20 ticks, one per scramble move
  const n = SCRAMBLE.length;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) * (360 / n);
    const col = i < SCR_DONE ? C.ink : i === SCR_DONE ? C.amber : C.line;
    b += arc(cx, cy, r, a - 5.5, a + 5.5, col, i === SCR_DONE ? 8 : i < SCR_DONE ? 6 : 3);
  }
  b += ringLabel(cx, cy, r + 30, (SCR_DONE + 0.5) * 18, [{ s: 'move 12 / 20', fill: C.amber, w: 500 }]);
  b += cubeAt(cx, cy, 128, STATES.midScramble);
  const X = 896;
  b += t(X, 232, 'scramble', { size: 13, fill: C.acc, family: MONO, weight: 500, ls: 1 });
  b += t(X, 264, 'turn the cube to match. the mirror follows every move.', { size: 15, fill: C.sub, family: SANS, weight: 500 });
  // moves: 5 per row, 26px mono
  const size = 30, cw = 88, rh = 64;
  SCRAMBLE.forEach((m, i) => {
    const x = X + (i % 5) * cw, y = 348 + Math.floor(i / 5) * rh;
    if (i < SCR_DONE) b += t(x, y, m, { size, fill: C.doneMove, family: MONO });
    else if (i === SCR_DONE) {
      b += `<rect x="${x - 10}" y="${y - 34}" width="${monoW(m, size) + 20}" height="46" rx="8" fill="${C.warnSoft}"/>`;
      b += t(x, y, m, { size, fill: C.amber, family: MONO, weight: 500 });
      b += `<rect x="${x + monoW(m, size) - 2}" y="${y - 46}" width="34" height="20" rx="10" fill="${C.acc}"/>` + t(x + monoW(m, size) + 15, y - 32, 'L2', { size: 12, fill: C.onAcc, family: MONO, weight: 500, anchor: 'middle' });
    } else b += t(x, y, m, { size, fill: C.ink, family: MONO });
  });
  // recovery line
  const ry = 348 + 4 * rh + 8;
  b += `<line x1="${X}" y1="${ry - 30}" x2="${X + 440}" y2="${ry - 30}" stroke="${C.line}"/>`;
  b += t(X, ry, "wrong way — you turned L, not L'", { size: 16, fill: C.amber, family: SANS, weight: 700 });
  b += t(X, ry + 28, 'no need to undo. finish it with', { size: 15, fill: C.sub, family: SANS, weight: 500 });
  b += `<rect x="${X + 224}" y="${ry + 8}" width="60" height="30" rx="7" fill="${C.acc}"/>` + t(X + 254, ry + 29, 'L2', { size: 17, fill: C.onAcc, family: MONO, weight: 500, anchor: 'middle' });
  b += t(X + 296, ry + 28, 'then carry on.', { size: 15, fill: C.sub, family: SANS, weight: 500 });
  b += hints(860, [['esc', 'cancel'], ['n', 'new scramble'], ['⌫', 'undo last check']]);
  return svgT(W, H, b, { fonts: FONTS, bg: C.bg });
}

// ============ inspection ring ============
const SEC = 24; // deg per second (15 s = 360°)
function inspectionRing({ cx, cy, r }, elapsed, o = {}) {
  let s = '';
  const total = o.total || 15, deg = 360 / total;
  // ghost of the full ring
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.line}" stroke-width="${o.thin || 3}"/>`;
  const remaining = Math.max(0, total - elapsed);
  if (remaining > 0) {
    const end = remaining * deg;
    s += arc(cx, cy, r, 0, end, C.acc, o.w || 8);
    const [dx, dy] = polar(cx, cy, r, end);
    s += circle(dx, dy, (o.w || 8) * 1.7, C.acc, 'opacity="0.14"') + circle(dx, dy, (o.w || 8) * 0.9, C.acc) + circle(dx, dy, (o.w || 8) * 0.34, C.bg);
  }
  // second ticks
  if (o.ticks !== false) for (let i = 1; i < total; i++) s += tick(cx, cy, r + 10, r + (i % 5 === 0 ? 18 : 14), (total - i) * deg, i % 5 === 0 ? C.sub : C.line, 1.2);
  // callouts at 8 s and 12 s elapsed
  if (o.callouts !== false && total === 15) {
    for (const [e, lab] of [[8, '8s'], [12, '12s']]) {
      const a = (15 - e) * deg, passed = elapsed >= e;
      s += tick(cx, cy, r - 12, r + 12, a, passed ? C.ink : C.sub, 2.4);
      if (o.labels !== false) s += ringLabel(cx, cy, r + 34, a, [{ s: `“${lab}”`, fill: passed ? C.ink : C.sub, w: 500, size: o.lsize || 13 }]);
    }
  }
  s += tick(cx, cy, r - 14, r + 14, 0, C.ink, 1.5);
  return s;
}
function overtimeZones({ cx, cy, r }, o = {}) {
  const deg = o.deg || SEC;
  let s = '';
  // +2 zone (15–17 s): amber wash band; DNF sector beyond (dashed red)
  s += arc(cx, cy, r, -2 * deg, 0, C.warnBand, o.band || 18, 'stroke-linecap="butt"');
  s += arc(cx, cy, r, -2 * deg - 60, -2 * deg - 2, C.red, 2, 'stroke-dasharray="3 6" opacity="0.8"');
  s += tick(cx, cy, r - 16, r + 16, -2 * deg, C.red, 2);
  return s;
}

// ============ 03 inspection ============
function inspection() {
  const { cx, cy } = RING;
  const elapsed = 9.0;
  let b = topbar() + configBar(104, W / 2, true);
  b += inspectionRing(RING, elapsed);
  b += cubeAt(cx, cy, 128, STATES.inspect);
  const X = 900;
  b += t(X, 232, 'inspection', { size: 13, fill: C.acc, family: MONO, weight: 500, ls: 1 });
  b += t(X, 264, 'the solve clock starts on your first turn.', { size: 15, fill: C.sub, family: SANS, weight: 500 });
  b += t(X - 10, 470, '6', { size: 220, fill: C.ink, family: SANS, weight: 300, tnum: 1 });
  b += t(X + 150, 470, 's left', { size: 22, fill: C.sub, family: SANS, weight: 500 });
  // judge callout
  b += `<g>` + circle(X + 6, 530, 5, C.ink) + t(X + 22, 535, '“8 seconds”', { size: 16, fill: C.ink, family: MONO, weight: 500 }) + t(X + 150, 535, 'called at 8.00', { size: 13, fill: C.sub, family: MONO }) + `</g>`;
  // cross hint (optional)
  b += `<line x1="${X}" y1="586" x2="${X + 440}" y2="586" stroke="${C.line}"/>`;
  b += t(X, 624, 'cross hint', { size: 12, fill: C.sub, family: MONO, ls: 0.5 });
  b += t(X, 658, 'white · 6 moves', { size: 22, fill: C.ink, family: SANS, weight: 700 });
  b += t(X, 692, "F' R D2 L' B2 D", { size: 18, fill: C.acc, family: MONO, weight: 500 });
  b += t(X, 722, 'your usual: 7.3 moves on white', { size: 13, fill: C.sub, family: SANS, weight: 500 });
  b += hints(860, [['tab', 'hide cross hint'], ['esc', 'abort solve']]);
  return svgT(W, H, b, { fonts: FONTS, bg: C.bg });
}

// ============ 04 overtime ============
function overtime() {
  const { cx, cy, r } = RING;
  const over = 0.8;
  let b = topbar() + configBar(104, W / 2, true);
  b += inspectionRing(RING, 15, { ticks: true });
  b += overtimeZones(RING);
  b += arc(cx, cy, r, -over * SEC, 0, C.amber, 8);
  const [dx, dy] = polar(cx, cy, r, -over * SEC);
  b += circle(dx, dy, 14, C.amber, 'opacity="0.16"') + circle(dx, dy, 7, C.amber) + circle(dx, dy, 2.6, C.bg);
  b += tick(cx, cy, r - 12, r + 12, -SEC, C.amber, 1.5);
  b += ringLabel(cx, cy, r + 32, -SEC, [{ s: '+2 zone', fill: C.amber, w: 500 }, { s: '15 – 17 s', fill: C.sub }]);
  b += ringLabel(cx, cy, r + 32, -2 * SEC - 30, [{ s: 'DNF', fill: C.red, w: 500 }, { s: 'after 17 s', fill: C.sub }]);
  b += cubeAt(cx, cy, 128, STATES.inspect);
  const X = 900;
  b += t(X, 232, 'overtime', { size: 13, fill: C.amber, family: MONO, weight: 500, ls: 1 });
  b += t(X, 264, 'past 15 s — start now and it counts as +2.', { size: 15, fill: C.sub, family: SANS, weight: 500 });
  b += t(X - 6, 470, '+1', { size: 220, fill: C.amber, family: SANS, weight: 300, tnum: 1 });
  b += t(X, 528, '15.8 s inspected', { size: 16, fill: C.ink, family: MONO, weight: 500 });
  // penalty meter
  const mx = X, my = 580, mw = 440;
  b += `<rect x="${mx}" y="${my}" width="${mw * 0.5}" height="6" rx="3" fill="${C.warnBand}"/>`;
  b += `<line x1="${mx + mw * 0.5 + 4}" y1="${my + 3}" x2="${mx + mw}" y2="${my + 3}" stroke="${C.red}" stroke-width="2" stroke-dasharray="3 6"/>`;
  b += `<rect x="${mx}" y="${my}" width="${mw * 0.5 * 0.4}" height="6" rx="3" fill="${C.amber}"/>`;
  b += t(mx, my + 32, '15 s', { size: 12, fill: C.sub, family: MONO });
  b += t(mx + mw * 0.5, my + 32, '17 s', { size: 12, fill: C.sub, family: MONO, anchor: 'middle' });
  b += t(mx + mw, my + 32, 'DNF', { size: 12, fill: C.red, family: MONO, anchor: 'end' });
  b += t(X, 668, 'penalty if you start now', { size: 13, fill: C.sub, family: SANS, weight: 500 });
  b += t(X, 700, '+2', { size: 26, fill: C.amber, family: SANS, weight: 700 });
  b += t(X + 56, 700, 'DNF in 1.2 s', { size: 18, fill: C.ink, family: MONO, weight: 500 });
  b += t(X, 740, 'rules: WCA. change to count-only or grace in settings.', { size: 13, fill: C.sub, family: SANS, weight: 500 });
  b += hints(860, [['esc', 'abort solve'], ['s', 'inspection settings']]);
  return svgT(W, H, b, { fonts: FONTS, bg: C.bg });
}

// ============ 05 inspection variants ============
function variants() {
  let b = topbar();
  b += t(64, 128, 'inspection, your way', { size: 30, fill: C.ink, family: SANS, weight: 700, ls: -0.5 });
  b += t(64, 160, 'the ring follows your rules. WCA is the default; every other mode is one keypress away in settings.', { size: 15, fill: C.sub, family: SANS, weight: 500 });
  const cols = 4, cw = 328, x0 = 64, rows = [236, 564];
  const R = 74;
  const panels = [
    { title: 'wca · 15 s', tag: 'default', desc: ['drains anticlockwise. +2 after', '15 s, DNF after 17 s.'], draw: (cx, cy) => inspectionRing({ cx, cy, r: R }, 9, { w: 6, thin: 2, ticks: false, lsize: 11 }) + overtimeZones({ cx, cy, r: R }, { band: 12 }), big: '6' },
    { title: 'custom · 10 s', desc: ['same ring, rescaled to your', 'length. penalties follow it.'], draw: (cx, cy) => inspectionRing({ cx, cy, r: R }, 4, { total: 10, w: 6, thin: 2, ticks: false, callouts: false }), big: '6' },
    { title: 'unlimited', desc: ['counts up, one lap per minute.', 'no penalty, ever.'], draw: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.line}" stroke-width="2" stroke-dasharray="2 5"/>` + arc(cx, cy, R, 0, 162, C.sub, 6) + circle(...polar(cx, cy, R, 162), 5, C.sub), big: '0:27', bigCol: C.sub },
    { title: 'off', desc: ['no inspection. the solve clock', 'starts on your first turn.'], draw: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.line}" stroke-width="2"/>` + tick(cx, cy, R - 10, R + 10, 0, C.acc, 2.5), big: '—', bigCol: C.sub },
    { title: 'overtime · count only', desc: ['keeps counting +1, +2, +3…', 'logged, never penalised.'], draw: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.line}" stroke-width="2"/>` + arc(cx, cy, R, -3.4 * SEC, 0, C.amber, 6) + [1, 2, 3].map(i => tick(cx, cy, R - 9, R + 9, -i * SEC, C.amber, 1.5)).join('') + ringLabel(cx, cy, R + 18, -3 * SEC, [{ s: '+3', fill: C.amber, size: 11 }]), big: '+3', bigCol: C.amber },
    { title: 'grace · +3 s', desc: ['a quiet grace sector, then', 'your choice: +2, DNF or nothing.'], draw: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.line}" stroke-width="2"/>` + arc(cx, cy, R, -3 * SEC, 0, C.grace, 12, 'stroke-linecap="butt"') + arc(cx, cy, R, -1.6 * SEC, 0, C.sub, 6) + arc(cx, cy, R, -3 * SEC - 50, -3 * SEC - 2, C.red, 2, 'stroke-dasharray="3 6"') + tick(cx, cy, R - 12, R + 12, -3 * SEC, C.red, 2), big: '+1.6', bigCol: C.sub },
    { title: 'auto-start', desc: ['at 0 the ring flips to the solve', 'ring and the clock just runs.'], draw: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.line}" stroke-width="2"/>` + arc(cx, cy, R, 0, 34, C.acc, 6) + circle(...polar(cx, cy, R, 34), 5, C.acc) + tick(cx, cy, R - 12, R + 12, 0, C.ink, 1.5), big: '0.84', bigCol: C.acc },
    { title: '8 s · 12 s callouts', desc: ['judge-style marks on the ring,', 'plus an optional voice call.'], draw: (cx, cy) => inspectionRing({ cx, cy, r: R }, 12.4, { w: 6, thin: 2, ticks: false, lsize: 11 }), big: '3' },
  ];
  panels.forEach((p, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = x0 + col * cw + 120, cy = rows[row] + 110;
    b += p.draw(cx, cy);
    b += t(cx, cy + (p.big.length > 2 ? 10 : 14), p.big, { size: p.big.length > 2 ? 30 : 40, fill: p.bigCol || C.ink, family: SANS, weight: 300, anchor: 'middle', tnum: 1 });
    const ty = rows[row] + 256;
    const tx = x0 + col * cw;
    b += t(tx, ty, p.title, { size: 15, fill: C.ink, family: MONO, weight: 500 });
    if (p.tag) b += `<rect x="${tx + monoW(p.title, 15) + 12}" y="${ty - 15}" width="64" height="20" rx="10" fill="${C.accSoft}"/>` + t(tx + monoW(p.title, 15) + 44, ty - 1, p.tag, { size: 11, fill: C.acc, family: MONO, weight: 500, anchor: 'middle' });
    p.desc.forEach((d, k) => { b += t(tx, ty + 26 + k * 20, d, { size: 13.5, fill: C.sub, family: SANS, weight: 500 }); });
  });
  return svgT(W, H, b, { fonts: FONTS, bg: C.bg });
}

// ============ 06 solving ============
function solving() {
  const { cx, cy } = RING;
  const into = 0.94, elapsed = 2.08 + 1.71 + 1.96 + into;
  let b = topbar() + configBar(104, W / 2, true);
  b += stepRing(RING, { state: i => (i < 3 ? 'done' : i === 3 ? 'current' : 'future'), frac: into / STEPS[3].avg, curText: `${fmt(into)}` });
  b += cubeAt(cx, cy, 128, STATES.f2l);
  const X = 900;
  b += t(X, 232, 'f2l · pair 3 of 4', { size: 13, fill: C.acc, family: MONO, weight: 500, ls: 1 });
  b += t(X - 8, 404, fmt(elapsed), { size: 168, fill: C.ink, family: SANS, weight: 300, tnum: 1, ls: -4 });
  b += t(X, 468, 'Pair 3', { size: 34, fill: C.ink, family: SANS, weight: 700, ls: -0.5 });
  const pw = 136;
  b += `<rect x="${X + pw}" y="${442}" width="146" height="30" rx="15" fill="${C.accSoft}"/>` + t(X + pw + 73, 462, 'pseudo · D′ shift', { size: 12.5, fill: C.acc, family: MONO, weight: 500, anchor: 'middle' });
  b += t(X, 500, 'blue-orange slot, cross offset by D′ — fixed at the end.', { size: 14, fill: C.sub, family: SANS, weight: 500 });
  // compact splits (vertical, editorial)
  const rows = [['cross', 2.08, 2.41], ['pair 1', 1.71, 1.88], ['pair 2', 1.96, 1.92]];
  b += `<line x1="${X}" y1="540" x2="${X + 440}" y2="540" stroke="${C.line}"/>`;
  rows.forEach(([k, v, a], i) => {
    const y = 576 + i * 34, d = v - a;
    b += t(X, y, k, { size: 15, fill: C.sub, family: MONO });
    b += t(X + 200, y, fmt(v), { size: 15, fill: C.ink, family: MONO, weight: 500, anchor: 'end' });
    b += t(X + 290, y, `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`, { size: 14, fill: d <= 0 ? C.acc : C.amber, family: MONO, anchor: 'end' });
  });
  b += t(X, 684, 'pair 3', { size: 15, fill: C.acc, family: MONO, weight: 500 });
  b += t(X + 200, 684, fmt(into), { size: 15, fill: C.acc, family: MONO, weight: 500, anchor: 'end' });
  b += t(X + 290, 684, '…', { size: 14, fill: C.acc, family: MONO, anchor: 'end' });
  b += t(X, 736, '31 moves   ·   4.64 tps   ·   pace −0.51 vs avg', { size: 14, fill: C.sub, family: MONO });
  b += hints(860, [['esc', 'abort'], ['t', 'hide timer'], ['c', 'coach hints off']]);
  return svgT(W, H, b, { fonts: FONTS, bg: C.bg });
}

// ============ 07 skip ============
function skip() {
  const { cx, cy } = RING;
  const into = 0.61, elapsed = 11.22 + into;
  let b = topbar() + configBar(104, W / 2, true);
  b += stepRing(RING, { state: i => (i === 5 ? 'skip' : i < 7 ? 'done' : i === 7 ? 'current' : 'future'), frac: into / STEPS[7].avg, curText: fmt(into) });
  b += cubeAt(cx, cy, 128, STATES.pll);
  const X = 900;
  b += t(X, 232, 'pll · corners', { size: 13, fill: C.acc, family: MONO, weight: 500, ls: 1 });
  b += t(X - 8, 404, fmt(elapsed), { size: 168, fill: C.ink, family: SANS, weight: 300, tnum: 1, ls: -4 });
  b += t(X, 468, 'Corners', { size: 34, fill: C.ink, family: SANS, weight: 700, ls: -0.5 });
  b += t(X + 152, 468, 'Aa-perm · headlights on left', { size: 15, fill: C.sub, family: MONO });
  // skip moment
  b += `<line x1="${X}" y1="508" x2="${X + 440}" y2="508" stroke="${C.line}"/>`;
  b += spark(X + 8, 546, 8, C.acc) + spark(X + 22, 534, 4, C.acc);
  b += t(X + 40, 552, 'EO skip', { size: 20, fill: C.acc, family: SANS, weight: 800 });
  b += t(X + 130, 552, 'edges came up oriented — 0.98 s back.', { size: 15, fill: C.ink, family: SANS, weight: 500 });
  b += t(X + 40, 578, 'your 3rd this session · odds 1 in 8', { size: 13, fill: C.sub, family: MONO });
  const rows = [['cross', 2.08], ['pairs', 7.50], ['eo', 0], ['co', 1.64]];
  rows.forEach(([k, v], i) => {
    const x = X + i * 112;
    b += t(x, 640, k, { size: 12, fill: C.sub, family: MONO });
    b += t(x, 666, k === 'eo' ? 'skip' : fmt(v), { size: 18, fill: k === 'eo' ? C.acc : C.ink, family: MONO, weight: 500 });
  });
  b += t(X, 736, '53 moves   ·   4.48 tps   ·   pace −1.63 vs avg', { size: 14, fill: C.sub, family: MONO });
  b += hints(860, [['esc', 'abort'], ['t', 'hide timer'], ['c', 'coach hints off']]);
  return svgT(W, H, b, { fonts: FONTS, bg: C.bg });
}

// ============ results pieces ============
function donut(cx, cy, r, w = 14, labels = true) {
  let s = '';
  const L = layout(STEPS.map(st => Math.max(st.t, 0.0001)));
  STEPS.forEach((st, i) => {
    const { a0, a1, mid } = L[i];
    if (st.skip) { const [x, y] = polar(cx, cy, r, mid); s += circle(x, y, 4, C.acc) + spark(x + 9, y - 9, 5, C.acc); return; }
    const faster = st.t <= st.avg;
    s += arc(cx, cy, r, a0, a1, faster ? C.acc : C.ink, w, 'stroke-linecap="butt"');
    if (labels) s += ringLabel(cx, cy, r + 22, mid, [{ s: stepName(st), fill: C.sub, size: 11 }]);
  });
  return s;
}
function tpsChart(x, y, w, h, o = {}) {
  let s = '';
  const tot = SOLVE.time, ymax = 8;
  const X = v => x + (v / tot) * w, Y = v => y + h - (v / ymax) * h;
  const cum = cumulative(STEPS);
  let prev = 0;
  STEPS.forEach((st, i) => {
    if (st.skip) { s += spark(X(prev), y - 20, 5, C.acc); return; }
    const a = prev, e = cum[i];
    if (i % 2 === 0) s += `<rect x="${f1(X(a))}" y="${y}" width="${f1(X(e) - X(a))}" height="${h}" fill="${C.band}"/>`;
    if (o.bandLabels !== false) s += t(f1((X(a) + X(e)) / 2), y - 12, stepName(st), { size: o.lsize || 11, fill: C.sub, family: MONO, anchor: 'middle' });
    prev = e;
  });
  for (const g of [0, 2, 4, 6, 8]) {
    s += `<line x1="${x}" y1="${Y(g)}" x2="${x + w}" y2="${Y(g)}" stroke="${C.line}" stroke-width="${g === 0 ? 1 : 0.6}"/>`;
    s += t(x - 10, Y(g) + 4, String(g), { size: 11, fill: C.sub, family: MONO, anchor: 'end' });
  }
  const raw = SOLVE.tpsCurve; const sm = raw.map((v, i) => (0.25 * (raw[i - 1] ?? v) + 0.5 * v + 0.25 * (raw[i + 1] ?? v)));
  const pts = sm.map((v, i) => [X(Math.min(i * 0.5, tot)), Y(v)]);
  // smooth path (catmull-rom -> bezier)
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  s += `<path d="${d} L${f1(pts.at(-1)[0])},${Y(0)} L${x},${Y(0)} Z" fill="${C.acc}" opacity="0.08"/>`;
  s += `<path d="${d}" fill="none" stroke="${C.acc}" stroke-width="2.2" stroke-linejoin="round"/>`;
  s += `<line x1="${x}" y1="${Y(4.52)}" x2="${x + w}" y2="${Y(4.52)}" stroke="${C.ink}" stroke-width="1" stroke-dasharray="4 5" opacity="0.5"/>`;
  if (o.axis !== false) {
    s += `<line x1="${x + w - 150}" y1="${y - 44}" x2="${x + w - 128}" y2="${y - 44}" stroke="${C.ink}" stroke-dasharray="4 5" opacity="0.5"/>` + t(x + w, y - 40, 'your avg 4.52', { size: 11, fill: C.sub, family: MONO, anchor: 'end' });
    for (const sec of [0, 2, 4, 6, 8, 10, 12, 14]) s += t(X(sec), y + h + 20, `${sec}s`, { size: 11, fill: C.sub, family: MONO, anchor: 'middle' });
  }
  return s;
}
function splitBars(x, y, w, rowH = 30, o = {}) {
  let s = '';
  const maxT = 3;
  const bx = x + (o.labelW || 90), bw = w - (o.labelW || 90) - (o.valW || 150);
  STEPS.forEach((st, i) => {
    const yy = y + i * rowH;
    s += t(x, yy + 5, stepName(st) + (st.pseudo ? '*' : ''), { size: o.size || 13, fill: C.sub, family: MONO });
    s += `<rect x="${bx}" y="${yy - 3}" width="${bw}" height="6" rx="3" fill="${C.track}"/>`;
    if (!st.skip) s += `<rect x="${bx}" y="${yy - 3}" width="${f1((st.t / maxT) * bw)}" height="6" rx="3" fill="${st.t <= st.avg ? C.acc : C.ink}"/>`;
    else s += spark(bx + 6, yy, 6, C.acc);
    const ax = bx + (st.avg / maxT) * bw;
    s += `<line x1="${f1(ax)}" y1="${yy - 9}" x2="${f1(ax)}" y2="${yy + 9}" stroke="${C.ink}" stroke-width="1.5"/>`;
    s += t(bx + bw + 16, yy + 5, st.skip ? 'skip' : fmt(st.t), { size: o.size || 13, fill: st.skip ? C.acc : C.ink, family: MONO, weight: 500 });
    if (!o.noDelta) { const d = st.t - st.avg; s += t(bx + bw + (o.valW || 150), yy + 5, `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`, { size: 12, fill: d <= 0 ? C.acc : C.amber, family: MONO, anchor: 'end' }); }
  });
  return s;
}
function sparkline(x, y, w, h, o = {}) {
  let s = '';
  const vals = HISTORY.map(histValue), lo = 12, hi = 20;
  const X = i => x + (i / (HISTORY.length - 1)) * w, Y = v => y + h - ((v - lo) / (hi - lo)) * h;
  let d = '';
  HISTORY.forEach((hh, i) => { const v = vals[i]; if (v == null) return; d += `${d ? ' L' : 'M'}${f1(X(i))},${f1(Y(v))}`; });
  s += `<path d="${d}" fill="none" stroke="${C.sub}" stroke-width="1.4" stroke-linejoin="round"/>`;
  s += `<line x1="${x}" y1="${Y(SOLVE.ao12)}" x2="${x + w}" y2="${Y(SOLVE.ao12)}" stroke="${C.line}" stroke-dasharray="3 4"/>`;
  HISTORY.forEach((hh, i) => {
    if (hh.pen === 'DNF') { const cx = X(i), cy = y + 2; s += `<path d="M${f1(cx - 4)},${cy - 4} L${f1(cx + 4)},${cy + 4} M${f1(cx + 4)},${cy - 4} L${f1(cx - 4)},${cy + 4}" stroke="${C.red}" stroke-width="1.8" stroke-linecap="round"/>`; }
    else if (hh.pen === '+2') s += circle(X(i), Y(vals[i]), 3.5, C.amber);
    else if (hh.t === SOLVE.pb) s += circle(X(i), Y(vals[i]), 3.5, C.ink);
  });
  s += circle(X(HISTORY.length - 1), Y(vals.at(-1)), 5, C.acc);
  return s;
}

// ============ 08 results ============
function results() {
  let b = topbar();
  // big stats (left)
  const X = 64;
  b += t(X, 140, 'time', { size: 14, fill: C.sub, family: MONO });
  b += t(X - 6, 244, '14.07', { size: 120, fill: C.acc, family: SANS, weight: 300, tnum: 1, ls: -3 });
  b += t(X + 330, 244, 's', { size: 28, fill: C.sub, family: SANS, weight: 500 });
  const small = [['moves', '68'], ['tps', '4.83'], ['inspection', '8.70'], ['vs ao12', '−0.96']];
  small.forEach(([k, v], i) => {
    const x = X + i * 104;
    b += t(x, 302, k, { size: 13, fill: C.sub, family: MONO });
    b += t(x, 336, v, { size: 28, fill: k === 'vs ao12' ? C.acc : C.ink, family: SANS, weight: 600, tnum: 1 });
  });
  b += t(X, 376, 'cfop · 2-look · pseudo pairs · wca · no penalty', { size: 12.5, fill: C.sub, family: MONO });
  // chart (middle)
  b += t(520, 140, 'turns per second', { size: 14, fill: C.sub, family: MONO });
  b += tpsChart(520, 180, 540, 180);
  // donut (right)
  const dcx = 1236, dcy = 262;
  b += donut(dcx, dcy, 96, 14);
  b += t(dcx, dcy - 4, '68', { size: 30, fill: C.ink, family: SANS, weight: 600, anchor: 'middle', tnum: 1 });
  b += t(dcx, dcy + 20, 'moves', { size: 12, fill: C.sub, family: MONO, anchor: 'middle' });
  b += `<rect x="${dcx - 96}" y="${dcy + 150}" width="14" height="6" rx="3" fill="${C.acc}"/>` + t(dcx - 76, dcy + 157, 'faster', { size: 11, fill: C.sub, family: MONO }) + `<rect x="${dcx + 4}" y="${dcy + 150}" width="14" height="6" rx="3" fill="${C.ink}"/>` + t(dcx + 24, dcy + 157, 'slower', { size: 11, fill: C.sub, family: MONO });
  // split bars
  b += `<line x1="64" y1="432" x2="1376" y2="432" stroke="${C.line}"/>`;
  b += t(X, 476, 'splits', { size: 14, fill: C.sub, family: MONO });
  b += `<line x1="${X + 330}" y1="464" x2="${X + 330}" y2="478" stroke="${C.ink}" stroke-width="1.5"/>` + t(X + 342, 476, 'your average', { size: 12, fill: C.sub, family: MONO });
  b += t(X + 580, 476, 'vs avg', { size: 12, fill: C.sub, family: MONO, anchor: 'end' });
  b += splitBars(X, 516, 580, 32);
  // right lower: averages + sparkline + insights
  const R = 760;
  b += t(R, 476, 'session', { size: 14, fill: C.sub, family: MONO });
  [['ao5', '14.62'], ['ao12', '15.03'], ['pb', '12.41'], ['mean', '15.21']].forEach(([k, v], i) => {
    const x = R + i * 104;
    b += t(x, 512, k, { size: 12, fill: C.sub, family: MONO });
    b += t(x, 540, v, { size: 22, fill: C.ink, family: SANS, weight: 600, tnum: 1 });
  });
  b += sparkline(1190, 494, 186, 50);
  { let lx = 1190; const ly = 566; b += t(lx, ly, 'last 23', { size: 11, fill: C.sub, family: MONO }); lx += 62; b += circle(lx, ly - 4, 3.5, C.ink) + t(lx + 8, ly, 'pb', { size: 11, fill: C.sub, family: MONO }); lx += 36; b += circle(lx, ly - 4, 3.5, C.amber) + t(lx + 8, ly, '+2', { size: 11, fill: C.sub, family: MONO }); lx += 36; b += `<path d="M${lx - 4},${ly - 8} L${lx + 4},${ly} M${lx + 4},${ly - 8} L${lx - 4},${ly}" stroke="${C.red}" stroke-width="1.8" stroke-linecap="round"/>` + t(lx + 9, ly, 'dnf', { size: 11, fill: C.sub, family: MONO }); }
  // recent list with penalties
  const recent = HISTORY.slice(-7);
  let rx = R;
  b += t(R, 596, 'recent', { size: 12, fill: C.sub, family: MONO });
  recent.reverse().forEach((h, i) => {
    const lab = histLabel(h), col = h.pen === 'DNF' ? C.red : h.pen === '+2' ? C.amber : i === 0 ? C.acc : C.ink;
    b += t(rx, 622, lab, { size: 13, fill: col, family: MONO, weight: i === 0 ? 500 : 400 });
    rx += monoW(lab, 13) + 20;
  });
  // insights
  b += t(R, 668, 'coach', { size: 14, fill: C.sub, family: MONO });
  SOLVE.insights.forEach((ins, i) => {
    const y = 700 + i * 28;
    const col = ins.tag === 'eo skip' || ins.tag === 'pseudo' ? C.acc : ins.tag === 'pair 4' ? C.amber : C.ink;
    b += circle(R + 4, y - 5, 3, col);
    b += t(R + 18, y, ins.text, { size: 14, fill: C.ink, family: SANS, weight: 500 });
    if (ins.alg) b += t(R + 18 + ins.text.length * 7.1 + 8, y, ins.alg, { size: 13, fill: C.acc, family: MONO, weight: 500 });
  });
  b += hints(860, [['space', 'next scramble'], ['r', 'retry this scramble'], ['s', 'share'], ['esc', 'settings']]);
  return svgT(W, H, b, { fonts: FONTS, bg: C.bg });
}

// ============ 09 mobile ============
function phone(x, y, inner, label) {
  const w = 390, h = 844;
  let s = `<rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" rx="56" fill="${C.bezel}"/>`;
  s += `<clipPath id="ph${x}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="46"/></clipPath>`;
  s += `<g clip-path="url(#ph${x})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.bg}"/>`;
  s += `<rect x="${x + 140}" y="${y + 12}" width="110" height="30" rx="15" fill="${DARK ? '#000' : C.ink}"/>`;
  s += t(x + 34, y + 36, '9:41', { size: 15, fill: C.ink, family: SANS, weight: 700 });
  s += `<g transform="translate(${x},${y})">${inner}</g></g>`;
  s += t(x + w / 2, y + h + 48, label, { size: 14, fill: C.sub, family: MONO, anchor: 'middle' });
  return s;
}
function mTop() {
  return t(24, 88, 'cubesight', { size: 16, fill: C.ink, family: SANS, weight: 800 }) + circle(262, 83.5, 3.5, C.acc) + t(272, 88, 'i3', { size: 12, fill: C.sub, family: MONO }) + battery(296, 78, 84, C.sub) + t(366, 88, '84%', { size: 11, fill: C.sub, family: MONO, anchor: 'end' });
}
function mobile() {
  const WW = 1440, HH = 960;
  const RR = { cx: 195, cy: 310, r: 112 };
  // inspection phone
  let a = mTop() + inspectionRing(RR, 9, { w: 6, thin: 2, ticks: false, lsize: 11 }) + cube(195, 310 + 32, 64, STATES.inspect, CUBE_O);
  a += t(24, 520, 'inspection', { size: 12, fill: C.acc, family: MONO, weight: 500 });
  a += t(18, 640, '6', { size: 130, fill: C.ink, family: SANS, weight: 300, tnum: 1 });
  a += t(110, 640, 's left', { size: 18, fill: C.sub, family: SANS, weight: 500 });
  a += circle(28, 681, 4, C.ink) + t(40, 686, '“8 seconds”', { size: 14, fill: C.ink, family: MONO, weight: 500 });
  a += `<line x1="24" y1="712" x2="366" y2="712" stroke="${C.line}"/>`;
  a += t(24, 740, 'cross hint · white · 6', { size: 12, fill: C.sub, family: MONO });
  a += t(24, 766, "F' R D2 L' B2 D", { size: 16, fill: C.acc, family: MONO, weight: 500 });
  // solving phone
  const into = 0.94;
  let s = mTop() + stepRing(RR, { state: i => (i < 3 ? 'done' : i === 3 ? 'current' : 'future'), frac: into / STEPS[3].avg, curText: fmt(into), noDelta: true }).replace(/font-size="12"/g, 'font-size="10.5"') + cube(195, 310 + 32, 64, STATES.f2l, CUBE_O);
  s += t(24, 520, 'f2l · pair 3 of 4', { size: 12, fill: C.acc, family: MONO, weight: 500 });
  s += t(18, 630, '6.69', { size: 112, fill: C.ink, family: SANS, weight: 300, tnum: 1, ls: -3 });
  s += t(24, 680, 'Pair 3', { size: 26, fill: C.ink, family: SANS, weight: 700 });
  s += `<rect x="118" y="660" width="116" height="26" rx="13" fill="${C.accSoft}"/>` + t(176, 677, 'pseudo · D′', { size: 11.5, fill: C.acc, family: MONO, weight: 500, anchor: 'middle' });
  s += `<line x1="24" y1="712" x2="366" y2="712" stroke="${C.line}"/>`;
  [['cross', '2.08'], ['p1', '1.71'], ['p2', '1.96'], ['p3', '0.94']].forEach(([k, v], i) => {
    const x = 24 + i * 88;
    s += t(x, 742, k, { size: 11, fill: i === 3 ? C.acc : C.sub, family: MONO });
    s += t(x, 766, v, { size: 16, fill: i === 3 ? C.acc : C.ink, family: MONO, weight: 500 });
  });
  s += t(24, 800, '31 moves · 4.64 tps', { size: 12, fill: C.sub, family: MONO });
  // results phone
  let r = mTop();
  r += t(24, 136, 'time', { size: 12, fill: C.sub, family: MONO });
  r += t(18, 214, '14.07', { size: 84, fill: C.acc, family: SANS, weight: 300, tnum: 1, ls: -2 });
  [['moves', '68'], ['tps', '4.83'], ['insp', '8.70'], ['ao12', '15.03']].forEach(([k, v], i) => {
    const x = 24 + i * 88;
    r += t(x, 254, k, { size: 11, fill: C.sub, family: MONO });
    r += t(x, 280, v, { size: 20, fill: C.ink, family: SANS, weight: 600, tnum: 1 });
  });
  r += tpsChart(40, 330, 326, 92, { lsize: 9, axis: false, bandLabels: false });
  r += t(24, 456, 'splits', { size: 12, fill: C.sub, family: MONO });
  r += splitBars(24, 484, 342, 22, { size: 11.5, labelW: 60, valW: 50, noDelta: true });
  r += `<line x1="24" y1="690" x2="366" y2="690" stroke="${C.line}"/>`;
  r += circle(28, 713, 3, C.ink) + t(40, 718, 'Cross: 8 moves, optimal was 6.', { size: 13, fill: C.ink, family: SANS, weight: 500 });
  r += t(40, 738, "F' R D2 L' B2 D", { size: 12, fill: C.acc, family: MONO, weight: 500 });
  r += `<rect x="24" y="764" width="342" height="52" rx="26" fill="${C.ink}"/>` + t(195, 796, 'Next scramble', { size: 16, fill: C.bg, family: SANS, weight: 700, anchor: 'middle' });
  let b = t(64, 48, 'orbit · portrait', { size: 14, fill: C.sub, family: MONO });
  b += phone(84, 80, a, 'inspection · ring drains, number below');
  b += phone(525, 80, s, 'solving · ring above, timer thumb-far');
  b += phone(966, 80, r, 'results · scrolls; next is thumb-reach');
  return svgT(WW, HH, b, { fonts: FONTS, bg: C.canvas });
}

// ============ 10 settings ============
function settings() {
  let b = topbar() + configBar(104);
  const X = 120;
  b += t(X, 176, 'settings', { size: 28, fill: C.ink, family: SANS, weight: 700, ls: -0.5 });
  b += t(X + 136, 176, 'wca defaults are marked ·  changes apply to the next scramble', { size: 14, fill: C.sub, family: SANS, weight: 500 });
  const groups = [
    ['method', [
      ['method', ['cfop', 'roux'], 0, 0],
      ['cross', ['cross', 'x-cross', 'xx-cross'], 0, 0],
      ['f2l pairs', ['standard', 'allow pseudo'], 1, 0],
      ['oll', ['1-look', '2-look'], 1, 0],
      ['pll', ['1-look', '2-look'], 1, 0],
    ]],
    ['inspection & penalties', [
      ['inspection', ['15 s', 'custom 10 s', 'unlimited', 'off'], 0, 0],
      ['overtime', ['wca +2 / dnf', 'count only', 'grace +3 s', 'auto-start'], 0, 0],
      ['callouts', ['off', '8 s · 12 s', '8 s · 12 s + voice'], 1, 1],
    ]],
    ['training', [
      ['scramble', ['guided', 'paste', 'free solve'], 0, 0],
      ['coach', ['live', 'after solve', 'off'], 0, 0],
      ['cross hint', ['during inspection', 'off'], 0, 0],
    ]],
    ['display', [
      ['timer', ['visible', 'hide while solving'], 0, 0],
      ['timeline', ['ring', 'off'], 0, 0],
      ['splits', ['vs average', 'vs pb', 'raw'], 0, 0],
    ]],
  ];
  const focusRow = 'overtime'; const optOffPad = 80;
  const colX = [120, 800], optOff = 150;
  const colGroups = [[groups[0], groups[1]], [groups[2], groups[3]]];
  colGroups.forEach((gs, ci) => {
    const CX = colX[ci], OX = CX + optOff;
    let y = 248;
    gs.forEach(([g, rows]) => {
      b += t(CX, y, g, { size: 12, fill: C.acc, family: MONO, weight: 500, ls: 1 });
      y += 40;
      rows.forEach(([k, opts, sel, def]) => {
        if (k === focusRow) b += `<rect x="${CX - 20}" y="${y - 22}" width="${620}" height="34" rx="8" fill="${C.band}"/>` + `<rect x="${CX - 20}" y="${y - 22}" width="3" height="34" rx="1.5" fill="${C.acc}"/>`;
        b += t(CX, y, k, { size: 14, fill: C.sub, family: MONO });
        let x = OX;
        opts.forEach((o, i) => {
          const on = i === sel;
          b += t(x, y, o, { size: 14, fill: on ? C.ink : C.sub, family: MONO, weight: on ? 500 : 400 });
          if (on) b += `<line x1="${x}" y1="${y + 7}" x2="${x + monoW(o, 14)}" y2="${y + 7}" stroke="${C.acc}" stroke-width="2"/>`;
          if (i === def && ['method', 'cross', 'inspection', 'overtime', 'callouts', 'oll', 'pll'].includes(k) && !(k === 'oll' || k === 'pll')) b += circle(x + monoW(o, 14) + 6, y - 13, 2.5, C.acc);
          x += monoW(o, 14) + 28;
        });
        y += 36;
      });
      y += 28;
    });
  });
  // live preview of the inspection ring for the current config (right column, below)
  const pcx = 880, pcy = 676;
  b += inspectionRing({ cx: pcx, cy: pcy, r: 56 }, 9, { w: 5, thin: 2, ticks: false, labels: false }) + overtimeZones({ cx: pcx, cy: pcy, r: 56 }, { band: 10 });
  b += t(pcx, pcy + 12, '6', { size: 34, fill: C.ink, family: SANS, weight: 300, anchor: 'middle' });
  b += t(976, pcy - 20, 'preview', { size: 12, fill: C.acc, family: MONO, weight: 500, ls: 1 });
  b += t(976, pcy + 8, '15 s inspection · calls at 8 and 12', { size: 14, fill: C.ink, family: MONO });
  b += t(976, pcy + 32, 'start after 15 s: +2  ·  after 17 s: dnf', { size: 14, fill: C.sub, family: MONO });
  b += `<line x1="120" y1="652" x2="720" y2="652" stroke="${C.line}"/>`;
  b += circle(123, 684, 2.5, C.acc) + t(134, 688, 'wca default', { size: 13, fill: C.sub, family: MONO });
  b += t(270, 688, 'presets', { size: 13, fill: C.sub, family: MONO });
  let px = 270 + optOffPad;
  for (const [n, on] of [['wca', 1], ['relaxed', 0], ['drill', 0], ['+ save current', 0]]) { b += t(px, 688, n, { size: 13, fill: on ? C.acc : C.ink, family: MONO, weight: on ? 500 : 400 }); if (on) b += `<line x1="${px}" y1="695" x2="${px + monoW(n, 13)}" y2="695" stroke="${C.acc}" stroke-width="2"/>`; px += monoW(n, 13) + 24; }
  b += t(120, 728, 'relaxed = unlimited inspection, count-only overtime. drill = inspection off, coach live.', { size: 13, fill: C.sub, family: SANS, weight: 500 });
  b += hints(860, [['↑↓', 'setting'], ['←→', 'option'], ['/', 'search'], ['esc', 'close']]);
  return svgT(W, H, b, { fonts: FONTS, bg: C.bg });
}

const DARK_SET = new Set(['01-idle', '03-inspection', '04-overtime', '06-solving', '07-skip', '08-results', '09-mobile', '10-settings']);
if (!DARK || DARK_SET.has('01-idle')) write(PFX + '01-idle.svg', idle());
if (!DARK || DARK_SET.has('02-scramble')) write(PFX + '02-scramble.svg', scramble());
if (!DARK || DARK_SET.has('03-inspection')) write(PFX + '03-inspection.svg', inspection());
if (!DARK || DARK_SET.has('04-overtime')) write(PFX + '04-overtime.svg', overtime());
if (!DARK || DARK_SET.has('05-inspection-variants')) write(PFX + '05-inspection-variants.svg', variants());
if (!DARK || DARK_SET.has('06-solving')) write(PFX + '06-solving.svg', solving());
if (!DARK || DARK_SET.has('07-skip')) write(PFX + '07-skip.svg', skip());
if (!DARK || DARK_SET.has('08-results')) write(PFX + '08-results.svg', results());
if (!DARK || DARK_SET.has('09-mobile')) write(PFX + '09-mobile.svg', mobile());
if (!DARK || DARK_SET.has('10-settings')) write(PFX + '10-settings.svg', settings());
