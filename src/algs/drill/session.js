import { itemKey, review, chooseDue, medianTime } from '../../learning.js';
import { matchAlgorithm, normalizeExecution } from './matcher.js';
import { parseAlg } from '../notation.js';
import { attemptMetrics, personalBest } from './metrics.js';

const moveText = value => typeof value === 'string' ? value : value?.move ?? value?.notation ?? '';

export function createAlgDrillSession({
  caseData,
  algs = caseData?.algs ?? [],
  cases = [caseData],
  db = null,
  learningData = { version: 1, trial: 0, recentKeys: [], items: {} },
  saveLearning = () => {},
  mode = 'repeat',
  now = () => performance.now(),
  onChange = () => {},
  f2lIntact = () => true,
} = {}) {
  if (!caseData || !Array.isArray(algs) || !algs.length) throw new Error('Choose a case with a verified algorithm first.');
  const byCase = new Map((cases ?? [caseData]).filter(Boolean).map(row => [row.id, row]));
  byCase.set(caseData.id, caseData);
  const allAlgs = [...byCase.values()].flatMap(row => row.id === caseData.id ? algs : row.algs ?? []);
  const verified = allAlgs.filter(alg => alg.verified === true);
  if (!verified.length) throw new Error('This case has no verified algorithms to drill.');
  const maxTurns = Math.max(...verified.map(alg => parseAlg(alg.moves).length)) + 8;
  const responseLimit = algId => {
    const times = learningData.items?.[itemKey('alg', algId)]?.times ?? [];
    const median = medianTime({ times });
    return median == null ? 1500 : Math.round(median * 1.15);
  };
  const state = {
    caseId: caseData.id,
    mode,
    phase: 'ready',
    algId: verified[0].id,
    moves: [], moveTimes: [], startedAt: null,
    match: null, lastAttempt: null, pbMs: null, attempt: 0,
  };
  const update = () => onChange({ ...state, moves: [...state.moves], moveTimes: [...state.moveTimes] });
  const algFor = id => verified.find(alg => alg.id === id) ?? verified[0];
  const alternatives = id => mode === 'any' ? verified.filter(alg => alg.caseId === algFor(id).caseId) : [algFor(id)];

  async function finish({ correct, selfTimed = false, endedAt = now(), intact = true } = {}) {
    const alg = algFor(state.algId);
    const metrics = selfTimed
      ? { executionMs: Math.max(0, Math.round(endedAt - state.startedAt)), tps: null, moveTimes: [], gaps: [], hotspots: [], medianGapMs: null }
      : attemptMetrics({ moveTimes: state.moveTimes, startedAt: state.startedAt, moveCount: state.moves.length });
    const attempt = {
      caseId: alg.caseId ?? state.caseId, algId: alg.id, mode: state.mode, clean: Boolean(correct && intact),
      executionMs: metrics.executionMs, tps: metrics.tps, moveCount: selfTimed ? alg.moves.split(' ').length : state.moves.length,
      moveTimes: metrics.moveTimes, hotspots: metrics.hotspots, selfTimed, createdAt: Date.now(),
    };
    state.lastAttempt = attempt;
    state.attempt += 1;
    state.phase = 'results';
    state.match = { status: attempt.clean ? 'complete' : intact ? 'incomplete' : 'f2l-broken', complete: attempt.clean };
    if (db) {
      await db.recordAttempt(attempt);
      const previous = await db.attemptsFor(alg.id, 200);
      state.pbMs = personalBest(previous.filter(row => row.clean), attempt.clean ? attempt : null);
    }
    review(learningData, itemKey('alg', alg.id), {
      correct: attempt.clean, ms: metrics.executionMs, now: Date.now(), responseThresholdMs: responseLimit(alg.id),
    });
    saveLearning(learningData);
    update();
    return { attempt, metrics, pbMs: state.pbMs };
  }

  function start({ algId = state.algId, startedAt = now() } = {}) {
    state.algId = algFor(algId).id;
    state.phase = 'running'; state.moves = []; state.moveTimes = []; state.startedAt = startedAt;
    state.match = { status: 'ready', complete: false }; state.lastAttempt = null;
    update();
    return { ...state };
  }

  async function turn(input, timestamp = now()) {
    if (mode === 'self') throw new Error('Use completeSelf() in the cube-free drill.');
    if (state.phase !== 'running') start({ startedAt: timestamp });
    const move = moveText(input);
    if (!move) return state.match;
    state.moves.push(move); state.moveTimes.push(timestamp);
    // OLL/PLL execution can temporarily disturb the first two layers. Check
    // preservation only once the complete candidate has run, not on prefixes.
    const matched = matchAlgorithm(state.moves.join(' '), alternatives(state.algId), { intact: true, anyCase: mode === 'any' });
    state.match = matched;
    update();
    if (matched.status === 'complete') {
      const intact = Boolean(f2lIntact(state.moves));
      if (!intact) {
        state.match = { status: 'f2l-broken', complete: false, moveCount: state.moves.length, nextMoves: [], algId: matched.algId };
        update();
      }
      return finish({ correct: intact, endedAt: timestamp, intact });
    }
    // Canonicalization can temporarily reorder commuting opposite-face turns.
    // Keep listening through that intermediate mismatch; only stop after a
    // bounded number of extra turns without a complete candidate.
    if ((matched.status === 'mismatch' || matched.status === 'f2l-broken') && state.moves.length > maxTurns) {
      return finish({ correct: false, endedAt: timestamp, intact: true });
    }
    return matched;
  }

  async function completeSelf(endedAt = now()) {
    if (mode !== 'self') throw new Error('This session is using smart-cube input.');
    if (state.phase !== 'running') throw new Error('Start the round first.');
    return finish({ correct: true, selfTimed: true, endedAt, intact: true });
  }

  function chooseNext({ cases = [caseData], nowMs = Date.now(), random = Math.random } = {}) {
    const picked = [];
    for (const row of cases) for (const alg of row.algs ?? []) {
      if (alg.verified !== true) continue;
      const key = itemKey('alg', alg.id);
      picked.push({ key, learningKey: key, caseId: row.id, algId: alg.id });
    }
    const candidate = chooseDue(learningData, picked, nowMs, random) ?? null;
    if (candidate) { state.caseId = candidate.caseId; state.algId = candidate.algId; }
    update();
    return candidate;
  }

  return {
    start, turn, completeSelf, finish, chooseNext,
    get state() { return { ...state, moves: [...state.moves], moveTimes: [...state.moveTimes] }; },
    get selectedAlg() { return algFor(state.algId); },
    get executionKey() { return normalizeExecution(state.moves.join(' ')); },
  };
}
