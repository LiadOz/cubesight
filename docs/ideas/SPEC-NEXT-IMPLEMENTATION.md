# SPEC-NEXT implementation

Started 2026-10-01 from `feature/smart-cube-guidance` (`eea1766`). Scope: all eight work packages in [SPEC-NEXT.md](SPEC-NEXT.md), confirmed by the user. Builders use Luna agents and isolated worktrees; the lead reviews and combines their changes on `implement/spec-next` in `/home/loz/projects/cubesight-spec-next`. No changes are pushed.

## Status

| Package | Branch | Status |
|---|---|---|
| WP1 · site structure | `implement/spec-next-site` | Integrated; route/browser/offline checks pass |
| WP2 · manual timer | `implement/spec-next-timer` | Integrated; keyboard/touch/persistence pass; offline scramble fix in progress |
| WP3 · suggestion engine | `implement/spec-next-engine` | Pair engine integrated; canonical last-layer data/suggestions in progress |
| WP4 · full solve review | `implement/spec-next-review` | Implementation in progress |
| WP5 · algorithm browser/drills | after WP3 | Pending |
| WP6 · drills/progress | after WP1 | Pending |
| WP7 · vocabulary | `implement/spec-next-copy` | Implementation and 92-row audit in progress |
| WP8 · history/data | `implement/spec-next` | Integrated; unit/browser/offline checks pass; screenshots inspected |

## Baseline and environment

- `npm run check`: passed on the unchanged base (lint has existing warnings, zero errors).
- Browser baseline: 162 tests passed; two tests created mobile contexts with a hardcoded port 4174 despite the configured worktree port. Changed them to use Playwright's `baseURL` fixture; both affected tests pass. No application failure found in the baseline suite.
- Chromium and its required system libraries installed for browser testing. Ubuntu package sources use HTTPS; HTTP package requests were blocked while HTTPS requests worked.
- The requested `/home/loz/Downloads/cubesight-recording-*.json` location is unavailable in this environment. The repository recording `tests/fixtures/rotation-cross-recording.json` replays successfully through the real session/tracker. This is a fixture check, not a substitute for hardware testing.
- Tests and screenshots use worktree-specific ports; port 5173 is untouched.

## Research verification

The completed research is now available in `docs/research/open-algorithms.md` and `docs/research/alg-gen/`, merged from `c9c3619`. Final sourcing decision `2ef22a3` (FEATURES #25) supersedes the self-generation recommendation: use curated standard community algorithms with per-alg credit/source links in a separate JSON data bundle, conventional OLL/PLL identifiers, and independent verification. The spec has been reconciled with this final decision.

Independent checking of the initial prototype found a wrong corner-slot mapping and failing PLL candidates (157 of 442). Corrections and inverse reference-setup checks are required before shipping data. Pair runtime targets now follow the completed research: median ≤300 ms and p95 ≤2 s with a hard budget and partial results; compact pruning tables are required.
## WP8 data foundation

Commit `e55698e` adds history filtering and a 3D replay/detail page, native csTimer JSON import/export, session-gap controls, pin export/import and shared-store refresh.

The four new data tests verify raw time and penalty round-trips, independent sessions, rejection of malformed imports before writes, duplicate timestamp handling, intersecting filters, and self-contained pin backup restoration without duplicate moments. The two history browser tests pass (filtering, replay, penalty/delete/undo, persistence, atomic csTimer imports, exports, session gap). Its installed-app offline replay test passes. Sixteen screenshots cover replay/detail and data tools in Orbit/Mono × dark/light at 1280 and 390 px; paths: `test-results/history-ui/`. Seeded records are test fixtures only. Inspection caught a direct-route shared palette dependency; shared page CSS now loads with the shell and the routed timer test checks the rendered header/page colors.

## Integrated wave A

WP1 commit `fa238c0` merged via `a20fd5d`; WP2 commit `2e65f76` merged via `c362dec`. Combined focused browser checks: 47 passed, 4 optional screenshot tests skipped; the separate timer agent screenshot run passed all 11. Actual routed timer and history checks: 3 passed. WP1 focused navigation/routes: 38 passed.

Installed-app checks currently pass Brain/style modes, all WP1 routes, history/replay, and legacy trainers (4 test cases). The manual timer offline test exposed a cubing.js worker-entry loading failure; it remains an active fix, not a passing gate.

WP1 screenshots: `/home/loz/projects/cubesight-wp1/test-results/wp1-ui/`. WP2 screenshots: `/home/loz/projects/cubesight-wp2/test-results/timer-screenshots/`. Each contains desktop style/mode coverage and 390 px phone states, inspected by its builder and sampled by the lead.

Legacy hash redirects retain query strings:

| Old hash | New hash |
|---|---|
| `#/brain` | `#/solve` |
| `#/corners` | `#/drills/corners` |
| `#/pll-recognition`, `#/pll` | `#/drills/pll` |
| `#/f2l` | `#/drills/f2l` |
| `#/cross-scout`, `#/scout` | `#/drills/scout` |
| `#/debug`, `#/smart-cube`, `#/dev` | `#/dev/studio` |

## Pair engine evidence

Snapshots `e033ce9` and `d7026a3` merged via `7abe935`: all four pair boundaries, pseudo start/end frames, compact multi-source pruning table with exact goal checks, verified completions, ranked STM/ETM/generator/ergonomic metadata, chosen-slot references, and OLL/PLL case timing capture. Combined `npm run check`: 396/396 unit tests, lint zero errors, build and 102 precached assets pass.

Reproduce the independent runtime sample with `node scripts/benchmark-pairs.mjs`. On 16 seeded random 22-turn positions, after a real WASM cross and successive engine-chosen pair completions: 58 queried pair positions, 54 with options, 57 partial searches; median 160.64 ms, p95 161.56 ms, max 163.39 ms; compact-table cold build 81.05 ms. Every returned completion preserves the cross and previous pairs and completes a new pair when independently checked against cubing.js: zero failures. The bounded search meets the runtime targets on this machine; it does **not** prove optimality for most sampled positions. Subsequent stages depend on the preceding chosen completion, and time budgets can change how many stages are reached. No phone performance claim is made.

The canonical curated algorithm bundle and full last-layer suggestions remain active dependencies of WP3/WP5. No claim of complete WP3 acceptance is made yet.

## Final review

Pending: combined lint/unit/build, full browser suite, offline PWA suite, screenshots inspected in both styles/themes and on 390 px phones, recording replay, acceptance item audit, redirect table, final commit/file list and documented deviations.
