# Fleet spec: everything still to build

The brief for the next fleet of builder agents, and the checklist the lead reviews against. It consolidates every open item from `ROADMAP.md`, `REVIEW-NEXT-2.md`, `REVIEW-NEXT-3.md`, `FEATURES.md` and the Orbit v3 designs. Where this file and an older doc disagree, **this file wins**.

**Design reference:** `docs/design/orbit-v3/` (gallery: `file:///home/loz/projects/cubesight/docs/design/orbit-v3/index.html`). **Direction: B "orbit + rail" as the shell, plus C's tap-an-arc-to-drill and history orbit-card grid, plus A's clock-under-the-cube while solving and on phones.** (This is the lead's recommendation; if the user picks another direction, F1/F2 follow that instead.)

## Ground rules (every work package)
1. **Offline-first PWA:** no backend and no runtime calls to other origins; new assets precached; airplane mode works.
2. **Orbit-dark first.** Orbit light must keep working; Mono may keep working as a skin but must not block or shape any decision.
3. **One Cube + one Orbit.** Use only the shared components from F0 (plus the five shared pieces: header, key bar, coach line, ≤ 3 actions, chip). No new one-off rings, chip strips, tables or charts. If you think you need one, stop and report.
4. **Calm:** at most one animated element at a time; respect `prefers-reduced-motion`; demonstrations animate **full turns**; the partial "cue" is only for the next move the user must make.
5. **Vocabulary** per `docs/design/VOICE.md` (decisions 1–10). The cubing labels for review markers; praise first.
6. **Honesty:** only proven/verified results are presented as facts; partial searches are labelled; sample data only in dev fixtures.
7. **Replayable:** smart-cube and user-action behaviour stays reproducible with `scripts/replay-recording.mjs`; real recordings live in `/home/loz/Downloads/cubesight-recording-*.json` (and `tests/fixtures/rotation-cross-recording.json`).
8. **Process:** branch from the tip of `feature/smart-cube-guidance` in your own worktree; never push; never use port 5173; never bypass the pre-commit hook; tests never write into `docs/` or `src/`; descriptive commit messages only (no WIP auto-commits).
9. **Quality gate for a merge request:** `npm run check` green (0 lint errors), the full `npx playwright test` green, `npx playwright test --config=playwright.pwa.config.js` green.
10. **Show your work:** screenshots of every changed screen in Orbit dark (+ Orbit light, + a 390 px phone); write a gallery `index.html` next to them (relative paths) and report its `file://` link. Read your screenshots and compare them with the orbit-v3 frames.
11. **Report:** commits, files, test results, the gallery link, deviations, open questions.

---

## F0: Foundation: the Cube and Orbit components (must land first)
Design: `orbit-v3/00-system-components`, `00-system-pieces`, `00-system-flows`, README §§ design system and motion.

Build:
- **`Orbit`** (start from `src/brain/charts/arc.js`): one SVG ring component with `segments[] {key, weight, state: future|current|done|skipped|wrong|good|bad, fill, label, value, delta, marker}`, a `caret`, the outer-label placement with collision handling (no "−0.00"-style noise: labels show only what the flow defines), a gap/"dial slot" option (A), sizes XL/L/M/S and a **mini glyph** (≈ 17–48 px) for lists, tap/hover events per segment and marker, keyboard focus, and reduced-motion behaviour.
- **`Cube`** (wrap `src/cube-3d.js` + the page-cube): sizes XS–XL (XL = the solve hero, ≈ 45–50% of the viewport height on desktop), modes `live` (mirrors the smart cube + gyro), `case` (a set state), `replay` (scrubbable), plus `highlight({pieces, slot, dimOthers})`, `cue(move)` (partial, the next-move hint) and `play(moves, {fullTurns: true, speed})`. Exactly one canvas per page; never re-created on route/style changes within a page.
- **Shared pieces:** header (with the compass slot from C), key bar, coach line, actions (≤ 3), chip.
- **The component audit + migration plan** (`docs/ideas/COMPONENT-AUDIT.md`): every current ring/lane/chip-strip/table/chart/cube usage, what replaces it, and in which WP.

Acceptance: a dev gallery page rendering every Orbit flow mapping from `00-system-flows` (scramble, inspection, solving, results, alg playback, drill round, timer, history, progress) with fixture data; unit tests for the segment geometry, label collisions and the mini glyph; Playwright: one canvas per page, play() ends in the state-model state, highlight dims the correct cubies.

## F1: Solve flow on the Orbit (after F0)
Frames: `B-01 … B-06`, `A-04` (the clock under the cube while solving), `B-09` phone.
- **Idle:** the XL cube, minimal chrome, connect/ready in the rail.
- **Guided scramble ON the ring:** moves as segments (done dim, current lozenge + the big move glyph + plain text "top face, clockwise", "move 13 of 20"); a wrong turn shows the undo on the ring in amber; the cue on the cube for the next move. Remove the scramble text strip beside the cube.
- **Inspection:** zones on the ring (+2 band, DNF stub, 8 s / 12 s ticks), the countdown in the slot.
- **Solving:** stages fill live; the clock under the cube (A) in focus mode.
- **Results (B-05):** the ring carries the stage name + split + delta once, plus good AND bad markers; the time big in the rail with "vs ao12 · ao5 · PB"; ONE coach sentence (praise first) tied to one marker; **≤ 3 actions: next scramble · review · more…**; the `[ ]` keys step through markers. **Remove:** the split table, split bars, TPS chart, donut, recents list, the button row. (Move anything still needed under "more…".)
- **Tap an arc** (C) → that stage's detail in the rail (the moves, time vs average, "yours vs better" played on the cube with full turns, its drill link).
- The config bar fits on ONE line at 1280 px (move the stats-source selector into progress/history filters).
- An unknown route shows a styled "not found" page (legacy redirects still work).
Acceptance: screenshots for each frame vs the orbit-v3 B frames; the existing solve/replay/recovery tests still pass (update selectors where the UI changed, keeping each test's intent).

## F2: History, past solves and replay (after F0; parallel with F1)
Frames: `C-07` (orbit-card grid) as the history list, `B-10`, `B-11`, `B-12`.
- **History list:** solves grouped by session with mini-orbit cards (time, penalty, PB badge), session header "evening · 17:33 · 14 solves · ao12 15.03", calm filters (session/focus/source chips + search), the PB/ao12/ao5 context at the top.
- **Past solve** `#/history/<at>`: exactly the results screen (F1) for that solve, with a `‹ history` crumb and `‹ ›` for the neighbouring solves.
- **Replay** `#/history/<at>/replay`: the cube replays the solve with the ring filling in real time; the ring is the scrubber (drag, tap an arc to jump to a stage, tap a marker); play/pause/speed. Uses the stored moves + moveTimes (+ rotationMarks). Records without timing replay at an even pace, labelled "timing not recorded".
- **Review deep link** `#/history/<at>/review/<marker>`.
Acceptance: Playwright: a solve with the fake cube → history card → past solve → replay to the end equals the final state → back; a legacy record without moveTimes shows the label.

## F3: Review correctness and coaching (parallel with F1/F2; engine + data, little UI)
- **BUG, X-cross graded against a plain cross:** judge the first stage by what was built (cross / X-cross / XX-cross) and compare with the optimal solution for THAT target (the cube-xcross WASM with the slot mask); per-move loss and the best continuation use the same target. A near-optimal X-cross is praised, never "extra moves". A regression test with a hand-verified X-cross solve.
- **Best start:** during inspection (cross hint on) and in the review: the best cross AND any X-cross opportunity over the relevant faces (colour-neutral or the user's colour), e.g. "best cross: yellow, 6 · X-cross with green-red possible in 8"; the review compares the user's choice with it. Bounded worker search; unproven results labelled.
- **Praise markers:** optimal/near-optimal cross or X-cross, best available pair chosen (per the pair engine, proven), efficient pair (≤ proven minimum + 1), good pseudo pair, skips, fast recognition (vs the user's per-case average), clean LL. Ranked with the negatives by impact; at least one praise line per solve when evidence exists.
- **"Saves ~N"** numbers: computed from the analysis where possible; otherwise labelled "estimate".
Acceptance: golden solves with expected markers (incl. praise); `tests/analysis-golden.mjs` extended; the user's recordings replay with sensible markers.

## F4: Drills, algs and timer on the Orbit, with the smart cube (after F0)
Frames: `B-08` (drill), `00-system-flows` (alg playback, drill round, manual timer).
- **Smart cube in drills and alg drills:** connect from the page (the same session and chip as solve), mirror the physical moves + gyro live, show the CORRECT state (reproduce the current wrong/unclear state first with the fake cube; compare the drill cube with `session.getSnapshot().state`). Make explicit whether the cube shows the **case** (virtual) or **your cube** (mirrored). When a drill needs the physical cube in a case, use the guided setup (the guided-scramble engine on the ring) to bring it there.
- **Drill round on the ring:** the round's cases as segments (right/wrong/current), the answers as chips, the combo + average as two numbers. Replaces the bordered round panel.
- **Alg playback on the ring:** moves grouped by trigger, the group name once, no split/delta labels (fixes the "11–14 −0.00" labels); full-turn playback; the case cube at L size (same weight as solve), the highlight on the relevant pieces.
- **Manual timer:** the inspection ring then the solve (the `00-system-flows` timer); the cube at L size showing the scramble case; the scramble shown ONCE (on the ring); fix the clipped first chip.
- **Piece highlighting everywhere** a case is shown: F2L pair + slot, cross edges, X-cross edges + pair (cross planning, lookahead, the F2L/OLL/PLL pages, pins, review moments).
Acceptance: Playwright with the fake cube: a drill mirrors moves and the state matches; an alg playback ends in the expected state; screenshots per page vs the frames.

## F5: Progress page on the Orbit (after F0)
Frame: `00-system-flows` progress. One ring = the average split per stage over the period, colour = the change vs the previous period, tap an arc → that stage's drill; sessions/period filters as chips; drill rounds and due cases as compact rows using mini-orbits. Remove the stat cards/sparklines that duplicate the ring.

## F6: Remaining roadmap features (independent; can run any time)
- **Goals, weekly report, share card:** a goal (e.g. "sub-15 ao12"), progress toward it on the progress ring; a weekly summary (offline, generated locally); a share card image of a solve's orbit (rendered locally to PNG; no upload).
- **Voice callouts** (off by default): verify the 8 s / 12 s spoken callouts work offline (SpeechSynthesis), with a settings toggle and a test with the API mocked.
- **Site name:** keep "CubeSight" in one constant until the user decides; no other naming work.

## F7: Things only the user can verify (track; don't block)
A physical GAN solve (cube clock, results), a disconnect mid-solve → resume/discard, auto-reconnect, rotation markers, the smart-cube drill mirroring + repaint, an X-cross solve graded correctly, phone performance. The lead will turn the user's recordings of these into fixtures/tests.

---

## Parallelism and ownership
| Wave | WPs (parallel) | Owns |
|---|---|---|
| 1 | **F0** alone (+ F3 and F6 in parallel; they don't touch UI components) | F0: `src/ui/orbit/**`, `src/ui/cube/**` (new), the shared pieces, a dev gallery. F3: `src/analysis/**`, `src/brain/coach-lines.js`, the review data. F6: `src/goals/**`, the voice callout module. |
| 2 | **F1, F2, F4, F5** in parallel after F0 merges | F1: `src/brain/**` solve/results; F2: `src/history/**` + routes `#/history/*`; F4: `src/drills/**`, `src/algs/**`, `src/timer/**`; F5: the progress page |
Shared files (`src/main.js` routes, `types.js`, `tokens-*.css`): additive edits only, coordinate via small commits; the lead resolves merges.

## How the lead reviews each WP
Read the diff; run the full quality gate on the combined branch; open the WP's screenshot gallery and compare it with the orbit-v3 frames; replay the user's real recordings; independently verify any engine claims (re-run benchmarks/goldens, spot-check with cubing.js); check every acceptance item. Gaps go back to the builder with specifics.
