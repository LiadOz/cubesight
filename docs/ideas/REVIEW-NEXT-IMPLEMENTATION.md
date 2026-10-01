# REVIEW-NEXT implementation

Implemented in the `implement/review-next` worktree, based on `7e60a4c`, and integrated locally into `feature/smart-cube-guidance`. Nothing was pushed or deployed. The implementation follows the handoff's priority: shared cubes first, results layout and copy next, then F2L coverage, with the engine work isolated in parallel.

## R1 — shared cube experience

The existing Three.js cube now serves algorithm cases and drills, OLL/PLL recognition, cross planning, lookahead, timer, drills hub, progress, history detail, and review. Shared `createPageCube` applies the sticker tokens and loads the renderer on demand. Startup no longer creates the hidden corner and F2L canvases; those mounts follow their routes.

The shared sequence player supplies the existing move-guide chips and cue, play/pause, previous/next, reset, speed, and Orbit ring or Mono lane. It keeps one canvas through playback and algorithm selection. States come from the physical model, including rotations, wide turns, and slices; reduced motion completes at a static final pose. Navigation pauses playback and invalidates late asynchronous mounts.

Answering cross planning or lookahead plays the verified continuation. The manual timer shows the exact WCA scrambled state, permits scramble playback, and stops/dims the preview during a solve. Its hold timing uses browser input timestamps so a delayed event handler cannot turn a short tap into a hold. Hub/progress cubes stay calm; connected-cube orientation updates are conditional on the connection.

Fresh-route screenshot checks caught and fixed missing sequence styles and drills that defaulted to Orbit because they did not pass storage to `loadSettings`. Phone algorithm cards now give the cube its own row.

Visual artifacts, outside source/docs:

- `test-results/review-next-visual`: 72 screenshots, nine pages × Orbit/Mono × light/dark × desktop/390 px.
- `test-results/r1-history-review`: 16 screenshots; includes repeated history/review navigation, stepping, actual style/theme assertions and one canvas per page.
- `test-results/review-next-f2l-visual`: 16 standard/back-slot case screenshots.
- `test-results/review-next-results-layout`: eight results screenshots from the results worktree.

All these screenshots were inspected. Browser checks also compare sequence completion with the independent physical state model, test reduced motion and interrupted playback, and verify timer scramble alignment.

## R4 — results layout

Orbit keeps the cube sticky and vertically centered below the header while stats scroll, with the existing stage list beneath it. Mono results expose the actual timeline and selectable markers on desktop. Phone layouts stay stacked and non-sticky. Browser checks cover the header boundary, scrolling, marker selection, and horizontal overflow.

## R5 — copy and warnings

Timer stats identify manual solves. Inspection controls have a short visible label and a complete accessible label. Progress uses cases due, answers, and drill wording. Review marker savings explicitly say estimated and explain the typical insertion/algorithm they represent; their fixed ranking estimates are not presented as measured savings.

Unused declarations/imports and dead completion renderers were removed without disabling lint rules. Deprecated CSS and a duplicate selector were corrected. Integrated lint is clean, with zero JS or CSS warnings.

## R3 — complete F2L coverage

`data/algs/f2l.json` now contains all 41 standard front-right cases, 41 back-right variants, and 41 back-left variants: 123 distinct setups and 356 credited algorithms, at most three per slot. The browser shows 41 standard cases by default and offers front-right/back-right/back-left/all-slot filters. The catalog data version is 2.

