import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cube3x3x3 } from 'cubing/puzzles';
import { evaluateLastLayer } from '../src/analysis/last-layer.js';
import { summarizeAnalysis } from '../src/analysis/summary.js';
import { cleanAnalysis } from '../src/store/analysis-field.js';
import { generatePllCase } from '../src/pll-logic.js';
import { invertAlg } from '../src/algs/notation.js';
import { getCases, getCase } from '../src/algs/seed/cases.js';
import { segmentSolve } from '../src/analysis/segment.js';
import { unrelabelMoves } from '../src/analysis/normalize.js';
import { applyMoves, stateFromScramble } from '../src/cross-cube.js';
import { coSolved, eoSolved, solvedPairs } from '../src/solve-tracker.js';

const timingFrames = count => Array.from({ length: count }, (_, i) => ({ t: i * 100, gapMs: i ? 100 : 0 }));

test('all 57 curated OLL signatures and verified algorithms replay on their case setup', async () => {
  const puzzle = await cube3x3x3.kpuzzle();
  const rotations = ['', 'y', 'y2', "y'"];
  const inverse = { '': '', y: "y'", y2: 'y2', "y'": 'y' };
  for (const row of getCases('oll')) {
    const setup = puzzle.defaultPattern().applyAlg(row.setup);
    let solves = false;
    for (const alg of row.algs.filter(item => item.verified)) {
      for (const rotation of rotations) for (const pre of ['', 'U', 'U2', "U'"]) for (const post of ['', 'U', 'U2', "U'"]) {
        const notation = [pre, rotation, alg.moves, inverse[rotation], post].filter(Boolean).join(' ');
        const after = setup.applyAlg(notation).patternData;
        if ([...after.CORNERS.orientation.slice(0, 4), ...after.EDGES.orientation.slice(0, 4)].every(value => value === 0)) solves = true;
      }
    }
    assert.equal(solves, true, `${row.id} has a replayable orientation-clearing variant`);
  }
});

test('OLL recognition accounts for a U AUF and retains its verified continuation', async () => {
  const row = getCase('oll/1');
  const setup = `${row.setup} U`;
  const segmentation = {
    solved: false, scramble: setup, moves: ['R'], crossFace: 'D', frames: timingFrames(1),
    normalized: { scramble: setup, moves: ['R'] },
    marks: { pairIdx: [-1, -1, -1, -1], eoIdx: 0, coIdx: 0, solvedIdx: 0 },
  };
  const result = await evaluateLastLayer(segmentation);
  assert.equal(result.oll.caseId, 'oll/1');
  assert.equal(result.oll.best.id.startsWith('s.oll.1.'), true);
  assert.ok(result.oll.best.moves.length > 0);
  const puzzle = await cube3x3x3.kpuzzle();
  const after = puzzle.defaultPattern().applyAlg(`${setup} ${result.oll.best.notation}`).patternData;
  assert.ok([...after.CORNERS.orientation.slice(0, 4), ...after.EDGES.orientation.slice(0, 4)].every(value => value === 0));
});

test('an already oriented EO marker at -1 still counts when timing a Sune OLL', async () => {
  const row = getCase('oll/27');
  const segmentation = {
    solved: false, scramble: row.setup, moves: ['R'], crossFace: 'D', frames: timingFrames(1),
    normalized: { scramble: row.setup, moves: ['R'] },
    marks: { pairIdx: [-1, -1, -1, -1], eoIdx: -1, coIdx: 0, solvedIdx: null },
  };
  const result = await evaluateLastLayer(segmentation);
  assert.equal(result.oll.caseId, 'oll/27');
  assert.equal(Number.isFinite(result.oll.executionMs), true, 'the pre-oriented EO milestone does not make the completed OLL look unfinished');
});

test('PLL best continuation includes the needed AUF and replays the actual case state', async () => {
  const prompt = generatePllCase('T', { auf: 'U2' });
  const solve = ['U2', ...prompt.algorithm.split(' ')];
  const segmentation = {
    solved: true, scramble: `${prompt.setup.join(' ')} U2`, moves: solve, crossFace: 'D', frames: timingFrames(solve.length),
    normalized: { scramble: `${prompt.setup.join(' ')} U2`, moves: solve },
    marks: { pairIdx: [-1, -1, -1, -1], eoIdx: -1, coIdx: -1, solvedIdx: solve.length - 1 },
  };
  const result = await evaluateLastLayer(segmentation);
  assert.equal(result.pll.caseId, 'pll/T');
  assert.ok(result.pll.best.moves.length > 0);
  assert.equal(result.pll.best.pre || result.pll.best.post, 'U2');
});

