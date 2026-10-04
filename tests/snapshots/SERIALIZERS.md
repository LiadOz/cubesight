# Snapshot view-model contract

Every F9 browser cell must capture the JSON-safe model that the visible page
actually renders. A missing owner serializer is a failing test; route metadata
and an `owner pending` placeholder are not state snapshots.

## Runtime API

The active page exposes `window.__cubesightSnapshot.getViewModel()`. It returns
a plain object derived from the same model passed to the renderer. It must not
contain DOM nodes, callbacks, WebGL objects, storage handles, wall-clock reads,
or unseeded random values. Date-like values must come from the fixed fixture
clock. The method is read-only and must not advance the page state.

The F0 snapshot bridge returns this stable envelope, including the shared
shell model on every active page:

```json
{"schemaVersion":1,"owner":"F5","dataOwner":"F6","route":"/progress","state":"goal-progress","viewModel":{},"shared":{}}
```

The page's `viewModel` is the owner-specific object consumed by its renderer;
it does not need an extra wrapper. F0 owns the active-page bridge in
`src/main.js`: it points at the mounted page's `getViewModel()` handle and
combines that page model with the shared header, connection menu, dev drawer,
and recorder model. Keep field names and enum values stable; intentional
schema changes appear in the reviewed snapshot diff. Pure fixture builders may
also be tested directly, as Brain's `buildViewModel()` fixtures are, but they
do not replace runtime page capture.

The bridge clones its input for snapshots only. It maps non-finite numbers to
`{"$number":"Infinity"}`, `{"$number":"-Infinity"}`, or
`{"$number":"NaN"}` without changing the numeric renderer model. F9 applies
the same encoding to pure fixture snapshots that do not pass through the
runtime bridge. A cell's fixture ID, viewport, theme, and canvas camera data
are stored in a separate `capture` object next to the bridge envelope.

Browser comparisons validate, then omit two diagnostic fields: F1's `rev`
counts render calls, and `analysis.pairs[].ms` measures solver CPU time (see
`src/analysis/pairs.js`). Both must remain finite and nonnegative. Solve times,
move gaps, recognition/execution times, analysis answers and proof flags remain
in full. The 47 pure model fixtures still snapshot their render revision.
Scripted browser solves use the recorder's existing replay clock, advanced by
known input gaps; ordinary browser tests retain real timing and animations.
Capture waits for completed analysis and cross suggestions rather than racing
their workers while changing viewport and theme.

## Owner implementation points

| Owner | Pure serializer export | Mounted capture handle |
|---|---|---|
| F0 shared shell | `src/ui/shared/snapshot-model.js` · `buildSharedViewModel(input)` | `src/main.js` active-page bridge; includes connection, menu/drawer, and recording state |
| F1 solve | `src/brain/view-model.js` · existing `buildViewModel(input)` | `src/brain/controller.js` · existing `getViewModel()` |
| F2 history/replay | `src/history/view-model.js` · `buildHistoryViewModel(input)` | `src/history/index.js` · add `getViewModel()` to the returned handle |
| F4 drills/algs/timer | `src/drills/view-model.js` · `buildDrillViewModel(input)`; `src/algs/view-model.js` · `buildAlgViewModel(input)`; `src/timer/view-model.js` · `buildTimerViewModel(input)` | Add `getViewModel()` to each active page/session handle; include playback, attempt, timer, and case-colour state |
| F5 progress | `src/progress/view-model.js` · `buildProgressViewModel(input)` | `src/progress/index.js` · add `getViewModel()` to the returned handle |
| F6 goal data | Existing `src/goals/adapter.js` · `readGoal(storage)`, `goalProgress(goal, ao12)`, `buildWeeklyReport(input, options)` | F5's progress view-model includes the exact goal data it renders; tests seed it through `tests/helpers/goal-progress-state.js` |
| F14 help | `src/help/view-model.js` · `buildHelpViewModel(input)` | Add `getViewModel()` to the help page handle and expose it through F0's active-page bridge |
| F17 demos | `src/demo/view-model.js` · `buildDemoViewModel(input)` | `src/demo/index.js` · `getViewModel()` on the shared demo player; snapshots lesson, active part, progress, and displayed cube state without DOM or WebGL objects |

## F1/F2 route and state coverage

- **F1** keeps `buildViewModel(input)` as the source for the mounted solve
  handle and the 47 pure fixtures. Browser states cover idle, connecting,
  guided scramble, wrong turn, inspection/overtime, solving, results, and solve
  review detail. DNF values stay numeric in the renderer model and are tagged
  only in the snapshot clone.
