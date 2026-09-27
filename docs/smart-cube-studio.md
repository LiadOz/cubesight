# Smart Cube Studio (local prototype)

`#/smart-cube` is a connection-first debug workspace, separate from Cross
Scout. Connect and sync a solved cube, then switch between:

- **Inspect tracking:** a live cube, the last decoded move, gyro count and
  quaternion, and a bounded event log (all moves, every 20th gyro sample).
  Copy diagnostic exports those decoded observations, not a MAC address.
- **Scramble rehearsal:** generate or enter a standard outer-face scramble,
  start with the physical cube solved, and perform its turns. Progress is
  checked against the tracked cube state, not a Next button. A wrong move
  preserves the attempt and shows inverse turns to return to the last matched
  state. Reaching any expected state by a different route also resumes.

The current pinned GAN decoder emits individual U/R/F/D/L/B move events with
timestamps and gyro samples. It does not emit an explicit `Uw` or `M` event,
so the Studio does not claim to recognize physical wide or slice turns. The
event log makes the actual sequence visible for experiments with your cube.
If a future decoder emits such a label, Inspect shows the raw label while the
trusted tracker desyncs rather than silently applying unsupported notation.

## Comparable projects inspected

- [cubing.js / Twizzle](https://github.com/cubing/cubing.js/blob/main/src/cubing/twisty/views/3D/puzzles/Cube3D.ts) computes an in-progress move fraction, eases it with `smootherStep`, and renders from canonical puzzle state. Its [move-duration model](https://github.com/cubing/cubing.js/blob/main/src/cubing/twisty/controllers/indexer/AlgDuration.ts) budgets more time for a half turn.
- [Rubik's Rubrics](https://github.com/leereilly/rubiks-rubrics/blob/main/index.html) uses a temporary pivot and eased progress, plus a synchronized timeline and active notation. Its teaching mode pairs cube motion with a plain-language cue.
- [CubeStation](https://cubestation.com/) publicly describes real-time reconstructions and a replay timeline. Its internal rendering implementation is not public, so those are product-level references, not source-code evidence.

The live renderer keeps its short turn queue and gyro-follow behavior. Status,
gyro, and battery updates do not repaint the cube and therefore do not cancel
an in-flight turn. Scramble arrows indicate the *next expected* or *recovery*
move; the physical cube supplies the actual movement.

## Follow-up experiment

Capture a few real `Uw`, `Dw`, and `M` attempts with Copy diagnostic and compare
the decoded move/timestamp sequence and gyro change. Only then can we decide
whether a device-specific gesture classifier is reliable enough to add. A
mere pair of rapid face events is not proof of a wide or slice turn.
