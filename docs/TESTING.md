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

This compares the default headless shell with full Chromium's GPU mode and
Vulkan backend. It saves devices, feature status, and the renderer of a real
WebGL2 context to `test-results/gpu/info.json`. SwiftShader, llvmpipe, and WARP
are software renderers; a launch flag does not establish hardware acceleration.
The diagnostic creates a small context without rendering the 3D cube.

## Hardware cube performance capture

The production cube already uses Three.js WebGL with
`powerPreference: 'high-performance'`. Its normal browser chooses the driver.
The existing `npm run perf` intentionally forces SwiftShader for a reproducible
software baseline. To measure the same startup, gyro, move playback, solve,
analysis-worker, frame interval, and memory scenarios on a real GPU:

```sh
mkdir -p /home/loz/projects/cubesight/.agents/artifacts/gpu
PW_PORT=4410 TMPDIR=/home/loz/projects/cubesight/.agents/artifacts/gpu \
  nice -n 19 npm run perf:gpu
```

Run in your worktree. The short temp path avoids full Chromium's Unix socket
path-length limit. The command tries full Chromium's automatic hardware
selection, then Vulkan. You can select `CUBESIGHT_GPU_BACKEND=gl` or `vulkan`,
or use `CUBESIGHT_GPU_HEADED=1` with an accessible X11/Wayland session.
Do not use Xvfb as evidence of a physical GPU.

The GPU command verifies hardware WebGL2 before any build or engine benchmark,
then checks the capture browser and the actual cube context. It rejects
software fallback and unidentified/disabled contexts. Reports identify the
renderer and graphics mode instead of hardcoding SwiftShader. Output remains
in `test-results/perf/`; copy reports to separate artifact folders before
comparing hardware and software captures. Normal `npm test` keeps its cube
placeholder. This is a performance investigation, not an additional merge gate.

Hardware timings must be compared on the same machine and scenario; the phone
viewport and CPU throttle do not measure an Android GPU. JavaScript logic and
WASM search still run on the CPU, so hardware rendering does not establish a
whole-suite speedup.

In the SBX Docker session checked on 2026-10-10, no `/dev/dri` or NVIDIA devices,
display socket, or display-class PCI device was visible. The Docker socket
controls a nested daemon named `cubesight-codex`, not the outer host. Nested
containers cannot supply a GPU that the SBX runtime has not exposed. The outer
runtime must provide GPU device access and compatible graphics drivers first
(for Intel/AMD typically DRM render devices; NVIDIA requires its container
runtime and graphics driver capabilities). For an outer Docker launcher, the
relevant options are `--device=/dev/dri` with render-device group permissions
for Intel/AMD, or `--gpus all -e NVIDIA_DRIVER_CAPABILITIES=graphics,utility`
for NVIDIA after installing its container toolkit. Headed NVIDIA capture also
needs the `display` capability and display socket access. Apply these to the
outer SBX launcher; adding them to this nested daemon cannot reach the host.
The repository command can verify
that setup, but cannot create hardware access with Chromium flags.

Primary references: [Chromium headless GPU setup](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/gpu/using-gpu-hardware-in-headless-chrome.md)
and [Playwright full Chromium headless mode](https://playwright.dev/docs/browsers#chromium-new-headless-mode),
[Docker GPU access](https://docs.docker.com/engine/containers/gpu/), and
[NVIDIA graphics driver capabilities](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html).

Known snapshot coverage debt: the references named light currently contain
dark pages; see `KNOWN-ISSUES.md`. CPU changes do not regenerate those images.
