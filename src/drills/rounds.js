export const SHELL_KEY = 'cubesight-shell-v1';
export const ROUNDS_KEY = 'cubesight-rounds-v1';
export const MAX_ROUNDS = 500;
export const MAX_DAY_HISTORY = 370;
export const QUICK_ROUNDS = Object.freeze({
  corners: Object.freeze({ kind: 'timed', durationMs: 2 * 60 * 1000 }),
  pll: Object.freeze({ kind: 'cases', cases: 20 }),
  f2l: Object.freeze({ kind: 'timed', durationMs: 30 * 1000 }),
  oll: Object.freeze({ kind: 'cases', cases: 20 }),
  lookahead: Object.freeze({ kind: 'cases', cases: 20 }),
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.max(0, Math.floor(finite(value, fallback)));
const dayKey = at => {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dayNumber = key => {
  const [year, month, date] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
};
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function read(storage, key, fallback) {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? 'null');
    return value && typeof value === 'object' ? value : fallback;
  } catch { return fallback; }
}

function write(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* Keep the current round usable in memory. */ }
  return value;
}

export function loadShell(storage = globalThis.localStorage) {
  const value = read(storage, SHELL_KEY, {});
  const days = Array.isArray(value.days) ? [...new Set(value.days.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item)))].sort().slice(-MAX_DAY_HISTORY) : [];
  const round = value.round && typeof value.round === 'object' && typeof value.round.drill === 'string' ? value.round : null;
  return {
    version: 1,
    lastDrill: typeof value.lastDrill === 'string' ? value.lastDrill : null,
    settings: value.settings && typeof value.settings === 'object' ? value.settings : {},
    round,
    bestCombos: value.bestCombos && typeof value.bestCombos === 'object' ? value.bestCombos : {},
    days,
  };
}

export function loadRounds(storage = globalThis.localStorage) {
  const value = read(storage, ROUNDS_KEY, {});
  const rounds = Array.isArray(value.rounds) ? value.rounds.filter(item => item && typeof item === 'object' && typeof item.drill === 'string').slice(-MAX_ROUNDS) : [];
  return { version: 1, rounds };
}

export function dayStreak(days, at = Date.now()) {
  const values = [...new Set((Array.isArray(days) ? days : []).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item)))].sort();
  if (!values.length) return 0;
  const today = dayNumber(dayKey(at));
  let index = values.length - 1;
  const latest = dayNumber(values[index]);
  if (latest < today - 1) return 0;
  let count = 1;
  while (index > 0 && dayNumber(values[index]) - dayNumber(values[index - 1]) === 1) { count++; index--; }
  return count;
}

export function recordActiveDay(shell, at = Date.now()) {
  const days = [...new Set([...(shell.days || []), dayKey(at)])].sort().slice(-MAX_DAY_HISTORY);
  return { ...shell, days };
}

function cleanAnswer(answer, at) {
  return {
    correct: answer.correct === true,
    ms: Number.isFinite(Number(answer.ms)) && Number(answer.ms) >= 0 ? Math.round(Number(answer.ms)) : null,
    caseId: typeof answer.caseId === 'string' ? answer.caseId.slice(0, 100) : null,
    at,
  };
}

export function createRoundStore(storage = globalThis.localStorage, { now = () => Date.now() } = {}) {
  let shell = loadShell(storage);
  let history = loadRounds(storage);
  const saveShell = () => write(storage, SHELL_KEY, shell);
  const saveHistory = () => write(storage, ROUNDS_KEY, history);

  function finish(reason = 'complete', at = now()) {
    const current = shell.round;
    if (!current || current.status !== 'active') return null;
    const answers = Array.isArray(current.answers) ? current.answers : [];
    const correct = answers.filter(answer => answer.correct).length;
    const timed = answers.filter(answer => answer.correct && Number.isFinite(answer.ms)).map(answer => answer.ms);
    const priorBest = integer(shell.bestCombos[current.drill]);
    const bestCombo = Math.max(priorBest, integer(current.bestCombo));
    const summary = {
      id: `${current.drill}:${current.startedAt}`,
      drill: current.drill,
      at,
      durationMs: Math.max(0, at - current.startedAt),
      total: answers.length,
      correct,
      accuracy: answers.length ? correct / answers.length : null,
      medianMs: median(timed),
      bestCombo: integer(current.bestCombo),
      newBestCombo: integer(current.bestCombo) > priorBest,
      cases: answers.map(answer => answer.caseId).filter(Boolean).slice(-100),
      answers,
      from: current.from || null,
      reason,
    };
    history.rounds.push(summary);
    history.rounds = history.rounds.slice(-MAX_ROUNDS);
    shell = recordActiveDay({ ...shell, round: { ...current, status: 'complete', finishedAt: at }, bestCombos: { ...shell.bestCombos, [current.drill]: bestCombo } }, at);
    saveHistory(); saveShell();
    return summary;
  }

  return {
    get shell() { return shell; },
    get history() { return history.rounds; },
    get streak() { return dayStreak(shell.days, now()); },
    get current() { return shell.round; },
    startRound({ drill, preset = QUICK_ROUNDS[drill], settings = {}, from = null, resume = true } = {}) {
      if (!drill || !preset || !['timed', 'cases', 'open'].includes(preset.kind)) throw new TypeError('A drill and a valid round preset are required.');
      if (resume && shell.round?.status === 'active' && shell.round.drill === drill) return shell.round;
      const at = now();
      shell = {
        ...shell,
        lastDrill: drill,
        settings: { ...shell.settings, [drill]: { ...settings } },
        round: {
          drill, preset: { ...preset }, settings: { ...settings }, from,
          startedAt: at, updatedAt: at, status: 'active', answers: [], combo: 0, bestCombo: 0,
        },
      };
      saveShell();
      return shell.round;
    },
    recordAnswer(result = {}) {
      const current = shell.round;
      if (!current || current.status !== 'active') return { accepted: false, complete: false, summary: null };
      const at = finite(result.at, now());
      const answer = cleanAnswer(result, at);
      const combo = answer.correct ? current.combo + 1 : 0;
      const answers = [...current.answers, answer];
      shell = { ...shell, round: { ...current, answers, combo, bestCombo: Math.max(current.bestCombo, combo), updatedAt: at } };
      saveShell();
      const reachedCount = current.preset.kind === 'cases' && answers.length >= integer(current.preset.cases);
      const reachedTime = current.preset.kind === 'timed' && at - current.startedAt >= integer(current.preset.durationMs);
      const summary = reachedCount || reachedTime ? finish(reachedCount ? 'cases' : 'time', at) : null;
      return { accepted: true, answer, combo, bestCombo: shell.bestCombos[current.drill] || shell.round?.bestCombo || 0, complete: Boolean(summary), summary };
    },
    finish(reason = 'complete', at = now()) { return finish(reason, at); },
    markActiveDay(at = now()) {
      shell = recordActiveDay(shell, at);
      saveShell();
      return dayStreak(shell.days, at);
    },
    discard() {
      shell = { ...shell, round: null };
      saveShell();
    },
  };
}
