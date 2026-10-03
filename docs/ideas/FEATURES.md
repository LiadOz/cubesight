# CubeSight: basics audit and feature ideas

Written 2026-09-30 against `feature/smart-cube-guidance` @ `f39bac0`. The
Brain v2 branches that were still in progress were read too; they are named
wherever they change a verdict:

- **logic**: `worktree-agent-a263d459705ef59c5` (controller, view-model, `settings.js`, `keys.js`, `milestones.js`, `solve-store.js` penalties/splits/moveTimes)
- **orbit** / **mono**: `worktree-agent-a95f7466d6de5731f`, `worktree-agent-ae04b5573c44ebdc2` (visual styles)

Legend: ✅ works · ⚠️ partial · ❌ missing · 🚧 fixed or added on an in-flight v2 branch, not merged yet.
Effort: S ≈ under a day, M ≈ 2–4 days, L ≈ a week or more. Priority: **P0** = a basic that is broken or missing, **P1** = high value, **P2** = later.

This document doesn't cover where the trainers live in the site (that's in `docs/design/brain-v2/trainers/`). It only covers what they do, and how they feed Brain and are fed by it.

---

## Part A: Basics that must work

### A1. Timing correctness

| Item | Status | Evidence / gap | Fix | Effort | Pri |
|---|---|---|---|---|---|
| Clock starts on the first solving turn, not at the end of the scramble | ✅ | `solve-live.js` `startSolving()` (l.403) runs from `onSnapshot` on the first new `moveEvent.seq` after inspection. A double that leaves the cube scrambled is not treated as a solving move (l.439), and a first quarter coalesced into the last scramble turn is split out (l.443–452). | n/a | n/a | n/a |
| Clock stops on the move that solves | ✅ | `onSolveMove` → `analyze().solved` → `finishSolve` (l.399). The last move is counted. | n/a | n/a | n/a |
| Start/stop timestamps come from the cube, not the browser | ⚠️ | Both use `now()` (`performance.now()`) when the host *processes* the BLE notification (`solve-live.js` l.91, 288, 406). The cube's own `cubeTimestamp`/`localTimestamp` reach `smart-cube-session.js` `onEvent` (l.71–76) and drive double-turn coalescing (l.109), but they are not put on `moveEvent`. BLE connection-interval jitter (about 15–50 ms at each end) therefore lands in every time and split. The 🚧 `milestones.js` `moveTimes` are also host clock. | Add `cubeTs` to `moveEvent`. Time the solve as `cubeTs(last) − cubeTs(first) + host latency of the first move` (cstimer's approach). Keep host time as a fallback for cubes that send no timestamps. | M | **P0** |
| Running clock during the solve | ❌ → 🚧 | Current `brain.js` refreshes only on emits: the inspection interval at 250 ms (`solve-live.js` l.283) and one emit per move. During a pause the clock freezes. The 🚧 controller adds a rAF loop (`ensureLoop`, `ClockVM.startedAt`). | Merge v2. | n/a | P0 |
| Display precision follows WCA | ⚠️ | `brain.js` l.19 uses `toFixed(2)`, which **rounds**. WCA results are **truncated** to centiseconds. Averages are computed on raw ms, then rounded. | Add one `formatResult()` that truncates, and use it in the 🚧 `src/brain/format.js`. | S | P1 |
| Hide the timer while solving | 🚧 | `settings.js` `timer: visible/hide`. | n/a | n/a | n/a |

### A2. Penalties and statistics

| Item | Status | Evidence / gap | Fix | Effort | Pri |
|---|---|---|---|---|---|
| Automatic inspection penalty (+2 / DNF) | ✅ | `inspectionPenalty()` (`solve-live.js` l.82), with wca/grace/count/autostart. | n/a | n/a | n/a |
| **Penalty survives saving** | ❌ → 🚧 | On `main`, `solve-store.js` `cleanRecord` drops `penalty`, `inspectionMs`, `inspectionMode` and `scrambleTurns`. `appendSolve` then returns the *cleaned* list (brain.js l.526), so **ao5/ao12 ignore every inspection +2/DNF, even in the current session**. Fixed on logic (`0451464`). | Merge logic first. Add a regression test that a DNF pushes ao5 to DNF after a reload. | S | **P0** |
| Edit +2 / DNF after a solve | ❌ → 🚧 | Missing on `main`. 🚧 `updateSolve()` in `solve-store.js`, `togglePenalty` action, keys `2` / `d` (`keys.js`). Only the **latest** solve can be edited. | Allow editing any solve from history (see A4). | S | **P0** |
| Delete a solve | ❌ | No remove function exists in `solve-store.js` on any branch. A mis-tracked or accidental solve stays in your ao12 for good. | `removeSolve(at)` with an undo toast. Key: `⌫` on results. | S | **P0** |
| ao5 / ao12 per WCA | ✅ | `trimmedAverage()` (`solve-metrics.js`): drops best and worst, DNF = Infinity, two DNFs make the average DNF. | n/a | n/a | n/a |
| ao50 / ao100 | ❌ | Not exposed. Calling `trimmedAverage(r, 50)` would also be **wrong**: it trims one solve per side, but ao50/ao100 trim 5 % per side (the csTimer/WCA-style convention). | Add a `trim` parameter, `ceil(n*0.05)`. | S | P1 |
| mo3, mean, best, **worst**, best ao5/ao12 (PB averages) | ⚠️ | `summarize()` has mean/best/median. There's no worst, no mo3 and no **best ao5/ao12 over history**, so "PB ao12" can't be shown. The v2 results mock has a PB. | Rolling best-average scan (O(n·k) is fine at n ≤ 1000). | S | P1 |
| Stats scoped to a session | ❌ | `summarize(records)` covers the whole store (brain.js l.490). | See A3. | n/a | P0 |

