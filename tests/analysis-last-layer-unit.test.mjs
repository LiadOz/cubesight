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
