// Coach markers for the results timeline (docs/ideas/FEATURES.md 22): no long coach list, a few
// markers at the moments that mattered, good and bad, each compared with YOUR average where that
// means something. Pure: built from the stored record (its analysis summary, rotation marks, move
// times, splits), the stage rows, and the baselines of the same session focus.
//
// Every marker is { id, kind, tone, stage, idx, at, tMs, cost, score, label, note, compare, better,
// trainer, rank, prominent }:
//   idx / at   the move index the moment sits on / how many solve moves to have applied to show that
//              position on the cube (for "before this move", at === idx)
//   cost       loss units (about one move each); for good markers, the moves saved (positive numbers)
//   score      cost weighted by the session focus; ranks the markers (highest first)
//   better     { from, yours[], moves[] }: a verified shorter/easier way from that position
//   trainer    where a pin of this moment belongs: cross | f2l | oll | pll | lookahead

import { fmtMoves } from '../format.js';

export const PROMINENT = 4;

// Typical move savings used to rank skips and free pairs, not measured counterfactuals.
const SKIP_SAVED = { eo: 6, co: 8, oll: 11, pll: 12, cp: 6 };
const PAIR_SAVED = 7;
const ROTATION_COST = 2;
const PSEUDO_VALUE = 1.5;
const GOOD_DISCOUNT = 0.7;   // a good moment ranks a little below a bad one of the same size