### A3. Sessions

| Item | Status | Evidence / gap | Fix | Effort | Pri |
|---|---|---|---|---|---|
| More than one session | ❌ | There's one key, `cubesight-solves-v1`. Sessions are only *inferred* from a 30-minute gap in `trendGroups()` (`solve-metrics.js`). | Add `sessionId` to each record and a `cubesight-sessions-v1` index (name, created, method, puzzle). Keep one active session. Add "new session" to the command line. | M | **P0** |
| Per-method / per-config sessions | ⚠️ 🚧 | The 🚧 store keeps `config {method, cross, f2l, oll, pll, inspectionMode}` per record, so solves *can* be filtered. Nothing filters on it yet. Roux solves are timed with CFOP milestones (`solve-methods.js` TODO). | Filter chips (method, cross style, guided/free, inspection mode). Default the session to the current config. | S | P1 |
| History cap | ⚠️ | `SOLVE_STORE_CAP = 1000` (`solve-metrics.js` l.17): solve 1001 **silently deletes solve 1** from localStorage. | Move history to IndexedDB (no practical cap). Keep a small localStorage mirror for fast boot, or at least warn and offer an export first. | M | **P0** |

### A4. History, detail, sharing

| Item | Status | Evidence / gap | Fix | Effort | Pri |
|---|---|---|---|---|---|
| History list | ❌ → ⚠️ 🚧 | `main` shows only aggregate cells. 🚧 `ResultsVM.recent` shows the last few solves on results. There's no full list. | A virtualised, monkeytype-style history table: time, penalty, ao5 at that point, moves, TPS, method, date. | M | **P0** |
| Search / filter | ❌ | n/a | Filter by date range, method, penalty, xcross/skip, time range. | S | P1 |
| Per-solve detail with replayable reconstruction | ❌ | The data is mostly there: `scramble`, `solveMoves` (≤200) and 🚧 `moveTimes`/`splits`. Free-scramble solves need `scrambleTurns` (kept by 🚧). `cube-3d.js` `queueLiveMove` can already animate. | A detail route `#/brain/solve/<at>` with the 3D cube, scrubber, split bars and coach notes. The recorder replay (`recording-replay.js`) shows the plumbing works. | M | P1 |
| Export / import (own format) | ✅ ⚠️ | `data-port.js` exports and imports every `cubesight-*` key. ⚠️ Import **replaces** the whole solves key (`importAll` does `setItem` per key), so merging two devices loses one device's history. | Merge records by `at` on import. | S | P1 |
| csTimer-compatible import/export | ❌ | n/a | Export a csTimer session JSON (`[[penalty,ms],scramble,comment,date]`) and plain-text/CSV. Import csTimer sessions as untimed-split records, so people can bring years of history. | M | P1 |
| Share one solve | ❌ | n/a | See B4 (share card and link). | n/a | P2 |

### A5. Without a smart cube

| Item | Status | Evidence / gap | Fix | Effort | Pri |
|---|---|---|---|---|---|
| Manual timer (spacebar / touch hold-to-start) | ❌ | Brain refuses to start unless the session is `tracking` (brain.js l.560). Someone without a GAN cube, or on iOS where Web Bluetooth doesn't exist, has **no timer at all**. | `createManualTiming()` with the same snapshot shape as `solve-live` (phases: scramble shown → inspection on space → hold 300 ms → run → space stops), writing the same records with `source:'manual'`, `solveMoves: []`. Stats, sessions and inspection all apply. | M | **P0** |
| Stackmat / GAN Smart Timer | ❌ | `smartcube-web-bluetooth` 4.0 already supports **GAN Smart Timers** (package.json description). Stackmat needs audio input (`getUserMedia`) and a signal decoder. | Add the GAN timer first; it's the same library. Stackmat is P2. | M / L | P1 / P2 |
| Scramble generator | ✅ | `scramble.js` uses cubing.js random-state `333` and is pre-warmed (brain.js l.672). | n/a | n/a | n/a |
| Scramble shown as text and as an image (net) | ⚠️ | Guided mode cues move by move. There's no 2D scramble net for a manual-timer user to check their scramble against. | Reuse `cube-renderer.js` (SVG) to render `stateFromScramble` as a net. | S | P1 |

### A6. Smart cube connection

