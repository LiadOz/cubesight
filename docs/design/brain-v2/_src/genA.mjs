// Direction A — "Mono": pure monkeytype-dark minimal.
import { cube, t, svg, write, MONO, SOLVE, SCRAMBLE, SCR_DONE, STATES, HISTORY, histLabel, histValue, cumulative, fmt, monoW, esc } from './lib.mjs';

// Theme: MONO_THEME=light → A-light-* frames.
const LIGHT = process.env.MONO_THEME === 'light';
const DARK_T = {
  bg: '#16171b', alt: '#1f2126', dim: '#34373f', sub: '#6b6f7a', text: '#d9d6cb',
  acc: '#e7b34c', accDim: '#6b5424', err: '#e0675e', errDim: '#5a2d2a',
  cubeBody: '#0b0c0e', bezel: '#2c2f36', canvas: '#101114',
};
const LIGHT_T = {
  bg: '#f1eee6', alt: '#e8e5dc', dim: '#cbc6ba', sub: '#625f58', text: '#2b2a27',
  acc: '#8a5e07', accDim: '#f3e6c4', err: '#b8392f', errDim: '#f7e0db',
  cubeBody: '#1b1c1f', bezel: '#2b2a27', canvas: '#e4e0d6',
};
const C = LIGHT ? LIGHT_T : DARK_T;
const LIGHT_SET = ['A-01-idle', 'A-06-solving', 'A-08-results', 'A-09-mobile', 'A-10-settings'];
const PAL = { w: '#e8e6de', y: '#f2c94c', g: '#3fa66a', b: '#3d6fd6', r: '#d9534a', o: '#e98a3c', '.': '#2a2d33' };
const W = 1440, H = 900, X0 = 160, XW = 1120;
const FONTS = ['mono300', 'mono400', 'mono500'];
const m = (x, y, s, o = {}) => t(x, y, s, { family: MONO, size: 14, fill: C.sub, ...o });
const cb = (cx, cy, s, st, o = {}) => cube(cx, cy, s, st, { palette: PAL, body: C.cubeBody, gap: 0.1, ...o });

// ---------- chrome ----------
function logo(x, y, s = 4) {
  let o = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    o += `<rect x="${x + c * (s + 2)}" y="${y + r * (s + 2)}" width="${s}" height="${s}" rx="1" fill="${(r === 1 && c === 1) ? C.acc : C.sub}"/>`;
  return o;
}
function battery(x, y, pct) {
  return `<rect x="${x}" y="${y}" width="22" height="11" rx="2.5" fill="none" stroke="${C.sub}" stroke-width="1.2"/><rect x="${x + 22.5}" y="${y + 3.5}" width="2" height="4" rx="1" fill="${C.sub}"/><rect x="${x + 2}" y="${y + 2}" width="${18 * pct / 100}" height="7" rx="1.2" fill="${C.sub}"/>`;
}
function topbar({ dim = false, active = 'brain' } = {}) {
  const op = dim ? 0.35 : 1;
  let o = `<g opacity="${op}">`;
  o += logo(X0, 38);
  o += m(X0 + 28, 52, 'cubesight', { size: 20, fill: C.text, weight: 500, ls: -0.5 });
  const nav = ['brain', 'history', 'trainers', 'settings'];
  let x = X0 + 180;
  for (const n of nav) { o += m(x, 51, n, { size: 13, fill: n === active ? C.text : C.sub }); x += monoW(n, 13) + 24; }
  // device
  const dx = X0 + XW;
  o += `<circle cx="${dx - 176}" cy="47" r="3.5" fill="${C.acc}"/>`;
  o += m(dx - 164, 51, 'GAN 356 i3', { size: 13 });
  o += battery(dx - 72, 41, 84);
  o += m(dx, 51, '84%', { size: 13, anchor: 'end' });
  return o + '</g>';
}
function keycap(x, y, label, o = {}) {
  const w = Math.max(24, monoW(label, 12) + 14);
  return `<rect x="${x}" y="${y - 15}" width="${w}" height="22" rx="4" fill="${o.bg || C.alt}"/>` +
    m(x + w / 2, y, label, { size: 12, fill: o.fill || C.text, anchor: 'middle' });
}
const keyW = label => Math.max(24, monoW(label, 12) + 14);
// row of "key — action" hints, centred
function hints(y, items, cx = W / 2) {
  const parts = items.map(([k, a]) => ({ k, a, w: keyW(k) + 8 + monoW(a, 12) }));
  const total = parts.reduce((s, p) => s + p.w, 0) + (parts.length - 1) * 32;
  let x = cx - total / 2, o = '';
  for (const p of parts) { o += keycap(x, y, p.k) + m(x + keyW(p.k) + 8, y, p.a, { size: 12 }); x += p.w + 32; }
  return o;
}
// monkeytype-style config bar. groups: [[label, on], ...][]
function configBar(y, groups, { dim = false, cx = W / 2 } = {}) {
  const fs = 13, gapI = 18, gapG = 20;
  let w = 32;
  groups.forEach((g, gi) => { g.forEach(([l], i) => { w += monoW(l, fs) + (i ? gapI : 0); }); if (gi) w += gapG * 2 + 2; });
  let x = cx - w / 2, o = `<g opacity="${dim ? 0.35 : 1}"><rect x="${x}" y="${y - 22}" width="${w}" height="36" rx="8" fill="${C.alt}"/>`;
  x += 16;
  groups.forEach((g, gi) => {
    if (gi) { o += `<rect x="${x + gapG}" y="${y - 12}" width="2" height="16" rx="1" fill="${C.dim}"/>`; x += gapG * 2 + 2; }
    g.forEach(([l, on], i) => { if (i) x += gapI; o += m(x, y, l, { size: fs, fill: on ? C.acc : C.sub }); x += monoW(l, fs); });
  });
  return o + '</g>';
}
const DEFAULT_CFG = [
  [['cfop', 1], ['roux', 0]],
  [['cross', 1], ['x-cross', 0]],
  [['pseudo pairs', 1]],
  [['oll', 0], ['2-look', 1]],
  [['pll', 0], ['2-look', 1]],
  [['insp', 0], ['15', 1], ['wca', 1]],
  [['coach', 1]],
];

