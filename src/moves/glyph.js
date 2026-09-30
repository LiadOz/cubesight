// SVG glyph of one move on an isometric cube: the turning layer lit, one arrow
// for the sense of the turn, optionally a fingertrick marker. Built once per
// chip (static), never on the update path. Colours come from CSS classes that
// read the Brain's --b-* tokens (src/moves/move-guide.css).
import { svg } from '../brain/dom.js';
import { FACE_COLORS } from '../cross-cube.js';
import { arrowPaths, beltFaces, beltLine, camFor, cubeQuads, dot, makeCam } from './geometry.js';
import { fingertrick } from './fingertricks.js';
import { heldFaces, parseMove } from './notation.js';

const f2 = v => Math.round(v * 100) / 100;
const pt = p => `${f2(p[0])},${f2(p[1])}`;
const polyD = poly => `M${poly.map(pt).join('L')}Z`;
const lineD = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join('');
const COLOR_KEY = { white: 'w', yellow: 'y', green: 'g', blue: 'b', red: 'r', orange: 'o' };

export const VIEWBOX = '-3.1 -3.1 6.2 6.2';

// Arrow head polygon at point i of a projected path, pointing along the path.
function headD(pts, i, w) {
  const a = pts[Math.max(0, i - 3)], b = pts[i];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const d = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const nrm = [-d[1], d[0]], size = w * 2.3, half = w * 1.45;
  const tip = [b[0] + d[0] * size * 0.55, b[1] + d[1] * size * 0.55];
  const base = [b[0] - d[0] * size * 0.45, b[1] - d[1] * size * 0.45];
  return polyD([tip, [base[0] + nrm[0] * half, base[1] + nrm[1] * half], [base[0] - nrm[0] * half, base[1] - nrm[1] * half]]);
}

/** One arrow (a halo for contrast on any background, then the ink) appended to `g`. */
function drawArrow(g, pts, { w, double = false, dashed = false, cls = 'mg-arrow' }) {
  const heads = [pts.length - 1];
  if (double) heads.unshift(Math.round((pts.length - 1) * 0.55));
  const dash = dashed ? `${f2(w * 2.2)} ${f2(w * 1.6)}` : null;
  g.append(svg('path', { class: 'mg-halo', d: lineD(pts), 'stroke-width': f2(w + 0.16) }));
  for (const i of heads) g.append(svg('path', { class: 'mg-halo mg-halo-head', d: headD(pts, i, w * 1.25), 'stroke-width': 0.12 }));
  g.append(svg('path', { class: cls, d: lineD(pts), 'stroke-width': f2(w), 'stroke-dasharray': dash }));
  for (const i of heads) g.append(svg('path', { class: `${cls}-head`, d: headD(pts, i, w * 1.25) }));
}

// The fingertrick marker: a finger (or wrist) capsule touching the turning
// layer on a visible side face, plus a push arrow in the direction the layer travels.
function drawFinger(g, mv, cam, entry) {
  const belts = beltFaces(mv, cam);
  if (!belts.length) return false;
  const wanted = { R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1] }[entry.touch];
  const face = belts.find(n => wanted && n.every((c, i) => c === wanted[i]))
    ?? belts.sort((a, b) => dot(b, cam.v) - dot(a, cam.v))[0];
  const [a3, b3] = beltLine(mv, face, { half: 0.5, lift: 0.12 });
  const a = cam.P(a3), b = cam.P(b3);
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1;
  const d = [dx / length, dy / length];
  const contact = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const wrist = entry.digit === 'wrist';
  const width = wrist ? 0.95 : entry.digit === 'thumb' ? 0.55 : 0.5;
  const span = wrist ? 1.3 : entry.digit === 'thumb' ? 0.9 : 1.4;
  // A push comes from behind the layer, a pull reaches it from ahead.
  const side = entry.action === 'pull' ? 1 : -1;
  const tip = [contact[0] + d[0] * side * 0.15, contact[1] + d[1] * side * 0.15];
  const tail = [tip[0] + d[0] * side * span, tip[1] + d[1] * side * span];
  g.append(svg('path', { class: 'mg-finger-halo', d: lineD([tail, tip]), 'stroke-width': f2(width + 0.18) }));
  g.append(svg('path', {
    class: `mg-finger-body mg-hand-${entry.hand}${entry.action === 'flick' ? ' mg-flick' : ''}`, d: lineD([tail, tip]), 'stroke-width': width,
  }));
  g.append(svg('circle', { class: `mg-finger-tip mg-hand-${entry.hand}`, cx: f2(tip[0]), cy: f2(tip[1]), r: f2(width * 0.42) }));
  const end = [contact[0] + d[0] * 1.25, contact[1] + d[1] * 1.25];
  drawArrow(g, [contact, [(contact[0] + end[0]) / 2, (contact[1] + end[1]) / 2], end], { w: 0.17, cls: 'mg-push' });
  return true;
}

