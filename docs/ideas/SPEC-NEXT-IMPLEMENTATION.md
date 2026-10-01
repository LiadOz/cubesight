# SPEC-NEXT implementation report

All eight work packages in [SPEC-NEXT](SPEC-NEXT.md) are implemented for `feature/smart-cube-guidance`, combined on `implement/spec-next` and merged locally after the final quality gates. The user confirmed the full scope. Work was split across isolated worktrees and combined on the integration branch; nothing was pushed. Implementation history runs from base `2ef22a3` through source commit `bef2863`; final integration fixes are `f965020`, `08ed612`, and `bef2863`.

## Feature matrix

| Package | Integrated behavior | Evidence and scope |
|---|---|---|
| WP1 · Site and routes | Responsive solve, drills, algs and progress navigation; legacy hash redirects retain query strings; pages load offline. | Route, browser and PWA checks; desktop/mobile site screens in `test-results/spec-next-final/ui/site-ui/` (16 images). Redirect map below. |
| WP2 · Manual timer | Keyboard and touch timer, hold-to-start, inspection and penalty settings, persistent results, and offline WCA scrambles. | Timer, persistence and installed-app tests; Orbit/Mono × light/dark × desktop/phone screens in `test-results/spec-next-final/ui/timer-ui/` (8 images). |
| WP3 · Solve suggestions | Worker-based cross/pair analysis with all four pair boundaries, pseudo-pair frames, compact pruning tables, verified continuations, case recognition and timing for OLL/PLL. Partial searches remain explicitly unproven. | Independent 16-scramble sample: 58 queried pair positions, 54 with options, 57 partial searches, zero completion-verification failures; median 160.64 ms, p95 161.56 ms, max 163.39 ms, cold table build 81.05 ms. Production tables are approximately 332 KB. These are bounded results, not a global-optimality claim; most sampled positions returned partial searches. |
| WP4 · Solve review | Replay, stage and move timing, efficiency comparisons, review markers, retry/regrade, long recordings, and imported reconstructions with route/deep-link support. | Focused review and route tests; 300 notation/physical-model round trips; review/import/retry matrix in `test-results/spec-next-final/ui/review-ui/` (24 style/theme/viewport images plus 2 phone solve captures). |
| WP5 · Algorithm browser and drills | Curated offline library with 194 credited algorithms across 100 cases: 57 OLL, 21 PLL, 16 two-look stages, and a six-case F2L subset. Includes independent verification, source links, custom algorithms, picks, SRS, self-timed and smart-cube drills, and last-layer virtual repaint. | All bundled algorithms replay against their canonical case and preservation constraints in `tests/algs-unit.test.mjs`; last-layer recognition and partial guards in `tests/analysis-last-layer-unit.test.mjs`; progress and backup integration in `tests/progress-unit.test.mjs` and `tests/data-port-unit.test.mjs`. Algorithm screenshot matrix: 48 grid/case/drill views plus 16 active-control views in `test-results/spec-next-final/ui/algs-ui-final/`. |
| WP6 · Drills and progress | Cross planning, pin variations, OLL recognition, lookahead and reusable quick rounds. Progress reads dated solve/drill activity, algorithm attempts and schedules, and legacy aggregates without inventing dates. | Drill, round, progress and offline checks; `test-results/spec-next-final/ui/progress-ui/` has 8 screens and `test-results/spec-next-final/ui/wp6-final-ui/` has 48 current drill screens across styles, themes, and desktop/phone widths. Current integration also has mobile review/timer captures in `test-results/spec-next-final/ui/visual-final-mobile/` (16 images). |
| WP7 · Vocabulary | Shared terms and formats with an A1–A92 implementation map; current copy uses the approved product vocabulary. | `docs/ideas/VOICE-AUDIT-IMPLEMENTATION.md` maps all 92 rows to current code or N/A. No row is marked Partial. `tests/copy-unit.test.mjs` checks the active-source vocabulary and formatting contracts. |
| WP8 · History and data | IndexedDB solve history, filters, sessions, replay/detail, csTimer import/export, pins, algorithm data, and versioned personal backups. Older backup versions remain readable. | History, import/export, migration and offline tests; `test-results/spec-next-final/ui/history-ui/` has 16 screens and a montage. The replay check passes for a 95-move fixture with a recorded solve duration of 69,363 ms. No physical cube or user Downloads recording was available, so this validates the fixture path rather than live hardware. |

