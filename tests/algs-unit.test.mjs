import test from 'node:test';
import assert from 'node:assert/strict';
import { cube3x3x3 } from 'cubing/puzzles';
import { parseAlg, invertAlg, normalizeAlg, algorithmMetrics } from '../src/algs/notation.js';
import { CASES, SEED_ALGS, getCase, getCases, getSeedAlg, canonicalCasePath } from '../src/algs/seed/cases.js';
import { verifyAlgorithm } from '../src/algs/verify.js';
import { matchAlgorithm } from '../src/algs/drill/matcher.js';
import { createAlgDrillSession } from '../src/algs/drill/session.js';
import { createAlgDatabase } from '../src/algs/db.js';
import { itemKey } from '../src/learning.js';
import { caseSetupState, f2lStateIntact, matchesCaseSetup } from '../src/algs/drill/cube.js';
import { applyMoves, createSolvedState, FACE_COLORS } from '../src/cross-cube.js';
import { crossSolved, solvedPairs } from '../src/solve-tracker.js';
import { createVirtualRepaint } from '../src/algs/drill/repaint.js';
import { physicalModelTokens, tokenizeReconstruction } from '../src/review/import-parser.js';

test('algorithm notation flattens groups and normalizes double-turn suffixes', () => {
  assert.deepEqual(parseAlg("(R U R' U')2 R3 U2'"), ['R', 'U', "R'", "U'", 'R', 'U', "R'", "U'", "R'", 'U2']);
  assert.equal(normalizeAlg("R U R' U' R R'"), "R U R' U'");
  assert.deepEqual(invertAlg('R U2'), ['U2', "R'"]);
  assert.deepEqual(parseAlg('R4 U'), ['U']);
  assert.equal(algorithmMetrics('x Rw U2 M').stm, 3, 'cube rotations are not turns and wide/slice turns count');
});

test('the curated offline bundle covers every standard PLL and OLL case with two credited algorithms', () => {
  assert.equal(getCases('pll').length, 21);
  assert.equal(getCases('oll').length, 57);
  assert.equal(CASES.length, 217);
  assert.equal(SEED_ALGS.length, 541);
  assert.ok(CASES.filter(row => ['oll', 'pll'].includes(row.set)).every(row => row.algs.length >= 2 && row.algs.every(alg => alg.verified && alg.credit && alg.source?.url)));
  assert.ok(getCases('f2l').every(row => row.algs.length >= 1 && row.algs.every(alg => alg.verified && alg.credit && alg.source?.url)));
  assert.ok(getCases('oll2').every(row => row.algs.length >= 1 && row.algs.every(alg => alg.credit && alg.source?.url)));
  assert.equal(getCase('oll/21').number, 21);
  assert.equal(getCase('pll/Jb').id, 'pll/Jb');
  assert.equal(getSeedAlg('s.oll.21.1').caseId, 'oll/21');
  assert.equal(getCases('f2l').length, 123);
  assert.equal(getCases('f2l').filter(row => !row.variantOf).length, 41);
  assert.equal(getCases('f2l').filter(row => row.variantOf).length, 82);
  for (const slot of ['FR', 'BR', 'BL']) assert.equal(getCases('f2l').filter(row => row.targetPair === slot).length, 41);
  assert.equal(canonicalCasePath(getCase('f2l/1-br')), '#/algs/f2l/1-br');
  assert.equal(getCases('oll2').length, 16);
  assert.ok(getCases('oll2').every(row => row.stage && row.goal));
  assert.equal(canonicalCasePath(getCase('oll/21')), '#/algs/oll/21');
});

test('the complete bundled algorithm metadata contains no scraped citation artifacts', () => {
  const artifacts = [];
  const collect = (value, path) => {
    if (typeof value === 'string' && /\uE200|\uE201|\[cite|†/iu.test(value)) artifacts.push(path);
    else if (Array.isArray(value)) value.forEach((item, index) => collect(item, `${path}[${index}]`));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) collect(item, `${path}.${key}`);
  };
  collect(CASES, 'CASES');
  assert.deepEqual(artifacts, []);
});

