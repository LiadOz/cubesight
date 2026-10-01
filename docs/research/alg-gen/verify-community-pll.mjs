// Independently replay curated PLL variants through cubing.js. We compare
// each case's variants to the established in-repo case reference up to AUF
// and y-frame, and require intact F2L in the resulting setup.
import { readFile } from 'node:fs/promises';
import { cube3x3x3 } from 'cubing/puzzles';
import { PLL_CASES } from '../../../src/pll-logic.js';
import { normalizeAlg, invertAlg } from '../../../src/algs/notation.js';

const file = process.argv[2];
if (!file) throw new Error('Pass the curated PLL JSON path.');
const input = JSON.parse(await readFile(file, 'utf8'));
const kp = await cube3x3x3.kpuzzle();
const yFrames = ['', 'y', 'y2', "y'"];
const uFrames = ['', 'U', 'U2', "U'"];
const inverseRotation = { '': '', y: "y'", y2: 'y2', "y'": 'y' };
const canonicalKey = alg => {
  const setup = invertAlg(normalizeAlg(alg)).join(' ');
  const keys = [];
  for (const y of yFrames) for (const before of uFrames) for (const after of uFrames) {
    const frameStart = [y, before, setup, after, inverseRotation[y]].filter(Boolean).join(' ');
    const d = kp.algToTransformation(frameStart).transformationData;
    const key = [
      ...d.CORNERS.permutation.slice(0, 4), ...d.EDGES.permutation.slice(0, 4),
      ...d.CORNERS.orientationDelta.slice(0, 4), ...d.EDGES.orientationDelta.slice(0, 4),
    ].join(',');
    keys.push(key);
  }
  return keys.sort()[0];
};
const rotations = yFrames.map(frame => kp.algToTransformation(frame).transformationData);
const f2lIntact = alg => {
  const d = kp.algToTransformation(invertAlg(normalizeAlg(alg)).join(' ')).transformationData;
  return rotations.some(frame => [4, 5, 6, 7].every(i => d.CORNERS.permutation[i] === frame.CORNERS.permutation[i]
    && d.CORNERS.orientationDelta[i] === frame.CORNERS.orientationDelta[i])
    && [4, 5, 6, 7, 8, 9, 10, 11].every(i => d.EDGES.permutation[i] === frame.EDGES.permutation[i]
      && d.EDGES.orientationDelta[i] === frame.EDGES.orientationDelta[i]));
};
const expected = new Map(PLL_CASES.map(row => [row.name, canonicalKey(row.algorithm)]));
const errors = [];
const seen = new Map();
for (const row of input.cases) {
  const id = row.name ?? String(row.id).split('/').at(-1);
  const key = expected.get(id);
  if (!key) { errors.push(`unknown PLL case ${id}`); continue; }
  if (row.algs.length < 2) errors.push(`${row.id}: fewer than two curated algorithms`);
  for (const item of row.algs) {
    const raw = typeof item === 'string' ? item : item.moves;
    try {
      const actual = canonicalKey(raw);
      if (actual !== key) errors.push(`${id}: variant does not solve its reference case: ${raw}`);
      if (!f2lIntact(raw)) errors.push(`${id}: variant disturbs F2L: ${raw}`);
    } catch (error) { errors.push(`${id}: ${error.message}`); }
  }
  const previous = seen.get(key);
  if (previous) errors.push(`${id} and ${previous} have the same AUF/y case key`);
  seen.set(key, id);
  if (row.signature && row.signature !== key) errors.push(`${id}: stored signature disagrees with replay`);
}
const ids = new Set(input.cases.map(row => row.name ?? String(row.id).split('/').at(-1)));
for (const row of PLL_CASES) if (!ids.has(row.name)) errors.push(`missing PLL ${row.name}`);
console.log(JSON.stringify({ rows: input.cases.length, algorithms: input.cases.reduce((n, row) => n + row.algs.length, 0), uniqueCases: seen.size, errors }, null, 2));
if (errors.length) process.exitCode = 1;
