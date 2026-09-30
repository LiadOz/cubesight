// Stage timing for the Brain, observed from the live tracker's emits.
//
// solve-live reports monotonic milestones (progress.crossDone, pairsSolved,
// f2lDone, eoDone, coDone, ollDone, solved) and a move count; this reducer
// stamps when each one first happened (clock time and solve-move index) and
// the time of every solve move. The controller feeds it the recorder clock,
// which is frozen at the input being handled, so stamps equal solve-live's own
// times and replay deterministically. Pure: node tests drive it with plain
// snapshots.

import { cpSolved, currentDShift } from '../solve-tracker.js';

export function createTrack() {
  return {
    active: false,
    solveStartAt: null,
    inspectionMs: null,
    stamps: {
      crossAt: null, crossIdx: null,
      xPairs: null,   // pairs already built when the cross completed (an X-cross / XX-cross), once the cross is done
      pairAt: [], pairIdx: [], pairPseudo: [],
      f2lAt: null, f2lIdx: null,
      eoAt: null, eoIdx: null,
      coAt: null, coIdx: null,
      ollAt: null, ollIdx: null,
      cpAt: null, cpIdx: null,
      solvedAt: null, solvedIdx: null,
    },
    moveTimes: [],   // ms since solve start, one per solve move (a coalesced double is one move)
  };
}

const PRE_SOLVE = new Set(['idle', 'applying', 'inspecting', 'ready', 'desynced']);

/**
 * Advance the track with one live snapshot at clock time `t`.
 * `state` is the session's cube state (for the CP and pseudo-pair checks).
 * Returns the same object when nothing changed.
 */
export function trackMilestones(track, snap, t, { state = null } = {}) {
  if (!snap) return track;
  if (PRE_SOLVE.has(snap.phase)) return track.active || track.moveTimes.length ? createTrack() : track;
  if (snap.phase !== 'solving' && snap.phase !== 'done') return track;
  let next = track;
  const edit = () => { if (next === track) next = { ...track, stamps: { ...track.stamps, pairAt: [...track.stamps.pairAt], pairIdx: [...track.stamps.pairIdx], pairPseudo: [...track.stamps.pairPseudo] }, moveTimes: [...track.moveTimes] }; return next; };
  if (!track.active) {
    edit();
    next.active = true;
    // Autostart starts the clock at the inspection limit, before any emit: derive
    // the start from the tracker's elapsed time, not from this emit.
    next.solveStartAt = Number.isFinite(snap.elapsedMs) ? t - snap.elapsedMs : t;
    next.inspectionMs = snap.inspectionMs ?? null;
  }
  const count = snap.solveMoveCount ?? snap.solveMoves?.length ?? 0;
  const s0 = next.solveStartAt;
  if (count > next.moveTimes.length) {
    edit();
    while (next.moveTimes.length < count) next.moveTimes.push(Math.max(0, t - s0));
  } else if (count < next.moveTimes.length) {
    edit();
    next.moveTimes.length = count;
  }
  const p = snap.progress || {};
  const st = next.stamps;
  const stamp = (name, idx = count) => { edit(); next.stamps[`${name}At`] = t; next.stamps[`${name}Idx`] = idx; };
  if (p.crossDone && st.crossAt == null) { stamp('cross'); next.stamps.xPairs = Math.min(4, Math.max(0, p.pairsSolved ?? 0)); }
  const pairs = p.crossDone ? (p.pairsSolved ?? 0) : 0;
  if (pairs > next.stamps.pairAt.length) {
    edit();
    const pseudo = Boolean(state && snap.crossFace && currentDShift(state, snap.crossFace));
    while (next.stamps.pairAt.length < pairs) {
      next.stamps.pairAt.push(t); next.stamps.pairIdx.push(count); next.stamps.pairPseudo.push(pseudo);
    }
  }
  if (p.f2lDone && next.stamps.f2lAt == null) stamp('f2l');
  if (p.eoDone && next.stamps.eoAt == null) stamp('eo');
  if (p.coDone && next.stamps.coAt == null) stamp('co');
  if (p.ollDone && next.stamps.ollAt == null) stamp('oll');
  if (p.ollDone && next.stamps.cpAt == null && state && snap.crossFace && cpSolved(state, snap.crossFace)) stamp('cp');
  const solved = p.solved || snap.phase === 'done';
  if (solved && next.stamps.solvedAt == null) {
    // A finished record carries the exact raw solve time.
    const end = Number.isFinite(snap.record?.solveMs) ? s0 + snap.record.solveMs : t;
    edit();
    next.stamps.solvedAt = end; next.stamps.solvedIdx = count;
    if (next.stamps.cpAt == null) { next.stamps.cpAt = end; next.stamps.cpIdx = count; }
  }
  return next;
}

