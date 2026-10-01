// Generate the frozen R2 benchmark positions from a fixed seed using the real
// WASM cross/pair solver. Keep the resulting fixture checked in: later engine
// runs use identical cube states instead of chaining against new suggestions.
import { writeFile } from 'node:fs/promises';
import { cube3x3x3 } from 'cubing/puzzles';
import { loadNodeSolver } from '../src/analysis/node-solver.js';
import { crossSolved, SLOTS, solvedSlots, trackedFrom } from '../src/analysis/pair-completion.js';

const SEED = 48271;
const TOTAL = 50;
const kp = await cube3x3x3.kpuzzle();
const solver = await loadNodeSolver();
let seed = SEED;
const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
function scramble() {
  const faces = 'URFDLB', suffixes = ['', "'", '2'], moves = [];
  while (moves.length < 22) {
    const face = faces[Math.floor(random() * faces.length)];
    if (moves.at(-1)?.[0] === face) continue;
    moves.push(face + suffixes[Math.floor(random() * suffixes.length)]);
  }
  return moves.join(' ');
}
function shuffle(items) {
  const values = [...items];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
function verifiedSlots(alg) {
  const { CORNERS: c, EDGES: e } = kp.algToTransformation(alg).transformationData;
  const edgeHome = i => e.permutation[i] === i && e.orientationDelta[i] === 0;
  if (![4, 5, 6, 7].every(edgeHome)) return [];
  return SLOTS.map((slot, i) => edgeHome(slot.e) && c.permutation[slot.c] === slot.c && c.orientationDelta[slot.c] === 0 ? i : -1).filter(i => i >= 0);
}
const maskBits = [null, null, null, null];
const calibration = "R2 D' B U2 F' L2 D2 F2 R2 U B2 D' L2 U' B D' R' F' L D2 R B' U2 U2 R' L' F U R' L2";
for (let bit = 0; bit < 4; bit++) {
  const result = solver.search({ scramble: calibration, face: 'D', mask: 1 << bit, maxDepth: 10, maxResults: 1, timeoutMs: 6000 });
  const done = verifiedSlots(`${calibration} ${result.results?.[0]?.moves?.join(' ') ?? ''}`);
  if (!done.length) throw new Error(`WASM calibration bit ${bit} did not solve a pair`);
  maskBits[done[0]] = bit;
}
if (maskBits.some(bit => bit === null)) throw new Error('Could not map all four WASM pair-mask bits.');

const rows = [];
let attempts = 0;
while (rows.length < TOTAL && attempts < 400) {
  attempts++;
  const id = rows.length + 1;
  const stage = (id - 1) % 4 + 1;
  const pseudo = id % 2 === 0;
  const order = shuffle([0, 1, 2, 3]);
  let setup = scramble();
  const cross = solver.search({ scramble: setup, face: 'D', mask: 0, maxDepth: 9, maxResults: 1, timeoutMs: 6000 });
  if (!cross.results?.length) continue;
  setup += ` ${cross.results[0].moves.join(' ')}`;
  let ok = true;
  for (const slot of order.slice(0, stage - 1)) {
    const mask = [...order.slice(0, order.indexOf(slot)), slot].reduce((value, index) => value | (1 << maskBits[index]), 0);
    const result = solver.search({ scramble: setup, face: 'D', mask, maxDepth: 12, maxResults: 1, timeoutMs: 6000 });
    const moves = result.results?.[0]?.moves;
    if (!moves?.length) { ok = false; break; }
    setup += ` ${moves.join(' ')}`;
  }
  if (!ok) continue;
  const beforeOffset = trackedFrom(setup);
  if (solvedSlots(beforeOffset).length !== stage - 1 || !crossSolved(beforeOffset)) continue;
  const startShift = pseudo ? 1 : 0;
  if (pseudo) setup += " D'";
  const codes = trackedFrom(setup);
  if (!crossSolved(codes, startShift) || solvedSlots(codes, startShift).length !== stage - 1) continue;
  rows.push({ id, stage, pseudo, startShift, setup: setup.trim() });
}
if (rows.length !== TOTAL) throw new Error(`Only generated ${rows.length}/${TOTAL} valid benchmark positions after ${attempts} attempts.`);
const fixture = {
  version: 1,
  generatedFrom: 'seeded random 22-turn scrambles; cross and preceding pairs solved with xcross WASM; all inputs independently checked with cubing.js',
  seed: SEED,
  total: rows.length,
  coverage: { stages: Object.fromEntries([1, 2, 3, 4].map(stage => [stage, rows.filter(row => row.stage === stage).length])), pseudo: rows.filter(row => row.pseudo).length },
  positions: rows,
};
await writeFile(new URL('../tests/fixtures/pair-engine-bench-v1.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(JSON.stringify({ file: 'tests/fixtures/pair-engine-bench-v1.json', attempts, coverage: fixture.coverage, wasmMaskBits: maskBits }, null, 2));
