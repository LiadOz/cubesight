// Pure geometry for Orbit. Angles start at 12 o'clock; positive direction is clockwise.
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
    cursor += directionSign * gaps[index] / 2;
    const from = cursor;
    cursor += directionSign * available * weights[index];
    const to = cursor;
    cursor += directionSign * gaps[index] / 2;
    return { key: segment.key ?? String(index), from, to, mid: (from + to) / 2, direction };
  });
}

/** Place labels with a greedy two-sided collision pass, preserving their marker angle. */
export function placeLabels(anchors, { cx, cy, radius, offset = 28, minGap = 24, top = 12, bottom = 488 } = {}) {
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
  const placed = [];
  for (const item of [...items].sort((a, b) => b.rank - a.rank || a.y - b.y)) {
    const low = top + item.height / 2, high = bottom - item.height / 2;
    const desired = clampLabelY(item.y, low, high);
    const step = Math.max(4, Math.min(12, minGap / 3));
    const candidates = [desired];
    for (let distance = step; distance <= high - low; distance += step) candidates.push(desired - distance, desired + distance);
    const available = candidates.map(y => clampLabelY(y, low, high)).find(y => {
      item.y = y;
      const current = box(item);
      return placed.every(other => {
        const prior = box(other);
        return current.right <= prior.left || prior.right <= current.left || current.bottom + 2 <= prior.top || prior.bottom + 2 <= current.top;
      });
    });
    item.y = available ?? desired;
    placed.push(item);
  }
  return items.map(({ key, x, y, anchor, side }) => ({ key, x: round(x), y: round(y), anchor, side }));
}

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
