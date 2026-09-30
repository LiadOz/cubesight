// Whole-cube rotation counting from noisy held-orientation reads.
//
// The held orientation (gyro / 3D view) flickers between faces while the cube
// is regripped or wobbles in the hand, so a raw change of the bottom face is not
// a rotation. A rotation counts only when the held orientation (bottom AND front
// when known) changes to a new orientation that persists: the same new reading
// on at least `minReads` consecutive reads spanning at least `minMs` of time.
// Reads taken during a face turn are ignored and break any pending candidate.
// Pure state machine; no clock of its own.

export const ROTATION_MIN_READS = 3;
export const ROTATION_MIN_MS = 300;

const keyOf = o => (o?.bottom ? `${o.bottom}${o.front ?? ''}` : null);
const plain = o => ({ bottom: o.bottom, front: o.front ?? null });

export function createRotationTracker({ minReads = ROTATION_MIN_READS, minMs = ROTATION_MIN_MS } = {}) {
  let held = null;       // { key, bottom, front } the stable orientation
  let cand = null;       // { key, o, reads, at, idx }
  let count = 0;
  let marks = [];

  return {
    // read: { bottom, front? }; at: time (ms) of the read; idx: solve-move index;
    // duringTurn: the read was taken mid face turn (ignored).
    // Returns the new mark when this read confirms a rotation, else null.
    observe(read, { at = 0, idx = 0, duringTurn = false } = {}) {
      const key = keyOf(read);
      if (!key) return null;
      if (duringTurn) { cand = null; return null; }
      if (!held) { held = { key, ...plain(read) }; return null; }
      if (key === held.key) { cand = null; return null; }
      if (cand && cand.key === key) cand.reads++;
      else cand = { key, o: plain(read), reads: 1, at, idx, lastAt: at };
      cand.lastAt = at;
      if (cand.reads >= minReads && cand.lastAt - cand.at >= minMs) {
        const mark = { idx: cand.idx, tMs: cand.at, from: { bottom: held.bottom, front: held.front }, to: cand.o };
        held = { key, ...cand.o };
        cand = null;
        count++;
        marks.push(mark);
        return mark;
      }
      return null;
    },
    get count() { return count; },
    get marks() { return marks.map(m => ({ ...m })); },
    reset() { held = null; cand = null; count = 0; marks = []; },
  };
}
