# Runtime recovery, 4 October 2026

Work is on `fix/review-design-gaps`, isolated under `.agents/worktrees/review-gaps`.

The review's 290-test baseline is older than the current tree. Before these changes,
`playwright test --list` discovered 691 tests: the default configuration included
both dedicated layout and snapshot suites, which the merge queue then executed
again with their own configurations. Each suite now has one executor in the full
regression command. No assertions were removed by this separation.

## Measured changes

The history/review lifecycle retains all eight cells (two styles, two themes,
two viewports), sixteen screenshots, and every original assertion. It now seeds a
finished record with real analysis computed once in Node, mounts the app once per
style, and switches routes, theme and viewport within that app. With two workers,
the previous spec passed in 34.1 seconds; the new spec passed in 26.5 seconds
(22% less wall time). Logs: `.agents/artifacts/history-runtime-{before,after}.log`.
The explicit parallel setting schedules two style groups; overall workers remain
at two. Grouped tests exceed ten seconds because each contains four complete
lifecycle cells; they are Tier 2 tests, not merge smoke.

The snapshot suite retains every registered route/state × two themes × two
viewports and all JSON, pixel and accessibility assertions, with unchanged cell
filenames. State setup now runs once per fixture, not four times. A failure in one
capture is retained while the other cells still run. No matrix cells were pruned.
Two initial four-cell fixtures passed in 14.8 seconds combined; the F1 fixture
harness also exposed and fixed missing fixture parameters and an invalid timed
move callback. Full-suite timings are still pending.

The gallery-only masked visual spec can use an inert canvas instead of WebGL.
Other renderer and unmasked snapshot tests keep real WebGL. The two smoke tests
retain a genuine connected scramble/inspection/solve/results flow and routing,
redirects and a rendered cell per style; they passed in 10.3 seconds.

The four pacing specs keep every ten-answer behavioral assertion, but advance
feedback timers with `page.clock.fastForward` instead of waiting for each pause.
They read the mounted case seed instead of the removed case-number label and
open/close the actual settings disclosure when changing options. Fixed/adaptive
checks improved from 29.9/25.3 seconds to 9.0/7.9 seconds. The complete algorithm
and pacing set now passes: 14 tests, 1.2 minutes. Algorithm matrix cells are
unchanged; contexts mount once per style. Cube/ring center checks were added to
all eight cells after screenshot review exposed a phone layout defect.

The live review model contained a `demoHref` callback, which prevented the F0
JSON-safe snapshot bridge from serializing selected case details. Link generation
now takes plain comparison data outside the VM. Existing link round-trip and
custom-move assertions are preserved, with a JSON round-trip assertion added.

## Budget enforcement and rollout

`npm run test:merge` runs check plus smoke and explicitly supplied affected specs
in one 60-second deadline; pass affected spec paths after `--`. It does **not** yet
select those affected tests automatically. `npm run test:regression` runs check,
default browser tests, PWA, layout, snapshots and performance capture/check under
one 600-second deadline. A failed or timed-out stage stops the run, produces a
health JSON report, and terminates the runner process group.

The check-and-smoke merge tier passed in **48.8 seconds** with 629 node tests,
0 lint errors, production build/gallery checks and both browser smoke tests.
Check and browser smoke run independently under the same deadline; the first
sequential attempt correctly failed at 60 seconds. This measurement does not
claim that every affected-test selection fits yet.

The queue deliberately retains its existing full gate. Switching it before
validating affected-test selection and the Tier 2 failure blocker would reduce
protection. CI scheduling and queue integration remain to be completed.

Full regression is not green yet. The first browser run found stale expectations
for framed algorithm cards and unpaged case lists, hidden drill settings, and
legacy Orbit selectors. The algorithm and pacing expectations are now reconciled
and green; the legacy Orbit visual assertions still need migration. These must be reconciled with the approved GUI, without
silently dropping the behavioral assertions. No full-regression budget success
is claimed from discovery counts or focused runs.

## GUI and offline regression follow-up

Offline checks were reconciled with the actual approved header drawer, paged
algorithm lists, Orbit replay controls, current engine version and cross colours.
All 13 scenarios passed together in 51.5 seconds against the production build. A broader browser run exposed an intermittent
paging race: URL changes preceded DOM updates. Waiting for the rendered page
number retained the 41-case assertion and passed three repeated runs.

Screenshot review also found that the progress page's full-width sticky Orbit
covered drill rows on scroll. That section now scrolls with the document. This
is an intentional GUI correction: the old test's requirement to keep the whole
hero pinned at every scroll position was replaced by checking every drill link
is unobstructed on desktop and phone, initial cube/Orbit visibility and a single
canvas. This change is unrelated to runtime pruning. Lifetime accuracy is now
shown beside lifetime answer counts. Earlier failed captures remain superseded
in the gallery; the final row capture is visually checked.

The committed runtime change passed `npm run check` in 24.2 seconds (630 unit
tests, lint/build/gallery checks). The first subsequent regression attempt was
stopped after discovering that Playwright reused an old server with cached
worktree modules. Default gates now start a fresh server instead; that aborted
run is not evidence about the committed UI or the full regression budget.

The fresh-server regression diagnosed legacy solve specs still waiting for
hidden controls (60–90 seconds per failed scenario); the run was stopped on
those confirmed failures rather than spending the full budget on stale waits.
It is **not green**, and no Tier 2 success is claimed. Regression stages now
stop Playwright at its first failure, retain the full test selection, and mark
the whole tier failed. This reduces failure diagnosis time without removing
coverage: a successful tier still executes every configured test.

