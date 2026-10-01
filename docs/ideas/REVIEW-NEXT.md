# Review findings and next tasks (hand-off)

From the lead's review of the SPEC-NEXT integration (`docs/ideas/SPEC-NEXT-IMPLEMENTATION.md`) on 2026-10-01, plus the user's feedback. The ground rules, quality gate and reporting from `docs/ideas/SPEC-NEXT.md` apply unchanged (offline-first, the `--b-*` tokens, VOICE.md vocabulary, one animation at a time, replayable, screenshots in Orbit/Mono × dark/light + a 390 px phone, never write tests' output into `docs/` or `src/`, never bypass the pre-commit hook, never use port 5173).

## What the review confirmed
- `npm run check` green (488 unit tests, 0 lint errors), Playwright 241 passed (4 optional skipped), PWA 12/12.
- The user's real recordings (`/home/loz/Downloads/cubesight-recording-2026-09-30T15-44-50-425Z.json` and `...T18-11-10-363Z.json`) replay exactly with `scripts/replay-recording.mjs`; the solve 3 cross is detected on D at move 10 (the cross-face fix holds). If those paths aren't reachable from your environment, use `tests/fixtures/rotation-cross-recording.json`.
- The drills hub, algs case pages, timer and progress pages render without errors in dark mode.

## R1. One visual language: the 3D cube everywhere (user request, top priority)
User: "there were not many animations going on in some of the pages I visited… let's use the 3D component we already have… what you see in the solve area should be consistent with everything else."

Make every page feel like the solve screen. Reuse the existing pieces; don't build new cube renderers:
- `src/cube-3d.js` (`createCube3D`, `update`, `queueLiveMove`, `setCue` / `clearCue` / `getCueState`, the gyro, `destroy`)
- `src/moves/move-guide.js` (plain chips + the on-cube cue)
- the Orbit ring / Mono lane components in `src/brain/styles/*`, and the shell's cube slot rules (mount once, never re-create; exactly one canvas per page)

Per page:
- **algs case page** (`#/algs/<set>/<case>`): the 3D cube shows the case; "play" animates the chosen algorithm on the cube move by move with the cue + chips (pause/step/speed). Choosing another alg replays it. Replace the static picture.
- **alg drill** (cube and no-cube): the same cube; in the no-cube drill the cube shows the case and animates the alg after each attempt.
- **OLL / PLL recognition drills:** show the case on the 3D cube from the realistic solve angle (keep the existing 2D/face views only where the drill's design needs them, e.g. "from two sides").
- **cross planning / lookahead:** the scramble/position on the 3D cube; after an answer, animate the verified plan/continuation on the cube.
- **timer:** a 3D cube showing the scrambled state (from the WCA scramble), with the cue playing the scramble when the user wants to apply it; it hides or dims during the solve (focus).
- **drills hub / progress:** a small idle cube in the hero area (with subtle gyro/rotation only if a cube is connected); keep it calm.
- **history detail / review:** already uses the cube; make sure the controls match the others.
Consistency rules: the same cube styling (sticker palette from the `--b-st-*` tokens, the shadow/glow, size steps), the same ring/lane language for progress-through-a-sequence, the same key hints, and the same header/tab treatment as solve. Respect reduced motion (static poses, no loops) and the "one animation at a time" rule. Lazy-load three.js so the hub/progress stay fast; precache for offline.
Acceptance: every page above shows the 3D cube; screenshots for each page in Orbit/Mono × dark/light + phone; a Playwright test asserts exactly one canvas per page and that alg playback ends in the expected state (compare with the state model).

## R2. Pair-completion engine: too many unproven results
`SPEC-NEXT-IMPLEMENTATION.md` WP3: 57 of 58 sampled pair positions ended as **partial searches**. The suggestions are verified correct, but rarely proven best.
- Raise the proven rate: profile the search; use iterative deepening with a better heuristic (pattern databases for the pair + cross pieces), the larger optional tables when memory allows (load on demand, cache in IndexedDB, keep the 332 KB default), and smarter move ordering. Consider bidirectional search for the last 2–3 plies.
- Run long searches incrementally in the worker and upgrade a suggestion from "partial" to "proven" in the UI when it completes (no blocking).
- Report the proven rate and the latency distribution on a fixed benchmark (≥ 50 positions incl. pairs 3–4 and pseudo). Target: ≥ 80% proven within 2 s per position on desktop.

## R3. F2L algorithm coverage
The library has only a **6-case F2L subset**. Add the full 41 standard F2L cases (plus the common back-slot variants where the source lists them), curated per FEATURES #25 (SpeedSolving Wiki / SpeedCubeDB, the standard few per case, per-alg credit + a link, data in `data/algs/*.json`, each verified on the state model to solve its case while preserving the cross and other slots).

## R4. Results screen layout leftovers
- Under the pinned cube on the results screen there's a large empty column. Keep the cube **vertically centred in the viewport** while the stats scroll (sticky, centred; never above the header; phones keep the stacked, non-sticky layout). The user asked for this explicitly. Use the empty space well (e.g. the stage list or the marker legend under the cube).
- Mono on desktop doesn't show its timeline lane with markers on results; add it.

## R5. Copy and small UI issues
- Timer: the "stats manual" button label is unclear. Use VOICE.md wording (e.g. "manual solves · stats" or "stats" with a source filter); check all timer/hub/progress labels against VOICE.md.
- Lint: 75 JS + 3 CSS warnings. Reduce them (unused vars/imports), without disabling rules.
- The review markers' "saves ~N" estimates are fixed constants (EO 6, CO 8, …). Either compute them from the analysis or label them clearly as estimates.

## R6. Things only the user can verify (don't block on these; list them in the report)
Physical GAN cube: cube-clock timing ("· cube clock" on results), a disconnect mid-solve → resume/discard, auto-reconnect, rotation markers, the smart-cube alg drill with repaint, the live review after a real solve. Phone performance (worker cold start, pair search) on a real phone.

## R7. Housekeeping
- Unexplained `[pi] Work in progress` commits appeared on `feature/smart-cube-guidance` (e.g. `eea1766`). The user says pi isn't running. Don't create such commits; if your tooling does, stop it. Commit with clear messages only.
- Keep the generated research outputs (`docs/research/alg-gen/out/*.json`) out of the app bundle; they're research artifacts.

## Order
R1 first (the user-visible priority), then R4 + R5, then R3, then R2 (the engine work can run in parallel in its own worktree).
