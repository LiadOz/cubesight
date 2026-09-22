import { stateFromScramble, validateSolution } from './cross-cube.js';

const SLOT_ALGORITHMS = [
  "R U R'",
  "R U' R'",
  "U R U' R'",
  "U' R U R'",
  "R U2 R' U' R U R'",
  "U R U' R' U' F' U F",
];

const SIDE_FACES = ['F', 'R', 'B', 'L'];

function rotateY(algorithm, turns) {
  return algorithm.split(/\s+/).map((move) => {
    const index = SIDE_FACES.indexOf(move[0]);
    return index < 0 ? move : `${SIDE_FACES[(index + turns) % 4]}${move.slice(1)}`;
  }).join(' ');
}

export function invertAlgorithm(algorithm) {
  return algorithm.trim().split(/\s+/).filter(Boolean).reverse().map((move) => {
    if (move.endsWith('2')) return move;
    return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
  }).join(' ');
}

/** Build a short, realistic post-cross state with exactly 0–2 F2L pairs solved. */
export function createPlannerSetup(seed) {
  const brokenSlots = 2 + (seed % 3);
  const setups = [];
  for (let slot = 0; slot < brokenSlots; slot += 1) {
    const algorithm = rotateY(SLOT_ALGORITHMS[(seed + slot * 3) % SLOT_ALGORITHMS.length], slot);
    setups.push(invertAlgorithm(algorithm));
  }
  const scramble = setups.join(' ');
  const state = stateFromScramble(scramble);
  const verified = validateSolution(state, [], 'D');
  return { scramble, state, solvedPairs: verified.pairs, solvedCount: verified.pairs.length };
}

export function weightedMoveCount(moves) {
  return moves.reduce((total, move) => {
    const face = move[0]?.toUpperCase();
    if ('XYZ'.includes(face)) return total + 2;
    if (face === 'F' || face === 'B') return total + 1.25;
    return total + 1;
  }, 0);
}

/**
 * Keep only solver results that preserve every already-solved pair, then keep
 * the cheapest verified algorithm for each newly completed slot.
 */
export function plannerChoices(setup, results) {
  const existing = new Set(setup.solvedPairs.map((pair) => pair.slot));
  const best = new Map();
  for (const result of results || []) {
    const moves = Array.isArray(result.moves) ? result.moves : String(result.moves || '').split(/\s+/).filter(Boolean);
    const verified = validateSolution(setup.state, moves, 'D');
    const solved = new Set(verified.pairs.map((pair) => pair.slot));
    if (!verified.crossSolved || [...existing].some((slot) => !solved.has(slot))) continue;
    for (const pair of verified.pairs) {
      if (existing.has(pair.slot)) continue;
      const weight = weightedMoveCount(moves);
      const current = best.get(pair.slot);
      if (!current || weight < current.weight || (weight === current.weight && moves.length < current.moves.length)) {
        best.set(pair.slot, { slot: pair.slot, cornerId: pair.cornerId, edgeId: pair.edgeId, moves, weight });
      }
    }
  }
  return [...best.values()].sort((a, b) => a.weight - b.weight || a.moves.length - b.moves.length || a.slot.localeCompare(b.slot));
}

export function formatWeight(weight) {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(2).replace(/0$/, '');
}
