import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMoves, createSolvedState, sameCubeState } from '../src/cross-cube.js';
import { applyDemoMove, parseDemoHash, parseDemoPaste, serializeDemo, setupState } from '../src/demo/model.js';
import { buildDemoViewModel } from '../src/demo/view-model.js';
import { CASE_COLORS, caseDisplayState } from '../src/ui/cube/orientation.js';

test('published single and multipart demo links round-trip readable notation and author notes', () => {
  const single = parseDemoHash("#/demo?title=pair&setup=R%20U%20R%E2%80%B2&alg=U%E2%80%B2%20R%20U%20R%E2%80%B2&step1.moves=U'&step1.note=keep%20the%20edge%3B%20then%20match&step2.moves=R%20U%20R'&step2.note=insert&highlight=pair%3AFR&case=f2l/1&color=white%20top&future=x");
  assert.deepEqual(single.parts[0].setup, ['R', 'U', "R'"]);
  assert.equal(single.parts[0].steps[0].note, 'keep the edge; then match');
  assert.equal(single.parts[0].colorSetting, 'white top');
  const link = serializeDemo(single);
  assert.match(link, /^#\/demo\?title=pair/);
  assert.deepEqual(parseDemoHash(link), single);

  const lesson = parseDemoHash('#/demo?title=two%20cases&part1.title=first&part1.setup=R%20U&part1.alg=R%27%20U%27&part2.title=second&part2.setup=F%20R&part2.alg=R%27%20F%27');
  assert.equal(lesson.parts.length, 2);
  assert.equal(parseDemoHash(serializeDemo(lesson)).parts[1].title, 'second');
});

test('pasted links convert locally and raw labeled setup and alg open the same model', () => {
  const fromExternal = parseDemoPaste('Example: https://alg.cubing.net/?setup=R_U&alg=U%27_R%27&title=pair.');
  assert.deepEqual(fromExternal.parts[0].alg, ["U'", "R'"]);
  const raw = parseDemoPaste('setup: R U\nalg: R′ U′');
  assert.deepEqual(raw.parts[0].setup, ['R', 'U']);
  assert.deepEqual(raw.parts[0].alg, ["R'", "U'"]);
});

test('demo paste accepts local hashes, deployed CubeSight hosts, and unescaped prime notation', () => {
  const canonical = parseDemoPaste("#/demo?title=pair&alg=R%20U'%20R%27&color=fixed%3A%20red");
  assert.deepEqual(canonical.parts[0].alg, ['R', "U'", "R'"]);
  assert.equal(canonical.parts[0].colorSetting, 'fixed: red');
  const deployed = parseDemoPaste("https://learn.example.org/app/#/demo?title=pair&alg=R%20U'%20R%27");
  assert.deepEqual(deployed.parts[0].alg, ['R', "U'", "R'"]);
  const external = parseDemoPaste("https://alg.cubing.net/?setup=R_U&alg=R_U'&title=pair");
  assert.deepEqual(external.parts[0].alg, ['R', "U'"]);
  assert.throws(() => parseDemoPaste('https://notcubing.net/?alg=R'), /alg.cubing.net/);
  assert.throws(() => parseDemoPaste('#/demo?alg=R&color=purple'), /case color setting/);
});

test('move playback model applies whole-cube rotations and keeps physical moves reversible', () => {
  const solved = createSolvedState();
  const rotated = applyDemoMove(applyDemoMove(solved, 'x'), "x'");
  assert.equal(sameCubeState(rotated, solved), true);
  const moved = applyDemoMove(solved, 'R');
  assert.equal(sameCubeState(moved, solved), false);
  assert.equal(sameCubeState(applyDemoMove(moved, "R'"), solved), true);
  const wideAndSlices = ['Rw', 'r', "M'", 'E2', 'S'];
  const demoState = wideAndSlices.reduce((state, move) => applyDemoMove(state, move), solved);
  assert.equal(sameCubeState(demoState, applyMoves(solved, wideAndSlices)), true);
  for (const [rotation, inverse] of [['x', "x'"], ['y', "y'"], ['z', "z'"]]) {
    assert.equal(sameCubeState(applyDemoMove(applyDemoMove(solved, rotation), inverse), createSolvedState()), true);
  }
});

test('every published case-colour setting loads and all fixed face colours orient to the top', () => {
  for (const colorSetting of CASE_COLORS) {
    const link = serializeDemo(parseDemoHash(`#/demo?alg=R&color=${encodeURIComponent(colorSetting)}`));
    const parsed = parseDemoHash(link).parts[0];
    assert.equal(parsed.colorSetting, colorSetting);
    const display = caseDisplayState(createSolvedState(), colorSetting, 'stable-demo-seed');
    if (colorSetting.startsWith('fixed: ')) assert.equal(display.topColor, colorSetting.slice('fixed: '.length));
    else assert.ok(display.allowedColors.includes(display.topColor));
  }
});

test('F9 demo snapshots contain committed lesson state and treat the format page as zero-canvas', () => {
  const hash = '#/demo?title=Lesson&part1.title=first&part1.setup=R%20U&part1.alg=F%20R&part1.color=any%20colour&part2.title=second&part2.setup=F&part2.alg=U';
  const snapshot = buildDemoViewModel({ hash, partIndex: 0, moveIndex: 1, playing: true });
  assert.equal(snapshot.kind, 'demo');
  assert.equal(snapshot.title, 'Lesson');
  assert.equal(snapshot.part.title, 'first');
  assert.equal(snapshot.partIndex, 0);
  assert.equal(snapshot.partCount, 2);
  assert.equal(snapshot.moveIndex, 1);
  assert.equal(snapshot.playing, true);
  assert.deepEqual(snapshot.displayState, caseDisplayState(applyDemoMove(setupState(['R', 'U']), 'F'), 'any colour', 'Lesson:1:first').state);
  assert.doesNotMatch(JSON.stringify(snapshot), /outerHTML|innerHTML|canvas/);
  const second = buildDemoViewModel({ hash, partIndex: 1 });
  assert.equal(second.part.title, 'second');
  assert.equal(second.moveIndex, 0);
  const format = buildDemoViewModel({ hash: '#/demo/format' });
  assert.equal(format.kind, 'format');
  assert.equal(Object.hasOwn(format, 'displayState'), false);
});

test('invalid steps cannot silently mislabel an alg and link limits are enforced', () => {
  assert.throws(() => parseDemoHash('#/demo?alg=R%20U&steps=R%3Afirst'), /cover the alg/);
  assert.throws(() => parseDemoHash(`#/demo?${'x'.repeat(8001)}`), /limited to 8000/);
  assert.throws(() => parseDemoHash('#/demo?alg=Q'), /Unsupported move/);
  assert.equal(parseDemoHash('#/demo?part99.unrelated=x&alg=R').parts.length, 1);
  assert.throws(() => parseDemoHash('#/demo?alg=R&highlight=UUU'), /real cubie names/);
});
