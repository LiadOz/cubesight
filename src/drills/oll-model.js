import { effectSignature, preservesF2L } from '../algs/verify.js';
import { invertAlg, normalizeAlg } from '../algs/notation.js';
import { getCases } from '../algs/seed/cases.js';

let puzzlePromise;
const rows = getCases('oll');
const bySignature = new Map(rows.map(row => [row.signature, row]));

/** Identify an OLL row by its stored AUF-canonical orientation signature. */
export async function identifyOllCase(scramble) {
  if (!scramble) return null;
  try {
    puzzlePromise ??= import('cubing/puzzles').then(({ cube3x3x3 }) => cube3x3x3.kpuzzle());
    const kpuzzle = await puzzlePromise;
    const moves = normalizeAlg(scramble);
    const inverse = invertAlg(moves).join(' ');
    if (!preservesF2L(kpuzzle, inverse)) return null;
    const signature = effectSignature(kpuzzle, inverse, 'oll');
    return bySignature.get(signature) ?? null;
  } catch { return null; }
}
