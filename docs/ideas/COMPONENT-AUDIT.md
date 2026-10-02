# Component audit and migration plan

This inventory records the existing ring, lane, chart, table, chip-strip and cube implementations on the `feature/smart-cube-guidance` base. The shared foundation is in `src/ui/orbit/`, `src/ui/cube/` and `src/ui/shared/`. F0 adds the components and dev gallery; the page migrations are assigned to later fleet packages.

## Existing components by area

| Area / files | Existing UI | Migration |
|---|---|---|
| `src/brain/charts/arc.js`, `donut.js`, `split-bars.js`, `tps-line.js`, `sparkline.js`, `band-labels.js` | Ring geometry, results donut, split bars, TPS chart, progress sparklines, stage band labels | Geometry patterns move to `src/ui/orbit/geometry.js`. Orbit replaces all visual progress and comparison charts under F1/F2/F4/F5. Keep old modules only while their consumers remain; delete when the final consumer is migrated. |
| `src/brain/styles/orbit/timeline-ring.js`, `inspection-ring.js`, `results-orbit.js`, `geometry.js`, `end-labels.js` | Solve stage ring, countdown ring and a results composition that currently also mounts a TPS chart, split bars and sparklines | F1 migrates solve phases and results to the shared Orbit and shared pieces. Remove duplicate chart mounts with the migration. |
| `src/brain/styles/mono/timeline-linear.js`, `inspection-lane.js`, `results-mono.js` | Legacy horizontal progress lane, inspection lane and results chart/table composition | Retain Mono only as a legacy skin during F1; it must not affect Orbit API decisions. Remove bars/charts when the results migration lands. |
| `src/brain/shell.js`, `src/brain/controller.js`, `src/brain/cube-theme.js`, `src/brain/review/detail.js`, `panel.js` | Solve cube mount, scramble/recovery move chip strips, coach and review marker controls | F1 uses one shared Cube and Orbit through every solve phase; coach text uses `createCoachLine` and the dotted Orbit marker connector. Review detail belongs to F1/F2. |
| `src/pages/cube-view.js`, `src/cube-3d.js`, `src/cross-cube.js`, `src/cube-renderer.js`, `src/cube-clock.js` | Shared page-cube adapter, Three.js cube, state-to-render adapter, 2D cube renderer and clock glyph | F0's `Cube` wraps `createCube3D` and the canonical cube state. F1/F2/F4 migrate page-level cube mounts while preserving one WebGL canvas. Static 2D diagrams may remain where they are illustrations rather than an interactive cube. |
| `src/main.js` and the legacy corner/F2L trainer views | Recognition-cube mounts, cue controls, choice/button strips and occasional cube previews | Keep legacy trainer ownership until F4. Replace cases that display an interactive 3D case with shared Cube; do not add a second Orbit or chart for these pages. |
| `src/drills/hub.js`, `cross-planning.js`, `lookahead.js`, `oll.js`, `round-panel.js`, `src/cross-scout.js`, `src/pll-trainer.js` | Hub cube, drill cubes, planner/replay cube mounts, bordered quick-round panel, answer rows and cue/chip strips | F4 migrates drill progress and answers to Orbit segments plus shared chips/actions. Cross planning and alg playback use Cube's case/replay modes and highlights. |
| `src/algs/page.js`, `src/algs/drill/**`, `src/moves/sequence-player.js`, `src/moves/move-guide.js`, `src/moves/_gallery.js` | Alg case cube, sequence player/caret, alg move chip strip and move-guide overlays | F4 renders alg triggers as Orbit sections, uses Cube for the full-turn playback and piece highlight, and removes duplicate move chips. Keep the notation renderer for accessible text and copy actions. |
| `src/timer/index.js`, `src/timer/machine.js`, `src/timer/timer.css`, `src/timer/_dev.*` | Manual timer panel, separate inspection/countdown presentation, scramble chip strip, preview cube and transport controls | F4 uses one Orbit for inspection and solve, one persistent Cube in case mode, shared actions and chips. No nested ring for timer progress. |
| `src/history/index.js`, `src/history/history.css`, `src/review/index.js`, `src/review/replay.js` | Solve list rows, replay controls, separate cube mount and playback slider | F2 groups solves by session with mini Orbit glyphs, returns past solves through the shared results shape and makes Orbit the replay scrubber. Review Cube uses the shared component. |
| `src/progress/index.js`, `src/progress/progress.css` | Progress hero/cube, average and period summaries, stat rows and compact charts | F5 shows average splits on one Orbit; due cases and drill rounds use mini-orbits; filters use shared chips. |
| `src/smart-cube-studio.js`, `src/smart-cube-studio.css` | Smart-cube diagnostic 3D cube and status/diagnostic tables | This is a developer diagnostic tool, not a user flow. Keep its specialist controls; reuse Cube if its canvas lifecycle can be migrated without losing the studio's debug overlays. |
| `src/brain/_gallery.js`, `src/brain/_gallery.html`, `src/brain/styles/orbit/_dev-harness.js`, `src/brain/styles/orbit/_dev.html`, `src/moves/_gallery.js` | Existing isolated component galleries and visual harnesses | F0 adds `src/ui/gallery.html`, which shows all nine Orbit flow mappings, shared pieces and one stable Cube. Keep older galleries until the page migrations remove their implementation. |

