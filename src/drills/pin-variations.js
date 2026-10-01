import { validateSolution, sameCubeState } from '../cross-cube.js';
import { analysisStateFromScramble } from '../analysis/long-replay.js';
import { getCase, getCases } from '../algs/seed/cases.js';
import { identifyOllCase } from './oll-model.js';
import { identifyPllCase } from '../pll-logic.js';
import { bestCompletions } from '../analysis/pair-completion.js';

// cubing.js KPattern order; keep this aligned with the solver's orbit arrays.
const CORNER_IDS = ['UFR', 'UBR', 'UBL', 'UFL', 'DFR', 'DBR', 'DBL', 'DFL'];
const EDGE_IDS = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'];
const NORMAL = { U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };
const positionOf = id => [...id].reduce((position, face) => position.map((value, index) => value + NORMAL[face][index]), [0, 0, 0]);
const CORNER_INDEX = new Map(CORNER_IDS.map((id, index) => [id, index]));
const EDGE_INDEX = new Map(EDGE_IDS.map((id, index) => [id, index]));
const POSITION_NAME = new Map([...CORNER_IDS, ...EDGE_IDS].map(id => [positionOf(id).join(','), id]));
const equalPosition = (a, b) => a.every((value, index) => value === b[index]);
let puzzlePromise;

function parity(permutation) {
  let value = 0;
  for (let i = 0; i < permutation.length; i++) for (let j = i + 1; j < permutation.length; j++) if (permutation[i] > permutation[j]) value ^= 1;
  return value;
}

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function permutationOrbit(source, fixedSlots, size, orientationMod, random) {
  const pieces = [...source.pieces];
  const orientation = [...source.orientation];
  const free = Array.from({ length: size }, (_, index) => index).filter(index => !fixedSlots.has(index));
  if (free.length < 2) return null;
  const loosePieces = free.map(index => source.pieces[index]);
  let shuffled = shuffle(loosePieces, random);
  for (const [offset, slot] of free.entries()) pieces[slot] = shuffled[offset];
  if (orientationMod) {
    for (const slot of free) orientation[slot] = Math.floor(random() * orientationMod);
    const last = free.at(-1);
    const fixedSum = orientation.reduce((sum, value, index) => sum + (free.includes(index) ? 0 : value), 0);
    const freeSum = free.slice(0, -1).reduce((sum, index) => sum + orientation[index], 0);
    orientation[last] = (orientationMod - ((fixedSum + freeSum) % orientationMod)) % orientationMod;
  }
  return { pieces, orientation, free, shuffled };
}

function fixedSlotsFor(state, ids, indexById) {
  const slots = new Set();
  for (const id of ids) {
    const cubie = state.cubies.find(item => item.id === id);
    const slotId = cubie && POSITION_NAME.get(cubie.position.join(','));
    const slotIndex = indexById.get(slotId);
    if (Number.isInteger(slotIndex)) slots.add(slotIndex);
  }
  return slots;
}

function essentialPieces(pin, state, bestMoves) {
  const face = pin.crossFace || 'D';
  const before = validateSolution(state, [], face);
  const after = validateSolution(state, bestMoves, face);
  if (!after.crossSolved) return null;
  const solved = new Set(before.pairs.map(pair => pair.slot));
  const newPairs = after.pairs.filter(pair => !solved.has(pair.slot));
  const stageNumber = /pair([1-4])/.exec(pin.stage)?.[1];
  const target = newPairs[0] ?? after.pairs.find(pair => stageNumber && pair.slot === stageNumber);
  const pieces = new Set(EDGE_IDS.filter(id => id.includes(face)));
  for (const pair of before.pairs) { pieces.add(pair.cornerId); pieces.add(pair.edgeId); }
  if (target) { pieces.add(target.cornerId); pieces.add(target.edgeId); }
  return { face, before, after, solved, target, pieces };
}

