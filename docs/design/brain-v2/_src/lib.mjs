// Shared helpers + shared realistic data for the Brain v2 mockups.
import fs from 'fs';

const NM = new URL('../../../../node_modules', import.meta.url).pathname.replace(/\/$/, '');
export const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
fs.mkdirSync(OUT, { recursive: true });

const b64 = p => fs.readFileSync(NM + p).toString('base64');
const FONT_SRC = {
  'mono300': ["'DM Mono'", 300, '/@fontsource/dm-mono/files/dm-mono-latin-300-normal.woff2'],
  'mono400': ["'DM Mono'", 400, '/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2'],
  'mono500': ["'DM Mono'", 500, '/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2'],
  'manrope': ["'Manrope'", '200 800', '/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2'],
};
// Embeds the shipped fonts (base64) so every SVG renders identically standalone,
// inside <img>, and in the PNG renders.
export function fontStyle(keys, extraCss = '') {
  const faces = keys.map(k => {
    const [fam, w, p] = FONT_SRC[k];
    return `@font-face{font-family:${fam};font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${b64(p)}) format('woff2');}`;
  }).join('');
  return `<style>${faces}${extraCss}</style>`;
}

export const MONO = "'DM Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
export const SANS = "'Manrope', 'Manrope Variable', system-ui, -apple-system, 'Segoe UI', sans-serif";

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// text helper: t(x, y, str, {size, fill, family, weight, anchor, ls, opacity, extra})
export function t(x, y, s, o = {}) {
  const a = [`x="${x}"`, `y="${y}"`];
  if (o.size) a.push(`font-size="${o.size}"`);
  if (o.fill) a.push(`fill="${o.fill}"`);
  if (o.family) a.push(`font-family="${o.family}"`);
  if (o.weight) a.push(`font-weight="${o.weight}"`);
  if (o.anchor) a.push(`text-anchor="${o.anchor}"`);
  if (o.ls != null) a.push(`letter-spacing="${o.ls}"`);
  if (o.opacity != null) a.push(`opacity="${o.opacity}"`);
  if (o.tnum) a.push(`style="font-variant-numeric:tabular-nums"`);
  if (o.extra) a.push(o.extra);
  return `<text ${a.join(' ')}>${o.raw ? s : esc(s)}</text>`;
}
export const monoW = (str, size) => String(str).length * size * 0.6; // DM Mono advance = 0.6em

