import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, f2l_case } from '../src/wasm/cubesight_core.js';
import { createF2LCase, createF2LCaseFromWasm, createPseudoScanCase, deduce, COLOR_HEX } from '../src/f2l-logic.js';

initSync({ module: readFileSync(new URL('../src/wasm/cubesight_core_bg.wasm', import.meta.url)) });
const faceColors = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' };
const cycles = ['URF', 'UBR', 'ULB', 'UFL', 'DFR', 'DLF', 'DBL', 'DRB'];
const positions = ['UFR', 'UBR', 'UBL', 'UFL', 'DFR', 'DFL', 'DBL', 'DBR'];
const identities = cycles.map((cycle) => ({ kind: 'corner', key: cycle, colors: [...cycle].map((face) => faceColors[face]) }));

test('deduction uses oriented sticker order, not an identity shortcut', () => {
  const records = positions.map((piece) => ({ piece, kind: 'corner', identityKey: 'deliberately-wrong', faceColors: {} }));
  records[0].faceColors = { U: 'white', R: 'red' };
  const known = deduce(records, identities);
  assert.equal(known.get('UFR'), 'URF');
  assert.equal(known.size, 1);
});

test('ambiguous single-sticker corners are not assigned their secret identity', () => {
  const records = positions.map((piece) => ({ piece, kind: 'corner', identityKey: 'URF', faceColors: {} }));
  records[0].faceColors = { U: 'white' };
  assert.equal(deduce(records, identities).size, 0);
});

test('elimination identifies the last unknown corner from the other seven', () => {
  const records = positions.map((piece, index) => ({ piece, kind: 'corner', faceColors: index === 7 ? {} : Object.fromEntries([...cycles[index]].map((face) => [face, faceColors[face]])) }));
  assert.equal(deduce(records, identities).get('DBR'), 'DRB');
});

test('WASM and fallback states preserve colors, cross, and physical corner chirality in every orientation', () => {
  for (const [bottomFace, bottom] of Object.entries(faceColors)) {
    for (let seed = 1; seed <= 50; seed++) {
      const raw = JSON.parse(f2l_case(BigInt(seed), bottomFace));
      assert.equal(raw.corner_twist_sum, 0);
      assert.equal(raw.edge_flip_sum, 0);
      assert.equal(raw.corner_permutation_parity, raw.edge_permutation_parity);
      for (const current of [createF2LCaseFromWasm(raw, seed, bottom), createF2LCase(seed, bottom)]) {
        assert.equal(current.bottomColor, bottom);
        const all = [...Object.values(current.palette), ...Object.values(current.cornerStickers), ...Object.values(current.edgeStickers)];
        assert.equal(all.length, 54);
        for (const hex of Object.values(COLOR_HEX)) assert.equal(all.filter((color) => color === hex).length, 9);
        for (const side of ['F', 'R', 'B', 'L']) {
          assert.equal(current.edgeStickers[`D:D${side}`], current.palette.D);
          assert.equal(current.edgeStickers[`${side}:D${side}`], current.palette[side]);
        }
        for (let i = 0; i < positions.length; i++) {
          const colors = [...cycles[i]].map((face) => current.cornerStickers[`${face}:${positions[i]}`]);
          assert.ok(identities.some((identity) => [0, 1, 2].some((twist) => colors.every((color, n) => color === COLOR_HEX[identity.colors[(n + twist) % 3]]))));
        }
        for (const pair of current.targetPairIds) {
          const members = Object.values(current.pairByPiece).filter((item) => item.pairId === pair);
          assert.deepEqual(members.map((item) => item.type).sort(), ['corner', 'edge']);
          const entries = Object.entries(current.pairByPiece).filter(([, item]) => item.pairId === pair);
          const solved = entries.every(([piece, item]) => [...piece].every((face) => (item.type === 'corner' ? current.cornerStickers : current.edgeStickers)[`${face}:${piece}`] === current.palette[face]));
          assert.equal(solved, false, 'Already solved pairs must not be training targets');
        }
      }
    }
  }
});

test('all visible non-cross pieces remain selectable, including distractors', () => {
  const current = createF2LCase(17);
  assert.equal(current.selectablePieces.length, 16);
  assert.equal(Object.keys(current.pieceByPiece).length, 16);
  assert.ok(Object.values(current.pieceByPiece).some((item) => item.pairId === null));
  assert.ok(Object.values(current.pieceByPiece).every((item) => item.type === 'corner' || item.type === 'edge'));
});

test('pseudo scan rotates the real D-layer stickers and maps corners to shifted-slot edges', () => {
  const base = createF2LCase(17);
  for (const turns of [1, 2, 3]) {
    const pseudo = createPseudoScanCase(base, turns);
    if (turns === 1) assert.equal(pseudo.cornerStickers['D:DBR'], base.cornerStickers['D:DFR']);
    assert.equal(Object.keys(pseudo.cornerStickers).length, 24);
    assert.equal(Object.keys(pseudo.edgeStickers).length, 24);
    assert.deepEqual(Object.values(pseudo.pairOptions).length, pseudo.targetPairIds.length);
    for (const [id, option] of Object.entries(pseudo.pairOptions)) {
      const [cornerId, edgeId] = id.split('>');
      assert.notEqual(cornerId, edgeId);
      assert.equal(pseudo.pairByPiece[option.cornerPiece].pairId, cornerId);
      assert.equal(pseudo.pairByPiece[option.edgePiece].pairId, edgeId);
    }
    const restored = createPseudoScanCase(pseudo, 4 - turns);
    assert.deepEqual(restored.cornerStickers, base.cornerStickers);
    assert.deepEqual(restored.edgeStickers, base.edgeStickers);
  }
});
