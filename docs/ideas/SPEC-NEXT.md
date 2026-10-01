# Next feature suite: exact expectations

This document is the brief for the next set of builder agents and the checklist the lead reviews against. Each work package (WP) states **what the user must experience**, **acceptance criteria** (every one must be demonstrably true before a merge), **tests required**, and **what it must not break**. Background and rationale: `docs/ideas/FEATURES.md` (numbered items), `docs/ideas/ROADMAP.md`, the designs in `docs/design/`.

## Ground rules for every WP

1. **Offline-first PWA.** No backend, no runtime network calls to other origins. Imports come from paste or file. External sources are plain links marked "needs internet". New assets must be precached; `pwa-tests/` must pass with the network off.
2. **Base branch:** `feature/smart-cube-guidance` (tip at hand-off). Work in your own git worktree and branch; the lead merges. Never push, never touch port 5173 (the user's dev server), never bypass the pre-commit hook.
3. **Quality gate for a merge request:** `npm run check` green (lint 0 errors, all unit tests, build), the full `npx playwright test` suite green, and `npx playwright test --config=playwright.pwa.config.js` green. Tests must never write into `docs/` or `src/` (screenshots go to `test-results/`).
4. **Look at your own UI.** Take screenshots of every new screen in Orbit and Mono × dark and light, plus a 390 px phone width, and Read them. Compare them with the referenced mockups. Report the paths.
5. **Vocabulary and formats** exactly per `docs/design/VOICE.md` (incl. the confirmed decisions 1–10): `R′` display, American spelling, PB/DNF/TPS caps, ao5 lowercase, keys space/esc/tab/b/r, "drill", "case", "combo" vs "streak", "efficiency" for the review score, times `12.34` / `14.97+` / `DNF(13.20)`.
6. **Visual language:** `--b-*` tokens only (`src/brain/css/tokens-*.css`, `docs/design/brain-v2/tokens.md`). No hex in component CSS. At most one animated element at a time on any screen (the user explicitly asked for calm UIs). Respect `prefers-reduced-motion`.
7. **Record/replay:** anything driven by the smart cube or user actions must stay replayable (`src/recorder.js`, `scripts/replay-recording.mjs`). If you change what's recorded, replay old recordings too.
8. **Honesty over polish:** where an engine can't produce an answer (e.g. no better-solution yet), say so in the UI ("no suggestion yet"). Never fake data outside dev fixtures, and label sample data as such.
9. **Report back:** the commits, files, screenshots, test results, deviations from this spec, and open questions.

---

## WP1: Site structure (phase 1)
**Start from branch** `worktree-agent-a18f056b4aefe5abc` (WIP: nav, routes, a drills hub, partially done; it passed the pre-commit checks). Design: `docs/design/brain-v2/trainers/README.md` (option B), mockups T-00, T-01, T-06, T-07.

The user experiences:
- A top bar `solve · drills · algs · progress` (labels from one constant; "solve" = today's Brain), the theme toggle showing the current mode, and help.
- Desktop, or any device with a cube connected, opens **solve**. A phone with no cube opens **drills**.
- **drills** = a hub listing every trainer with "continue" (the last drill + its settings) and a clear "needs a cube" / "no cube needed" marker.
- **algs** and **progress** exist as styled "coming soon" pages (filled by WP5/WP6).
- Debug/Studio is gone from the nav and reachable from solve's debug drawer (`#/dev/studio`).

Acceptance:
- Routes: `#/solve`, `#/drills`, `#/drills/{corners,pll,f2l,scout}`, `#/algs`, `#/progress`, `#/dev/studio`. **Every old hash redirects**, preserving query params (write the old → new table in the report).
- `chooseHome({isPhone, cubeConnected})` is pure and unit-tested.
- A key scope per route: a trainer's keys never fire on another page.
- Manifest name/short_name from one constant (the site name is still undecided; keep "CubeSight"). Fix: the phone nav clipped, the "no cube" dot green while disconnected, the manifest "Recognition Training".
- Existing trainers work unchanged inside the new shell in both themes.

Tests: routing (all redirects), chooseHome unit, nav Playwright in both themes, phone home → drills, PWA offline covers the new routes.

## WP2: Manual timer
**Start from branch** `worktree-agent-aa96eb3024509a21c` (WIP: `src/timer/**`, tests; it passed the pre-commit checks). Decision: NOT inside solve; a separate page sharing inspection, penalties, history and stats.

The user experiences:
- On any device (incl. iPhone): see a WCA scramble → hold space or touch (300 ms default, configurable 0/300/550) → inspection (the same modes/overtime/penalties as solve, using solve-live's pure functions) → the solve → stop on any key/touch.
- A big truncated time, the ao5/ao12/PB within the session focus, +2/DNF/delete/undo via the keys 2/d/Delete/u and on-screen buttons on touch.
- The screen stays awake (Wake Lock). No accidental starts. No scroll/zoom while holding.

Acceptance:
- Records are saved in the same history (`source:'manual'`, sessions + focus); the solve-screen analysis skips records without moves; stats never mix manual and smart-cube solves unless the user picks "all".
- The route `#/timer` (and a link from drills/solve), in both styles and themes.
- It works offline and after a reload (IndexedDB).

Tests: a unit state machine with a fake clock (hold threshold, inspection → solve, every overtime mode, truncation, the record shape); Playwright keyboard + touch (phone emulation), a penalty edit, persistence, offline.

## WP3: Best pair completion and better suggestions (engine)
**Input:** `docs/research/open-algorithms.md` + the prototypes in `docs/research/alg-gen/` (done). Findings that bind this WP:
- No complete openly licensed OLL/PLL/F2L database exists (the SpeedSolving wiki has no stated licence, csTimer is GPL, J Perm/SpeedCubeDB have none). **Algorithms are self-generated at build time** (a script → a bundled JSON of roughly 30–60 KB), verified against an independent model; external collections are links only.
- Prototype: meet-in-the-middle over `<R,U>`, `<R,U,F>`, `<R,U,D>`, `<R,U,L>`, `<R,U,F,D>`, `<R,U,r>`, `<R,U,M>`; it rediscovers T, J, R, A, G, U, H, Z, Sune… Missing (E, F, Na, Nb, V, Y, Ja; OLL 2/44/57) need deeper search or `f`/`S`/rotation sets; extend the generator until **all 21 PLL and 57 OLL** have ≥ 2 good algs.
- Case IDs: derive the 57 OLL / 21 PLL classes from the last-layer group (`ll-classes.mjs`); no external data.
- Best pair completion: a new IDA* (`pairbest.mjs`) over 18 face turns on a 12-piece tracked state; D turns give pseudo/multislot/keyhole for free; it matched the WASM on 108/108 slot queries. Use the ~332 KB tables (not the 32 MB ones). Expected latency: median 0.2–0.3 s, p95 ≈ 1.8 s per position, so it runs in the analysis worker with a time budget and a "searching…" state, never blocking the UI. Replace the pairs 1–2-only planner path for review suggestions.
- Replace the hand-typed algs in `src/pll-logic.js` (provenance concern) with generated ones.

The user experiences:
- In the review/results, at any F2L moment: "best pair completion from here", i.e. the shortest/most ergonomic insertion of any available pair (all 4 slots, pseudo/D-offset frames, keyhole/multislot options), shown against what they did, for **pairs 1–4** (today only 1–2).
- For OLL/PLL: the case they had (identified), the AUF they used, and a better algorithm/AUF when one exists.
- Everything animates on the real 3D cube ("yours vs better").

Acceptance:
- Engine: pure, offline, in a Web Worker. It returns ranked options with move counts (STM/ETM), the generator set and an ergonomic score. Runtime targets: median ≤ 300 ms, p95 ≤ 2 s per position, with a hard budget + partial results; measured and reported.
- Algorithms come from **self-generated** search results and/or **clearly licensed** sources only, each with credit metadata (FEATURES #16).
- Plugs into the existing review markers ("better pair", new "better alg/AUF") and the detail view; "no suggestion yet" disappears for pairs 3–4.
- Case capture: every solve records `ollCase` / `pllCase` (+ recognition vs execution time per case).

Tests: golden positions with known best insertions (hand-verified by replaying on the state model); the known PLL/OLL cases identified correctly incl. AUF variants; a perf test.

## WP4: Full solve review (chess.com-style, v1 remainder)
Design: `docs/design/brain-v2/review/SPEC.md` + R-dark-*.png. Builds on the merged results v1 (markers, detail, pins).

The user experiences:
- "Review solve" from results → a review screen: step through the solve move by move on the real cube, a solve graph (moves vs par / time) with pauses, per-stage **efficiency** scores (cross/F2L/LL + overall), cubing labels on moves (scheme A), a tooltip per move, key moments (`[` `]`), the best continuation.
- **Retry this moment:** the smart cube's guided scramble sets up that exact position, the user retries the segment, and it's re-graded.
- Imported reconstructions (paste text / alg.cubing.net link parsed locally) get the same review, without time-based labels.

Acceptance: labels and scores follow SPEC §3 (thresholds documented in code), inferred labels hidden by default, deep links from every label to its drill (with `from=` and a back pill), mobile layout per R-dark-06.

Tests: golden solves with expected labels/scores (reuse `tests/analysis-golden.mjs`), a retry flow with the fake cube, the import parser round-trip (300 random algs vs the state model, as in the review prototype).

## WP5: Algorithm database, browser and alg drills
Design: `docs/design/brain-v2/algs/SPEC.md` + A-*.png. Data from WP3 / the open-algorithms research only (clear rights + credit).

The user experiences:
- `#/algs`: a case grid (PLL, OLL, 2-look, F2L) → a case page with algs, sources/credits (links marked "needs internet"), "my pick", and "used by" stats only from user-imported reconstructions.
- `#/algs/<set>/<case>/drill`: repeat one alg on the smart cube, with the move-by-move match, per-move timing bars, attempt time/TPS vs PB, hesitation hotspots, and a virtual last-layer "repaint" so no re-setup is needed. Without a cube: a self-timed tap drill.

Acceptance: the matcher tolerates AUF / double-turn forms / equivalent execution; F2L-intact check; spaced repetition across algs; IndexedDB storage; export/import via data-port.

## WP6: Drills phase 2 (phone-first) + progress page
Design: trainers README + T-*.png; FEATURES items 14, 22–24; VOICE decisions 5–6.

The user experiences:
- Every drill re-skinned in the shared shell, with quick rounds (2 min / 20 cases / 30 s), a combo counter, a small results card, "one more round", resume where you left off, and a gentle day streak.
- Spaced repetition + retrieval practice. New drills: **OLL recognition**, **cross planning** (from Cross Scout; the explorer moves into review), a **lookahead** drill.
- **Pins** open in the matching trainer at that position; variations randomize the non-essential pieces while keeping the technique possible (keyhole slots stay open, etc.).
- **progress**: one page across solves and drills (a read-only adapter over the existing keys), the drill ↔ solve link.

Acceptance: trainers accept a start position (`setup=` / `scramble=` / `cases=`); every generated variation is verified by the planner before being offered.

## WP7: Vocabulary pass
Apply `docs/design/VOICE.md` §9 (92 audit rows) + the decisions; add `src/copy/terms.js` (terms, formats, the key map) and a banned-synonyms test (a ratchet). Run it **after** WP1 merges (both touch page copy).

## WP8: History & data
A history page (list, search/filter by session/focus/source, per-solve detail with a replay on the 3D cube), csTimer-compatible import/export, pins in export/import, a small UI to change the session gap.

---

## Hand-off state

| Branch | Content | Status |
|---|---|---|
| `feature/smart-cube-guidance` | everything merged so far | green; the base for all WPs |
| `worktree-agent-a18f056b4aefe5abc` | WP1 WIP (site structure) | stopped mid-build; passed the pre-commit checks |
| `worktree-agent-aa96eb3024509a21c` | WP2 WIP (manual timer) | stopped mid-build; passed the pre-commit checks |
| `docs/research/open-algorithms.md` + `alg-gen/` | WP3/WP5 input | done (prototypes, verified outputs) |

## Suggested order and parallelism
- Wave A (parallel): WP1, WP2, WP3.
- Wave B (parallel, after WP1): WP4, WP5 (needs WP3 data), WP7.
- Wave C: WP6, WP8.

## How the lead reviews
For each merge request: read the diff, run the full quality gate on the combined branch, read the screenshots against the mockups, replay at least one real user recording (`/home/loz/Downloads/cubesight-recording-*.json`) through `scripts/replay-recording.mjs`, and check every acceptance item above. Anything missing goes back to the builder with specifics.
