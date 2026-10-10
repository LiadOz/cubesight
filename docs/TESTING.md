# Testing while developing

Run the check that answers the current question while editing. Run `npm test`
before queuing a change; the queue runs it again on the merged result. The full
gate always runs its configured lint, unit, production-build, browser and offline
checks. Targeted commands are feedback tools, not substitutes for the merge gate.

For logic changes, run the relevant unit file directly:

```sh
node --test tests/timer-unit.test.mjs
```

For repeated logic edits, Node can rerun that test as its dependencies change:

```sh
node --test --watch tests/timer-unit.test.mjs
```

For page wiring, run the relevant browser spec on your own free port:

```sh
PW_PORT=4390 nice -n 19 npm run test:browser -- tests/brain-review.spec.js
```

Run these commands in your isolated worktree under `.agents/worktrees/`, not the
live checkout. Keep scratch files under `.agents/artifacts/`, and set `TMPDIR`
and `CUBESIGHT_ARTIFACTS_ROOT` there when running tests that create temporary repos.

## Full-suite timing

`npm test` reports each stage, total wall time, and the slowest browser and offline
tests. The production build and cube-stub PWA build are independent; offline tests
start when their own build finishes. All stages must pass. The cube-stub build
uses unminified Workbox code; the production build still generates the normal
minified service worker. Both precache the full applicable asset list.

Browser and offline tests disable animation. Tests that need simulated pauses
can use Playwright's clock instead of waiting in real time. Live persistence
tests must not use recorder replay mode, which deliberately prevents history
writes. Keep at least a compact real connection/solve path and real worker wiring
coverage when making screen tests cheaper.

The existing parked feature specs in `tests/unported/` are tracked in
`TESTS-TO-PORT.md`; one offline spec is marked `fixme` in `KNOWN-ISSUES.md`.
These are coverage debt, not a technique for making the gate faster.