## Current tables, charts and chip strips

The Brain results views (`src/brain/styles/orbit/results-orbit.js` and `src/brain/styles/mono/results-mono.js`) currently mount split rows/columns, TPS plots and recent/session summaries. Orbit-dark's legacy results also mount a donut/sparkline through their chart modules. F1 removes duplicated rows, bars, charts and recent strips as the result view moves to Orbit. `src/progress/index.js` owns the progress summaries; F5 replaces duplicated progress cards and sparklines. `src/drills/round-panel.js` owns the bordered drill-round summary; F4 replaces it with Orbit cases and shared answer chips. History's list in `src/history/index.js` becomes session rows with mini-orbit glyphs under F2.

Move sequences are rendered in `src/moves/move-guide.js`, `src/moves/sequence-player.js`, `src/timer/index.js`, `src/algs/page.js` and solve shell slots. F1 removes the duplicate guided-scramble strip; F4 removes alg/timer duplicate strips. The accessible move text remains available in the relevant flow.

## Shared F0 API

- `src/ui/orbit/index.js`: `Orbit` and `createOrbit`; a single SVG ring with open/full shapes, clockwise/counter-clockwise layouts, segment sections, focus and side label styles, marker clustering, keyboard actions and async `update/collapse/expand`.
- `src/ui/cube/index.js`: `Cube` and `createCube`; one persistent Three.js cube with `live`, `case` and `replay` modes, `bindSession`, state/move updates, highlights, cue, full-turn playback, seek and stop.
- `src/ui/shared/index.js`: `createHeader`, `createKeyBar`, `createCoachLine`, `createActions` and `createChip`. The coach line follows its Orbit marker with a fading dotted connector.
- `src/ui/gallery.html`: fixture-backed examples for scramble, inspection, solving, results, alg playback, drill round, timer, history and progress.

## Migration order

| Package | Owns | Exit condition |
|---|---|---|
| F0 | Shared Orbit, Cube and five shared pieces; component gallery; this audit | API, geometry and lifecycle acceptance pass. |
| F1 | `src/brain/**` solve/results | Scramble, inspection, solving and results use one Orbit and one Cube; no duplicated chart/table/strip. |
| F2 | `src/history/**`, history routes and replay | Session rows use mini-orbits; past solve and replay use the shared components. |
| F4 | `src/drills/**`, `src/algs/**`, `src/timer/**` | Drill, alg and timer flows use the shared Orbit/Cube and shared pieces. |
| F5 | Progress page | Stage averages live on one Orbit; compact drill/due rows use mini-orbits. |

The current consumers listed above stay operational until their owning package lands. New pages should import the shared component instead of extending one of the legacy chart/ring implementations.
