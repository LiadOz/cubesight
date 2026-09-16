import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScramble, createSolvedState, applyMoves, stateFromScramble, toRenderData, validateSolution, classifyOpportunity, frontFacesFor, inspectionOrientation, suggestInspectionFront } from '../src/cross-cube.js';
import { planPieceIds } from '../src/cross-cube.js';

const pos = (s, id) => s.cubies.find(p => p.id === id)?.position;

test('inspection orientation puts the chosen cross face on bottom and suggests the most visible front', () => {
  assert.deepEqual(inspectionOrientation('U','F'), {bottom:'U',top:'D',front:'F',right:'L',visibleFaces:['D','F','L']});
  assert.deepEqual(frontFacesFor('R'), ['U','D','F','B']);
  assert.throws(() => inspectionOrientation('U','D'), /adjacent/);
  const suggestion=suggestInspectionFront(stateFromScramble("R U F L' D"),'U');
  assert.equal(suggestion.face,'B');
  assert.equal(suggestion.visiblePieces,4);
  assert.equal(suggestion.crossStickers,2);
});

test('plan highlights include all cross edges plus only the selected F2L pairs on every color', () => {
  const original = stateFromScramble("R U F L' B2");
  for (const face of ['U','D','F','B','R','L']) {
    const pairs = validateSolution(createSolvedState(), [], face).pairs.slice(0,2);
    const ids = planPieceIds(original, face, pairs);
    assert.equal(ids.length, 8);
    const cross = ids.filter(id => id.length === 2 && id.includes(face));
    assert.equal(cross.length, 4);
    for (const pair of pairs) { assert.ok(ids.includes(pair.cornerId)); assert.ok(ids.includes(pair.edgeId)); }
    const next = applyMoves(original, ['D','F']);
    const data = toRenderData(next, ids);
    assert.equal(new Set(data.highlightedPieces).size, 8);
    for (const record of [...data.corners,...data.edges]) {
      assert.equal(data.highlightedPieces.includes(record.position), ids.includes(record.id));
    }
    assert.equal(planPieceIds(original,face,[]).length,4);
  }
});

test('parseScramble returns strict move strings', () => {
  assert.deepEqual(parseScramble("R U2 F'\tL"), ['R', 'U2', "F'", 'L']);
  assert.deepEqual(parseScramble(''), []);
  assert.throws(() => parseScramble('X')); assert.throws(() => parseScramble('R3'));
  assert.throws(() => parseScramble(Array(201).fill('R').join(' ')));
});

test('solved state contains stable cubie IDs and stickers', () => {
  const s = createSolvedState();
  assert.equal(s.cubies.length, 26); assert.deepEqual(pos(s, 'UFR'), [1, 1, 1]);
  assert.deepEqual(pos(s, 'FR'), [1, 0, 1]);
  assert.equal(s.cubies.find(p => p.id === 'UFR').stickers.U, 'white');
});

test('face turns use the declared physical convention and order four', () => {
  assert.deepEqual(pos(stateFromScramble('R'), 'UFR'), [1, 1, -1], 'R: UFR -> UBR');
  assert.deepEqual(pos(stateFromScramble('F'), 'UFR'), [1, -1, 1], 'F: UFR -> DFR');
  for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
    assert.deepEqual(applyMoves(createSolvedState(), [face, face, face, face]), createSolvedState());
  }
});

test('applyMoves is pure and scramble inverse restores state', () => {
  const solved = createSolvedState(), scramble = ['R', 'U', 'F2', "L'", 'D', 'B'];
  const scrambled = applyMoves(solved, scramble);
  assert.notEqual(scrambled, solved); assert.deepEqual(solved, createSolvedState());
  const inverse = scramble.slice().reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : `${m}'`);
  assert.deepEqual(applyMoves(scrambled, inverse), solved);
});

test('render data exposes palette, stable pieces, and highlights', () => {
  const d = toRenderData(createSolvedState(), ['UFR', 'FR']);
  assert.ok(d.colors.U && d.colors.D && d.colors.F); assert.equal(d.showAllCorners, true);
  assert.ok(d.corners.some(p => p.id === 'UFR' && p.position === 'UFR')); assert.ok(d.edges.some(p => p.id === 'FR'));
  assert.deepEqual(d.highlightedPieces, ['UFR', 'FR']);
});

test('highlight follows stable UFR identity after an R turn', () => {
  const d = toRenderData(stateFromScramble('R'), ['UFR']);
  assert.deepEqual(d.highlightedPieces, ['UBR']);
});

test('solved cross and four adjacent pairs validate on every face', () => {
  const s = createSolvedState();
  for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
    const r = validateSolution(s, [], face); assert.equal(r.crossSolved, true, face); assert.equal(r.pairs.length, 4, face);
    r.pairs.forEach(p => { assert.ok(p.cornerId); assert.ok(p.edgeId); assert.ok(p.slot); });
  }
});

test('a trigger sequence preserves D cross but breaks at least one F2L pair', () => {
  const result = validateSolution(createSolvedState(), ['R', 'U', "R'", "U'"], 'D');
  assert.equal(result.crossSolved, true);
  assert.ok(result.pairs.length < 4);
});

test('opportunity classification is transparent and identity-based', () => {
  const r = classifyOpportunity(createSolvedState(), [], 'D', []);
  assert.equal(typeof r.label, 'string'); assert.equal(typeof r.description, 'string'); assert.equal(typeof r.difficulty, 'string');
  assert.ok(Array.isArray(r.highlightedIds));
});

test('classification recognizes an explicitly preserved connected pair', () => {
  const pair = [{ cornerId: 'DFR', edgeId: 'FR', slot: 'FR' }];
  const r = classifyOpportunity(createSolvedState(), ['U'], 'D', pair);
  assert.equal(r.label, 'Preserve a pair');
  assert.deepEqual(r.highlightedIds, ['DFR', 'FR']);
});
