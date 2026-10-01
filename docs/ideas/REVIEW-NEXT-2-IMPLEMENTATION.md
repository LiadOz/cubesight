# REVIEW-NEXT-2 implementation

Based on `bbc177b`, implemented in isolated worktrees and integrated locally into `feature/smart-cube-guidance`. Nothing was pushed or deployed.

## Follow-ups

1. Algorithm playback uses the existing Orbit ring in sequence mode. Move-group labels remain; solve split times and deltas do not appear. Ordinary solve timing labels remain available.
2. The timer preview uses a larger cube, simplified progress and scrollable move chips as the primary scramble display. The full notation remains available to screen readers and loading/error messages. The ready strip starts at the first move with full contrast; during playback it follows the selected move. Phones stack the cube above the full-width strip and controls, keeping the timer clock visible. The integrated screenshot review caught and corrected a narrow two-column phone layout and faint completed chips.
3. The algorithm case cube is large and centered, with shared playback controls directly below it.
4. The solve quick config bar excludes the stats source filter. Results have a source selector, and full settings retain the persistent setting. The quick config fits one line at 1280 px in both styles.
5. Unknown hashes keep their URL and show a styled not-found page with drills/solve recovery links. Empty routes still select the appropriate home; legacy redirects and query parameters continue to work.
6. Mono playback uses move groups without solve split/delta labels.

## Acceptance and verification

The integrated acceptance matrix passed 8/8 tests. I read all 32 screenshots, including both phone themes/styles, and checked the actual cube sizing, playback labels, chip visibility, config row and recovery links. The matrix captures algorithms, timer, solve idle and not found in Orbit/Mono × dark/light × desktop/390 px: 32 screenshots in ignored `test-results/review-next-2-visual`. No clipping or page-wide horizontal overflow was found. Integrated `npm run check` passes: zero lint warnings/errors, 499/499 units, and production build with 118 precached entries (4148.78 KiB). The full serial browser run covered 288 cases: 282 passed, five optional skipped, and one obsolete assertion still expected unknown routes to show solve. That test now asserts the requested not-found behavior; the complete 29-test routing suite then passed. All 283 non-optional browser cases have passed across the full run and the routing resolution, with no unresolved failures. The final production PWA suite passes 13/13, including offline not-found recovery and the revised timer/algorithm playback.

Heavy checks were paused at the user's request. On resuming, the delayed restart was canceled and remaining checks ran on one CPU. Dev/test ports were 4221 and 4228; port 5173 was never used. Verification logs are copied into ignored `test-results/review-next-2-verification` in the main checkout. The existing WASM externalization and large-chunk build notices remain; lint has no warnings.

The user Downloads recordings are unavailable in this environment. The rotation-cross fixture replay passes. No physical-cube behavior or pair search code is changed. The lead's independently measured 48/50 proof rate under concurrent load (96%, zero verification failures) remains the appropriate reference; the previous report's 100% was a quiet-machine measurement.

Physical GAN and physical-phone checks from R6 remain for the user. All implementation agents have finished; deployment remains with the user's other agent.

## Implementation commits

| Commit | Change | Main files |
| --- | --- | --- |
| `dcba9ee` | Larger timer cube and corrected chip centering | `src/timer/index.js`, `src/timer/timer.css`, `src/moves/move-guide.js`, timer browser tests |
| `f731dd5` | Algorithm cube layout and semantic sequence labels | `src/algs/page.js`, `src/algs/page.css`, `src/moves/sequence-player.*`, Orbit/Mono timeline components, algorithm browser tests |
| `63b00f3` | Readable phone scramble, integrated visual and offline acceptance | timer source/CSS, `tests/review-next-2-visual.spec.js`, `pwa-tests/page-cube-offline.spec.js` |
| `9acf753` | Explicit unknown routes and relocated solve-source filter | `src/routes.js`, `src/main.js`, `src/not-found.css`, Brain shell/settings/base CSS, route/settings units, site browser matrix, eight inspected gallery baselines |

The final verification commit also updates `tests/routing.spec.js` to assert not-found recovery instead of the superseded silent-home behavior, and records this report. All commits use the normal pre-commit lint and unit hooks.

The existing legacy redirect table is retained, including its query strings:

| Old hash path | Destination |
| --- | --- |
| `/brain` | `/solve` |
| `/corners` | `/drills/corners` |
| `/pll-recognition`, `/pll` | `/drills/pll` |
| `/f2l` | `/drills/f2l` |
| `/cross-scout`, `/scout` | `/drills/scout` |
| `/oll` | `/drills/oll` |
| `/lookahead` | `/drills/lookahead` |
| `/debug`, `/smart-cube`, `/dev` | `/dev/studio` |