async function checkWithPairPlanner(scramble) {
  const options = { maxDepth: 12, timeBudgetMs: 160, maxSolutions: 6 };
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return bestCompletions(scramble, options);
  return new Promise(resolve => {
    const worker = new Worker(new URL('./pin-planner-worker.js', import.meta.url), { type: 'module' });
    const id = `${Date.now()}-${Math.random()}`;
    const timeout = setTimeout(() => { worker.terminate(); resolve(null); }, 3500);
    worker.addEventListener('message', event => {
      if (event.data?.id !== id) return;
      clearTimeout(timeout); worker.terminate(); resolve(event.data.result ?? null);
    });
    worker.postMessage({ id, scramble, options });
  });
}

async function cubePatternVariants(pin, { count, random, maxAttempts, planner }) {
  const moves = pin.better?.length ? pin.better : pin.yours;
  if (!moves?.length || !['cross', 'f2l', 'lookahead'].includes(pin.trainer)) return [];
  const sourceMoves = [...pin.scramble.split(/\s+/).filter(Boolean), ...pin.movesUpTo];
  const sourceText = sourceMoves.join(' ');
  let sourceState;
  try { sourceState = analysisStateFromScramble(sourceText); } catch { return []; }
  const constraints = essentialPieces(pin, sourceState, moves);
  if (!constraints) return [];
  const { face, before, target, pieces: fixedPieces } = constraints;
  if (pin.trainer !== 'cross' && !target) return [];

  puzzlePromise ??= Promise.all([import('cubing/puzzles'), import('cubing/kpuzzle'), import('cubing/search'), import('../algs/notation.js')])
    .then(async ([{ cube3x3x3 }, { KPattern }, search, notation]) => ({ kpuzzle: await cube3x3x3.kpuzzle(), KPattern, solve: search.experimentalSolve3x3x3IgnoringCenters, invertAlg: notation.invertAlg }));
  const { kpuzzle, KPattern, solve, invertAlg } = await puzzlePromise;
  let original;
  try { original = kpuzzle.defaultPattern().applyAlg(sourceText).patternData; } catch { return []; }
  const fixedCorners = fixedSlotsFor(sourceState, [...fixedPieces].filter(id => CORNER_INDEX.has(id)), CORNER_INDEX);
  const fixedEdges = fixedSlotsFor(sourceState, [...fixedPieces].filter(id => EDGE_INDEX.has(id)), EDGE_INDEX);
  const output = [], seen = new Set([sourceText]);
  for (let attempt = 0; attempt < maxAttempts && output.length < count; attempt++) {
    const corners = permutationOrbit(original.CORNERS, fixedCorners, CORNER_IDS.length, 3, random);
    const edges = permutationOrbit(original.EDGES, fixedEdges, EDGE_IDS.length, 2, random);
    if (!corners || !edges) break;
    if (parity(corners.pieces) !== parity(edges.pieces)) {
      if (edges.free.length < 2) continue;
      const a = edges.free[0], b = edges.free[1];
      [edges.pieces[a], edges.pieces[b]] = [edges.pieces[b], edges.pieces[a]];
    }
    const patternData = {
      ...original,
      CORNERS: { ...original.CORNERS, pieces: corners.pieces, orientation: corners.orientation },
      EDGES: { ...original.EDGES, pieces: edges.pieces, orientation: edges.orientation },
    };
    try {
      const solution = await solve(new KPattern(kpuzzle, patternData));
      const scramble = invertAlg(solution.toString()).join(' ');
      if (!scramble || seen.has(scramble)) continue;
      seen.add(scramble);
      const state = analysisStateFromScramble(scramble);
      if (sameCubeState(state, sourceState)) continue;
      const verification = validateSolution(state, moves, face);
      const retained = before.pairs.every(pair => verification.pairs.some(next => next.slot === pair.slot));
      const focused = pin.trainer === 'cross' ? verification.crossSolved : Boolean(target && verification.pairs.some(pair => pair.slot === target.slot));
      if (!verification.crossSolved || !retained || !focused) continue;
      const essentialsStayed = [...fixedPieces].every(id => {
        const source = sourceState.cubies.find(item => item.id === id);
        const variant = state.cubies.find(item => item.id === id);
        return source && variant && equalPosition(source.position, variant.position)
          && Object.entries(source.stickers).every(([faceName, color]) => variant.stickers[faceName] === color);
      });
      if (!essentialsStayed) continue;
      let plannerChecked = false;
      if (pin.trainer === 'cross') {
        if (!planner) continue;
        const planned = await planner({ scramble, face, kind: 'cross' });
        plannerChecked = Boolean(planned?.results?.length || planned?.candidates?.some(candidate => candidate.options?.length));
      } else {
        try {
          const planned = await checkWithPairPlanner(scramble);
          plannerChecked = planned.candidates.some(candidate => candidate.slots.includes(target.slot) && candidate.options.length > 0);
        } catch { plannerChecked = false; }
      }
      if (!plannerChecked) continue;
      output.push({ scramble, state, verified: true, plannerChecked, randomized: true });
    } catch { /* Invalid or unsupported candidate states are never offered. */ }
  }
  return output;
}