| Item | Status | Evidence / gap | Fix | Effort | Pri |
|---|---|---|---|---|---|
| Battery shown | ❌ → 🚧 | The session publishes `battery` (`smart-cube-session.js` l.128), but `main` Brain never renders it. There's 🚧 `DeviceVM.battery`. There's no low-battery warning. | Show a warning under 15 % **before** starting a solve. | S | P1 |
| Reconnect after a drop | ❌ | `DISCONNECT` → phase `disconnected` (l.136). There's no auto-retry. On reconnect, `awaiting-solved` only accepts a **solved** cube (l.88), even though GAN reports full facelets, so you have to solve the cube again to continue. | Auto-reconnect with backoff through `navigator.bluetooth.getDevices()` / the cached device. Re-baseline from the reported **facelets** (any state), not only solved. | M | **P0** |
| Solve in progress when the link drops | ❌ | `solve-live.onSnapshot` returns early on any non-`tracking` phase (l.425), so the live phase stays `solving` and the clock keeps running with no feedback. | Set phase `interrupted` and offer "resume" (if reconnected facelets = last known state), "save as DNF" or "discard". | S | **P0** |
| Detect a physical/virtual desync | ⚠️ | A desync is flagged only for an *unparseable* move (l.100). A dropped BLE packet leaves the mirror silently wrong until the cube is solved and never registers as solved. The live `desynced` phase exists (`solve-live.js` l.417). | (1) Watch for gaps in the GAN move `serial` (already in the observation, l.73). (2) Compare `REQUEST_FACELETS` with the tracked state after each solve, and when idle. (3) "Cube looks solved but the mirror isn't" → one-tap resync. | M | **P0** |
| Resync mid-session | ✅ ⚠️ | The Sync button → `syncSolved()`. It needs a solved cube (see above). | See reconnect. | n/a | n/a |
| Gyro orientation and recentering | ⚠️ | GAN only (brain.js l.192, 254). Manual "Recenter" works (`cube.recenterGyro`). There's no auto-recenter, and no hint when the gyro drifts. Cross detection depends on it (`getOrientation` → `crossFace`). | Auto-recenter when the cube is solved and still for about 1 s, with white/green or the user's preferred orientation. Add a setting for colour-neutral users. | S | P1 |

### A7. Accessibility, motion, mobile, offline

| Item | Status | Evidence / gap | Fix | Effort | Pri |
|---|---|---|---|---|---|
| Inspection voice callouts ("8 seconds", "12 seconds") | ❌ | `inspectionView().callout` is computed (`solve-live.js` l.144), and 🚧 `settings.voice` exists (default false), but no code calls `speechSynthesis` or plays audio. | `speechSynthesis` with a beep fallback, fired once per callout. WCA judges call these out, so the default should be **on** once it works. | S | P1 |
| Keyboard-only flow | ⚠️ 🚧 | `main` Brain has no shortcuts. 🚧 `keys.js`: space = next, r = retry, 2 / d = penalty, tab = settings, esc = command line. | Make sure space doesn't also activate a focused button. Show a key-hint legend. | S | P1 |
| Screen readers | ⚠️ | There's `role=status` (`#brain-status`), `aria-live` coach and review, and the timeline `role=progressbar` with `aria-valuetext`. The live coach `aria-live="polite"` is rewritten on **every move**, which is noisy. The final time is not announced as one clean sentence. | Announce only milestones and the final result. Keep the coach off the live region while solving. | S | P1 |
| Reduced motion | ⚠️ | The global CSS kill-switch is at `styles.css` l.261. The WebGL cube's turn animations and the v2 "swoop" (Orbit) are JavaScript, so it doesn't reach them. | Read `matchMedia('(prefers-reduced-motion)')` in `cube-3d.js` (instant turns) and in the v2 shell. | S | P1 |
| Mobile layout | ⚠️ | Checked at 412×839 (Pixel 7): no horizontal overflow on any route. However: the top nav is clipped ("…ner recognition" cut off) with no scroll affordance. On Brain, the metrics and Start button sit below the fold. The "No cube" status dot is **green** while disconnected. The v2 A-09/B-09/C-09 mocks address the layout. | Use the v2 mobile frames. Add a bottom tab bar on phones (coordinate with the IA doc). | M | P1 |
| iOS | ❌ | There's no Web Bluetooth on iOS Safari, so Brain can't be used there. | The manual timer (A5) makes Brain useful there. Bluefy is an optional hint. | n/a | P0 (via A5) |
| PWA offline install | ✅ ⚠️ | `vite.config.js` VitePWA `autoUpdate`, precache includes wasm and lazy chunks; `pwa-tests/offline.spec.js`. ⚠️ The manifest still says "Recognition Training" / "recognition, F2L, PLL, and cross-planning practice", with no mention of Brain. There are no `shortcuts`. `skipWaiting` can swap the app shell **during a solve**. | Update the manifest name/description. Add `shortcuts` (Brain, Corners, PLL, Daily). Defer the reload until the solve is `idle`. | S | P1 |

### A8. Persistence, backup, privacy

| Item | Status | Evidence / gap | Fix | Effort | Pri |
|---|---|---|---|---|---|
| Survives reload | ✅ | localStorage keys `cubesight-*`. 🚧 settings v2 migrates the legacy keys (`settings.js` `LEGACY_KEYS`). | n/a | n/a | n/a |
| Survives version changes | ⚠️ | `loadSolves` returns `[]` when `version !== 1` (`solve-store.js`). A future v2 schema would **show an empty history**, and the next append would overwrite the old data. | Add a migration chain and never write over a version you can't read. | S | **P0** |
| Eviction protection | ❌ | `navigator.storage.persist()` is never requested. An installed PWA is usually safe, but a browser tab is not. | Request it after the 10th solve. | S | P1 |
| Backup | ⚠️ | Manual export exists, with no reminder and no automatic copy. | A "last backup N days ago" nudge. Optional File System Access auto-backup on desktop. | S | P2 |
| Privacy | ✅ ⚠️ | Everything stays local ("All data stays on this device"). ⚠️ "Send to dev" (brain.js l.718) POSTs to `/__devlog`, which only exists in the dev server, so in production it's a visible dead button. Saved recordings may include the cube MAC in handshake frames. | Hide the dev-only controls when `!import.meta.env.DEV`. Redact the MAC in recordings. | S | P1 |

