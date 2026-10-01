// Orbit v3: the two core components (CUBE, ORBIT) plus the few shared pieces, as SVG builders.
// Everything on every frame is made from these functions. Tokens: docs/design/brain-v2/tokens.md (orbit-dark).
import fs from 'fs';
import { cube as rawCube, fontStyle, MONO, SANS, esc, STATES, SOLVE } from '../../brain-v2/_src/lib.mjs';
export { MONO, SANS, esc, STATES, SOLVE };
export const OUT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// ---------- tokens (orbit-dark) ----------
export const K = {
  bg: '#141311', canvas: '#0d0c0b', surface: '#1d1b18', s2: '#2b2925', ink: '#ece6d8', muted: '#9a9486', faint: '#6d675c',
  accent: '#3dbfad', accentSoft: '#16403a', onAccent: '#0b1f1c', good: '#3dbfad', warn: '#e6a642', warnSoft: '#4d3715',
  dnf: '#ec6b5f', track: '#34312b', hair: '#34312b', keyBg: '#2b2925', keyInk: '#d9d2c3',
};
const PAL = { w: '#f4f4f0', y: '#ffd43b', g: '#16a34a', b: '#2563eb', r: '#e5302b', o: '#ff7a1a', '.': '#2a2d33' };
export const fmt = v => v.toFixed(2);
export const sgn = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
export const MV = s => s.replace(/'/g, '′');

// ---------- primitives ----------
const f = n => +(+n).toFixed(2);
export const rad = d => d * Math.PI / 180;
export const pol = (cx, cy, r, deg) => [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))];
export function tx(x, y, s, o = {}) {
  return `<text x="${f(x)}" y="${f(y)}" font-family="${o.sans ? SANS : MONO}" font-size="${o.size || 13}" fill="${o.fill || K.muted}" font-weight="${o.w || 400}" text-anchor="${o.a || 'start'}"${o.ls != null ? ` letter-spacing="${o.ls}"` : ''}${o.op != null ? ` opacity="${o.op}"` : ''} style="font-variant-numeric:tabular-nums"${o.extra ? ' ' + o.extra : ''}>${esc(s)}</text>`;
}
export const sans = (x, y, s, o = {}) => tx(x, y, s, { ...o, sans: true });
export function arc(cx, cy, r, a0, a1, o = {}) {
  const [x0, y0] = pol(cx, cy, r, a0), [x1, y1] = pol(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `<path d="M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}" fill="none" stroke="${o.c || K.ink}" stroke-width="${o.w || 6}" stroke-linecap="${o.cap || 'round'}"${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
}
export const dot = (x, y, r, fill, stroke, sw = 2) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
export const line = (x1, y1, x2, y2, c = K.hair, w = 1, extra = '') => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${c}" stroke-width="${w}"${extra}/>`;
export const star = (x, y, R, fill) => `<path d="M${f(x)} ${f(y - R)}Q${f(x)} ${f(y)} ${f(x + R)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y + R)}Q${f(x)} ${f(y)} ${f(x - R)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y - R)}Z" fill="${fill}"/>`;
export const chev = (x, y, s, dir, c = K.muted, w = 2) => { const d = dir === 'r' ? 1 : -1; return `<path d="M${f(x - d * s * .5)} ${f(y - s)}L${f(x + d * s * .5)} ${f(y)}L${f(x - d * s * .5)} ${f(y + s)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`; };
export const play = (x, y, s, c) => `<path d="M${f(x - s * .6)} ${f(y - s)}L${f(x + s)} ${f(y)}L${f(x - s * .6)} ${f(y + s)}Z" fill="${c}"/>`;
export const pauseGlyph = (x, y, s, c) => `<rect x="${f(x - s * .8)}" y="${f(y - s)}" width="${f(s * .55)}" height="${f(s * 2)}" rx="1.5" fill="${c}"/><rect x="${f(x + s * .25)}" y="${f(y - s)}" width="${f(s * .55)}" height="${f(s * 2)}" rx="1.5" fill="${c}"/>`;

export function svgDoc(w, h, body, { css = '', extraDefs = '' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${fontStyle(['mono400', 'mono500', 'manrope'], '.hl{stroke:#3dbfad;stroke-width:3.2;paint-order:stroke}.hlw{stroke:#e6a642;stroke-width:3.2}' + css)}
<defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#3dbfad" stop-opacity=".22"/><stop offset=".55" stop-color="#3dbfad" stop-opacity=".07"/><stop offset="1" stop-color="#3dbfad" stop-opacity="0"/></radialGradient>
<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" stroke="#ec6b5f" stroke-width="2.2"/></pattern>${extraDefs}</defs>
<rect width="${w}" height="${h}" fill="${K.bg}"/>
${body}
</svg>
`;
}
export function write(name, content) { fs.writeFileSync(`${OUT}/${name}`, content); console.log('wrote', name, (content.length / 1024).toFixed(0) + 'KB'); }

// ---------- CUBE component ----------
// sizes: S 30 (list/inline), M 70, L 130 (phone hero / drills), XL 215 (desktop hero: 430 px tall = 48 % of 900)
export const CUBE_SIZES = { S: 30, M: 70, L: 130, XL: 215 };
// state: a STATES key or a {U,F,R} object. highlight: {U:[..],F:[..],R:[..]} drawn with the .hl (teal) or .hlw (warn) class
export function Cube(cx, cy, size, state, o = {}) {
  const s = typeof size === 'string' ? CUBE_SIZES[size] : size;
  const faces = typeof state === 'string' ? STATES[state] : state;
  let out = '';
  if (o.glow !== false && s >= 60) out += `<ellipse cx="${f(cx)}" cy="${f(cy + s * 1.02)}" rx="${f(s * 1.35)}" ry="${f(s * .3)}" fill="url(#glow)"/>`;
  if (s >= 60) out += `<ellipse cx="${f(cx)}" cy="${f(cy + s * 0.5 + s * .3)}" rx="${f(s * .78)}" ry="${f(s * .1)}" fill="#000" opacity=".35"/>`;
  out += rawCube(cx, cy + s / 2, s, faces, { palette: PAL, body: '#1d1b18', shadeF: .86, shadeR: .72, highlight: o.highlight, opacity: o.opacity, gap: s < 50 ? .14 : .09 });
  return out;
}

// ---------- ORBIT component ----------
// spec: { cx, cy, r, start, sweep }  start deg clockwise from 12 o'clock, sweep 360 (closed) or 290 (dial)
// segment: { key, w (weight), state: future|current|done|skipped|wrong|good|bad, label, sub, fill (0..1 for current), skip }
export function layoutSegs(spec, segs, { gap = 2.5, skipDeg = 4 } = {}) {
  const closed = spec.sweep >= 359.9, n = segs.length;
  const nSkip = segs.filter(s => s.skip).length;
  const sum = segs.reduce((a, s) => a + (s.skip ? 0 : s.w), 0);
  const per = (spec.sweep - gap * (closed ? n : n - 1) - skipDeg * nSkip) / sum;
  let a = spec.start + (closed ? gap / 2 : 0);
  return segs.map(s => { const span = s.skip ? skipDeg : s.w * per; const o = { ...s, a0: a, a1: a + span, mid: a + span / 2 }; a += span + gap; return o; });
}
export const segAngle = (seg, fr) => seg.a0 + (seg.a1 - seg.a0) * fr;
// stroke widths: track 3, done 6, current 8 (tokens)
const STROKE = { future: [3, K.track], done: [6, K.ink], skipped: [3, K.good], current: [8, K.accent], wrong: [8, K.warn], good: [6, K.good], bad: [6, K.warn] };
export function OrbitSegs(spec, segs, o = {}) {
  let out = '';
  for (const s of segs) {
    const [w0, c0] = STROKE[s.state] || STROKE.future;
    const w = s.w6 ?? w0, c = s.color || c0;
    const span = s.a1 - s.a0;
    if (s.state === 'current' && s.fill != null) {
      const aEnd = s.a0 + span * Math.min(1, Math.max(0, s.fill));
      out += arc(spec.cx, spec.cy, spec.r, s.a0, s.a1, { w: 3, c: K.track });
      out += arc(spec.cx, spec.cy, spec.r, s.a0, aEnd, { w: 8, c: s.fill > 1 ? K.warn : K.accent });
      const [dx, dy] = pol(spec.cx, spec.cy, spec.r, aEnd);
      out += dot(dx, dy, 14, K.accent, null).replace('/>', ' opacity=".16"/>') + dot(dx, dy, 7.5, K.accent) + dot(dx, dy, 2.8, K.bg);
    } else if (s.skip) {
      const [mx, my] = pol(spec.cx, spec.cy, spec.r, s.mid);
      out += arc(spec.cx, spec.cy, spec.r, s.a0, s.a1, { w: 3, c: K.good, op: .9 }) + star(mx, my, 8, K.good);
    } else {
      out += arc(spec.cx, spec.cy, spec.r, s.a0, Math.max(s.a1, s.a0 + .8), { w, c, cap: o.cap || 'round' });
    }
  }
  return out;
}
// outer label rule: text sits OUTSIDE the ring along the radius, anchored by side; top arcs stack upward, bottom arcs downward
export function OutLabel(spec, deg, lines, o = {}) {
  const [x, y] = pol(spec.cx, spec.cy, spec.r + (o.pad ?? 20), deg);
  const sn = Math.sin(rad(deg)), cs = Math.cos(rad(deg));
  const a = o.a || (sn > .32 ? 'start' : sn < -.32 ? 'end' : 'middle');
  const lh = l => (l.size || 12) + 5;
  const H = lines.reduce((t, l) => t + lh(l), 0);
  let top = cs > .55 ? y - H : cs < -.55 ? y : y - H / 2;
  const dx = a === 'start' ? 2 : a === 'end' ? -2 : 0;
  let out = '';
  for (const l of lines) {
    top += lh(l); const sz = l.size || 12; const yy = top - 4;
    if (l.g) {   // marker line: glyph + text, glyph on the side away from the ring
      const w = l.t.length * sz * 0.6;
      const gc = l.g === 'good' ? K.good : K.warn;
      const gl = (gx, gy) => l.g === 'good' ? star(gx, gy, 5.5, K.good) : dot(gx, gy, 4.2, K.bg, K.warn, 1.8);
      if (a === 'start') { out += gl(x + 7, yy - sz * .35) + tx(x + 18, yy, l.t, { size: sz, fill: gc, w: 500, a: 'start' }); }
      else if (a === 'end') { out += gl(x - 7, yy - sz * .35) + tx(x - 18, yy, l.t, { size: sz, fill: gc, w: 500, a: 'end' }); }
      else { out += gl(x - w / 2 - 6, yy - sz * .35) + tx(x + 6, yy, l.t, { size: sz, fill: gc, w: 500, a: 'middle' }); }
    } else out += tx(x + dx, yy, l.t, { size: sz, fill: l.fill || K.muted, w: l.w || 400, a, sans: l.sans });
  }
  return out;
}
export const deltaColor = d => (d <= -0.1 ? K.good : d >= 0.1 ? K.warn : K.ink);
export const caret = (spec, deg, len = 14, c = K.ink, w = 2) => { const [x0, y0] = pol(spec.cx, spec.cy, spec.r - len, deg), [x1, y1] = pol(spec.cx, spec.cy, spec.r + len, deg); return line(x0, y0, x1, y1, c, w, ' stroke-linecap="round"'); };

// markers (good = teal disc + spark, bad = amber ring + "!"): shape + colour, never colour alone
export function Marker(x, y, kind, o = {}) {
  let out = '';
  if (o.sel) out += dot(x, y, 16, 'none', K.ink, 1.6);
  if (kind === 'good') out += dot(x, y, 10, K.good) + star(x, y, 6, K.onAccent);
  else out += dot(x, y, 10, K.bg, K.warn, 2.6) + tx(x, y + 4.5, '!', { size: 14, fill: K.warn, w: 500, a: 'middle', sans: true });
  return out;
}
export function Callout(spec, deg, kind, text, o = {}) {
  // pill INSIDE the ring next to its marker, sized for DM Mono 12
  const [px, py] = pol(spec.cx, spec.cy, spec.r - (o.in ?? 30), deg);
  const w = text.length * 7.2 + 18, h = 24, sn = Math.sin(rad(deg));
  const left = o.left ?? (sn > 0.05);   // right half: pill extends leftwards
  const x = left ? px - w : px;
  const fill = kind === 'good' ? K.accentSoft : K.warnSoft, tc = kind === 'good' ? K.accent : K.warn;
  return `<rect x="${f(x)}" y="${f(py - h / 2)}" width="${f(w)}" height="${h}" rx="12" fill="${fill}"/>` + tx(x + w / 2, py + 4.2, text, { size: 12, fill: tc, w: 500, a: 'middle' });
}
// mini orbit glyph for lists: one ring, one weight per stage, markers as dots. size = outer radius
export function OrbitGlyph(cx, cy, r, steps, o = {}) {
  const spec = { cx, cy, r, start: 0, sweep: 360 };
  const segs = layoutSegs(spec, steps.map(st => ({ key: st.key, w: Math.max(st.t, 0.4), skip: st.skip, state: 'done' })), { gap: 6, skipDeg: 8 });
  let out = '';
  const th = Math.max(2.2, r / 6);
  for (const s of segs) {
    const st = steps.find(x => x.key === s.key); const d = st.skip ? -1 : st.t - st.avg;
    const c = st.skip ? K.good : d <= -0.1 ? K.good : d >= 0.1 ? K.warn : (o.ink || K.ink);
    out += arc(cx, cy, r, s.a0, s.a1, { w: th, c: st.skip ? K.good : c, cap: 'butt', op: o.op });
  }
  for (const m of o.marks || []) { const seg = segs[m.i]; const [x, y] = pol(cx, cy, r + th + 2.2, segAngle(seg, m.f ?? .5)); out += dot(x, y, r > 18 ? 2.6 : 2.0, m.kind === 'good' ? K.good : K.warn); }
  return out;
}

// ---------- shared pieces ----------
export const Pill = (x, y, w, h, label, o = {}) => {
  const bg = o.primary ? K.ink : o.accent ? K.accent : K.s2, fg = o.primary ? K.bg : o.accent ? K.onAccent : K.ink;
  let out = `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" rx="${h / 2}" fill="${bg}"${o.stroke ? ` stroke="${K.hair}"` : ''}/>`;
  const keyW = o.key ? o.key.length * 7.4 + 14 : 0;
  const tw = w - (o.key ? keyW + 8 : 0);
  out += sans(x + (o.key ? 18 : w / 2), y + h / 2 + 5.2, label, { size: o.size || 15, fill: fg, w: 700, a: o.key ? 'start' : 'middle' });
  if (o.key) out += `<rect x="${f(x + w - keyW - 10)}" y="${f(y + h / 2 - 11)}" width="${f(keyW)}" height="22" rx="6" fill="${o.primary ? K.bg : K.keyBg}"/>` + tx(x + w - 10 - keyW / 2, y + h / 2 + 4, o.key, { size: 11.5, fill: o.primary ? K.keyInk : K.keyInk, w: 500, a: 'middle' });
  return out;
};
export const TextBtn = (x, y, label, o = {}) => sans(x, y, label, { size: o.size || 15, fill: o.fill || K.muted, w: 600, a: o.a || 'middle' });
export const Chip = (x, y, label, o = {}) => {
  const w = label.length * 7.4 + 22;
  const on = o.on;
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="26" rx="13" fill="${on ? K.accentSoft : 'none'}" stroke="${on ? 'none' : K.hair}"/>` + tx(x + w / 2, y + 17.5, label, { size: 12, fill: on ? K.accent : K.muted, w: 500, a: 'middle' }) + '';
};
export const chipW = label => label.length * 7.4 + 22;
export function Keys(x, y, items, o = {}) {
  let out = '', cx = x;
  for (const [k, l] of items) {
    const kw = k.length * 7.4 + 14;
    out += `<rect x="${f(cx)}" y="${f(y - 14)}" width="${f(kw)}" height="20" rx="6" fill="${K.keyBg}"/>` + tx(cx + kw / 2, y, k, { size: 11, fill: K.keyInk, w: 500, a: 'middle' });
    out += sans(cx + kw + 8, y, l, { size: 12.5, fill: o.fill || K.muted, w: 500 });
    cx += kw + 8 + l.length * 6.8 + 26;
  }
  return out;
}
export const Coach = (x, y, lines, o = {}) => {
  // ONE sentence, praise first, tied to a marker. lines: pre-wrapped
  let out = '';
  if (o.tag) out += (o.good ? star(x + 5, y - 4, 5, K.good) : dot(x + 5, y - 4, 4.5, K.bg, K.warn, 2)) + tx(x + 18, y, o.tag, { size: 12, fill: o.good ? K.good : K.warn, w: 500 });
  lines.forEach((l, i) => { out += sans(x, y + 28 + i * (o.lh || 28), l, { size: o.size || 19, fill: K.ink, w: 500 }); });
  return out;
};
export function Header(w, { nav = true, active = 'solve', dim = 1, status = 'GAN 356 i3', pad = 48 } = {}) {
  let out = `<g opacity="${dim}">` + sans(pad, 38, 'cubesight', { size: 20, fill: K.ink, w: 800, ls: -0.4 });
  if (nav) {
    let x = pad + 150;
    for (const n of ['solve', 'drills', 'algs', 'progress', 'history']) {
      const on = n === active; const wd = n.length * 8.4;
      out += sans(x, 38, n, { size: 15, fill: on ? K.ink : K.muted, w: on ? 700 : 500 });
      if (on) out += `<rect x="${x}" y="48" width="${wd}" height="2" rx="1" fill="${K.accent}"/>`;
      x += wd + 28;
    }
  }
  out += dot(w - pad - 124, 33, 4, K.good) + tx(w - pad - 112, 37, status, { size: 12, fill: K.muted }) + tx(w - pad, 37, '84%', { size: 12, fill: K.muted, a: 'end' });
  return out + '</g>';
}
export const Hairline = (x1, y1, x2, y2) => line(x1, y1, x2, y2, K.hair, 1);

// ---------- the shared solve data ----------
const S = SOLVE.steps;
export const STAGES = S.map(s => ({ ...s, key: s.key, name: s.key === 'p1' ? 'p1' : s.key, delta: s.skip ? -s.avg : +(s.t - s.avg).toFixed(2) }));
export const NAMES = { cross: 'cross', p1: 'pair 1', p2: 'pair 2', p3: 'pair 3', p4: 'pair 4', eo: 'EO', co: 'CO', cp: 'CP', ep: 'EP' };
export const SHORT = { cross: 'cross', p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4', eo: 'eo', co: 'co', cp: 'cp', ep: 'ep' };
export const MOVES = SOLVE.scramble.split(' ');
export const CUM = (() => { let c = 0; return S.map(s => (c += s.t)); })();
// markers on the ring: [stage index, fraction, kind, short text, long text]
export const MARKS = [
  { id: 'detour', i: 0, f: .42, kind: 'bad', text: 'detour +2 mv', long: 'cross detour, move 4' },
  { id: 'best', i: 2, f: .55, kind: 'good', text: 'best pair chosen', long: 'pair 2: best pair chosen' },
  { id: 'pseudo', i: 3, f: .6, kind: 'good', text: 'pseudo pair', long: 'pair 3: pseudo pair, ~3 moves saved' },
  { id: 'pause', i: 4, f: .3, kind: 'bad', text: 'pause 0.9 s', long: 'pair 4: 0.9 s pause' },
  { id: 'eo', i: 5, f: .5, kind: 'good', text: 'EO skip', long: 'EO skip' },
];
export function resultSegs(spec, o = {}) {
  const segs = STAGES.map(s => ({ key: s.key, w: o.byAvg ? Math.max(s.avg, .5) : s.t, skip: s.skip, state: s.skip ? 'skipped' : 'done', st: s }));
  return layoutSegs(spec, segs, o.layout);
}
export function colorSegs(segs) { return segs.map(s => (s.skip ? s : { ...s, color: deltaColor(s.st.delta) })); }
export const SESSION = { ao5: 14.62, ao12: 15.03, pb: 12.41, n: 23, vs: -0.96 };
export const SC_DONE = 12; // guided scramble: 12 moves done, the 13th (U) is current

// ---------- phone frame ----------
export function Phone(x, y, body, o = {}) {
  const id = o.id || 'ph' + x;
  return `<g transform="translate(${x} ${y})"><clipPath id="${id}"><rect width="390" height="844" rx="46"/></clipPath>
<rect width="390" height="844" rx="46" fill="${K.bg}" stroke="${K.hair}" stroke-width="1.5"/>
<g clip-path="url(#${id})">${body}</g></g>`;
}
export function PhoneHeader(o = {}) {
  return sans(24, 50, 'cubesight', { size: 17, fill: K.ink, w: 800, ls: -.3 }) + dot(366 - 80, 45, 3.5, K.good) + tx(366, 49, o.status || 'GAN 356 i3', { size: 11, fill: K.muted, a: 'end' });
}

// ---------- history data (deterministic) ----------
import { HISTORY as RAW } from '../../brain-v2/_src/lib.mjs';
const lcg = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const TAGS = [
  [['good', 'optimal x-cross'], ['good', 'PLL skip'], ['good', 'best pair chosen'], ['good', 'clean cross']],
  [['bad', 'cross detour'], ['bad', 'pause 1.4 s'], ['bad', 'cancelled 2 moves'], ['bad', 'slow pair 4']],
];
export const HIST = RAW.map((h, i) => {
  const rnd = lcg(i * 97 + 11);
  const total = h.t;
  const skip = i === 22 ? 'eo' : rnd() < .2 ? 'eo' : null;
  const base = STAGES.map(s => s.avg * (0.8 + rnd() * .5));
  const sum = base.reduce((a, b, j) => a + (STAGES[j].key === skip ? 0 : b), 0);
  const steps = STAGES.map((s, j) => ({ ...s, skip: s.key === skip, t: s.key === skip ? 0 : +(base[j] * total / sum).toFixed(2) }));
  if (i === 22) steps.forEach((s, j) => { Object.assign(s, STAGES[j]); });
  const marks = [], tags = [];
  const nm = i === 22 ? 0 : Math.floor(rnd() * 3.3);
  if (i !== 22) for (let k = 0; k < nm; k++) { const good = rnd() < .55; const pool = TAGS[good ? 0 : 1]; const tg = pool[Math.floor(rnd() * pool.length)]; if (!tags.find(t => t[1] === tg[1])) { tags.push(tg); marks.push({ i: Math.floor(rnd() * 9), f: .3 + rnd() * .5, kind: tg[0] }); } }
  if (i === 22) { tags.push(['good', 'EO skip'], ['bad', 'cross detour']); [MARKS[4], MARKS[0], MARKS[2]].forEach(m => marks.push({ i: m.i, f: m.f, kind: m.kind })); }
  return { n: i + 1, t: total, pen: h.pen, steps, marks, tags, at: '' };
});
export const histLabel = h => h.pen === 'DNF' ? `DNF(${h.t.toFixed(2)})` : h.pen === '+2' ? `${(h.t + 2).toFixed(2)}+` : h.t.toFixed(2);
// a session as ONE ring: one tick per solve, coloured against the session average; PB teal ring, +2 amber, DNF red
export function SessionRing(cx, cy, r, solves, o = {}) {
  const spec = { cx, cy, r, start: 0, sweep: 360 };
  const n = solves.length; const per = 360 / n; let out = '';
  const mean = 15.03;
  solves.forEach((h, i) => {
    const a0 = i * per + 1.2, a1 = (i + 1) * per - 1.2;
    const v = h.pen === 'DNF' ? null : h.t + (h.pen === '+2' ? 2 : 0);
    const c = v == null ? K.dnf : v === 12.41 ? K.good : v < mean - .4 ? K.good : v > mean + .8 ? K.warn : K.ink;
    out += arc(cx, cy, r, a0, a1, { w: o.w || 5, c, cap: 'butt', op: v == null ? 1 : (v === 12.41 ? 1 : .85) });
  });
  return out;
}
export const OLL_CASE = { U: '.y.yyyyy.', F: 'ggyggggggg'.slice(0, 9), R: 'rryrrrrrr' };
