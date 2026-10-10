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

## CPU and GPU

`npm run test:low-cpu` runs the same full gate with six unit-file processes,
three browser workers, and two offline workers. Use it when resource spikes
make the machine difficult to use. It trades elapsed time for lower peak load;
it is not a faster gate. The default `npm test` retains the original worker
counts. Overrides remain available via `UNIT_WORKERS`, `PW_WORKERS`, and
`PW_PWA_WORKERS` (the last overrides the offline count separately).

In the first measured comparison, the default gate took 38.3 seconds with
291 CPU-seconds, a sampled peak of 19.1 cores, and 7.3 GB summed process RSS.
The bounded profile took 57.9 seconds with 344 CPU-seconds, 13.0 peak cores,
and 5.4 GB RSS. A repeat under competing browser jobs took 94.3 seconds;
the subsequent default-worker control took 106.1 seconds and 392 CPU-seconds
with 7.3 GB RSS. Background load varied across these runs.
These measurements support lower peak load, not lower total CPU or a speedup.
Summed RSS counts shared pages more than once; it is not unique physical memory.

To inspect Chromium's graphics backend on the machine running the tests:

```sh
npm run test:gpu-info
```

This compares the default launch with `--enable-gpu` and saves device, renderer,
and feature status to `test-results/gpu/info.json`. SwiftShader is a software
renderer; enabling the flag alone does not supply a hardware device. The agent
environment exposed no GPU, and both launches reported SwiftShader with
software-disabled compositing and rasterization. Hardware performance needs a
measurement on a host with an accessible GPU. The diagnostic does not render
the 3D cube, and the gate keeps its cube placeholder.

Known snapshot coverage debt: the references named light currently contain
dark pages; see `KNOWN-ISSUES.md`. CPU changes do not regenerate those images.