### A9. Data the analysis features depend on

| Field | Status | Evidence |
|---|---|---|
| `pllCase`, `ollCase` | ❌ always `null` | `solve-live.js` l.315–316. `weakCases()`/`aggregateByCase()` exist in `solve-metrics.js` but get no data. `pllLens()` in `solve-coach.js` already names the PLL live. |
| `detours`, `mistakes` | ❌ always 0 | l.313–314 |
| Per-move timestamps | 🚧 | `milestones.js` `moveTimes` (host clock, see A1) |
| Per-stage splits (cross, pair 1–4, EO, CO, CP, EP) | 🚧 | `splits[]` in the logic store; `cpSolved` in `solve-tracker.js` |
| Move list length | ⚠️ | Capped at 200 moves, which is fine for 3×3. |

---

## Part B: Feature ideas

"Dep" = what it needs first. Most analysis ideas need **moveTimes** (🚧) and **case capture** (the A9 fix, called "CaseCap" below).

### B1. Solve analysis (Brain)

| Feature | What | Why it matters to a trainee | Effort | Dep | Pri |
|---|---|---|---|---|---|
| Move-by-move replay | A scrubbable 3D reconstruction with the move list highlighted, split boundaries marked and playback at 0.5–4×. | You can see *where* you hesitated, not just that you were slow. | M | moveTimes, A4 detail page | **P1** |
| Pause detection / lookahead score | Inter-move gaps over a threshold (for example 2.5× your median gap) are marked on the TPS chart (`TpsSeries.marks kind:'pause'` is already in `types.js`). Score = share of the F2L time spent turning. | Lookahead is the #1 plateau breaker from sub-30 to sub-15. It turns "look ahead more" into a number. | S | moveTimes | **P1** |
| Recognition vs execution per LL step | For OLL/PLL: the gap from the last F2L move to the first OLL move is *recognition*; the rest is *execution*. Tracked per case. | This tells you whether to drill recognition (the phone mini-games) or execution (alg practice). | M | moveTimes, CaseCap | **P1** |
| Per-case stats | A table of the OLL/PLL cases you met, with count, median recognition + execution and trend. 2-look reports EO/CO/CP/EP shapes. | This builds the weakest-case list that drives B2. | M | CaseCap | **P1** |
| Cross efficiency trend | Your cross moves minus optimal (`crossSuggestion` already runs in inspection) per solve, charted over time; share of optimal crosses; xcross rate. | Cross planning is trainable, and this shows whether Cross Scout practice transfers. | S | store `optimalCrossLen` in the record | P1 |
| F2L pair-choice analysis | After the solve, for each pair: the pair you solved, the pair `f2l-planner.js` would pick (cheapest), and the move difference. | This teaches pair selection, which is lookahead in practice. | L | moveTimes, planner as a hindsight service | P2 |
| Rotation / regrip counts | Rotations are already counted (`rotations`). Split them per stage, and add y-rotations vs regrip detection from the gyro. | Rotations cost about 0.3 s each at intermediate level. | S | gyro stream stored per move | P2 |
| TPS consistency | TPS stddev inside F2L and a burst/pause ratio. The chart already exists (🚧 TPS line). | A smooth solve beats a spiky one at the same average TPS. | S | moveTimes | P2 |
| Session report | A monkeytype-style end card: ao12, delta vs the previous session, biggest split change, a recommended drill. | This closes the loop between Brain and the drills. | S | sessions | P1 |

### B2. Training modes (Brain)

| Feature | What | Why | Effort | Dep | Pri |
|---|---|---|---|---|---|
| Weak-case drills fed from real solves | "Train my 3 slowest PLLs": opens the PLL trainer (recognition) or a Brain LL-only drill (execution) preloaded with those cases. | This is the core Brain↔drill link: practice what actually costs you time. | M | CaseCap, per-case stats | **P1** |
| Spaced repetition for algorithms | Reuse the `learning.js` scheduler (already used by the corner and PLL trainers) for Brain case drills. | Keeps learnt algorithms from decaying. | S | weak-case drills | P1 |
| Stage-only practice from generated states | Cross-only (stop at cross), F2L-only (scramble to a solved-cross state), LL-only (scramble to an OLL/PLL case). Guided scrambles already take any move string, so generate `inverse(case) + random AUF` with cubing.js. | Massed practice on one stage without doing full solves. | M | a state→scramble generator (cubing.js `experimentalSolve3x3x3IgnoringCenters`) | **P1** |
| Slow-solve lookahead mode | Set a TPS cap (for example 2.0). The timeline turns amber when you exceed it or pause for more than 1 s. Scored on pause-free F2L. | The standard lookahead drill, now measurable. | S | moveTimes, pause detection | P1 |
| Race-your-PB ghost | During the solve, the timeline shows a ghost marker at your PB (or ao12) split pace. Orbit's ring and Mono's bar can both draw it. | A monkeytype-style pace caret, very motivating. | S | 🚧 splits, `settings.compare` exists (`avg/pb/raw`) | **P1** |
| One-handed mode | A session tag `oh` with separate stats, and a coach that ignores rotation flags. | OH is a common secondary event and shouldn't pollute 2H stats. | S | sessions | P2 |
| Blindfolded memo mode | A smart-cube BLD session: memo time is from the end of the scramble to the first turn; the solve is tracked; DNF is detected by the final state; there's a post-solve "which pieces were wrong". | The smart cube makes BLD self-checking. | M | sessions, a non-CFOP tracker bypass | P2 |
| Retry same scramble | 🚧 `retry` action (`r`). | Compare approaches on one scramble. | n/a | n/a | n/a |

