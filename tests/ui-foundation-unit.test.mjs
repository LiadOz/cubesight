import test from 'node:test';
import assert from 'node:assert/strict';
import { arcPath, clusterMarkers, miniGlyphSize, placeLabels, polar, ringLayout } from '../src/ui/orbit/geometry.js';
import { applyMoves, createSolvedState, stateFromScramble } from '../src/cross-cube.js';
import { caseDisplayState, normalizeCaseColorSetting, orientCaseState } from '../src/ui/cube/orientation.js';
import { resolveSlotPieces } from '../src/ui/cube/slots.js';

test('Orbit distributes weighted segments and supports direction and section gaps', () => {
  const segments = [{ key: 'a', weight: 3 }, { key: 'b', weight: 1 }, { key: 'c', weight: 2 }];
  const clockwise = ringLayout(segments, { gapDeg: 2, startDeg: 10, sweepDeg: 300, sections: [{ start: 2 }] });
  assert.ok(clockwise[0].to - clockwise[0].from > clockwise[1].to - clockwise[1].from);
  assert.ok(clockwise[2].from > clockwise[1].to);
  const reverse = ringLayout(segments, { direction: 'counterclockwise' });
  assert.ok(reverse[0].to < reverse[0].from);
  assert.match(arcPath(0, 0, 10, 0, 360), /A 10 10 0 1 1/);
  assert.deepEqual(polar(0, 0, 10, 0), { x: 0, y: -10 });
});

