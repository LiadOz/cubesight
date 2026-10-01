// Drawing layer for the move-guide mockups: themes (tokens.md), shaded 3D cube, arrows, net, OLL view, chips.
import { add, sub, mul, dot, norm, rot, parseMove, solved, heldMap, makeCam, camFor, faceArc, beltLine, rotArc } from './geom.mjs';
import { t } from '../../_src/lib.mjs';

export const MONO = "'DM Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
export const SANS = "'Manrope', 'Manrope Variable', system-ui, -apple-system, 'Segoe UI', sans-serif";

const ORBIT_PAL = { white: '#f4f4f0', yellow: '#ffd43b', green: '#16a34a', blue: '#2563eb', red: '#e5302b', orange: '#ff7a1a' };
const MONO_PAL = { white: '#e8e6de', yellow: '#f2c94c', green: '#3fa66a', blue: '#3d6fd6', red: '#d9534a', orange: '#e98a3c' };
export const THEMES = {
  'orbit-dark': { id: 'orbit-dark', style: 'orbit', dark: true, pal: ORBIT_PAL, font: SANS, num: MONO,
    bg: '#141311', canvas: '#0d0c0b', surface: '#1d1b18', surface2: '#2b2925', ink: '#ece6d8', muted: '#9a9486', faint: '#6d675c',
    acc: '#3dbfad', accText: '#3dbfad', accSoft: '#16403a', onAcc: '#0b1f1c', warn: '#e6a642', warnText: '#e6a642', warnSoft: '#4d3715',
    track: '#34312b', hair: '#34312b', body: '#1d1b18', halo: '#0b0a09', neutral: '#3a3731', keyBg: '#2b2925', keyInk: '#d9d2c3', radius: 6, fonts: ['manrope', 'mono400', 'mono500'] },
  'orbit-light': { id: 'orbit-light', style: 'orbit', dark: false, pal: ORBIT_PAL, font: SANS, num: MONO,
    bg: '#f3f0e8', canvas: '#e9e4d8', surface: '#ebe6da', surface2: '#e6e0d3', ink: '#1c1b18', muted: '#65605a', faint: '#b3ad9f',
    acc: '#0a7d71', accText: '#07695e', accSoft: '#d3e6e1', onAcc: '#ffffff', warn: '#c77700', warnText: '#9a5c00', warnSoft: '#f1dcb4',
    track: '#dcd6c8', hair: '#dcd6c8', body: '#1c1b18', halo: '#f3f0e8', neutral: '#cfc9bb', keyBg: '#37352f', keyInk: '#e9e4d8', radius: 6, fonts: ['manrope', 'mono400', 'mono500'] },
  'mono-dark': { id: 'mono-dark', style: 'mono', dark: true, pal: MONO_PAL, font: MONO, num: MONO,
    bg: '#16171b', canvas: '#101114', surface: '#1f2126', surface2: '#1f2126', ink: '#d9d6cb', muted: '#8a8e99', faint: '#6b6f7a',
    acc: '#e7b34c', accText: '#e7b34c', accSoft: '#6b5424', onAcc: '#16171b', warn: '#e0675e', warnText: '#e0675e', warnSoft: '#5a2d2a',
    track: '#34373f', hair: '#34373f', body: '#0b0c0e', halo: '#0b0c0e', neutral: '#34373f', keyBg: '#1f2126', keyInk: '#d9d6cb', radius: 4, fonts: ['mono300', 'mono400', 'mono500'] },
  'mono-light': { id: 'mono-light', style: 'mono', dark: false, pal: MONO_PAL, font: MONO, num: MONO,
    bg: '#f1eee6', canvas: '#e4e0d6', surface: '#e8e5dc', surface2: '#e8e5dc', ink: '#2b2a27', muted: '#625f58', faint: '#cbc6ba',
    acc: '#8a5e07', accText: '#8a5e07', accSoft: '#f3e6c4', onAcc: '#f1eee6', warn: '#b8392f', warnText: '#b8392f', warnSoft: '#f7e0db',
    track: '#cbc6ba', hair: '#cbc6ba', body: '#1b1c1f', halo: '#f1eee6', neutral: '#d3cec2', keyBg: '#e8e5dc', keyInk: '#2b2a27', radius: 4, fonts: ['mono300', 'mono400', 'mono500'] },
};

