const TAU = Math.PI * 2;
const fmt = value => Math.round(value * 100) / 100;
const point = (center, radius, angle) => ({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
const pair = p => `${fmt(p.x)} ${fmt(p.y)}`;
const normalize = (angle, base) => base + ((angle - base) % TAU + TAU) % TAU;

/** Short connections stay direct; obstructed connections follow the inside of the Orbit, above its slot. */
export function coachConnectorPath(start, target, ring = null) {
  const origin = start;
  if (start.exitX > start.x) start = { ...start, x: Math.min(start.exitX, target.x) };
  const move = start.x !== origin.x ? `M ${pair(origin)} L ${pair(start)}` : `M ${pair(start)}`;
  const dx = target.x - start.x;
  const c1 = { x: start.x + dx * .32, y: start.y };
  const c2 = { x: start.x + dx * .68, y: target.y };
  const direct = `${move} C ${pair(c1)}, ${pair(c2)}, ${pair(target)}`;
  if (!ring || ring.radius <= 0) return direct;
  const inset = ring.radius * (26 / 300), radius = ring.radius - inset;
  const clearance = radius - ring.radius * (8 / 300);
  let blocked = false;
  for (let step = 1; step < 80; step++) {
    const t = step / 80, u = 1 - t;
    const x = u ** 3 * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * target.x;
    const y = u ** 3 * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * target.y;
    if (Math.hypot(x - ring.x, y - ring.y) < clearance
      || ring.obstacles?.some(rect => x > rect.left - 2 && x < rect.right + 2 && y > rect.top - 2 && y < rect.bottom + 2)) { blocked = true; break; }
  }
  if (!blocked) return direct;

  const gap = (ring.gap ?? 70) * Math.PI / 180;
  const base = Math.PI / 2 + gap / 2;
  const end = base + TAU - gap;
  let from = start.x <= ring.x ? Math.PI : TAU;
  let to = normalize(Math.atan2(target.y - ring.y, target.x - ring.x), base);
  const below = start.y > ring.y + ring.radius;
  // A phone sentence sits below the open slot: enter from its left/right edge, never across the time.
  if (from > end) from = start.x <= ring.x ? base : end;
  if (to > end) to = to - end < base + TAU - to ? end : base;
  if (!gap && Math.abs(to - from) > Math.PI) to += to > from ? -TAU : TAU;
  const direction = Math.sign(to - from) || 1;
  const entry = point(ring, radius, from), exit = point(ring, radius, to);
  const bend = Math.min(ring.radius * .12, Math.hypot(entry.x - start.x, entry.y - start.y) / 3);
  const tangent = { x: -Math.sin(from) * direction, y: Math.cos(from) * direction };
  const entryControl = { x: entry.x - tangent.x * bend, y: entry.y - tangent.y * bend };
  const startControl = { x: start.x + Math.sign(entry.x - start.x) * bend, y: start.y };
  const arc = Math.abs(to - from) < .001 ? '' : ` A ${fmt(radius)} ${fmt(radius)} 0 ${Math.abs(to - from) > Math.PI ? 1 : 0} ${direction > 0 ? 1 : 0} ${pair(exit)}`;
  if (below) {
    // Stay outside the bottom-left labels as well as the time before turning into the circular lane.
    const left = start.x <= ring.x;
    const margin = left
      ? Math.max((ring.left ?? 0) + 6, Math.min(start.x, ring.x - ring.radius * 1.2))
      : Math.min((ring.right ?? Infinity) - 6, Math.max(start.x, ring.x + ring.radius * 1.2));
    const bendStart = { x: margin, y: start.y - bend };
    const bendEnd = { x: margin, y: entry.y + 2 * bend };
    return `M ${pair(start)} C ${fmt(margin)} ${fmt(start.y)}, ${pair(bendStart)}, ${pair(bendStart)} L ${pair(bendEnd)} C ${fmt(margin)} ${fmt(entry.y + bend)}, ${pair(entryControl)}, ${pair(entry)}${arc} L ${pair(target)}`;
  }
  return `${move} C ${pair(startControl)}, ${pair(entryControl)}, ${pair(entry)}${arc} L ${pair(target)}`;
}
