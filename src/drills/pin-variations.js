import { FACE_COLORS, applyMoves, createSolvedState, sameCubeState } from '../cross-cube.js';
import { analysisStateFromScramble } from '../analysis/long-replay.js';
import { relabelMoves, unrelabelMoves } from '../analysis/normalize.js';
import { getCase, getCases } from '../algs/seed/cases.js';
import { identifyOllCase } from './oll-model.js';
import { identifyPllCase } from '../pll-logic.js';
import { bestCompletions } from '../analysis/pair-completion.js';
import { currentDShift, f2lPairSlots, ollSolved, solvedPairsPseudo } from '../solve-tracker.js';

// cubing.js KPattern order; keep this aligned with the solver's orbit arrays.
// cubing's KPattern corner orbit order (note the final four use DFR, DFL, DBL, DBR).
const CORNER_IDS = ['UFR', 'UBR', 'UBL', 'UFL', 'DFR', 'DFL', 'DBL', 'DBR'];
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

const OFFSET_SUFFIX = ['', '', '2', "'"];
const solvedCubie = cubie => cubie && Object.entries(cubie.stickers).every(([face, color]) => FACE_COLORS[face] === color);
const frameState = (state, face, shift) => shift ? applyMoves(state, [`${face}${OFFSET_SUFFIX[shift]}`]) : state;

function essentialPieces(pin, state, bestMoves) {
  const face = pin.crossFace || 'D';
  const frame = currentDShift(state, face);
  if (frame == null && pin.trainer !== 'cross') return null;
  const beforePairs = solvedPairsPseudo(state, face);
  const afterState = applyMoves(state, bestMoves);
  const answerFrame = currentDShift(afterState, face);
  if (answerFrame == null) return null;
  const afterPairs = solvedPairsPseudo(afterState, face);
  const solved = new Set(beforePairs.map(pair => pair.slot));
  const newPairs = afterPairs.filter(pair => !solved.has(pair.slot));
  const stageNumber = /pair([1-4])/.exec(pin.stage)?.[1];
  const target = newPairs[0] ?? afterPairs.find(pair => stageNumber && pair.slot === stageNumber);
  const partialSlots = frame == null ? [] : f2lPairSlots(face).flatMap(pair => {
    const cornerSolved = solvedCubie(frameState(state, face, frame).cubies.find(cubie => cubie.id === pair.cornerId));
    const edgeSolved = solvedCubie(frameState(state, face, frame).cubies.find(cubie => cubie.id === pair.edgeId));
    return cornerSolved !== edgeSolved ? [{ slot: pair.slot, cornerSolved, edgeSolved }] : [];
  });
  const pieces = new Set(EDGE_IDS.filter(id => id.includes(face)));
  for (const pair of beforePairs) { pieces.add(pair.cornerId); pieces.add(pair.edgeId); }
  if (target) { pieces.add(target.cornerId); pieces.add(target.edgeId); }
  if (frame != null) {
    const beforeFrame = frameState(state, face, frame);
    for (const pair of f2lPairSlots(face)) for (const id of [pair.cornerId, pair.edgeId]) {
      if (solvedCubie(beforeFrame.cubies.find(cubie => cubie.id === id))) pieces.add(id);
    }
  }
  return { face, frame, answerFrame, beforePairs, afterPairs, partialSlots, solved, target, pieces };
}