// ---------- timeline (solve lane) ----------
const STEPS = SOLVE.steps;
const GROUPS = [['cross', [0]], ['f2l', [1, 2, 3, 4]], ['oll · 2-look', [5, 6]], ['pll · 2-look', [7, 8]]];
function laneGeom(x0 = X0, w = XW, seg = 6, grp = 16) {
  const totalAvg = STEPS.reduce((s, x) => s + x.avg, 0);
  const inner = 5, outer = 3;
  const pxs = (w - inner * seg - outer * grp) / totalAvg;
  const g = []; let x = x0;
  GROUPS.forEach(([, idx], gi) => {
    if (gi) x += grp;
    idx.forEach((i, k) => { if (k) x += seg; const sw = STEPS[i].avg * pxs; g[i] = { x, w: sw }; x += sw; });
  });
  return { g, pxs };
}
const stepLabel = i => ['cross', 'pair 1', 'pair 2', 'pair 3', 'pair 4', 'eo', 'co', 'cp', 'ep'][i];
// state: { done: n (steps completed), cur: index, curT: seconds into current, skipped: Set, opacity, showSplits }
function solveLane(y, st = {}) {
  const { g } = laneGeom(st.x0 ?? X0, st.w ?? XW, st.seg ?? 6, st.grp ?? 16);
  const done = st.done ?? 0, cur = st.cur ?? -1;
  let o = `<g opacity="${st.opacity ?? 1}">`;
  // group labels
  if (!st.noGroups) GROUPS.forEach(([name, idx]) => {
    const a = g[idx[0]].x, b = g[idx[idx.length - 1]].x + g[idx[idx.length - 1]].w;
    if (idx.length > 1) {
      o += m(a, y - 40, name, { size: 11, fill: C.dim });
      o += `<rect x="${a + monoW(name, 11) + 8}" y="${y - 44}" width="${b - a - monoW(name, 11) - 8}" height="1" fill="${C.dim}"/>`;
    }
  });
  STEPS.forEach((s, i) => {
    const { x, w } = g[i];
    const isDone = i < done, isCur = i === cur, skipped = st.skipped?.has(i);
    const labelFill = isCur ? C.acc : isDone ? C.text : C.sub;
    if (skipped) {
      // collapsed to a spark
      const cx = x + w / 2;
      o += `<rect x="${x}" y="${y - 1}" width="${w}" height="2" rx="1" fill="${C.dim}" opacity="0.6"/>`;
      o += spark(cx, y, 7, C.acc);
      o += m(cx, y - 16, 'eo', { size: 12, fill: C.acc, anchor: 'middle' });
      if (st.showSplits !== false) o += m(cx, y + 28, 'skip', { size: 13, fill: C.acc, anchor: 'middle' });
      return;
    }
    o += `<rect x="${x}" y="${y - 3}" width="${w}" height="6" rx="3" fill="${C.dim}"/>`;
    o += m(x, y - 16, stepLabel(i), { size: 12, fill: labelFill });
    if (s.pseudo && (isDone || isCur || st.pseudoHint)) {
      o += m(x + monoW(stepLabel(i), 12) + 8, y - 16, 'pseudo', { size: 11, fill: isCur ? C.acc : C.sub, opacity: isCur ? 0.75 : 0.8 });
    }
    if (isDone) {
      o += `<rect x="${x}" y="${y - 3}" width="${w}" height="6" rx="3" fill="${C.acc}" opacity="${st.doneOpacity ?? 0.9}"/>`;
      if (st.showSplits !== false) {
        o += m(x, y + 28, fmt(s.t), { size: 15, fill: C.text });
        const d = s.t - s.avg;
        o += m(x, y + 48, (d <= 0 ? '−' : '+') + Math.abs(d).toFixed(2), { size: 12, fill: d <= 0 ? C.acc : C.err });
      }
    } else if (isCur) {
      const fw = Math.min(w, w * st.curT / s.avg);
      o += `<rect x="${x}" y="${y - 3}" width="${fw}" height="6" rx="3" fill="${C.acc}"/>`;
      o += `<rect x="${x + fw - 1}" y="${y - 11}" width="3" height="22" rx="1.5" fill="${C.acc}"/>`;
      if (st.showSplits !== false) o += m(x, y + 28, st.curT.toFixed(2), { size: 15, fill: C.acc });
    }
  });
  return o + '</g>';
}
function spark(cx, cy, r, fill) {
  const k = r * 0.28;
  return `<path d="M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r}Z" fill="${fill}"/>`;
}

