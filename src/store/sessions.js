// Automatic sessions. A solve starts a new session when the gap since the
// previous solve is larger than a threshold (default 30 minutes, a setting) or
// when its focus differs from the previous solve's (src/store/focus.js: a
// session never mixes foci, so its focus is the focus of every solve in it).
// Sessions have no names: the id is just "s" + the timestamp of the first solve.
// Pure functions; the history store applies them on append, migration and import.

import { focusOf } from './focus.js';

export const DEFAULT_SESSION_GAP_MIN = 30;
export const MIN_SESSION_GAP_MIN = 1;
export const MAX_SESSION_GAP_MIN = 24 * 60;

export function normalizeGapMin(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SESSION_GAP_MIN;
  return Math.min(MAX_SESSION_GAP_MIN, Math.max(MIN_SESSION_GAP_MIN, n));
}

export const sessionIdFor = at => `s${at}`;

/** The session id a new solve at `at` with `focus` belongs to, given the solves before it. */
export function nextSessionId(records, at, gapMin = DEFAULT_SESSION_GAP_MIN, focus = 'speed') {
  const last = records.length ? records[records.length - 1] : null;
  if (!last || at - last.at > normalizeGapMin(gapMin) * 60_000 || focusOf(last) !== focusOf({ focus })) return sessionIdFor(at);
  return last.sessionId ?? sessionIdFor(at);
}

/**
 * Fill in the sessionId of every record that has none (old records on
 * migration, imported backups). Records that already have one keep it; the
 * gap and focus rules only decide for the rest, in time order. Returns a new sorted list.
 */
export function deriveSessionIds(records, gapMin = DEFAULT_SESSION_GAP_MIN) {
  const gapMs = normalizeGapMin(gapMin) * 60_000;
  const sorted = [...records].sort((a, b) => a.at - b.at);
  let current = null;   // { id, lastAt, focus }
  return sorted.map(record => {
    let id = record.sessionId;
    if (!id) id = current && record.at - current.lastAt <= gapMs && current.focus === focusOf(record) ? current.id : sessionIdFor(record.at);
    current = { id, lastAt: record.at, focus: focusOf(record) };
    return id === record.sessionId ? record : { ...record, sessionId: id };
  });
}

/** Records of one session. A missing id (records without sessions) means all of them. */
export function sessionRecords(records, sessionId) {
  if (!sessionId) return records;
  return records.filter(r => r.sessionId === sessionId);
}

/** The session of the most recent solve, or null. */
export function currentSessionId(records) {
  return records.length ? records[records.length - 1].sessionId ?? null : null;
}

/** Sessions in time order: { id, focus, firstAt, lastAt, count }. */
export function listSessions(records) {
  const out = new Map();
  for (const r of records) {
    const id = r.sessionId ?? sessionIdFor(r.at);
    const s = out.get(id) ?? { id, focus: focusOf(r), firstAt: r.at, lastAt: r.at, count: 0 };
    s.firstAt = Math.min(s.firstAt, r.at);
    s.lastAt = Math.max(s.lastAt, r.at);
    s.count++;
    out.set(id, s);
  }
  return [...out.values()].sort((a, b) => a.firstAt - b.firstAt);
}