async function checkWithPairPlanner(scramble, options = {}) {
  options = { maxDepth: 12, timeBudgetMs: 160, maxSolutions: 6, ...options };
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
  const face = pin.crossFace || 'D';
  const normalizedSource = face === 'D' ? sourceText : relabelMoves(sourceMoves, face).join(' ');
  const normalizedMoves = face === 'D' ? moves : relabelMoves(moves, face);
  let sourceState;
  let normalizedSourceState;
  try {
    sourceState = analysisStateFromScramble(sourceText);
    normalizedSourceState = face === 'D' ? sourceState : analysisStateFromScramble(normalizedSource);
  } catch { return []; }
  const constraints = essentialPieces({ ...pin, crossFace: 'D' }, normalizedSourceState, normalizedMoves);
  if (!constraints) return [];
  const { frame, answerFrame, beforePairs, partialSlots, target, pieces: fixedPieces } = constraints;
  if (pin.trainer !== 'cross' && !target) return [];

  puzzlePromise ??= Promise.all([import('cubing/puzzles'), import('cubing/kpuzzle'), import('cubing/search'), import('../algs/notation.js')])
    .then(async ([{ cube3x3x3 }, { KPattern }, search, notation]) => ({ kpuzzle: await cube3x3x3.kpuzzle(), KPattern, solve: search.experimentalSolve3x3x3IgnoringCenters, invertAlg: notation.invertAlg }));
  const { kpuzzle, KPattern, solve, invertAlg } = await puzzlePromise;
  let original;
  try { original = kpuzzle.defaultPattern().applyAlg(normalizedSource).patternData; } catch { return []; }
  const fixedCorners = fixedSlotsFor(normalizedSourceState, [...fixedPieces].filter(id => CORNER_INDEX.has(id)), CORNER_INDEX);
  const fixedEdges = fixedSlotsFor(normalizedSourceState, [...fixedPieces].filter(id => EDGE_INDEX.has(id)), EDGE_INDEX);
  const output = [], seen = new Set([normalizedSource]);
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
      const normalizedScramble = invertAlg(solution.toString()).join(' ');
      if (!normalizedScramble || seen.has(normalizedScramble)) continue;
      seen.add(normalizedScramble);
      const normalizedState = analysisStateFromScramble(normalizedScramble);
      const scramble = face === 'D' ? normalizedScramble : unrelabelMoves(normalizedScramble.split(/\s+/).filter(Boolean), face).join(' ');
      const state = face === 'D' ? normalizedState : analysisStateFromScramble(scramble);
      if (sameCubeState(state, sourceState)) continue;
      const answerState = applyMoves(normalizedState, normalizedMoves);
      const answerShift = currentDShift(answerState, 'D');
      const answerPairs = answerShift == null ? [] : solvedPairsPseudo(answerState, 'D');
      const retained = beforePairs.every(pair => answerPairs.some(next => next.slot === pair.slot));
      const focused = pin.trainer === 'cross' ? answerShift === answerFrame : Boolean(target && answerPairs.some(pair => pair.slot === target.slot));
      if (answerShift !== answerFrame || !retained || !focused) continue;
      const essentialsStayed = [...fixedPieces].every(id => {
        const source = normalizedSourceState.cubies.find(item => item.id === id);
        const variant = normalizedState.cubies.find(item => item.id === id);
        return source && variant && equalPosition(source.position, variant.position)
          && Object.entries(source.stickers).every(([faceName, color]) => variant.stickers[faceName] === color);
      });
      if (!essentialsStayed) continue;
      if (partialSlots.length) {
        const candidateFrame = currentDShift(normalizedState, 'D');
        if (candidateFrame !== frame) continue;
        const candidateAligned = frameState(normalizedState, 'D', candidateFrame);
        const partialShapePreserved = partialSlots.every(({ slot, cornerSolved, edgeSolved }) => {
          const pair = f2lPairSlots('D').find(item => item.slot === slot);
          return pair
            && solvedCubie(candidateAligned.cubies.find(cubie => cubie.id === pair.cornerId)) === cornerSolved
            && solvedCubie(candidateAligned.cubies.find(cubie => cubie.id === pair.edgeId)) === edgeSolved;
        });
        if (!partialShapePreserved) continue;
      }
      let plannerChecked = false;
      if (pin.trainer === 'cross') {
        if (!planner) continue;
        const planned = await planner({ scramble, face, kind: 'cross' });
        const proposed = [
          ...(planned?.results ?? []).map(item => item.moves),
          ...(planned?.candidates ?? []).flatMap(candidate => candidate.options ?? []).map(item => item.moves ?? item.tokens),
        ].filter(Boolean);
        plannerChecked = proposed.some(candidateMoves => currentDShift(applyMoves(state, candidateMoves), face) === answerFrame);
      } else {
        try {
          const planned = await checkWithPairPlanner(normalizedScramble, { startShift: frame });
          plannerChecked = planned?.candidates?.some(candidate => candidate.slots.includes(target.slot)
            && candidate.options.some(option => {
              const replay = applyMoves(normalizedState, option.tokens ?? option.moves ?? []);
              const replayPairs = solvedPairsPseudo(replay, 'D');
              return currentDShift(replay, 'D') === answerFrame
                && beforePairs.every(pair => replayPairs.some(next => next.slot === pair.slot))
                && replayPairs.some(pair => pair.slot === target.slot);
            })) ?? false;
        } catch { plannerChecked = false; }
      }
      if (!plannerChecked) continue;
      output.push({ scramble, state, verified: true, plannerChecked, randomized: true });
    } catch { /* Invalid or unsupported candidate states are never offered. */ }
  }
  return output;
}