// ---------- inspection lane ----------
// 0..limit s scaled; zones after limit. opts: elapsed, limit, mode ('wca'|'count'|'grace'|'unlimited'|'auto'), grace
function hatch(id, color, op = 0.55) {
  return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" fill="${color}" opacity="${op}"/></pattern>`;
}
function inspLane(y, o) {
  const x0 = o.x0 ?? X0, w = o.w ?? XW;
  const limit = o.limit ?? 15, mode = o.mode ?? 'wca', el = o.elapsed;
  const small = o.small;
  const fsz = small ? 11 : 12;
  let out = `<defs>${hatch('hE' + o.id, C.err)}${hatch('hS' + o.id, C.sub, 0.7)}</defs>`;
  if (mode === 'unlimited') {
    const span = o.span ?? 30, px = w / span;
    // ruler
    out += `<rect x="${x0}" y="${y - 2}" width="${w}" height="4" rx="2" fill="${C.dim}" opacity="0.5"/>`;
    out += `<rect x="${x0}" y="${y - 2}" width="${el * px}" height="4" rx="2" fill="${C.acc}"/>`;
    out += `<rect x="${x0 + el * px - 1}" y="${y - 9}" width="3" height="18" rx="1.5" fill="${C.acc}"/>`;
    for (let s = 0; s <= span; s += 5) {
      out += `<rect x="${x0 + s * px}" y="${y + 8}" width="1" height="5" fill="${C.sub}"/>`;
      out += m(x0 + s * px, y + 28, s + (s === span ? '+' : ''), { size: fsz, anchor: s === 0 ? 'start' : 'middle' });
    }
    return out;
  }
  const pen = mode === 'wca' ? 2 : 0;           // +2 zone length
  const grace = mode === 'grace' ? (o.grace ?? 3) : 0;
  const over = mode === 'count' ? 4 : mode === 'auto' ? 0 : pen ? 2 : grace;
  const tail = mode === 'wca' || (mode === 'grace' && o.gracePenalty) ? 1.6 : mode === 'count' ? 0.6 : mode === 'auto' ? 3 : 0;
  const px = w / (limit + over + tail);
  const lx = x0 + limit * px;
  // base track
  out += `<rect x="${x0}" y="${y - 3}" width="${limit * px}" height="6" rx="3" fill="${C.dim}"/>`;
  // remaining (accent) = elapsed..limit
  if (el < limit) {
    out += `<rect x="${x0 + el * px}" y="${y - 3}" width="${(limit - el) * px}" height="6" rx="3" fill="${C.acc}"/>`;
    out += `<rect x="${x0 + el * px - 1}" y="${y - 11}" width="3" height="22" rx="1.5" fill="${C.text}"/>`;
  }
  // ticks at 0 and limit
  out += m(x0, y + 28, '0', { size: fsz });
  out += m(lx, y + 28, String(limit), { size: fsz, anchor: 'middle', fill: C.text });
  // callouts
  if (o.callouts) for (const c of [8, 12]) if (c < limit) {
    const cx = x0 + c * px, passed = el >= c;
    out += `<rect x="${cx - 0.5}" y="${y - 12}" width="1.5" height="24" fill="${passed ? C.text : C.sub}" opacity="${passed ? 0.9 : 0.6}"/>`;
    out += m(cx, y + 28, c + 's', { size: fsz, anchor: 'middle', fill: passed ? C.text : C.sub });
  }
  if (mode === 'wca' || (mode === 'grace' && o.gracePenalty)) {
    const zx = lx + 6, zw = (mode === 'wca' ? 2 : grace) * px - 6;
    if (mode === 'grace') {
      out += `<rect x="${zx}" y="${y - 3}" width="${zw}" height="6" rx="3" fill="url(#hS${o.id})"/>`;
      out += m(zx + zw / 2, y - 16, `grace ${grace}s`, { size: fsz, anchor: 'middle', fill: C.sub });
    } else {
      out += `<rect x="${zx}" y="${y - 3}" width="${zw}" height="6" rx="3" fill="${C.errDim}"/>`;
      out += m(zx + zw / 2, y - 16, '+2', { size: fsz, anchor: 'middle', fill: C.err });
    }
    const dx = zx + zw + 6, dw = x0 + w - dx;
    out += `<rect x="${dx}" y="${y - 3}" width="${dw}" height="6" rx="3" fill="url(#hE${o.id})"/>`;
    out += m(dx + dw / 2, y - 16, mode === 'wca' ? 'dnf' : '+2', { size: fsz, anchor: 'middle', fill: C.err });
    out += m(zx + zw + 3, y + 28, String(limit + (mode === 'wca' ? 2 : grace)), { size: fsz, anchor: 'middle', fill: C.err });
    if (el > limit) {
      const ex = lx + 6 + (el - limit) * px;
      out += `<rect x="${lx + 6}" y="${y - 3}" width="${ex - lx - 6}" height="6" rx="3" fill="${C.err}"/>`;
      out += `<rect x="${ex - 1}" y="${y - 11}" width="3" height="22" rx="1.5" fill="${C.text}"/>`;
    }
  } else if (mode === 'grace') {
    const zx = lx + 6, zw = grace * px - 6;
    out += `<rect x="${zx}" y="${y - 3}" width="${zw}" height="6" rx="3" fill="url(#hS${o.id})"/>`;
    out += m(x0 + w, y - 16, `grace ${grace}s · no penalty`, { size: fsz, anchor: 'end' });
    if (el > limit) {
      const ex = zx + (el - limit) * px;
      out += `<rect x="${zx}" y="${y - 3}" width="${ex - zx}" height="6" rx="3" fill="${C.text}" opacity="0.8"/>`;
      out += `<rect x="${ex - 1}" y="${y - 11}" width="3" height="22" rx="1.5" fill="${C.text}"/>`;
    }
  } else if (mode === 'auto') {
    const zx = lx + 8, zw = x0 + w - zx;
    out += `<rect x="${zx}" y="${y - 3}" width="${zw}" height="6" rx="3" fill="${C.dim}"/>`;
    out += `<path d="M${lx - 2} ${y - 12} l0 24" stroke="${C.acc}" stroke-width="2"/>`;
    out += m(zx, y - 16, '▸ solve', { size: fsz, fill: C.acc });
  } else if (mode === 'count') {
    for (let k = 1; k <= 4; k++) {
      const kx = lx + k * px;
      out += `<rect x="${kx - 0.5}" y="${y - 6}" width="1" height="12" fill="${C.sub}"/>`;
      out += m(kx, y + 28, '+' + k, { size: fsz, anchor: 'middle', fill: el - limit >= k ? C.text : C.sub });
    }
    out += `<rect x="${lx + 4}" y="${y - 1}" width="${(over + tail) * px - 4}" height="2" rx="1" fill="${C.dim}"/>`;
    if (el > limit) {
      const ex = lx + (el - limit) * px;
      out += `<rect x="${lx + 4}" y="${y - 3}" width="${ex - lx - 4}" height="6" rx="3" fill="${C.text}" opacity="0.75"/>`;
      out += `<rect x="${ex - 1}" y="${y - 11}" width="3" height="22" rx="1.5" fill="${C.text}"/>`;
    }
  }
  return out;
}