### B3. Goals and progress

| Feature | What | Why | Effort | Dep | Pri |
|---|---|---|---|---|---|
| Goals | "sub-20 ao12 by Dec", with a progress bar on idle and the results card. | Direction and motivation. | S | sessions, PB averages | P1 |
| Daily streak (site-wide) | Counts a day if you did any Brain solve **or** any mini-game (see B6). | A reason to open the app for 2 minutes. | S | a shared `cubesight-activity-v1` log | **P1** |
| Milestone badges | First sub-X, first PLL skip (skips are already detected), 100 solves, first xxcross. | Cheap delight, and the skip hurrahs already exist. | S | an activity log | P2 |
| Weekly report | A card: solves, ao12 trend, the split that improved most, time in mini-games. | A long-term view. | S | sessions, activity | P2 |
| Sub-X roadmap | For a target (for example sub-15), compare your splits with typical split ratios and name the gap ("F2L +3.1 s, PLL recog +0.6 s"). | Turns the goal into a plan. | M | splits, per-case stats | P2 |

### B4. Social and sharing (no server)

| Feature | What | Why | Effort | Dep | Pri |
|---|---|---|---|---|---|
| Share card image | A PNG of the results (time, splits, TPS line, scramble) from the v2 SVG charts, via canvas and the Web Share API. | Cubers post PBs, and it's free marketing. | S | 🚧 charts | P2 |
| Reconstruction link | Encode scramble + moves + moveTimes in the URL hash (alg.cubing.net style) and open it in the replay view. | Coaches and forums can see your solve, with no backend. | S | B1 replay | P2 |
| Compare with a friend | Import a friend's exported JSON (or a share link) and overlay split bars. | Social motivation without accounts. | M | csTimer/JSON import | P2 |

### B5. Smart-cube extras

| Feature | What | Why | Effort | Dep | Pri |
|---|---|---|---|---|---|
| Free scramble auto-detect | Free mode already records `scrambleTurns`. Add a "done scrambling" gesture (for example 2 s still, or a key) instead of tapping Start, and show the resulting state's random-state quality. | Removes a tap and supports scrambling from a paper or other app. | S | n/a | P1 |
| Other brands (MoYu, QiYi, GiiKER, GoCube) | `smartcube-web-bluetooth` 4.0 already has these protocols. The session is device-neutral, but copy and gyro gating are GAN-only (`protocol?.startsWith('GAN')`), and double-turn coalescing assumes GAN ticks (`DOUBLE_TURN_WINDOW`). | Most cubers don't own a GAN. | M | a per-protocol capability table; test with the recorder | **P1** |
| Cube-state sanity check | Before each guided scramble: `REQUEST_FACELETS` must equal the mirror; if not, offer a one-tap resync. | Prevents a whole bad solve from a silent desync. | S | A6 desync work | P0 (in A6) |
| GAN Smart Timer as the start/stop source | Hands-on-timer start and stop instead of the first/last move. | WCA-like timing, and removes the first-move ambiguity. | M | the library timer API | P2 |

### B6. Quick drills and mini-games (phone, no cube, 1–3 minutes)

These are the "2 spare minutes on the bus" part of the product. The design rules for every mini-game:

- **Instant start:** the first case is on screen within 1 s of opening the route, with no settings required.
- **60-second rounds:** each round ends on a summary card with a score and personal best.
- **Combos and streaks:** combos within a round, and the daily streak across all games.
- **Difficulty ramp:** the existing adaptive glance (`glance-pacing.js`) is the model to follow.
- **Spaced repetition:** reuse the `learning.js` scheduler.
- **Daily challenge:** the same seed for everyone, so the result can be shared.
- **Touch-first:** big answer targets in the thumb zone, and no keyboard needed.

#### Existing trainers: what would make each a 2-minute phone game

| Trainer | Today (evidence) | To make it a phone mini-game | Effort | Pri |
|---|---|---|---|---|
| Corner recognition (`#/corners`) | Single / triple / one-glance recall modes, a 10-answer sprint, streak and best streak, adaptive exposure, `learning.js` scheduling (`main.js` l.198–207, 762). It starts instantly on phone and the 6 colour buttons fit on screen (checked at 412 px). | A 60 s "rush" round (score = correct × speed bonus, a combo multiplier) as the default; the daily challenge; a summary card with PB; move "Training settings" behind a gear. | S | **P1** |
| PLL recognition (`#/pll-recognition`) | Adaptive glance, spaced review with "Reviews ready" and 24 h retention probes (`pll-trainer.js` l.139, 178). Answer keys are keyboard-oriented (`ANSWER_KEYS`). | A touch answer grid grouped by family (A/U/G/…) to limit it to 2 taps; a "due reviews" round as the one-tap start; a 60 s rush; the angle variants in the new games below. | M | **P1** |
| F2L deduction (`#/f2l`) | Deduction / planner / scan drills (`main.js` l.290). The 3D cube needs WebGL, and the page is 1523 px tall on phone. | Planner as "pick the cheapest pair" rounds of 5 cases; a compact layout; tap-a-slot answers. | M | P1 |
| Cross Scout (`#/cross-scout`) | Scramble → find the optimal cross (solver worker). Works with a manual scramble, no cube needed (`cross-scout.js` l.176). | A "count the moves" mode (below) as its no-cube 60 s game. | S | P1 |

