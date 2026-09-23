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

/** Uw = y D: search after the matching D turn, then map moves into the rotated center frame. */
export function wideURequest(setup, suffix = '') {
  const turns = suffix === "'" ? 3 : suffix === '2' ? 2 : 1;
  const dTurn = `D${suffix}`;
  return { prefix: `Uw${suffix}`, turns, scramble: `${setup.scramble} ${dTurn}` };
}

export function wideUResults(request, results) {
  return (results || []).map((result) => ({
    moves: [request.prefix, ...result.moves.map((move) => rotateY(move, (4 - request.turns) % 4))],
  }));
}

export function invertAlgorithm(algorithm) {
  return algorithm.trim().split(/\s+/).filter(Boolean).reverse().map((move) => {
    if (move.endsWith('2')) return move;
    return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
  }).join(' ');
}

/** Build a short, realistic post-cross state with exactly 0–2 F2L pairs solved. */
export function createPlannerSetup(seed, { shiftD = false } = {}) {
  const brokenSlots = 2 + (seed % 3);
  const setups = [];
  for (let slot = 0; slot < brokenSlots; slot += 1) {
    const algorithm = rotateY(SLOT_ALGORITHMS[(seed + slot * 3) % SLOT_ALGORITHMS.length], slot);
    setups.push(invertAlgorithm(algorithm));
  }
  const baseScramble = setups.join(' ');
  const basePairs = validateSolution(stateFromScramble(baseScramble), [], 'D').pairs;
  const dShift = shiftD ? ["D", "D'", "D2"][seed % 3] : null;
  const scramble = [baseScramble, dShift].filter(Boolean).join(' ');
  const state = stateFromScramble(scramble);
  const restored = dShift ? [invertAlgorithm(dShift)] : [];
  const recoveryPlans = setups.slice().reverse().map((setup) => {
    restored.push(invertAlgorithm(setup));
    return restored.join(' ').split(' ');
  });
  return { scramble, state, solvedPairs: basePairs, solvedCount: basePairs.length, dShift, recoveryPlans };
}

export function weightedMoveCount(moves) {
  return moves.reduce((total, move) => {
    const face = move[0]?.toUpperCase();
    if ('XYZ'.includes(face)) return total + 2;
    if (face === 'F' || face === 'B') return total + 5;
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
        const last = moves.at(-1);
        const pseudo = /^D(?:2|')?$/.test(last || '') && !validateSolution(setup.state, moves.slice(0, -1), 'D').crossSolved;
        best.set(pair.slot, { slot: pair.slot, cornerId: pair.cornerId, edgeId: pair.edgeId, moves, weight, pseudo });
      }
    }
  }
  return [...best.values()].sort((a, b) => a.weight - b.weight || a.moves.length - b.moves.length || a.slot.localeCompare(b.slot));
}

export function formatWeight(weight) {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(2).replace(/0$/, '');
}
