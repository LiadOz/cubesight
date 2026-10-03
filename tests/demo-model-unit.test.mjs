import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolvedState, sameCubeState } from '../src/cross-cube.js';
import { applyDemoMove, parseDemoHash, parseDemoPaste, serializeDemo } from '../src/demo/model.js';

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
});

test('invalid steps cannot silently mislabel an alg and link limits are enforced', () => {
  assert.throws(() => parseDemoHash('#/demo?alg=R%20U&steps=R%3Afirst'), /cover the alg/);
  assert.throws(() => parseDemoHash(`#/demo?${'x'.repeat(8001)}`), /limited to 8000/);
  assert.throws(() => parseDemoHash('#/demo?alg=Q'), /Unsupported move/);
  assert.equal(parseDemoHash('#/demo?part99.unrelated=x&alg=R').parts.length, 1);
  assert.throws(() => parseDemoHash('#/demo?alg=R&highlight=UUU'), /real cubie names/);
});
