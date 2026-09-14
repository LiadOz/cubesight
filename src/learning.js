/**
 * Small, local-only learning model used by both trainers.
 *
 * The scheduler is intentionally conservative: it rewards correct fast
 * recognition, but a slow correct answer remains due soon enough to become
 * fluent. It is a heuristic for practice ordering, not a claim about a
 * validated spaced-repetition algorithm.
 */

const DAY = 24 * 60 * 60 * 1000;

export function emptyLearning() {
  return { version: 1, trial: 0, recentKeys: [], items: {}, sessions: [] };
}

function cleanItem(item) {
  const source = item && typeof item === 'object' ? item : {};
  const attempts = Number.isFinite(source.attempts) ? Math.max(0, Math.floor(source.attempts)) : 0;
  const correct = Number.isFinite(source.correct) ? Math.max(0, Math.min(attempts, Math.floor(source.correct))) : 0;
  return {
    attempts, correct,
    streak: Number.isFinite(source.streak) ? Math.max(0, Math.floor(source.streak)) : 0,
    interval: Number.isFinite(source.interval) ? Math.max(0, source.interval) : 0,
    due: Number.isFinite(source.due) ? source.due : 0,
    dueTrial: Number.isFinite(source.dueTrial) ? Math.max(0, Math.floor(source.dueTrial)) : 0,
    times: Array.isArray(source.times) ? source.times.filter(Number.isFinite).map(Math.round).filter((n) => n >= 0).slice(-12) : [],
    lastMs: Number.isFinite(source.lastMs) ? Math.max(0, Math.round(source.lastMs)) : null,
    lastSeen: Number.isFinite(source.lastSeen) ? source.lastSeen : null,
    delayedAttempts: Number.isFinite(source.delayedAttempts) ? Math.max(0, Math.floor(source.delayedAttempts)) : 0,
    delayedCorrect: Number.isFinite(source.delayedCorrect) ? Math.max(0, Math.min(source.delayedAttempts || 0, Math.floor(source.delayedCorrect))) : 0,
  };
}

function migrateItems(items = {}) {
  const migrated = {};
  for (const [rawKey, rawItem] of Object.entries(items)) {
    // Older corner records treated every adaptive exposure as a new case.
    // Collapse only that legacy suffix so existing learning carries forward.
    const key = rawKey.replace(/:glance\d+$/, ':glance');
    const item = cleanItem(rawItem);
    const previous = migrated[key];
    if (!previous) { migrated[key] = item; continue; }
    const newest = (item.lastSeen || 0) >= (previous.lastSeen || 0) ? item : previous;
    migrated[key] = {
      ...newest,
      attempts: previous.attempts + item.attempts,
      correct: previous.correct + item.correct,
      delayedAttempts: previous.delayedAttempts + item.delayedAttempts,
      delayedCorrect: previous.delayedCorrect + item.delayedCorrect,
      times: [...previous.times, ...item.times].slice(-12),
      due: Math.min(previous.due || Infinity, item.due || Infinity),
      dueTrial: Math.min(previous.dueTrial || Infinity, item.dueTrial || Infinity),
    };
    if (!Number.isFinite(migrated[key].due)) migrated[key].due = 0;
    if (!Number.isFinite(migrated[key].dueTrial)) migrated[key].dueTrial = 0;
  }
  return migrated;
}

export function loadLearning(storage, key = 'cubesight-learning-v1') {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || 'null');
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return emptyLearning();
    return {
      ...emptyLearning(), ...parsed,
      trial: Number.isFinite(parsed.trial) ? Math.max(0, Math.floor(parsed.trial)) : 0,
      recentKeys: Array.isArray(parsed.recentKeys) ? parsed.recentKeys.filter((key) => typeof key === 'string').slice(-3) : [],
      items: migrateItems(parsed.items),
    };
  } catch {
    return emptyLearning();
  }
}

export function saveLearning(storage, data, key = 'cubesight-learning-v1') {
  try { storage?.setItem(key, JSON.stringify(data)); } catch { /* private mode/quota: practice still works in memory */ }
  return data;
}

