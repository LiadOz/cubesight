// Validation of the record fields the solve review adds: the compact analysis summary
// (src/analysis/summary.js) and the rotation marks. Kept here, next to the store, so cleanRecord
// stays readable; a bad or foreign value becomes null and never breaks loading a history.

const int = (v, min = 0, max = 100000) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const str = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : null);
const list = (v, n, map) => (Array.isArray(v) ? v.slice(0, n).map(map).filter(Boolean) : []);
const moveString = v => (typeof v === 'string' && /^(?:[URFDLBMESxyz](?:w)?|[urfdlb])(?:2|')?(?: (?:[URFDLBMESxyz](?:w)?|[urfdlb])(?:2|')?)*$/.test(v.trim()) ? v.trim().slice(0, 600) : '');

export function cleanRotationMarks(marks) {
  if (!Array.isArray(marks)) return null;
  return marks.slice(0, 24).map(m => (m && Number.isFinite(m.idx) && Number.isFinite(m.tMs)
    ? { idx: Math.max(0, Math.floor(m.idx)), tMs: Math.max(0, Math.round(m.tMs)), from: str(m.from?.bottom, 1), to: str(m.to?.bottom, 1) } : null)).filter(Boolean);
}

/** @returns {Object|null} */
export function cleanAnalysis(a) {
  if (!a || typeof a !== 'object' || ![1, 2].includes(a.v)) return null;
  const marks = a.marks && typeof a.marks === 'object' ? a.marks : {};
  const cross = a.cross && typeof a.cross === 'object' ? a.cross : null;
  const out = {
    v: a.v,
    engine: int(a.engine) ?? 0,
    face: ['U', 'D', 'F', 'B', 'R', 'L'].includes(a.face) ? a.face : 'D',
    crossSource: ['orient', 'inferred', 'default', 'given'].includes(a.crossSource) ? a.crossSource : 'default',
    solved: Boolean(a.solved),
    timed: Boolean(a.timed),
    marks: {
      cross: Number.isInteger(marks.cross) ? marks.cross : null,
      pairs: Array.from({ length: 4 }, (_, i) => (Number.isInteger(marks.pairs?.[i]) ? marks.pairs[i] : null)),
      eo: Number.isInteger(marks.eo) ? marks.eo : null, co: Number.isInteger(marks.co) ? marks.co : null,
      cp: Number.isInteger(marks.cp) ? marks.cp : null, solved: Number.isInteger(marks.solved) ? marks.solved : null,
    },
    xcross: a.xcross === 'xcross' || a.xcross === 'xxcross' ? a.xcross : null,
    skips: list(a.skips, 12, s => (s && typeof s.kind === 'string' && Number.isInteger(s.idx)
      ? { kind: s.kind.slice(0, 8), idx: s.idx, ...(int(s.count) ? { count: int(s.count) } : {}), ...(s.pseudo ? { pseudo: true } : {}) } : null)),
    pseudo: list(a.pseudo, 4, n => int(n, 1, 4)),
    offsets: list(a.offsets, 24, offset => (offset && Number.isInteger(offset.at)
      ? { at: offset.at, resolvedAt: int(offset.resolvedAt), used: Boolean(offset.used), stray: Boolean(offset.stray) } : null)),
    pauses: list(a.pauses, 8, p => (p && Number.isInteger(p.i) && Number.isFinite(p.ms)
      ? { i: p.i, ms: Math.round(p.ms), allow: int(p.allow) ?? 0, stage: str(p.stage, 8) ?? '', boundary: str(p.boundary, 12) ?? '' } : null)),
    medianGapMs: Number.isFinite(a.medianGapMs) ? Math.round(a.medianGapMs) : null,
    cancels: list(a.cancels, 8, c => (c && Number.isInteger(c.from) && Number.isInteger(c.to) ? { from: c.from, to: c.to, waste: int(c.waste, 1, 50) ?? 1 } : null)),
    cross: null,
    ...(a.v >= 2 ? { ollCase: null, pllCase: null } : {}),
    pairs: list(a.pairs, 4, p => {
      if (!p || !int(p.n, 1, 4)) return null;
      if (p.unsupported) return { n: p.n, unsupported: str(p.unsupported, 12) };
      if (!Number.isInteger(p.from) || !Number.isInteger(p.to)) return null;
      const slots = value => list(value, 4, slot => ['FR', 'BR', 'BL', 'FL'].includes(slot) ? slot : null);
      const option = o => {
        if (!o || !moveString(o.moves)) return null;
        return {
          slots: slots(o.slots), moves: moveString(o.moves), stm: int(o.stm, 0, 60) ?? 0, etm: int(o.etm, 0, 60) ?? 0,
          generators: str(o.generators, 12) ?? '', ergonomicScore: Number.isFinite(o.ergonomicScore) ? o.ergonomicScore : 0,
          plannerWeight: Number.isFinite(o.plannerWeight) ? o.plannerWeight : 0,
          ...(o.source === 'recorded-fallback' ? { source: o.source } : {}), proven: o.proven !== false,
          goalShift: int(o.goalShift, 0, 3) ?? 0,
        };
      };
      const better = p.better && moveString(p.better.moves) ? {
        slot: str(p.better.slot, 8) ?? '', slots: slots(p.better.slots), moves: moveString(p.better.moves),
        w: Number.isFinite(p.better.w) ? p.better.w : 0, stm: int(p.better.stm, 0, 60) ?? 0,
        etm: int(p.better.etm, 0, 60) ?? 0, generators: str(p.better.generators, 12) ?? '',
        ergonomicScore: Number.isFinite(p.better.ergonomicScore) ? p.better.ergonomicScore : 0,
        goalShift: int(p.better.goalShift, 0, 3) ?? 0,
      } : null;
      return {
        n: p.n, from: p.from, to: p.to, yours: moveString(p.yours), w: Number.isFinite(p.w) ? p.w : 0,
        ...(a.v >= 2 ? { yoursErgonomicScore: Number.isFinite(p.yoursErgonomicScore) ? p.yoursErgonomicScore : null } : {}),
        ...(a.v >= 2 ? {
          frame: int(p.frame, 0, 3) ?? 0,
          proofScope: ['cross-and-pair-up-to-D-offset', 'D-offset-start-and-cross-up-to-D-offset-end'].includes(p.proofScope) ? p.proofScope : 'cross-and-pair-up-to-D-offset',
          chosenSlot: ['FR', 'BR', 'BL', 'FL'].includes(p.chosenSlot) ? p.chosenSlot : null,
          chosenSlots: slots(p.chosenSlots), chosenShortest: int(p.chosenShortest, 0, 60), chosenProven: Boolean(p.chosenProven),
          bestSlot: ['FR', 'BR', 'BL', 'FL'].includes(p.bestSlot) ? p.bestSlot : null,
          options: list(p.options, 8, option), ms: Number.isFinite(p.ms) ? p.ms : null, complete: Boolean(p.complete),
        } : {}),
        better: better ? (a.v >= 2 ? better : { slot: better.slot, moves: better.moves, w: better.w }) : null,
        shortest: int(p.shortest), proven: Boolean(p.proven),
      };
    }),
    lastLayerReference: Number.isFinite(a.lastLayerReference) ? Math.max(0, a.lastLayerReference) : null,
    lastLayer: null,
  };
  for (const field of (a.v >= 2 ? ['ollCase', 'pllCase'] : [])) {
    const item = a[field];
    if (item && typeof item.id === 'string') out[field] = {
      id: item.id.slice(0, 24),
      ...(field === 'pllCase' ? { auf: ['', 'U', 'U2', "U'"].includes(item.auf) ? item.auf : null } : {}),
      recognitionMs: Number.isFinite(item.recognitionMs) && item.recognitionMs >= 0 ? Math.round(item.recognitionMs) : null,
      executionMs: Number.isFinite(item.executionMs) && item.executionMs >= 0 ? Math.round(item.executionMs) : null,
    };
  }
  if (cross) {
    out.cross = {
      moves: int(cross.moves) ?? 0, d0: int(cross.d0) ?? 0, extra: int(cross.extra, 0, 60), total: int(cross.total) ?? 0, done: Boolean(cross.done), proven: Boolean(cross.proven),
      best: moveString(cross.best),
      faces: cross.faces && typeof cross.faces === 'object' ? Object.fromEntries(['U', 'D', 'F', 'B', 'R', 'L'].filter(f => int(cross.faces[f]) !== null).map(f => [f, cross.faces[f]])) : null,
      faceProven: cross.faceProven && typeof cross.faceProven === 'object' ? Object.fromEntries(['U', 'D', 'F', 'B', 'R', 'L'].filter(f => cross.faceProven[f] === true).map(f => [f, true])) : null,
      faceComplete: cross.faceComplete !== false,
      startProven: cross.startProven === true,
      losses: list(cross.losses, 8, l => (l && Number.isInteger(l.i) && (l.loss === 1 || l.loss === 2)
        ? { i: l.i, move: moveString(l.move), loss: l.loss, d: int(l.d) ?? 0, best: moveString(l.best), after: int(l.after) ?? 0 } : null)),
    };
  }
  const cleanAlg = value => value && typeof value === 'object' ? {
    id: str(value.id, 100), moves: moveString(value.moves), notation: str(value.notation, 600) ?? '', sourceNotation: str(value.sourceNotation, 600) ?? '', stm: int(value.stm, 0, 300) ?? 0,
    etm: int(value.etm, 0, 600) ?? 0, rank: int(value.rank, 0, 1000), credit: str(value.credit, 100) ?? '',
    source: str(value.source, 120) ?? '', sourceUrl: str(value.sourceUrl, 400) ?? '',
  } : null;
  const cleanStage = stage => {
    if (!stage || typeof stage !== 'object' || typeof stage.caseId !== 'string' || !Number.isInteger(stage.from) || !Number.isInteger(stage.to)) return null;
    const better = stage.better && Number.isFinite(stage.better.loss) && moveString(stage.better.best)
      ? { stm: int(stage.better.stm, 0, 300) ?? 0, loss: int(stage.better.loss, 0, 300) ?? 0, best: moveString(stage.better.best) } : null;
    const extraAuf = stage.extraAuf && Number.isFinite(stage.extraAuf.loss) ? {
      loss: int(stage.extraAuf.loss, 0, 20) ?? 0, indices: list(stage.extraAuf.indices, 8, int).filter(Number.isInteger),
      used: moveString(stage.extraAuf.used), best: moveString(stage.extraAuf.best),
    } : null;
    const used = stage.used && typeof stage.used === 'object' ? {
      moves: moveString(stage.used.moves), core: moveString(stage.used.core), stm: int(stage.used.stm, 0, 300) ?? 0,
      coreStm: int(stage.used.coreStm, 0, 300) ?? 0, auf: moveString(stage.used.auf), aufStm: int(stage.used.aufStm, 0, 20) ?? 0,
    } : null;
    return {
      caseId: str(stage.caseId, 24), name: str(stage.name, 80) ?? '', number: int(stage.number, 1, 100), from: stage.from, to: stage.to,
      used, best: cleanAlg(stage.best), better, extraAuf,
      recognitionMs: Number.isFinite(stage.recognitionMs) ? Math.max(0, Math.round(stage.recognitionMs)) : null,
      executionMs: Number.isFinite(stage.executionMs) ? Math.max(0, Math.round(stage.executionMs)) : null,
    };
  };
  if (a.lastLayer && typeof a.lastLayer === 'object') out.lastLayer = {
    oll: cleanStage(a.lastLayer.oll), pll: cleanStage(a.lastLayer.pll),
    reference: Number.isFinite(a.lastLayer.reference) ? Math.max(0, a.lastLayer.reference) : null,
  };
  return out;
}
