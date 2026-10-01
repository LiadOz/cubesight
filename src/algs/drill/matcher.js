import { normalizeAlg, parseAlg, stripAuf } from '../notation.js';
import { canonicalizeReconstruction, tokenizeReconstruction } from '../../review/import-parser.js';

const OPPOSITE = Object.freeze({ U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' });
const ORDER = Object.freeze({ U: 0, D: 1, R: 2, L: 3, F: 4, B: 5 });

function amount(move) { return move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1; }
function simplify(moves) {
  const out = [];
  for (const move of moves) {
    const prior = out.at(-1);
    if (prior && prior[0] === move[0]) {
      out.pop();
      const turns = (amount(prior) + amount(move)) % 4;
      if (turns) out.push(`${move[0]}${turns === 2 ? '2' : turns === 3 ? "'" : ''}`);
    } else out.push(move);
  }
  // Opposite faces on the same axis commute. Canonicalize adjacent pairs so
  // equivalent R/L, U/D and F/B ordering does not count as a wrong algorithm.
  for (let pass = 0; pass < out.length; pass++) {
    for (let i = 0; i + 1 < out.length; i++) {
      const a = out[i][0], b = out[i + 1][0];
      if (OPPOSITE[a] === b && ORDER[a] > ORDER[b]) [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
  }
  return out;
}

const key = moves => simplify(moves).join(' ');
const fixedFrameMoves = input => {
  try { return canonicalizeReconstruction(tokenizeReconstruction(String(input)).tokens).moves.map(row => row.move); }
  catch { return parseAlg(input); }
};

function equivalentForms(input) {
  const moves = fixedFrameMoves(input);
  const forms = [moves, stripAuf(moves.join(' '))];
  // AUF turns are allowed before and after a PLL/OLL algorithm. Try all 16
  // placements; the matcher still requires the complete state-independent
  // sequence to match one verified candidate.
  const turns = ['', 'U', 'U2', "U'"];
  for (const before of turns) for (const after of turns) forms.push([
    ...parseAlg(before), ...moves, ...parseAlg(after),
  ]);
  return [...new Set(forms.map(key))];
}

function candidatesFor(algs) {
  return algs.filter(alg => alg.verified === true).flatMap(alg => equivalentForms(alg.moves).map(form => ({ algId: alg.id, form })));
}

/**
 * Match a live sequence against verified candidates. `intact` is supplied by
 * the cube drill after replaying the move stream; an alg that breaks F2L can
 * never be accepted even when its notation matches.
 */
export function matchAlgorithm(input, algs, { intact = true, anyCase = false } = {}) {
  const moves = fixedFrameMoves(input);
  const actual = key(moves);
  const candidates = candidatesFor(algs);
  const complete = candidates.filter(candidate => candidate.form === actual);
  const matched = complete[0] ?? null;
  const prefixes = candidates.filter(candidate => candidate.form.startsWith(actual ? `${actual} ` : '') || candidate.form === actual);
  if (!intact) return { status: 'f2l-broken', complete: false, moveCount: moves.length, nextMoves: [], algId: matched?.algId ?? null };
  if (matched) return { status: 'complete', complete: true, moveCount: moves.length, algId: matched.algId, nextMoves: [] };
  if (prefixes.length) {
    const nextMoves = [...new Set(prefixes.map(candidate => candidate.form.split(' ')[moves.length]).filter(Boolean))];
    return { status: 'prefix', complete: false, moveCount: moves.length, nextMoves, algId: prefixes.length === 1 ? prefixes[0].algId : null };
  }
  return { status: 'mismatch', complete: false, moveCount: moves.length, nextMoves: [], algId: null, anyCase };
}

/** A non-prefix final sequence match for any verified variant of the case. */
export function matchEquivalentExecution(input, algs, { intact = true } = {}) {
  const actual = key(fixedFrameMoves(input));
  const matched = candidatesFor(algs).find(candidate => candidate.form === actual);
  return { match: Boolean(matched && intact), algId: matched?.algId ?? null, intact: Boolean(intact) };
}

export const normalizeExecution = input => normalizeAlg(fixedFrameMoves(input).join(' '));