The original six case setups and nine algorithm IDs remain stable, preserving existing picks. Every new algorithm carries its source link, credit, retrieval date, metrics, and verification flag. Sources: [SpeedCubeDB's F2L collection](https://www.speedcubedb.com/a/3x3/F2L), with existing [SpeedSolving Wiki](https://www.speedsolving.com/wiki/index.php/F2L) entries retained.

The audit verifies the solved cross and other three slots before insertion, and all four slots after every algorithm, using both the geometric app model and the independent cubing.js model. The complete bundled library contains 217 case entries and 541 algorithms. Browser and offline tests cover back-slot routes, source metadata, playback, and existing picks/drills.

## R2 — pair completion

The search now uses a union of the four permissible end frames, shared incumbent bounds, and stronger exact projections for the pair and cross pieces. Minimum turn-count proof is tracked separately from incomplete alternative enumeration. Review explicitly distinguishes a proven minimum from a partial search; ergonomic ranking applies to the found candidates and is not a claim of globally optimal ergonomics.

The worker publishes a quick recorded-safe partial, yields, then refines and replaces it without blocking the page. Cancellation suppresses further progress. Pending upgrades survive stored summaries and resume when reopened. Engine version 4 invalidates older summaries. A real-browser worker test covers partial-to-final delivery, cancellation, IndexedDB persistence, and typed-array restoration in a fresh module realm.

The synchronous default retains the compact 332 KB tables. Four optional pair/cross projections add 1,327,104 bytes (about 1.27 MiB), load on demand, and use a versioned, validated IndexedDB cache. A 2 MiB optional-table budget and the reported device-memory tier gate allocation; unavailable storage falls back to computation.

The frozen 50-position fixture (seed 48271) contains stages 1–4 in counts 13/13/12/12 and 25 pseudo positions. Every returned completion is independently replayed with cubing.js to check the cross, preserved slots and completed pair. Final fresh-process desktop measurements:

| Mode | Proven within 2 s | Median | p95 | Maximum | Cold tables |
| --- | --- | --- | --- | --- | --- |
| Compact only | 50/50 (100%) | 25.66 ms | 654.80 ms | 1,957.43 ms | 86.26 ms |
| Optional projections | 50/50 (100%) | 0.70 ms | 36.47 ms | 187.03 ms | 82.00 ms compact + 347.52 ms optional |

Both modes had zero independent verification failures. Earlier compact-only repeats reached 49/50 (98%); the hardest pseudo pair-4 position is near the budget, so the final 100% result is a desktop measurement rather than a guarantee for every device. Optional cold-build time is reported separately from search latency. The pre-change baseline proved 3/50 (6%) on this same frozen fixture.

Reproduce with `node scripts/benchmark-pair-search.mjs 2000` and `node scripts/benchmark-pair-search.mjs 2000 pair-cross`, each in a fresh process. Reports are `test-results/review-next-benchmark-compact.json` and `test-results/review-next-benchmark-optional.json`.

## R6 — checks needing physical hardware

These are deliberately left for the user and do not block the implementation:

- A GAN solve's cube-clock timing and the results “cube clock” indicator.
- Disconnect mid-solve, resume/discard, and auto-reconnect.
- Rotation markers, smart-cube algorithm repaint, and live review after a real solve.
- Worker cold start, pair search, and rendering performance on a physical phone.

The Downloads recordings are unavailable in this environment. `scripts/replay-recording.mjs tests/fixtures/rotation-cross-recording.json` passes the recorded state/phase replay; this does not constitute a physical GAN test.

## R7 — housekeeping

All new commits have descriptive messages; no `[pi] Work in progress` commits were created. A production-build boundary rejects imports from `docs/research/alg-gen/out`, keeping generated research JSON out of the app bundle. Generated benchmark reports and screenshots stay in `test-results` or `/tmp`.

## Final verification

- `npm run check`: zero JS/CSS lint warnings or errors; 499/499 unit tests; production build passed. Pre-commit hooks also passed after the final persistence fix. The build precaches 118 entries (about 4.05 MiB); existing large-chunk and WASM `node:module` externalization notices remain.
- Full serial Playwright run on port 4201: 279 checks, initially 267 passed, five optional skipped and seven failed. Four failures were intentional results-layout/copy snapshot changes, two were old progress copy assertions, and one exposed a history undo write/reload race. History edits now await the store flush before visible confirmation. All 31 affected results/history/lifecycle/progress checks then passed against inspected updated baselines. All 274 non-optional browser cases therefore passed across the full run and focused resolution; no failures remain unresolved.
- Production PWA suite on port 4208: 13/13 passed on the final full rerun. Updated old test expectations for the shared replay control label, progress wording and engine version 4. Tests include cold offline cube routes, algorithm self drills and back-slot playback, review worker analysis, timer and persistent history.
- Both fresh-process 50-position benchmarks passed the ≥80% within-2-s target, with no independent state-verification failures; detailed metrics are above.
- The rotation-cross recording fixture replay passed. Physical GAN and physical-phone checks remain as listed under R6.
- Inspected 112 page/layout screenshots plus four refreshed results baselines. Test output and benchmark artifacts are outside the application source and documentation.

Verification logs are copied into ignored `test-results/review-next-verification` in the main checkout. Implementation commits use normal hooks and descriptive messages. All three implementation agents have finished; deployment remains with the user's other agent.
