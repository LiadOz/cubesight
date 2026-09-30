import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScramble, createSolvedState, applyMoves, stateFromScramble, toRenderData, validateSolution, classifyOpportunity, frontFacesFor, inspectionOrientation, suggestInspectionFront, movesForInspection } from '../src/cross-cube.js';
import { planPieceIds, reorientState } from '../src/cross-cube.js';

const pos = (s, id) => s.cubies.find(p => p.id === id)?.position;

test('inspection orientation puts the chosen cross face on bottom and suggests the most visible front', () => {
  assert.deepEqual(inspectionOrientation('U','F'), {bottom:'U',top:'D',front:'F',right:'L',visibleFaces:['D','F','L']});
  assert.deepEqual(frontFacesFor('R'), ['U','D','F','B']);
  assert.throws(() => inspectionOrientation('U','D'), /adjacent/);
  const suggestion=suggestInspectionFront(stateFromScramble("R U F L' D"),'U');
  assert.equal(suggestion.face,'B');
  assert.equal(suggestion.visiblePieces,4);
  assert.equal(suggestion.crossStickers,2);
  assert.equal(suggestion.choices,4);
});

test('solution notation follows the selected inspection hold', () => {
  assert.deepEqual(movesForInspection("R U F' D2",'D','F'),['R','U',"F'",'D2']);
  assert.deepEqual(movesForInspection("R U F' D2",'U','F'),['L','D',"F'",'U2']);
  assert.deepEqual(movesForInspection("U R2 B' L",'R','U'),['F','D2',"R'",'U']);
  assert.throws(()=>movesForInspection('R','U','D'),/adjacent/);
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

test('all wide faces turn two layers and preserve inverses', () => {
  const solved = createSolvedState();
  for (const face of ['U', 'D', 'R', 'L', 'F', 'B']) {
    const move = `${face}w`;
    assert.deepEqual(parseScramble(`${move} ${move}' ${move}2`, { allowWide: true }), [move, `${move}'`, `${move}2`]);
    assert.deepEqual(applyMoves(solved, [move, `${move}'`]), solved);
    assert.deepEqual(applyMoves(solved, [move, move, move, move]), solved);
    assert.notDeepEqual(applyMoves(solved, move), applyMoves(solved, face));
  }
  assert.throws(() => parseScramble('Rw'), /Unsupported move/);
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

test('reorientState is identity for D and moves a chosen face to the bottom', async () => {
  const { reorientState, sameCubeState, createSolvedState, FACE_COLORS } = await import('../src/cross-cube.js');
  const solved = createSolvedState();
  assert.equal(sameCubeState(reorientState(solved, 'D'), solved), true);
  const toF = reorientState(solved, 'F');
  assert.equal(sameCubeState(toF, solved), false);
  // After reorienting solved so F is on the bottom, the D face centre should carry
  // the green (F) colour.
  const dCenter = toF.cubies.find(c => c.id.length === 1 && c.stickers.D !== undefined);
  assert.equal(dCenter.stickers.D, FACE_COLORS.F);
});

test('canonicalizeForRecognition recovers a PLL case from a colour-neutral cross', async () => {
  const { reorientState } = await import('../src/cross-cube.js');
  const { canonicalizeForRecognition } = await import('../src/solve-tracker.js');
  const { identifyPllCase, generatePllCase } = await import('../src/pll-logic.js');
  // Start from a canonical T perm (yellow cross on D). Rigidly rotate the whole
  // cube so the yellow centre is no longer on D — a colour-neutral solve as
  // the smart cube would report after a non-D cross. The position-derived
  // canonicalizer should bring the yellow cross back to D and recover the T.
  const trial = generatePllCase('T', { auf: '' });
  const rotated = reorientState(trial.state, 'F'); // yellow (D) centre moves off D
  const view = canonicalizeForRecognition(rotated, 'D');
  assert.equal(identifyPllCase(view)?.name, 'T');
});


// Whole-cube rotation for tests: `turns` clockwise quarters about a face's outward normal,
// i.e. x = rotateWhole(s,'R',1), y = rotateWhole(s,'U',1), z = rotateWhole(s,'F',1).
const NORMALS = { U:[0,1,0], D:[0,-1,0], F:[0,0,1], B:[0,0,-1], R:[1,0,0], L:[-1,0,0] };
function rotateWhole(state, face, turns) {
  const n = NORMALS[face];
  const cw = v => { // -90 degrees about n: v' = n(n.v) - n x v
    const d = n[0]*v[0] + n[1]*v[1] + n[2]*v[2];
    const c = [n[1]*v[2]-n[2]*v[1], n[2]*v[0]-n[0]*v[2], n[0]*v[1]-n[1]*v[0]];
    return v.map((_, i) => (n[i]*d - c[i]) || 0);
  };
  const faceOf = v => Object.keys(NORMALS).find(f => NORMALS[f].every((x, i) => x === v[i]));
  let cubies = state.cubies;
  for (let t = 0; t < turns; t++) cubies = cubies.map(c => ({ id: c.id, position: cw(c.position),
    stickers: Object.fromEntries(Object.entries(c.stickers).map(([f, col]) => [faceOf(cw(NORMALS[f])), col])) }));
  return { cubies };
}

test('slice moves M/E/S parse only with allowWide and follow WCA directions', () => {
  assert.deepEqual(parseScramble("M E' S2", { allowWide: true }), ['M', "E'", 'S2']);
  assert.throws(() => parseScramble('M'), /Unsupported move/);
  assert.throws(() => parseScramble('Mw', { allowWide: true }), /Unsupported move/);
  // M follows L: the U centre goes to F, the UF edge to DF.
  const m = stateFromScramble('');
  const afterM = applyMoves(m, 'M');
  assert.deepEqual(pos(afterM, 'U'), [0, 0, 1]);
  assert.equal(afterM.cubies.find(c => c.id === 'U').stickers.F, 'white');
  assert.deepEqual(pos(afterM, 'UF'), [0, -1, 1]);
  assert.deepEqual(pos(afterM, 'UFR'), [1, 1, 1], 'M leaves the outer layers alone');
  // E follows D: the F centre goes to R.
  assert.deepEqual(pos(applyMoves(m, 'E'), 'F'), [1, 0, 0]);
  // S follows F: the U centre goes to R.
  assert.deepEqual(pos(applyMoves(m, 'S'), 'U'), [1, 0, 0]);
});

test('slice moves are consistent with face turns, wide turns and rotations', () => {
  const solved = createSolvedState();
  const scrambled = stateFromScramble("R U F' L2 D B' U2");
  for (const start of [solved, scrambled]) {
    for (const s of ['M', 'E', 'S']) {
      assert.deepEqual(applyMoves(start, [s, `${s}'`]), start, `${s} ${s}' = identity`);
      assert.deepEqual(applyMoves(start, [s, s, s, s]), start, `${s}4 = identity`);
      assert.deepEqual(applyMoves(start, `${s}2`), applyMoves(start, [s, s]), `${s}2 = ${s} ${s}`);
      assert.notDeepEqual(applyMoves(start, s), start);
    }
    // Wide = face + slice (WCA): Rw = R M', Lw = L M, Uw = U E', Dw = D E, Fw = F S, Bw = B S'.
    for (const [wide, parts] of [['Rw', "R M'"], ['Lw', 'L M'], ['Uw', "U E'"], ['Dw', 'D E'], ['Fw', 'F S'], ['Bw', "B S'"]]) {
      assert.deepEqual(applyMoves(start, wide), applyMoves(start, parts), `${wide} = ${parts}`);
    }
    // Slice = two outer turns + a whole-cube rotation: M = L' R x', E = U D' y', S = F' B z.
    assert.deepEqual(applyMoves(start, 'M'), rotateWhole(applyMoves(start, "L' R"), 'R', 3), "M = L' R x'");
    assert.deepEqual(applyMoves(start, 'E'), rotateWhole(applyMoves(start, "U D'"), 'U', 3), "E = U D' y'");
    assert.deepEqual(applyMoves(start, 'S'), rotateWhole(applyMoves(start, "F' B"), 'F', 1), "S = F' B z");
  }
  // Independent check of the rotation helper: x' brings F to the bottom, which is reorientState(_, 'F').
  assert.deepEqual(applyMoves(solved, 'M'), reorientState(applyMoves(solved, "L' R"), 'F'));
});