test('a complete OLL 27 then PLL T reconstruction remains identifiable and replayable on all six cross faces', async () => {
  const solution = [...getCase('oll/27').algs[0].moves.split(' '), ...getCase('pll/T').algs[0].moves.split(' ')];
  const setup = invertAlg(solution.join(' '));
  for (const face of ['D', 'F', 'U', 'B', 'R', 'L']) {
    const scramble = unrelabelMoves(setup, face).join(' ');
    const moves = unrelabelMoves(solution, face);
    const segmentation = segmentSolve({ scramble, moves, crossFace: face, moveTimes: moves.map((_, i) => 500 + i * 100) });
    assert.equal(segmentation.solved, true, `${face} reconstruction solves`);
    const lastLayer = await evaluateLastLayer(segmentation);
    assert.equal(lastLayer?.oll?.caseId, 'oll/27', `${face} OLL capture`);
    assert.equal(lastLayer?.pll?.caseId, 'pll/T', `${face} PLL capture`);
    const summary = summarizeAnalysis({ segmentation, lastLayer });
    const before = applyMoves(stateFromScramble(scramble), moves.slice(0, lastLayer.oll.from));
    const after = applyMoves(before, summary.lastLayer.oll.best.moves.split(' '));
    assert.equal(solvedPairs(after, face).length, 4, `${face} suggestion preserves F2L`);
    assert.equal(eoSolved(after, face), true, `${face} suggestion completes EO`);
    assert.equal(coSolved(after, face), true, `${face} suggestion completes CO`);
  }
});

test('an incomplete recording after F2L retains the current OLL case and its guided continuation', async () => {
  const solution = [...getCase('oll/27').algs[0].moves.split(' '), ...getCase('pll/T').algs[0].moves.split(' ')];
  const scramble = invertAlg(solution.join(' '));
  const partial = segmentSolve({ scramble: scramble.join(' '), moves: solution.slice(0, 1), crossFace: 'D' });
  assert.equal(partial.solved, false);
  assert.ok(partial.marks.pairIdx.every(Number.isInteger), 'F2L was complete before the recorded turns');
  const result = await evaluateLastLayer(partial);
  assert.equal(result?.oll?.caseId, 'oll/27');
  assert.ok(result.oll.best.moves.length > 0);
  assert.equal(result.pll, null, 'PLL is not offered while OLL is unfinished');
});

test('unfinished OLL and PLL stages keep case suggestions but do not receive efficiency or execution grades', async () => {
  const ollMoves = getCase('oll/27').algs[0].moves.split(' ');
  const pllMoves = getCase('pll/T').algs[0].moves.split(' ');
  const cancelPairs = (face, count) => Array.from({ length: count }, () => [face, `${face}'`]).flat();
  // Add neutral move pairs inside OLL so its partial recorded move count exceeds
  // the verified algorithm, then add a slower OLL and unfinished PLL tail.
  const completeSolution = [ollMoves[0], ...cancelPairs('U', 16), ...ollMoves.slice(1), ...pllMoves];
  const scramble = invertAlg(completeSolution.join(' ')).join(' ');
  const sampleTimes = moves => moves.map((_, index) => 500 + index * 100);

  const partialOllMoves = [ollMoves[0], ...cancelPairs('U', 16)];
  const partialOll = segmentSolve({ scramble, moves: partialOllMoves, crossFace: 'D', moveTimes: sampleTimes(partialOllMoves) });
  const partialOllReview = await evaluateLastLayer(partialOll);
  assert.ok(partialOllReview.oll.used.stm > partialOllReview.oll.best.stm);
  assert.equal(partialOllReview.oll.better, null);
  assert.equal(partialOllReview.oll.executionMs, null);
  assert.equal(partialOllReview.lastLayerReference, null);

  const complete = segmentSolve({ scramble, moves: completeSolution, crossFace: 'D', moveTimes: sampleTimes(completeSolution) });
  const ollEnd = Math.max(complete.marks.eoIdx, complete.marks.coIdx);
  const partialPllMoves = [
    ...completeSolution.slice(0, ollEnd + 1),
    ...cancelPairs('R', 16),
    ...cancelPairs('U', 16),
  ];
  const partialPll = segmentSolve({ scramble, moves: partialPllMoves, crossFace: 'D', moveTimes: sampleTimes(partialPllMoves) });
  const partialPllReview = await evaluateLastLayer(partialPll);
  assert.ok(partialPllReview.oll.used.stm > partialPllReview.oll.best.stm);
  assert.ok(partialPllReview.oll.better?.loss > 0, 'a completed OLL can still be compared when PLL is unfinished');
  assert.ok(Number.isFinite(partialPllReview.oll.executionMs), 'completed OLL execution timing remains available');
  assert.ok(partialPllReview.pll.used.coreStm > partialPllReview.pll.best.coreStm);
  assert.equal(partialPllReview.pll.better, null);
  assert.equal(partialPllReview.pll.extraAuf, null);
  assert.equal(partialPllReview.pll.executionMs, null);
  assert.equal(partialPllReview.lastLayerReference, null);
});