function median(values) {
  const numbers = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

export function itemKey(kind, identity, context = '') {
  return [kind, identity, context].filter(Boolean).join('|');
}

// Keep F2L identity tied to the viewing context. The same colour pair in a
// different bottom orientation is a different recognition problem.
export function f2lKey({ bottom, pair, position = '', visibility = '' } = {}) {
  return itemKey('f2l', pair, [bottom, position, visibility].filter(Boolean).join(':'));
}

export function review(data, key, { correct = false, ms = null, now = Date.now(), trial = null, responseThresholdMs = 900 } = {}) {
  if (!data || typeof data !== 'object' || typeof key !== 'string' || !key) return null;
  data.items ||= {};
  data.recentKeys ||= [];
  data.trial = Number.isFinite(trial) ? Math.max(data.trial || 0, Math.floor(trial)) : (data.trial || 0) + 1;
  const previous = cleanItem(data.items[key]);
  const next = { ...previous };
  next.attempts += 1;
  next.correct += correct ? 1 : 0;
  next.streak = correct ? next.streak + 1 : 0;
  next.lastMs = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : next.lastMs;
  next.lastSeen = now;
  // Measure the first return after at least a day separately from warmed-up
  // practice. This is an observed delayed review, not a retention prediction.
  if (previous.lastSeen !== null && now - previous.lastSeen >= DAY) {
    next.delayedAttempts++;
    next.delayedCorrect += correct ? 1 : 0;
  }
  // Only correct observations belong in the speed estimate. Error handling
  // and pointer mistakes should not make the next correct attempt look fast.
  if (correct && next.lastMs !== null) next.times = [...(next.times || []), next.lastMs].slice(-12);

  if (!correct) {
    next.interval = 0;
    next.due = now + 15 * 60 * 1000;
    next.dueTrial = data.trial + 3; // three completed intervening trials
  } else if (next.streak === 1) {
    next.interval = 1;
    const slow = next.lastMs !== null && next.lastMs > responseThresholdMs;
    next.due = now + DAY;
    next.dueTrial = data.trial + (slow ? 5 : 12);
  } else {
    // Slow correct responses get a shorter return interval than fluent ones.
    const speedFactor = next.lastMs === null ? 0.75 : Math.max(0.5, Math.min(1.25, responseThresholdMs / Math.max(responseThresholdMs * 0.28, next.lastMs)));
    const multiplier = next.lastMs !== null && next.lastMs <= responseThresholdMs ? Math.max(2, 1.65 + speedFactor * 0.35) : Math.min(1.8, 1.2 + speedFactor * 0.3);
    next.interval = Math.max(1, Math.min(30, Math.round(Math.max(1, next.interval) * multiplier)));
    next.due = now + next.interval * DAY;
    next.dueTrial = data.trial + (next.lastMs !== null && next.lastMs > responseThresholdMs ? 5 : Math.min(200, 12 * 2 ** Math.min(next.streak - 1, 4)));
  }
  data.items[key] = next;
  data.recentKeys = [...data.recentKeys.filter((item) => item !== key), key].slice(-3);
  return next;
}

export function accuracy(item) {
  return item?.attempts ? item.correct / item.attempts : null;
}

export function medianTime(item) {
  return median(item?.times || []);
}

export function dueItems(data, now = Date.now()) {
  return Object.entries(data?.items || {})
    .filter(([, item]) => !item.due || item.due <= now || (data.trial || 0) >= (item.dueTrial || 0))
    .map(([key, item]) => ({ key, ...item }));
}

/** Returns a stable priority score: overdue and weak/slow items come first. */
export function priority(item, now = Date.now()) {
  const overdueDays = Math.max(0, (now - (item.due || now)) / DAY);
  const weakness = item.attempts ? 1 - accuracy(item) : 1;
  const typical = medianTime(item) || item.lastMs || 900;
  return overdueDays * 3 + weakness * 2 + Math.min(2, typical / 900);
}

export function chooseDue(data, candidates, now = Date.now(), random = Math.random) {
  const known = candidates.map((candidate) => ({
    ...candidate,
    learningKey: candidate.learningKey || candidate.key,
  }));
  const due = known.filter((candidate) => {
    const item = data.items[candidate.learningKey];
    return item && (!item.due || item.due <= now || (data.trial || 0) >= (item.dueTrial || 0));
  });
  const available = (pool) => pool.filter((candidate) => !data.recentKeys?.includes(candidate.learningKey));
  const unseen = known.filter((candidate) => !data.items[candidate.learningKey]);
  const pool = due.length ? due : unseen.length ? unseen : known;
  const filtered = available(pool);
  const eligible = filtered.length ? filtered : pool;
  const scores = eligible.map((candidate) => priority(data.items[candidate.learningKey] || {}, now));
  const best = Math.max(...scores, -Infinity);
  const ties = eligible.filter((candidate, index) => Math.abs(scores[index] - best) < 1e-9);
  return ties[Math.min(ties.length - 1, Math.floor(Math.max(0, random()) * ties.length))] || null;
}

export function sessionSummary(data, now = Date.now()) {
  const items = Object.values(data?.items || {});
  const attempts = items.reduce((sum, item) => sum + (item.attempts || 0), 0);
  const correct = items.reduce((sum, item) => sum + (item.correct || 0), 0);
  const times = items.flatMap((item) => item.times || []);
  return {
    attempts,
    correct,
    accuracy: attempts ? correct / attempts : null,
    medianMs: median(times),
    due: dueItems(data, now).length,
    delayedAttempts: items.reduce((sum, item) => sum + (item.delayedAttempts || 0), 0),
    delayedCorrect: items.reduce((sum, item) => sum + (item.delayedCorrect || 0), 0),
  };
}

export const recordReview = review;
export const getLearningSummary = sessionSummary;

export const LEARNING_DAY_MS = DAY;
