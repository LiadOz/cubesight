import test from 'node:test';
import assert from 'node:assert/strict';
import { coachConnectorPath } from '../src/ui/shared/coach-connector.js';

const ring = { x: 720, y: 440, radius: 300, gap: 70 };
const start = { x: 197, y: 635 };
const targetAt = (angle, scale = 1) => ({ x: scale * (720 + 300 * Math.sin(angle * Math.PI / 180)), y: scale * (440 - 300 * Math.cos(angle * Math.PI / 180)) });

test('nearby left markers keep a short direct curve at desktop and phone scales', () => {
  for (const scale of [1, .5, .3]) for (const angle of [224, 250, 280, 305]) {
    const path = coachConnectorPath({ x: start.x * scale, y: start.y * scale }, targetAt(angle, scale), { ...ring, x: ring.x * scale, y: ring.y * scale, radius: ring.radius * scale });
    assert.equal(path.includes(' A '), false, `nearby ${angle} at ${scale}`);
    assert.match(path, /^M .+ C .+$/);
  }
});

test('top and right markers follow a circular lane clear of the cube and bottom slot', () => {
  for (const angle of [367, 396, 435, 462, 495]) {
    const target = targetAt(angle);
    const path = coachConnectorPath(start, target, ring);
    assert.match(path, / A 274 274 0 [01] 1 /, `far marker ${angle} goes over the top`);
    const [entryX, entryY] = path.split(' A ')[0].match(/[-\d.]+/g).slice(-2).map(Number);
    assert.ok(entryX < ring.x && entryY < ring.y + ring.radius * .7, 'enters on the left, above the time');
    assert.ok(Math.abs(Math.hypot(entryX - ring.x, entryY - ring.y) - 274) < .02);
    const [, , , , , exitX, exitY] = path.split(' A ')[1].split(' L ')[0].match(/[-\d.]+/g).map(Number);
    assert.ok(Math.abs(Math.hypot(exitX - ring.x, exitY - ring.y) - 274) < .02);
    assert.match(path, / L /, 'short radial arrival to the selected marker');
  }
});

test('missing Orbit geometry preserves the original direct connector', () => {
  assert.equal(coachConnectorPath({ x: 0, y: 100 }, { x: 100, y: 0 }), 'M 0 100 C 32 100, 68 0, 100 0');
});

test('a phone sentence below the Orbit enters beside its open slot', () => {
  const small = { x: 195, y: 250, radius: 150, gap: 70 };
  const path = coachConnectorPath({ x: 24, y: 550 }, { x: 220, y: 102 }, small);
  assert.match(path, / A 137 137 /);
  const [entryX, entryY] = path.split(' A ')[0].match(/[-\d.]+/g).slice(-2).map(Number);
  assert.ok(entryX < 120 && entryY < 400, 'left-side entry stays above the time below the ring');
});

test('a nearby phone connector detours only when a stage label blocks the direct curve', () => {
  const small = { x: 195, y: 250, radius: 150, gap: 70 };
  const source = { x: 24, y: 550 }, target = { x: 54, y: 301 };
  assert.equal(coachConnectorPath(source, target, small).includes(' A '), false);
  const path = coachConnectorPath(source, target, { ...small, obstacles: [{ left: 27, right: 59, top: 400, bottom: 425 }] });
  assert.match(path, / A 137 137 0 0 0 /, 'takes only the small arc to the nearby marker');
});
