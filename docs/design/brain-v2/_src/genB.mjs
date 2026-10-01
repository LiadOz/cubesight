// Direction B — "Pit wall": bold broadcast / F1 timing-tower energy, still minimal.
import { cube, t, svg, write, MONO, SANS, SOLVE, SCRAMBLE, SCR_DONE, STATES, HISTORY, histLabel, histValue, fmt } from './lib.mjs';

const C = { bg: '#0a0a0b', surf: '#141417', surf2: '#0f0f11', txt: '#f5f5f2', sub: '#7b7d85', dim: '#3a3b41', hair: '#1f1f23', lime: '#c8f542', vio: '#b18cff', amb: '#ffb020', red: '#ff4d4d', ink: '#0a0a0b' };
const W = 1440, H = 900, MX = 48;
const FONTS = ['manrope', 'mono400', 'mono500'];

// ---------- text helpers ----------
const LS = 1.4;
const M = (x, y, s, o = {}) => t(x, y, s, { family: MONO, size: o.size || 11, fill: o.fill || C.sub, ls: o.ls ?? LS, weight: o.weight || 500, anchor: o.anchor, opacity: o.opacity, extra: o.extra });
const S = (x, y, s, o = {}) => t(x, y, s, { family: SANS, size: o.size || 16, fill: o.fill || C.txt, weight: o.weight || 600, anchor: o.anchor, ls: o.ls, tnum: o.tnum ?? true, opacity: o.opacity, extra: o.extra });
const mw = (s, size = 11, ls = LS) => String(s).length * (size * 0.6 + ls);
const sw = (s, size) => String(s).length * size * 0.62; // Manrope tabular digits, approx for numbers
const minus = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
const rect = (x, y, w, h, fill, o = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${o}/>`;
const line = (x1, y1, x2, y2, stroke, w = 1, o = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" ${o}/>`;
const spark = (cx, cy, r, fill = C.lime) => `<path d="M${cx},${cy - r} Q${cx},${cy} ${cx + r},${cy} Q${cx},${cy} ${cx},${cy + r} Q${cx},${cy} ${cx - r},${cy} Q${cx},${cy} ${cx},${cy - r}Z" fill="${fill}"/>`;

const DEFS = `<defs>
  <radialGradient id="floor" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${C.lime}" stop-opacity="0.34"/><stop offset="0.55" stop-color="${C.lime}" stop-opacity="0.08"/><stop offset="1" stop-color="${C.lime}" stop-opacity="0"/></radialGradient>
  <radialGradient id="floorAmb" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${C.amb}" stop-opacity="0.32"/><stop offset="0.55" stop-color="${C.amb}" stop-opacity="0.07"/><stop offset="1" stop-color="${C.amb}" stop-opacity="0"/></radialGradient>
  <pattern id="hatchA" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="${C.amb}" fill-opacity="0.16"/><rect width="4" height="10" fill="${C.amb}" fill-opacity="0.55"/></pattern>
  <pattern id="hatchAf" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="${C.amb}" fill-opacity="0.16"/></pattern>
  <pattern id="hatchR" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="${C.red}" fill-opacity="0.22"/></pattern>
  <pattern id="hatchG" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="${C.sub}" fill-opacity="0.35"/></pattern>
  <pattern id="hatchL" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="${C.lime}" fill-opacity="0.22"/></pattern>
  <linearGradient id="fadeR" x1="0" x2="1"><stop offset="0" stop-color="${C.lime}" stop-opacity="0.9"/><stop offset="1" stop-color="${C.lime}" stop-opacity="0"/></linearGradient>
  <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.lime}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.lime}" stop-opacity="0"/></linearGradient>
</defs>`;

// ---------- chrome ----------
function battery(x, y, pct) { // x,y = top-left, 22x11
  return `<rect x="${x}" y="${y}" width="22" height="11" rx="2.5" fill="none" stroke="${C.sub}" stroke-width="1.2"/><rect x="${x + 22.5}" y="${y + 3.5}" width="2" height="4" rx="1" fill="${C.sub}"/><rect x="${x + 2}" y="${y + 2}" width="${18 * pct}" height="7" rx="1.2" fill="${C.sub}"/>`;
}
function topBar(active = 'BRAIN', { device = true } = {}) {
  let o = `<rect x="${MX}" y="22" width="18" height="18" rx="4" fill="${C.lime}"/><rect x="${MX + 5}" y="27" width="8" height="8" rx="1.5" fill="${C.bg}"/>`;
  o += S(MX + 28, 37, 'cubesight', { size: 18, weight: 800, ls: -0.3, tnum: false });
  let x = 216;
  for (const n of ['BRAIN', 'HISTORY', 'SETTINGS']) { o += M(x, 36, n, { fill: n === active ? C.txt : C.dim }); if (n === active) o += rect(x, 44, mw(n) - LS, 2, C.lime); x += mw(n) + 24; }
  if (device) {
    const r = W - MX;
    o += M(r - 28, 36, '84%', { anchor: 'end', fill: C.sub });
    o += battery(r - 24, 26.5, 0.84);
    const nx = r - 28 - mw('84%') - 16;
    o += M(nx, 36, 'GAN 356 I3', { anchor: 'end', fill: C.sub });
    o += `<circle cx="${nx - mw('GAN 356 I3') - 14}" cy="32" r="3.5" fill="${C.lime}"/>`;
  }
  return o;
}
function hero(cx, cy, s, state, { glow = 'floor', opacity } = {}) {
  return `<ellipse cx="${cx}" cy="${cy + s * 0.5 + 18}" rx="${s * 1.55}" ry="${s * 0.26}" fill="url(#${glow})"/>` + cube(cx, cy, s, state, { body: '#050506', opacity });
}
function keyChip(x, y, label, o = {}) { // x = left, y = baseline
  const w = mw(label, 10, 1) + 14;
  return `<rect x="${x}" y="${y - 13}" width="${w}" height="19" rx="4" fill="${o.fill || C.surf}" ${o.stroke ? `stroke="${o.stroke}"` : ''}/>` + M(x + 7, y, label, { size: 10, ls: 1, fill: o.text || C.txt }) + (o.after ? M(x + w + 10, y, o.after, { fill: o.afterFill || C.sub }) : '');
}
const chipW = label => mw(label, 10, 1) + 14;
function hints(y, items, { anchor = 'center', x = W / 2 } = {}) {
  const widths = items.map(([k, a]) => chipW(k) + 10 + mw(a) + 32);
  const total = widths.reduce((a, b) => a + b, 0) - 32;
  let cx = anchor === 'center' ? x - total / 2 : x;
  let o = '';
  items.forEach(([k, a], i) => { o += keyChip(cx, y, k, { after: a }); cx += widths[i]; });
  return o;
}

// ---------- timeline band ----------
const STEPS = SOLVE.steps;
const GROUP = { cross: 'CROSS', p1: 'F2L', p2: 'F2L', p3: 'F2L', p4: 'F2L', eo: 'OLL', co: 'OLL', cp: 'PLL', ep: 'PLL' };
const LABEL = { cross: 'CROSS', p1: 'PAIR 1', p2: 'PAIR 2', p3: 'PAIR 3', p4: 'PAIR 4', eo: 'EO', co: 'CO', cp: 'CP', ep: 'EP' };
const sector = s => s.skip ? C.lime : s.key === 'p3' ? C.vio : s.t < s.avg ? C.lime : C.amb;
function layout(x0, x1, gap, { collapse = [], sliver = 28, boost = {} } = {}) {
  const n = STEPS.length, avail = x1 - x0 - gap * (n - 1) - collapse.length * sliver;
  const wt = s => s.avg * (boost[s.key] || 1);
  const tot = STEPS.filter(s => !collapse.includes(s.key)).reduce((a, s) => a + wt(s), 0);
  let x = x0;
  return STEPS.map(s => { const w = collapse.includes(s.key) ? sliver : avail * wt(s) / tot; const r = { ...s, x, w }; x += w + gap; return r; });
}
// state: { doneUpTo: index of current step (steps before are done), frac, running, collapse }
function band(y, h, st, o = {}) {
  const x0 = o.x0 ?? MX, x1 = o.x1 ?? W - MX, gap = o.gap ?? 4;
  const small = o.small;
  const blocks = layout(x0, x1, gap, { collapse: st.collapse || [], sliver: o.sliver ?? 28, boost: o.boost || {} });
  let out = '';
  // group labels
  if (!o.noGroups) {
    const groups = {};
    blocks.forEach(b => { const g = GROUP[b.key]; (groups[g] ||= []).push(b); });
    for (const [g, bs] of Object.entries(groups)) {
      const vis = bs.filter(b => !(st.collapse || []).includes(b.key)); const gx0 = (vis[0] || bs[0]).x, gx1 = bs.at(-1).x + bs.at(-1).w;
      const active = bs.some(b => STEPS.indexOf(STEPS.find(s => s.key === b.key)) === st.current);
      out += M(gx0, y - 12, g, { size: 10, fill: active ? C.txt : C.dim });
      if (bs.length > 1) out += line(gx0 + mw(g, 10) + 6, y - 15.5, gx1, y - 15.5, active ? C.dim : C.hair, 1);
    }
  }
  blocks.forEach((b, i) => {
    const lx = b.x + (small ? 8 : 12);
    const lab = small ? b.short.replace('X', 'XC') : LABEL[b.key];
    if (b.skip && (st.collapse || []).includes(b.key)) {
      out += rect(b.x, y, b.w, h, C.lime, 'fill-opacity="0.12"') + rect(b.x, y + h - 4, b.w, 4, C.lime);
      out += `<text transform="translate(${b.x + b.w / 2 + 3.5},${y + h / 2}) rotate(-90)" text-anchor="middle" font-family="${MONO}" font-size="10" font-weight="500" letter-spacing="1.4" fill="${C.lime}">SKIP</text>`;
      if (!o.noSpark) out += spark(b.x + b.w / 2, y - 22, 7);
      return;
    }
    if (i < st.current || st.current == null) { // done
      const col = sector(b);
      out += rect(b.x, y, b.w, h, C.surf) + rect(b.x, y + h - 4, b.w, 4, col);
      out += M(lx, y + (small ? 18 : 22), lab, { size: small ? 9 : 11, fill: C.sub, ls: small ? 0.6 : LS });
      if (!small || b.w > 30) out += S(lx, y + (small ? h - 12 : 50), fmt(b.t), { size: small ? 13 : 20, weight: 700, fill: col });
      if (b.pseudo && !small && b.w > 110) out += M(b.x + b.w - 10, y + 22, 'PSEUDO', { size: 9, anchor: 'end', fill: C.vio, ls: 1 });
      if (o.deltas) out += M(b.x + b.w - 10, y + 50, minus(b.t - b.avg), { size: 10, anchor: 'end', fill: C.sub, ls: 0.4 });
    } else if (i === st.current) {
      const fw = b.w * Math.min(1, st.frac);
      out += rect(b.x, y, b.w, h, C.surf) + rect(b.x, y, fw, h, C.lime, 'fill-opacity="0.16"') + rect(b.x + fw - 3, y, 3, h, C.lime);
      out += `<rect x="${b.x + fw - 3}" y="${y - 6}" width="3" height="${h + 12}" fill="${C.lime}" opacity="0.25"/>`;
      out += M(lx, y + (small ? 18 : 22), lab, { size: small ? 9 : 11, fill: C.lime, ls: small ? 0.6 : LS });
      out += S(lx, y + (small ? h - 12 : 50), fmt(st.running), { size: small ? 13 : 20, weight: 700, fill: C.txt, extra: `stroke="${C.surf}" stroke-width="5" paint-order="stroke" stroke-linejoin="round"` });
      if (b.pseudo && st.pseudo && !small) out += M(b.x + b.w - 10, y + 22, 'PSEUDO', { size: 9, anchor: 'end', fill: C.lime, ls: 1 });
    } else { // future
      out += rect(b.x, y, b.w, h, C.surf2);
      out += M(lx, y + (small ? 18 : 22), lab, { size: small ? 9 : 11, fill: C.dim, ls: small ? 0.6 : LS });
      if (!small) out += M(lx, y + 50, 'AVG ' + fmt(b.avg), { size: 10, fill: C.dim, ls: 0.8 });
    }
  });
  return out;
}

// inspection band — linear scale over [0, max] seconds.
// cfg: { limit: 15, zones: [{from,to,kind:'pen'|'dnf'|'grace'|'count'}], at, callouts:[8,12], labels, auto }
function inspBand(x0, x1, y, h, cfg) {
  const max = cfg.max ?? 18.2;
  const X = s => x0 + (x1 - x0) * s / max;
  let o = '';
  // track
  o += rect(x0, y, X(cfg.limit) - x0, h, C.surf);
  for (const z of cfg.zones || []) {
    const fill = z.kind === 'pen' ? 'url(#hatchAf)' : z.kind === 'dnf' ? 'url(#hatchR)' : z.kind === 'grace' ? 'url(#hatchL)' : 'url(#hatchG)';
    o += rect(X(z.from) + 2, y, X(z.to) - X(z.from) - 2, h, fill, cfg.over ? '' : 'opacity="0.7"');
  }
  // remaining (lime) = from 'at' to limit
  if (cfg.at < cfg.limit) {
    o += rect(X(cfg.at), y, X(cfg.limit) - X(cfg.at), h, C.lime);
    o += rect(x0, y, X(cfg.at) - x0, h, C.surf);
  } else {
    // overtime: filled zones up to 'at'
    for (const z of cfg.zones || []) {
      const a = Math.max(z.from, 0), b = Math.min(z.to, cfg.at);
      if (b > a) o += rect(X(a) + 2, y, X(b) - X(a) - 2, h, z.kind === 'dnf' ? C.red : z.kind === 'grace' ? C.lime : z.kind === 'count' ? C.sub : 'url(#hatchA)');
    }
  }
  // playhead
  const px = X(cfg.at);
  o += rect(px - 1.5, y - 10, 3, h + 20, cfg.at >= cfg.limit ? (cfg.headColor || C.amb) : C.txt);
  // second ticks along the bottom
  if (!cfg.noTicks) for (let s = 1; s < cfg.limit; s++) o += rect(X(s) - 0.5, y + h - (s % 5 === 0 ? 12 : 6), 1, s % 5 === 0 ? 12 : 6, C.bg, 'opacity="0.55"');
  // callouts
  for (const c of cfg.callouts || []) {
    const cx = X(c), lit = cfg.at >= c;
    o += rect(cx - 0.5, y - 8, 1, h + 8, lit ? C.bg : C.dim, 'opacity="0.8"');
    o += M(cx, y - 14, lit ? `${c} S CALLED` : `${c} S`, { size: 9, anchor: 'middle', fill: lit ? C.txt : C.dim, ls: 1 });
  }
  if (cfg.labels !== false) {
    o += M(x0, y + h + 22, '0', { size: 10, fill: C.dim });
    o += M(cfg.compact ? X(cfg.limit) - 4 : X(cfg.limit), y + h + 22, `${cfg.limit} S`, { size: 10, fill: C.sub, anchor: cfg.compact ? 'end' : 'middle' });
    for (const z of cfg.zones || []) {
      const mid = (X(z.from) + X(z.to)) / 2;
      const lbl = z.label ?? (z.kind === 'pen' ? '+2' : z.kind === 'dnf' ? 'DNF' : z.kind === 'grace' ? 'GRACE' : '');
      const col = z.kind === 'pen' ? C.amb : z.kind === 'dnf' ? C.red : z.kind === 'grace' ? C.lime : C.sub;
      if (lbl) o += M(mid, y + h + 22, lbl, { size: 10, fill: col, anchor: 'middle' });
    }
  }
  return o;
}

// ===================================================================
// B-01 idle
function idle() {
  let b = DEFS + topBar();
  // config bar (monkeytype-style), centered, on a single raised strip
  const groups = [
    [['CFOP', 1], ['ROUX', 0]],
    [['CROSS', 1], ['X-CROSS', 0], ['XX', 0]],
    [['PSEUDO PAIRS', 1]],
    [['OLL 2-LOOK', 1]],
    [['PLL 2-LOOK', 1]],
    [['INSPECT 15 S', 1]],
    [['WCA +2/DNF', 1]],
    [['CALLOUTS', 0]],
  ];
  const gapI = 16, gapG = 36;
  let tw = 0; groups.forEach((g, gi) => { g.forEach(([l], i) => tw += mw(l) + (i ? gapI : 0)); if (gi) tw += gapG; });
  const bw = tw + 48 + 40, bx = (W - bw) / 2, by = 88;
  b += `<rect x="${bx}" y="${by}" width="${bw}" height="40" rx="8" fill="${C.surf}"/>`;
  let x = bx + 24;
  groups.forEach((g, gi) => {
    if (gi) { b += rect(x + gapG / 2 - 1, by + 14, 2, 12, C.dim); x += gapG; }
    g.forEach(([l, on], i) => { if (i) x += gapI; b += M(x, by + 24, l, { fill: on ? C.lime : C.sub }); x += mw(l); });
  });
  // gear
  const gx = bx + bw - 28, gy = by + 20;
  b += `<circle cx="${gx}" cy="${gy}" r="6" fill="none" stroke="${C.sub}" stroke-width="2" stroke-dasharray="3 1.7"/><circle cx="${gx}" cy="${gy}" r="2.2" fill="${C.sub}"/>`;

  b += hero(392, 500, 168, STATES.solved);
  // right: ready
  const R = W - MX;
  b += M(R, 256, 'READY · CUBE SOLVED · SYNCED', { anchor: 'end', fill: C.sub });
  b += S(R, 450, '0.00', { size: 220, weight: 800, fill: C.dim, anchor: 'end', ls: -6 });
  // primary action
  const btnW = 312, btnX = R - btnW, btnY = 504;
  b += `<rect x="${btnX}" y="${btnY}" width="${btnW}" height="64" rx="10" fill="${C.lime}"/>`;
  b += S(btnX + 24, btnY + 40, 'New scramble', { size: 22, weight: 800, fill: C.ink, tnum: false });
  b += `<rect x="${R - 24 - 72}" y="${btnY + 20}" width="72" height="24" rx="5" fill="${C.ink}" fill-opacity="0.14"/>` + M(R - 24 - 36, btnY + 36, 'SPACE', { anchor: 'middle', fill: C.ink, size: 11 });
  // session line
  const stats = [['SESSION', '23'], ['AO5', '14.62'], ['AO12', '15.03'], ['PB', '12.41']];
  let sx = R;
  for (let i = stats.length - 1; i >= 0; i--) {
    const [k, v] = stats[i];
    b += S(sx, 640, v, { size: 28, weight: 700, anchor: 'end', fill: k === 'PB' ? C.vio : C.txt });
    b += M(sx, 608, k, { anchor: 'end', fill: C.sub });
    sx -= Math.max(sw(v, 28), mw(k)) + 40;
  }
  // band preview: the method's timeline, ghosted
  b += M(MX, 728, 'TIMELINE PREVIEW · CFOP · 2-LOOK OLL · 2-LOOK PLL · PSEUDO PAIRS · WIDTHS = YOUR AVERAGE SPLITS', { size: 10, fill: C.dim });
  b += band(752, 64, { current: -1 }, { noGroups: true });
  b += hints(878, [['SPACE', 'scramble'], ['TAB', 'settings'], ['H', 'history'], ['C', 'recalibrate cube']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
}

// B-02 guided scramble with wrong turn + recovery
function scramble() {
  let b = DEFS + topBar();
  b += hero(392, 500, 168, STATES.midScramble);
  // arrow hint near cube: "L2" turns left face — show a subtle label under cube
  b += M(392, 660, 'MIRROR · LIVE FROM CUBE', { anchor: 'middle', fill: C.dim });
  const R = W - MX, L = 720;
  b += M(L, 160, 'SCRAMBLE', { fill: C.sub }) + M(L + mw('SCRAMBLE') + 12, 160, '11 / 20', { fill: C.txt });
  // giant current move (recovery)
  b += S(L - 8, 370, 'L2', { size: 220, weight: 800, fill: C.amb, ls: -4, tnum: false });
  b += M(L + 330, 262, 'WRONG TURN', { fill: C.amb, size: 12 });
  b += S(L + 330, 298, 'You turned L, not L′.', { size: 24, weight: 700, tnum: false });
  b += S(L + 330, 330, 'Turn L2 to get back on track.', { size: 18, weight: 500, fill: C.sub, tnum: false });
  b += M(L + 330, 368, "THEN  U  F'  R'  D2 ...", { fill: C.dim });
  // sequence grid
  const cw = 76, ch = 56, gx = 8, top = 424;
  SCRAMBLE.forEach((mv, i) => {
    const col = i % 8, row = Math.floor(i / 8);
    const x = L + col * (cw + gx), y = top + row * (ch + gx);
    const disp = mv.replace("'", '′');
    if (i < SCR_DONE) {
      b += S(x + cw / 2, y + 38, disp, { size: 28, weight: 700, fill: '#2a2b30', anchor: 'middle', tnum: false }) + line(x + 22, y + 28, x + cw - 22, y + 28, '#2a2b30', 2);
    } else if (i === SCR_DONE) {
      b += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="8" fill="${C.amb}" fill-opacity="0.14"/>` + rect(x, y + ch - 3, cw, 3, C.amb);
      b += S(x + cw / 2, y + 38, 'L2', { size: 28, weight: 800, fill: C.amb, anchor: 'middle', tnum: false });
      b += `<g opacity="0.9">${M(x + cw / 2, y - 8, "WAS L'", { size: 9, anchor: 'middle', fill: C.amb, ls: 1 })}</g>`;
    } else {
      b += S(x + cw / 2, y + 38, disp, { size: 28, weight: 700, fill: i === SCR_DONE + 1 ? C.txt : '#a9abb2', anchor: 'middle', tnum: false });
    }
  });
  // legend
  const ly = top + 3 * (ch + gx) + 24;
  b += rect(L, ly - 9, 10, 10, '#2a2b30') + M(L + 18, ly, 'DONE', { size: 10 });
  b += rect(L + 90, ly - 9, 10, 10, C.amb) + M(L + 108, ly, 'RECOVERY', { size: 10 });
  b += rect(L + 214, ly - 9, 10, 10, C.txt) + M(L + 232, ly, 'NEXT', { size: 10 });
  b += M(R, ly, 'CUBE STAYS IN SYNC · NO RESCRAMBLE NEEDED', { size: 10, anchor: 'end', fill: C.dim });
  // band slot: thin scramble progress (timeline arrives when the scramble is done)
  const px0 = MX, px1 = W - MX, frac = 11 / 20;
  b += rect(px0, 796, px1 - px0, 4, C.surf) + rect(px0, 796, (px1 - px0) * frac, 4, C.lime);
  b += M(px0, 784, 'SCRAMBLE PROGRESS', { size: 10, fill: C.dim }) + M(px1, 784, 'TIMELINE ARRIVES ON THE LAST MOVE', { size: 10, fill: C.dim, anchor: 'end' });
  b += hints(878, [['ESC', 'cancel'], ['N', 'new scramble'], ['P', 'paste scramble']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
}

const WCA_ZONES = [{ from: 15, to: 17, kind: 'pen' }, { from: 17, to: 18.2, kind: 'dnf' }];

// B-03 inspection
function inspection() {
  let b = DEFS + topBar();
  b += hero(392, 500, 168, STATES.inspect);
  const R = W - MX;
  b += M(R, 196, 'INSPECTION · WCA', { anchor: 'end', fill: C.lime });
  b += S(R, 520, '6', { size: 360, weight: 800, fill: C.lime, anchor: 'end', ls: -8 });
  b += M(R - 236, 520, '9.0 S USED', { anchor: 'end', fill: C.dim, size: 11 }) + M(R - 236, 496, 'S LEFT', { anchor: 'end', fill: C.sub, size: 12 });
  // cross hint (optional)
  b += M(720, 600, 'CROSS HINT · HOLD X', { fill: C.sub });
  b += S(720, 640, 'White cross in 6', { size: 28, weight: 700, tnum: false });
  b += M(720, 674, "F' R D2 L' B2 D", { size: 18, fill: C.lime, ls: 2 });
  b += M(R, 640, 'START TURNING', { anchor: 'end', fill: C.sub });
  b += M(R, 664, 'TO START THE CLOCK', { anchor: 'end', fill: C.sub });
  // swoop-in ghost trails (motion hint)
  b += inspBand(MX, W - MX, 752, 64, { limit: 15, at: 9, zones: WCA_ZONES, callouts: [8, 12] });
  b += hints(878, [['SPACE', 'start without turning'], ['ESC', 'abort (DNF)'], ['X', 'cross hint']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
}

// B-04 overtime (WCA)
function overtime() {
  let b = DEFS + topBar();
  b += hero(392, 500, 168, STATES.inspect, { glow: 'floorAmb' });
  const R = W - MX;
  b += M(R, 196, 'OVERTIME · 15.8 S', { anchor: 'end', fill: C.amb });
  b += S(R, 500, '+1', { size: 320, weight: 800, fill: C.amb, anchor: 'end', ls: -8 });
  // penalty readout
  b += `<rect x="${R - 312}" y="560" width="312" height="72" rx="10" fill="${C.amb}" fill-opacity="0.12"/>`;
  b += S(R - 288, 606, '+2 if you start now', { size: 24, weight: 700, fill: C.amb, tnum: false });
  b += M(R, 670, 'DNF IN 1.2 S', { anchor: 'end', fill: C.red, size: 12 });
  b += M(720, 600, 'WCA RULE · INSPECTION', { fill: C.dim });
  b += S(720, 636, '15–17 s → +2', { size: 20, weight: 600, fill: C.sub, tnum: false });
  b += S(720, 666, 'over 17 s → DNF', { size: 20, weight: 600, fill: C.sub, tnum: false });
  b += inspBand(MX, W - MX, 752, 64, { limit: 15, at: 15.8, zones: WCA_ZONES, callouts: [8, 12], over: true });
  // +1/+2 labels above zone
  const X = s => MX + (W - 2 * MX) * s / 18.2;
  b += M(X(16), 740, '+1', { anchor: 'middle', fill: C.amb, size: 10 }) + M(X(17), 740, '+2', { anchor: 'middle', fill: C.dim, size: 10 });
  b += hints(878, [['TURN', 'start solve (+2)'], ['ESC', 'abort (DNF)']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
}

// B-05 inspection variants sheet
function variants() {
  const HH = 1080;
  let b = DEFS + topBar('SETTINGS', { device: false });
  b += S(MX, 120, 'Inspection & overtime — how the timeline band behaves per setting', { size: 28, weight: 800, tnum: false });
  b += M(MX, 150, 'EVERY ROW IS THE SAME BOTTOM BAND · SNAPSHOT MOMENT SHOWN ON THE RIGHT', { fill: C.sub });
  const rows = [
    ['WCA 15 S', 'DEFAULT', 'Drains 15 s. 15–17 s = +2, beyond 17 s = DNF.', { limit: 15, at: 9, zones: WCA_ZONES }, '6', C.lime],
    ['CUSTOM 10 S', '', 'Shorter drill. Same penalty rules, scaled to N.', { limit: 10, at: 6, max: 13.2, zones: [{ from: 10, to: 12, kind: 'pen' }, { from: 12, to: 13.2, kind: 'dnf' }] }, '4', C.lime],
    ['UNLIMITED', '', 'Counts up, never penalises. For slow, deliberate study.', 'unlimited', '0:21', C.txt],
    ['OFF', '', 'No inspection. The solve clock starts on the first turn.', 'off', 'TURN', C.sub],
    ['OVERTIME · COUNT ONLY', '', 'Past the limit it counts +1, +2, +3… — logged, never penalised.', { limit: 15, at: 17.6, zones: [{ from: 15, to: 18.2, kind: 'count', label: '+1   +2   +3' }], over: true, headColor: C.txt }, '+3', C.txt],
    ['OVERTIME · GRACE 3 S', 'THEN +2', 'A user-set grace window, then the chosen penalty (+2, DNF or none).', { limit: 15, at: 16.4, max: 20.4, zones: [{ from: 15, to: 18, kind: 'grace' }, { from: 18, to: 20, kind: 'pen' }, { from: 20, to: 20.4, kind: 'dnf', label: '' }], over: true, headColor: C.lime }, '+1', C.lime],
    ['OVERTIME · AUTO-START', '', 'When inspection ends, the solve clock starts by itself.', 'auto', '0.00', C.lime],
    ['CALLOUTS 8 S · 12 S', 'OPTIONAL', 'Judge-style calls: tick lights, a short tone, and “8 SECONDS” flashes.', { limit: 15, at: 12.3, zones: WCA_ZONES, callouts: [8, 12] }, '2', C.lime],
  ];
  const x0 = 520, x1 = W - MX - 140, rh = 108;
  rows.forEach(([name, tag, desc, cfg, big, col], i) => {
    const y = 200 + i * rh;
    if (i) b += line(MX, y - 46, W - MX, y - 46, C.hair);
    b += M(MX, y, name, { fill: C.txt, size: 12 });
    if (tag) b += M(MX + mw(name, 12) + 12, y, tag, { fill: tag === 'DEFAULT' ? C.lime : C.sub, size: 10 });
    b += S(MX, y + 28, desc, { size: 14, weight: 500, fill: C.sub, tnum: false });
    const by = y - 14, bh = 36;
    if (cfg === 'unlimited') {
      b += rect(x0, by, x1 - x0, bh, C.surf) + `<rect x="${x0}" y="${by}" width="${(x1 - x0) * 0.82}" height="${bh}" fill="url(#fadeR)" opacity="0.35"/>`;
      b += rect(x0 + (x1 - x0) * 0.62 - 1.5, by - 8, 3, bh + 16, C.txt);
      b += M(x0, by + bh + 20, '0', { size: 10, fill: C.dim }) + M(x1, by + bh + 20, 'NO LIMIT · NO PENALTY', { size: 10, fill: C.sub, anchor: 'end' });
    } else if (cfg === 'off') {
      const bl = layout(x0, x1, 3);
      bl.forEach(k => { b += rect(k.x, by, k.w, bh, C.surf2) + M(k.x + 8, by + 23, k.short, { size: 9, fill: C.dim, ls: 0.6 }); });
      b += rect(x0 - 1.5, by - 8, 3, bh + 16, C.lime);
      b += M(x0, by + bh + 20, 'SOLVE BLOCKS WAIT · CLOCK ARMED ON FIRST TURN', { size: 10, fill: C.sub });
    } else if (cfg === 'auto') {
      const split = x0 + (x1 - x0) * 0.42;
      b += rect(x0, by, split - x0, bh, C.surf) + M(x0 + 10, by + 23, 'INSPECTION · USED UP', { size: 9, fill: C.dim, ls: 1 });
      const bl = layout(split + 6, x1, 3);
      bl.forEach((k, j) => { b += rect(k.x, by, k.w, bh, j === 0 ? C.surf : C.surf2) + M(k.x + 6, by + 23, k.short, { size: 9, fill: j === 0 ? C.lime : C.dim, ls: 0.4 }); });
      b += rect(split + 6, by - 8, 3, bh + 16, C.lime);
      b += M(split, by + bh + 20, '15 S', { size: 10, fill: C.sub, anchor: 'end' }) + M(split + 16, by + bh + 20, 'CLOCK STARTS 0.00 AT 15 S', { size: 10, fill: C.lime });
    } else {
      b += inspBand(x0, x1, by, bh, { ...cfg, callouts: cfg.callouts || [] }).replace(/y - 14/, '');
    }
    b += S(W - MX, y + 12, big, { size: 40, weight: 800, fill: col, anchor: 'end', tnum: false });
  });
  b += M(MX, HH - 40, 'DEFAULTS FOLLOW THE WCA REGULATIONS · ALL VARIANTS ARE PER-SESSION SETTINGS · PENALTIES SHOW IN RESULTS AND HISTORY AS  14.97+  AND  DNF(13.20)', { size: 10, fill: C.dim });
  return svg(W, HH, b, { fonts: FONTS, bg: C.bg });
}

// ---------- solving frames ----------
function solving({ current, frac, running, clock, state, title, sub, extra = '', collapse = [], pace, moves, tps }) {
  let b = DEFS + topBar();
  b += hero(392, 470, 160, state);
  const R = W - MX;
  b += M(R, 164, 'SOLVING', { anchor: 'end', fill: C.lime });
  b += S(R, 400, clock, { size: 220, weight: 800, anchor: 'end', ls: -6 });
  // current step
  b += M(720, 488, 'NOW', { fill: C.sub });
  b += S(720, 540, title, { size: 44, weight: 800, fill: C.lime, tnum: false });
  b += sub;
  // pace + counters (right)
  b += M(R, 488, 'VS YOUR AVERAGE', { anchor: 'end', fill: C.sub });
  b += S(R, 540, pace, { size: 44, weight: 800, anchor: 'end', fill: pace.startsWith('−') ? C.lime : C.amb });
  b += M(720, 640, 'MOVES', { fill: C.sub }) + S(720, 676, String(moves), { size: 28, weight: 700 });
  b += M(840, 640, 'TPS', { fill: C.sub }) + S(840, 676, tps, { size: 28, weight: 700 });
  b += extra;
  b += band(752, 64, { current, frac, running, collapse, pseudo: true }, { noSpark: true });
  b += hints(878, [['ESC', 'abort'], ['SPACE', 'stop (free mode)']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
}
function solve1() {
  return solving({
    current: 3, frac: 0.9 / 1.95, running: 0.9, clock: '6.65', state: STATES.f2l, title: 'F2L · Pair 3', pace: '−0.46', moves: 32, tps: '4.81',
    sub: `<rect x="720" y="560" width="${mw('PSEUDO · D-SHIFT', 10, 1) + 16}" height="22" rx="5" fill="${C.vio}" fill-opacity="0.16"/>` + M(728, 575, 'PSEUDO · D-SHIFT', { size: 10, ls: 1, fill: C.vio }) + S(900, 577, 'Pair 3 splits 0.90 — avg 1.95', { size: 16, weight: 500, fill: C.sub }),
    extra: M(1000, 640, 'COACH', { fill: C.sub }) + S(1000, 672, 'Next pair is connected in U — insert FL.', { size: 16, weight: 600, fill: C.txt, tnum: false }),
  });
}
function solve2() {
  const X = layout(MX, W - MX, 4, { collapse: ['eo'] }).find(s => s.key === 'eo');
  const cx = X.x + X.w / 2;
  const toast = `<g>${spark(cx, 690, 9)}${spark(cx + 14, 680, 4.5)}${M(cx + 26, 695, 'EO SKIP', { fill: C.lime, size: 12 })}${M(cx + 26 + mw('EO SKIP', 12) + 10, 695, '3RD THIS SESSION', { fill: C.sub, size: 10 })}</g>` + line(cx, 704, cx, 746, C.lime, 1, 'opacity="0.5"');
  return solving({
    current: 7, frac: 0.62 / 1.62, running: 0.62, clock: '11.84', state: STATES.pll, title: 'PLL · Corners', pace: '−1.13', moves: 55, tps: '4.65', collapse: ['eo'],
    sub: `<rect x="720" y="560" width="${mw('AA-PERM', 10, 1) + 16}" height="22" rx="5" fill="${C.lime}" fill-opacity="0.14"/>` + M(728, 575, 'AA-PERM', { size: 10, ls: 1, fill: C.lime }) + S(832, 577, 'headlights on B · recognised in 0.31 s', { size: 16, weight: 500, fill: C.sub, tnum: false }),
    extra: toast,
  });
}

// B-08 results
function results() {
  let b = DEFS + topBar();
  const R = W - MX;
  // big time
  b += M(MX, 112, 'TIME', { fill: C.sub });
  b += S(MX - 6, 252, '14.07', { size: 150, weight: 800, fill: C.lime, ls: -5 });
  const st = [['MOVES', '68'], ['TPS', '4.83'], ['INSPECT', '8.7 s'], ['PENALTY', 'none']];
  st.forEach(([k, v], i) => { const x = MX + i * 120; b += M(x, 300, k, { fill: C.sub, size: 10 }) + S(x, 332, v, { size: 24, weight: 700, fill: k === 'PENALTY' ? C.sub : C.txt, tnum: k !== 'PENALTY' }); });
  // chart top-right: TPS across the solve with step bands
  const cx0 = 600, cx1 = R, cy0 = 96, cy1 = 316, tmax = SOLVE.time, vmax = 7;
  const Xc = s => cx0 + (cx1 - cx0) * s / tmax, Yc = v => cy1 - (cy1 - cy0) * v / vmax;
  b += M(cx0, 88, 'TURNS PER SECOND ACROSS THE SOLVE', { fill: C.sub, size: 10 });
  b += M(R, 88, '— THIS SOLVE    - - SESSION AVG', { fill: C.sub, size: 10, anchor: 'end' });
  let acc = 0;
  STEPS.forEach((s, i) => {
    if (s.t === 0) { b += spark(Xc(acc), cy1 + 16, 5); return; }
    const a = Xc(acc), c = Xc(acc + s.t);
    if (i % 2 === 0) b += rect(a, cy0 + 12, c - a, cy1 - cy0 - 12, C.surf, 'opacity="0.7"');
    b += M((a + c) / 2, cy1 + 20, s.short === 'X' ? 'XC' : s.short, { size: 9, fill: C.dim, anchor: 'middle', ls: 0.6 });
    acc += s.t;
  });
  for (const v of [2, 4, 6]) b += line(cx0, Yc(v), cx1, Yc(v), C.hair) + M(cx0 - 8, Yc(v) + 4, String(v), { size: 9, fill: C.dim, anchor: 'end' });
  const pts = SOLVE.tpsCurve.map((v, i) => [Xc(Math.min(tmax, i * 0.5)), Yc(v)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  b += `<path d="${d} L${pts.at(-1)[0]},${cy1} L${cx0},${cy1}Z" fill="url(#chartFill)"/><path d="${d}" fill="none" stroke="${C.lime}" stroke-width="2.5" stroke-linejoin="round"/>`;
  b += line(cx0, Yc(4.41), cx1, Yc(4.41), C.sub, 1.2, 'stroke-dasharray="5 5"');
  // split bars vs average (left, row 2)
  const sy = 400;
  b += M(MX, sy - 24, 'SPLITS VS YOUR AVERAGE', { fill: C.sub, size: 10 });
  const bx0 = MX + 88, bx1 = MX + 440, smax = 2.6;
  STEPS.forEach((s, i) => {
    const y = sy + i * 30;
    b += M(MX, y + 12, LABEL[s.key], { size: 10, fill: C.sub });
    const col = sector(s);
    if (s.skip) { b += spark(bx0 + 8, y + 7, 6) + M(bx0 + 22, y + 12, 'SKIP', { size: 10, fill: C.lime }); }
    else b += rect(bx0, y, (bx1 - bx0) * s.t / smax, 14, col, 'rx="2"');
    b += rect(bx0 + (bx1 - bx0) * s.avg / smax - 1, y - 4, 2, 22, C.txt, 'opacity="0.55"');
    b += S(bx1 + 72, y + 13, s.skip ? '0.00' : fmt(s.t), { size: 15, weight: 700, anchor: 'end', fill: s.skip ? C.lime : C.txt });
    b += M(bx1 + 140, y + 12, minus(s.t - s.avg), { size: 10, anchor: 'end', fill: s.t < s.avg ? C.lime : C.amb, ls: 0.4 });
    if (s.pseudo) b += M(bx1 + 152, y + 12, 'PSEUDO', { size: 9, fill: C.vio, ls: 1 });
    if (s.alg) b += M(bx1 + 152, y + 12, s.alg.toUpperCase(), { size: 9, fill: C.dim, ls: 1 });
  });
  b += M(MX, sy + 9 * 30 + 12, 'BAR = THIS SOLVE · TICK = AVERAGE · VIOLET = BEST EVER', { size: 9, fill: C.dim });
  // session column
  const sx = 720;
  b += M(sx, sy - 24, 'SESSION', { fill: C.sub, size: 10 });
  [['AO5', '14.62', C.txt], ['AO12', '15.03', C.txt], ['PB', '12.41', C.vio]].forEach(([k, v, c], i) => {
    const x = sx + i * 104; b += M(x, sy + 8, k, { size: 10, fill: C.sub }) + S(x, sy + 40, v, { size: 26, weight: 700, fill: c });
  });
  // sparkline
  const px0 = sx, px1 = sx + 300, py0 = sy + 68, py1 = sy + 132;
  const vmin = 12, vmx = 20;
  const Xs = i => px0 + (px1 - px0) * i / (HISTORY.length - 1), Ys = v => py1 - (py1 - py0) * (v - vmin) / (vmx - vmin);
  let sd = ''; let pen = '';
  HISTORY.forEach((h, i) => {
    const v = histValue(h);
    if (v == null) { pen += `<g stroke="${C.red}" stroke-width="2">${line(Xs(i) - 4, py0 - 4, Xs(i) + 4, py0 + 4, C.red, 2)}${line(Xs(i) + 4, py0 - 4, Xs(i) - 4, py0 + 4, C.red, 2)}</g>`; return; }
    sd += (sd ? 'L' : 'M') + Xs(i).toFixed(1) + ',' + Ys(v).toFixed(1) + ' ';
    if (h.pen) pen += `<circle cx="${Xs(i)}" cy="${Ys(v)}" r="3.5" fill="${C.amb}"/>`;
  });
  b += line(px0, Ys(14.62), px1, Ys(14.62), C.dim, 1, 'stroke-dasharray="3 4"');
  b += `<path d="${sd}" fill="none" stroke="${C.sub}" stroke-width="1.6" stroke-linejoin="round"/>` + pen;
  b += `<circle cx="${Xs(HISTORY.length - 1)}" cy="${Ys(14.07)}" r="5" fill="${C.lime}"/>`;
  b += `<circle cx="${Xs(16)}" cy="${Ys(12.41)}" r="4" fill="${C.vio}"/>`;
  b += M(px0, py1 + 22, 'LAST 23 SOLVES', { size: 9, fill: C.dim });
  // recent list with penalties
  const recent = HISTORY.slice(-5).reverse();
  recent.forEach((h, i) => {
    const y = py1 + 52 + i * 24, lbl = histLabel(h);
    b += M(sx, y, String(23 - i).padStart(2, '0'), { size: 10, fill: C.dim });
    b += S(sx + 40, y + 1, lbl, { size: 15, weight: 600, fill: i === 0 ? C.lime : h.pen === 'DNF' ? C.red : h.pen ? C.amb : C.txt });
    if (h.pen === '+2') b += M(sx + 140, y, '+2 · INSPECTION 15.6 S', { size: 9, fill: C.amb, ls: 1 });
  });
  // older DNF shown as note
  b += M(sx, py1 + 52 + 5 * 24 + 4, '#10  DNF(13.20) · INSPECTION 17.4 S', { size: 9, fill: C.red, ls: 1 });
  // coach column
  const kx = 1080;
  b += M(kx, sy - 24, 'COACH', { fill: C.sub, size: 10 });
  const ins = [
    ['CROSS', C.amb, ['8 moves — optimal was 6:'], "F′ R D2 L′ B2 D"],
    ['PAIR 4', C.amb, ['0.27 s over average.', '0.9 s pause finding it.'], ''],
    ['PSEUDO', C.vio, ['Pair 3 via D-shift —', 'saved ~3 moves.'], ''],
    ['EO SKIP', C.lime, ['3rd this session', '(1 in 8 odds).'], ''],
  ];
  let ky = sy + 6;
  ins.forEach(([tag, col, lines, alg]) => {
    b += rect(kx, ky - 10, 3, 12, col) + M(kx + 12, ky, tag, { size: 10, fill: col });
    lines.forEach((l, j) => b += S(kx, ky + 24 + j * 22, l, { size: 16, weight: 500, fill: C.txt, tnum: false }));
    let yy = ky + 24 + lines.length * 22;
    if (alg) { b += M(kx, yy, alg.replace(/′/g, "'"), { size: 13, fill: C.lime, ls: 1.2 }); yy += 22; }
    ky = yy + 12;
  });
  // final band (split record)
  b += band(752, 64, { current: null, collapse: ['eo'] }, { deltas: true, noSpark: true, noGroups: true });
  b += hints(878, [['SPACE', 'next scramble'], ['R', 'retry same scramble'], ['2', 'toggle +2'], ['D', 'DNF'], ['TAB', 'settings']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
}

// B-09 mobile (three phones)
function phone(ox, oy, content, caption) {
  const pw = 390, ph = 844;
  return M(ox, oy - 20, caption, { fill: C.sub, size: 11 }) +
    `<g transform="translate(${ox},${oy})"><clipPath id="clip${ox}"><rect width="${pw}" height="${ph}" rx="44"/></clipPath><rect width="${pw}" height="${ph}" rx="44" fill="${C.bg}"/><g clip-path="url(#clip${ox})">${content}</g><rect width="${pw}" height="${ph}" rx="44" fill="none" stroke="#2a2a30" stroke-width="2"/>` +
    `<rect x="${pw / 2 - 56}" y="12" width="112" height="30" rx="15" fill="#000"/></g>`;
}
function mobTop(extra = '') {
  return M(24, 72, 'BRAIN', { fill: C.txt, size: 10 }) + `<circle cx="${390 - 52 - mw('I3 · 84%', 10) - 8}" cy="68" r="3" fill="${C.lime}"/>` + M(390 - 52, 72, 'I3 · 84%', { fill: C.sub, size: 10, anchor: 'end' }) + battery(390 - 48, 62.5, 0.84) + extra;
}
function mobBand(y, st, h = 48) {
  return band(y, h, st, { x0: 16, x1: 374, gap: 3, small: true, noGroups: true, sliver: 14, noSpark: true, boost: st.current >= 0 ? { [STEPS[st.current].key]: 2.4 } : {} });
}
function mobile() {
  let b = DEFS;
  b += S(MX, 64, 'Portrait — the band stays pinned to the bottom edge; the thumb zone owns the actions', { size: 22, weight: 800, tnum: false });
  // phone 1: inspection
  let p1 = mobTop();
  p1 += hero(195, 260, 88, STATES.inspect);
  p1 += M(24, 404, 'INSPECTION · WCA', { fill: C.lime, size: 10 });
  p1 += S(24, 560, '6', { size: 180, weight: 800, fill: C.lime, ls: -4 });
  p1 += M(130, 560, 'S LEFT', { fill: C.sub, size: 10 });
  p1 += M(24, 610, 'CROSS HINT', { fill: C.sub, size: 10 }) + S(24, 640, 'White, 6 moves', { size: 18, weight: 700, tnum: false }) + M(24, 664, "F' R D2 L' B2 D", { size: 12, fill: C.lime, ls: 1.2 });
  p1 += inspBand(16, 374, 700, 48, { limit: 15, at: 9, max: 19, zones: [{ from: 15, to: 17, kind: 'pen' }, { from: 17, to: 19, kind: 'dnf' }], callouts: [8, 12], compact: true }).replace(/>8 S CALLED</, '>8 S<').replace(/>12 S CALLED</, '>12 S<');
  p1 += M(195, 812, 'TURN TO START · TAP TO ABORT', { fill: C.dim, size: 9, anchor: 'middle' });
  b += phone(96, 128, p1, 'INSPECTION');
  // phone 2: solving
  let p2 = mobTop();
  p2 += hero(195, 250, 80, STATES.f2l);
  p2 += S(366, 470, '6.65', { size: 120, weight: 800, anchor: 'end', ls: -4 });
  p2 += M(24, 520, 'NOW', { fill: C.sub, size: 10 }) + S(24, 556, 'Pair 3', { size: 32, weight: 800, fill: C.lime, tnum: false });
  p2 += `<rect x="140" y="537" width="${mw('PSEUDO', 9, 1) + 14}" height="20" rx="5" fill="${C.vio}" fill-opacity="0.16"/>` + M(147, 551, 'PSEUDO', { size: 9, ls: 1, fill: C.vio });
  p2 += M(366, 520, 'VS AVG', { fill: C.sub, size: 10, anchor: 'end' }) + S(366, 556, '−0.46', { size: 32, weight: 800, fill: C.lime, anchor: 'end' });
  p2 += M(24, 610, '32 MOVES · 4.81 TPS', { fill: C.sub, size: 10 }) + M(24, 656, 'COACH', { fill: C.sub, size: 10 }) + S(24, 682, 'Next pair is connected in U.', { size: 16, weight: 600, tnum: false });
  p2 += mobBand(716, { current: 3, frac: 0.46, running: 0.9 });
  p2 += M(195, 812, 'CURRENT STEP WIDENS · OTHERS COMPRESS', { fill: C.dim, size: 9, anchor: 'middle' });
  b += phone(525, 128, p2, 'SOLVING');
  // phone 3: results
  let p3 = mobTop();
  p3 += M(24, 120, 'TIME', { fill: C.sub, size: 10 });
  p3 += S(20, 204, '14.07', { size: 88, weight: 800, fill: C.lime, ls: -3 });
  [['MOVES', '68'], ['TPS', '4.83'], ['INSPECT', '8.7 s'], ['AO5', '14.62']].forEach(([k, v], i) => { const x = 24 + i * 88; p3 += M(x, 244, k, { size: 9, fill: C.sub }) + S(x, 270, v, { size: 20, weight: 700 }); });
  // mini chart
  const cx0 = 24, cx1 = 366, cy0 = 300, cy1 = 380, Xc = s => cx0 + (cx1 - cx0) * s / 14.07, Yc = v => cy1 - (cy1 - cy0) * v / 7;
  const pts = SOLVE.tpsCurve.map((v, i) => [Xc(Math.min(14.07, i * .5)), Yc(v)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  p3 += `<path d="${d} L${cx1},${cy1} L${cx0},${cy1}Z" fill="url(#chartFill)"/><path d="${d}" fill="none" stroke="${C.lime}" stroke-width="2"/>` + line(cx0, Yc(4.41), cx1, Yc(4.41), C.sub, 1, 'stroke-dasharray="4 4"');
  p3 += M(24, 402, 'TPS ACROSS THE SOLVE', { size: 9, fill: C.dim });
  // splits list
  STEPS.forEach((s, i) => {
    const y = 440 + i * 26;
    p3 += M(24, y, LABEL[s.key], { size: 10, fill: C.sub });
    if (s.skip) p3 += spark(122, y - 4, 5) + M(134, y, 'SKIP', { size: 10, fill: C.lime });
    else p3 += rect(110, y - 10, 150 * s.t / 2.6, 10, sector(s), 'rx="2"') + rect(110 + 150 * s.avg / 2.6 - 1, y - 13, 2, 16, C.txt, 'opacity="0.5"');
    p3 += S(318, y + 1, s.skip ? '—' : fmt(s.t), { size: 14, weight: 700, anchor: 'end' });
    p3 += M(366, y, minus(s.t - s.avg), { size: 9, anchor: 'end', fill: s.t < s.avg ? C.lime : C.amb, ls: 0 });
  });
  p3 += M(24, 690, 'COACH', { size: 10, fill: C.sub }) + S(24, 714, 'Cross: 8 moves, optimal 6.', { size: 15, weight: 600, tnum: false }) + M(24, 736, "F' R D2 L' B2 D", { size: 12, fill: C.lime, ls: 1.2 });
  p3 += `<rect x="16" y="764" width="358" height="52" rx="10" fill="${C.lime}"/>` + S(195, 797, 'Next scramble', { size: 18, weight: 800, fill: C.ink, anchor: 'middle', tnum: false });
  b += phone(954, 128, p3, 'RESULTS');
  return svg(W, 1000, b, { fonts: FONTS, bg: C.bg });
}

// B-10 settings
function settings() {
  let b = DEFS + topBar('SETTINGS');
  b += S(MX, 120, 'Settings', { size: 40, weight: 800, tnum: false });
  // search / command line
  b += `<rect x="${MX}" y="148" width="560" height="44" rx="8" fill="${C.surf}"/>` + M(MX + 16, 175, '/', { fill: C.lime, size: 13 }) + M(MX + 36, 175, 'TYPE TO FILTER · E.G. “OVERTIME”, “PLL”, “HIDE”', { fill: C.dim, size: 11 });
  b += `<rect x="${MX + 600}" y="148" width="${mw('WCA DEFAULTS', 11) + 32}" height="44" rx="8" fill="none" stroke="${C.dim}"/>` + M(MX + 616, 175, 'WCA DEFAULTS', { fill: C.txt });
  b += M(W - MX, 175, 'CHANGES APPLY INSTANTLY · SAVED ON THIS DEVICE', { fill: C.dim, size: 10, anchor: 'end' });
  const groups = [
    ['METHOD', [
      ['Method', ['CFOP', 'Roux'], 0, 0],
      ['Cross', ['cross', 'x-cross', 'xx-cross'], 0, 0],
      ['F2L pairs', ['standard', 'accept pseudo'], 1, 0],
      ['OLL', ['1-look', '2-look'], 1, null],
      ['PLL', ['1-look', '2-look'], 1, null],
    ]],
    ['INSPECTION', [
      ['Length', ['15 s', 'custom', 'unlimited', 'off'], 0, 0],
      ['Custom seconds', ['8', '10', '12', '20'], null, null, true],
      ['Overtime', ['WCA +2 / DNF', 'count only', 'grace', 'auto-start'], 0, 0],
      ['Grace', ['1 s', '2 s', '3 s', '5 s'], null, null, true],
      ['After grace', ['+2', 'DNF', 'nothing'], null, null, true],
      ['Judge callouts', ['off', '8 s · 12 s'], 1, 0],
    ]],
    ['TRAINING', [
      ['Scramble', ['guided', 'paste', 'free solve'], 0, 0],
      ['Coach', ['live', 'after solve', 'off'], 0, 0],
      ['Cross hint', ['on hold X', 'always', 'off'], 0, 0],
      ['Timer', ['visible', 'hide while solving'], 0, 0],
      ['Timeline', ['on', 'off'], 0, 0],
      ['Splits compare', ['your average', 'your PB', 'raw'], 0, 0],
      ['Sounds', ['off', 'callouts only', 'all'], 1, 0],
    ]],
  ];
  const colX = [MX, 496, 1000];
  groups.forEach(([g, rows], gi) => {
    const x = colX[gi]; let y = 256;
    b += M(x, y, g, { fill: C.lime, size: 11 }) + line(x + mw(g, 11) + 8, y - 4, x + (gi === 2 ? 392 : 400), y - 4, C.hair);
    y += 40;
    rows.forEach(([name, opts, on, def, disabled]) => {
      b += S(x, y, name, { size: 15, weight: 600, fill: disabled ? C.dim : C.txt, tnum: false });
      let ox = x + (gi === 2 ? 124 : 132);
      opts.forEach((op, i) => {
        const w = op.length * (i === on ? 8.3 : 7.4);
        const active = i === on;
        b += S(ox, y, op, { size: 14, weight: active ? 800 : 500, fill: disabled ? C.dim : active ? C.lime : C.sub, tnum: false });
        if (active) b += rect(ox, y + 8, w - 2, 2, C.lime);
        if (i === def && def != null) b += `<circle cx="${ox + w / 2}" cy="${y + 20}" r="2" fill="${C.sub}"/>`;
        ox += w + 16;
      });
      y += 48;
    });
  });
  b += `<circle cx="${MX + 4}" cy="636" r="2" fill="${C.sub}"/>` + M(MX + 16, 640, 'DOT = WCA / DEFAULT VALUE · UNDERLINE = CURRENT', { size: 10, fill: C.dim });
  b += M(MX, 668, 'DIMMED ROWS UNLOCK WHEN THEIR PARENT OPTION IS PICKED (CUSTOM, GRACE)', { size: 10, fill: C.dim });
  // live preview band
  b += M(MX, 728, 'LIVE PREVIEW · CFOP · PSEUDO PAIRS · 2-LOOK OLL · 2-LOOK PLL · WCA 15 S', { size: 10, fill: C.sub });
  b += band(752, 64, { current: -1 }, { noGroups: true });
  b += hints(878, [['/', 'filter'], ['TAB', 'next group'], ['← →', 'change value'], ['ESC', 'back to cube']]);
  return svg(W, H, b, { fonts: FONTS, bg: C.bg });
}

write('B-01-idle.svg', idle());
write('B-02-scramble.svg', scramble());
write('B-03-inspection.svg', inspection());
write('B-04-overtime.svg', overtime());
write('B-05-inspection-variants.svg', variants());
write('B-06-solving.svg', solve1());
write('B-07-skip.svg', solve2());
write('B-08-results.svg', results());
write('B-09-mobile.svg', mobile());
write('B-10-settings.svg', settings());
