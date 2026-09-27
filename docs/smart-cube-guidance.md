# Smart-cube guidance (local draft)

Cross Scout is the first consumer. The connection/session layer remains
device-neutral; the move cue and plan-progress functions live in
`src/smart-cube-turn-guide.js` and `src/smart-cube-guidance.js` so another trainer
can reuse them without importing Cross Scout.

## Interaction contract

- Keep the canonical cube state separate from its on-screen held orientation.
  The card names the move letter, physical face position, center color, and
  clockwise/counterclockwise direction as viewed directly at that face.
- For a manual scramble, Previous/Next walks the notation; it does **not** claim
  to verify physical turns. A connected cube advances a selected plan by state.
- If a physical turn leaves the selected plan, retain the plan, mirror the real
  cube state, and show inverse turns to return to the last matched state. If the
  user reaches any planned state by another route, resume there. Re-analysis is
  an explicit action.
- Live turns animate briefly and in order. A bounded queue catches up to the
  latest verified state during very fast turning or after a background tab.
  Gyro motion remains independent of the turn animation.
- Reset view restores the camera and clears drag momentum. With live gyro it
  re-anchors the current physical hold; users first match the top/front center
  colors shown on screen.
- Retrieval practice hides the move cue until the plan is revealed.

## Wide and slice moves

The currently pinned GAN decoder emits outer-face `U R F D L B` move events,
gyro samples, and facelet states, but no explicit wide/slice move label. A
physical `Uw`, for example, may look like a combination of outer turns and
whole-cube rotation. Timing, gyro, and final state may let us *infer* such a
gesture, but that is not proof of how the fingers moved. A future algorithm
trainer can accept a target wide move by equivalent final state while labeling
the recognition as inferred. Before adding a wide-move heuristic, capture real
GAN 16 UI event traces for `Uw`, `Dw`, `Rw`, and pure cube rotations, including
fast and slow examples, and check for ambiguous sequences.

This draft is intentionally local; no server deployment is part of it.
