// The detail view of one stage or one marker on the results screen: the moves of that stage, its
// time, TPS and pauses against your average, its labels, and "yours vs better" (the shorter
// solution, animated on the cube by the controller). Also the pin payload for that moment.
// Pure: built from the record, the marker list and the stage rows.
//
// Positions are "moves applied": position p is the cube after the first p solve moves (0 = the
// scrambled cube), and stage `from`..`to` are the positions before its first and after its last move.

import { fmtTime, fmtDelta, deltaTone, fmtMoves, fmtTps, plural } from '../format.js';
import { TRAINER_OF } from './markers.js';

const words = text => (text ? text.split(' ') : []);

/** Stage rows with their move positions: [{..row, from, to, label}] (skipped and merged stages have no moves). */
export function positionedRows(rows = [], plan = []) {
  let at = 0;
  return rows.map(row => {
    const moves = row.skipped || row.merged ? 0 : row.moves ?? 0;
    const out = { ...row, from: at, to: at + moves, label: plan.find(p => p.key === row.key)?.label ?? row.key };
    at += moves;
    return out;
  });
}

/**
 * What "better" means for a stage (or for a marker that carries its own better solution).
 * status: better | shortest | none-yet | pseudo | merged | skipped | pending | unavailable
 */
export function compareFor({ row, marker = null, record, pending = false }) {
  const a = record.analysis ?? null;
  const moves = record.solveMoves ?? [];
  const none = (status, text) => ({ status, from: row?.from ?? 0, yours: [], better: [], text });
  if (marker?.better) {
    const { from, yours, moves: better } = marker.better;
    return { status: 'better', from, yours, better, text: `yours ${yours.length} · better ${better.length}` };
  }
  if (!row) return none('none-yet', 'no suggestion yet');
  if (row.merged) return none('merged', 'came with the cross');
  if (row.skipped) return none('skipped', 'skipped, nothing to improve');
  if (pending) return none('pending', 'finding a better one…');
  if (!a) return none('unavailable', 'no suggestion for this solve');
  const yours = moves.slice(row.from, row.to);
  if (row.key === 'cross' && a.cross?.done) {
    const better = words(a.cross.best);
    if (a.cross.extra > 0 && better.length && better.length < yours.length) return { status: 'better', from: 0, yours, better, text: `yours ${yours.length} · better ${better.length}` };
    const conclusion = a.cross.proven ? 'the shortest on this face' : 'no shorter completion found in this search';
    return { status: 'shortest', from: 0, yours, better: [], text: `yours ${yours.length} · ${conclusion}` };
  }
  const pair = /^pair(\d)$/.test(row.key) ? a.pairs.find(p => p.n === Number(row.key[4])) : null;
  if (pair?.unsupported) return { ...none('pseudo', 'no suggestion for pseudo pairs yet'), yours };
  const options = (pair?.options ?? []).map(option => ({
    moves: words(option.moves), slots: option.slots ?? [], stm: option.stm, etm: option.etm,
    generators: option.generators, ergonomicScore: option.ergonomicScore, source: option.source, proven: option.proven, goalShift: option.goalShift,
  }));
  if (pair && !pair.unsupported) {
    const frameNote = `${pair.frame ? ` · starts in D offset frame ${pair.frame}` : ''}${pair.better?.goalShift ? ' · D offset finish' : ''}`;
    if (pair.better) {
      const better = words(pair.better.moves);
      const comparison = better.length < yours.length ? `yours ${yours.length} · better ${better.length}` : `same length · easier turns`;
      return { status: 'better', from: row.from, yours, better, options, text: `${comparison}${frameNote}` };
    }
    const resultNote = pair.proven ? 'shortest found' : options.some(option => option.source === 'recorded-fallback')
      ? 'recorded completion · no shorter found in this search' : 'no shorter completion found in this search';
    return { status: 'shortest', from: row.from, yours, better: [], options, text: `yours ${yours.length} · ${resultNote}${frameNote}` };
  }
  return { ...none('none-yet', 'no suggestion yet'), yours };
}

function movesView(row, markers, record) {
  const moves = record.solveMoves ?? [];
  const a = record.analysis;
  const cancelAt = new Set();
  for (const run of a?.cancels ?? []) for (let i = run.from; i <= run.to; i++) cancelAt.add(i);
  const out = [];
  for (let i = row.from; i < row.to; i++) {
    const here = markers.filter(m => m.idx === i && m.kind !== 'xcross' && m.tone !== 'good');
    const flags = [...new Set(here.map(m => m.kind))];
    if (cancelAt.has(i) && !flags.includes('cancel')) flags.push('cancel');
    out.push({ i, at: i + 1, text: fmtMoves(moves[i] ?? ''), flags });
  }
  return out;
}

