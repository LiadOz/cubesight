# Layout invariant suite

Run `npm run test:layout` for the route/viewport/theme sweep. The tests run as
regular Playwright specs too (`npm test`), so a full browser run includes them.

## Adding a route or state

Add the canonical route (the destination of any legacy redirect) to
`matrix.js`. Set its page family to `solve`, `drills`, `algs`, `timer`,
`demo`, `history`, `progress`, `review`, or `scroll`; only `solve`, `drills`,
`algs`, `timer`, and the demo player select the desktop no-vertical-scroll
rule. The informational `/demo/format` route is zero-canvas; `/demo` has one
shared cube canvas. Use a stable,
fixture-backed record ID for history routes. Keep
route names and state names in failure reports descriptive enough to reproduce
the cell. Register each state with `registerLayoutState` and bind its named
fixture driver with `registerLayoutDriver`; this is shared with the snapshot
suite through `getLayoutMatrix()`.

Fixture helpers live in `fixtures/state-seeds.js` (history and quick round) and
`fixtures/crowded-markers.js` (15 markers, including six pairs within 5°).
The real fake GAN driver is `state-drivers.js`; it consumes
`tests/helpers/fake-brain.js` for recorded review solves and
`fake-cube.js` for delayed connect, moves, guided scramble, and reverse solves.
Never depend on Bluetooth hardware.

Each route's default state is measured at every viewport and theme. The shared
dev drawer is sampled on each route at phone/dark and desktop/light sizes; the
dedicated drawer and connection-menu fixture states run through every
viewport/theme cell. Keep transitions deterministic and use reduced motion for
layout checks. A state that is not implemented by the current app remains a
reported migration failure under the owning feature package.

## Intentional horizontal scrolling

Mark the actual scroll container with `data-scroll-x`. The container itself
must fit in the viewport and have `overflow-x: auto` or `scroll`; its children
may extend beyond its inline bounds. This is an explicit exception and should
remain keyboard and touch scrollable. Do not use `overflow-x: hidden` on
`html` or `body` to hide overflow: the suite checks document width and verifies
that a horizontal `scrollBy` leaves `scrollX` at zero.

## Failure artifacts

Failing cells save a viewport screenshot with the first offending element
outlined, a JSON report containing its selector and bounding box, and
`test-results/layout/index.html`. The report names the route, state, viewport,
and theme. Baseline artifacts belong in `test-results/`, never `docs/` or
`src/`.