// ---------- colour helpers ----------
const hex2 = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, k) => { const A = hex2(a), B = hex2(b); return toHex(A.map((v, i) => v * (1 - k) + B[i] * k)); };
const shadeBy = (hexc, k) => toHex(hex2(hexc).map(v => v * k));
export const f1 = v => (Math.round(v * 10) / 10);
const PT = p => `${f1(p[0])},${f1(p[1])}`;

// ---------- the shaded 3D cube ----------
// cubies: from geom.solved()/apply. o: { cam, th, held, layerMv, dim, frac, lift, schematic, alpha, gap, stroke }
export function cubeSVG(cubies, o) {
  const { cam, th } = o;
  const pal = th.pal;
  const hm = heldMap(o.held?.bottom || 'D', o.held?.front || 'F');
  const lm = o.layerMv;
  const frac = o.frac ?? 0, lift = o.lift ?? 0;
  const gap = o.gap ?? 0.07;
  const items = [];
  const L = norm(add(add(mul(cam.up, 0.8), mul(cam.right, -0.25)), mul(cam.v, 0.5)));
  const shadeN = n => Math.max(0.6, Math.min(1, 0.8 + 0.2 * (dot(n, L) / 0.976) ));
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const q of cubies) {
    const inLayer = lm && lm.layers.includes(Math.round(q.p[lm.ax]));
    let R = v => v, off = [0, 0, 0];
    if (inLayer && (frac || lift)) {
      const a = lm.angle * frac;
      R = v => rot(v, lm.ax, a);
      if (lift) { const side = Math.max(...lm.layers) >= -Math.min(...lm.layers) ? 1 : -1; off[lm.ax] = lift * (lm.kind === 'rot' ? 0 : side); }
    }
    const center = add(R(q.p), off);
    for (const n0 of axes) {
      const n = R(n0);
      if (dot(n, cam.v) < 0.02) continue;
      const fc = add(center, mul(n, 0.5));
      const others = axes.filter(a => Math.abs(dot(a, n0)) < 0.5 && (a[0] + a[1] + a[2]) > 0).map(R);
      const corner = (h, s1, s2) => add(fc, add(mul(others[0], s1 * h), mul(others[1], s2 * h)));
      const stk = q.st.find(s => s.n.map(Math.round).join() === n0.join());
      const quad = h => [corner(h, -1, -1), corner(h, 1, -1), corner(h, 1, 1), corner(h, -1, 1)].map(cam.P);
      const dimmed = lm && o.dim && !inLayer;
      let fill = th.body;
      let isSt = false;
      if (stk) {
        isSt = true;
        if (o.schematic) fill = lm && lm.kind === 'rot' ? mix(th.neutral, th.ink, 0.35) : inLayer ? (o.layerColor || th.acc) : th.neutral;
        else { fill = pal[hm.color[stk.c].toLowerCase()]; fill = shadeBy(fill, shadeN(n)); if (dimmed) fill = mix(fill, th.body, th.dark ? 0.72 : 0.6); }
      }
      items.push({ d: cam.depth(fc), body: quad(0.5), st: isSt ? quad(0.5 - gap) : null, fill, inLayer });
    }
  }
  items.sort((a, b) => a.d - b.d);
  let out = `<g${o.alpha != null ? ` opacity="${o.alpha}"` : ''}>`;
  const sw = cam.S * 0.03;
  for (const it of items) {
    out += `<polygon points="${it.body.map(PT).join(' ')}" fill="${th.body}" stroke="${th.body}" stroke-width="${f1(sw)}" stroke-linejoin="round"/>`;
    if (it.st) out += `<polygon points="${it.st.map(PT).join(' ')}" fill="${it.fill}"/>`;
  }
  return out + '</g>';
}

