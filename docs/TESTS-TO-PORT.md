# Browser tests to port

On 2026-10-09 the suite had to reach about a minute within the hour, so these feature specs were parked in `tests/unported/`, outside `npm test`. Each still runs by hand: `PW_UNPORTED=1 npx playwright test tests/unported/<spec>`. Port each one's logic checks to unit tests (most already exist) and keep at most one browser test per page, then delete the parked spec. Biggest first (test-seconds before parking):

- `training.spec.js`: 15 tests, 29.7 s
- `brain-solve.spec.js`: 4 tests, 19.3 s
- `algs-page.spec.js`: 10 tests, 17.4 s
- `demo.spec.js`: 5 tests, 16.8 s
- `review-next-2-site.spec.js`: 8 tests, 16.6 s
- `timer.spec.js`: 13 tests, 16.5 s
- `wp6-drills.spec.js`: 13 tests, 15.1 s
- `corner-answers-orbit.spec.js`: 10 tests, 15.1 s
- `history.spec.js`: 11 tests, 15.0 s
- `ui-foundation.spec.js`: 17 tests, 13.5 s
- `scout.spec.js`: 7 tests, 12.2 s
- `brain-scramble-recovery.spec.js`: 9 tests, 9.3 s
- `adaptive.spec.js`: 4 tests, 9.3 s
- `site-nav.spec.js`: 9 tests, 8.5 s
- `gallery.spec.js`: 6 tests, 7.8 s
- `brain-panels.spec.js`: 6 tests, 7.7 s
- `cubesight.spec.js`: 6 tests, 7.6 s
- `pll.spec.js`: 6 tests, 7.3 s
- `brain-controller.spec.js`: 6 tests, 6.9 s
- `quick-rounds.spec.js`: 7 tests, 6.7 s
- `sequence-player.spec.js`: 3 tests, 6.3 s
- `f2l-slot-orbit.spec.js`: 2 tests, 6.1 s
- `solve-review.spec.js`: 4 tests, 5.9 s
- `cube-highlight.spec.js`: 5 tests, 5.6 s
- `progress.spec.js`: 4 tests, 5.0 s
- `recall.spec.js`: 3 tests, 4.3 s
- `brain-xcross.spec.js`: 2 tests, 4.1 s
- `timeout.spec.js`: 5 tests, 4.0 s
- `brain-replay.spec.js`: 2 tests, 3.9 s
- `triple-timing.spec.js`: 2 tests, 3.8 s
- `time-trend.spec.js`: 4 tests, 3.5 s
- `smart-cube-studio.spec.js`: 4 tests, 3.1 s
- `portable-drill-starts.spec.js`: 2 tests, 2.6 s
- `timer-route.spec.js`: 1 tests, 2.6 s
- `theme.spec.js`: 3 tests, 2.5 s
- `recognition-profile.spec.js`: 3 tests, 2.5 s
- `corner-speed.spec.js`: 2 tests, 1.8 s
- `help-drawer.spec.js`: 2 tests, 1.7 s
- `pll-start.spec.js`: 2 tests, 1.4 s
- `pinned-pseudo-f2l.spec.js`: 1 tests, 1.2 s
- `review-drill-link.spec.js`: 1 tests, 0.7 s

## The old snapshot suite (not restored)

The pre-2026-10-09 snapshot suite (`tests/snapshots/`, 104 tests: about 720 images, 676 accessibility-tree and 916 view-model snapshots, deleted in 842fae3; restore with `git checkout 5d90711 -- tests/snapshots playwright.snapshots.config.js scripts/snapshots-compare.mjs`) was tried again with the cube placeholder on 2026-10-09:

- It took 131 s wall and 415 CPU-s with 4 workers, every test failing. Part of that time is the failures themselves (each mismatched screenshot retries for 5 s), so a green run would be faster.
- Its images and its view-model files carry the 3D cube (camera, gyro, cube state); those parts have to go, and every image re-approved, because the cube is now a placeholder.
- Its view-model files also differ in app behaviour since they were approved on 2026-10-04 (for example a missing "start solve" action and `plan: null`). Each of those is either an intended change or a regression, and needs a decision before re-approving.