#### New mini-games

| Game | Skill trained | How 60 s plays | Touch controls | Effort | Pri |
|---|---|---|---|---|---|
| **PLL from two sides** | Real-solve PLL recognition (headlights, blocks) | 2D render of 2 side faces at a solve angle; name the case; the pace ramps. Reuses `pll-logic.js` states and `cube-renderer.js`. | A family grid → a case in 2 taps | S | **P1** |
| **PLL / OLL from one side** | Advanced one-side recognition | Same, with only the front and top-edge row visible. | Same | S | P2 |
| **Name the AUF** | Predicting the AUF before the PLL | Show a PLL at a random AUF; answer U / U' / U2 / none as fast as possible. | 4 big buttons | S | **P1** |
| **OLL recognition** | OLL shape recognition (57 cases, or the 2-look 7+3 subset) | Top view plus side stickers; pick the shape family, then the case. Needs `oll-logic.js` (new, modelled on `pll-logic.js`). | A shape grid | M | P1 |
| **Next pair (lookahead reading)** | F2L lookahead and pair choice | A static F2L state with the cross done; tap the pair you'd solve next; scored against `f2l-planner.js` cost. A 3 s timer per case. | Tap the slot or the pair on a 2D cube | M | **P1** |
| **Cross count** | Inspection planning | A scramble picture (net) or scramble text; answer "how many moves to the optimal white cross?" (4–8) within 8 s. Uses the `cross-solver.js` worker. Difficulty: fixed colour → any colour. | 5 number buttons | S | **P1** |
| **EO spotter (ZZ / Roux)** | Edge orientation recognition, EO-line | Show a state; tap all the bad edges, or pick the count (0/2/4/…/12). | Tap edges, or count buttons | M | P2 |
| **Alg recall** | Linking case to alg | Show a case; pick the right alg or first trigger out of 4 (from the user's alg sheet). | 4 choices | M | P1 |
| **Notation speed-read** | Reading scrambles and notation fluently | Show a 3–6 move sequence from solved; pick what the U face looks like, out of 4 renders. | 4 choices | S | P2 |
| **Letter-pair recall (BLD)** | BLD memo speed | Flash N letter pairs (Speffz); recall them in order; N ramps. | An on-screen letter keypad | S | P2 |
| **Daily puzzle** | Planning under no time pressure | "Today's scramble: find a 6-move cross" (or an xcross). The seed is the date, so it's the same for everyone; submit moves as notation; the solver validates it; the result is a shareable string (`CubeSight 2026-09-30 · cross 6/6 · 41 s`). | Notation keypad (R U F L D B, ', 2) | M | **P1** |
| **Colour neutrality** | Recognising pieces from any colour | Any game above with the cross colour/orientation randomised. Corner recognition already varies the angle; make "colour" a global mini-game modifier. | n/a | S | P2 |

#### Meta-features for the mini-games

| Feature | What | Effort | Pri |
|---|---|---|---|
| Daily streak across mini-games and Brain | One `cubesight-activity-v1` log (`{day, game, rounds, score}`) written by every trainer, plus a streak flame in the header. | S | **P1** |
| One progress track that ties drills to solves | For each skill, pair a drill metric with a Brain metric. For example, PLL recognition median ↔ PLL recognition split (B1); Cross count accuracy ↔ cross − optimal (B1). Show the link: "PLL recognition drill −0.3 s → your PLL split −0.2 s this month." Skip the XP number unless it maps to real skill. | M | P1 |
| Offline | Already covered by the PWA precache. The daily seed must be computed locally (date-based), with no network. | S | P1 |
| Home-screen shortcuts | Manifest `shortcuts`: "Daily puzzle", "PLL rush", "Corner rush", "Brain". Real Android widgets aren't available to a PWA, so use shortcuts plus the Badging API for "reviews due". | S | P1 |
| Round summary / share | End card: score, PB, streak, and a one-tap share of the text line. | S | P1 |

---

## Recommended next 10 (build order)

1. **Merge the logic branch's store fix, then add delete + penalty editing from history.** Penalties are silently dropped from averages today; add `removeSolve` with undo (A2). *S*
2. **Schema safety: IndexedDB history + migrations + `storage.persist()`.** Removes the 1000-solve silent loss and the "wrong version = empty history" trap (A3, A8). *M*
3. **Sessions + a history table with filters and PB averages (ao50/ao100 with 5 % trim, worst, mo3).** (A2–A4) *M*
4. **Connection robustness:** interrupted-solve handling, facelet-based re-baseline, serial-gap and facelet desync checks, auto-reconnect (A6). *M*
5. **Manual timer mode (space/touch)** with the same inspection, records and stats. This unlocks iOS and cube-less users (A5). *M*
6. **Cube-timestamp timing + truncated WCA display + voice callouts.** Correct numbers, done once (A1, A7). *M*
7. **Mini-game foundation:** the shared activity log with a daily streak, a 60 s round/summary component, and "rush" mode on Corner and PLL recognition. Add manifest shortcuts and fix the manifest copy (B6, A7). *M*
8. **New phone games, first wave:** Name the AUF, PLL from two sides, Cross count, and the Daily puzzle (B6). *M*
9. **Case capture + per-case recognition/execution stats + pause/lookahead marks** on the results TPS chart (A9, B1). *M*
10. **Close the loop:** "train my weakest cases" (opens the PLL game or a Brain LL-only drill) and the drill↔solve progress link. Then the PB ghost and the per-solve replay page (B2, B1). *M–L*

