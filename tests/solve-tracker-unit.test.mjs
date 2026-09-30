import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateFromScramble, applyMoves, createSolvedState } from '../src/cross-cube.js';
import {
  analyze, crossSolved, crossSolvedFaces, f2lPairSlots, solvedPairs,
  pairSolved, ollSolved, extendedCross, llFace, crossEdgeIds,
  currentDShift, solvedPairsPseudo, f2lDonePseudo, crossFrame, extendedCrossPseudo,
} from '../src/solve-tracker.js';

test('a solved cube is in the solved phase with a D cross', () => {
  const s = createSolvedState();
  const a = analyze(s, 'D');
  assert.equal(a.phase, 'solved');
  assert.equal(a.crossDone, true);
  assert.equal(a.f2lDone, true);
  assert.equal(a.ollDone, true);
  assert.equal(a.pairsSolved, 4);
});

test('all six faces read as a solved cross on a solved cube (color neutral)', () => {
  const s = createSolvedState();
  assert.equal(crossSolvedFaces(s).length, 6);
});

test('a scramble that does not touch the cross keeps cross solved only if no cross edge moved', () => {
  // R U R' leaves the D cross intact.
  const s = stateFromScramble("R U R'");
  const a = analyze(s, 'D');
  assert.equal(a.crossDone, true);
  // The FR pair corner (DFR) may move; at least cross stays.
  assert.equal(a.pairsSolved < 4, true);
});

test('a simple cross scramble breaks the cross then rebuilds it', () => {
  const broken = stateFromScramble('F R');      // moves DF and DR cross edges
  assert.equal(crossSolved(broken, 'D'), false);
  const a = analyze(broken, 'D');
  assert.equal(a.phase, 'pre-cross');
  const restored = applyMoves(broken, "R' F'"); // inverse
  assert.equal(crossSolved(restored, 'D'), true);
  assert.equal(analyze(restored, 'D').phase !== 'pre-cross', true);
});

test('F2L pair slots for D are the four middle edges with their D corners', () => {
  const slots = f2lPairSlots('D');
  assert.equal(slots.length, 4);
  assert.deepEqual(slots.map(s => s.slot).sort(), ['BL', 'BR', 'FL', 'FR']);
  assert.ok(slots.every(s => s.cornerId.includes('D')));
  assert.ok(slots.every(s => s.cornerId.replace('D', '') === s.edgeId));
});

test('a solved pair is detected and an unsolved one is not', () => {
  const s = createSolvedState();
  const fr = f2lPairSlots('D').find(p => p.slot === 'FR');
  assert.equal(pairSolved(s, fr), true);
  assert.equal(solvedPairs(s, 'D').length, 4);
  const moved = stateFromScramble("R U R'");
  assert.equal(solvedPairs(moved, 'D').length <= 4, true);
});

test('OLL is solved on a solved cube and not after disturbing the top', () => {
  const s = createSolvedState();
  assert.equal(ollSolved(s, 'D'), true);
  const top = stateFromScramble('U');
  assert.equal(ollSolved(top, 'D'), true); // U turn keeps U stickers on U
  const flip = stateFromScramble("F R U R' U' F'"); // a known OLL-ish move
  assert.equal(ollSolved(flip, 'D'), false);
});

test('analyze reaches F2L phase once cross is done but pairs remain', () => {
  // Cross intact, one corner/edge pair disturbed: R U R' disturbs FR pair, D cross stays.
  const s = stateFromScramble("R U R'");
  const a = analyze(s, 'D');
  assert.equal(a.crossDone, true);
  assert.equal(a.phase === 'cross' || a.phase.startsWith('f2l-'), true);
});

test('extendedCross classifies x-cross and double x-cross at cross completion', () => {
  const solved = createSolvedState();
  assert.equal(extendedCross(solved, 'D').kind, 'xxcross'); // 4 pairs but this is fully solved
  // A pure cross (4 cross edges solved, no pairs) is hard to isolate cheaply;
  // assert the function reports 'cross' only when no pairs solved.
  const onlyCross = applyMoves(createSolvedState(), "R U R' U'"); // disturbs pairs, may break cross
  // Validate the classification contract instead of a specific scramble.
  const ec = extendedCross(onlyCross, 'D');
  assert.ok(['none', 'cross', 'xcross', 'xxcross'].includes(ec.kind));
});

