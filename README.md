# Cubesight

A browser-based recognition gym for corners, F2L deduction, two-sided PLL recognition, and cross/X-cross planning.

## Run locally

```bash
npm install
npm run dev
```

## What is included

- Three.js cube: corners have a fixed view; F2L allows a limited horizontal inspection arc with back and bottom faces hidden
- Random legal color orientations; white is not fixed to either top or bottom
- Single-corner and sequential Three-corner drills
- In Three-corner drills, corners two and three are timed from the previous input, including the feedback interval. The next clock visibly runs immediately; its ten-second cutoff uses the same starting point.
- Click controls plus `W`, `Y`, `G`, `B`, `R`, and `O` keyboard answers
- Open practice and 10-answer timed sprints
- Persistent accuracy, streak, average, best time, recent pace, and per-family stats
- Rust/WebAssembly case selection core in `wasm-core/`
- F2L with a solved cross, six fixed bottom colors or a random bottom per case
- All visible non-cross pieces are selectable, including distractors; only the nearest visible surface accepts a click
- Persistent adaptive practice: mistakes and hesitant responses return sooner; fast correct responses get longer intervals
- Corner glance mode: fixed viewing time or adaptive pacing (25–1500 ms). Every ten eligible answers, 90%+ accuracy shortens the view; 70% or lower adds viewing time. Three-corner drills count only the first corner for pacing; changing drills resets the evidence.
- Responsive touch layout with collapsible settings and six color answers visible together on phones
- Light/dark header toggle: follows the device initially, remembers explicit choices, and leaves cube colors unchanged
- Cross Scout calculator: pasted/generated scrambles, selectable color subsets or CN, full-cube inspection, tracked pair highlights, and animated step/playback controls
- Cross Scout retrieval practice hides the selected plan, structural cue, and result list until the user commits to an answer, then reveals the verified moves and existing piece highlights. Self-ratings and commitment time remain local.
- Two-sided PLL recognition covers all 21 standard cases on a full, fixed-view cube with random AUF. Learn starts with a small family, Mix interleaves all cases, and Transfer records a separate accuracy stream.
- PLL adaptive glance changes after ten valid outcomes and only speeds up at 90%+ accuracy. Incorrect/skipped cases return after two intervening cases; correct-only response times, confusion pairs, transfer accuracy, and genuine 24-hour retention probes are tracked separately.
- Cross/X-cross/double X-cross search reuses the MIT-licensed `cube-xcross` Lite WebAssembly engine. It checks all four single-pair and six double-pair targets for each selected face, with shared time budgets and cancellable worker execution. Returned plans are independently verified against the geometric cube model before display.
- Scout recognition families are transparent structural heuristics (preserved pair, one-move pairing, solved piece, piece lands solved, tracking required), not validated human-difficulty scores. Searches are bounded, and a missing plan is not proof that no plan exists. Curated pattern lessons and smart-cube/Bluetooth integration are future work.
- Response timing begins at reveal and includes keyboard/click latency. F2L shows separate search and matching intervals
- Mistakes in F2L stay on screen with correct-pair outlines until Continue
- Reviews after a gap of at least 24 hours are counted separately from ordinary practice
- Leaving the tab or opening help pauses practice; the interrupted trial is discarded when resuming
- Unanswered corner and PLL trials expire at 10 seconds and are not logged at all. Their prompts stay inside the cube area and resume with a fresh case. F2L has no time cutoff; its timing and correction inspection are unaffected.

The scheduler is a heuristic informed by perceptual learning and spacing research, not an experimentally validated learning model. Corner scheduling considers the ordered visible stickers and target position; F2L samples fresh cases within the selected bottom color. Three-corner drills schedule whole states, with separate records for their preview advantage. Glance mode currently applies to corners only. A shorter exposure does not prove that all mental processing finished during that exposure.

Deduction uses oriented sticker candidates and exact one-to-one identity matching from the allowed U/F/L/R observations. It is conservative: it does not use global orientation/parity constraints to resolve further ambiguities. Physically matching pairs outside its objective set are unscored, not marked wrong.

Automatic hot reload is disabled. Refresh manually when ready to load source changes. For an uninterrupted built version, run `npm run build` followed by `npm run preview -- --port 4173`.

The precompiled WASM browser output lives in `src/wasm/`. To rebuild it, install the `wasm32-unknown-unknown` Rust target and `wasm-bindgen-cli`, then run:

```bash
npm run build:wasm
```

## Verification

```bash
npm test
npm run test:unit
npm run test:rust
npm run build
```

Tests cover visual/input flow, correction persistence, glance timing, callback cancellation, scheduler spacing, observed deduction, and cube invariants across all six bottom colors. Browser tests use their own port (4174).
