// Solve record schema plus the LEGACY localStorage store.
//
// `cleanRecord` is the one validator for a solve record; the IndexedDB history
// (src/store/history.js, what the Brain uses) shares it. The sync
// loadSolves/saveSolves/appendSolve/updateSolve functions below are the
// original localStorage store: it is kept because the v1 Brain still uses it,
// and as the one-time migration source for the IndexedDB history. After the
// migration the localStorage key is left untouched as a backup.
//
// Storage is best-effort (private mode / quota must never break practice).
// This legacy store keeps the most recent `SOLVE_STORE_CAP` solves; the
// IndexedDB history has no cap.

import { SOLVE_STORE_KEY, SOLVE_STORE_CAP } from './solve-metrics.js';
import { normalizeFocus } from './store/focus.js';
import { cleanAnalysis, cleanRotationMarks } from './store/analysis-field.js';

export const LOCAL_VERSION = 1;
const VERSION = LOCAL_VERSION;

export function cleanRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw;
  const finite = (v) => (Number.isFinite(v) ? v : null);
  // Require a real timestamp; otherwise a stray object is not a solve record.
  if (!Number.isFinite(r.at)) return null;
  return {
    at: finite(r.at) ?? 0,
    // Automatic session (src/store/sessions.js): id of the session this solve belongs to.
    // What the user was training when the solve finished (src/store/focus.js); old records are speed.
    focus: normalizeFocus(r.focus),
    sessionId: typeof r.sessionId === 'string' && r.sessionId ? r.sessionId.slice(0, 32) : null,
    scramble: typeof r.scramble === 'string' ? r.scramble : '',
    // Timed by hand (src/timer): no moves, no analysis. Absent on smart-cube solves.
    ...(r.source === 'manual' ? { source: 'manual' } : {}),
    free: Boolean(r.free),
    crossFace: typeof r.crossFace === 'string' ? r.crossFace : null,
    crossColor: typeof r.crossColor === 'string' ? r.crossColor : null,
    solveMs: finite(r.solveMs),
    moveCount: Number.isFinite(r.moveCount) ? Math.max(0, Math.floor(r.moveCount)) : 0,
    solveMoves: Array.isArray(r.solveMoves) ? r.solveMoves.filter(m => typeof m === 'string').slice(-200) : [],
    tps: finite(r.tps),
    scrambleTurns: Array.isArray(r.scrambleTurns) ? r.scrambleTurns.filter(m => typeof m === 'string').slice(-200) : [],
    phases: r.phases && typeof r.phases === 'object' ? {
      crossMs: finite(r.phases.crossMs),
      f2lMs: finite(r.phases.f2lMs),
      ollMs: finite(r.phases.ollMs),
      pllMs: finite(r.phases.pllMs),
    } : null,
    xcross: ['cross', 'xcross', 'xxcross'].includes(r.xcross) ? r.xcross : null,
    rotations: Number.isFinite(r.rotations) ? Math.max(0, Math.floor(r.rotations)) : 0,
    detours: Number.isFinite(r.detours) ? Math.max(0, Math.floor(r.detours)) : 0,
    mistakes: Number.isFinite(r.mistakes) ? Math.max(0, Math.floor(r.mistakes)) : 0,
    pllCase: typeof r.pllCase === 'string' ? r.pllCase : null,
    ollCase: typeof r.ollCase === 'string' ? r.ollCase : null,
    solved: Boolean(r.solved),
    // Hook for the solve review (src/analysis): its accuracy score, 0..100. The learning
    // focus averages it (solve-metrics learningStats); null until the review writes it.
    reviewAccuracy: Number.isFinite(r.reviewAccuracy) ? Math.min(100, Math.max(0, r.reviewAccuracy)) : null,
    // Inspection penalty (WCA): solveMs stays the raw clock time.
    penalty: PENALTIES.includes(r.penalty) ? r.penalty : null,
    inspectionMs: finite(r.inspectionMs),
    inspectionMode: typeof r.inspectionMode === 'string' ? r.inspectionMode.slice(0, 16) : null,
    // Brain v2: per-stage splits (keys from the stage plan), per-move times
    // (ms since the solve started) and the settings the solve was done with.
    splits: Array.isArray(r.splits) ? r.splits.filter(s => s && typeof s.key === 'string').slice(0, 16).map(s => ({
      key: s.key.slice(0, 16),
      ms: finite(s.ms),
      moves: Number.isFinite(s.moves) ? Math.max(0, Math.floor(s.moves)) : null,
      skipped: Boolean(s.skipped),
      pseudo: Boolean(s.pseudo),
      ...(s.merged ? { merged: true } : {}),   // built together with the cross (an x-cross pair), not a skip
    })) : null,
    moveTimes: Array.isArray(r.moveTimes) ? r.moveTimes.filter(Number.isFinite).slice(-200) : null,
    // Solve review (src/analysis): where the cube was turned in the hands, the pseudo D-fix tail, and the
    // compact analysis summary the analysis worker computes once the solve is finished (null until then).
    rotationMarks: cleanRotationMarks(r.rotationMarks),
    dFixMs: finite(r.dFixMs),
    analysis: cleanAnalysis(r.analysis),
    config: r.config && typeof r.config === 'object' ? Object.fromEntries(CONFIG_KEYS
      .filter(k => typeof r.config[k] === 'string').map(k => [k, r.config[k].slice(0, 16)])) : null,
  };
}