test('Orbit labels remain in bounds and avoid collisions across dense realistic move labels', () => {
  for (const viewport of [{ cx: 640, cy: 360, radius: 220, top: 30, bottom: 690 }, { cx: 195, cy: 280, radius: 142, top: 25, bottom: 535 }]) {
    const anchors = Array.from({ length: 28 }, (_, index) => ({ key: `m${index}`, angle: index * 360 / 28, width: 88, height: 18, rank: index }));
    const labels = placeLabels(anchors, { ...viewport, offset: 26, minGap: 22 });
    assert.equal(labels.length, anchors.length);
    for (const label of labels) assert.ok(label.y >= viewport.top - 0.01 && label.y <= viewport.bottom + 0.01);
    for (const side of ['left', 'right', 'center-top', 'center-bottom']) {
      const rows = labels.filter(label => label.side === side).sort((a, b) => a.y - b.y);
      for (let index = 1; index < rows.length; index++) assert.ok(rows[index].y - rows[index - 1].y >= 17.9);
    }
    const boxes = labels.map(label => {
      const width = 88, height = 18;
      const left = label.anchor === 'start' ? label.x : label.anchor === 'end' ? label.x - width : label.x - width / 2;
      return { ...label, left, right: left + width, top: label.y - height / 2, bottom: label.y + height / 2 };
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      assert.equal(overlaps, false, `labels ${a.key} and ${b.key} overlap`);
    }
    const long = placeLabels([{ key: 'long', angle: 90, width: 220, height: 24 }], { ...viewport, top: 24, bottom: 536 });
    assert.ok(long[0].x >= 0 && long[0].x <= 560);
  }
  const crowdedFacts = placeLabels(Array.from({ length: 12 }, (_, index) => ({
    key: `fact-${index}`, angle: 90, width: 175, height: 52, rank: index === 0 ? 20 : 0,
  })), { cx: 280, cy: 280, radius: 190, offset: 64, minGap: 54, top: 30, bottom: 530 });
  const visibleFacts = crowdedFacts.filter(label => !label.hidden);
  assert.ok(visibleFacts.length > 1);
  assert.equal(visibleFacts[0].key, 'fact-0', 'the highest importance fact gets the first available position');
  for (let i = 0; i < visibleFacts.length; i++) for (let j = i + 1; j < visibleFacts.length; j++) {
    const rect = label => ({ left: label.anchor === 'start' ? label.x : label.x - 175, right: label.anchor === 'start' ? label.x + 175 : label.x, top: label.y - 26, bottom: label.y + 26 });
    const a = rect(visibleFacts[i]), b = rect(visibleFacts[j]);
    assert.ok(a.right <= b.left || b.right <= a.left || a.bottom + 2 <= b.top || b.bottom + 2 <= a.top, 'visible three-line labels do not overlap');
  }
});

test('Orbit marker clustering handles crowded markers and the zero-degree seam', () => {
  const clustered = clusterMarkers([{ key: 'north-a', angle: 358 }, { key: 'north-b', angle: 1 }, ...Array.from({ length: 12 }, (_, index) => ({ key: `crowded-${index}`, angle: 90 + index * 0.2 }))], 5);
  assert.equal(clustered[0].count, 2);
  assert.ok(clustered.some(cluster => cluster.count === 12));
  assert.equal(new Set(clustered.flatMap(cluster => cluster.items.map(marker => marker.key))).size, 14);
  assert.equal(miniGlyphSize(8), 17);
  assert.equal(miniGlyphSize(200), 48);
});

test('case orientations preserve source state and enforce requested center colors', () => {
  const source = stateFromScramble('R U F2 L D B2');
  const before = JSON.stringify(source);
  for (const [setting, allowed] of [['yellow top', ['yellow']], ['white top', ['white']], ['yellow or white', ['yellow', 'white']], ['any colour', ['yellow','white','green','blue','red','orange']]]) {
    const result = caseDisplayState(source, setting, 'case-12');
    const top = result.state.cubies.flatMap(cubie => Object.entries(cubie.stickers).filter(([face]) => face === 'U').map(([, color]) => color));
    assert.ok(top.includes(result.topColor));
    assert.ok(allowed.includes(result.topColor));
    assert.deepEqual([...result.allowedColors].sort(), [...allowed].sort());
  }
  for (const color of ['yellow', 'white', 'green', 'blue', 'red', 'orange']) {
    const state = orientCaseState(source, color);
    assert.ok(state.cubies.some(cubie => cubie.position[1] === 1 && cubie.stickers.U === color));
    assert.equal(state.cubies.length, source.cubies.length);
    assert.deepEqual(state.cubies.map(cubie => [cubie.id, cubie.position, Object.keys(cubie.stickers)]), source.cubies.map(cubie => [cubie.id, cubie.position, Object.keys(cubie.stickers)]));
    const colorMap = new Map(), reverseMap = new Map();
    for (const [index, cubie] of source.cubies.entries()) for (const face of Object.keys(cubie.stickers)) {
      const beforeColor = cubie.stickers[face], afterColor = state.cubies[index].stickers[face];
      assert.ok(!colorMap.has(beforeColor) || colorMap.get(beforeColor) === afterColor);
      assert.ok(!reverseMap.has(afterColor) || reverseMap.get(afterColor) === beforeColor);
      colorMap.set(beforeColor, afterColor); reverseMap.set(afterColor, beforeColor);
    }
  }
  let frame = stateFromScramble("R U R' U' F R U R' U' F'");
  const chosenTop = caseDisplayState(frame, 'any colour', 'case-12').topColor;
  for (const move of ['U', 'R', "U'", "R'", 'F2', 'D', 'L', "D'"]) {
    frame = applyMoves(frame, [move]);
    assert.equal(caseDisplayState(frame, 'any colour', 'case-12').topColor, chosenTop);
  }
  assert.equal(JSON.stringify(source), before);
  assert.equal(normalizeCaseColorSetting('fixed: Red'), 'fixed: red');
});

test('OLL and PLL case stickers stay on the same upper layer for every top color', () => {
  const cases = [
    { name: 'OLL Sune', state: stateFromScramble("R U R' U R U2 R'") },
    { name: 'PLL T permutation', state: stateFromScramble("R U R' U' R' F R2 U' R' U' R U R' F'") },
  ];
  const upperLayer = state => state.cubies.filter(cubie => cubie.position[1] === 1)
    .sort((a, b) => a.position[2] - b.position[2] || a.position[0] - b.position[0])
    .map(cubie => ({ id: cubie.id, position: cubie.position, stickers: Object.fromEntries(Object.entries(cubie.stickers).sort(([a], [b]) => a.localeCompare(b))) }));
  for (const { name, state } of cases) {
    const sourceLayer = upperLayer(state);
    for (const color of ['yellow', 'white', 'green', 'blue', 'red', 'orange']) {
      const display = upperLayer(orientCaseState(state, color));
      assert.equal(display.length, 9, `${name} keeps a complete U layer`);
      assert.deepEqual(display.map(cubie => [cubie.id, cubie.position]), sourceLayer.map(cubie => [cubie.id, cubie.position]), `${name} keeps each cubie at its case position with ${color} on top`);
      const remap = new Map();
      for (let index = 0; index < sourceLayer.length; index++) {
        for (const [face, sticker] of Object.entries(sourceLayer[index].stickers)) {
          const target = display[index].stickers[face];
          assert.ok(!remap.has(sticker) || remap.get(sticker) === target, `${name} keeps a uniform color mapping`);
          remap.set(sticker, target);
        }
      }
      const expected = sourceLayer.map(cubie => Object.fromEntries(Object.entries(cubie.stickers).map(([face, sticker]) => [face, remap.get(sticker)])));
      assert.deepEqual(display.map(cubie => cubie.stickers), expected, `${name} sticker topology is unchanged with ${color} on top`);
    }
  }
});

test('Cube highlight resolves cross, pair and exact piece ids to real cubies', () => {
  const state = createSolvedState();
  const cross = resolveSlotPieces(state, 'cross');
  assert.equal(cross.length, 4);
  assert.ok(cross.every(id => id.length === 2 && id.includes('D')));
  const pair = resolveSlotPieces(state, 'pair:FR');
  // An F2L pair is one corner and one edge (cross on D), not every piece that touches F and R.
  assert.deepEqual([...pair].sort(), ['DFR', 'FR']);
  assert.deepEqual(resolveSlotPieces(state, { type: 'pair', cornerId: 'UFR', edgeId: 'FR' }), ['UFR', 'FR']);
  assert.deepEqual(resolveSlotPieces(state, 'UFR'), ['UFR']);
  assert.deepEqual(resolveSlotPieces(state, { type: 'cross', face: 'U' }).filter(id => id.includes('U')).length, 4);
});
