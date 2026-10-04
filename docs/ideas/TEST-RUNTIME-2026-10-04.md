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
All 13 scenarios have passed (12 together, the final header scenario separately);
a final combined run is pending. A broader browser run exposed an intermittent
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
