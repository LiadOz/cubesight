// Fingertricks for the default right-handed CFOP style. Drawn ON the cube by
// the move glyph (a finger marker and a push/flick arrow on the turning layer);
// `text` is the accessible alternative only.
//
// NEEDS REVIEW BY A CUBER. These are plausible defaults taken from the design
// mockups (docs/design/brain-v2/moves), not a reviewed table. Open questions:
// which style is the default, left-handed and mirrored tables, and B / S / E /
// x / z, which have no entry yet (those moves simply show no hint).
import { normalizeMove } from './notation.js';

export const FINGERTRICKS_REVIEWED = false;

/**
 * hand   'right' | 'left'
 * digit  'wrist' | 'thumb' | 'index' | 'middle' | 'ring'
 * action 'push' | 'pull' | 'flick'   (a flick is a quick push; a pull draws the layer toward the digit)
 * touch  the side face (in the user's frame) where the digit sits, when it is visible
 * The direction of the push is never stored: the glyph derives it from the
 * direction the layer travels on the touched face, so it cannot disagree with the turn.
 */
const TABLE = {
  R: { hand: 'right', digit: 'wrist', action: 'push', touch: 'F', text: 'right wrist, push up' },
  "R'": { hand: 'right', digit: 'ring', action: 'pull', touch: 'F', text: 'right ring finger, pull down' },
  R2: { hand: 'right', digit: 'wrist', action: 'push', touch: 'F', text: 'wrist push, then ring-finger flick' },
  U: { hand: 'right', digit: 'index', action: 'flick', touch: 'F', text: 'right index, flick left' },
  "U'": { hand: 'left', digit: 'index', action: 'flick', touch: 'F', text: 'left index, flick right' },
  U2: { hand: 'right', digit: 'index', action: 'flick', touch: 'F', text: 'right index twice (or index + middle)' },
  F: { hand: 'right', digit: 'index', action: 'pull', touch: 'U', text: 'right index, pull the top of the layer right' },
  "F'": { hand: 'right', digit: 'thumb', action: 'push', touch: 'U', text: 'right thumb, push the top of the layer left' },
  F2: { hand: 'right', digit: 'index', action: 'flick', touch: 'U', text: 'two right-index flicks' },
  L: { hand: 'left', digit: 'ring', action: 'pull', touch: 'F', text: 'left ring finger, pull down' },
  "L'": { hand: 'left', digit: 'wrist', action: 'push', touch: 'F', text: 'left wrist, push up' },
  D: { hand: 'right', digit: 'ring', action: 'push', touch: 'F', text: 'right ring finger, push right' },
  "D'": { hand: 'left', digit: 'ring', action: 'push', touch: 'F', text: 'left ring finger, push left' },
  r: { hand: 'right', digit: 'wrist', action: 'push', touch: 'F', text: 'right wrist (+ middle finger), push up' },
  M: { hand: 'right', digit: 'ring', action: 'pull', touch: 'F', text: 'right ring finger, pull down' },
  "M'": { hand: 'right', digit: 'middle', action: 'push', touch: 'F', text: 'right middle finger, push up' },
  y: { hand: 'right', digit: 'index', action: 'push', touch: 'F', text: 'right index pushes the whole cube left' },
  "y'": { hand: 'left', digit: 'index', action: 'push', touch: 'F', text: 'left hand pushes the whole cube right' },
};
TABLE.Rw = TABLE.r;

/** The fingertrick for a move, or null when the table has none. */
export function fingertrick(input) {
  return TABLE[normalizeMove(input)] ?? null;
}

export const FINGERTRICK_MOVES = Object.freeze(Object.keys(TABLE));
