import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convexHull, polygonIntersectsRect } from '../src/ui/cube/bounds.js';

test('projected cube silhouette excludes empty corner padding and contains its centre', () => {
  const hull = convexHull([{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 },
    { x: 50, y: 50 }, { x: 50, y: 0 }]);
  assert.equal(hull.length, 4);
  assert.equal(polygonIntersectsRect(hull, { left: 0, top: 0, right: 10, bottom: 10 }), false);
  assert.equal(polygonIntersectsRect(hull, { left: 40, top: 40, right: 60, bottom: 60 }), true);
  assert.equal(polygonIntersectsRect(hull, { left: 98, top: 48, right: 105, bottom: 52 }), true);
});

test('label contact at the silhouette edge is separated but a crossing label collides', () => {
  const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
  assert.equal(polygonIntersectsRect(hull, { left: 10, top: 2, right: 20, bottom: 8 }), false);
  assert.equal(polygonIntersectsRect(hull, { left: 9, top: 2, right: 20, bottom: 8 }), true);
  assert.equal(polygonIntersectsRect(hull, { left: -10, top: 2, right: -1, bottom: 8 }), false);
});
