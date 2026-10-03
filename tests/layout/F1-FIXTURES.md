# F1 Orbit fixture registrations

These 14 solve states are registered in the shared F8 matrix and F9 snapshots.
They are owned by F1 and currently fail when executed because the
`f1-orbit-fixture` driver and its fixture API are missing. The Playwright list
can still enumerate every capture. Do not add pending markers or baselines to
make these cells appear complete.

| State | Required fixture content |
| --- | --- |
| `f1-idle` | Orbit idle solve screen |
| `f1-connecting-full` | Full connecting state |
| `f1-guided-scramble-current-progress` | Guided scramble with current segment and progress |
| `f1-wrong-turn-undo` | Wrong turn and undo/recovery affordance |
| `f1-inspection-normal` | Normal inspection with timer ticks |
| `f1-inspection-plus2` | +2 inspection result |
| `f1-inspection-dnf-ticks` | DNF inspection with visible ticks |
| `f1-solving-fill` | Solve in progress with fill state |
| `f1-live-results` | Live results during/after solve |
| `f1-case-choices` | Case choices linking to positive OLL `1`, PLL `T`, and F2L `FR` IDs |
| `f1-staged-detail-comparison` | Staged detail showing yours better |
| `f1-marker-detail` | Selected marker detail |
| `f1-settings-open` | Open solve settings |
| `f1-past-results-review-deeplink` | Past results followed through a review deep link |

The F9 harness should call the driver's real interaction seam through
`tests/layout/fake-cube.js` and its shared `smartCube`/replay adapter. It must
not mount a second controller or private session. The mounted F1 handle must
provide `getViewModel()` to F0's `window.__cubesightSnapshot` bridge so every
cell captures the renderer's actual model in the F0 envelope. Add the driver
only after F1 supplies the concrete fixture API; then run the browser capture
and review results before creating any baselines.