The final algorithm sourcing decision in [FEATURES #25](FEATURES.md) (commit `2ef22a3`) governs the bundled lists: standard community algorithms from SpeedSolving Wiki and SpeedCubeDB have per-algorithm credit and source links. Algorithm data lives in `data/algs/*.json`. Search-generated pair completions remain local analysis results, not user-facing algorithm-library entries.

F2L coverage is intentionally a **six-case curated subset**, not the full 41-case set. The library contains 16 functional two-look stages. The smart-cube flows are exercised through the cube model, recorded move streams and browser integration; no physical device was attached for this report.

## Cache and review compatibility

Compact solve summaries use `SUMMARY_VERSION = 2`; analysis invalidation uses `ENGINE_VERSION = 3`. Stored v1 and v2 summaries remain readable, while summaries with a stale engine or summary version are recomputed when their records can be analyzed. Incomplete OLL/PLL stages can retain a recognized case and continuation, but receive no completed-stage execution or efficiency grade. Completed OLL and PLL recognition is tested across all six cross faces and AUF variants.

## Legacy route redirects

Redirects preserve query strings:

| Old hash | New hash |
|---|---|
| `#/brain` | `#/solve` |
| `#/corners` | `#/drills/corners` |
| `#/pll-recognition`, `#/pll` | `#/drills/pll` |
| `#/f2l` | `#/drills/f2l` |
| `#/cross-scout`, `#/scout` | `#/drills/scout` |
| `#/debug`, `#/smart-cube`, `#/dev` | `#/dev/studio` |

## Final integration fixes

- Opening solve settings updates controller state immediately, so a late style load cannot undo the interaction. A delayed-style browser check covers this startup race.
- Cold cross searches initialize pruning tables before starting the per-query search budget. A cold offline one-move cross pin and its distinct next variation are exercised in the installed-app suite.
- Pinned positions retain legal wide/slice notation through storage and backups; exact physical state is checked after restoration.
- F2L adaptation preserves cubie sticker ordering. Saved pseudo scans keep the exact position, attach its actual D-offset targets, and score a matching pair in the browser.
- Saved lookahead positions use verified next-pair continuations, including positions with three existing pairs. OLL recognition handles canonical setups containing rotations.

## Final checks

Validated on the combined integration tree on October 1, 2026:

| Gate | Result |
|---|---|
| `npm run check` | Pass: JavaScript/CSS lint has zero errors (75 JS and 3 CSS warnings); all 488 unit tests pass; production build succeeds. |
| Full Playwright browser suite | Pass: 241 tests in 8.4 minutes; 4 optional timer screenshot-capture tests skipped. The full screenshot matrices were captured and inspected separately. |
| Installed-app offline PWA suite | Pass: 12/12, including cold non-D PLL pins and cold unsolved-cross pin variations. |
| Production offline cache | 110 precached entries, 3,815.91 KiB. |
| Independent solve-model checks | All bundled algorithms and all six last-layer cross-face frames verified; recorded 95-move fixture replay passes. |

Full browser and PWA checks use separate ports 4191 and 4192; the user's port 5173 is untouched. Logs and benchmark/replay evidence are collected under `test-results/spec-next-final/`. Pre-commit lint and unit hooks run normally.

Physical-cube testing and performance measurements on a physical phone remain unverified. The environment has no `/home/loz/Downloads` directory or user recording; the replay evidence uses the supplied fixture.
