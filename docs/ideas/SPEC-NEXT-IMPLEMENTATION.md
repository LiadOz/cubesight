# SPEC-NEXT implementation

Started 2026-10-01 from `feature/smart-cube-guidance` (`eea1766`). Scope: all eight work packages in [SPEC-NEXT.md](SPEC-NEXT.md), confirmed by the user. Builders use Luna agents and isolated worktrees; the lead reviews and combines their changes on `implement/spec-next` in `/home/loz/projects/cubesight-spec-next`. No changes are pushed.

## Status

| Package | Branch | Status |
|---|---|---|
| WP1 · site structure | `implement/spec-next-site` | Implementation and review in progress |
| WP2 · manual timer | `implement/spec-next-timer` | Implementation and review in progress |
| WP3 · suggestion engine | `implement/spec-next-engine` | Implementation and verification in progress |
| WP4 · full solve review | after WP1 | Pending |
| WP5 · algorithm browser/drills | after WP3 | Pending |
| WP6 · drills/progress | after WP1 | Pending |
| WP7 · vocabulary | after WP1 | Pending |
| WP8 · history/data | `implement/spec-next` | Data tests pass; route/UI integration pending |

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

The four new data tests verify raw time and penalty round-trips, independent sessions, rejection of malformed imports before writes, duplicate timestamp handling, intersecting filters, and self-contained pin backup restoration without duplicate moments. Browser, offline and screenshot evidence will be recorded after shell integration.

## Final review

Pending: combined lint/unit/build, full browser suite, offline PWA suite, screenshots inspected in both styles/themes and on 390 px phones, recording replay, acceptance item audit, redirect table, final commit/file list and documented deviations.