test('F2L integrity requires a solved D cross as well as four solved pairs', () => {
  const state = createSolvedState();
  const df = state.cubies.find(cubie => cubie.id === 'DF');
  df.stickers = { D: FACE_COLORS.F, F: FACE_COLORS.D };
  assert.equal(solvedPairs(state, 'D').length, 4, 'the four side pairs remain solved');
  assert.equal(crossSolved(state, 'D'), false, 'the flipped cross edge is unsolved');
  assert.equal(f2lStateIntact(state), false, 'F2L integrity must include the cross');
});

test('all bundled algorithms independently solve their canonical case and preserve F2L', async () => {
  const kpuzzle = await cube3x3x3.kpuzzle();
  const bad = [];
  for (const row of CASES) for (const alg of row.algs) {
    const result = await verifyAlgorithm(alg.moves, row, { kpuzzle });
    if (!result.verified) bad.push(`${alg.id}: ${result.reason}`);
  }
  assert.deepEqual(bad, []);
});

test('all virtual case setups match the verified reference and keep the four F2L pairs solved', () => {
  for (const row of CASES.filter(item => item.set !== 'f2l')) {
    const state = caseSetupState(row);
    assert.equal(matchesCaseSetup(state, row), true, `${row.id} matches its setup`);
    assert.equal(f2lStateIntact(state), true, `${row.id} setup preserves F2L`);
    assert.ok(row.algs.every(alg => matchAlgorithm(alg.moves, [alg]).status === 'complete'), `${row.id} variants normalize for live matching`);
  }
  for (const row of getCases('f2l')) {
    const state = caseSetupState(row);
    assert.equal(matchesCaseSetup(state, row), true, `${row.id} matches its setup`);
    assert.equal(solvedPairs(state, 'D').length, 3, `${row.id} starts with three solved pairs`);
  }
  assert.equal(f2lStateIntact(applyMoves(caseSetupState(getCase('oll/1')), ['R'])), false, 'a turn that breaks F2L is rejected');
});

test('smart-cube drill replays every physical turn and checks F2L only after the full algorithm', async () => {
  for (const row of CASES) for (const alg of row.algs) {
    const moves = tokenizeReconstruction(alg.moves).tokens.map(token => `${token.kind === 'wide' ? token.face.toLowerCase() : token.face}${token.amount === 2 ? '2' : token.amount === 3 ? "'" : ''}`);
    let cube = caseSetupState(row), prefix = [];
    const session = createAlgDrillSession({ caseData: row, algs: [alg], f2lIntact: () => f2lStateIntact(cube) });
    session.start({ startedAt: 0 });
    let result, cleanCompletions = 0;
    for (let i = 0; i < moves.length; i++) {
      prefix.push(moves[i]);
      const physical = physicalModelTokens(tokenizeReconstruction(prefix.join(' ')).tokens);
      cube = applyMoves(caseSetupState(row), physical);
      result = await session.turn(moves[i], i + 1);
      assert.notEqual(result.status, 'f2l-broken', `${row.id}/${alg.id} must not fail on an intermediate prefix`);
      if (result.attempt) {
        assert.equal(result.attempt.clean, true, `${row.id}/${alg.id} recognized execution ends with F2L intact`);
        cleanCompletions++;
      }
    }
    assert.ok(cleanCompletions > 0, `${row.id}/${alg.id} is recognized during the physical replay`);
    assert.equal(f2lStateIntact(cube), true, `${row.id}/${alg.id} final state preserves F2L`);
  }
});

test('two consecutive virtual repaint rounds keep the real cube state and preserve F2L', async () => {
  const first = getCase('oll/45'), second = getCase('oll/46');
  let physical = caseSetupState(first);
  const repaint = createVirtualRepaint(first);
  for (const row of [first, second]) {
    const beforeRepaint = physical;
    if (row.id !== repaint.caseId) repaint.repaint(row);
    assert.equal(physical, beforeRepaint, 'repaint changes only the virtual case view');
    const alg = row.algs[0];
    const tokens = tokenizeReconstruction(alg.moves).tokens.map(token => `${token.kind === 'wide' ? token.face.toLowerCase() : token.face}${token.amount === 2 ? '2' : token.amount === 3 ? "'" : ''}`);
    const session = createAlgDrillSession({ caseData: row, algs: [alg], f2lIntact: () => repaint.f2lIntact(physical) });
    session.start({ startedAt: 0 });
    let completions = 0;
    for (let i = 0; i < tokens.length; i++) {
      physical = applyMoves(physical, physicalModelTokens(tokenizeReconstruction(tokens[i]).tokens));
      repaint.turn(tokens[i]);
      const result = await session.turn(tokens[i], i + 1);
      if (result.attempt) { assert.equal(result.attempt.clean, true); completions++; }
    }
    assert.ok(completions > 0, `${row.id} completes through the virtual case stream`);
    assert.equal(f2lStateIntact(physical), true, `${row.id} did not disturb physical F2L`);
  }
});