// What each session focus cares about: speed = time, flow = steadiness, learning = move efficiency.
const FOCUS_WEIGHT = {
  speed: { pause: 1, rotation: 1, cancel: 1, cross: 1, better: 1, good: 1 },
  flow: { pause: 1.6, rotation: 1.3, cancel: 0.7, cross: 0.7, better: 0.7, good: 1 },
  learning: { pause: 0.6, rotation: 0.8, cancel: 1.5, cross: 1.5, better: 1.5, good: 1 },
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const secs = ms => `${(ms / 1000).toFixed(1)} s`;
const num1 = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const words = text => (text ? text.split(' ') : []);
const cap = text => text[0].toUpperCase() + text.slice(1);

const TRAINER_OF = key => (key === 'cross' ? 'cross' : /^pair/.test(key) ? 'f2l' : ['eo', 'co', 'oll'].includes(key) ? 'oll' : ['cp', 'ep', 'pll'].includes(key) ? 'pll' : 'lookahead');

/**
 * @param {{record:Object, stages:{key:string, startAt:number|null, endAt:number|null, ms:number|null, moves:number|null, skipped:boolean, merged:boolean}[],
 *   plan:{key:string,label:string}[], baselines?:Object|null, focus?:string, faceColors?:Object}} input
 * @returns {{markers:Object[], defaultId:string|null, prominentIds:string[]}}
 */
export function buildMarkers({ record, stages = [], plan = [], baselines = null, focus = 'speed', faceColors = {} }) {
  if (!record) return { markers: [], defaultId: null, prominentIds: [] };
  const a = record.analysis ?? null;
  const moves = record.solveMoves ?? [];
  const times = Array.isArray(record.moveTimes) && record.moveTimes.length === moves.length ? record.moveTimes : null;
  const count = moves.length || record.moveCount || 0;
  const weights = FOCUS_WEIGHT[focus] ?? FOCUS_WEIGHT.speed;
  const colorOf = face => (faceColors[face] ?? face ?? '').toLowerCase();
  const b = baselines?.reliable ? baselines : null;
  const hasKey = key => plan.some(p => p.key === key);
  const firstKey = (...keys) => keys.find(hasKey) ?? keys[0];
  const tps = Number.isFinite(record.tps) && record.tps > 0 ? record.tps : 4;

  // Stage ranges by move index, from the stage rows in plan order.
  const ranges = [];
  let acc = 0;
  for (const row of stages) {
    if (row.skipped || row.merged || !row.moves) continue;
    ranges.push({ key: row.key, from: acc, to: acc + row.moves - 1 });
    acc += row.moves;
  }
  const stageOfMove = idx => ranges.find(r => idx >= r.from && idx <= r.to)?.key ?? (ranges.length ? ranges[ranges.length - 1].key : firstKey('cross'));
  const timeOf = i => (times && times[i] != null ? times[i] : (record.solveMs ?? 0) * Math.min(1, (i + 1) / Math.max(1, count)));
  const timeBefore = i => (i <= 0 ? 0 : timeOf(i - 1));
  const slice = (from, to) => moves.slice(from, to + 1);

  const out = [];
  const push = marker => out.push({ compare: null, better: null, trainer: TRAINER_OF(marker.stage), ...marker });

  if (a) {
    // --- good moments --------------------------------------------------------------------------
    if (a.xcross && a.marks.cross != null && a.marks.cross >= 0) {
      const pairs = a.xcross === 'xxcross' ? 2 : 1;
      const label = a.xcross === 'xxcross' ? 'xx-cross' : 'x-cross';
      push({
        id: 'xcross', kind: 'xcross', tone: 'good', stage: 'cross', idx: a.marks.cross, at: a.marks.cross + 1, tMs: timeOf(a.marks.cross),
        cost: pairs * PAIR_SAVED, label,
        note: `${cap(label)}: ${pairs === 1 ? 'a pair' : 'two pairs'} came with the cross. Estimated saving: about ${pairs * PAIR_SAVED} moves for a typical pair insertion.`,
      });
    }
    for (const skip of a.skips) {
      if (skip.kind === 'xcross') continue;
      if (skip.kind === 'pair') {
        push({
          id: `free-pair-${skip.idx}`, kind: 'free-pair', tone: 'good', stage: stageOfMove(skip.idx), idx: skip.idx, at: skip.idx + 1, tMs: timeOf(skip.idx),
          cost: PAIR_SAVED * Math.max(1, (skip.count ?? 2) - 1), label: 'free pair',
          note: `Free pair: ${skip.count ?? 2} pairs went in with one move. Estimated saving: about ${PAIR_SAVED} moves for a typical pair insertion.`,
        });
        continue;
      }
      const stage = { eo: firstKey('eo', 'oll'), co: firstKey('co', 'oll'), oll: firstKey('eo', 'oll'), pll: firstKey('ep', 'pll'), cp: firstKey('cp', 'pll') }[skip.kind] ?? stageOfMove(skip.idx);
      const name = skip.kind.toUpperCase();
      const saved = SKIP_SAVED[skip.kind] ?? 6;
      push({
        id: `skip-${skip.kind}`, kind: 'skip', tone: 'good', stage, idx: skip.idx, at: skip.idx + 1, tMs: timeOf(skip.idx),
        cost: saved, label: `${skip.kind} skip`,
        note: `${name} skip. That step was done for you. Estimated saving: about ${saved} moves for a typical ${name} algorithm.`,
      });
    }
    for (const n of a.pseudo) {
      const at = a.marks.pairs[n - 1];
      if (at == null || at < 0) continue;
      push({
        id: `pseudo-${n}`, kind: 'pseudo', tone: 'good', stage: `pair${n}`, idx: at, at: at + 1, tMs: timeOf(at),
        cost: PSEUDO_VALUE, label: `pair ${n} pseudo`,
        note: `Pair ${n} went in pseudo, with the D layer offset. Worth comparing with the plain pair.`,
      });
    }

    // --- cross: spare moves and detours ------------------------------------------------------------
    const cross = a.cross;
    if (cross?.done) {
      for (const loss of cross.losses) {
        const remaining = cross.moves - loss.i;   // moves from here to the cross, this one included
        const shortest = loss.d;
        const detour = loss.loss === 2;
        const compare = b && b.crossExtra != null ? `you average ${num1(b.crossExtra)} spare` : null;
        const total = `${cross.d0} vs your ${cross.moves}`;
        push({
          id: `cross-${detour ? 'detour' : 'extra'}-${loss.i}`, kind: detour ? 'detour' : 'extra-move', tone: 'warn', stage: 'cross',
          idx: loss.i, at: loss.i, tMs: timeOf(loss.i), cost: loss.loss * weights.cross, rawCost: loss.loss, label: detour ? 'detour' : 'extra move',
          note: detour
            ? `Move ${loss.i + 1}, ${fmtMoves(loss.move)}: that turned you away from the cross. The shortest way home from here was ${fmtMoves(loss.best)}, ${plural(shortest, 'more move')}; you took ${remaining} more (${total}).`
            : `Move ${loss.i + 1}, ${fmtMoves(loss.move)}, cost a spare turn. From here: ${fmtMoves(loss.best)} (${plural(shortest, 'move')}). You needed ${remaining}.`,
          compare, better: loss.best ? { from: loss.i, yours: slice(loss.i, cross.moves - 1), moves: words(loss.best) } : null,
        });
      }
      // A cross on another face was clearly shorter.
      const faces = cross.faces ?? {};
      const others = Object.entries(faces).filter(([face, length]) => face !== a.face && Number.isFinite(length));
      const best = others.sort((x, y) => x[1] - y[1])[0];
      if (best && cross.d0 - best[1] >= 2) {
        push({
          id: 'better-cross', kind: 'better-cross', tone: 'warn', stage: 'cross', idx: 0, at: 0, tMs: 0, cost: Math.min(3, cross.d0 - best[1] - 1) * weights.better, rawCost: Math.min(3, cross.d0 - best[1] - 1),
          label: 'better cross',
          note: `PB cross: ${colorOf(best[0])}, ${plural(best[1], 'move')}. Your ${colorOf(a.face)} cross took ${cross.moves} moves. Worth a look during inspection.`,
        });
      }
    }

    // --- F2L: a shorter pair was there (pairs 1 and 2) ------------------------------------------------
    for (const pair of a.pairs) {
      if (pair.unsupported || !pair.better) continue;
      const yours = words(pair.yours);
      const shorter = words(pair.better.moves);
      const diff = yours.length - shorter.length;
      if (diff < 2) continue;
      push({
        id: `better-pair-${pair.n}`, kind: 'better-pair', tone: 'warn', stage: `pair${pair.n}`, idx: pair.from, at: pair.from, tMs: timeBefore(pair.from),
        cost: Math.min(3, diff - 1) * weights.better, rawCost: Math.min(3, diff - 1), label: 'better pair',
        note: `Pair ${pair.n} took ${plural(yours.length, 'move')}. The ${pair.better.slot} slot was ${shorter.length} away: ${fmtMoves(pair.better.moves)}. Worth checking the ${pair.better.slot} slot first.`,
        better: { from: pair.from, yours, moves: shorter },
      });
    }

    // --- pauses ------------------------------------------------------------------------------------------
    const usualMs = b?.medianGapMs ?? a.medianGapMs;
    for (const pause of a.pauses) {
      const excess = Math.max(0, pause.ms - pause.allow);
      const start = times ? times[pause.i - 1] ?? 0 : timeBefore(pause.i);
      const tMs = times ? (start + times[pause.i]) / 2 : start;
      const beforeAlg = /oll|pll/.test(pause.boundary);
      const tip = /^(cross-f2l|f2l-f2l)$/.test(pause.boundary) ? 'Try looking at the next pair while you insert this one.'
        : beforeAlg ? 'Worth a look: recognize the case before the last move of the stage.' : 'A stop in the middle of a stage.';
      push({
        id: `pause-${pause.i}`, kind: 'pause', tone: 'warn', stage: stageOfMove(pause.i), idx: pause.i, at: pause.i, tMs,
        cost: Math.min(6, (excess / 1000) * tps) * weights.pause, rawCost: Math.min(6, (excess / 1000) * tps), label: `pause ${secs(pause.ms)}`,
        note: `${secs(pause.ms)} stop before ${fmtMoves(moves[pause.i] ?? '')}${usualMs ? ` (you usually move every ${secs(usualMs)})` : ''}. ${tip}`,
        compare: usualMs ? `usual ${secs(usualMs)}` : null, trainer: 'lookahead',
      });
    }

    // --- last-layer re-recognition: only the corroborated catalog transitions -----------------
    for (const key of ['oll', 'pll']) {
      const stage = a.lastLayer?.[key];
      if (!stage?.extraLook) continue;
      for (const look of (stage.looks ?? []).filter(row => ['pause', 'known-alg-prefix'].includes(row.evidence))) {
        const alg = look.recognizedAlgMoves ? fmtMoves(look.recognizedAlgMoves) : null;
        const source = look.evidence === 'pause' ? 'after a pause' : `after ${alg ?? 'a catalog alg prefix'}`;
        push({
          id: `${key}-extra-look-${look.at}`, kind: 'extra-look', tone: 'warn', stage: key,
          idx: look.at, at: look.at + 1, tMs: timeOf(look.at), cost: 4 * weights.better, rawCost: 4,
          label: `${key.toUpperCase()} extra look`, caseId: stage.caseId, nextCaseId: look.caseId,
          caseName: stage.name, nextCaseName: look.name, recognizedAlg: look.recognizedAlg ?? null,
          note: `${key.toUpperCase()} ${stage.name} → ${look.name}. You reached another catalog case ${source} and continued.`,
        });
      }
    }

    // --- cancellations -------------------------------------------------------------------------------------
    for (const run of a.cancels) {
      const text = slice(run.from, run.to).join(' ');
      push({
        id: `cancel-${run.from}`, kind: 'cancel', tone: 'warn', stage: stageOfMove(run.from), idx: run.from, at: run.from, tMs: timeOf(run.from),
        cost: run.waste * weights.cancel, rawCost: run.waste, label: 'cancel',
        note: `${fmtMoves(text)} can be shorter: ${plural(run.waste, 'spare move')}.`,
        compare: b && b.cancelWaste != null ? `you average ${num1(b.cancelWaste)}` : null,
      });
    }
  }

  // --- rotations (from the gyro, recorded on the solve) ----------------------------------------------------
  const marks = Array.isArray(record.rotationMarks) ? record.rotationMarks : [];
  marks.forEach((mark, k) => {
    const idx = Math.min(Math.max(0, mark.idx), Math.max(0, count - 1));
    const avg = b?.rotations;
    push({
      id: `rotation-${k}`, kind: 'rotation', tone: 'warn', stage: stageOfMove(idx), idx, at: idx, tMs: Number.isFinite(mark.tMs) ? mark.tMs : timeBefore(idx),
      cost: ROTATION_COST * weights.rotation, rawCost: ROTATION_COST, label: 'rotation',
      note: `${plural(marks.length, 'rotation')} this solve${avg != null ? ` · you average ${num1(avg)}` : ''}. This one: the cube turned in your hands before move ${idx + 1}.`,
      compare: avg != null ? `you average ${num1(avg)}` : null, trainer: 'lookahead',
    });
  });

  // --- rank --------------------------------------------------------------------------------------------------
  for (const marker of out) {
    marker.score = marker.tone === 'good' ? marker.cost * GOOD_DISCOUNT * weights.good : marker.cost;
    marker.tMs = Math.max(0, Math.round(marker.tMs ?? 0));
    marker.stageLabel = plan.find(p => p.key === marker.stage)?.label ?? marker.stage;
  }
  out.sort((x, y) => y.score - x.score || x.idx - y.idx);
  out.forEach((marker, i) => { marker.rank = i + 1; marker.prominent = i < PROMINENT; });
  // Keep at least one good moment among the prominent ones (when there is one): it is where you were good.
  const goodFirst = out.findIndex(m => m.tone === 'good');
  if (goodFirst >= PROMINENT && !out.slice(0, PROMINENT).some(m => m.tone === 'good')) {
    out[PROMINENT - 1].prominent = false;
    out[goodFirst].prominent = true;
  }
  // The default selection is the most costly moment (a bad one when there is one).
  const defaultMarker = out.find(m => m.tone === 'warn') ?? out[0] ?? null;
  return { markers: out, defaultId: defaultMarker?.id ?? null, prominentIds: out.filter(m => m.prominent).map(m => m.id) };
}

export { TRAINER_OF };