/** The pin for a moment: what a trainer needs to rebuild it (src/store/pins.js documents the model). */
export function pinPayload({ record, row, marker, compare }) {
  const moves = record.solveMoves ?? [];
  const position = marker ? marker.at : row?.from ?? 0;
  const stage = marker?.stage ?? row?.key ?? 'cross';
  const yours = compare?.yours?.length ? compare.yours : moves.slice(position, row?.to ?? position);
  return {
    at: record.at, moveIdx: position, stage, kind: marker?.kind ?? 'stage', trainer: marker?.trainer ?? TRAINER_OF(stage),
    scramble: record.scramble, crossFace: record.crossFace ?? record.analysis?.face ?? null,
    movesUpTo: moves.slice(0, position), yours: yours.slice(0, 60), better: compare?.better?.length ? compare.better : null,
    note: marker?.note ?? `${row?.label ?? stage}: ${compare?.text ?? ''}`.trim(),
  };
}

/**
 * @returns {import('../types.js').ReviewDetailVM|null}
 */
export function buildDetail({ kind, key, record, markers = [], rows = [], plan = [], averages = null, baselines = null, pending = false, pins = [], cursor = null, variant = 'yours' }) {
  const positioned = positionedRows(rows, plan);
  const marker = kind === 'marker' ? markers.find(m => m.id === key) ?? null : null;
  const stageKey = marker ? marker.stage : key;
  const row = positioned.find(r => r.key === stageKey) ?? null;
  if (!marker && !row) return null;
  const replayable = Array.isArray(record.solveMoves) && record.solveMoves.length > 0 && record.solveMoves.length === record.moveCount && Boolean(record.scramble);
  const compare = compareFor({ row, marker, record, pending });
  const stageMarkers = markers.filter(m => m.stage === stageKey);
  const moves = row ? movesView(row, stageMarkers, record) : [];
  const avg = averages?.byKey?.[stageKey] ?? null;
  const ms = row?.ms ?? null;
  const count = row ? row.to - row.from : 0;
  const tps = ms > 0 && count > 0 ? count / (ms / 1000) : null;
  const avgTps = avg && avg.avgMs > 0 && avg.avgMoves != null ? avg.avgMoves / (avg.avgMs / 1000) : null;
  const pauses = stageMarkers.filter(m => m.kind === 'pause');
  const lastLayer = /^eo$|^co$|^oll$/.test(stageKey) ? record.analysis?.ollCase
    : /^cp$|^ep$|^pll$/.test(stageKey) ? record.analysis?.pllCase : null;
  const delta = ms != null && avg && avg.source === 'history' && !row?.skipped && !row?.merged ? ms - avg.avgMs : null;
  const usual = baselines?.medianGapMs ?? record.analysis?.medianGapMs ?? null;
  const labels = [
    ...(row?.pseudo ? [{ text: 'pseudo', tone: 'good' }] : []),
    ...(row?.skipped ? [{ text: 'skip', tone: 'good' }] : []),
    ...(row?.merged ? [{ text: 'with the cross', tone: 'good' }] : []),
    ...(lastLayer ? [{ text: `${lastLayer.id}${lastLayer.recognitionMs == null ? '' : ` · recognition ${(lastLayer.recognitionMs / 1000).toFixed(2)} s`}${lastLayer.executionMs == null ? '' : ` · execution ${(lastLayer.executionMs / 1000).toFixed(2)} s`}`, tone: 'good' }] : []),
    ...stageMarkers.map(m => ({ text: m.label, tone: m.tone, id: m.id })),
  ];
  const payload = replayable ? pinPayload({ record, row, marker, compare }) : null;
  const pinned = payload ? pins.some(p => p.at === payload.at && p.stage === payload.stage && p.moveIdx === payload.moveIdx) : false;
  return {
    kind: marker ? 'marker' : 'stage',
    key: marker ? marker.id : stageKey,
    stageKey,
    title: marker ? `${marker.label} · ${row?.label ?? stageKey}` : (row?.label ?? stageKey),
    replayable,
    from: row?.from ?? 0,
    to: row?.to ?? 0,
    start: marker ? marker.at : row?.from ?? 0,
    cursor: cursor ?? (marker ? marker.at : row?.from ?? 0),
    moves,
    stats: {
      time: ms == null ? '—' : row?.skipped ? 'skip' : row?.merged ? 'merged' : fmtTime(ms),
      moves: count ? String(count) : row?.skipped || row?.merged ? '0' : '—',
      tps: tps ? fmtTps(tps) : '—',
      avgTime: avg && avg.source === 'history' ? fmtTime(avg.avgMs) : '—',
      avgTps: avgTps ? fmtTps(avgTps) : '—',
      avgMoves: avg && avg.source === 'history' && avg.avgMoves != null ? avg.avgMoves.toFixed(1) : '—',
      delta: delta == null ? '' : fmtDelta(delta),
      deltaTone: delta == null ? 'none' : deltaTone(delta),
      pauses: pauses.length ? `${plural(pauses.length, 'pause')} · ${pauses.map(m => m.label.replace('pause ', '')).join(', ')}${usual ? ` · usual ${(usual / 1000).toFixed(1)} s` : ''}` : 'no pauses',
    },
    labels,
    compare: { ...compare, yoursText: fmtMoves(compare.yours.join(' ')), betterText: fmtMoves(compare.better.join(' ')) },
    variant: compare.status === 'better' && variant === 'better' ? 'better' : 'yours',
    pin: { available: Boolean(payload), pinned, payload, trainer: payload?.trainer ?? null },
  };
}