test('virtual repaint rejects F2L insertion cases and remains available for last-layer stages', () => {
  assert.throws(() => createVirtualRepaint(getCase('f2l/1')), /last-layer cases only/);
  assert.doesNotThrow(() => createVirtualRepaint(getCase('oll/1')));
  assert.doesNotThrow(() => createVirtualRepaint(getCase('oll2/eo-line')));
});

test('matcher accepts AUF and normalized double-turn forms and rejects F2L damage', () => {
  const algs = [{ id: 'example', moves: "R U R' U' R2", verified: true }];
  assert.equal(matchAlgorithm("U2 R U R' U' R2' U", algs).status, 'complete');
  assert.equal(matchAlgorithm("R U R' U' R2", algs, { intact: false }).status, 'f2l-broken');
  assert.equal(matchAlgorithm("R U F", algs).status, 'mismatch');
});

test('drill records per-move timing, PB, self-timed attempts and cross-alg due selection', async () => {
  const row = getCase('oll/45');
  const seed = row.algs[0];
  const store = [];
  const memoryDb = { recordAttempt: async value => store.push(value), attemptsFor: async id => store.filter(a => a.algId === id) };
  const learning = { version: 1, trial: 0, recentKeys: [], items: {} };
  const session = createAlgDrillSession({ caseData: row, db: memoryDb, learningData: learning, saveLearning: () => {} });
  session.start({ startedAt: 100 });
  const moves = seed.moves.split(' ');
  let result;
  for (let i = 0; i < moves.length; i++) result = await session.turn(moves[i], 100 + i * 100);
  assert.equal(result.attempt.clean, true);
  assert.equal(result.metrics.executionMs, (moves.length - 1) * 100);
  assert.equal(result.pbMs, result.metrics.executionMs);
  assert.ok(result.metrics.tps > 0);
  assert.equal(store.length, 1);
  assert.ok(learning.items[itemKey('alg', seed.id)].correct > 0);

  const self = createAlgDrillSession({ caseData: row, mode: 'self', now: () => 0 });
  self.start({ startedAt: 0 });
  const selfResult = await self.completeSelf(1600);
  assert.equal(selfResult.attempt.selfTimed, true);
  assert.equal(selfResult.attempt.executionMs, 1600);

  const other = getCase('pll/Jb');
  const mixed = createAlgDrillSession({ caseData: row, cases: [row, other], learningData: { version: 1, trial: 0, recentKeys: [], items: {} } });
  const picked = mixed.chooseNext({ cases: [row, other], random: () => 0 });
  assert.ok(picked && [row.id, other.id].includes(picked.caseId), 'unseen picked algorithms are interleaved across the set');
});

test('usage only counts explicitly imported reconstructions; personal practice stays separate', async () => {
  const sample = getCase('pll/Jb').algs[0];
  const db = createAlgDatabase({ indexedDB: null, seedCases: CASES, seedAlgs: SEED_ALGS });
  await db.ready();
  assert.equal((await db.listAlgs('pll/Jb')).length, 2);
  await db.setPick('pll/Jb', sample.id, 50);
  assert.equal((await db.getPick('pll/Jb')).algId, sample.id);
  await db.recordAttempt({ caseId: 'pll/Jb', algId: sample.id, clean: true, executionMs: 500 });
  await db.addReconstruction({ caseId: 'pll/Jb', algId: sample.id, cuber: 'Imported solver', source: 'import' });
  assert.equal((await db.usageFor('pll/Jb'))[0].total, 1);
  const exported = await db.exportPersonalData();
  assert.equal(exported.attempts.length, 1);
  assert.equal(exported.recons.length, 1);
});

