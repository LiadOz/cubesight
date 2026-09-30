// Local-only persistence for solve records. Mirrors the learning.js philosophy:
// storage is best-effort (private mode / quota must never break practice), and
// the kept history is bounded so a device never accumulates unbounded data.
//
// Records are the raw material for the metrics layer (solve-metrics.js) and the
// weak-case / trend UIs. We retain the most recent `SOLVE_STORE_CAP` solves,
// like the corner history cap, which keeps long-term trend usable without
// unbounded growth.

import { SOLVE_STORE_KEY, SOLVE_STORE_CAP } from './solve-metrics.js';

const VERSION = 1;

function cleanRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw;
  const finite = (v) => (Number.isFinite(v) ? v : null);
  // Require a real timestamp; otherwise a stray object is not a solve record.
  if (!Number.isFinite(r.at)) return null;
  return {
    at: finite(r.at) ?? 0,
    scramble: typeof r.scramble === 'string' ? r.scramble : '',
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
    })) : null,
    moveTimes: Array.isArray(r.moveTimes) ? r.moveTimes.filter(Number.isFinite).slice(-200) : null,
    config: r.config && typeof r.config === 'object' ? Object.fromEntries(CONFIG_KEYS
      .filter(k => typeof r.config[k] === 'string').map(k => [k, r.config[k].slice(0, 16)])) : null,
  };
}

const PENALTIES = ['+2', 'DNF'];
const CONFIG_KEYS = ['method', 'cross', 'f2l', 'oll', 'pll', 'inspectionMode'];

export function loadSolves(storage, key = SOLVE_STORE_KEY) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || 'null');
    if (!parsed || typeof parsed !== 'object' || parsed.version !== VERSION || !Array.isArray(parsed.records)) return [];
    return parsed.records.map(cleanRecord).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveSolves(storage, records, key = SOLVE_STORE_KEY) {
  try {
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
