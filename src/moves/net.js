// Unfolded-net view of one move (design approach D): every face is seen from
// outside, so a clockwise arrow on a face is clockwise on screen. The turning
// layer is lit; the axis face(s) get a curved arrow, the side faces a flow arrow.
import { svg } from '../brain/dom.js';
import { beltLine, dot, mul, add, rot } from './geometry.js';
import { FACE_VECTOR, parseMove } from './notation.js';

// Per face: [screen-right, screen-down] in the cube's own frame, and its cell in the 4 x 3 cross.
const BASIS = {
  U: [[1, 0, 0], [0, 0, 1]], F: [[1, 0, 0], [0, -1, 0]], R: [[0, 0, -1], [0, -1, 0]],
  B: [[-1, 0, 0], [0, -1, 0]], L: [[0, 0, 1], [0, -1, 0]], D: [[1, 0, 0], [0, 0, -1]],
};
const CELL = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
const PITCH = 3.3;   // face size 3 plus a gap
const f2 = v => Math.round(v * 100) / 100;
const pt = p => `${f2(p[0])},${f2(p[1])}`;
const line = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join('');

export const NET_VIEWBOX = `-0.15 -0.15 ${f2(4 * PITCH - 0.3 + 0.3)} ${f2(3 * PITCH - 0.3 + 0.3)}`;

export function renderNet(move) {
  const mv = parseMove(move);
  const root = svg('svg', { class: `mg-glyph mg-net mg-k-${mv.kind}`, viewBox: NET_VIEWBOX, 'aria-hidden': 'true', focusable: 'false', 'data-move': mv.str });
  const axisVec = [0, 0, 0]; axisVec[mv.ax] = 1;
  const at = (face, p3) => {
    const [eu, ev] = BASIS[face], [cx, cy] = CELL[face];
    return [cx * PITCH + 1.5 + dot(p3, eu), cy * PITCH + 1.5 + dot(p3, ev)];
  };
  const off = [], lit = [], rotface = [];
  for (const face of 'ULFRBD') {
    const n = FACE_VECTOR[face], [eu, ev] = BASIS[face], [cx, cy] = CELL[face];
    root.append(svg('rect', { class: 'mg-body', x: cx * PITCH - 0.06, y: cy * PITCH - 0.06, width: 3.12, height: 3.12, rx: 0.2 }));
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const p = add(add(n, mul(eu, i)), mul(ev, j));
      const cell = `M${f2(cx * PITCH + i + 1.07)},${f2(cy * PITCH + j + 1.07)}h0.86v0.86h-0.86Z`;
      (mv.kind === 'rot' ? rotface : mv.layers.includes(p[mv.ax]) ? lit : off).push(cell);
    }
  }
  root.append(svg('path', { class: 'mg-off', d: off.join('') }), svg('path', { class: 'mg-rotface', d: rotface.join('') }), svg('path', { class: 'mg-lit', d: lit.join('') }));
  const arrows = svg('g', { class: 'mg-arrows' });
  const draw = (pts, w, dashed, double) => {
    const heads = [pts.length - 1];
    if (double) heads.unshift(Math.round((pts.length - 1) * 0.55));
    const head = i => {
      const a = pts[Math.max(0, i - 3)], b = pts[i];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      const s = w * 2.9, h = w * 1.8, nrm = [-d[1], d[0]];
      const tip = [b[0] + d[0] * s * 0.55, b[1] + d[1] * s * 0.55], base = [b[0] - d[0] * s * 0.45, b[1] - d[1] * s * 0.45];
      return `M${pt(tip)}L${pt([base[0] + nrm[0] * h, base[1] + nrm[1] * h])}L${pt([base[0] - nrm[0] * h, base[1] - nrm[1] * h])}Z`;
    };
    arrows.append(svg('path', { class: 'mg-halo', d: line(pts), 'stroke-width': f2(w + 0.16) }));
    arrows.append(svg('path', { class: 'mg-arrow', d: line(pts), 'stroke-width': w, 'stroke-dasharray': dashed ? `${f2(w * 2.2)} ${f2(w * 1.5)}` : null }));
    for (const i of heads) arrows.append(svg('path', { class: 'mg-arrow-head', d: head(i) }));
  };
  for (const face of 'ULFRBD') {
    const n = FACE_VECTOR[face], along = dot(n, axisVec);
    if (Math.abs(along) > 0.5) {
      if (mv.kind !== 'rot' && !mv.layers.includes(along > 0 ? 1 : -1)) continue;
      const top = mul(BASIS[face][1], -1), total = mv.double ? 200 : 105, pts = [];
      for (let k = 0; k <= 28; k++) pts.push(at(face, add(mul(n, 1.5), rot(mul(top, 0.95), mv.ax, mv.dir * (-total / 2 + total * k / 28)))));
      draw(pts, 0.2, mv.kind === 'rot', mv.double);
    } else {
      const [a, b] = beltLine(mv, n, { lift: 0, half: 1.0 });
      draw([at(face, a), at(face, b)], 0.17, mv.kind === 'rot', mv.double);
    }
  }
  root.append(arrows);
  return root;
}