export function svg(w, h, body, { fonts = ['mono400'], css = '', bg } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${fontStyle(fonts, css)}
${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}
${body}
</svg>
`;
}
export function write(name, content) { fs.writeFileSync(`${OUT}/${name}`, content); console.log('wrote', name, (content.length / 1024).toFixed(0) + 'KB'); }

// ---------- isometric cube ----------
// faces: { U: 'wwwwwwwww' (row-major, back row first, from above with F at the bottom),
//          F: 9 chars top row first, R: 9 chars top row first }. Letters: w y g b r o, '.' = dark/unknown.
export const CUBE_STD = { w: '#f4f4f0', y: '#ffd43b', g: '#16a34a', b: '#2563eb', r: '#e5302b', o: '#ff7a1a', '.': '#2a2d33' };
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
export function cube(cx, cy, s, faces, o = {}) {
  const pal = o.palette || CUBE_STD;
  const gap = o.gap ?? 0.09;
  const body = o.body || '#0c0d0f';
  const k = { U: 1, F: o.shadeF ?? 0.84, R: o.shadeR ?? 0.68 };
  const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
  const L = [-c30 * s, -s30 * s], Rv = [c30 * s, -s30 * s], D = [0, s];
  const P0 = [cx, cy - s / 2]; // near-top corner; cube vertically centred on cy
  const add = (...v) => v.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
  const mul = (v, m) => [v[0] * m, v[1] * m];
  const pt = {
    U: (a, b) => add(P0, mul(L, 1 - a), mul(Rv, b)),
    F: (a, d) => add(P0, mul(L, 1 - a), mul(D, d)),
    R: (a, d) => add(P0, mul(Rv, a), mul(D, d)),
  };
  const P = p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  let out = `<g${o.opacity != null ? ` opacity="${o.opacity}"` : ''}>`;
  // body silhouette
  const hex = [add(P0, L), add(P0, L, Rv), add(P0, Rv), add(P0, Rv, D), add(P0, D), add(P0, L, D)];
  if (o.glow) out += `<ellipse cx="${cx}" cy="${cy + s * 0.95}" rx="${s * 1.05}" ry="${s * 0.16}" fill="${o.glow}" opacity="0.5"/>`;
  out += `<polygon points="${hex.map(P).join(' ')}" fill="${body}" stroke="${body}" stroke-width="${s * 0.03}" stroke-linejoin="round"/>`;
  for (const f of ['U', 'F', 'R']) {
    const st = faces[f];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const ch = st[r * 3 + c];
      let quad;
      if (f === 'U') {
        const b0 = (2 - r) / 3, b1 = (3 - r) / 3, a0 = c / 3, a1 = (c + 1) / 3;
        const g = gap / 3;
        quad = [pt.U(a0 + g, b0 + g), pt.U(a1 - g, b0 + g), pt.U(a1 - g, b1 - g), pt.U(a0 + g, b1 - g)];
      } else {
        const a0 = c / 3, a1 = (c + 1) / 3, d0 = r / 3, d1 = (r + 1) / 3, g = gap / 3;
        quad = [pt[f](a0 + g, d0 + g), pt[f](a1 - g, d0 + g), pt[f](a1 - g, d1 - g), pt[f](a0 + g, d1 - g)];
      }
      const col = shade(pal[ch] || pal['.'], k[f]);
      const hl = o.highlight && o.highlight[f] && o.highlight[f].includes(r * 3 + c);
      out += `<polygon points="${quad.map(P).join(' ')}" fill="${col}" stroke="${col}" stroke-width="${s * 0.018}" stroke-linejoin="round"${hl ? ` class="hl"` : ''}/>`;
    }
  }
  if (o.turnArrow) out += o.turnArrow;
  return out + '</g>';
}

// ---------- shared realistic data ----------
export const SCRAMBLE = ["D2", "F2", "U'", "B2", "R2", "U2", "F2", "U'", "L2", "D'", "B'", "L'", "U", "F'", "R'", "D2", "R", "U'", "F2", "L'"];
// guided-scramble frame state: 11 moves done, the 12th (L') was turned the wrong way (L)
export const SCR_DONE = 11; // indices < 11 done; index 11 = current (L')

// Cube states (hand-made, plausible)
export const STATES = {
  solved: { U: 'wwwwwwwww', F: 'ggggggggg', R: 'rrrrrrrrr' },
  scrambled: { U: 'gowybrwyo', F: 'rbygwgobw', R: 'ywbrrogbg' },
  midScramble: { U: 'wbowwgyrw', F: 'ggrygbwgo', R: 'brrorywrb' },
  // yellow on top during the solve (white cross on D)
  inspect: { U: 'ybgoyrwby', F: 'rgoygwbyg', R: 'owyrrbgoy' },
  f2l: { U: 'ygobyrybo', F: 'yorggbggg', R: 'bgyrrrrrr' },   // cross + 2 pairs visible on F/R
  pll: { U: 'yyyyyyyyy', F: 'ogobggggg', R: 'grrrrrrrr' },  // OLL done, PLL corners pending
};

export const SOLVE = {
  scramble: SCRAMBLE.join(' '),
  time: 14.07, moves: 68, tps: 4.83, inspection: 8.7,
  // steps: label, key, t (s), moves, avg (s), flags
  steps: [
    { key: 'cross', label: 'Cross', short: 'X', t: 2.08, mv: 8, avg: 2.41 },
    { key: 'p1', label: 'Pair 1', short: 'P1', t: 1.71, mv: 7, avg: 1.88 },
    { key: 'p2', label: 'Pair 2', short: 'P2', t: 1.96, mv: 9, avg: 1.92 },
    { key: 'p3', label: 'Pair 3', short: 'P3', t: 1.52, mv: 7, avg: 1.95, pseudo: true },
    { key: 'p4', label: 'Pair 4', short: 'P4', t: 2.31, mv: 10, avg: 2.04 },
    { key: 'eo', label: 'EO', short: 'EO', t: 0, mv: 0, avg: 0.98, skip: true },
    { key: 'co', label: 'CO', short: 'CO', t: 1.64, mv: 8, avg: 1.55, alg: 'Sune' },
    { key: 'cp', label: 'CP', short: 'CP', t: 1.47, mv: 9, avg: 1.62, alg: 'Aa' },
    { key: 'ep', label: 'EP', short: 'EP', t: 1.38, mv: 10, avg: 1.49, alg: 'Ub' },
  ],
  ao5: 14.62, ao12: 15.03, pb: 12.41, session: 23, mean: 15.21,
  history: [16.88, 15.42, 17.93, 15.10, 14.71, 16.20, 15.87, 13.94, 15.55, 16.71, 14.36, 15.02, 18.40, 14.88, 15.63, 14.12, 12.41, 15.94, 14.97, 15.36, 14.55, 14.83, 14.07],
  // rolling TPS samples across the solve, 0.5 s buckets (0..14)
  tpsCurve: [2.0, 3.6, 4.4, 3.2, 5.2, 4.1, 3.0, 5.6, 5.9, 4.8, 3.4, 5.5, 6.1, 4.9, 3.1, 4.4, 5.8, 4.2, 2.6, 3.9, 5.3, 2.4, 4.8, 6.4, 5.9, 3.8, 5.7, 6.6, 5.2],
  insights: [
    { tag: 'cross', text: 'Cross took 8 moves — optimal was 6:', alg: "F' R D2 L' B2 D" },
    { tag: 'pair 4', text: 'Pair 4 was 0.27 s over your average — 0.9 s pause finding it.', alg: '' },
    { tag: 'pseudo', text: 'Pair 3 went in pseudo (D-shift) — saved ~3 moves.', alg: '' },
    { tag: 'eo skip', text: 'EO skip. Your 3rd this session (1 in 8 odds).', alg: '' },
  ],
};
// cumulative ends
export function cumulative(steps) { let c = 0; return steps.map(s => (c += s.t)); }
export const fmt = v => v.toFixed(2);

// solve history with penalties (most recent last). pen: '+2' | 'DNF'
export const HISTORY = [
  { t: 16.88 }, { t: 15.42, pen: '+2' }, { t: 17.93 }, { t: 15.10 }, { t: 14.71 }, { t: 16.20 },
  { t: 15.87 }, { t: 13.94 }, { t: 15.55 }, { t: 13.20, pen: 'DNF' }, { t: 14.36 }, { t: 15.02 },
  { t: 18.40 }, { t: 14.88 }, { t: 15.63 }, { t: 14.12 }, { t: 12.41 }, { t: 15.94 }, { t: 12.97, pen: '+2' },
  { t: 15.36 }, { t: 14.55 }, { t: 14.83 }, { t: 14.07 },
];
export const histLabel = h => h.pen === 'DNF' ? `DNF(${h.t.toFixed(2)})` : h.pen === '+2' ? `${(h.t + 2).toFixed(2)}+` : h.t.toFixed(2);
export const histValue = h => h.pen === 'DNF' ? null : h.t + (h.pen === '+2' ? 2 : 0);

// Settings model (defaults = WCA) — shared by every direction's config frame.
export const SETTINGS = {
  method: ['CFOP', 'Roux'],
  cross: ['cross', 'x-cross', 'xx-cross'],
  f2l: ['standard', 'pseudo pairs'],
  oll: ['1-look', '2-look'],
  pll: ['1-look', '2-look'],
  inspection: ['15 s', 'custom', 'unlimited', 'off'],
  overtime: ['WCA +2/DNF', 'count only', 'grace', 'auto-start'],
  callouts: ['off', '8 s · 12 s'],
  scramble: ['guided', 'paste', 'free'],
  coach: ['live', 'after solve', 'off'],
  timer: ['visible', 'hide while solving'],
  timeline: ['on', 'off'],
  splits: ['vs average', 'vs PB', 'raw'],
};