test('personal backup merge preserves verified seed rows and restores picks, progress and imported usage', async () => {
  const row = getCase('oll/3'), alg = row.algs[0];
  const db = createAlgDatabase({ indexedDB: null, seedCases: CASES, seedAlgs: SEED_ALGS });
  await db.setPick(row.id, alg.id, 10);
  await db.recordAttempt({ caseId: row.id, algId: alg.id, clean: true, executionMs: 900, createdAt: 20 });
  await db.addReconstruction({ caseId: row.id, algId: alg.id, cuber: 'solver' });
  const payload = await db.exportPersonalData();
  const restored = createAlgDatabase({ indexedDB: null, seedCases: CASES, seedAlgs: SEED_ALGS });
  const counts = await restored.importPersonalData(payload);
  assert.ok(counts.picks >= 1 && counts.attempts >= 1 && counts.recons >= 1);
  assert.equal((await restored.listAlgs(row.id)).length, 2, 'bundle algorithms are not duplicated or replaced');
  assert.equal((await restored.getPick(row.id)).algId, alg.id);
  assert.equal((await restored.progressFor(row.id)).pbMs, 900);
  assert.equal((await restored.usageFor(row.id))[0].total, 1);
});

test('personal imports cannot forge the verified flag on a wrong algorithm', async () => {
  const row = getCase('pll/Jb');
  const db = createAlgDatabase({ indexedDB: null, seedCases: CASES, seedAlgs: SEED_ALGS });
  const counts = await db.importPersonalData({ algs: [{ id: 'u.bad', caseId: row.id, moves: 'R U', verified: true, seed: false }], picks: [{ id: row.id, caseId: row.id, algId: 'u.bad', since: 1 }] });
  const personal = await db.getAlg('u.bad');
  assert.equal(personal.verified, false);
  assert.equal(await db.getPick(row.id), null, 'invalid personal algorithm is not selected');
  assert.equal(counts.picks, 0);
});

test('personal imports cannot shadow seed IDs or select an algorithm from another case', async () => {
  const row = getCase('pll/Jb'), other = getCase('oll/1');
  const db = createAlgDatabase({ indexedDB: null, seedCases: CASES, seedAlgs: SEED_ALGS });
  await assert.rejects(db.addAlg({ id: 's.pll.Jb.1', caseId: row.id, moves: row.algs[0].moves }), /bundled algorithm/);
  const counts = await db.importPersonalData({
    algs: [{ id: 'u.valid', caseId: row.id, moves: row.algs[0].moves, seed: false }],
    picks: [{ id: row.id, caseId: row.id, algId: 's.oll.1.1', since: 1 }, { id: row.id, caseId: row.id, algId: 'u.valid', since: 2 }],
    sources: [{ id: 's:u.valid', algId: 'u.valid', source: { url: 'javascript:alert(1)' } }],
  });
  assert.equal(counts.picks, 1);
  assert.equal(counts.sources, 0);
  assert.equal((await db.getPick(row.id)).algId, 'u.valid');
  assert.notEqual(other.id, row.id);
});


test('all F2L slot variants preserve the cross and other slots in the independent cubing model', async () => {
  const cube = await cube3x3x3.kpuzzle();
  const pairIndices = { FR: [4, 8], FL: [5, 9], BL: [6, 11], BR: [7, 10] };
  const intact = (orbit, indices) => indices.every(i => orbit.permutation[i] === i && orbit.orientationDelta[i] === 0);
  const canonical = moves => normalizeAlg(moves);
  const { canonicalizeReconstruction } = await import('../src/review/import-parser.js');
  for (const row of getCases('f2l')) {
    const before = cube.algToTransformation(row.setup).transformationData;
    assert.ok(intact(before.EDGES, [4, 5, 6, 7]), `${row.id} begins with its cross solved`);
    for (const slot of row.preservedPairs) {
      const [corner, edge] = pairIndices[slot];
      assert.ok(intact(before.CORNERS, [corner]) && intact(before.EDGES, [edge]), `${row.id} preserves ${slot}`);
    }
    for (const alg of row.algs) {
      const fixed = canonicalizeReconstruction(tokenizeReconstruction(canonical(alg.moves)).tokens).moves.map(move => move.move).join(' ');
      const after = cube.algToTransformation(`${row.setup} ${fixed}`).transformationData;
      assert.ok(intact(after.CORNERS, [4, 5, 6, 7]) && intact(after.EDGES, [4, 5, 6, 7, 8, 9, 10, 11]), `${alg.id} completes all four F2L slots`);
    }
  }
});