// ---------- arrows ----------
export function pathD(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + PT(p)).join(' '); }
function headAt(pts, i, w) {
  const a = pts[Math.max(0, i - 3)], b = pts[i];
  let d = sub(b, a); const l = Math.hypot(...d) || 1; d = mul(d, 1 / l);
  const nrm = [-d[1], d[0]], s = w * 2.3, hw = w * 1.45;
  const tip = add(b, mul(d, s * 0.55));
  const base = sub(b, mul(d, s * 0.45));
  return `${PT(tip)} ${PT(add(base, mul(nrm, hw)))} ${PT(sub(base, mul(nrm, hw)))}`;
}
// pts: projected screen points. o: { color, w, halo, double, dash, th }
export function arrow(pts, o) {
  const { th, w = 5, color = th.ink } = o;
  const he = o.headExtra ?? 2.4;
  const halo = o.halo ?? th.halo;
  const hIdx = [pts.length - 1];
  if (o.double) hIdx.unshift(Math.round((pts.length - 1) * 0.55));
  let s = '';
  const lines = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  s += `<path d="${pathD(pts)}" ${lines} stroke="${halo}" stroke-opacity=".78" stroke-width="${w + 4.5}"/>`;
  for (const i of hIdx) s += `<polygon points="${headAt(pts, i, w + he)}" fill="${halo}" fill-opacity=".78" stroke="${halo}" stroke-opacity=".78" stroke-width="3.4" stroke-linejoin="round"/>`;
  s += `<path d="${pathD(pts)}" ${lines} stroke="${color}" stroke-width="${w}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
  for (const i of hIdx) s += `<polygon points="${headAt(pts, i, w + he)}" fill="${color}" stroke="${color}" stroke-width=".5" stroke-linejoin="round"/>`;
  return s;
}
const faceNormals = { R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1] };

// Full 3D "arrows" overlay for one move on a given camera.
export function moveArrows(mv, cam, th, o = {}) {
  let s = '';
  const w = o.w ?? cam.S * 0.115;
  const P = pts => pts.map(cam.P);
  const col = o.color ?? th.ink;
  if (mv.kind === 'rot') {
    s += arrow(P(rotArc(mv, cam)), { th, w: w * 0.9, color: col, dash: `${w * 2.2} ${w * 1.6}`, double: mv.double, headExtra: o.headExtra });
    return s;
  }
  const belts = Object.values(faceNormals).filter(n => Math.abs(dot(n, axisVec(mv.ax))) < 0.5 && dot(n, cam.v) > 0.1);
  if (mv.kind === 'slice') {
    for (const n of belts) s += arrow(P(beltLine(mv, n)), { th, w, color: col, double: mv.double, headExtra: o.headExtra });
    return s;
  }
  s += arrow(P(faceArc(mv, cam)), { th, w, color: col, double: mv.double, headExtra: o.headExtra });
  if (o.belt !== false) for (const n of belts) s += arrow(P(beltLine(mv, n, { half: 0.75 })), { th, w: w * 0.55, color: col, double: false, headExtra: o.headExtra });
  return s;
}
export const axisVec = ax => { const a = [0, 0, 0]; a[ax] = 1; return a; };

// ---------- held-aware description (extends describeTurn) ----------
const FACE_WORD = { U: 'top', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back' };
export function centerColors(state, held = { bottom: 'D', front: 'F' }) {
  const hm = heldMap(held.bottom, held.front);
  const out = {};
  for (const [L, n] of Object.entries(faceNormals)) { const q = state.find(c => c.p.every((v, i) => Math.round(v) === n[i])); const stk = q.st.find(v => v.n.map(Math.round).join() === n.join()); out[L] = hm.color[stk.c]; }
  return out;
}
export function describeMove(str, held = { bottom: 'D', front: 'F' }, state = null) {
  const mv = parseMove(str);
  const hm = heldMap(held.bottom, held.front);
  if (state) hm.color = centerColors(state, held);
  const amt = mv.double ? '180°' : mv.prime ? 'counterclockwise' : 'clockwise';
  const sym = mv.double ? '½' : mv.prime ? '↺' : '↻';
  if (mv.kind === 'face' || mv.kind === 'wide') {
    const word = FACE_WORD[mv.letter], col = hm.color[mv.letter];
    const what = mv.kind === 'wide' ? `the ${word} two layers (${col} centre side)` : `the ${word} face (${col} center)`;
    return { mv, sym, color: col, text: `Turn ${what} ${amt}, looking directly at that face.` };
  }
  if (mv.kind === 'slice') {
    const ref = { M: 'L', E: 'D', S: 'F' }[mv.letter];
    const axisName = { M: 'left-to-right', E: 'top-to-bottom', S: 'front-to-back' }[mv.letter];
    const cw = mv.double ? '180°' : (mv.prime ? 'the opposite way to' : 'the same way as');
    const refTxt = mv.double ? `` : ` the ${FACE_WORD[ref]} face (${hm.color[ref]} center)`;
    return { mv, sym, color: hm.color[ref], text: `Turn only the middle layer (${axisName}) ${mv.double ? '180°' : cw + refTxt}.` };
  }
  const ref = { x: 'R', y: 'U', z: 'F' }[mv.letter];
  const dirTxt = mv.double ? '180°' : mv.prime ? `the opposite way to the ${FACE_WORD[ref]} face` : `the same way as the ${FACE_WORD[ref]} face`;
  return { mv, sym, color: hm.color[ref], text: `Rotate the whole cube ${dirTxt}. No layer moves against another.` };
}

// ---------- fingertrick hints (PLACEHOLDER DATA: needs review by a cuber) ----------
export const FINGER = {
  R: 'right wrist, push up', "R'": 'right ring finger, pull down', R2: 'wrist push, then ring-finger flick',
  U: 'right index, flick left', "U'": 'left index, flick right', U2: 'right index twice (or index + middle)',
  F: 'right index, pull toward you', "F'": 'right thumb, push away', F2: 'two right-index flicks',
  L: 'left ring finger, pull down', "L'": 'left wrist, push up', D: 'right ring finger, push right', "D'": 'left ring finger, push left',
  r: 'right wrist (+ middle finger), push up', M: 'right ring finger, pull down', "M'": 'right middle finger, push up', y: 'right index pushes whole cube left', "y'": 'left hand pushes whole cube right',
};

// ---------- text helpers ----------
export const txt = (x, y, s, o) => t(x, y, s, { family: MONO, ...o });
export function pill(x, y, label, th, { fill, ink, size = 11, padX = 9, h = 20, anchor = 'start', stroke } = {}) {
  const w = label.length * size * 0.6 + padX * 2;
  const x0 = anchor === 'middle' ? x - w / 2 : x;
  return `<rect x="${f1(x0)}" y="${y - h / 2}" width="${f1(w)}" height="${h}" rx="${h / 2}" fill="${fill || th.accSoft}"${stroke ? ` stroke="${stroke}" stroke-width="1"` : ''}/>` +
    t(f1(x0 + w / 2), y + size * 0.36, label, { size, fill: ink || th.accText, family: MONO, anchor: 'middle' });
}
export const pillW = (label, size = 11, padX = 9) => label.length * size * 0.6 + padX * 2;

// ---------- a standalone cube with a move guide (approach A / B / vocab) ----------
export function guidedCube(cx, cy, S, th, state, moveStr, o = {}) {
  const mv = parseMove(moveStr);
  const cam = makeCam(o.cam || camFor(mv), S, cx, cy);
  const layerMv = mv.kind === 'rot' ? mv : mv;
  let s = '';
  if (o.glow !== false && th.dark) s += `<ellipse cx="${cx}" cy="${f1(cy + S * 2.4)}" rx="${S * 1.9}" ry="${S * 0.36}" fill="${th.acc}" opacity=".10"/>`;
  else if (!th.dark) s += `<ellipse cx="${cx}" cy="${f1(cy + S * 2.45)}" rx="${S * 1.9}" ry="${S * 0.3}" fill="#1c1b18" opacity=".07"/>`;
  s += cubeSVG(state, { cam, th, held: o.held, layerMv, dim: mv.kind !== 'rot', frac: o.frac, lift: o.lift, schematic: o.schematic });
  if (o.arrows !== false) s += moveArrows(mv, cam, th, { belt: o.belt, color: o.color });
  return s;
}

// ---------- net (unfolded cube) ----------
const NET_BASIS = { // per face: [eu (screen right), ev (screen down)]
  U: [[1, 0, 0], [0, 0, 1]], F: [[1, 0, 0], [0, -1, 0]], R: [[0, 0, -1], [0, -1, 0]], B: [[-1, 0, 0], [0, -1, 0]], L: [[0, 0, 1], [0, -1, 0]], D: [[1, 0, 0], [0, 0, -1]],
};
const NET_POS = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
export const NET_W = 4, NET_H = 3;
export function netSVG(x0, y0, u, th, cubies, moveStr, o = {}) {
  const mv = moveStr ? parseMove(moveStr) : null;
  const hm = heldMap(o.held?.bottom || 'D', o.held?.front || 'F');
  const fs = 3 * u + 8; // face size incl. gap between faces
  const at = (p) => cubies.find(q => q.p.every((v, i) => Math.round(v) === p[i]));
  let s = '';
  const map3 = (face, p3) => { const [eu, ev] = NET_BASIS[face]; const [nx, ny] = NET_POS[face]; return [x0 + nx * fs + 1.5 * u + dot(p3, eu) * u, y0 + ny * fs + 1.5 * u + dot(p3, ev) * u]; };
  for (const face of 'ULFRBD') {
    const n = faceNormals[face]; const [eu, ev] = NET_BASIS[face];
    const [nx, ny] = NET_POS[face];
    s += `<rect x="${x0 + nx * fs - 1}" y="${y0 + ny * fs - 1}" width="${3 * u + 2}" height="${3 * u + 2}" rx="${u * 0.18}" fill="${th.body}"/>`;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const pos = add(add(n, mul(eu, i)), mul(ev, j));
      const q = at(pos); const stk = q.st.find(v => v.n.map(Math.round).join() === n.join());
      const inL = mv && mv.layers.includes(pos[mv.ax]);
      let fill = th.pal[hm.color[stk.c].toLowerCase()];
      if (mv && mv.kind !== 'rot' && !inL) fill = mix(fill, th.body, th.dark ? 0.72 : 0.6);
      const cx = x0 + nx * fs + (i + 1) * u, cy = y0 + ny * fs + (j + 1) * u;
      s += `<rect x="${f1(cx + 1)}" y="${f1(cy + 1)}" width="${u - 2}" height="${u - 2}" rx="${u * 0.12}" fill="${fill}"/>`;
    }
    if (o.labels) s += t(x0 + nx * fs + 1.5 * u, y0 + ny * fs - 4, face, { size: 10, fill: th.muted, family: MONO, anchor: 'middle' });
  }
  if (mv) {
    const w = u * 0.15;
    const a3 = axisVec(mv.ax);
    for (const face of 'ULFRBD') {
      const n = faceNormals[face]; const d = dot(n, a3);
      const P = pts => pts.map(p => map3(face, p));
      if (Math.abs(d) > 0.5) { // axis face
        const inFace = mv.layers.includes(d > 0 ? 1 : -1);
        if (!inFace && mv.kind !== 'rot') continue;
        // arc in the face plane, drawn so it reads clockwise seen from outside when (angle*d)<0
        const [, ev] = NET_BASIS[face];
        const pts = []; const total = mv.double ? 200 : 105; const N = 28;
        // start at the on-screen top of the face (-ev direction)
        const m = mul(ev, -1);
        for (let i = 0; i <= N; i++) { const phi = Math.sign(mv.angle) * (-total / 2 + total * i / N); pts.push(add(mul(n, 1.5), rot(mul(m, 0.95), mv.ax, phi))); }
        s += arrow(P(pts), { th, w, double: mv.double, color: mv.kind === 'rot' ? th.ink : th.ink, dash: mv.kind === 'rot' ? `${w * 2.2} ${w * 1.5}` : null });
      } else if (o.belt !== false) {
        const line = beltLine(mv, n, { lift: 0, half: 1.0 });
        s += arrow(P(line), { th, w: w * 0.85, double: mv.double, dash: mv.kind === 'rot' ? `${w * 2.2} ${w * 1.5}` : null });
      }
    }
  }
  return s;
}
export const netSize = u => [NET_W * (3 * u + 8) - 8, NET_H * (3 * u + 8) - 8];

// ---------- OLL-style top-down view (U face + the four side strips) ----------
export function ollSVG(cx, cy, u, th, cubies, moveStr, o = {}) {
  const mv = moveStr ? parseMove(moveStr) : null;
  const hm = heldMap(o.held?.bottom || 'D', o.held?.front || 'F');
  const at = p => cubies.find(q => q.p.every((v, i) => Math.round(v) === p[i]));
  const col = (p, n) => { const q = at(p); const stk = q.st.find(v => v.n.map(Math.round).join() === n.join()); return th.pal[hm.color[stk.c].toLowerCase()]; };
  const strip = u * 0.34, g = 2;
  let s = '';
  const half = 1.5 * u;
  s += `<rect x="${cx - half - strip - 4}" y="${cy - half - strip - 4}" width="${3 * u + 2 * strip + 8}" height="${3 * u + 2 * strip + 8}" rx="${u * 0.35}" fill="${th.body}"/>`;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    let c = col([i, 1, j], [0, 1, 0]);
    const inL = mv && mv.layers.includes(mv.ax === 0 ? i : mv.ax === 1 ? 1 : j);
    if (mv && mv.kind !== 'rot' && !inL) c = mix(c, th.body, th.dark ? 0.72 : 0.6);
    s += `<rect x="${f1(cx + i * u - u / 2 + g / 2)}" y="${f1(cy + j * u - u / 2 + g / 2)}" width="${u - g}" height="${u - g}" rx="${u * 0.1}" fill="${c}"/>`;
  }
  // strips: F (bottom), B (top), R (right), L (left)
  for (let k = -1; k <= 1; k++) {
    const cF = col([k, 1, 1], [0, 0, 1]), cB = col([k, 1, -1], [0, 0, -1]), cR = col([1, 1, k], [1, 0, 0]), cL = col([-1, 1, k], [-1, 0, 0]);
    s += `<rect x="${f1(cx + k * u - u / 2 + g / 2)}" y="${f1(cy + half + 2)}" width="${u - g}" height="${strip - 1}" rx="3" fill="${cF}"/>`;
    s += `<rect x="${f1(cx + k * u - u / 2 + g / 2)}" y="${f1(cy - half - strip - 1)}" width="${u - g}" height="${strip - 1}" rx="3" fill="${cB}"/>`;
    s += `<rect x="${f1(cx + half + 2)}" y="${f1(cy + k * u - u / 2 + g / 2)}" width="${strip - 1}" height="${u - g}" rx="3" fill="${cR}"/>`;
    s += `<rect x="${f1(cx - half - strip - 1)}" y="${f1(cy + k * u - u / 2 + g / 2)}" width="${strip - 1}" height="${u - g}" rx="3" fill="${cL}"/>`;
  }
  let note = null;
  if (mv) {
    const w = u * 0.17;
    const P = pts => pts.map(p => [cx + p[0] * u, cy + p[2] * u]); // top-down: x right, z down (F at the bottom)
    if (mv.ax === 1) {
      if (mv.layers.includes(1)) {
        const n = 28, total = mv.double ? 200 : 105, pts = [];
        for (let i = 0; i <= n; i++) pts.push(add([0, 1.5, 0], rot([0, 0, -0.95], 1, Math.sign(mv.angle) * (-total / 2 + total * i / n))));
        s += arrow(P(pts), { th, w, double: mv.double, dash: mv.kind === 'rot' ? `${w * 2.2} ${w * 1.5}` : null });
      } else note = 'not visible from above';
    } else {
      const line = beltLine(mv, [0, 1, 0], { lift: 0, half: 1.25 });
      s += arrow(P(line), { th, w, double: mv.double, dash: mv.kind === 'rot' ? `${w * 2.2} ${w * 1.5}` : null });
    }
  }
  return { svg: s, note, size: 3 * u + 2 * strip + 8 };
}

// ---------- move chips ----------
// status: done | current | next | wrong | fix ; returns { svg, w }
export function chip(x, y, moveStr, th, o = {}) {
  const mv = parseMove(moveStr);
  const big = o.status === 'current';
  const S = big ? 12.5 : 9.2;
  const w = big ? 104 : 58, h = big ? 150 : 82;
  const warn = o.status === 'wrong' || o.status === 'fix';
  const edge = warn ? th.warn : big ? th.acc : th.hair;
  const fill = big ? th.surface : (o.status === 'next' ? th.surface : 'none');
  let s = `<g opacity="${o.status === 'done' ? 0.45 : 1}">`;
  const dash = mv.kind === 'rot' ? ` stroke-dasharray="4 3"` : '';
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${th.style === 'orbit' ? (big ? 14 : 10) : 4}" fill="${warn ? th.warnSoft : fill}" stroke="${edge}" stroke-width="${big ? 2 : 1}"${dash}/>`;
  const gx = x + w / 2, gy = y + (big ? 52 : 33);
  const cam = makeCam(camFor(mv), S, gx, gy);
  const st = solved();
  s += cubeSVG(st, { cam, th, layerMv: mv, schematic: true, gap: 0.14, layerColor: warn ? th.warn : null });
  const ac = warn ? th.warn : th.ink;
  s += moveArrows(mv, cam, th, { w: S * (big ? 0.24 : 0.27), belt: false, color: ac, headExtra: big ? 1.6 : 0.9 });
  const ls = big ? 30 : 16;
  s += t(gx, y + h - (big ? 36 : 10), moveStr, { size: ls, fill: warn ? th.warnText : big ? th.ink : th.ink, family: MONO, anchor: 'middle', weight: big ? 500 : 400 });
  if (big) {
    const sub = mv.kind === 'rot' ? 'rotate cube' : mv.kind === 'wide' ? 'two layers' : mv.kind === 'slice' ? 'middle layer' : mv.double ? 'half turn' : mv.prime ? 'counter-cw' : 'clockwise';
    s += t(gx, y + h - 13, sub, { size: 11, fill: th.muted, family: MONO, anchor: 'middle' });
  }
  if (o.kindTag && !big) { /* reserved */ }
  return { svg: s + '</g>', w, h };
}
