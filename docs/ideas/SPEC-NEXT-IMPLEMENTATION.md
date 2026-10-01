# SPEC-NEXT implementation

Started 2026-10-01 from `feature/smart-cube-guidance` (`eea1766`). Scope: all eight work packages in [SPEC-NEXT.md](SPEC-NEXT.md), confirmed by the user. Builders use Luna agents and isolated worktrees; the lead reviews and combines their changes on `implement/spec-next` in `/home/loz/projects/cubesight-spec-next`. No changes are pushed.

## Status

| Package | Branch | Status |
|---|---|---|
| WP1 · site structure | `implement/spec-next-site` | Integrated; route/browser/offline checks pass |
| WP2 · manual timer | `implement/spec-next-timer` | Integrated; keyboard/touch/persistence pass; offline scramble fix in progress |
| WP3 · suggestion engine | `implement/spec-next-engine` | Implementation and verification in progress |
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

The referenced `docs/research/open-algorithms.md` does not exist. Available inputs are the local self-generation prototypes under `docs/research/alg-gen`. User changes to those files in the original working tree are preserved.

Independent checking found a wrong corner-slot mapping in the committed pair prototype and failing PLL search output (157 of 442 candidates). Failing candidates must not be shipped. The existing OLL output verifies, but initially covers only 16 named cases. Full orientation-pattern enumeration and verified generation are required for complete coverage; generic pattern identifiers must not be represented as conventional OLL case numbers.

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

## Final review

Pending: combined lint/unit/build, full browser suite, offline PWA suite, screenshots inspected in both styles/themes and on 390 px phones, recording replay, acceptance item audit, redirect table, final commit/file list and documented deviations.
