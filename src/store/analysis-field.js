// Validation of the record fields the solve review adds: the compact analysis summary
// (src/analysis/summary.js) and the rotation marks. Kept here, next to the store, so cleanRecord
// stays readable; a bad or foreign value becomes null and never breaks loading a history.

const int = (v, min = 0, max = 100000) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const str = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : null);
const list = (v, n, map) => (Array.isArray(v) ? v.slice(0, n).map(map).filter(Boolean) : []);
const moveString = v => (typeof v === 'string' && /^[URFDLB]['2]?( [URFDLB]['2]?)*$/.test(v.trim()) ? v.trim().slice(0, 240) : '');

export function cleanRotationMarks(marks) {
  if (!Array.isArray(marks)) return null;
  return marks.slice(0, 24).map(m => (m && Number.isFinite(m.idx) && Number.isFinite(m.tMs)
    ? { idx: Math.max(0, Math.floor(m.idx)), tMs: Math.max(0, Math.round(m.tMs)), from: str(m.from?.bottom, 1), to: str(m.to?.bottom, 1) } : null)).filter(Boolean);
}

/** @returns {Object|null} */
export function cleanAnalysis(a) {
  if (!a || typeof a !== 'object' || a.v !== 1) return null;
  const marks = a.marks && typeof a.marks === 'object' ? a.marks : {};
  const cross = a.cross && typeof a.cross === 'object' ? a.cross : null;
  const out = {
    v: 1,
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
    pairs: list(a.pairs, 4, p => {
      if (!p || !int(p.n, 1, 4)) return null;
      if (p.unsupported) return { n: p.n, unsupported: str(p.unsupported, 12) };
      if (!Number.isInteger(p.from) || !Number.isInteger(p.to)) return null;
      const better = p.better && moveString(p.better.moves) ? { slot: str(p.better.slot, 4) ?? '', moves: moveString(p.better.moves), w: Number.isFinite(p.better.w) ? p.better.w : 0 } : null;
      return { n: p.n, from: p.from, to: p.to, yours: moveString(p.yours), w: Number.isFinite(p.w) ? p.w : 0, better, shortest: int(p.shortest), proven: Boolean(p.proven) };
    }),
  };
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
  return out;
}