test('one-look OLL Sune then OLL re-recognition is counted after a pause on all six cross faces', async () => {
  const first = getCase('oll/10'), next = getCase('oll/34');
  const sune = "R U R' U R U2 R'".split(' ');
  const continuation = next.algs.find(alg => alg.verified && alg.moves.split(/\s+/).every(move => /^[URFDLB](?:2|')?$/.test(move))).moves.split(' ');
  const canonicalMoves = [...sune, ...continuation];
  const times = canonicalMoves.map((_, i) => 500 + i * 100 + (i >= sune.length ? 1000 : 0));
  let segmentation, result;
  for (const face of ['D', 'F', 'U', 'B', 'R', 'L']) {
    const moves = unrelabelMoves(canonicalMoves, face);
    segmentation = segmentSolve({ scramble: unrelabelMoves(first.setup.split(' '), face).join(' '), moves, moveTimes: times, crossFace: face });
    result = await evaluateLastLayer(segmentation, { config: { oll: '1look', pll: '1look' } });
    assert.equal(result.oll.caseId, 'oll/10', `${face}-cross initial case`);
    assert.equal(result.oll.looksTaken, 2, `${face}-cross look count`);
    assert.equal(result.oll.extraLook, true, `${face}-cross extra-look signal`);
    assert.equal(result.oll.looks[0].caseId, 'oll/34', `${face}-cross intermediate case`);
    assert.equal(result.oll.looks[0].evidence, 'pause');
  }
  const summary = summarizeAnalysis({ segmentation, lastLayer: result });
  const saved = cleanAnalysis(summary);
  assert.equal(saved.lastLayer.oll.extraLook, true);
  assert.equal(saved.lastLayer.oll.looksTaken, 2);
});

test('a clean two-look EO then CO solve counts its configured boundary without an extra look', async () => {
  const eo = getCase('oll2/eo-line').algs[0].moves;
  const co = getCase('oll2/co-oll-27').algs[0].moves;
  const moves = [...eo.split(' '), ...co.split(' ')];
  const segmentation = segmentSolve({ scramble: invertAlg(moves.join(' ')).join(' '), moves, crossFace: 'D' });
  const result = await evaluateLastLayer(segmentation, { config: { oll: '2look', pll: '2look' } });
  assert.equal(result.oll.looksTaken, 2);
  assert.equal(result.oll.extraLook, false);
  assert.equal(result.oll.looks[0].evidence, 'configured-look');
});

test('a two-look OLL that reaches a third case after a pause is flagged', async () => {
  const eo = getCase('oll2/eo-line').algs[0].moves.split(' ');
  const co = getCase('oll2/co-oll-27').algs[0].moves.split(' ');
  const moves = [...eo, ...co, ...co];
  const pauseAt = eo.length + co.length;
  const times = moves.map((_, i) => 500 + i * 100 + (i >= pauseAt ? 1000 : 0));
  const segmentation = segmentSolve({ scramble: invertAlg(moves.join(' ')).join(' '), moves, moveTimes: times, crossFace: 'D' });
  const result = await evaluateLastLayer(segmentation, { config: { oll: '2look', pll: '2look' } });
  assert.equal(result.oll.looksTaken, 3);
  assert.equal(result.oll.extraLook, true);
  assert.equal(result.oll.looks.length, 2);
  assert.equal(result.oll.looks[1].evidence, 'pause');
});

test('a clean one-look OLL does not count canonical states inside its algorithm as extra looks', async () => {
  const row = getCase('oll/27');
  const moves = row.algs.find(alg => alg.verified).moves.split(' ');
  const segmentation = segmentSolve({ scramble: invertAlg(moves.join(' ')).join(' '), moves, crossFace: 'D' });
  const result = await evaluateLastLayer(segmentation, { config: { oll: '1look', pll: '1look' } });
  assert.equal(result.oll.looksTaken, 1);
  assert.equal(result.oll.extraLook, false);
  assert.equal(result.oll.likelyExtraLook, false);
  const saved = cleanAnalysis(summarizeAnalysis({ segmentation, lastLayer: result }));
  assert.equal(saved.lastLayer.oll.recognizedAlg.id, result.oll.recognizedAlg.id);
});

test('a pause at an intermediate case inside a recognized single OLL alg is not another look', async () => {
  const row = getCase('oll/41');
  const moves = row.algs.find(alg => alg.id === 's.oll.41.1').moves.split(' ');
  const pauseAt = 8;
  const times = moves.map((_, i) => 500 + i * 100 + (i >= pauseAt ? 1100 : 0));
  const segmentation = segmentSolve({ scramble: row.setup, moves, moveTimes: times, crossFace: 'D' });
  const result = await evaluateLastLayer(segmentation, { config: { oll: '1look', pll: '1look' } });
  assert.equal(result.oll.recognizedAlg.id, 's.oll.41.1');
  assert.equal(result.oll.looksTaken, 1);
  assert.equal(result.oll.extraLook, false);
  assert.equal(result.oll.likelyExtraLook, false);
});

test('repeating a U-perm reaches a second PLL case; a pause corroborates the extra look', async () => {
  const start = getCase('pll/Gb');
  const uPerm = getCase('pll/Ua').algs.find(alg => alg.verified && alg.moves.split(/\s+/).every(move => /^[URFDLB](?:2|')?$/.test(move))).moves.split(' ');
  const moves = [...uPerm, ...uPerm];
  const uncorroborated = segmentSolve({ scramble: start.setup, moves, crossFace: 'D' });
  const likely = await evaluateLastLayer(uncorroborated, { config: { oll: '1look', pll: '1look' } });
  assert.equal(likely.pll.looksTaken, 1);
  assert.equal(likely.pll.extraLook, false, 'a catalog state inside the repeated algorithm is not enough by itself');
  assert.equal(likely.pll.likelyExtraLook, true);

  const times = moves.map((_, i) => 500 + i * 100 + (i >= uPerm.length ? 1000 : 0));
  const paused = segmentSolve({ scramble: start.setup, moves, moveTimes: times, crossFace: 'D' });
  const corroborated = await evaluateLastLayer(paused, { config: { oll: '1look', pll: '1look' } });
  assert.equal(corroborated.pll.looks[0].caseId, 'pll/F');
  assert.equal(corroborated.pll.extraLook, true);
  assert.equal(corroborated.pll.looksTaken, 2);
});

test('summary maps canonical D-frame OLL suggestions back to the solve face and preserves source notation', () => {
  const solve = segmentSolve({ scramble: 'R U', moves: ['R', 'U'], crossFace: 'F' });
  const summary = summarizeAnalysis({ segmentation: solve, lastLayer: {
    oll: { caseId: 'oll/1', name: 'Runway', number: 1, from: 0, to: 1,
      used: { moves: 'U R', stm: 2, etm: 2 }, best: { id: 's.oll.1.1', moves: "U R U'", notation: "U R U'", stm: 3, etm: 3, source: 'catalog', sourceUrl: 'https://example.test/alg' } },
    pll: null, lastLayerReference: 3,
  } });
  assert.equal(summary.lastLayer.oll.best.moves, "B R B'");
  assert.equal(summary.lastLayer.oll.best.notation, "U R U'");
  assert.equal(summary.lastLayerReference, 3);
  const saved = cleanAnalysis(summary);
  assert.equal(saved.lastLayer.oll.best.moves, "B R B'");
  assert.equal(saved.lastLayer.oll.best.sourceNotation, "U R U'");
});

test('two-look case routes can retain the exact dynamic suffix', async () => {
  const { resolveRoute } = await import('../src/routes.js');
  assert.equal(resolveRoute('#/algs/oll2/eo-line/drill').hash, '#/algs/oll2/eo-line/drill');
  assert.equal(resolveRoute('#/algs/oll2').hash, '#/algs/oll2');
});
