# CubeSight smart-cube investigation handoff

This repository is checked out at `/home/loz/projects/cubesight` on branch
`feature/smart-cube-guidance`. The remote is
`https://github.com/LiadOz/cubesight.git`. This is development work only; **do
not deploy as part of this handoff**. The next agent should start from this
branch, read this file and `docs/smart-cube-studio.md`, and verify the current
behavior with the user's physical GAN cube before claiming wide/slice support.

## What the user actually wants

A reusable smart-cube debug/workbench view, separate from Cross Scout. Connect
the cube and select experiments such as tracking inspection and a real-cube
scramble rehearsal. For a generated scramble, show the expected move, react
to the *actual* cube, explain what happens after a mistake, and show how to
return. Make it obvious which face turns, gyro changes, wide turns, and slice
turns the device really reports. The user explicitly rejected a standalone
simulated algorithm player and a native Android app.

The user's messages are dictated; interpret mangled terms generously. In chat,
do not put trailing punctuation directly after a branch name.

## Current local implementation

- `#/smart-cube` opens **Smart Cube Studio**. It defaults to Inspect tracking,
  with a shared Connect / Sync solved cube / Disconnect control, a live 3D cube,
  device/protocol status, decoded event log, gyro count and quaternion, and
  explicit wide/slice-label readouts. Every decoded move is shown with the
  available serial and timestamps. Only every 20th gyro event is printed, but
  all are counted. Copy diagnostic exports the bounded observations as JSON,
  excluding the saved MAC address.
- Scramble rehearsal generates 12 outer-face moves or accepts a pasted
  standard scramble. It starts only when a physical solved cube has a trusted
  synced baseline. The next cue/arrow changes only when the session's tracked
  state reaches a planned state. A wrong turn keeps the attempt and shows
  inverse recovery moves; reaching a planned state by another route resumes.
  There is deliberately no manual Next button in this mode.
- `src/smart-cube-session.js` now offers `subscribeEvents(listener)` for
  decoded observations independently of the trusted state snapshots. It
  captures moves even before solved sync, and a failing diagnostic listener
  cannot interrupt tracking. Existing `subscribe(listener)` remains the
  canonical-state API shared with Cross Scout.
- The shared 3D renderer has smooth queued live turns, gyro following, a
  reliable reset/recenter, and optional face-bound turn arrows. Gyro/status
  updates in Studio do not repaint the cube or cancel an active turn.
- Cross Scout also gained a reusable move cue and off-plan recovery without
  discarding the selected plan. These changes are part of this branch.

## Critical capability boundary

The pinned `smartcube-web-bluetooth` GAN decoder currently emits `MOVE`
events labeled `U R F D L B` (plus `GYRO`, `FACELETS`, etc.). It does **not**
label a physical `Uw`, `Dw`, `Rw`, or `M/E/S` as one verified move. Its event
types and GAN decoding are visible in
`node_modules/smartcube-web-bluetooth/src/smartcube/types.ts` and
`node_modules/smartcube-web-bluetooth/src/gan-cube-protocol.ts`. Studio shows
the decoded stream honestly; it does not infer a wide/slice gesture from a
couple of fast face events. The generic cube model can simulate all six wide
face moves, but the trusted Bluetooth session intentionally rejects a new
unsupported label and goes `desynced` instead of corrupting cube state.

No real GAN 16 UI hardware check was performed in this environment. The
mocked-device tests establish software behavior, **not** the physical cube's
packet pattern. The next experiment should be to perform individual `Uw`,
`Dw`, `Rw`, `M`, ordinary outer turns, and whole-cube rotations at several
speeds, then compare copied diagnostics. Avoid promising gesture detection
until the results distinguish these cases reliably.

## Reproduce locally

```sh
cd /home/loz/projects/cubesight
npm install
npm run dev
```

Open `http://localhost:5173/#/smart-cube` (or the port Vite prints). In a
Web-Bluetooth-capable browser on HTTPS or localhost, connect the GAN cube.
If requested, the existing MAC help in Cross Scout explains how to find the
address; a verified address is remembered in browser local storage. Sync only
when the physical cube is solved. In Inspect tracking, try normal, wide, and
slice turns and use **Copy diagnostic** to preserve what the decoder emitted.
For Scramble rehearsal, use a short reproducible sequence such as `R U`, start
from solved, then try `R`, an intentionally wrong `F`, `F'` to recover, and
finally `U`.

## Verification done for this branch

- `npm run test:unit`: 66 passing, including wide-move model invariants,
  decoded event subscriptions, and unsupported wide/slice labels.
- `npm test`: full Playwright browser suite, 78 passing.
- Focused Playwright tests (`tests/smart-cube-studio.spec.js`,
  `tests/smart-cube.spec.js`, `tests/routing.spec.js`): pass with mocked smart
  cube, including wrong-turn recovery, gyro packets not cancelling animation,
  route refresh, and mobile width.
- `npm run test:pwa`: offline production PWA test passes with the Studio route.
- `npm run build`: passes. Vite prints a pre-existing warning that the local
  Node 22.8.0 is older than its preferred 22.12+ requirement, and a chunk-size
  warning. Neither prevented build or tests.

Rerun the relevant suites after any follow-up changes. These tests use a
mocked smart-cube stream; physical GAN gesture behavior still needs a trace.

## Code map and next steps

- `src/smart-cube-studio.js` / `.css`: workbench UI and scramble experiment.
- `src/smart-cube-session.js`: device-neutral trusted state and diagnostics.
- `src/smart-cube-bluetooth.js`: protocol adapter and remembered MAC use.
- `src/cube-3d.js`: renderer, arrows, live turn queue, gyro/reset.
- `src/cross-cube.js`: canonical cube state and move simulator.
- `src/smart-cube-guidance.js` and `src/smart-cube-turn-guide.js`: shared
  descriptions and off-route progress/recovery.
- `docs/smart-cube-studio.md` and `docs/smart-cube-guidance.md`: design and
  comparison notes.

Prioritize real event-trace collection, then decide whether reliable
wide/slice *inference* is possible. If not, keep the honest decoded-event
view and state-based scramble feedback. Do not replace this with an unrelated
visual turn player. Any deployment later must be done from a separate
worktree and integrated with the deployed checkout's current history before
fast-forwarding it; never reset the installed checkout onto this branch.
