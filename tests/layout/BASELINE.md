# Current-app layout baseline

> Historical pre-migration report only. This baseline predates the combined app and is not an approved combined-source baseline or a passing gate. Run the current matrix, review its report/gallery, and approve updated baselines explicitly before treating any result as accepted.

The revised F8 matrix ran on 2026-10-01 against application base revision
`734e7b9`, using two Playwright workers. All 56 test groups failed their strict
assertions; this is the expected pre-migration baseline, not a green release
gate. The matrix covers 27 canonical routes, 24 named fixture states, eight
viewport sizes, dark and light Orbit themes, four representative Mono cases,
and 200% text zoom. Each failing viewport/state cell writes a JSON report and
a screenshot with the first offending element marked. The optimized run took
5m35s. It produced 875 cell reports and 875 screenshots; counts include
repeated observations across routes, states, viewports, and themes.

Summed invariant findings from those reports:

| Invariant | Findings | Initial assignment |
|---|---:|---|
| Footer present | 875 | F14 removes the footer; F8 keeps this global assertion |
| Header separator present | 875 | F0 shared header |
| Canvas count differs from one | 233 | F1 solve; F2 history/replay; F4 drills/algs/timer; F5 progress, by route |
| Main-page vertical overflow | 232 | F1 solve; F4 drills/algs/timer; F5 progress, by route |
| Phone touch targets below 40×40 | 9,967 | Owning route package: F1, F2, F4, or F5; shared controls to F0 |
| Clipped text without labelled ellipsis | 312 | Owning route package: F1, F2, F4, or F5 |
| Elements extending beyond viewport | 17,914 | Owning route package: F1, F2, F4, or F5 |
| Sticky header/cube visibility failures | 840 | F0 shared header plus owning scroll page |
| Debug drawer shortcut failures | 52 | F0 shared dev drawer |
| Missing save-recording action in drawer | 70 | F0 recorder/dev drawer |
| Missing expected route view | 88 | Route owner; F2 history, F4 drills/algs/timer, F5 progress, F14 help/recording |
| State fixture driver failures | 224 | F2 replay; F4 drill; other route-specific failures per JSON detail |
| Focus outline missing | 64 | Owning page package; shared controls to F0 |
| Remaining focused findings | 62 | 4 Mono style, 16 connection-menu visibility, 2 cluster overlap, 36 key-label overlap, 4 horizontal scroll |

The F0 shared header is checked on every route. The dev drawer is checked at
phone/dark and desktop/light sizes on each route; dedicated debug drawer and
connection-menu fixtures cover every viewport and theme. The `/recording`
route check currently expects `#recording-view`; its missing view is an F0
migration item. Replay state checks require the actual replay route
and midpoint scrubber. The drill state requires the seeded quick-round route.
These failures are kept as named reports so their owners can reproduce them;
the suite does not waive invariants for missing features.

Run `npm run test:layout` after the UI migrations to refresh this baseline.
For a focused check, use `npm run test:layout -- --grep 'route history'`.
Generated per-cell reports and the screenshot gallery live in
`test-results/layout/` and are not committed.