async function ollVariants(pin, { count, random, maxAttempts }) {
  const source = [...pin.scramble.split(/\s+/).filter(Boolean), ...pin.movesUpTo].join(' ');
  const target = await identifyOllCase(source);
  if (!target) return [];
  const algorithms = getCases('pll').flatMap(row => row.algs.map(alg => alg.moves))
    .filter(alg => /^[URFDLB2'\s]+$/.test(alg));
  const solveAlg = getCase(target.id)?.algs?.[0]?.moves;
  if (!solveAlg) return [];
  const candidates = shuffle(algorithms, random);
  const output = [], seen = new Set([source]);
  for (const algorithm of candidates.slice(0, maxAttempts)) {
    const scramble = `${source} ${algorithm}`.trim();
    if (seen.has(scramble)) continue;
    seen.add(scramble);
    if ((await identifyOllCase(scramble))?.id !== target.id) continue;
    if (await identifyOllCase(`${scramble} ${solveAlg}`)) continue;
    let state;
    try { state = analysisStateFromScramble(scramble); } catch { continue; }
    output.push({ scramble, state, verified: true, plannerChecked: true, randomized: true });
    if (output.length >= count) break;
  }
  return output;
}

async function pllVariants(pin, { count, random }) {
  const source = [...pin.scramble.split(/\s+/).filter(Boolean), ...pin.movesUpTo].join(' ');
  let base;
  try { base = identifyPllCase(analysisStateFromScramble(source)); } catch { return []; }
  if (!base) return [];
  const solveAlg = getCases('pll').find(row => row.name === base.name)?.algs?.[0]?.moves;
  if (!solveAlg) return [];
  const output = [];
  for (const auf of shuffle(['U', 'U2', "U'"], random).slice(0, count)) {
    const scramble = `${source} ${auf}`.trim();
    try {
      const state = analysisStateFromScramble(scramble);
      if (identifyPllCase(state)?.name !== base.name) continue;
      if (identifyPllCase(analysisStateFromScramble(`${scramble} ${solveAlg}`))) continue;
      output.push({ scramble, state, verified: true, plannerChecked: true, randomized: true });
    } catch { /* Keep only recognized PLL positions. */ }
  }
  return output;
}

/** Return only distinct variations that preserve the pinned technique under an independent check. */
export async function generatePinVariations(pin, { count = 3, random = Math.random, maxAttempts = 36, planner } = {}) {
  if (!pin || !Number.isInteger(count) || count < 1 || count > 12) return [];
  const options = { count, random, planner, maxAttempts: Math.max(count * 2, Math.min(6, maxAttempts)) };
  if (pin.trainer === 'oll') return ollVariants(pin, options);
  if (pin.trainer === 'pll') return pllVariants(pin, options);
  return cubePatternVariants(pin, options);
}