// ============ FRAMES ============
const frames = {};
function wrap(str, n) { const out = []; let cur = ''; for (const w of str.split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; }

// 1 — idle / connected
frames['A-01-idle'] = () => {
  let b = topbar();
  b += configBar(128, DEFAULT_CFG);
  b += cb(W / 2, 384, 128, STATES.solved);
  b += m(W / 2, 560, 'cube solved · scramble 24 ready', { size: 13, anchor: 'middle' });
  // primary action
  const bw = 256, bx = W / 2 - bw / 2;
  b += `<rect x="${bx}" y="604" width="${bw}" height="48" rx="8" fill="none" stroke="${C.acc}" stroke-width="1.5"/>`;
  b += m(bx + 24, 634, 'start scramble', { size: 16, fill: C.acc });
  b += keycap(bx + bw - 24 - keyW('space'), 633, 'space', { bg: C.accDim, fill: C.acc });
  // last results whisper
  const row = [['last', '14.07'], ['ao5', '14.62'], ['ao12', '15.03'], ['pb', '12.41'], ['today', '23 solves']];
  let x = W / 2 - 300;
  const tot = row.reduce((s, [a, v]) => s + monoW(a, 13) + 8 + monoW(v, 13), 0) + (row.length - 1) * 40;
  x = W / 2 - tot / 2;
  for (const [a, v] of row) { b += m(x, 716, a, { size: 13 }); x += monoW(a, 13) + 8; b += m(x, 716, v, { size: 13, fill: C.text }); x += monoW(v, 13) + 40; }
  b += hints(844, [['tab', 'settings'], ['c', 'coach hints'], ['h', 'history'], ['esc', 'command line']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
};

// 2 — guided scramble with a wrong turn
frames['A-02-scramble'] = () => {
  let b = topbar({ dim: true });
  b += m(W / 2, 140, 'scramble 24 · 12 / 20', { size: 13, anchor: 'middle' });
  b += cb(W / 2, 330, 100, STATES.midScramble);
  // scramble tokens, two lines of 10
  const fs = 36, slot = 96, perLine = 10;
  const sx = W / 2 - (slot * perLine) / 2 + 12;
  SCRAMBLE.forEach((mv, i) => {
    const line = Math.floor(i / perLine), col = i % perLine;
    const x = sx + col * slot, y = 520 + line * 80;
    let fill = C.text;
    if (i < SCR_DONE) fill = C.dim;
    if (i === SCR_DONE) fill = C.err;
    b += m(x, y, mv, { size: fs, fill, weight: 400 });
    if (i === SCR_DONE) {
      // caret under current, and the recovery tag above it
      b += `<rect x="${x}" y="${y + 12}" width="${monoW(mv, fs)}" height="3" rx="1.5" fill="${C.err}"/>`;
      const tagW = 116, tx = x + monoW(mv, fs) / 2 - tagW / 2;
      b += `<path d="M${x + monoW(mv, fs) / 2 - 6} ${y + 34} l6 -7 l6 7z" fill="${C.errDim}"/>`;
      b += `<rect x="${tx}" y="${y + 34}" width="${tagW}" height="34" rx="6" fill="${C.errDim}"/>`;
      b += m(tx + 12, y + 56, 'do', { size: 13, fill: C.err });
      b += m(tx + 38, y + 57, 'L2', { size: 18, fill: C.text, weight: 500 });
      b += m(tx + tagW - 12, y + 56, 'fix', { size: 13, fill: C.err, anchor: 'end' });
    }
  });
  b += m(W / 2, 736, "you turned L instead of L' — turn L2 and carry on", { size: 14, fill: C.err, anchor: 'middle' });
  b += m(W / 2, 764, 'the cube mirror and move list resync automatically; no need to restart', { size: 13, anchor: 'middle' });
  b += hints(844, [['esc', 'cancel'], ['n', 'new scramble'], ['p', 'paste scramble']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
};

// shared solving layout pieces
function bigNumber(y, str, fill, size = 168) { return m(W / 2, y, str, { size, fill, anchor: 'middle', weight: 300, ls: -4 }); }

// 3 — inspection countdown (timeline has swooped in)
frames['A-03-inspection'] = () => {
  let b = topbar({ dim: true });
  b += cb(W / 2, 214, 76, STATES.inspect);
  b += m(W / 2, 340, 'inspection', { size: 14, anchor: 'middle', fill: C.sub });
  b += bigNumber(500, '6', C.acc);
  b += m(W / 2, 548, 'turn any face to start · 8 s called', { size: 14, anchor: 'middle' });
  // cross hint
  b += m(W / 2 - 8, 584, 'cross hint', { size: 13, anchor: 'end' });
  b += keycap(W / 2 + 8, 584, 'tab');
  b += m(W / 2 + 8 + keyW('tab') + 10, 584, 'white · 6 moves', { size: 13, fill: C.text });
  // inspection lane
  b += inspLane(684, { id: 'i3', elapsed: 8.6, limit: 15, mode: 'wca', callouts: true });
  // plan lane (ghost)
  b += solveLane(800, { opacity: 0.45, showSplits: false, pseudoHint: true });
  b += m(X0 + XW, 870, 'ghost segments = your average pace per step', { size: 11, anchor: 'end', fill: C.dim });
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
};

// 4 — overtime (WCA)
frames['A-04-overtime'] = () => {
  let b = topbar({ dim: true });
  b += cb(W / 2, 214, 76, STATES.inspect);
  b += m(W / 2, 340, 'overtime', { size: 14, anchor: 'middle', fill: C.err });
  b += bigNumber(500, '+1', C.err);
  b += m(W / 2, 548, 'starting now = +2 penalty · dnf in 1.2 s', { size: 14, anchor: 'middle', fill: C.err });
  b += m(W / 2, 584, 'wca rules · change in settings → inspection', { size: 13, anchor: 'middle' });
  b += inspLane(684, { id: 'i4', elapsed: 15.8, limit: 15, mode: 'wca', callouts: true });
  b += solveLane(800, { opacity: 0.45, showSplits: false, pseudoHint: true });
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
};

// 5 — inspection variants sheet
frames['A-05-inspection-variants'] = () => {
  let b = topbar({ dim: true, active: 'settings' });
  b += m(X0, 124, 'inspection · the timeline follows your config', { size: 20, fill: C.text });
  b += m(X0, 150, 'wca is the default. every row is the same lane in a different setting; the readout is what the big number shows.', { size: 13 });
  const rows = [
    ['wca · default', 'insp 15 · overtime wca', '+2 at 15 s, dnf after 17 s', { mode: 'wca', elapsed: 8.6 }, '6', C.acc],
    ['custom length', 'insp 10 · overtime wca', 'same rules, shifted to your limit', { mode: 'wca', limit: 10, elapsed: 7.2 }, '3', C.acc],
    ['unlimited', 'insp ∞', 'counts up, never penalises', { mode: 'unlimited', elapsed: 23.4, span: 30 }, '23.4', C.text],
    ['count only', 'overtime count', '+1 +2 +3… shown, no penalty', { mode: 'count', elapsed: 17.4 }, '+2', C.text],
    ['grace period', 'overtime grace 3 s', 'extra time before anything happens', { mode: 'grace', grace: 3, elapsed: 16.4 }, 'grace 1.6', C.text],
    ['auto-start', 'overtime auto-start', 'clock starts itself when inspection ends', { mode: 'auto', elapsed: 11.1 }, '4 → go', C.acc],
    ['judge callouts', 'callouts 8 s · 12 s', 'spoken + flashed, like a wca judge', { mode: 'wca', elapsed: 12.3, callouts: true }, '"12 seconds"', C.text],
  ];
  const lx = X0 + 380, lw = XW - 380 - 170;
  rows.forEach(([name, cfg, desc, lane, read, rf], i) => {
    const y = 222 + i * 86;
    b += m(X0, y - 14, name, { size: 16, fill: C.text });
    b += m(X0, y + 8, cfg, { size: 12, fill: C.acc });
    b += m(X0, y + 28, desc, { size: 12 });
    b += inspLane(y, { id: 'v' + i, x0: lx, w: lw, limit: lane.limit ?? 15, ...lane, small: true });
    b += m(X0 + XW, y + 6, read, { size: 22, fill: rf, anchor: 'end', weight: 300 });
    b += `<rect x="${X0}" y="${y + 50}" width="${XW}" height="1" fill="${C.alt}"/>`;
  });
  b += `<rect x="${X0}" y="${222 + 6 * 86 + 50}" width="${XW}" height="1" fill="${C.alt}"/>`;
  // off row
  const y = 222 + rows.length * 86;
  b += m(X0, y - 14, 'off', { size: 16, fill: C.text });
  b += m(X0, y + 8, 'insp off', { size: 12, fill: C.acc });
  b += m(X0, y + 28, 'no lane; the solve clock starts on first turn', { size: 12 });
  b += solveLane(y + 8, { x0: lx, w: lw, seg: 4, grp: 10, opacity: 0.5, showSplits: false, noGroups: true });
  b += m(X0 + XW, y + 14, '0.00', { size: 22, fill: C.text, anchor: 'end', weight: 300 });
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
};

// 6 — solving, F2L pair 3 (pseudo)
function solvingFrame(o) {
  let b = topbar({ dim: true });
  b += cb(W / 2, 214, 76, o.state);
  b += m(W / 2, 340, o.stepLine, { size: 14, anchor: 'middle', fill: C.acc, raw: true });
  b += bigNumber(500, o.time, C.text);
  b += m(W / 2, 548, o.sub, { size: 14, anchor: 'middle' });
  if (o.extra) b += o.extra;
  b += m(X0, 684, 'insp 8.7', { size: 12, fill: C.dim });
  b += solveLane(740, o.lane);
  b += hints(862, [['esc', 'abort · dnf'], ['t', 'hide timer'], ['c', 'coach off']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
}
frames['A-06-solving'] = () => solvingFrame({
  state: STATES.f2l, time: '6.91',
  stepLine: 'f2l · pair 3 <tspan fill="' + C.sub + '">· pseudo · d′ aligned</tspan>',
  sub: '31 moves · 4.49 tps',
  extra: m(W / 2, 584, 'coach · blue-orange pair is already connected', { size: 13, anchor: 'middle', fill: C.sub }),
  lane: { done: 3, cur: 3, curT: 1.16 },
});
frames['A-07-skip'] = () => {
  const { g } = laneGeom();
  const e = g[5];
  const extra = m(W / 2, 584, 'co 1.64 · sune', { size: 13, anchor: 'middle' }) +
    // toast above the eo sliver
    `<g transform="translate(${e.x + e.w / 2} 668)">${spark(-44, -5, 6, C.acc)}${m(-32, 0, 'eo skip', { size: 13, fill: C.acc })}</g>`;
  return solvingFrame({
    state: STATES.pll, time: '11.96',
    stepLine: 'pll · corners',
    sub: '57 moves · 4.77 tps',
    extra,
    lane: { done: 7, cur: 7, curT: 0.74, skipped: new Set([5]) },
  });
};

// 8 — results
frames['A-08-results'] = () => {
  let b = topbar();
  // left stats column
  const L = X0;
  b += m(L, 136, 'time', { size: 16 });
  b += m(L - 4, 212, '14.07', { size: 80, fill: C.acc, weight: 300, ls: -3 });
  b += m(L, 264, 'moves', { size: 16 });
  b += m(L, 304, '68', { size: 36, fill: C.acc, weight: 300 });
  b += m(L + 120, 264, 'tps', { size: 16 });
  b += m(L + 120, 304, '4.83', { size: 36, fill: C.acc, weight: 300 });
  b += m(L, 352, 'inspection', { size: 13 });
  b += m(L, 376, '8.7 s · ok', { size: 16, fill: C.text });
  b += m(L + 120, 352, 'method', { size: 13 });
  b += m(L + 120, 376, 'cfop 2-look', { size: 16, fill: C.text });
  // chart
  const cx0 = X0 + 300, cw = XW - 300, cy0 = 112, ch = 256;
  const T = SOLVE.time, px = cw / T, maxY = 8, py = ch / maxY;
  const ends = cumulative(STEPS);
  // step bands
  let prev = 0;
  STEPS.forEach((s, i) => {
    const x = cx0 + prev * px, w = s.t * px;
    if (i % 2 === 0 && w > 0) b += `<rect x="${x}" y="${cy0}" width="${w}" height="${ch}" fill="${C.alt}" opacity="0.6"/>`;
    const lab = ['x', 'p1', 'p2', 'p3', 'p4', '', 'co', 'cp', 'ep'][i];
    if (w > 0) b += m(x + w / 2, cy0 + ch + 20, lab, { size: 11, anchor: 'middle', fill: s.pseudo ? C.acc : C.sub });
    prev = ends[i];
  });
  // eo skip marker at boundary
  const skipX = cx0 + ends[4] * px;
  b += spark(skipX, cy0 + ch + 16, 5, C.acc);
  // gridlines + y axis
  for (let v = 0; v <= maxY; v += 2) {
    const y = cy0 + ch - v * py;
    b += `<rect x="${cx0}" y="${y}" width="${cw}" height="1" fill="${C.dim}" opacity="${v ? 0.5 : 1}"/>`;
    b += m(cx0 - 12, y + 4, String(v), { size: 11, anchor: 'end' });
  }
  b += m(cx0 - 12, cy0 - 14, 'tps', { size: 11, anchor: 'end' });
  // avg pace line (dashed) — your mean tps per step
  const avgTps = [3.3, 3.9, 4.2, 4.0, 4.3, 4.5, 5.1, 5.3, 5.6];
  let apts = [], p0 = 0;
  STEPS.forEach((s, i) => { if (!s.t) { p0 = ends[i]; return; } apts.push([cx0 + p0 * px, avgTps[i]], [cx0 + ends[i] * px, avgTps[i]]); p0 = ends[i]; });
  b += `<polyline points="${apts.map(([x, v]) => `${x.toFixed(1)},${(cy0 + ch - v * py).toFixed(1)}`).join(' ')}" fill="none" stroke="${C.sub}" stroke-width="1.5" stroke-dasharray="4 4"/>`;
  // tps curve
  const raw = SOLVE.tpsCurve, sm = raw.map((v, i) => 0.25 * (raw[i - 1] ?? v) + 0.5 * v + 0.25 * (raw[i + 1] ?? v));
  const pts = sm.map((v, i) => [cx0 + Math.min(T, i * 0.5) * px, cy0 + ch - v * py]);
  const d = pts.map(([x, y], i) => {
    if (!i) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p3 = pts[i + 1] || [x, y];
    const c1 = [p1[0] + (x - p0[0]) / 6, p1[1] + (y - p0[1]) / 6], c2 = [x - (p3[0] - p1[0]) / 6, y - (p3[1] - p1[1]) / 6];
    return `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  b += `<path d="${d} L${pts.at(-1)[0]} ${cy0 + ch} L${cx0} ${cy0 + ch}Z" fill="${C.acc}" opacity="0.07"/>`;
  b += `<path d="${d}" fill="none" stroke="${C.acc}" stroke-width="2.5" stroke-linejoin="round"/>`;
  // pause annotation on pair 4
  const [pauseX, pauseY] = pts[18];
  b += `<circle cx="${pauseX}" cy="${pauseY}" r="4.5" fill="${C.bg}" stroke="${C.err}" stroke-width="2"/>`;
  b += m(pauseX, pauseY + 26, '0.9 s pause', { size: 11, fill: C.err, anchor: 'middle' });
  // legend
  b += `<rect x="${cx0 + cw - 250}" y="${cy0 - 19}" width="16" height="3" fill="${C.acc}"/>` + m(cx0 + cw - 228, cy0 - 14, 'this solve', { size: 11 });
  b += `<rect x="${cx0 + cw - 124}" y="${cy0 - 19}" width="16" height="2" fill="${C.sub}"/>` + m(cx0 + cw - 102, cy0 - 14, 'your avg', { size: 11 });

  // split columns
  const sy = 440;
  b += m(X0, sy - 20, 'splits', { size: 13 });
  const colW = XW / 9;
  STEPS.forEach((s, i) => {
    const x = X0 + i * colW;
    b += m(x, sy + 8, stepLabel(i) + (s.pseudo ? '*' : ''), { size: 12, fill: s.pseudo ? C.acc : C.sub });
    if (s.skip) {
      b += spark(x + 8, sy + 36, 7, C.acc);
      b += m(x + 22, sy + 42, 'skip', { size: 22, fill: C.acc, weight: 300 });
      b += m(x, sy + 64, 'avg 0.98', { size: 11 });
      return;
    }
    b += m(x, sy + 42, fmt(s.t), { size: 22, fill: C.text, weight: 300 });
    const d = s.t - s.avg;
    b += m(x, sy + 64, (d <= 0 ? '−' : '+') + Math.abs(d).toFixed(2), { size: 11, fill: d <= 0 ? C.acc : C.err });
    b += m(x + 56, sy + 64, s.mv + ' mv', { size: 11 });
    // bar vs avg
    const bw = colW - 24, scale = bw / 2.6;
    b += `<rect x="${x}" y="${sy + 76}" width="${bw}" height="4" rx="2" fill="${C.alt}"/>`;
    b += `<rect x="${x}" y="${sy + 76}" width="${s.t * scale}" height="4" rx="2" fill="${d <= 0 ? C.acc : C.err}"/>`;
    b += `<rect x="${x + s.avg * scale - 1}" y="${sy + 71}" width="2" height="14" fill="${C.text}" opacity="0.7"/>`;
  });
  b += m(X0 + XW, sy - 20, '* pseudo pair   | = your average', { size: 11, anchor: 'end' });

  // averages + sparkline
  const ay = 600;
  const avs = [['ao5', '14.62'], ['ao12', '15.03'], ['pb', '12.41'], ['mean', '15.21']];
  avs.forEach(([k, v], i) => { const x = X0 + i * 120; b += m(x, ay, k, { size: 13 }); b += m(x, ay + 34, v, { size: 26, fill: i === 0 ? C.acc : C.text, weight: 300 }); });
  // sparkline of history
  const sx0 = X0, sw = 440, sy0 = 668, sh = 64;
  const vals = HISTORY.map(histValue).filter(v => v != null);
  const lo = 12, hi = 20;
  const hx = i => sx0 + i * (sw / (HISTORY.length - 1));
  const hy = v => sy0 + sh - (v - lo) / (hi - lo) * sh;
  let pl = '';
  HISTORY.forEach((h, i) => { const v = histValue(h); if (v != null) pl += `${hx(i).toFixed(1)},${hy(v).toFixed(1)} `; });
  b += `<polyline points="${pl}" fill="none" stroke="${C.sub}" stroke-width="1.5" stroke-linejoin="round"/>`;
  HISTORY.forEach((h, i) => {
    const v = histValue(h);
    if (h.pen === 'DNF') { b += m(hx(i), sy0 + sh + 2, '×', { size: 14, anchor: 'middle', fill: C.err }); return; }
    if (h.pen) b += `<circle cx="${hx(i)}" cy="${hy(v)}" r="3" fill="${C.err}"/>`;
  });
  b += `<circle cx="${hx(HISTORY.length - 1)}" cy="${hy(14.07)}" r="4" fill="${C.acc}"/>`;
  b += `<circle cx="${hx(16)}" cy="${hy(12.41)}" r="3" fill="none" stroke="${C.text}" stroke-width="1.5"/>`;
  b += m(sx0, sy0 + sh + 28, 'last 23 · ', { size: 11 }) +
    m(sx0 + monoW('last 23 · ', 11), sy0 + sh + 28, '● +2', { size: 11, fill: C.err }) +
    m(sx0 + monoW('last 23 · ● +2  ', 11), sy0 + sh + 28, '× dnf', { size: 11, fill: C.err }) +
    m(sx0 + monoW('last 23 · ● +2  × dnf  ', 11), sy0 + sh + 28, '○ pb', { size: 11 });
  // recent list with penalties
  const recent = HISTORY.slice(-6).reverse();
  let rx = X0 + 520;
  b += m(rx, ay, 'recent', { size: 13 });
  recent.forEach((h, i) => {
    const y = ay + 30 + i * 24;
    const lab = h.pen === '+2' ? `${(h.t + 2).toFixed(2)}` : h.pen === 'DNF' ? `DNF(${h.t.toFixed(2)})` : h.t.toFixed(2);
    b += m(rx, y, lab, { size: 14, fill: i === 0 ? C.acc : C.text });
    if (h.pen === '+2') b += m(rx + monoW(lab, 14) + 8, y, '+2', { size: 11, fill: C.err });
  });
  // coach
  const kx = X0 + 680;
  b += m(kx, ay, 'coach', { size: 13 });
  let ky = ay + 30;
  SOLVE.insights.forEach(ins => {
    b += m(kx, ky, ins.tag, { size: 11, fill: ins.tag === 'eo skip' || ins.tag === 'pseudo' ? C.acc : C.err });
    const lines = wrap(ins.text, 48);
    lines.forEach((ln, j) => { b += m(kx + 80, ky + j * 18, ln, { size: 12, fill: C.text }); });
    ky += lines.length * 18;
    if (ins.alg) { b += m(kx + 80, ky, ins.alg, { size: 12, fill: C.acc }); ky += 18; }
    ky += 12;
  });
  b += hints(862, [['space', 'next scramble'], ['r', 'retry this scramble'], ['d', 'replay solve'], ['tab', 'settings']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
};

// 9 — mobile
frames['A-09-mobile'] = () => {
  const PW = 390, PH = 844, gap = 48, H9 = 960;
  const x0 = (W - (PW * 3 + gap * 2)) / 2, y0 = 76;
  let b = '';
  const caps = ['inspection', 'solving · pair 3', 'results'];
  const phone = (i, inner) => {
    const x = x0 + i * (PW + gap);
    return m(x, y0 - 24, caps[i], { size: 13 }) +
      `<clipPath id="ph${i}"><rect x="${x}" y="${y0}" width="${PW}" height="${PH}" rx="44"/></clipPath>` +
      `<g clip-path="url(#ph${i})"><rect x="${x}" y="${y0}" width="${PW}" height="${PH}" fill="${C.bg}"/><g transform="translate(${x} ${y0})">${inner}</g></g>` +
      `<rect x="${x}" y="${y0}" width="${PW}" height="${PH}" rx="44" fill="none" stroke="${C.bezel}" stroke-width="3"/>`;
  };
  const status = () => m(28, 34, '9:41', { size: 13, fill: C.text }) + battery(PW - 66, 24, 84) + m(PW - 28, 34, '', {});
  const head = () => logo(24, 62, 3) + m(46, 72, 'cubesight', { size: 14, fill: C.text }) +
    `<circle cx="${PW - 132}" cy="68" r="3" fill="${C.acc}"/>` + m(PW - 124, 72, 'GAN 356 i3', { size: 11 }) + m(PW - 24, 72, '84%', { size: 11, anchor: 'end' });
  // lane for phone: compact
  const pLane = (y, st) => {
    const x0p = 24, wp = PW - 48;
    const totalAvg = STEPS.reduce((s, x) => s + x.avg, 0), gp = 4, px = (wp - 8 * gp) / totalAvg;
    let o = '', x = x0p;
    STEPS.forEach((s, i) => {
      const w = s.avg * px;
      const done = i < st.done, cur = i === st.cur, sk = st.skipped?.has(i);
      if (sk) { o += spark(x + w / 2, y, 5, C.acc); }
      else {
        o += `<rect x="${x}" y="${y - 2}" width="${w}" height="4" rx="2" fill="${C.dim}" opacity="${st.ghost ? 0.5 : 1}"/>`;
        if (done) o += `<rect x="${x}" y="${y - 2}" width="${w}" height="4" rx="2" fill="${C.acc}"/>`;
        if (cur) { const fw = w * st.curT / s.avg; o += `<rect x="${x}" y="${y - 2}" width="${fw}" height="4" rx="2" fill="${C.acc}"/><rect x="${x + fw - 1}" y="${y - 8}" width="2.5" height="16" rx="1" fill="${C.acc}"/>`; }
      }
      x += w + gp;
    });
    return o;
  };
  // phone 1 — inspection
  let p1 = status() + head();
  p1 += cb(PW / 2, 210, 62, STATES.inspect);
  p1 += m(PW / 2, 336, 'inspection', { size: 13, anchor: 'middle' });
  p1 += m(PW / 2, 452, '6', { size: 132, fill: C.acc, anchor: 'middle', weight: 300 });
  p1 += m(PW / 2, 494, 'turn any face to start', { size: 12, anchor: 'middle' });
  p1 += inspLane(580, { id: 'm1', x0: 24, w: PW - 48, elapsed: 8.6, limit: 15, mode: 'wca', callouts: true, small: true });
  p1 += `<g opacity="0.5">${pLane(664, { done: 0, cur: -1, ghost: true })}</g>`;
  p1 += m(24, 692, 'your plan · cfop 2-look', { size: 10, fill: C.dim });
  p1 += `<rect x="24" y="740" width="${PW - 48}" height="52" rx="10" fill="${C.alt}"/>` + m(PW / 2, 772, 'cross hint · white · 6 mv', { size: 13, anchor: 'middle' });
  // phone 2 — solving
  let p2 = status() + head();
  p2 += cb(PW / 2, 190, 56, STATES.f2l);
  p2 += m(PW / 2, 306, 'f2l · pair 3 · pseudo', { size: 13, anchor: 'middle', fill: C.acc });
  p2 += m(PW / 2, 406, '6.91', { size: 104, fill: C.text, anchor: 'middle', weight: 300, ls: -3 });
  p2 += m(PW / 2, 444, '31 moves · 4.49 tps', { size: 12, anchor: 'middle' });
  p2 += pLane(500, { done: 3, cur: 3, curT: 1.16 });
  // vertical split list
  STEPS.slice(0, 5).forEach((s, i) => {
    const y = 552 + i * 34;
    const cur = i === 3, done = i < 3;
    p2 += m(24, y, stepLabel(i), { size: 14, fill: cur ? C.acc : done ? C.text : C.dim });
    if (s.pseudo) p2 += m(104, y, 'pseudo', { size: 11, fill: cur ? C.acc : C.dim });
    if (done) {
      const d = s.t - s.avg;
      p2 += m(PW - 88, y, (d <= 0 ? '−' : '+') + Math.abs(d).toFixed(2), { size: 11, fill: d <= 0 ? C.acc : C.err, anchor: 'end' });
      p2 += m(PW - 24, y, fmt(s.t), { size: 14, fill: C.text, anchor: 'end' });
    } else if (cur) p2 += m(PW - 24, y, '1.16', { size: 14, fill: C.acc, anchor: 'end' });
    else p2 += m(PW - 24, y, '—', { size: 14, fill: C.dim, anchor: 'end' });
  });
  p2 += m(24, 552 + 5 * 34, 'oll · pll', { size: 14, fill: C.dim }) + m(PW - 24, 552 + 5 * 34, '—', { size: 14, fill: C.dim, anchor: 'end' });
  p2 += m(PW / 2, 800, 'tap and hold anywhere to abort', { size: 11, anchor: 'middle', fill: C.dim });
  // phone 3 — results
  let p3 = status() + head();
  p3 += m(24, 124, 'time', { size: 13 });
  p3 += m(20, 186, '14.07', { size: 68, fill: C.acc, weight: 300, ls: -2 });
  [['moves', '68'], ['tps', '4.83'], ['insp', '8.7']].forEach(([k, v], i) => {
    p3 += m(24 + i * 116, 226, k, { size: 12 }); p3 += m(24 + i * 116, 254, v, { size: 22, fill: C.text, weight: 300 });
  });
  // mini tps chart
  const cx0 = 24, cw = PW - 48, cy0 = 280, ch = 96, T = SOLVE.time;
  const rw = SOLVE.tpsCurve, pts = rw.map((v, i) => 0.25 * (rw[i - 1] ?? v) + 0.5 * v + 0.25 * (rw[i + 1] ?? v)).map((v, i) => [cx0 + Math.min(T, i * 0.5) / T * cw, cy0 + ch - v / 8 * ch]);
  p3 += `<rect x="${cx0}" y="${cy0 + ch}" width="${cw}" height="1" fill="${C.dim}"/>`;
  p3 += `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${C.acc}" stroke-width="2" stroke-linejoin="round"/>`;
  // splits list
  STEPS.forEach((s, i) => {
    const y = 420 + i * 28;
    p3 += m(24, y, stepLabel(i), { size: 13, fill: s.skip ? C.acc : C.sub });
    const bw = 150, sc = bw / 2.6;
    if (s.skip) { p3 += spark(120, y - 4, 5, C.acc) + m(132, y, 'skip', { size: 12, fill: C.acc }); }
    else {
      const d = s.t - s.avg;
      p3 += `<rect x="112" y="${y - 6}" width="${bw}" height="4" rx="2" fill="${C.alt}"/><rect x="112" y="${y - 6}" width="${s.t * sc}" height="4" rx="2" fill="${d <= 0 ? C.acc : C.err}"/><rect x="${112 + s.avg * sc - 1}" y="${y - 10}" width="2" height="12" fill="${C.text}" opacity="0.6"/>`;
      p3 += m(PW - 24, y, fmt(s.t), { size: 13, fill: C.text, anchor: 'end' });
    }
  });
  p3 += m(24, 686, 'ao5 14.62 · ao12 15.03 · pb 12.41', { size: 12, fill: C.text });
  p3 += m(24, 710, 'cross: 8 moves, optimal 6 → ' + "F' R D2 L' B2 D", { size: 11 });
  p3 += `<rect x="24" y="740" width="${PW - 48}" height="52" rx="10" fill="none" stroke="${C.acc}" stroke-width="1.5"/>` + m(PW / 2, 772, 'next scramble', { size: 15, anchor: 'middle', fill: C.acc });
  b += phone(0, p1) + phone(1, p2) + phone(2, p3);
  return svg(W, H9, b, { fonts: FONTS, bg: C.canvas });
};

// 10 — settings
frames['A-10-settings'] = () => {
  const H10 = 1400;
  let b = topbar({ active: 'settings' });
  b += configBar(128, DEFAULT_CFG);
  b += m(W / 2, 168, 'the bar above is the quick path; everything else lives here · defaults follow wca regulations', { size: 12, anchor: 'middle' });
  const opt = (x, y, list, active, def) => {
    let o = '';
    list.forEach((l, i) => {
      const w = Math.max(76, monoW(l, 13) + 28);
      const on = i === active;
      o += `<rect x="${x}" y="${y - 20}" width="${w}" height="32" rx="6" fill="${on ? C.acc : C.alt}"/>`;
      o += m(x + w / 2, y + 1, l, { size: 13, fill: on ? C.bg : C.text, anchor: 'middle' });
      if (i === def && def !== active) o += `<circle cx="${x + w - 7}" cy="${y - 13}" r="2.5" fill="${C.acc}"/>`;
      x += w + 8;
    });
    return o;
  };
  const sections = [
    ['method', [
      ['method', 'which stages the timeline tracks', ['cfop', 'roux'], 0],
      ['cross', 'target for the first step', ['cross', 'x-cross', 'xx-cross'], 0],
      ['f2l pairs', 'count a pair when it is solved relative to the cross (d-shift)', ['standard', 'pseudo pairs'], 1],
      ['oll', '2-look splits the segment into eo → co', ['1-look', '2-look'], 1],
      ['pll', '2-look splits the segment into cp → ep', ['1-look', '2-look'], 1],
    ]],
    ['inspection & penalties', [
      ['inspection', 'length of the countdown lane', ['15 s', 'custom · 10', 'unlimited', 'off'], 0],
      ['overtime', 'what happens after the limit', ['wca +2 / dnf', 'count only', 'grace · 3 s', 'auto-start'], 0],
      ['judge callouts', 'flash + optional voice at 8 s and 12 s', ['off', '8 s · 12 s', 'voice'], 1],
      ['penalties', 'how +2 / dnf are recorded in history', ['apply', 'note only'], 0],
    ]],
    ['training', [
      ['scramble', 'guided walks you through each move', ['guided', 'paste', 'free'], 0],
      ['coach', 'hints during the solve or only after', ['live', 'after solve', 'off'], 0],
      ['cross hint', 'optimal cross peek during inspection', ['on tab', 'always', 'off'], 0],
      ['timer', 'hide the running clock to focus on the cube', ['visible', 'hide while solving'], 0],
      ['timeline', 'segmented lane under the timer', ['on', 'off'], 0],
      ['split compare', 'what deltas under each split are against', ['vs average', 'vs pb', 'raw'], 0],
    ]],
  ];
  let y = 236;
  const def = { 'f2l pairs': 0, 'judge callouts': 0, 'cross hint': 0 };
  for (const [name, rows] of sections) {
    b += m(X0, y, name, { size: 13, fill: C.acc });
    b += `<rect x="${X0 + monoW(name, 13) + 16}" y="${y - 5}" width="${XW - monoW(name, 13) - 16}" height="1" fill="${C.alt}"/>`;
    y += 44;
    for (const [label, desc, list, active] of rows) {
      b += m(X0, y - 4, label, { size: 15, fill: C.text });
      b += m(X0, y + 16, desc, { size: 12 });
      b += opt(X0 + 560, y, list, active, def[label] ?? 0);
      y += 60;
    }
    y += 20;
  }
  // custom-length inline input demo on inspection row
  b += m(X0 + XW, 236, '● = default', { size: 11, anchor: 'end' });
  b += hints(H10 - 40, [['esc', 'command line'], ['type', '"insp 10" · "oll 1"'], ['tab', 'back to brain']]);
  return svg(W, H10, b, { fonts: FONTS, bg: C.bg });
};

// 11 — motion storyboard for the scramble → inspection swoop
frames['A-11-motion'] = () => {
  const kf = [];
  const scrTokens = (dy, op, flash) => {
    let o = `<g transform="translate(0 ${dy})" opacity="${op}">`;
    const fs = 36, slot = 96, sx = W / 2 - 480 + 12;
    SCRAMBLE.forEach((mv, i) => { const x = sx + (i % 10) * slot, y = 520 + Math.floor(i / 10) * 80; o += m(x, y, mv, { size: fs, fill: flash ? C.acc : C.dim }); });
    return o + '</g>';
  };
  // k1 — last scramble move lands
  kf.push(['0 ms · last scramble move lands, tokens flash accent', topbar({ dim: true }) + cb(W / 2, 330, 100, STATES.inspect) + scrTokens(0, 1, true)]);
  // k2 — scramble lifts away, cube eases up and shrinks
  kf.push(['120 ms · scramble lifts 24 px and fades; cube eases up and shrinks to 76 %', topbar({ dim: true }) + cb(W / 2, 268, 86, STATES.inspect) + scrTokens(-24, 0.25, false)]);
  // k3 — lane swoops in from below
  kf.push(['280 ms · lanes rise 48 px → 0 with slight overshoot; segments stagger 24 ms left → right', topbar({ dim: true }) + cb(W / 2, 214, 76, STATES.inspect) +
    `<g transform="translate(0 18)" opacity="0.7">${inspLane(684, { id: 'k3', elapsed: 0, limit: 15, mode: 'wca', callouts: true }).replace(/width="([\d.]+)" height="6" rx="3" fill="#e7b34c"/, (a, w) => `width="${(w * 0.6).toFixed(1)}" height="6" rx="3" fill="#e7b34c"`)}</g>` +
    `<g transform="translate(0 30)" opacity="0.25">${solveLane(800, { showSplits: false })}</g>`]);
  // k4 — countdown live
  kf.push(['520 ms · countdown number fades in (scale .96 → 1); lane drains linearly, width bound to the clock', topbar({ dim: true }) + cb(W / 2, 214, 76, STATES.inspect) + m(W / 2, 340, 'inspection', { size: 14, anchor: 'middle' }) + bigNumber(500, '15', C.acc) + inspLane(684, { id: 'k4', elapsed: 0.1, limit: 15, mode: 'wca', callouts: true }) + solveLane(800, { opacity: 0.45, showSplits: false })]);
  const sc = 0.44, fw = W * sc, fh = H * sc, gx = 40, gy = 72;
  const ox = (W - (fw * 2 + gx)) / 2;
  let b = m(ox, 64, 'motion · scramble done → inspection  (total 520 ms, ease-out cubic-bezier(.22,1,.36,1))', { size: 16, fill: C.text });
  kf.forEach(([cap, body], i) => {
    const x = ox + (i % 2) * (fw + gx), y = 104 + Math.floor(i / 2) * (fh + gy);
    b += `<clipPath id="kf${i}"><rect x="${x}" y="${y}" width="${fw}" height="${fh}" rx="10"/></clipPath>`;
    b += `<g clip-path="url(#kf${i})"><rect x="${x}" y="${y}" width="${fw}" height="${fh}" fill="${C.bg}"/><g transform="translate(${x} ${y}) scale(${sc})">${body}</g></g>`;
    b += `<rect x="${x}" y="${y}" width="${fw}" height="${fh}" rx="10" fill="none" stroke="${C.dim}"/>`;
    b += m(x, y + fh + 28, cap, { size: 12 });
    b += m(x + fw, y - 10, String(i + 1), { size: 12, fill: C.acc, anchor: 'end' });
  });
  return svg(W, 1024, b, { fonts: FONTS, bg: '#101114' });
};

const only = process.argv[2];
for (const [name, fn] of Object.entries(frames)) {
  if (only && !name.includes(only)) continue;
  if (LIGHT && !LIGHT_SET.includes(name)) continue;
  write((LIGHT ? name.replace('A-', 'A-light-') : name) + '.svg', fn());
}