async function ollVariants(pin, { count, random, maxAttempts }) {
  const face = pin.crossFace || 'D';
  const sourceMoves = [...pin.scramble.split(/\s+/).filter(Boolean), ...pin.movesUpTo];
  const normalizedSource = face === 'D' ? sourceMoves.join(' ') : relabelMoves(sourceMoves, face).join(' ');
  const target = await identifyOllCase(normalizedSource);
  if (!target) return [];
  let sourceState;
  try { sourceState = analysisStateFromScramble(normalizedSource); } catch { return []; }
  const frame = currentDShift(sourceState, 'D');
  if (frame == null || solvedPairsPseudo(sourceState, 'D').length !== 4) return [];
  const algorithms = getCases('pll').flatMap(row => row.algs.map(alg => alg.moves))
    .filter(alg => /^[URFDLB2'\s]+$/.test(alg));
  const solveAlg = getCase(target.id)?.algs?.[0]?.moves;
  if (!solveAlg) return [];
  const candidates = shuffle(algorithms, random);
  const output = [], seen = new Set([normalizedSource]);
  for (const algorithm of candidates.slice(0, maxAttempts)) {
    const normalizedScramble = `${normalizedSource} ${algorithm}`.trim();
    if (seen.has(normalizedScramble)) continue;
    seen.add(normalizedScramble);
    if ((await identifyOllCase(normalizedScramble))?.id !== target.id) continue;
    let normalizedState;
    try { normalizedState = analysisStateFromScramble(normalizedScramble); } catch { continue; }
    if (currentDShift(normalizedState, 'D') !== frame || solvedPairsPseudo(normalizedState, 'D').length !== 4) continue;
    const solvedState = applyMoves(normalizedState, solveAlg);
    if (currentDShift(solvedState, 'D') !== frame || solvedPairsPseudo(solvedState, 'D').length !== 4 || !ollSolved(solvedState, 'D')) continue;
    const scramble = face === 'D' ? normalizedScramble : unrelabelMoves(normalizedScramble.split(/\s+/), face).join(' ');
    const state = face === 'D' ? normalizedState : analysisStateFromScramble(scramble);
    output.push({ scramble, state, verified: true, plannerChecked: true, randomized: true });
    if (output.length >= count) break;
  }
  return output;
}

async function pllVariants(pin, { count, random }) {
  const face = pin.crossFace || 'D';
  const sourceMoves = [...pin.scramble.split(/\s+/).filter(Boolean), ...pin.movesUpTo];
  const normalizedSource = face === 'D' ? sourceMoves.join(' ') : relabelMoves(sourceMoves, face).join(' ');
  let sourceState;
  try { sourceState = analysisStateFromScramble(normalizedSource); } catch { return []; }
  const frame = currentDShift(sourceState, 'D');
  if (frame == null || solvedPairsPseudo(sourceState, 'D').length !== 4) return [];
  let base;
  try { base = identifyPllCase(sourceState); } catch { return []; }
  if (!base) return [];
  const solveAlg = getCases('pll').find(row => row.name === base.name)?.algs?.[0]?.moves;
  if (!solveAlg) return [];
  const output = [];
  for (const auf of shuffle(['U', 'U2', "U'"], random).slice(0, count)) {
    const normalizedScramble = `${normalizedSource} ${auf}`.trim();
    try {
      const normalizedState = analysisStateFromScramble(normalizedScramble);
      if (identifyPllCase(normalizedState)?.name !== base.name) continue;
      if (currentDShift(normalizedState, 'D') !== frame || solvedPairsPseudo(normalizedState, 'D').length !== 4) continue;
      const solved = ['','U','U2',"U'"].some(before => {
        const aligned = before ? applyMoves(normalizedState, [before]) : normalizedState;
        const solvedState = applyMoves(aligned, solveAlg);
        if (currentDShift(solvedState, 'D') !== frame || solvedPairsPseudo(solvedState, 'D').length !== 4) return false;
        const restored = frameState(solvedState, 'D', frame);
        return ['', 'U', 'U2', "U'"].some(after => sameCubeState(after ? applyMoves(restored, [after]) : restored, createSolvedState()));
      });
      if (!solved) continue;
      const scramble = face === 'D' ? normalizedScramble : unrelabelMoves(normalizedScramble.split(/\s+/), face).join(' ');
      const state = face === 'D' ? normalizedState : analysisStateFromScramble(scramble);
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