// Where each stage of a plan ends: { at, idx } or null while not reached.
function stageEnd(stamps, key) {
  const at = (a, i) => (a == null ? null : { at: a, idx: i });
  switch (key) {
    case 'cross': case 'fb': return at(stamps.crossAt, stamps.crossIdx);
    case 'pair1': case 'pair2': case 'pair3': case 'pair4': {
      const n = Number(key.slice(4)) - 1;
      return at(stamps.pairAt[n] ?? null, stamps.pairIdx[n]);
    }
    case 'sb': return at(stamps.f2lAt, stamps.f2lIdx);
    case 'eo': return at(stamps.eoAt, stamps.eoIdx);
    case 'co': case 'oll': case 'cmll': return at(stamps.ollAt, stamps.ollIdx);
    case 'cp': return at(stamps.cpAt, stamps.cpIdx);
    case 'ep': case 'pll': case 'l6e': return at(stamps.solvedAt, stamps.solvedIdx);
    default: return null;
  }
}

/**
 * Per-stage progress of a solve against a plan. Stages end in plan order: a
 * stage finished out of order (corners oriented before edges) ends no earlier
 * than the one before it, and gets zero time.
 * @returns {{stages:{key:string, startAt:number|null, endAt:number|null, ms:number|null, moves:number|null,
 *   skipped:boolean, merged:boolean, pseudo:boolean, done:boolean}[], currentIndex:number}}
 */
export function stageProgress(track, plan) {
  const stamps = track.stamps;
  let prevAt = track.solveStartAt;
  let prevIdx = 0;
  let currentIndex = plan.length;
  const stages = plan.map((stage, i) => {
    const end = track.active ? stageEnd(stamps, stage.key) : null;
    const pairNo = /^pair\d$/.test(stage.key) ? Number(stage.key.slice(4)) : 0;
    const pseudo = pairNo ? Boolean(stamps.pairPseudo[pairNo - 1]) : false;
    const merged = pairNo > 0 && pairNo <= (stamps.xPairs ?? 0);   // built with the cross: done at the same moment
    if (!end || currentIndex < plan.length) {
      if (currentIndex === plan.length) currentIndex = i;
      return { key: stage.key, startAt: currentIndex === i ? prevAt : null, endAt: null, ms: null, moves: null, skipped: false, merged: false, pseudo, done: false };
    }
    const endAt = Math.max(end.at, prevAt ?? end.at);
    const endIdx = Math.max(end.idx ?? prevIdx, prevIdx);
    const out = { key: stage.key, startAt: prevAt, endAt, ms: prevAt == null ? null : endAt - prevAt, moves: endIdx - prevIdx, skipped: !merged && endIdx === prevIdx, merged, pseudo, done: true };
    prevAt = endAt; prevIdx = endIdx;
    return out;
  });
  return { stages, currentIndex: track.active ? currentIndex : 0 };
}

/** Splits to store on the solve record: [{ key, ms, moves, skipped, pseudo }]. */
export function splitsFromTrack(track, plan) {
  return stageProgress(track, plan).stages.filter(s => s.done).map(s => ({ key: s.key, ms: s.ms, moves: s.moves, skipped: s.skipped, pseudo: s.pseudo }));
}
