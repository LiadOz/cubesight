import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImportedReconstruction, canonicalizeReconstruction, parseAlgCubingUrl,
  physicalModelTokens, tokenizeReconstruction, verifyReconstruction,
} from '../src/review/import-parser.js';
import { cleanRecord } from '../src/solve-store.js';

test('importer expands groups/commutators and strips comments into review moves', () => {
  const parsed = tokenizeReconstruction("// first\n(R U R' U')2 [F: R U] /* pair 1 */");
  assert.equal(parsed.tokens.length, 12);
  assert.equal(parsed.notes.length, 2);
  const result = buildImportedReconstruction({ scramble: "R U R' U'", solution: "U R U' R'" });
  assert.equal(result.solves, true);
  assert.equal(result.record.source, 'import');
  assert.equal(result.record.moveTimes, null);
  assert.equal(result.record.solveMs, null);
});

test('alg.cubing.net URLs decode setup and algorithm locally', () => {
  assert.deepEqual(parseAlgCubingUrl('https://alg.cubing.net/?setup=R_U-&alg=U-_R'), { scramble: "R U'", solution: "U' R" });
  assert.throws(() => parseAlgCubingUrl('https://example.com/?alg=R'), /not from alg.cubing.net/);
});

test('300 deterministic random wide/slice/rotation algorithms match the independent physical turn model', () => {
  const faces = 'URFDLB', suffixes = ['', "'", '2'];
  const extras = ['x', 'y', 'z', 'M', 'E', 'S'];
  let seed = 12345;
  const random = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let run = 0; run < 300; run++) {
    const raw = [];
    const length = 4 + random(14);
    for (let i = 0; i < length; i++) {
      const choice = random(10), face = faces[random(6)], tail = suffixes[random(3)];
      if (choice < 5) raw.push(`${face}${tail}`);
      else if (choice < 7) raw.push(`${face}w${tail}`);
      else if (choice < 8) raw.push(`${'rufldb'[random(6)]}${tail}`);
      else if (choice < 9) raw.push(`${extras[random(3)]}${tail}`);
      else raw.push(`${extras[3 + random(3)]}${tail}`);
    }
    const { tokens } = tokenizeReconstruction(raw.join(' '));
    const canonical = canonicalizeReconstruction(tokens).moves.map(item => item.move);
    assert.equal(verifyReconstruction(tokens, canonical), true, raw.join(' '));
    // The reference path deliberately uses physical wide/slice turns and
    // centre normalization, while the importer emits fixed-centre outer turns.
    assert.ok(physicalModelTokens(tokens).length >= canonical.length);
  }
});

test('cleanRecord keeps complete solve, scramble, and timing arrays for long review replays', () => {
  const moves = Array.from({ length: 275 }, (_, i) => ['R', 'U', "R'", "U'"][i % 4]);
  const cleaned = cleanRecord({ at: 1, source: 'import', scramble: 'R U', scrambleTurns: moves, solveMoves: moves, moveTimes: moves.map((_, i) => i), moveCount: moves.length });
  assert.equal(cleaned.solveMoves.length, 275);
  assert.equal(cleaned.scrambleTurns.length, 275);
  assert.equal(cleaned.moveTimes.length, 275);
});
