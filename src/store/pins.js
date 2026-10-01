// Pinned moments from the solve review ("saved cases"). A pin is one position of one solve that
// the user wants to come back to; the trainers phase opens it in the matching trainer, at exactly
// that position. Stored in the `pins` object store of the history database (src/store/idb.js,
// DB version 2) next to the solves, written through the same backend, never synced anywhere.
//
// Data model (one object per pin, keyPath `id`):
//   id         `${at}:${stage}:${moveIdx}`  deterministic, so pinning the same moment twice is one pin (toggle)
//   at         the solve record's timestamp (record.at); the pin survives deleting the solve, it is self-contained
//   moveIdx    0-based index of the moment in record.solveMoves; the position is "scramble + movesUpTo"
//   stage      stage key of the stage plan: cross | pair1..pair4 | eo co oll | cp ep pll
//   kind       what the marker was: detour | extra-move | better-pair | better-cross | pause | rotation | cancel |
//              x-cross | skip | free-pair | pseudo | stage (a stage pinned from its detail view)
//   trainer    where it opens: cross | f2l | oll | pll | lookahead (see TRAINERS)
//   scramble   the solve's scramble (WCA notation, the cube starts solved, turns applied in the cube's own frame)
//   crossFace  the face the cross was built on (U D F B R L), for the trainers that take a face
//   movesUpTo  the solve moves played BEFORE the moment, in the cube's frame (length === moveIdx)
//   yours      what the user played from the moment to the end of the stage (may be empty for stage-less pins)
//   better     the shorter way from the same position, or null when there is none yet
//   note       one line of coach text shown on the pin ("Pair 1 took 11 moves...")
//   createdAt  ms since epoch
//
// Trainer contract (trainers phase): a trainer that accepts a pin starts from
// stateFromScramble([...scramble, ...movesUpTo].join(' ')), treats `better` as the model answer
// and `yours` as the attempt to beat; drills may randomise everything the solution does not
// depend on (docs/ideas/FEATURES.md 24). Nothing here needs the network.

import { parseScramble } from '../cross-cube.js';

export const TRAINERS = Object.freeze(['cross', 'f2l', 'oll', 'pll', 'lookahead']);
export const PIN_CAP = 500;
const FACES = ['U', 'D', 'F', 'B', 'R', 'L'];
const MOVE = /^[URFDLB]['2]?$/;

export const pinId = (at, stage, moveIdx) => `${at}:${stage}:${moveIdx}`;

const moveList = (list, max = 300) => (Array.isArray(list) ? list.filter(m => typeof m === 'string' && MOVE.test(m)).slice(0, max) : []);

/** Validate a raw pin; returns the clean pin or null. */
export function cleanPin(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Number.isFinite(raw.at) || !Number.isInteger(raw.moveIdx) || raw.moveIdx < 0) return null;
  if (typeof raw.stage !== 'string' || !raw.stage) return null;
  if (!TRAINERS.includes(raw.trainer)) return null;
  const scramble = typeof raw.scramble === 'string' ? raw.scramble.trim().slice(0, 600) : '';
  try { parseScramble(scramble); } catch { return null; }
  const movesUpTo = moveList(raw.movesUpTo);
  if (movesUpTo.length !== raw.moveIdx) return null;
  const better = Array.isArray(raw.better) ? moveList(raw.better, 60) : null;
  return {
    id: pinId(raw.at, raw.stage.slice(0, 8), raw.moveIdx),
    at: raw.at,
    moveIdx: raw.moveIdx,
    stage: raw.stage.slice(0, 8),
    kind: typeof raw.kind === 'string' ? raw.kind.slice(0, 16) : 'stage',
    trainer: raw.trainer,
    scramble,
    crossFace: FACES.includes(raw.crossFace) ? raw.crossFace : null,
    movesUpTo,
    yours: moveList(raw.yours, 60),
    better: better && better.length ? better : null,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 280) : '',
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

/**
 * @param {{backend:{getPins:Function, applyPins:Function}, readOnly?:()=>boolean, onError?:(text:string)=>void, now?:()=>number}} options
 */
export function createPinStore({ backend, readOnly = () => false, onError = () => {}, now = Date.now } = {}) {
  let pins = [];
  let queue = Promise.resolve();
  let loaded = false;
  const write = batch => {
    queue = queue.then(() => backend.applyPins(batch)).catch(error => onError(`Could not save your pins (${error?.message || error}).`));
    return queue;
  };
  const store = {
    async load() {
      if (loaded) return store;
      loaded = true;
      try { pins = (await backend.getPins()).map(cleanPin).filter(Boolean); } catch (error) { onError(`Your pins could not be read (${error?.message || error}).`); }
      return store;
    },
    async reload() {
      await queue;
      try { pins = (await backend.getPins()).map(cleanPin).filter(Boolean); } catch (error) { onError(`Your pins could not be read (${error?.message || error}).`); }
      return pins;
    },
    /** Every pin, oldest first. */
    get list() { return pins; },
    get count() { return pins.length; },
    has: id => pins.some(p => p.id === id),
    forRecord: at => pins.filter(p => p.at === at),
    byTrainer: trainer => pins.filter(p => p.trainer === trainer),
    /** Pin a moment (or return the existing pin). Returns the pin, or null when it is invalid, the store is full or read-only. */
    add(raw) {
      if (readOnly()) return null;
      const pin = cleanPin({ createdAt: now(), ...raw });
      if (!pin) return null;
      const existing = pins.find(p => p.id === pin.id);
      if (existing) return existing;
      if (pins.length >= PIN_CAP) return null;
      pins = [...pins, pin].sort((a, b) => a.createdAt - b.createdAt);
      void write({ put: [pin] });
      return pin;
    },
    remove(id) {
      if (readOnly() || !pins.some(p => p.id === id)) return false;
      pins = pins.filter(p => p.id !== id);
      void write({ remove: [id] });
      return true;
    },
    /** Pin when absent, unpin when present. Returns the pin when it is now pinned, else null. */
    toggle(raw) {
      const id = pinId(raw?.at, typeof raw?.stage === 'string' ? raw.stage.slice(0, 8) : '', raw?.moveIdx);
      if (store.has(id)) { store.remove(id); return null; }
      return store.add(raw);
    },
    /** Merge a backup without duplicating moments; report newly added pins. */
    importPins(list) {
      let count = 0;
      for (const raw of Array.isArray(list) ? list : []) {
        const pin = cleanPin(raw);
        if (pin && !store.has(pin.id) && store.add(pin)) count++;
      }
      return count;
    },
    /** Resolves when every queued write has reached the backend. */
    flush() { return queue; },
  };
  return store;
}
