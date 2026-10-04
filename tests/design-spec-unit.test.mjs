import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generate, JS_PATH, MD_PATH } from '../scripts/extract-design-spec.mjs';
import * as spec from '../src/ui/design-spec.js';

// One extraction for the whole file: it parses thirteen ~100 KB SVGs.
const fresh = generate();

test('design-spec.js matches a fresh extraction of the A-frame SVGs (a frame edit fails the gate)', () => {
  assert.equal(fs.readFileSync(JS_PATH, 'utf8'), fresh.js,
    'src/ui/design-spec.js is stale: run `node scripts/extract-design-spec.mjs` and commit the result');
});

test('SPEC-A-EXACT.md matches a fresh extraction of the A-frame SVGs', () => {
  assert.equal(fs.readFileSync(MD_PATH, 'utf8'), fresh.md,
    'docs/design/orbit-v3/SPEC-A-EXACT.md is stale: run `node scripts/extract-design-spec.mjs` and commit the result');
});

test('exports the documented plain-data constants', () => {
  for (const k of ['CANVAS', 'COLORS', 'TYPE', 'ORBIT', 'CUBE', 'ANCHORS', 'FRAMES']) assert.equal(typeof spec[k], 'object', k);
  assert.equal(Object.keys(spec.FRAMES).length, 13);
});

test('orbit centre and radius are solved from the arcs, not assumed', () => {
  assert.deepEqual(spec.ORBIT.centre, { x: 720, y: 440 });
  assert.equal(spec.ORBIT.radius, 300);
  assert.ok(spec.ORBIT.fit.desktop.rms < 0.01, `rms ${spec.ORBIT.fit.desktop.rms}`);
  assert.ok(spec.ORBIT.fit.desktop.max < 0.02);
  assert.deepEqual(spec.ORBIT.phone.centre, { x: 195, y: 300 });
  assert.equal(spec.ORBIT.phone.radius, 150);
});

test('idle ring: nine stages, 290 degree sweep, 70 degree bottom gap', () => {
  const base = spec.ORBIT.segments.filter((s) => !s.overlay);
  assert.equal(base.length, 9);
  assert.equal(spec.ORBIT.startDeg, 215);
  assert.equal(spec.ORBIT.endDeg, 145);
  assert.equal(spec.ORBIT.bottomGap.spanDeg, 70);
  assert.equal(spec.ORBIT.gaps.length, 9);
  assert.ok(spec.ORBIT.gaps.slice(0, -1).every((g) => g.spanDeg === 2.5));
});

test('the cube is centred on the orbit and measured as a fraction of the canvas', () => {
  assert.deepEqual(spec.CUBE.centerOffset, [0, 0]);
  assert.equal(spec.CUBE.desktop.height, 430);
  assert.equal(spec.CUBE.sizeFraction, 0.478);
  assert.equal(spec.CUBE.shadow.rx, 167.7);
  assert.equal(spec.CUBE.glow.gradient.stops.length, 3);
});

test('every colour, type style and ring segment found in the frames has a name', () => {
  const unnamed = [];
  for (const [k, t] of Object.entries(spec.COLORS.tokens)) if (k === 'unlabelled') unnamed.push(`colour ${t.hex}`);
  for (const t of spec.TYPE.styles) if (t.role === 'unlabelled') unnamed.push(`type ${t.id} ${t.family} ${t.size}/${t.weight} ${t.fillToken}`);
  for (const [id, f] of Object.entries(spec.ORBIT.frames)) {
    for (const r of f.rings) for (const s of r.segments) if (s.role === 'unlabelled') unnamed.push(`segment ${id} r${r.radius} ${s.stroke} ${s.strokeWidth}`);
  }
  assert.deepEqual(unnamed, [], 'name new values in scripts/lib/design-roles.mjs');
});

test('palette is the one the frames use (page background, ring idle, lit, text)', () => {
  assert.equal(spec.COLORS.tokens.bg.hex, '#141311');
  assert.equal(spec.COLORS.tokens['ring-idle'].hex, '#34312b');
  assert.equal(spec.COLORS.tokens.teal.hex, '#3dbfad');
  assert.equal(spec.COLORS.tokens['text-primary'].hex, '#ece6d8');
  assert.equal(spec.COLORS.tokens['text-dim'].hex, '#9a9486');
});
