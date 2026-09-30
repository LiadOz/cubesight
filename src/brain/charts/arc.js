// Pure ring geometry for the Orbit timeline, the inspection ring and the
// results donut. Angles are in degrees, 0 = 12 o'clock, increasing clockwise,
// so the maths reads like a clock face. No DOM here (unit-tested in node).

const TAU_DEG = 360;
const round = v => Math.round(v * 100) / 100;

/** Point on a circle for a clock angle. */
export function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)) };
}

/**
 * SVG path data for a clockwise arc from a0 to a1 (a1 >= a0). A full turn is
 * drawn as two half arcs (a single SVG arc cannot close on itself); an empty
 * arc returns '' so callers can hide the element.
 */
export function arcPath(cx, cy, r, a0, a1) {
  const span = a1 - a0;
  if (!(span > 0.001)) return '';
  if (span >= TAU_DEG - 0.001) {
    const top = polar(cx, cy, r, a0), bottom = polar(cx, cy, r, a0 + 180);
    return `M ${top.x} ${top.y} A ${r} ${r} 0 1 1 ${bottom.x} ${bottom.y} A ${r} ${r} 0 1 1 ${top.x} ${top.y}`;
  }
  const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${p1.x} ${p1.y}`;
}

/** Angle reached by a fill fraction (0..1) of an arc. */
export function fillAngle(a0, a1, fill) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fill) ? fill : 0));
  return a0 + (a1 - a0) * f;
}

/**
 * Lay segments around the ring, each proportional to its weight, with a fixed
 * gap between neighbours. Weights need not sum to 1; missing/negative weights
 * count as 0 and an all-zero plan is split evenly.
 * @param {{key:string, weight:number}[]} segments
 * @returns {{key:string, a0:number, a1:number, mid:number}[]}
 */
export function ringLayout(segments, { gapDeg = 3, startDeg = 0 } = {}) {
  const n = segments.length;
  if (!n) return [];
  const weights = segments.map(s => (Number.isFinite(s.weight) && s.weight > 0 ? s.weight : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const norm = total > 0 ? weights.map(w => w / total) : weights.map(() => 1 / n);
  const gap = n > 1 ? gapDeg : 0;
  const usable = TAU_DEG - gap * n;
  let at = startDeg + gap / 2;
  return segments.map((s, i) => {
    const a0 = at, a1 = at + usable * norm[i];
    at = a1 + gap;
    return { key: s.key, a0: round(a0), a1: round(a1), mid: round((a0 + a1) / 2) };
  });
}

/**
 * Place labels outside a ring so they don't overlap. Each anchor sits at an
 * angle; labels on the right half are left-aligned, on the left half
 * right-aligned, and those near 12/6 o'clock centred. Labels on the same side
 * are pushed apart vertically to keep at least `minGap` px between them.
 * @param {{key:string, angle:number, height?:number}[]} anchors
 * @returns {{key:string, x:number, y:number, anchor:'start'|'end'|'middle', side:'right'|'left'}[]}
 */
export function placeLabels(anchors, { cx, cy, r, offset = 28, minGap = 30, top = -Infinity, bottom = Infinity } = {}) {
  const placed = anchors.map(a => {
    const deg = ((a.angle % TAU_DEG) + TAU_DEG) % TAU_DEG;
    const p = polar(cx, cy, r + offset, deg);
    const side = deg < 180 ? 'right' : 'left';
    const nearPole = deg < 12 || deg > 348 || Math.abs(deg - 180) < 12;
    return { key: a.key, x: p.x, y: p.y, anchor: nearPole ? 'middle' : side === 'right' ? 'start' : 'end', side, height: a.height ?? minGap };
  });
  for (const side of ['right', 'left']) {
    const group = placed.filter(p => p.side === side).sort((a, b) => a.y - b.y);
    // Sweep down, then back up if the last label ran past the bottom bound.
    for (let i = 1; i < group.length; i++) {
      const need = group[i - 1].y + Math.max(minGap, group[i - 1].height);
      if (group[i].y < need) group[i].y = need;
    }
    if (group.length && group[group.length - 1].y > bottom) {
      group[group.length - 1].y = bottom;
      for (let i = group.length - 2; i >= 0; i--) {
        const limit = group[i + 1].y - Math.max(minGap, group[i].height);
        if (group[i].y > limit) group[i].y = limit;
      }
    }
    if (group.length && group[0].y < top) group[0].y = top;
  }
  return placed.map(({ key, x, y, anchor, side }) => ({ key, x, y: round(y), anchor, side }));
}

/**
 * Inspection ring angle for a moment in inspection: the remaining time is an
 * arc from 12 o'clock clockwise (so it drains anticlockwise); overtime grows
 * anticlockwise past 12 o'clock. `degPerMs` = 360 / limit.
 */
export function inspectionAngles({ limitMs, elapsedMs }) {
  const degPerMs = limitMs > 0 ? TAU_DEG / limitMs : 0;
  const remaining = Math.max(0, limitMs - elapsedMs);
  const over = Math.max(0, elapsedMs - limitMs);
  return { degPerMs, remainingDeg: round(remaining * degPerMs), overDeg: round(Math.min(TAU_DEG, over * degPerMs)) };
}

/**
 * Convert an inspection moment (ms since inspection start) to a clock angle.
 * Before the limit it is the remaining arc's end; from the limit on it is
 * measured back from 360 (the limit itself is 12 o'clock seen as 360°, so an
 * overtime zone [limit, x] is the arc [angle(x), 360]).
 */
export function inspectionAngleAt(atMs, limitMs) {
  const degPerMs = limitMs > 0 ? TAU_DEG / limitMs : 0;
  return round(atMs < limitMs ? (limitMs - atMs) * degPerMs : TAU_DEG - (atMs - limitMs) * degPerMs);
}