- **F2** implements `buildHistoryViewModel(input)` for the registered route
  IDs `history`, `past-solve`, `replay`, and `review-detail`, plus
  `replay-midway` on `/history/1000000/replay`. The view-model includes the
  selected solve/session, active filter, replay index and play state, or review
  marker selection as appropriate. Seed these routes with
  `tests/layout/fixtures/state-seeds.js` so the `/history/1000000` links resolve
  to the same record across runs.

The F1 Orbit capture registrations and their fixture requirements are listed in
[`../layout/F1-FIXTURES.md`](../layout/F1-FIXTURES.md). They use the shared
`f1-orbit-fixture` driver identifier and remain execution failures until F1
provides the real fixture API. Required cases include current scramble segment
and progress, undo, inspection penalty/ticks, live results, positive OLL/PLL/F2L
case IDs, staged comparison, marker detail, open settings, and the review deep
link. All captures must use the mounted controller getter through the common
F0 snapshot bridge.

Each pure builder takes the resolved fixture data and fixed `now` as input,
and returns the object consumed by its renderer. Each page handle calls that
same builder from `getViewModel()`; do not create a separate test-only model.
The app bridge changes with route/view mount and clears on unmount. A missing
builder or getter fails the browser capture.

## Owners

- **F0:** shared header, connection menu, and recording page model.
- **F1:** solve, guided scramble, inspection, solving, results, review detail,
  and the Brain runtime handle. Keep the model builder pure and use it for
  both fixture and mounted-controller captures.
- **F2:** history, past-solve, replay cursor, and replay review state.
- **F4:** drill round, algorithm case/playback, manual timer, and the selected
  case-colour orientation.
- **F5:** progress filters, weekly report, solve/drill aggregates, and the
  active goal card as rendered on the progress route.
- **F6:** the local goal and weekly-report source data consumed by F5. The
  four registered fixtures seed `unset`, `insufficient` (six solves),
  `progress` (17 s ao12 against a 20 s baseline and 15 s target), and
  `reached` (14 s ao12). Use
  `tests/helpers/goal-progress-state.js` so those states traverse the normal
  legacy solve-store migration.
- **F14:** help content, selected help section, shortcuts, and build/update
  status.
- **F17:** lesson title, active part, committed move index, and displayed cube
  state. `/demo/format` is an intentional zero-canvas page; `/demo` has one
  shared cube canvas.

F2/F4/F5/F14/F17 implement the same runtime getter on their page handle; the app's
snapshot bridge exposes the active handle through the common API above. F5
combines its progress view-model with the F6 goal result, but keeps the two
owners labelled separately in test metadata.

Cross suggestions are bounded CPU searches. The F9 real controller consumes
recorded solver replies through `recordAsyncRead`, the same seam used by saved
recordings; it retains every face, move, proof flag and X-cross result. The input
fixtures were captured from the real WASM solver with a 15 s budget on 2026-10-04.
Node checks replay every continuation to verify its cross and pair geometrically.
The solver's real-search browser and unit tests remain in the regression suite.
Solving fixtures advance the replay clock to 1.20 s and wait for the real frame.

The analysis worker reply also crosses `recordAsyncRead`, keyed by scramble,
solve moves, move timings, cross face and last-layer configuration. Its three
real captured replies retain bounded-search proof flags and partial results;
F9 replays them instead of rerunning CPU budgets. Node checks independently
recompute segmentation and compare every stage boundary and the solved state.
The real analysis browser and golden-unit suites continue to run separately.
Manual-timer visual fixtures use one real captured WCA random-state scramble
as the scramble-module input. The separate scramble and offline tests still
exercise the actual cubing worker. Fonts are explicitly loaded before capture,
including faces not yet used by a closed disclosure. Comparison captures write
fresh artifact directories and preserve every committed baseline image.
Cross Scout uses its normal linked-setup input (`R U F`), avoiding random crypto
scramble input while retaining all displayed stickers and case seed fields.
The recording page starts with a paused browser clock, keeping real recorder
timestamps in the captured model; capture frames advance that clock explicitly.
The old rotation recording is preserved in full in a separate visual fixture,
with two real solver replies appended as recorded reads. Node checks verify
that every original event is unchanged and independently validate those replies.
A replay's history is intentionally ephemeral. The past-results fixture imports
its real analysed replay record into IndexedDB, then loads the fresh history
page; live persistence tests still use the application's normal save path.