## Open questions for the user

1. **Timing source:** should an official time come from the cube's hardware timestamps (more accurate, but it differs from what the screen showed live by tens of ms), or from host time? And do you want an optional GAN Smart Timer mode?
2. **Sessions:** do you want explicit named sessions (csTimer style), automatic ones (by day or config), or both?
3. **The 1000-solve cap:** is moving history to IndexedDB OK, or do you want to stay on localStorage and ask the user to export?
4. **The manual timer:** should it live inside Brain (the same screen, "no cube" = manual) or as a separate lightweight timer route?
5. **Mini-game scoring:** plain accuracy × speed, or a single site-wide XP number? I recommend the per-skill link over XP. Should the daily puzzle's shareable text be Wordle-style?
6. **Brands:** which non-GAN cubes can you test with? Support can't be claimed without a recording from real hardware.
7. **Voice callouts** default: on (WCA-like) or off (quiet by default)?
8. **Roux:** keep it in the method picker while its stages still use CFOP milestones, or hide it until real Roux detection exists?

## Decisions (2026-09-30)

1. **Timing source:** official times come from the cube's hardware timestamps when a smart cube is connected.
2. **Sessions:** automatic, no naming. A large idle gap between solves starts a new session.
3. **Storage:** move solve history to IndexedDB (removes the 1000-solve cap).
4. **Manual timer:** NOT in Brain (Brain's value comes from smart-cube moves). A separate lightweight timer page sharing inspection, penalties, history and stats; works on iOS.
5. **Mini-game scoring:** per-skill progress, no single site-wide XP.
6. **Brands:** GAN only; the user has no other smart cubes to test with.
7. **Voice callouts:** off by default.
8. **Roux:** hidden from the method picker for now (the user doesn't solve Roux yet); may return later with real Roux detection.
9. **Review external solves (idea, P1):** import a reconstruction (scramble + solution text, alg.cubing.net links, SpeedCubeDB / cubesolv.es style) and run the same solve review on it: cross optimality, F2L pair choice, move waste, LL alg/AUF choice. No per-move timing, so no pause/TPS labels. Also lets users study top solvers' reconstructions. The WCA publishes scrambles and results (not solutions), so WCA import = official scrambles to practise with.
10. **Pseudo-slotting (P1):** F2L pseudo pairs must be detected automatically, not via an opt-in toggle. Compute the D-layer offset relative to the cross at every move and evaluate pairs in that frame. Pseudo pairs get their own split tag, the final D correction is never counted as wasted, and the review/coach treats a move-saving pseudo pair as a good choice. Builds on solvedPairsPseudo / f2lDonePseudo in solve-tracker.js.
11. **Algorithm database (P1, common core):** algorithms per case with source attribution (site, YouTube video, e.g. J Perm), fingertricks, "my pick", and usage stats from imported reconstructions of top solves. Shared by recognition drills, the OLL/PLL trainers, the move guide, the solve review and the coach. Seed with hand-curated/existing algs plus links. No bulk copying of third-party content without permission.
12. **Smart-cube alg drills (P1):** repeat one algorithm and get per-attempt execution time, TPS and per-move hesitation points. The drill checks the move match plus F2L intact, and virtually repaints the last layer so you can repeat without re-setup. Spec: docs/design/brain-v2/algs/.
13. **Offline-first is a hard requirement:** the site runs entirely offline, installed as a PWA. No backend and no runtime calls to external services. Imports come from paste/file only, and external sources are plain links. Dev endpoints (/__devlog, /__recording, "Send to dev") must be gated to dev builds. Every new feature must work in airplane mode, with its assets precached.
14. **Answers (2026-09-30, round 2):** home = the smart-cube solve screen (today's Brain), also on desktop without a cube. Drills use real learning methods (spaced repetition, retrieval practice, interleaving, feedback); game elements stay light. Build OLL and PLL recognition drills. Phones show key hints when there's room. The smart-cube PLL drill is an instance of the generic algorithm drill. One consistent vocabulary across all pages (docs/design/VOICE.md). "Brain" will be renamed (screen = "solve"; site name TBD). Proposed: Cross Scout splits into a cross-planning drill plus a scramble explorer inside review.
15. **Everything links to its drill (P1):** on the solve results and in the review, every case, alg, stage or label that is mentioned is tappable and deep-links to the drill for exactly that thing (recognition drill for the case, alg drill for the alg, cross planning with this scramble, F2L from this position), with a return path back. One consistent local route scheme (#/drills/…, #/algs/…).
16. **Alg sourcing decision (2026-09-30):** bundle only algorithms we're clearly allowed to use (standard/traditional algs, our own, openly licensed), each with credit to its source. Anything with unclear rights is left out (the user can still add their own). No bulk imports without written permission.
17. **Fingertricks shown on the cube, not in words (P1):** fingertrick hints are drawn over the cube (finger/hand markers and a push/flick direction on the turning layer) in the move guide, not as text. Text stays only as the accessible alternative.
18. **X-cross is an opportunity, not a stage or a setting:** no cross/x-cross/xx-cross target option. The timeline always plans cross + 4 pairs, and when the cross completes together with pairs it's tagged X-cross/XX-cross and the merged pairs are shown done at the same moment.
19. **Session focus (P1):** each session has a focus: speed (time, ao5/ao12, PB), flow (TPS consistency, pauses, lookahead) or learning (move efficiency, review accuracy, cases practised). Averages, PBs and comparisons never mix foci. The results screen, coach and progress show the metrics that fit the focus. One-tap focus switch; the app may suggest a switch (e.g. TPS far below usual → "learning?").
20. **Follow-up (analysis):** segmentSolve reports an "xcross" skip at idx -1 when F2L is already solved before the first move (e.g. LL-only scrambles). That isn't an X-cross: filter idx -1 milestones out of skips. Real single-pair pseudo golden solves are still needed (the constructed ones credit two pairs at once).
21. **Move guide = the cube cue only (user decision):** the only visual guide is the real layer on the 3D cube starting the turn partway in the right direction and easing back (looping), synced to the current move and the held orientation, and cancelled instantly by a real turn. No glyph chips, arrows, direction labels, tooltips or finger markers. The scramble line is plain notation (current highlighted, done dimmed) plus the "undo" strip. This supersedes item 17 (fingertricks on the cube) for now.
22. **Coach on the timeline, better-solution replays, pinned cases (P1, user request):** no long coach list. Notes (good and bad) are markers on the results timeline/TPS chart at the moment they happened, compared to your average (e.g. rotations vs avg). Tapping a moment shows the cube at that position with "yours vs better": the better solution for that stage (e.g. a pair: the planner's shorter insert) is animated on the cube. Any moment can be pinned to a "saved cases" list: each stores the position (scramble + moves up to that point), the stage, yours vs the better solution, and the date. It's reviewable later and drillable ("retry this moment", with a guided setup on the smart cube). Stages are clickable to open their detail.
23. **Pins open in the appropriate trainer (clarification of 22):** a pinned moment is added to the matching trainer's queue and opens there at that exact position: cross → cross-planning drill (scramble=), pair → F2L trainer (setup= position), OLL/PLL → that case's alg/recognition drill, pause/lookahead → lookahead drill. Pins therefore depend on trainers accepting a start position (the drills phase). The pinned list is a filter on the trainers, not a separate page.
24. **Pinned-case variations randomize what doesn't matter (P1, with pins):** when drilling a pinned moment, generate fresh variations that keep the essential pieces fixed and randomize everything else. Essential = the pieces the suggested solution uses or depends on (e.g. the pair being inserted, the cross, already-solved slots) PLUS structural requirements of the technique: a keyhole needs its slot's pieces NOT placed there (the slot must stay open), a pseudo pair needs its D offset, and so on. Everything else (other unsolved pairs, the last layer) is randomized among states reachable from the constraints. Build: a relevance mask derived from the suggested solution's effect + per-technique constraints, a constrained random-state generator (random permutation/orientation of the free pieces with parity kept), and a setup scramble for the state from the bundled offline 3x3 solver (cubing.js search, already a dependency) so the smart cube's guided scramble can set it up. Verify every generated variation still admits the suggested technique (re-run the planner) before offering it.
25. **Algorithm sourcing, final (2026-10-01, supersedes 16):** use the well-known community algorithms from the SpeedSolving wiki and SpeedCubeDB (the user's judgement: community-circulated, no owner/licence). Take a curated set per case (the standard few), not a wholesale copy; keep per-alg credit + a source link. Keep the data in a separate data bundle (e.g. `data/algs/*.json`), not in code. Standard OLL 1–57 / PLL names. Self-generation (docs/research/alg-gen) is only an internal verification tool (each bundled alg must solve its case on the state model), not a source of user-facing algs.
26. **Last-layer look counting + case history (P1, user 2026-10-03):** the state at the moment F2L ends IS a determinate OLL case, so the correct alg is knowable; the same for PLL at the moment OLL ends (this mirrors the F2L logic: an insertion finishing starts the next pair, and the moves used say which pair). Detect when the user passed through ANOTHER canonical case mid-execution: that is an extra look, usually "forgot the alg and did a different one to change the state". Respect the 1-look/2-look setting so legitimate two-look solving is never flagged. Show which OLL/PLL appeared in history and progress, and use extra-look cases as the top weak-case signal for the drill queue. Spec: SPEC-FLEET F3.
27. **Demo links (P1, user 2026-10-03):** the point is that an AI (or anyone) can hand over ONE complete link and the user just opens it, so the format is public, documented at `#/demo/format`, readable and easy to write by hand; a lesson may hold several cases in one link; a paste box accepts a link or raw setup+alg. A self-contained `#/demo?…` link carrying a title, setup, alg, per-step notes, highlighting and the case, rendered on our own Cube + Orbit with full-turn playback, instead of telling people to paste moves into alg.cubing.net. It VERIFIES the alg against the cube model and says so when it doesn't do what it claims (the AI examples that prompted this did not solve their slot). Accepts and converts alg.cubing.net / twizzle URLs locally; "copy demo link" from case pages, review moments, coach tips, pins and history. Spec: SPEC-FLEET F17.
