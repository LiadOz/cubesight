# Deterministic snapshot suite

Run `npm run test:snapshots` for the small pixel/structure matrix and the full
Brain view-model fixture set. These specs run once through their dedicated configuration in Tier 2
(`npm run test:regression`); the regular Playwright command excludes them. The default visual subset covers solve, drills,
algs, history, past-solve, replay, history review, progress, timer, representative
fake-cube states, colour-neutral case settings, all four goal-progress states,
the shared recording route, and the recorded rotation-cross replay at 390×844
and 1280×720 in both themes. Its fixture list is checked against every state
registered in `tests/layout/matrix.js`; missing drivers fail with a named error.
The matrix currently includes the F1 Orbit states and F17 demo playback route.

## Baselines

Baseline rollout is incomplete: this branch has no committed F9 PNG, ARIA YAML
or view-model JSON baselines yet. The intended location is
`tests/snapshots/__baselines__/`. Only `npm run snapshots:update` writes them.
Review the comparison gallery before committing changed baselines, and name
the intended cells in the commit message. Pixel checks include the WebGL cube
canvas; the browser uses SwiftShader and bundled Manrope/DM Mono fonts.
When baselines are committed, add a development blog post whose `images:` list
includes `/tests/snapshots/__baselines__/snapshots.spec/*`; the gallery glob
keeps those reviewed captures visible and covered by `npm run gallery:coverage`.

For a two-revision review, run
`npm run snapshots:compare -- <base-ref> [<head-ref>]`. It creates detached
worktrees, overlays the snapshot harness from the current checkout, runs both
revisions on port 4250, and writes
`test-results/snapshot-compare/index.html`. The gallery lists every changed
cell with side-by-side images and a difference blend, plus text snapshots.
The generated test artifacts stay out of `tests/`, `src/`, and `docs/`.

## Matrix and migration owners

The suite reuses route/state registrations and deterministic drivers from
`tests/layout/matrix.js` and `tests/layout/state-drivers.js`. Add each new
route or state there first. Brain states serialize the actual
`buildViewModel()` result from `src/brain/fixtures.js` and the mounted
controller. Every other browser cell requires the active page's
`window.__cubesightSnapshot.getViewModel()` serializer; a missing serializer
fails the capture instead of creating a metadata-only placeholder. See
[`SERIALIZERS.md`](./SERIALIZERS.md) for the stable API contract and F0/F1/F2/F4/F5/F6/F14 ownership.
F1 solve, F2 replay, and F4 timer drivers use the fixed page clock. The
recorded rotation-cross fixture is replayed through the app's real recording
URL with `replaySpeed=0`.
The development gallery has separate route and interaction smoke coverage in
`tests/gallery.spec.js`; its dev-only folders, posts, and comparison views are
not product pages in the snapshot matrix.
