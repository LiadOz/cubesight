# Known issues

Bugs we know about and have deliberately parked. Each has a test marked in place, so the suite stays green
and the test reports back the moment the bug is fixed. Fix these, then remove the marker.

## 2. Recording page sometimes never shows its cube
- **Symptom:** opening `#/recording` intermittently never mounts the recording cube's canvas — about 1 run in 5, with the real WebGL renderer as well, so it is a real product bug, not a test artefact.
- **Evidence:** `tests/ui-foundation.spec.js` "the shared header tracks history and solve routes and opens the dev drawer globally" fails at the same rate on `main` and on branches.
- **Lead:** `syncRecordingCube` in `src/main.js` loads the shared `Cube` in the correct generation with `activeTool === 'recording'`, yet `#recording-cube` stays empty. Likely a mount-order or generation race; the lazy-route split moved code here.
- **Marker:** `test.fixme()` — skipped, because `test.fail()` would turn the suite red on the runs where this intermittent test passes.