/**
 * Build the SVG for one move.
 * @param {string} move
 * @param {object} [opts]
 * @param {'chip'|'arrows'} [opts.variant]  chip: schematic (layer lit); arrows: real sticker colours, dimmed layers
 * @param {{bottom:string, front:string}} [opts.held]  colours of the stickers in the arrows variant
 * @param {boolean} [opts.fingers]  show the fingertrick marker (it is always in the SVG; CSS reveals it)
 */
export function renderGlyph(move, { variant = 'chip', held = { bottom: 'D', front: 'F' }, fingers = false } = {}) {
  const mv = parseMove(move);
  const cam = makeCam(camFor(mv));
  const quads = cubeQuads(mv, cam, { gap: variant === 'chip' ? 0.16 : 0.09 });
  const root = svg('svg', {
    class: `mg-glyph mg-v-${variant} mg-k-${mv.kind}`, viewBox: VIEWBOX, 'aria-hidden': 'true', focusable: 'false', 'data-move': mv.str,
  });
  const join = list => list.map(polyD).join('');
  root.append(svg('path', { class: 'mg-body', d: join(quads.map(q => q.body)) }));
  if (variant === 'chip') {
    // Rotations light nothing: the whole cube turns.
    const lit = mv.kind === 'rot' ? [] : quads.filter(q => q.inLayer);
    const rest = mv.kind === 'rot' ? quads : quads.filter(q => !q.inLayer);
    root.append(svg('path', { class: mv.kind === 'rot' ? 'mg-rotface' : 'mg-off', d: join(rest.map(q => q.poly)) }));
    if (lit.length) root.append(svg('path', { class: 'mg-lit', d: join(lit.map(q => q.poly)) }));
  } else {
    const phys = heldFaces(held);
    const groups = new Map();
    for (const q of quads) {
      const key = COLOR_KEY[FACE_COLORS[phys[q.face]]];
      (groups.get(key) ?? groups.set(key, []).get(key)).push(q.poly);
    }
    for (const [key, polys] of groups) root.append(svg('path', { class: `mg-st mg-st-${key}`, d: join(polys) }));
    for (const shade of [1, 2]) {
      const polys = quads.filter(q => q.shade === shade).map(q => q.poly);
      if (polys.length) root.append(svg('path', { class: `mg-shade mg-shade-${shade}`, d: join(polys) }));
    }
    if (mv.kind !== 'rot') {
      const dim = quads.filter(q => !q.inLayer).map(q => q.poly);
      if (dim.length) root.append(svg('path', { class: 'mg-dimmer', d: join(dim) }));
    }
  }
  const arrows = svg('g', { class: 'mg-arrows' });
  const w = variant === 'chip' ? 0.26 : 0.19;
  for (const p of arrowPaths(mv, cam, { belt: variant !== 'chip' })) drawArrow(arrows, p.pts, { w: w * p.weight, double: p.double, dashed: p.dashed });
  root.append(arrows);
  const entry = fingertrick(mv.str);
  if (entry) {
    const g = svg('g', { class: 'mg-finger', 'data-hand': entry.hand, 'data-digit': entry.digit });
    if (drawFinger(g, mv, cam, entry)) root.append(g);
    if (fingers) root.setAttribute('data-fingers', '');
  }
  return root;
}
