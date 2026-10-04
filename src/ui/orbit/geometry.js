// Pure geometry for Orbit. Angles start at 12 o'clock; positive direction is clockwise.
import { ORBIT } from '../design-spec.js';
/** The approved numbers (design-spec.js, extracted from the A-frames). VIEW is the square viewBox centred on the ring. */
export const ORBIT_GEOMETRY = Object.freeze({
  view: 760, radius: ORBIT.radius, startDeg: ORBIT.startDeg, sweepDeg: ORBIT.sweepDeg, gapDeg: ORBIT.gaps[0].spanDeg, moveGapDeg: ORBIT.gapSpanByFrame['A-02-scramble'].min,
  stageLabelRadius: Math.round(ORBIT.labelRadius.stageIdle), moveLabelRadius: Math.round(ORBIT.labelRadius.currentMovePill), moveWindow: 22,
  stroke: Object.freeze(Object.fromEntries(Object.entries(ORBIT.stroke).map(([key, value]) => [key, value.width]))),
});
const round = value => Math.round(value * 1000) / 1000;
export const MINI_GLYPH_RANGE = Object.freeze({ min: 17, max: 48 });
export const miniGlyphSize = value => Math.max(MINI_GLYPH_RANGE.min, Math.min(MINI_GLYPH_RANGE.max, Number(value) || MINI_GLYPH_RANGE.max));

export function polar(cx, cy, radius, degrees) {
  const angle = (degrees - 90) * Math.PI / 180;
  return { x: round(cx + radius * Math.cos(angle)), y: round(cy + radius * Math.sin(angle)) };
}

