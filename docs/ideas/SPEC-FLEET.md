# Fleet spec: everything still to build

> **Handing this out:** give each agent this file plus its work-package ID, e.g. "Implement **F0** from `docs/ideas/SPEC-FLEET.md`". Every agent must read: this file in full (the user feedback and ground rules apply to all), `docs/design/orbit-v3/README.md` + the gallery, `docs/design/VOICE.md`, and `docs/ideas/FEATURES.md` for background. **Wave 1:** F0, F3, F6, F8, F9 (in parallel). **Wave 2, after F0 is merged:** F1, F2, F4, F5, F10, F14. The lead reviews and merges every WP.

The brief for the next fleet of builder agents, and the checklist the lead reviews against. It consolidates every open item from `ROADMAP.md`, `REVIEW-NEXT-2.md`, `REVIEW-NEXT-3.md`, `FEATURES.md` and the Orbit v3 designs. Where this file and an older doc disagree, **this file wins**.

**Design reference:** `docs/design/orbit-v3/` (gallery: `file:///home/loz/projects/cubesight/docs/design/orbit-v3/index.html`). **Direction (chosen by the user): A "one orbit": the cube is the centrepiece.** Key frames the user loved: **A-05** (results: the dotted connector line between the coach line and the selected marker, with a fade in/out) and **A-10** (past solve: the cube highlighted). History follows **A-07** (a timeline by session), with C-07's orbit-card grid only as a possible alternative view later. B and C are reference only. See "User feedback on orbit-v3" below; it overrides the frames where they differ.

