# F4 focused algorithm and GAN fixture evidence — 2026-10-02

The baseline image is retained unchanged from `/tmp/f4-baseline-algs-fixture.png`. The current captures use the F4 isolated worktree at `2877353` plus the uncommitted Cube display-state synchronization fix. Desktop browser viewport was 1280×720; the phone capture was 390×844. All current captures are append-only numbered references.

| Image | State |
|---|---|
| `F4-01-baseline.png` | Before the F4 live-cube fix: connected recording data did not reach the algorithm page cube. |
| `F4-02-case.png` | PLL H case page in explicit virtual case mode. |
| `F4-03-live-before.png` | The case page after switching to “your cube,” before replaying the GAN fixture. |
| `F4-04-live-after.png` | The page after all 16 MOVE and 176 GYRO fixture events. |
| `F4-05-live-phone.png` | The same live fixture state at 390×844. |
| `F4-06-alg-playback.png` | PLL H playback completed at 7/7 moves. |

Focused browser checks passed for the real GAN recording fixture driven through a GAN-shaped fake device and the shared session: 16 distinct MOVE sequence IDs were observed, the midpoint mounted view-model state matched `smartCube.getSnapshot().state`, the final mounted model also matched the session, and the actual WebGL canvas reported gyro-follow enabled with concrete target and pose quaternions. There was one document canvas and no page errors. The playback model reached 7/7, and its final rendered state matched the selected algorithm applied to the verified case setup and case-color transform.

The later automated regression is `tests/algs-live-cube.spec.js`. It adds a before/after quaternion assertion and should be run by the next browser owner; the one-off focused browser session happened before that spec was written. The full-page case capture still shows the existing desktop page extending beyond a 720px viewport, so the SPEC no-scroll acceptance remains open. Timer and drill screens have not yet received final browser captures.