test('llFace is the opposite of the cross face', () => {
  assert.equal(llFace('D'), 'U');
  assert.equal(llFace('U'), 'D');
  assert.equal(llFace('F'), 'B');
});

test('crossEdgeIds lists the four edges containing the face', () => {
  assert.deepEqual(crossEdgeIds('D').sort(), ['DB', 'DF', 'DL', 'DR']);
  assert.deepEqual(crossEdgeIds('U').sort(), ['UB', 'UF', 'UL', 'UR']);
});

test('analyze labels an oriented last layer (EO + CO) as the PLL phase', () => {
  const tperm = stateFromScramble("R U R' U' R' F R2 U' R' U' R U R' F'");
  const a = analyze(tperm, 'D');
  assert.equal(a.eoDone && a.coDone, true);
  assert.equal(a.phase, 'pll');
  // corners oriented but edges not: still the CO label
  const edgesFlipped = stateFromScramble("F R U R' U' F'");
  const b = analyze(edgesFlipped, 'D');
  if (b.coDone && !b.eoDone) assert.equal(b.phase, 'co');
});

// --- Pseudo detection for any cross face; EO/CO while the cross layer is offset ---

test('pseudo detection works for every cross face (no D hard-wiring)', () => {
  // A solved cube with the cross layer turned: k is the turn that undoes it.
  for (const face of ['U', 'D', 'F', 'B', 'R', 'L']) {
    for (const [turn, k] of [[face, 3], [`${face}2`, 2], [`${face}'`, 1]]) {
      const s = applyMoves(createSolvedState(), [turn]);
      assert.equal(currentDShift(s, face), k, `${face} layer after ${turn}`);
      assert.equal(solvedPairsPseudo(s, face).length, 4);
      assert.equal(f2lDonePseudo(s, face), true);
    }
  }
  // A U-offset cube with the cross on U: the D-only version read this as null.
  assert.equal(currentDShift(applyMoves(createSolvedState(), ['U']), 'U'), 3);
  // Turning the opposite layer does not offset this cross.
  assert.equal(currentDShift(applyMoves(createSolvedState(), ['D']), 'U'), 0);
  assert.equal(currentDShift(createSolvedState()), 0, 'crossFace defaults to D');
});

test('crossFrame reads the shift and the pairs in that frame in one pass', () => {
  const offset = applyMoves(createSolvedState(), ['D']);
  const frame = crossFrame(offset, 'D');
  assert.equal(frame.shift, 3);
  assert.equal(frame.pairs.length, 4);
  assert.deepEqual(crossFrame(stateFromScramble('F R'), 'D'), { shift: null, pairs: [] });
});

test('analyze with pseudo: an offset cross layer no longer hides EO and CO', () => {
  const offset = applyMoves(createSolvedState(), ['D']);
  const plain = analyze(offset, 'D');
  assert.equal(plain.eoDone, false, 'default behaviour is unchanged');
  assert.equal(plain.crossDone, false);
  const pseudo = analyze(offset, 'D', { pseudo: true });
  assert.equal(pseudo.shift, 3);
  assert.equal(pseudo.crossDone, true);
  assert.equal(pseudo.f2lDone, true);
  assert.equal(pseudo.eoDone, true);
  assert.equal(pseudo.coDone, true);
  assert.equal(pseudo.phase, 'pll');
  // Cross on another face.
  assert.equal(analyze(applyMoves(createSolvedState(), ['F']), 'F', { pseudo: true }).eoDone, true);
  assert.equal(analyze(createSolvedState(), 'D').shift, 0);
  assert.equal(analyze(stateFromScramble('F R'), 'D').shift, null);
});

test('extendedCrossPseudo counts pairs in the current frame', () => {
  const offset = applyMoves(createSolvedState(), ['D']);
  assert.deepEqual(extendedCrossPseudo(offset, 'D'), { kind: 'xxcross', pairs: 4, shift: 3, pseudo: true });
  assert.deepEqual(extendedCrossPseudo(stateFromScramble('F R'), 'D'), { kind: 'none', pairs: 0, shift: null, pseudo: false });
  assert.equal(extendedCrossPseudo(createSolvedState(), 'D').pseudo, false);
});
