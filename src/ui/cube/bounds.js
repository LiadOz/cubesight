/** Convex silhouette of projected geometry; canvas padding is excluded. */
export function convexHull(points) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = list => {
    const result = [];
    for (const point of list) {
      while (result.length > 1 && cross(result.at(-2), result.at(-1), point) <= 0) result.pop();
      result.push(point);
    }
    return result;
  };
  return [...half(sorted).slice(0, -1), ...half(sorted.slice().reverse()).slice(0, -1)];
}

/** Separating-axis intersection with the actual projected cube silhouette. */
export function polygonIntersectsRect(polygon, rect) {
  if (polygon.length < 3) return false;
  const corners = [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }];
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return { x: point.y - next.y, y: next.x - point.x };
  })];
  return axes.every(axis => {
    const cube = polygon.map(point => point.x * axis.x + point.y * axis.y);
    const label = corners.map(point => point.x * axis.x + point.y * axis.y);
    return Math.max(...cube) > Math.min(...label) && Math.max(...label) > Math.min(...cube);
  });
}