Connection scenarios now drive the actual app header and shared session through
a gated fake adapter. The newest-status, busy/disabled action, static header,
single animated indicator, three connection steps, failure reason and retry
attempt assertions are preserved. All four pass in 9.3 seconds. They uncovered
a real status-priority defect: the generic disconnected prompt was hiding the
connection error. The failure message now wins; a node regression assertion
checks both failure and ordinary disconnected wording.

The settings harness uses a stub only for its unrelated background gallery
cube. The hidden legacy solve-tab close action is redundant with the visible
close control (both dispatch toggleSettings in shell.js); the visible control
and every other close path remain covered. Its 90-second override was removed.

All six settings/drawer tests pass in 20.3 seconds after reconciling the hidden
close-tab action. The following merge-tier attempt correctly rejected a port
still owned by an interrupted older run. Deadline and signal cleanup now kills
descendants even if Playwright creates separate server process groups; a
detached-child test proves that an escaped server cannot remain running. Tier
browser temporary files are under the worktree's test-results/runtime-tmp,
keeping them on the required host-backed filesystem.

The clean check-and-smoke prototype passed at commit dbe53fd in **27.0 seconds**
with 632 node tests and two browser smoke tests, with workingTreeDirty=false.
Adding connection/settings/progress specs then caught a merge-config issue:
reduced motion was forced onto affected tests that explicitly check animation.
Reduced motion is now scoped to smoke itself; affected specs keep their normal
configuration and animation assertions. The clean combined rerun passed at commit f0c30bf in **40.5 seconds**:
lint, 632 node tests, build/gallery checks and all **16** smoke plus explicitly
selected connection/settings/progress browser tests (browser stage 39.8 s).
Logs: `.agents/artifacts/merge-affected-motion-final.log`; exact source commit
and workingTreeDirty=false are recorded in test-results/health/merge-latest.json.
This proves this explicit selection fits; automatic selection and the queue's
Tier 2 failure blocker remain pending.

## Remaining work before integration

The review suite now checks every marker on the shared Orbit, including
expanded clusters; stage comparisons, cube playback and persisted pins still
run through a real solve. The four existing screenshot cells are retained,
with Orbit history cells seeded from real Node analysis instead of replaying
the solve for every image. This exposed and fixed Escape failing to close
history review details. The screenshot groups passed in 21.0 s; the live
solve/reload and skipped/merged-stage checks passed separately in 35.4 s.

- Reconcile the remaining legacy review and Orbit visual assertions with the
  shared Orbit and approved results layout; preserve their behavioral coverage.
- Finish the F9 baseline rollout and prove repeat-run determinism. No F9 PNG,
  YAML or JSON baselines are committed in the inherited tree; focused captures
  are experimental artifacts, not accepted full-suite baselines.
- Validate automatic affected-test selection, the scheduled regression and
  Tier 2 failure blocker before changing the existing queue's gate.
- Run layout, snapshot and performance checks and prove the complete regression
  is green within 600 seconds. The stopped diagnostic is a failed run, not a
  successful full-regression measurement.

No pushes, trunk merges or live-checkout edits were performed. There are no new
design questions: the approved widgets remain the source of truth.

## Current GUI verification and snapshot rollout

Cross Scout's centred desktop/phone cube, approved settings/buttons/input and
full phone targets are committed (ecca664, 818e625, 7078792). The added Explore
route passes the full F8 viewport/theme matrix, including 320 px. Its real
mounted view model and PLL's are now registered in the snapshot bridge.
The combined trainer-fit and WP6 browser batch passed 23 tests in 24.4 s;
Scout/smart-cube/theme/chart behavior passed 19 tests in 35.1 s. These focused
timings are verification evidence, not a full regression measurement.

The full F9 suite passes 104 tests (2.4 min, two workers), with unchanged prior
images retained. Captures explicitly load bundled fonts, pin the Scout setup
and WCA scramble input, pause the recording-page clock, and replay real
cross/analysis replies. The rotation fixture preserves all original events and
appends two actual solver replies; independent node checks verify continuations
and segmentation. Pixel canvases, exact accessibility trees and every semantic
model field remain checked. Only validated render revision and solver CPU
profiling fields are omitted. Log: test-results/f9-current-complete.log.

The current npm run check passed all 641 node tests, lint (zero errors), build
and gallery coverage (zero uncovered images). Complete default browser, PWA,
full F8, performance and the combined 600 s regression still need verification.
Automatic merge selection and the Tier 2 failure blocker remain pending; the
merge queue's existing full gate has not been weakened.

## Solve settings and layout corrections

Solve idle and open-settings each pass all 16 F8 viewport/theme cells. Phone
quick settings stay in the drawer, whose grid rows now retain their content
height; controls use 44 px targets and the existing approved toggle adapter.
The filled scramble/command fields preserve their native IDs and dispatches.
The settings action test passes. Gallery: solve-settings-phone-fit-2026-10-04.

F8 now ignores closed disclosure contents, measures SVG stroke hit areas in
screen pixels, and tests focus outlines for keyboard-visible focus. Cube
collisions use a projected silhouette read only when requested, not the
canvas's camera padding. Two browser probes prove that real collisions and
opened tiny controls still fail; two node geometry tests pass. The current
check passes 644 node tests, zero lint errors, build and zero uncovered gallery
images. Logs: solve-settings-layout-verified.log, f8-drawer-rows-verified.log,
solve-settings-actions.log and check-solve-settings.log under test-results.

The broader F8 diagnostic reached history review and failed there: small phone
controls and the sticky-cube selector remain to fix. Full regression and hard
runtime budgets are still unproven. F9's 104-test green run precedes these latest
GUI changes; its next baseline revision must preserve the previous captures.
