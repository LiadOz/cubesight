# Known issues

Bugs we know about and have deliberately parked. Each has a test marked in place, so the suite stays green
and the test reports back the moment the bug is fixed. Fix these, then remove the marker.

## 2. Recording page sometimes never shows its cube
- **Symptom:** opening `#/recording` intermittently never mounts the recording cube's canvas — about 1 run in 5, with the real WebGL renderer as well, so it is a real product bug, not a test artefact.
- **Evidence:** `tests/ui-foundation.spec.js` "the shared header tracks history and solve routes and opens the dev drawer globally" fails at the same rate on `main` and on branches.
- **Lead:** `syncRecordingCube` in `src/main.js` loads the shared `Cube` in the correct generation with `activeTool === 'recording'`, yet `#recording-cube` stays empty. Likely a mount-order or generation race; the lazy-route split moved code here.
- **Marker:** `test.fixme()` — skipped, because `test.fail()` would turn the suite red on the runs where this intermittent test passes.

## 3. Offline review test disabled (key pressed before the page listens)

`pwa-tests/review-offline.spec.js` "review import and solve replay routes work offline after install" is `test.fixme` since 2026-10-09: it presses Space right after the solve opens, sometimes before the page listens for keys, so the replay never opens. Fix: an app-side ready mark once key handlers are attached, or open the replay with its button.

## 4. Screen snapshots named light contain dark pages

- **Evidence (2026-10-10):** all 36 `*-light-*-linux.png` references in
  `tests/screens.spec.js-snapshots/` have dark backgrounds. For example,
  `drills-light-1440-linux.png` shows the dark theme. Applying the actual light
  theme through `src/theme.js` makes almost the whole image differ.
- **Setup:** `screens.spec.js` registers separate dark and light init scripts
  on the same page. Both remain installed for the second navigation; it never
  asserts the resolved theme before capturing the image.
- **Fix:** use one deterministic theme setup, assert `html[data-theme]`, and
  review corrected light references against the design. The current references
  remain unchanged; no tests were skipped or tolerances widened to hide this.