const PENALTIES = ['+2', 'DNF'];
const CONFIG_KEYS = ['method', 'cross', 'f2l', 'oll', 'pll', 'inspectionMode'];

// Parse a stored blob into { version, records } or null. Records are read
// whatever the version: a version mismatch must never look like an empty
// history (the old behaviour silently dropped every solve of another version).
export function readStoredBlob(storage, key = SOLVE_STORE_KEY) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || 'null');
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records)) return null;
    return { version: parsed.version, records: parsed.records.map(cleanRecord).filter(Boolean) };
  } catch {
    return null;
  }
}

export function loadSolves(storage, key = SOLVE_STORE_KEY) {
  return readStoredBlob(storage, key)?.records ?? [];
}

export function saveSolves(storage, records, key = SOLVE_STORE_KEY) {
  try {
    // Never overwrite a blob written by a newer version: we may not understand
    // it, and dropping it would lose the user's history.
    const existing = readStoredBlob(storage, key);
    if (existing && Number.isFinite(existing.version) && existing.version > VERSION) return records;
    storage?.setItem(key, JSON.stringify({ version: VERSION, records: records.slice(-SOLVE_STORE_CAP) }));
  } catch {
    /* private mode / quota: practice still works in memory */
  }
  return records;
}

// Append a record and persist, returning the new bounded list. Callers keep the
// array in memory for live UI and pass it back here so the metrics layer stays
// pure and storage stays isolated.
export function appendSolve(storage, records, record, key = SOLVE_STORE_KEY) {
  const cleaned = cleanRecord(record);
  if (!cleaned) return records;
  const next = [...records, cleaned].slice(-SOLVE_STORE_CAP);
  saveSolves(storage, next, key);
  return next;
}

// Patch the stored record with timestamp `at` (e.g. the user marks a solve +2
// or DNF from the results screen) and persist. Returns the new list; the
// records are unchanged when no record matches.
export function updateSolve(storage, records, at, patch, key = SOLVE_STORE_KEY) {
  const index = records.findIndex(r => r.at === at);
  if (index < 0) return records;
  const cleaned = cleanRecord({ ...records[index], ...patch, at });
  if (!cleaned) return records;
  const next = [...records.slice(0, index), cleaned, ...records.slice(index + 1)];
  saveSolves(storage, next, key);
  return next;
}
