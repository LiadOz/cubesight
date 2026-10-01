// Independently replay scraped-by-hand/community curated OLL rows through
// cubing.js. The generated file is only used after all algorithms and case
// signatures pass. This script reads its scratch input; it never scrapes.
import { readFile } from 'node:fs/promises';
import { cube3x3x3 } from 'cubing/puzzles';
import { normalizeAlg, invertAlg } from '../../../src/algs/notation.js';

const file = process.argv[2];
if (!file) throw new Error('Pass the curated OLL JSON path.');
const input = JSON.parse(await readFile(file, 'utf8'));
const kp = await cube3x3x3.kpuzzle();
const rotate = values => [values[3], values[0], values[1], values[2]];
const canonical = values => {
  let current = values;
  let best = values.join('');
  for (let i = 1; i < 4; i++) { current = [...rotate(current.slice(0, 4)), ...rotate(current.slice(4))]; best = best < current.join('') ? best : current.join(''); }
  return best;
};
const errors = [];
const signatures = new Map();
const yFrames = ['', 'y', 'y2', "y'"] .map(frame => kp.algToTransformation(frame));
for (const row of input.cases) {
  const id = row.number ?? Number(String(row.id).split('/').at(-1));
  if (!Number.isInteger(id) || id < 1 || id > 57) { errors.push(`bad case id ${row.id}`); continue; }
  const keys = [];
  for (const item of row.algs) {
    const raw = typeof item === 'string' ? item : item.moves;
    try {
      const alg = normalizeAlg(raw);
      const setup = invertAlg(alg);
      const effect = kp.algToTransformation(setup.join(' ')).transformationData;
      const corners = effect.CORNERS;
      const edges = effect.EDGES;
      const f2lIntact = yFrames.some(frame => {
        const f = frame.transformationData;
        return [4, 5, 6, 7].every(i => corners.permutation[i] === f.CORNERS.permutation[i]
          && corners.orientationDelta[i] === f.CORNERS.orientationDelta[i])
          && [4, 5, 6, 7, 8, 9, 10, 11].every(i => edges.permutation[i] === f.EDGES.permutation[i]
            && edges.orientationDelta[i] === f.EDGES.orientationDelta[i]);
      });
      if (!f2lIntact) errors.push(`OLL ${id}: ${raw} disturbs F2L`);
      const key = canonical([
        ...corners.orientationDelta.slice(0, 4), ...edges.orientationDelta.slice(0, 4),
      ]);
      keys.push(key);
      const replay = kp.algToTransformation([...setup, ...alg.split(' ')].join(' ')).transformationData;
      const solved = [...replay.CORNERS.permutation, ...replay.EDGES.permutation].every((n, i) => n === (i < 8 ? i : i - 8))
        && [...replay.CORNERS.orientationDelta, ...replay.EDGES.orientationDelta].every(n => n === 0);
      if (!solved) errors.push(`OLL ${id}: inverse/replay failed for ${raw}`);
    } catch (error) { errors.push(`OLL ${id}: ${raw}: ${error.message}`); }
  }
  if (row.algs.length < 2) errors.push(`OLL ${id}: fewer than two curated algorithms`);
  if (new Set(keys).size > 1) errors.push(`OLL ${id}: alternatives refer to different orientation cases`);
  if (keys[0]) {
    const prior = signatures.get(keys[0]);
    if (prior) errors.push(`OLL ${id} and OLL ${prior} have the same AUF signature`);
    signatures.set(keys[0], id);
    if (row.signature && row.signature !== keys[0]) errors.push(`OLL ${id}: stored signature disagrees with replay`);
  }
}
const ids = new Set(input.cases.map(row => row.number ?? Number(String(row.id).split('/').at(-1))));
for (let id = 1; id <= 57; id++) if (!ids.has(id)) errors.push(`missing OLL ${id}`);
console.log(JSON.stringify({ rows: input.cases.length, algorithms: input.cases.reduce((n, row) => n + row.algs.length, 0), signatures: signatures.size, errors }, null, 2));
if (errors.length) process.exitCode = 1;
