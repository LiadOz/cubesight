// The record a manual solve leaves in the shared history (src/store/history.js), and the
// compact stats row. Pure.
//
// A manual solve has no moves: solveMoves is [] and moveCount 0, so the Brain's analysis
// (src/analysis/record.js) skips it ('no-moves'), it has no splits, and TPS stays null.
// `source: 'manual'` tells it apart from a smart-cube solve (source is absent on those).

import { scopeStats } from '../solve-metrics.js';
import { inFocus } from '../store/focus.js';
import { fmtTime } from '../brain/format.js';

/**
 * @param {{solveMs:number, penalty:null|'+2'|'DNF', inspectionMs:number|null, inspectionMode:string}} result
 * @param {{at:number, scramble:string, focus?:string}} context
 */
export function buildManualRecord(result, { at, scramble, focus = 'speed' }) {
  return {
    at,
    source: 'manual',
    focus,
    scramble: scramble || '',
    free: false,
    solveMs: result.solveMs,
    penalty: result.penalty,
    inspectionMs: result.inspectionMs,
    inspectionMode: result.inspectionMode,
    solved: true,
    moveCount: 0,
    solveMoves: [],
    tps: null,
    config: { inspectionMode: result.inspectionMode },
  };
}

/** Stats of the focus for the compact row: { count, cells: [{key, label, text}] } in display order. */
export function statsRow(records, focus) {
  const s = scopeStats(inFocus(records, focus));
  const cell = (key, label, value) => (value == null ? null : { key, label, text: Number.isFinite(value) ? fmtTime(value) : 'DNF' });
  const cells = [
    cell('ao5', 'ao5', s.ao5), cell('ao12', 'ao12', s.ao12), cell('ao50', 'ao50', s.ao50), cell('ao100', 'ao100', s.ao100),
    cell('mo3', 'mo3', s.mo3), cell('pb', 'PB', s.best),
  ].filter(Boolean);
  return { count: s.count, cells };
}
