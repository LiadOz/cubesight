# Known issues

Bugs we know about and have deliberately parked. Each has a test marked in place, so the suite stays green
and the test reports back the moment the bug is fixed. Fix these, then remove the marker.

## 1. Corner drill Orbit shows a dot it must not have
- **Since:** `f30ffce` "Animate Orbit completions with the chosen quick sweep" (Codex, 2026-10-09).
- **Rule broken:** the user's decision for the corner drill — *"we don't need to put a dot on it, the colour is enough."*
- **Evidence:** `tests/corner-answers-orbit.spec.js` "answered arcs fill in teal or amber with no dot or marker" fails 3/3 on that commit and passes 3/3 on the commit before. A `.orbit__current-dot` (or marker) is present even at rest, before any answer.
- **Lead:** `src/ui/orbit/index.js` draws the dot for `state === 'current' || segment.completionLeading`. Restricting it to `segment.completing` was tried and did **not** fix it, so the dot at rest comes from elsewhere in the completion path.
- **Marker:** `test.fail()` — expected to fail; Playwright flags it when it starts passing.

## 2. Recording page sometimes never shows its cube
- **Symptom:** opening `#/recording` intermittently never mounts the recording cube's canvas — about 1 run in 5, with the real WebGL renderer as well, so it is a real product bug, not a test artefact.
- **Evidence:** `tests/ui-foundation.spec.js` "the shared header tracks history and solve routes and opens the dev drawer globally" fails at the same rate on `main` and on branches.
- **Lead:** `syncRecordingCube` in `src/main.js` loads the shared `Cube` in the correct generation with `activeTool === 'recording'`, yet `#recording-cube` stays empty. Likely a mount-order or generation race; the lazy-route split moved code here.
- **Marker:** `test.fixme()` — skipped, because `test.fail()` would turn the suite red on the runs where this intermittent test passes.