export function arcPath(cx, cy, radius, from, to, direction = 'clockwise') {
  const span = Math.abs(to - from);
  if (!(span > 0.001)) return '';
  const sweep = direction === 'counterclockwise' ? 0 : 1;
  if (span >= 359.999) {
    const mid = from + (direction === 'counterclockwise' ? -180 : 180);
    const a = polar(cx, cy, radius, from), b = polar(cx, cy, radius, mid);
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 1 ${sweep} ${b.x} ${b.y} A ${radius} ${radius} 0 1 ${sweep} ${a.x} ${a.y}`;
  }
  const a = polar(cx, cy, radius, from), b = polar(cx, cy, radius, to);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${span > 180 ? 1 : 0} ${sweep} ${b.x} ${b.y}`;
}

export function ringLayout(segments = [], { gapDeg = 2.5, startDeg = 0, sweepDeg = 360, direction = 'clockwise', sections = [] } = {}) {
  if (!segments.length) return [];
  const directionSign = direction === 'counterclockwise' ? -1 : 1;
  const breaks = new Set(sections.map(section => section.start).filter(Number.isInteger));
  segments.forEach((segment, index) => { if (segment.sectionStart && index) breaks.add(index); });
  const gaps = segments.map((_, index) => index ? gapDeg + (breaks.has(index) ? 2.5 : 0) : 0);
  const available = Math.max(0, sweepDeg - gaps.reduce((sum, gap) => sum + gap, 0));
  const raw = segments.map(segment => Math.max(0, Number.isFinite(segment.weight) ? segment.weight : 0));
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  const weights = total > 0 ? raw.map(weight => weight / total) : raw.map(() => 1 / raw.length);
  let cursor = startDeg;
  return segments.map((segment, index) => {
    // The gap sits between two segments, in full: it used to be split half before / half after, which halved the
    // first gap and left the ring short at its far end.
    cursor += directionSign * gaps[index];
    const from = cursor;
    cursor += directionSign * available * weights[index];
    const to = cursor;
    return { key: segment.key ?? String(index), from, to, mid: (from + to) / 2, direction };
  });
}

/** Place labels with a greedy two-sided collision pass, preserving their marker angle. */
export function placeLabels(anchors, { cx, cy, radius, offset = 28, minGap = 24, top = 12, bottom = 488, obstacles = [] } = {}) {
  const items = anchors.map(anchor => {
    const angle = ((anchor.angle % 360) + 360) % 360;
    const point = polar(cx, cy, radius + offset, angle);
    const pole = angle < 9 || angle > 351 ? 'top' : Math.abs(angle - 180) < 9 ? 'bottom' : null;
    const side = pole ? `center-${pole}` : angle < 180 ? 'right' : 'left';
    const height = anchor.height ?? minGap;
    const width = anchor.width ?? 80;
    const x = clampLabelX(point.x, width, side);
    return { key: anchor.key, x, y: point.y, height, width, side,
      anchor: pole ? 'middle' : side === 'right' ? 'start' : 'end', rank: anchor.rank ?? 0 };
  });
  const box = item => {
    const left = item.anchor === 'start' ? item.x : item.anchor === 'end' ? item.x - item.width : item.x - item.width / 2;
    return { left, right: left + item.width, top: item.y - item.height / 2, bottom: item.y + item.height / 2 };
  };
  const placed = obstacles.map(obstacle => ({ ...obstacle, anchor: 'start', side: 'obstacle', height: obstacle.bottom - obstacle.top, width: obstacle.right - obstacle.left }));
  const intersects = item => {
    const current = box(item);
    return placed.some(other => {
      const prior = other.left == null ? box(other) : other;
      return current.right > prior.left && prior.right > current.left && current.bottom + 2 > prior.top && prior.bottom + 2 > current.top;
    });
  };
  for (const item of [...items].sort((a, b) => b.rank - a.rank || a.y - b.y)) {
    const low = top + item.height / 2, high = bottom - item.height / 2;
    const desired = clampLabelY(item.y, low, high);
    const step = Math.max(4, Math.min(12, minGap / 3));
    const candidates = [desired];
    for (let distance = step; distance <= high - low; distance += step) candidates.push(desired - distance, desired + distance);
    const original = { x: item.x, anchor: item.anchor, side: item.side };
    const columns = [original];
    if (item.side === 'right' || item.side === 'left') {
      const opposite = item.side === 'right' ? 'left' : 'right';
      columns.push({ side: opposite, anchor: opposite === 'right' ? 'start' : 'end', x: opposite === 'right' ? widthSafe(item.width) : item.width });
    } else if (item.side.startsWith('center-')) {
      columns.push({ side: 'left', anchor: 'end', x: item.width });
      columns.push({ side: 'right', anchor: 'start', x: widthSafe(item.width) });
    }
    let available = false;
    for (const column of columns) {
      item.x = column.x; item.anchor = column.anchor; item.side = column.side;
      const y = candidates.map(value => clampLabelY(value, low, high)).find(value => { item.y = value; return !intersects(item); });
      if (y != null) { item.y = y; available = true; break; }
    }
    if (!available) { item.x = original.x; item.anchor = original.anchor; item.side = original.side; item.y = desired; }
    item.hidden = !available;
    if (!item.hidden) placed.push(item);
  }
  return items.map(({ key, x, y, anchor, side, hidden }) => ({ key, x: round(x), y: round(y), anchor, side, hidden }));
}

function widthSafe(width) { return 560 - width; }

function clampLabelY(value, low, high) { return Math.max(low, Math.min(high, value)); }
function clampLabelX(value, width, side) {
  if (side === 'right') return Math.min(value, 560 - width);
  if (side === 'left') return Math.max(value, width);
  return Math.max(width / 2, Math.min(560 - width / 2, value));
}

export function clusterMarkers(markers = [], thresholdDeg = 5) {
  const sorted = markers.map((marker, index) => ({ ...marker, angle: Number(marker.angle) || 0, _index: index }))
    .sort((a, b) => a.angle - b.angle);
  const groups = [];
  for (const marker of sorted) {
    const group = groups.at(-1);
    if (group && marker.angle - group.at(-1).angle <= thresholdDeg) group.push(marker);
    else groups.push([marker]);
  }
  if (groups.length > 1) {
    const first = groups[0], last = groups.at(-1);
    if (first[0].angle + 360 - last.at(-1).angle <= thresholdDeg) {
      groups[0] = [...last.map(marker => ({ ...marker, angle: marker.angle - 360 })), ...first];
      groups.pop();
    }
  }
  return groups.map((items, index) => ({ key: items.map(item => item.key ?? item.id ?? item._index).join('|'),
    items: items.map(({ _index, ...item }) => item), count: items.length,
    angle: round(items.reduce((sum, item) => sum + item.angle, 0) / items.length), index }));
}

// ---------------------------------------------------------------------------------------------
// Anchored ring labels and marker fan-out (the approved behaviour; numbers come from design-spec).
// Pure: no DOM, unit-tested in node.
// ---------------------------------------------------------------------------------------------
const norm = degrees => ((degrees % 360) + 360) % 360;
const MOVE_RE = /^[URFDLBMESxyzurfdlb]w?[2'\u2032\u2019]?$/;
/** True when every labelled segment is a bare move (R, U2, F\u2032): the scramble / review rings. */
export function looksLikeMoves(segments = []) {
  const labelled = segments.filter(segment => segment.label);
  return labelled.length > 0 && labelled.every(segment => segment.value == null && segment.delta == null && !segment.tag && MOVE_RE.test(String(segment.label)));
}

/** Window of labels that follows the current move: `size` labels with the rest counted as before/after. */
export function labelWindow(count, currentIndex = 0, size = 22) {
  if (count <= size) return { from: 0, to: count - 1, before: 0, after: 0, windowed: false };
  const at = Math.max(0, Math.min(count - 1, currentIndex));
  const from = Math.max(0, Math.min(count - size, at - Math.floor(size / 2)));
  const to = from + size - 1;
  return { from, to, before: from, after: count - 1 - to, windowed: true };
}

/**
 * Place every label ON its own angle. Stage blocks sit with their anchor edge on `stageRadius`;
 * move labels are centred on `moveRadius`. Nothing slides sideways and nothing is dropped for
 * crowding: when move labels are tighter than `pitch` px they fan across `lanes` radii instead.
 * Only a scramble too long for one radius (`maxSingle`) is windowed to `windowSize` around the current move.
 * items: {key, angle, kind:'move'|'stage', width?, height?, current?}
 */
export function ringLabels(items, { cx, cy, stageRadius, moveRadius, pitch = 22, lanes = 3, windowSize = 22, ringStart = 215, ringSweep = 290, view = 760, clampToView = false } = {}) {
  const moves = items.filter(item => item.kind === 'move');
  const arc = moveRadius * ringSweep * Math.PI / 180;
  const maxSingle = Math.floor(arc / pitch);
  const currentAt = Math.max(0, moves.findIndex(item => item.current));
  const win = moves.length > maxSingle ? labelWindow(moves.length, currentAt, windowSize) : { from: 0, to: moves.length - 1, before: 0, after: 0, windowed: false };
  const inWindow = new Map(moves.map((item, at) => [item.key, at >= win.from && at <= win.to]));
  const visibleMoves = moves.filter(item => inWindow.get(item.key));
  const minPitch = visibleMoves.length > 1 ? Math.min(...visibleMoves.slice(1).map((item, at) => {
    const distance = Math.abs(((item.angle - visibleMoves[at].angle + 540) % 360) - 180);
    return distance * Math.PI / 180 * moveRadius;
  })) : Infinity;
  const fan = minPitch < pitch;
  const laneOf = new Map(visibleMoves.map((item, at) => [item.key, fan ? at % lanes : 0]));
  const placed = items.map(item => {
    const angle = norm(item.angle);
    if (item.kind === 'move') {
      const lane = laneOf.get(item.key) ?? 0, radius = moveRadius + lane * pitch;
      const point = polar(cx, cy, radius, angle);
      return { key: item.key, kind: 'move', angle, radius, lane, x: point.x, y: point.y, anchor: 'middle', side: 'center', hidden: !inWindow.get(item.key) };
    }
    const point = polar(cx, cy, stageRadius, angle);
    const pole = angle < 9 || angle > 351 ? 'top' : Math.abs(angle - 180) < 9 ? 'bottom' : null;
    const height = item.height ?? 44;
    // The block's nearest edge, not its centre, sits on the radius: push it away from the ring by half its height.
    const lift = Math.cos(angle * Math.PI / 180);
    const y = point.y - Math.sign(lift) * Math.min(1, Math.abs(lift) * 2.5) * height / 2;
    const anchor = pole ? 'middle' : angle < 180 ? 'start' : 'end';
    // On a narrow screen (clampToView) the block is pulled inside the drawing rather than dropped or slid along the ring.
    const width = item.width ?? 0;
    const x = !clampToView ? point.x : anchor === 'start' ? Math.min(point.x, view - width) : anchor === 'end' ? Math.max(point.x, width) : Math.max(width / 2, Math.min(view - width / 2, point.x));
    return { key: item.key, kind: 'stage', angle, radius: stageRadius, lane: 0, x: round(x), y: round(y), anchor, side: pole ? `center-${pole}` : angle < 180 ? 'right' : 'left', hidden: false };
  });
  return { labels: placed, window: win, fanned: fan };
}

/**
 * Fan a crowded run of markers out instead of merging them. Each marker keeps its own badge: lane 0 is the
 * ring itself, further lanes step inward by `pitch`, and markers inside a lane are spread along the arc to be
 * at least `pitch` apart (centred back on where they belong). `trueAngle` is where the leader line points.
 */
export function fanMarkers(markers = [], { radius, pitch = 26, maxLanes = 4, thresholdDeg } = {}) {
  const linkDeg = thresholdDeg ?? (pitch / radius) * 180 / Math.PI;
  const sorted = markers.map((marker, index) => ({ ...marker, angle: Number(marker.angle) || 0, _index: index }))
    .sort((a, b) => a.angle - b.angle);
  const runs = [];
  for (const marker of sorted) {
    const run = runs.at(-1);
    if (run && marker.angle - run.at(-1).angle < linkDeg) run.push(marker); else runs.push([marker]);
  }
  const out = [];
  for (const run of runs) {
    if (run.length === 1) { const { _index, ...marker } = run[0]; out.push({ ...marker, trueAngle: marker.angle, radius, lane: 0, key: marker.key ?? marker.id ?? _index }); continue; }
    const lanes = Math.max(1, Math.min(maxLanes, run.length, Math.floor(radius * 0.45 / pitch) + 1));   // lanes stay clear of the cube
    const buckets = Array.from({ length: lanes }, () => []);
    run.forEach((marker, at) => buckets[at % lanes].push(marker));
    buckets.forEach((bucket, lane) => {
      const laneRadius = radius - lane * pitch, step = (pitch / laneRadius) * 180 / Math.PI;
      const centre = bucket.reduce((sum, marker) => sum + marker.angle, 0) / bucket.length;
      // Stagger odd lanes by half a pitch so neighbours on adjacent lanes never touch.
      const stagger = lane % 2 ? step / 2 : 0;
      bucket.forEach((marker, at) => {
        const { _index, ...rest } = marker;
        out.push({ ...rest, trueAngle: marker.angle, angle: round(centre + (at - (bucket.length - 1) / 2) * step + stagger), radius: laneRadius, lane, key: rest.key ?? rest.id ?? _index });
      });
    });
  }
  return out.sort((a, b) => a.trueAngle - b.trueAngle || a.lane - b.lane);
}