## User feedback on orbit-v3 (binding)
1. **Progress is only ever shown with the ring.** No vertical/horizontal progress bars or lines anywhere (e.g. the replay frame's vertical progress line must go). Anything "in the middle of a process" uses the ring.
2. **Two ring sizes, two label styles:** the **focus ring** (around the big cube, labels/tooltips placed around the ring) when the cube is the focus; the **mini ring** (labels to the SIDE of it, less crowded) when browsing (history, algs lists, drills lists).
3. **The ring can grow:** segment count is dynamic (e.g. a 20-move scramble gains segments when the user makes a wrong turn and the undo moves are inserted); animate the growth calmly.
4. **Scramble lookahead:** cubers read ahead, so show MANY moves at once: the whole scramble visible on/around the ring (done dimmed, current emphasized, upcoming readable), or a rolling window that still shows a generous number of upcoming moves. Never only the current move.
5. **Sections in the ring API:** segments can be grouped into sections (e.g. an algorithm's triggers such as the "sexy move" (R U R′ U′), written with parentheses in notation), shown as a small gap/bracket with an optional section label. Alg playback uses this.
6. **Direction:** the ring API supports clockwise and counter-clockwise filling.
7. **A ring inside a ring is for comparison only** (e.g. comparing two algorithms, or yours vs better as in A/B review frame 6). It's NOT approved for the manual timer or progress. Those use a single ring. The user wants to see before/after demos of nested rings in the design lab (F10) later before approving any other use.
8. **A crowded ring** (not the happy path): a solve can produce many markers/tooltips, some very close together. The design must handle it gracefully: cluster nearby markers into one badge with a count, expand on hover/tap, keep labels from overlapping (collision layout), rank by importance, and never hide the time/key info. The F8 layout suite must include a "many markers" fixture (≥ 12 markers, several within 5°).
9. **Coach ↔ marker connector (A-05):** the dotted line connecting the coach sentence to its marker, with a fade in/out, is a core pattern; reuse it wherever text explains a ring point.

10. **Naming:** the ring component is called **the Orbit** everywhere (code: `Orbit`; copy: "orbit"). There is no longer a separate "Orbit style": the Orbit look IS the site's look (Mono remains only as a legacy skin; light mode stays supported).
11. **No scrolling on the main pages:** **solve** (every phase), **drills** (the hub and drill screens) and the **algorithm library** (the browser and case pages) must fit the viewport without vertical scrolling at 1280×720 and above in their default states. Design for one screen; put rarely-needed content behind "more…", the help (?) page, or a drawer. Results, history and progress may scroll, but keep the cube/orbit in view. The F8 layout suite asserts `scrollHeight <= innerHeight` (+2 px) for these pages at 1280×720, 1440×900 and 1920×1080.
12. **No footer.** Remove the site footer everywhere. Its content (the build/version badge, "everything stays on this device", links) moves into the **help (?) page**, which is redesigned (see F14).
13. **Open vs full Orbit (two shapes, animated between):** by default the Orbit is **open**: a dial with a gap at the bottom (A's "slot") where the one important number/control lives and that the user can interact with. It can **close into a full ring** when the situation calls for a complete circle, e.g. while **connecting** (the full ring spinning is a signature moment), and other "whole" moments the designs define. The transition open ⇄ full (and the collapse when moving on to other content, e.g. from the cube to a list/mini view, and the expand back) is ALWAYS animated: smooth arc-length morph with the segments/markers keeping their positions, ~300–450 ms, a calm easing, interruptible; reduced motion = an instant swap. The Orbit API exposes `shape: 'open' | 'full'`, `gap` (angle) and `collapse()/expand()` with promises for sequencing. F0 builds it; F1/F4 use it (connect = full spinning ring → open dial when ready).

## Ground rules (every work package)
1. **Offline-first PWA:** no backend and no runtime calls to other origins; new assets precached; airplane mode works.
2. **Orbit-dark first.** Orbit light must keep working; Mono may keep working as a skin but must not block or shape any decision.
3. **One Cube + one Orbit.** Use only the shared components from F0 (plus the five shared pieces: header, key bar, coach line, ≤ 3 actions, chip). No new one-off rings, chip strips, tables or charts. If you think you need one, stop and report.
4. **Calm:** at most one animated element at a time; respect `prefers-reduced-motion`; demonstrations animate **full turns**; the partial "cue" is only for the next move the user must make.
5. **Vocabulary** per `docs/design/VOICE.md` (decisions 1–10). The cubing labels for review markers; praise first.
6. **Honesty:** only proven/verified results are presented as facts; partial searches are labelled; sample data only in dev fixtures.
7. **Replayable:** smart-cube and user-action behaviour stays reproducible with `scripts/replay-recording.mjs`; real recordings live in `/home/loz/Downloads/cubesight-recording-*.json` (and `tests/fixtures/rotation-cross-recording.json`).
8. **Process:** branch from the tip of `feature/smart-cube-guidance` in your own worktree; never push; never use port 5173; never bypass the pre-commit hook; tests never write into `docs/` or `src/`; descriptive commit messages only (no WIP auto-commits).
9. **Quality gate for a merge request:** `npm run check` green (0 lint errors), the full `npx playwright test` green, `npx playwright test --config=playwright.pwa.config.js` green, and (once F8/F9 land) the **layout invariant suite** `npm run test:layout` and the **snapshot suite** `npm run test:snapshots` green, with any intended visual change shown in a `snapshots:compare` gallery. Every new route/screen/state must be registered in the F8 matrix.
10. **Number everything for discussion.** Every design frame/screenshot has a visible ID (e.g. `A-05`), and anything the user should look at within a frame is marked with a numbered callout (①②③…) explained in the gallery caption. Galleries list frames in numeric order.
11. **Show your work:** screenshots of every changed screen in Orbit dark (+ Orbit light, + a 390 px phone); write a gallery `index.html` next to them (relative paths) that includes the shared lightbox (`docs/design/_gallery/lightbox.js` + `.css`: click to zoom/loupe, ←/→ to browse) and report its `file://` link. Read your screenshots and compare them with the orbit-v3 frames.
12. **Report:** commits, files, test results, the gallery link, deviations, open questions.

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
- **BUG (user-reported 2026-10-01), the algorithm screens ignore the smart cube:** with a GAN cube connected, the algs case page / alg drill cube does NOT follow the cube's gyro rotation, does NOT animate the physical moves, and doesn't reflect the cube at all. Reproduce first with the fake cube (moves + GYRO events) and, if available, a user recording from `/home/loz/Downloads/cubesight-recording-*.json` made on the algs page; then fix it so the algs cube behaves exactly like the solve cube (the same shared Cube in `live` mode: gyro orientation, queued move animations, the correct state), with the explicit "case" vs "your cube" display rule below. Regression test: on the algs case page, emitted moves animate and change the state, and gyro events rotate the view.
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

## F8: Layout test kit: no sideways scrolling, nothing off-screen, ever (wave 1, parallel with F0)
The user: "we should never be able to scroll to the side, except scrolling up and down… things flowing off-screen must always be tested."

Build a reusable Playwright layout-invariant suite (`tests/layout/**`, `npm run test:layout`, included in the full Playwright run and CI):
- **A matrix:** every route from the route table (incl. legacy redirects' targets, history/past-solve/replay, drills, algs case pages, the timer, progress, settings/debug drawers open) × every major STATE reachable with the fake-cube harness / fixtures (idle, connecting, guided scramble + wrong turn, inspection + overtime, solving, results, review detail, replay mid-way, a drill mid-round, alg playback mid-way) × viewports **320×568, 360×740, 390×844, 768×1024, 1024×768, 1280×720, 1440×900, 1920×1080** × Orbit dark + Orbit light (Mono at 390 and 1440 only). Also emulate the 200% text zoom at 1280 and the `prefers-reduced-motion`.
- **Invariants checked at every cell:**
  1. **No horizontal scroll:** `document.scrollingElement.scrollWidth <= innerWidth` AND `window.scrollX` stays 0 after `scrollBy(500, 0)`. **Masking with `overflow-x: hidden` on html/body is not a fix**: also check (2).
  2. **Nothing off-screen sideways:** every visible element's bounding box lies within `[0, innerWidth]` (tolerance 1 px), except descendants of elements explicitly marked as horizontal scrollers (`data-scroll-x`), which themselves must fit the viewport and be keyboard/touch scrollable.
  3. **No clipped text:** text elements whose `scrollWidth > clientWidth` must have intentional truncation (`text-overflow: ellipsis` + a full-text title/aria-label); otherwise fail.
  4. **No overlap of key UI:** the header, the cube canvas, the orbit labels, the rail, the actions and the key bar don't overlap each other (pairwise box intersection; orbit labels must not overlap each other).
  5. **Touch targets** ≥ 40×40 px on phone widths; focus outlines visible on keyboard focus.
  6. **Sticky/scroll behaviour:** on the scrolling screens (results, history, progress) scroll to the top/middle/bottom and assert that sticky elements (e.g. the centred results cube) stay within the viewport and never cover the header; no layout jump > 4 px when a lazy component (cube, orbit, worker results) loads (CLS-style check via PerformanceObserver).
  7. **Exactly one canvas** per page.
- **A clear report:** on failure, a screenshot with the offending element outlined, plus its selector, box and the cell (route/state/viewport/theme), saved under `test-results/layout/`, with an `index.html` gallery of the failures.
- **A baseline run:** run it on the current app, fix every real failure found (or list them as tasks for F1/F2/F4/F5 if they're in their files), and keep the suite green afterwards. Runtime budget: < 6 min in parallel; a `--grep` per route for quick local runs.
- **Docs:** a short `tests/layout/README.md`: how to add a route/state to the matrix and how to mark an intentional horizontal scroller.

## F9: Snapshot testing: the whole site, simulated and compared (wave 1, with F8)
The user: "we can fully simulate the cube, maybe the website itself, so we can have snapshots between two things and make sure things look exactly the same."
Extend the existing screenshot tests (`tests/brain-visual*.spec.js`) into a complete, deterministic snapshot suite (`tests/snapshots/**`, `npm run test:snapshots`):
- **Deterministic simulation:** drive every flow with the fake cube harness and with recordings (`src/recording-replay.js` / the fixtures, incl. `tests/fixtures/rotation-cross-recording.json`); freeze time (`page.clock`), seed scrambles/randomness, fix the fonts (bundled), disable animations (or capture at fixed animation phases), render WebGL with SwiftShader (`--use-gl=swiftshader`) for stable cube pixels, and set a fixed cube camera/gyro. Nothing may depend on wall time, the network or the GPU.
- **Three kinds of snapshot per cell** (reuse F8's route × state × viewport × theme matrix, a lighter subset by default):
  1. **Pixel snapshots** (`toHaveScreenshot`, a tight `maxDiffPixelRatio`, with the cube canvas INCLUDED, now that it's deterministic);
  2. **Structure snapshots:** the accessibility tree / a trimmed DOM outline (`toMatchAriaSnapshot` or a serialized role/name/text tree), robust to pixel noise and catching missing or duplicated UI;
  3. **State snapshots:** the view-model JSON for each state (`buildViewModel` output from fixtures) via `toMatchSnapshot`, so logic changes that alter what's shown are caught even before rendering.
- **Comparing two versions** ("snapshots between two things"): a script `npm run snapshots:compare -- <base-ref> [<head-ref>]` that renders the suite on two git refs (worktrees, never touching 5173) and writes a side-by-side + diff-overlay gallery (`test-results/snapshot-compare/index.html`, reported as a `file://` link) listing every changed cell. The lead uses it to review each WP (base = the branch tip before merge).
- **Updating baselines** only via an explicit command (`npm run snapshots:update`), and the diff gallery must be reviewed before baselines change in a commit; the commit message lists the intentionally changed cells.
- Baselines are committed (PNG + JSON) under `tests/snapshots/__baselines__/` (Linux/Chromium only; CI pins the same).
Acceptance: two consecutive runs on the same commit produce zero diffs (proves determinism, including the 3D cube); deliberately changing one colour token produces a diff gallery that flags exactly the affected cells; runtime budget < 8 min in parallel.

## F10: Design lab: proposals rendered live in the site (required; after F0, not blocking F1)
The user: the old debug screen should become a way for the agent to show them different designs of pages and components *in the site itself*, with the options available to switch, scroll and see how they fit on each page.

Build a dev-area **design lab** at `#/dev/lab` (reached from the debug drawer; offline; excluded from the user-facing nav):
- **Proposals as code:** a registry (`src/dev/lab/proposals/*.js`), where each proposal has `{id, title, why, page/route, component?, variants: [{id, label, description, apply()}], fixtures/states}`. A variant is applied with a scoped flag (e.g. a `data-lab-variant` attribute + CSS/JS behind `labVariant('results-actions') === 'B'`) so variants run inside the REAL page with the real Cube/Orbit components, never as screenshots.
- **The viewer:** pick a proposal → the real page renders with the fake-cube/recording simulation in a chosen state (idle, scramble, solving, results, history, a drill…) → switch variants A/B/C instantly (buttons + keys 1/2/3), or show them **side by side** (two or three iframes of the same route with different variants); a viewport switcher (phone/tablet/desktop) and scroll freely inside each; Orbit dark/light toggle.
- **Feedback loop:** per variant, "pick" / "reject" + a free-text note, stored locally and exportable as a JSON file (and, in dev builds only, POSTed to a `/__lab-feedback` endpoint that writes `/tmp/cubesight-lab/<timestamp>.json`, like the recordings), so the agent can read the user's choices directly.
- **Promotion:** once a variant is picked, the agent promotes it to the default and deletes the losing variants (the registry keeps the decision log in `docs/design/lab-decisions.md`).
- **Agent workflow (documented in `docs/design/LAB.md`):** for design questions after the redesign, agents add a proposal to the lab instead of (or in addition to) static SVGs, and report the link `http://localhost:5173/#/dev/lab/<proposal-id>`.
Acceptance: a sample proposal with 3 variants of the results actions area and 2 of the history list renders live with the fake cube; side-by-side works on desktop; feedback round-trips to a JSON file; the lab code is tree-shaken out of production builds (or gated so it never appears there); the layout (F8) and snapshot (F9) suites ignore lab routes except a smoke test.

## F14: Help page and footer removal (wave 2, small; owns `src/main.js` footer/help markup + a new `src/help/**`)
- Remove the footer site-wide (all routes) and reclaim its vertical space.
- A redesigned **help (?) page** (the header's "?" opens it as a page or a large sheet, in the orbit language): a short "how CubeSight works" (solve with a smart cube, drills on the phone, algs, progress), the keyboard shortcuts (generated from the shared key map, per page), the smart-cube connection/troubleshooting tips (including the MAC/Bluetooth notes), offline/privacy ("everything stays on this device"), data backup/export/import, the version/build badge + "check for updates", and credits (algorithm sources per FEATURES #25, the cube-xcross engine licence, fonts).
- Acceptance: no footer on any route (F8 asserts it); the help page fits one screen per section on desktop, works offline, and screenshots are in the gallery.

## Future tasks (after the waves above; not blocking)
- **F11 Performance audit:** an agent measures and improves performance everywhere (startup, the three.js/worker cold start, the pair search, rendering FPS on the ring + cube, memory, the bundle size, phone performance), with a benchmark report and regressions guarded in CI.
- **F12 Cube skins (maybe):** user-customisable cube appearance (sticker colours/shapes, the plastic body, stickerless styles). The user isn't sure yet; first prototype it in the design lab (F10).
- **F13 Nested-ring demos:** before/after demos in the design lab showing where a ring-inside-a-ring helps (comparisons) vs a single ring, for the user to decide.

## Parallelism and ownership
| Wave | WPs (parallel) | Owns |
|---|---|---|
| 1 | **F0** alone (+ F3, F6, **F8** and **F9** in parallel; they don't touch UI components) | F0: `src/ui/orbit/**`, `src/ui/cube/**` (new), the shared pieces, a dev gallery. F3: `src/analysis/**`, `src/brain/coach-lines.js`, the review data. F6: `src/goals/**`, the voice callout module. F8: `tests/layout/**`, the package.json script, CI. F9: `tests/snapshots/**`, `scripts/snapshots-compare.mjs`, the package.json scripts. |
| 2 | **F1, F2, F4, F5** in parallel after F0 merges; **F10** any time after F0 (doesn't block F1); **F14** any time | F1: `src/brain/**` solve/results; F2: `src/history/**` + routes `#/history/*`; F4: `src/drills/**`, `src/algs/**`, `src/timer/**`; F5: the progress page |
Shared files (`src/main.js` routes, `types.js`, `tokens-*.css`): additive edits only, coordinate via small commits; the lead resolves merges.

## How the lead reviews each WP
Read the diff; run the full quality gate on the combined branch; open the WP's screenshot gallery and compare it with the orbit-v3 frames; replay the user's real recordings; independently verify any engine claims (re-run benchmarks/goldens, spot-check with cubing.js); check every acceptance item. Gaps go back to the builder with specifics.
