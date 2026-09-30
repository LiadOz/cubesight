# Solve review (chess.com-style) — design and technical spec

Status: design only. Nothing under `src/`, `tests/` or config was touched.
Everything marked **verified** was checked by reading the code or by running it; the runnable checks are in `_src/proto.mjs` (solver, planner, pseudo, AUF, cancels, timings) and `_src/proto-import.mjs` (reconstruction parser checked against an independent physical cube model). Frames are listed in section 17.

The goal: after a solve (or for an old or imported solve) the Brain shows a **review**. It grades each move and each stage, says what was good, says what could be better, shows "the best move here was X, given everything you did before", and lets you retry the moment. Tone is a friendly coach. Words are cubing words, not chess words.

---

## 0. TL;DR

- The engine can already compute, exactly and fast: the optimal cross length at any position, for any face (this is the "evaluation"); which first moves stay on a shortest path; the optimal continuation "given your previous moves"; whether an X-cross existed; per-slot pair completion options for pair 1 and 2 (with ergonomic weighting and pseudo); cancellations; PLL case, and the best AUF; skips; rotations on gyro cubes.
- Measured: one cross query is 0.02–0.03 ms warm. Reviewing all positions of an 8-move cross, including every alternative first move, takes 3–18 ms. The cold start (table build on the first query) is 0.5–0.8 s. So the cross review is effectively free after a one-off warm-up.
- The Brain record does **not** yet contain per-move times, per-pair move indices, held orientation per move, or the full move list (it is cut to the last 200). The phase-1 work starts by capturing them. Old records and imported reconstructions can still be reviewed, without timing labels.
- Two things do not exist and must be built: a pair solver for pairs 3 and 4 (the WASM only does cross plus up to two slots), and OLL case identification and alg tables.
- The existing `efficiencyScore` is a coarse heuristic that nothing in `src/` calls. The new accuracy replaces it and keeps it only as a fallback.
- Everything that names a skill or case in the results and the review is a link to the drill for exactly that thing (section 12b), with a preview popover and a way back (`← review`, `b`). All routes are local.
- Recommended v1: cross evaluation and best continuation, pauses, cancels, skips and X-cross, rotations on gyro cubes, the review screen, graph, key moments, retry for cross moments, and import of a pasted reconstruction. Section 14 has the full plan.

## 0.1 Offline constraint (hard requirement)

The site is an installed PWA and works entirely offline. There is no backend and no runtime call to any external service. Consequences for this design:

- **All computation is local**: the solver runs in the existing module Web Worker as WASM (`xcross.wasm`, which the PWA build already precaches: `vite.config.js` workbox `globPatterns` include `wasm`); the review engine is plain JS in the page or a worker. Nothing is fetched to review a solve.
- **New assets must be bundled and precached**: any new table (OLL cases, alg alternatives, the pair solver WASM) ships in the app bundle, never downloaded on demand.
- **Import is paste or file only**: a text box and a file picker (`.txt`). An alg.cubing.net link is **parsed locally from its URL parameters** (`alg`, `setup`), never opened or fetched. There is no "import from URL", no site adapters that scrape pages, no link resolution, no sharing service. If a pasted link has no parameters (for example a short link) the importer says so and asks for the text.
- **Storage is local** (IndexedDB plus the existing solve store). Export and import of reviews reuse the existing `data-port.js` file flow.
- **No telemetry** and no remote model for the coach: explanations are templates filled with computed values (section 9).
- The only network-shaped dependency in the codebase, the Bluetooth link to the cube, is local radio and unchanged.

---

## 1. What the codebase can compute today (audit)

"Ready" means callable as is. "Glue" means small new code around existing functions. "New" means new engine work.

| Capability | Source (verified) | Status | Notes |
|---|---|---|---|
| Optimal cross length on any of 6 faces, from any position | `cross-solver.js` → `cross-solver-worker.js` → `_xcross_wasm_analyze_json(scramble, face, mask=0, maxDepth, maxResults, timeout)`; `kind:'cross'`, depth cap 8 in the worker default | Ready | Input is a scramble string, so a "position" is `scramble + moves so far`. `parseScramble` caps it at 200 moves. Results are sorted shortest first. `optimality:'proven'` / `'unproven'` per result. |
| Optimal X-cross (cross plus 1 pair) and 2X-cross on any face | same, `kind:'xcross'` (masks 1,2,4,8), `'xxcross'` (masks 3,5,9,6,10,12) | Ready | Bit to slot mapping is internal to the wrapper; discover it by probing (solve each single mask once per face and read the pair slot with `validateSolution`). |
| Exact set of shortest-path first moves at a position | Not a function. Derived: `{m : dist(pos·m) == dist(pos) − 1}` over the 18 moves | Glue | 18 queries, about 0.6 ms total warm (verified). The worker's `maxResults` (max 8) alone gives an incomplete set. |
| Per-face cross and X-cross comparison at move 0 | `solve-coach.js` `crossSuggestion(scramble,{extended})` | Ready | Serial, one face per await, each with its own budget. Verified in Node: cross per face `U5 D6 F5 B4 R5 L6`; X-cross per face `U7 D6 F7 B5 R7 L6`. |
| Hindsight text for cross | `solve-coach.js` `crossHindsight(user, optimal, face)` | Ready | Reused as the seed of the cross coach line. |
| Pair options after the cross, ergonomic weights, pseudo flag | `f2l-planner.js` `plannerChoices(setup, results)`, `weightedMoveCount` (F/B count 5, rotations 2, others 1), `wideURequest`, `wideUResults` | Glue | Takes solver results and keeps those that keep the cross and already solved pairs. It derives pair slots with `validateSolution`, so the mask mapping is not needed. `createPlannerSetup` is a synthetic test generator, not a solve analyser. |
| Pair 2 given pair 1 | `xxcross` masks that contain the solved slot (3, 5, 9 in the test) | Glue | Fast (3–34 ms, proven). The other masks time out (status 7 after 800 ms). Pick only masks containing solved slots. |
| Pair 3 and 4 | none | **New** | No 3- or 4-slot goal exists in the WASM. See 10.3. |
| `f2l-logic.js` | a recognition **trainer** case generator (`createF2LCase…`, `createPseudoScanCase`) | Not useful for review | It generates practice cases. It does not analyse solves. |
| Stage detection per move (cross, pairs, EO, CO, OLL, solved, skips) | `solve-tracker.js` `analyze`, `extendedCross`, `solvedPairs`, `solvedPairsPseudo`, `currentDShift`; the milestone and skip rules live inside the closure `createSolveLive.onSolveMove` | Glue | The rules are not a reusable function. Extract a pure `segmentSolve(scramble, moves, opts)` (phase 0). This also makes old records reviewable. |
| Pseudo F2L detection | `currentDShift`, `solvedPairsPseudo`, `f2lDonePseudo` | Glue | Opt-in (`live.setPseudo`). Two defects, verified in section 8.1. |
| Cancellation and wasted moves | none | Glue (about 15 lines) | `cancelWaste()` in `_src/proto.mjs`. Verified on `R U R' R' U' F F D L R L'`. |
| PLL case id | `pll-logic.js` `identifyPllCase`, `isPllState`, `PLL_CASES` (one alg per case) | Ready | Ignores AUF. Defined relative to a white U, so use `canonicalizeForRecognition(state, crossFace)` (as `pllLens` does). |
| Best AUF for a PLL state | none | Glue | Try 4 pre-AUF × 4 post-AUF with the DB alg and pick the cheapest that solves. Verified for T, Aa, Ua, Jb. |
| OLL case id (57 cases) | none. `solve-coach.js` `ollStage` gives only EO/CO booleans | **New** | 2-look case shapes (edge pattern × corner pattern) need only a small table. Full OLL needs 57 cases plus algs. |
| Alg alternatives (shorter algs for a case) | none (one alg per PLL case, none for OLL) | **New (data)** | Needed for "a shorter alg exists". |
| Rotations | `solve-live.js` counts a change of held **bottom** face between solving moves (`rotations`), from `cube.getHeldFaces()` (gyro) | Glue | Only a count is stored. Needs a per-move sample. GAN with gyro only. |
| Regrips | not measurable | — | The cube reports face turns and orientation, not hands. Only an inferred heuristic (see 4.4). |
| Per-move time | `recorder.js` clock, `session` `cubeTimestamp`/`localTimestamp` exist on events; **the record has no `moveTimes`** | **New (capture)** | Contract promises `moveTimes`; today `record` has only `solveMs` and `phases`. |
| Accuracy | `solve-coach.js` `efficiencyScore` | Replace | Not called from `src/` (only the unit test). See 5.5. |
| Guided state setup (retry) | `solve-live.js` `startGuided`, `smart-cube-guidance.js` `followPlanTurn`, `recoveryMoves`, `describeTurn` | Glue | Plans start from **solved**. See 11. |
| Virtual cube input (retry without a cube) | `recording-replay.js` `createManualDevice().move()` drives the real session | Glue | Needs an on-screen keypad. |
| 3D step-through and "best move" hint | `cube-3d.js` `update`, `animateMove`, `setTurnHint`, `queueLiveMove` | Ready | The hint is the "show best move" arrow. |

### 1.1 Measured costs (Node, real WASM; `_src/proto.mjs`)

| What | Cost |
|---|---|
| WASM instantiate | 12–17 ms |
| First cross query (builds tables) | 0.5–0.8 s, once per worker lifetime |
| Warm cross query | 0.02–0.03 ms |
| All positions of an 8-move cross, each with the exact first-move set and the best continuation | 3–18 ms |
| X-cross on all 6 faces (4 masks each), incl. table builds | 0.5–0.9 s cold |
| Pair options for all 4 slots after the cross (proven) | 0.27–0.5 s cold, about 4 ms per mask warm |
| Pair 2 with pair 1 solved, masks containing the solved slot | 3–34 ms; masks not containing it hit the timeout |

The same WASM runs directly in Node, so the review engine can be unit-tested with the real solver (no worker, no mocks).

### 1.2 Defects and gaps found while reading the code

1. `solve-live` sets `crossFace` from the held bottom face at the first move. Without a gyro the held face is fixed (`getHeldFaces` falls back to a constant `bottom`), so a colour-neutral solver without a gyro gets a wrong cross face. The review must **infer** the cross face from the moves: the face whose cross is solved first (ties broken by the smaller distance at move 0).
2. Pseudo detection is hard-wired to the literal `D` layer (`D_OFFSET_MOVES`). Verified: with the cross on U, a U-offset cube gives `currentDShift = null`. Fix by normalising every solve to "cross on D" before analysis (relabel moves), see 3.
3. `analyze().eoDone/coDone` require `f2lDone` in the plain frame. Verified: a cube with the D layer offset and all edges oriented gives `eoDone=false` although `eoSolved()` is true. Under pseudo the EO/CO milestone is late until the D fix. The review must use `eoSolved` / `coSolved` directly, gated by `f2lDonePseudo`.
4. `record.solveMoves` is `moves.slice(-200)` and `scrambleTurns` the same. Free mode leaves `record.scramble = ''`. A long solve loses its start. Store everything.
5. The live `maxPairs` and milestones are monotonic. Good for the live UI, wrong for review (a pair that breaks must show up). The review recomputes per move.
6. `solveCross` allows one pending request and terminates the worker on abort. The review needs a batch API on the same worker.
7. `efficiencyScore` has a floor: solving the cube gives at least 45 and usually 75 or more whatever the moves. It is unused. Do not build on it.
8. Solver results marked `unproven` (timeout) are upper bounds on the optimum. Use them only in the "at least this good existed" direction (see 10.4).

---

## 2. Inputs and normalisation

### 2.1 Three sources, one pipeline

| Source | Has | Lacks | Review |
|---|---|---|---|
| Live Brain solve (new) | scramble, all moves, `moveTimes`, marks, orientation samples, penalty, inspection | — | Full |
| Legacy Brain record | `scramble` or `scrambleTurns`, `solveMoves` (last 200), `phases` (ms per stage), `crossFace`, `rotations` (count) | per-move time, pair marks | Move-choice labels, stage split times only |
| Imported reconstruction | scramble, solution text, sometimes stage comments and a total time | per-move time | Move-choice labels only (section 12) |

### 2.2 Canonical form (all sources)

```
ReviewInput {
  scramble: string                 // canonical fixed-centre face turns, WCA orientation
  moves: string[]                  // canonical outer-face turns only, never wide/slice/rotation
  srcIndex?: number[]              // moves[i] came from source token srcIndex[i] (imports, for highlighting)
  moveTimes?: number[]             // ms since the first solving move, one per move; absent for imports/legacy
  orient?: [i, bottom, front][]    // sparse: held bottom/front faces from move i on (gyro, or derived from x/y/z in imports)
  gyro: boolean                    // orientation samples are real (not the constant fallback)
  crossFace: 'U'..'B'              // inferred if not trusted
  pseudo: { auto: true }           // no toggle, see 8
  marks?: {crossIdx, pairIdx[4], eoIdx, coIdx, ollIdx, solvedIdx, skips[]}   // recomputed by segmentSolve when absent
  inspectionMs?, penalty?, totalMs?, method: 'cfop'|..., ll: {oll:'1-look'|'2-look', pll:'1-look'|'2-look'}
  meta: { at, source: 'live'|'legacy'|'import', engine: 1 }
}
```

Pipeline:

1. **Fixed-centre frame.** Wide moves, slices and rotations are converted to outer face turns plus a frame track (verified, section 12.3). The session only emits outer-face turns, so live data is already canonical.
2. **Cross-on-D frame.** Relabel all moves so the inferred cross face is D (a fixed mapping of face letters). After this every existing helper that hard-codes `'D'` is correct (`plannerChoices`, `currentDShift`, `validateSolution(…,'D')`). The UI maps labels back with `movesForInspection(bottom, front)` for display.
3. **`segmentSolve`** (pure, extracted from `solve-live.onSolveMove`) replays the moves through `analyze` and the frame-aware pseudo functions and returns marks per move index: cross, each pair (with the frame k it was solved in), EO, CO, OLL, PLL, solved; skips; state per move.
4. **Timing normalisation.** `moveTimes` are the times of the last quarter of a coalesced double (the session merges two same-face quarters within 50 ms into a double). Prefer the cube's own `cubeTimestamp` deltas (low jitter) and fall back to `localTimestamp` (BLE arrival, jitter tens of ms).

Display notation: the review shows moves as the user saw them (held frame: cross on the bottom, front from the orientation track; for cubes without a gyro, a fixed front chosen by `suggestInspectionFront`). A toggle switches to "as reported by the cube".

---

## 3. Classification taxonomy

### 3.1 Recommended label set ("Cuber's words")

Design rules: labels are cubing vocabulary. A label is a statement about a **move or a stage**, never about the person. Every label carries a tone (positive, neutral, negative), a cost in loss units (LU, section 5) and a **source + confidence**. Negative labels have three severities by LU: minor (0 < LU < 2, amber ring), major (2 ≤ LU < 4, amber solid), costly (LU ≥ 4, red solid). In the Mono style negative is always the error colour and major/costly are solid.

Legend of symbols: **M** = measured from data the cube reports; **D** = derived exactly (pure computation on moves); **S** = solver-backed (proven when the solver finished, otherwise an upper bound); **I** = inferred heuristic, low confidence, shown dashed and hidden unless "show inferred labels" is on. "needs time" means it is hidden for legacy records and imports. "needs gyro" means it is hidden on cubes without a gyro.

**Positive**

| Label | Applies to | Definition and exact rule | Source / confidence | Needs |
|---|---|---|---|---|
| Optimal | move | In cross or a searched pair: `dist(after) == dist(before) − 1` (on a shortest path). | S, proven | — |
| Efficient | stage | Stage waste ≤ 1 move vs the reference (cross: `n ≤ d0+1`; pair: `n ≤ opt+1`). Not shown on stages that are Optimal. | S | — |
| Clean | stage | Stage LU = 0: no waste, no pause, no cancel, no rotation. | D+M | — (time part only if timed) |
| Flow | boundary | Gap at a stage boundary `≤ 1.2 × median gap` and `≤ 0.25 s` (you did not stop to look). At most one per boundary. | M, BLE jitter ±30 ms | needs time |
| Skip | stage | EO, CO, OLL or PLL finished on the move that completed the previous milestone (tracker `progress.skip`, `solvedUpToAuf`). | M | — |
| Free pair | pair | Two or more pairs solved by one move, or a pair solved with no moves of its own (tracker skip kind `f2l`). | M | — |
| X-cross | stage | Cross completed with ≥ 1 pair solved (`extendedCross`, frame-aware, see 8). | M | — |
| Pseudo pair | pair | A pair solved in a non-zero D frame that saved ≥ 2 moves vs the best normal pair (or ≥ 1 when the D fix is shared across pairs). See 8. | S+M | — |

**Neutral**

| Label | Applies to | Rule | Source |
|---|---|---|---|
| Fine | move | Nothing to flag, or no evaluation exists for that position (inside an alg, inside a pair in v1). Shown as a small dot. | — |
| OK | stage | `0 < LU ≤ 1`. | D |
| D fix | move | The D-layer turn that resolves a pseudo offset that was used. Never costs LU. | M |

**Negative**

| Label | Applies to | Rule and threshold | LU | Source / confidence | Needs |
|---|---|---|---|---|---|
| Extra move | move | Cross (or searched pair): `1 + dist(after) − dist(before) == 1` (same distance, one move spent). | 1 | S | — |
| Detour | move | `== 2` (the move moved you away from the goal). (The word "detour" is also used inside `smart-cube-guidance` for wrong-turn recovery; the code enum is `backtrack`.) | 2 | S | — |
| Cancel | move | Same-axis run wasteful: `R R'` (2), `R R` (1, could be `R2`), `R R2` (1), `R L R'` (2). Run reduction by axis (U/D, R/L, F/B), waste = run length − non-zero net faces. A double turned slowly (more than 50 ms between quarters) appears as two moves; that is a Cancel of 1. | waste | D, exact | — |
| Better pair | pair | Another slot's best completion is ≥ 2 moves shorter (HTM) or its ergonomic weight is ≥ 6 lower with ≥ 1 move shorter. Greedy: judges only the next pair. | `min(3, max(0, opt_chosen − opt_best − 1))` | S (proven for pair 1–2), greedy | v2 |
| Better cross | stage | At move 0 another face is ≥ 2 moves shorter than the chosen face (proven), and the solver is colour neutral (setting or inferred). | `min(3, d_face − d_best − 1)` | S | — |
| Missed X-cross | stage | An X-cross on the chosen face had length ≤ your cross move count and you did not make one. | `min(2, n − x_opt)` | S | — |
| Pause | gap | `gap ≥ max(allow + 0.25 s, 2.5 × median gap)`; `allow` from the table in 5.3. | `min(6, (gap − allow) × tps_ref)` | M, BLE jitter | needs time |
| Slow recog | boundary | A Pause whose gap sits before an EO/CO/OLL/PLL alg starts. | as Pause | M | needs time |
| Rotation | move | Held bottom face changed between two moves (gyro). Reported as measured and never "likely". Bottom-changing rotations only in v1 (x, z). `y` needs the front sample (v3). | 2, capped 6 per solve | M (note: the 3D view can be dragged by hand, which also changes the held face; ignore rotations with no gyro packets during the gap) | needs gyro |
| Extra AUF | move(s) | AUF moves (`U`, `U2`, `U'` around the alg) exceed the best pre+post AUF for the identified PLL case. | difference | D (PLL DB) | v3 |
| Stray offset | move | A D-layer offset was created and no pair was solved in that frame before it was undone (8.4). | 1 | M | — |
| Regrip (likely) | gap | Gap ≥ 2 × the in-alg median and ≥ 250 ms inside an alg, with a still gyro. Low confidence. | 0 (info) | I | time + gyro, off by default |
| Lockup (likely) | pair | Inverse pair (`X X'`) with gap < 150 ms: jam and release. | 0 (info) | I | time, off by default |

What is hidden when data is missing:

| Missing | Hidden labels | Accuracy effect |
|---|---|---|
| no gyro | Rotation, Regrip | Rotation term dropped (no penalty, no bonus); cross face inferred |
| no timing (legacy, import) | Pause, Slow recog, Flow, Regrip, Lockup | LU has move terms only; graph x axis is moves; TPS hidden |
| solver timed out | Better pair, Better cross, Missed X-cross only if the found solution already proves it | conservative (10.4) |

### 3.2 Alternative naming schemes (for the user to choose)

| Concept | A. Cuber's words (recommended) | B. Coach voice | C. Par (golf-flavoured, matches the "moves vs par" graph) |
|---|---|---|---|
| on a shortest path | Optimal | Nailed it | Par |
| stage within 1 move | Efficient | Smooth | Birdie |
| stage with no waste at all | Clean | Spotless | Eagle |
| no stop between steps | Flow | Flowing | Hole in one (too cute; "Flow" kept) |
| skip | Skip | Sparkle | Albatross |
| +1 move | Extra move | Wobble | Bogey |
| +2 moves | Detour | Wrong way | Double bogey |
| undoing moves | Cancel | Undo | Mulligan |
| a stop | Pause | Hesitation | Lost ball |
| slow recognition | Slow recog | Squint | Bad lie |
| better pair existed | Better pair | Other pair | Wrong club |
| rotation | Rotation | Tumble | Out of bounds |

Scheme B is warmer and suits the avatar. Scheme C makes the graph label ("strokes vs par") natural and is the most playful, but it reads less like cubing. A mixes easily with a friendly tone and is the most self-explanatory, hence the recommendation. The choice is an open question (section 16).

### 3.3 Badge system

Icons are small geometric glyphs on a disc, in the language of the Orbit ring and the skip spark (no emoji, no letters except `+1`, `U`). Tone sets the colour: positive teal (`--b-good`; amber in Mono), neutral muted, negative `--b-warn` (Mono: the error colour), costly `--b-dnf`. Solid discs are strong (Optimal, Detour ≥ 2, costly); rings are light; **dashed rings mean inferred**. The sheet is `R-dark-00-badges`.

---

## 4. Moves: what is evaluated where

### 4.1 Cross (v1, exact)

Positions `S_0 … S_n` (`S_i` = scramble + first `i` moves), face `f` (chosen or inferred), `d_i = dist(S_i, f)`.

- `loss_i = 1 + d_i − d_{i−1}` ∈ {0, 1, 2}.
- Identity (verified on the golden cross): `Σ loss_i = n − d_0`. So move-level labels sum exactly to stage waste.
- Best first moves at `S_{i−1}`: `{m : dist(S_{i−1}·m) == d_{i−1} − 1}`.
- Best continuation from `S_{i−1}`: the first result of `search(S_{i−1}, f, cross)` (length `d_{i−1}`).
- Real example (mock solve, yellow cross, D): scramble `D2 F2 U' B2 R2 U2 F2 U' L2 D' B' L' U F' R' D2 R U' F2 L'`, user cross `F' D' F D B D' R D'` (8 moves), optimal 6 (`F' D' F R D' F`). Distance curve `6 5 4 3 4 3 2 1 0`; losses `0 0 0 2 0 0 0 0`: move 4 (`D`) is the Detour. First moves on a shortest path at move 4: `R` (and the solver lists more); continuation `R D' F` (3 more), the user needed 5 more.
- Face choice at move 0: lengths `U5 D6 F5 B4 R5 L6`; `B` was 4 (the user's D was 6): "Better cross" if colour neutral.

X-cross handling: if the cross completes with pairs attached, the target is the set of slots solved at completion (known in hindsight). Use the X-cross distance (mask of those slots, up to 2) as `dist` for all cross positions, so a sidestep toward an X-cross is not penalised. For 3 or more pairs fall back to cross distance and forgive up to 3 extra moves per attached pair.

### 4.2 F2L pairs (v2)

At each pair boundary (cross done, then after each pair) the state `S_b` is known, the set of solved slots `P` is known, and the user then completes one more slot `c` with `n_c` moves.

- Options: for each unsolved slot `s`, the cheapest verified completion that keeps the cross and `P` (pair 1: X-cross masks; pair 2: 2X-cross masks containing the solved slot; pair 3 and 4: new solver, 10.3). `plannerChoices` already filters by "keeps the cross and solved pairs".
- Per option: length (HTM), ergonomic weight (`weightedMoveCount`), `pseudo`, `proven`.
- **Pair waste**: `n_c − len(c)` (amortised D fix, 8.3). Per-move losses: query the pair-completion distance of slot `c` from each intermediate position (about 4 ms per position warm), same `loss` formula as the cross.
- **Better pair**: rule in 3.1.
- Real example: after the mock cross: BL `D L' U' L D'` (5, pseudo), FL `U2 R2 F R2 U2 F'` (6, weight 14), FR `R F R U' F' U' R'` (7, weight 15), BR `U' B R B2 U' R' B'` (7, weight 19). If the user solves FR in 7: "Better pair", LU 1 (7 − 5 − 1).

Weights: a pair "costs" its weight when we rank options for **choice** (F/B turns are awkward). Accuracy waste uses plain HTM length so accuracy is not distorted by ergonomics.

### 4.3 Last layer (v3)

| Question | Computation | Available now? |
|---|---|---|
| Is the state a PLL state, which case? | `isPllState` + `identifyPllCase` on the canonicalised state | Yes |
| Recognition time | gap between the last move of the previous stage and the first alg move (the boundary gap) | Needs timing |
| Execution TPS | alg moves ÷ (last alg move − first alg move) | Needs timing |
| AUF used and best | leading/trailing U moves around the alg core; best by trying 4×4 AUFs with the DB alg | Glue (verified) |
| Better alg | compare the core length to the DB alg length | **New data** (DB has one alg per PLL case, none for OLL) |
| 2-look OLL shape | edge pattern (dot/L/line) × corner pattern (7 shapes) | New, small table |
| Full OLL case | 57-case table with algs | **New data** |
| 2-look vs 1-look | settings (`ll` in `ReviewInput`); a 2-look PLL is compared against the 2-look algs (corner alg + edge alg, all in the PLL DB) | Glue |

### 4.4 Inferred labels (off by default)

- Regrip (likely): pauses inside an alg with a still gyro. Never proven.
- Lockup (likely): quick undo pairs. Only ever informational (LU 0).
- Both display as dashed rings and the coach says "looks like", never "you did".

---

## 5. Loss units and accuracy

### 5.1 Loss units

1 LU = one wasted move (HTM). Everything converts to LU, so one number captures moves, pauses, rotations and choices.

| Term | LU |
|---|---|
| Cross: sum of `loss_i` | 0..n |
| Pair: `n_c − len(c)` | ≥ 0 |
| Cancel waste | waste |
| Better pair / better cross | per 3.1 |
| Pause | `min(6, (gap − allow) × tps_ref)`, `tps_ref = 1 / median gap` |
| Rotation | 2 each, cap 6 |
| Extra AUF | difference |
| Stray offset | 1 |

Per move LU = max of the move-level terms (distance loss, cancel waste) so a cancel that the solver already counted is not counted twice. The other terms are added.

### 5.2 Stage accuracy

```
accuracy(stage) = round(100 · exp(−LU_stage / (1.5 · ref_stage)))      // 0..100
accuracy(overall) = round(100 · exp(−ΣLU / (1.5 · Σref)))
ref(cross) = max(4, d_0 of the chosen face)            (X-cross: the X-cross distance)
ref(F2L)   = Σ len(chosen slot) over the pairs         (v1 default 28 until the pair engine exists)
ref(LL)    = Σ DB alg lengths + best AUF               (v1 default 24)
```

A skipped stage has `ref = 0` and contributes nothing. Skips, free pairs and X-cross are **not** in accuracy (accuracy is skill, not luck); they show as bonus on the graph and in a "moves saved" line.

Calibration (tunable constant 1.5): 2 extra moves on a 6-move cross gives 80; 1 extra gives 89; a flawless stage gives 100. The constant is fixed against the golden solves and stored with the engine version.

Worked example (mock solve, LU itemised; frame `R-dark-05`; the numbers are computed by `_src/gen.mjs` from this formula):

| Stage | Items | LU | ref | Accuracy |
|---|---|---|---|---|
| Cross | Detour +2 | 2.0 | 6 | 80 |
| F2L | Better pair 1.0, pause 1.6, cancel 2.0, rotation 2.0, pause 2.4, pair 4 waste 3.0 | 12.0 | 28 | 75 |
| LL | Pause inside the Aa alg 1.3, Extra AUF 1.0 | 2.3 | 24 | 94 |
| Overall | | 16.3 | 58 | 83 |

### 5.3 Pause allowances (default, seconds)

| Gap between | allow |
|---|---|
| two moves inside the cross / inside a pair | 0.35 |
| cross → first pair | 0.60 |
| pair → pair | 0.45 |
| last pair → first LL move (recog for OLL) | 0.65 |
| EO → CO | 0.55 |
| OLL → PLL | 0.70 |
| two moves inside an alg | 0.30 |

These are defaults. v3 replaces them with the user's own percentiles per boundary (after 10 reviewed solves).

### 5.4 Coach tiers (optional wording for the accuracy)

95–100 "Sharp", 85–94 "Solid", 70–84 "Room to grow", below 70 "Worth a look". Open question.

### 5.5 Reconciliation with `efficiencyScore`

`efficiencyScore({userCrossMoves, optimalCrossMoves, rotations, solved, f2lPairs, ollDone})` is `50 + 25·solved + min(15, 4·pairs) + 5·oll + (10 if cross optimal else −min(15, 3·extra)) − min(15, 2·rotations)`. For the mock solve it gives `50+25+15+5−6−2 = 87`; the new overall is 83. Differences: it has no timing, no F2L or LL quality, rewards finishing, and is almost constant for completed solves.

Plan: keep the function for the records that have no `ReviewInput` (shown with a tilde, "≈ 87", and a label "estimated, open the review for the real number") and for its unit test; every new surface uses `solveAccuracy`. Rotation cost (2 LU) deliberately matches both `efficiencyScore` (2 points each) and `weightedMoveCount` (x/y/z = 2).

---

## 6. Solve graph (the "evaluation graph")

There is no single "position evaluation" for a whole solve (no cheap optimal remaining length for the full cube), so the graph plots the **ledger** instead:

- x: time since the first move (toggle: move index). No timing: moves only.
- y: **moves vs par**. 0 is par (the reference solution for every stage). The line steps **down** by each move's LU at the moment it happens and steps **up** by the bonus of luck and cleverness: Skip (saved alg length: EO 6, CO 8, OLL 11, PLL 12), Free pair and X-cross (7 per pair, or the user's own median pair length once known), Pseudo pair (moves saved).
- Pauses are drawn as hatched bands on the time axis with the length written beside them, and the line is flat across them (they already cost LU at their end).
- Markers: a dot per labelled move in the label colour; the skip spark; numbered pins for key moments; a cursor for the current step. Stage bands alternate in the faint fill as in the TPS chart.
- A faint sawtooth of the stage distance `d_i` (cross distance, pair distance) can be toggled for people who like the chess "eval bar" feel.
- The end point is the net of loss and bonus. Accuracy is computed from losses only.

---

## 7. Key moments

Select at most 6, ordered in time.

1. Candidates: every labelled event with LU ≥ 1.5 (negative); every Skip, Free pair, X-cross, Pseudo pair, Flow at a boundary (positive); the stage boundary with the largest pause.
2. Score: negatives by LU; positives by moves saved.
3. Take the top 3 negatives and the top 2 positives, but **always include at least one positive** ("this is where you were really good") if any exists, and never more than one moment within 3 moves of another.
4. If fewer than 3 events qualify, add the stage with the lowest accuracy.
5. Each key moment stores: move index, label, LU or moves saved, stage, retry state (always available).
6. Step controls: previous/next key moment (`[` and `]`), previous/next move (arrow keys), play, scrub on the graph.

---

## 8. Pseudo-slotting is first-class

Pseudo-slotting: pairs inserted with the D layer offset from the centres (cross edges are off by D, D' or D2), then one D move fixes everything. The Brain today has an opt-in toggle (`live.setPseudo`, the "Pseudo F2L · D-shift" checkbox). The review has **no toggle**: it detects pseudo automatically.

### 8.1 Detection per move (automatic)

For each position after the cross is first solved in any frame:

```
k_i = currentDShift(state_i, 'D')      // 0 aligned; 1,2,3 = D, D2, D' fixes it; null = cross not solved in any frame
pairs_i = solvedPairsPseudo(state_i, 'D')        // pairs solved in the frame k_i
```

(The review normalises to cross-on-D first, which also fixes the hard-wired `D` in the tracker; verified: with the cross on U `currentDShift` returns `null` for a U-offset cube.)

Interval logic: the **offset is created** when `k` goes from 0 to non-zero, and **resolved** when it returns to 0. `k = null` (mid-insertion) is skipped; the last known `k` holds.

Verified trace on the real mock state (after the real cross; the BL pseudo pair `D L' U' L D'` from `plannerChoices`):

```
move        k     pairs solved in frame k     plain pairs
(cross)     0     –                           0
D           3     –                           0
L'          null  –                           0
U'          null  –                           0
L           3     BL                          0        <- the pair is solved in the D' frame
D'          0     BL                          1        <- the D fix; the pair is now plain
```

### 8.2 Classification

- **Pseudo pair** (positive): a pair first counted in a frame `k ≠ 0` and saving moves: `saved = len(best normal option) − (moves the user spent, D fix excluded if deferred, included if immediate)`. Label when `saved ≥ 2`, or `saved ≥ 1` and the same D fix serves two or more pairs. Otherwise the pair is neutral ("Fine" with a "pseudo" tag). The coach says how many moves it saved.
- **D fix**: the D turn that resolves an offset which was used (≥ 1 pair solved in the frame) is neutral and **never** Extra move or Detour. If the D turn ends `k` while a pair was solved in frame `k`, the `loss` formula is computed with the pair distance that already counts the fix as a normal move in the solver; amortise by giving the user credit of 1 for the fix (so `n_c` excludes it when deferred).
- **Stray offset** (negative, 1 LU): a D turn creates `k ≠ 0` and `k` returns to 0 with no pair solved in the offset frame in between (an offset that was not exploited), or `k ≠ 0` persists into the LL with no pair solved in it.
- The **optimal continuation considers pseudo**: the pair options for each slot include solutions that end with a D fix (the solver counts the fix as a normal move; `plannerChoices` marks them `pseudo`). Setting `review.suggestPseudo` = `if-you-use-it` (default: at least 15% of the last 20 solves used a pseudo frame, or this solve did), `always`, or `never`. When a pseudo option is the best and the user does not use pseudo, the coach mentions it once as an idea, not as a mistake, and accuracy uses the best **normal** option unless `suggestPseudo` is on.

### 8.3 Edge cases

| Case | Behaviour |
|---|---|
| Offset changes mid-F2L (D turn) with no pair solved | Free frame change. Logged, no LU. |
| Offset changes mid-F2L with pairs solved | The D turn moves the cross edges and bottom corners but not the middle edges, so those pairs are broken in every frame. The pair count drops; the loss formula counts it (Detour or Extra move) and the coach says which pair was undone. The live tracker's monotonic `maxPairs` hides this; the review recomputes per move. |
| Mixed frames between pairs | Each pair records the frame `k_p` it was completed in. Only pairs valid in the current frame count. The summary says "pair 2 in D', pair 3 after a D turn". |
| X-cross with an offset | The cross milestone is "solved in any frame". Generalise `extendedCross` so X-cross counts a pair solved in the same frame (a pseudo X-cross). Labelled X-cross (positive) and tagged "pseudo". |
| Pseudo on the last pair + D fix + AUF in LL | `k ≠ 0` at F2L end is fine. EO/CO detection is frame-independent (`eoSolved`, `coSolved` on the LL face). D and U turns commute, so the D fix can sit before, inside, or after the AUF. PLL skip detection must test "solved up to U and D turns". |
| Offset never fixed before the final move | Impossible (the cube is solved only with `k = 0`); the last D is the fix. |
| Cross face is not D | Normalised by relabelling. |
| Two fixes (D then D2) | Counted as one D fix if they are adjacent (cancel rule merges them). |

### 8.4 Golden cases for pseudo

1. **Real BL pseudo pair** (above): expected trace `0,3,null,null,3,0`; pair BL counted at the 5th move in frame 3; label: neutral "pseudo" (saved 1 vs FL 6).
2. **Pseudo helps**: a constructed state where the best plain pair is ≥ 3 moves longer → expect Pseudo pair, coach line with saved moves.
3. **Solved cube with D offset** (existing unit test shape): `k = 3`, 4 pseudo pairs, `f2lDonePseudo` true; plus the new expectation `eoDone` true when EO is done (currently false).
4. **Cross on U** with a U offset → `k = 3` after normalisation (currently `null`).
5. **Mixed frame**: pair solved, then a D turn → pair count drops, Detour or Extra move on the D turn.
6. **Stray offset**: `D` … `D'` with no pair in between → Stray offset, 1 LU.
7. **Pseudo X-cross**.
8. **Pseudo last pair + AUF**: PLL skip detected despite the pending D fix.

---

## 9. Coach explanation templates

Voice rules: friendly and specific; at most two sentences plus the notation line; lead with what worked when there is something; say "next time" or "worth a look", never "you should have"; always give numbers and the moves; one idea per bubble; moves in the user's held-frame notation with the proper prime character. Variables in `{}`.

| Label | Template |
|---|---|
| Optimal (cross) | "{move} is exactly right: {d_after} moves left and no spare turns." |
| Extra move | "{move} cost you one spare turn. Best from here: {best} ({d_before} moves). You needed {user_remaining}." |
| Detour | "{move} turned you away from the cross. The shortest way home from here was {best_cont}, {d_before} more moves; you took {user_remaining} more ({opt_total} vs your {n})." |
| Cross total | "Cross: {opt_total} was possible on {face}: {opt_alg}. You took {n}." |
| Better cross | "A {best_face} cross was {best_len} moves: {best_alg}. Your {face} cross took {n}. Worth a look during inspection." |
| Missed X-cross | "An X-cross in {x_len} was on {face}: {x_alg}. Your cross took {n}." |
| Cancel | "{a} then {b} undo each other: {saved} spare move{s}. {merged} does the same." |
| Pause | "{gap} s stop before {move} (you usually move every {median} s). Try looking at the next pair while you insert this one." |
| Slow recog | "{gap} s to recognise this {case}. Your last {n} {case} solves averaged {avg} s." (falls back to: "…then the alg ran at {tps} TPS") |
| Flow | "No stop between {prev} and {next}. That is lookahead working." |
| Better pair | "You took {chosen} ({n} moves). {best} was {best_len} away: {best_alg}. Worth checking the {best} slot first." |
| Pair total (clean) | "{pair} in {n} moves, the shortest this position allowed." |
| Skip | "{stage} skip. The {stage} step was done for you ({saved} moves saved)." |
| Free pair | "{pair} came for free. Nice setup." |
| X-cross | "X-cross: the {pair} pair came with the cross. That is {saved} moves saved." |
| Pseudo pair | "Pair {k} went in pseudo ({offset} offset): {saved} moves fewer than the best normal pair ({best_alg})." |
| Pseudo idea | "{slot} was {len} moves as a pseudo pair: {alg}. Only worth it if you like pseudo; you did not use it here." |
| D fix | "{move} put the D layer back. It was free, the offset paid for itself." |
| Stray offset | "The D layer was turned {offset} but no pair used it. One spare move." |
| Rotation | "The cube turned in your hands before {move} ({rot}). Two moves worth of time." |
| Extra AUF | "{auf} then the alg: the case {name} needed {best_auf} ({best_len} moves in total)." |
| Stage summary | "{stage}: {acc}. {headline}" |
| Legacy/import fallback | "No per-move times for this solve, so I can judge your moves but not your pauses." |

Example bubble (real numbers): "Move 4, D: that one turned you away from the cross. The shortest way home from here was R D' F, 3 more moves; you took 5 more (6 vs your 8)." Notation line: `R D' F`.

---

## 10. Best move and optimal continuation

### 10.1 Definitions

- **Best move at position `S_{i−1}`**: any element of the exact first-move set (4.1).
- **Optimal continuation given your previous moves**: the shortest completion of the *current stage goal* from `S_{i−1}` (cross: cross; pair: that slot's pair with the cross and solved pairs kept; LL: DB alg + best AUF). It always starts from the user's real position, never restarts from the scramble.
- **Stage-start optimum**: the same from the first position of the stage ("6 vs your 8").
- **Alternatives**: for cross and pairs the solver returns up to 8 results; show the first, and "also" the next two.

### 10.2 Cost and budget

| Stage | Queries | Cost |
|---|---|---|
| Cross, one position | 1 (continuation) + 18 (first-move set) | 0.02–0.03 ms × 19 |
| Cross, whole stage | ≤ 13 positions | 3–18 ms measured |
| X-cross exemption | 4 masks × positions, depth ≤ 10 | about 4 ms per mask warm |
| Better cross / X-cross at move 0 | 6 faces × (1 cross + 4 masks) | 0.5–0.9 s cold (table builds), 20–40 ms warm |
| Pair options at a boundary | 4 slots (pair 1), 3 masks (pair 2) | 0.27–0.5 s cold, a few ms warm |
| Pair position losses | ≈ 7 positions per pair | about 4 ms each |

Budget: the whole review of one solve ≤ 1.5 s wall time warm, computed in the background when the results screen appears, cancelled when the next scramble starts. Progressive order: cross (ms), move-0 alternatives, pair 1–2, pairs 3–4 (engine later), LL. Each stage posts its labels as it finishes, so the UI fills in.

### 10.3 Pair solver for pairs 3 and 4 (new engine work)

No 3/4-slot goal exists in the WASM. Options:

1. **Preferred:** a small dedicated solver (IDA*) for one more slot with the cross and solved pairs preserved, heuristic = max of single-pair distance tables (corner+edge position/orientation of one slot is about 24 × 24 states, tiny BFS tables per slot). Expected: tens of ms per query in WASM for depth ≤ 9. *Estimate, prototype first.*
2. Interim: filter the 2X-cross results by "keeps the cross and solved pairs" (`plannerChoices` already does). Often empty for pair 3/4; the review then says "not judged" and omits pair 3/4 losses.

### 10.4 Timeouts and proof

A result is `proven` (status 0) or `unproven` (timeout, status 7). Any comparison uses the found length as an upper bound on the optimum: "at least this good existed" is always safe; "you were optimal" requires proven. Negative labels that depend on an unproven bound are suppressed unless the found solution already proves the loss.

### 10.5 Worker and caching

- Follow the existing pattern: one disposable module worker; the WASM search stays synchronous inside the worker; `terminate()` is the hard cancel.
- Extend `cross-solver-worker.js` with a batch message `{type:'evaluate', id, jobs:[{key, scramble, face, kind, mask, maxDepth, maxResults, budgetMs}], totalBudgetMs}`. It answers one `progress` per finished job and one final `result`. On the main side add `solveBatch(jobs, {signal, onProgress})` next to `solveCross` (same single-pending rule, same abort semantics).
- The review orchestration (`review-engine.js`) builds jobs from the normalised input; the classification (`review-analysis.js`) is **pure**: it takes solver answers through an injected `dist(seq, face)` and `search(...)`, so unit tests run it in Node against the real WASM.
- Pre-warm: create the worker and run one cheap query when the Brain mounts (hides the 0.5–0.8 s cold start). Memoise `dist` per `(scramble+prefix, face, kind, mask)` for the life of the review.
- Cache the finished review result per `(record.at, engineVersion)` in IndexedDB (about 650 B JSON per solve); recompute when the engine version changes.

---

## 11. "Retry this moment"

Goal: put the cube in the exact position before move `i`, let the user try the segment again, and grade the attempt with the same engine.

### 11.1 With a smart cube

1. **Target position** `T = scramble · moves[0..i−1]` (canonical frame).
2. **Plan**: after a finished solve the cube is solved, so the plan is the same kind of guided scramble the Brain already runs: `live.startGuided(scramble + ' ' + prefix)`. The plan is at most `20 + i` turns (a late moment means a long setup; the UI shows the count and offers "from the start of the stage" instead, which is also a prefix). The existing wrong-turn recovery (`followPlanTurn`, `recoveryMoves`) applies unchanged. If the cube is not solved, the button reads "Solve or sync the cube first".
3. **Retry mode** in the tracker: `startGuided` ends in inspection and solves to the end. Retry needs `live.startRetry({plan, goal, crossFace, inspection:'off'})`: same guided setup, then the clock starts on the first move and the attempt ends when the **segment goal** is reached (`goal` = cross done / pair count +1 in the current frame / EO / CO / solved), or on cancel.
4. **Grade**: run the normal analysis with the fixed prefix and the attempt's moves as the solution of that stage: per-move labels, stage waste, time. Compare to the original: moves `5 → 3`, accuracy `80 → 100`, label.
5. Attempts are stored as `kind:'retry'` records (`of`, `fromMove`, `goal`, moves, times) and never enter ao5, ao12 or history. They feed a "moments you improved" list.

### 11.2 Without a cube

The 3D cube shows `T` (`cube.update(toRenderData(T))`). Input comes from a virtual device: `createManualDevice().move(m)` already feeds the real session and tracker, so the same grading runs. New UI: a move pad (18 keys, keyboard `URFDLB` + Shift for prime + `2` for double, on-screen buttons on mobile). The clock starts on the first move, the goal ends the attempt, and the 3D cube animates the turns (`animateMove`).

### 11.3 Show best move

The teal arrow (and a chip with the move) uses `cube.setTurnHint(best)`; a second tap plays the optimal continuation on the 3D cube, one move per tap. Nothing is changed in the record.

### 11.4 New engine work for retry

`startRetry` with a goal predicate, a `kind:'retry'` record that bypasses `appendSolve`, the virtual move pad, and the plan shortening by cancelling adjacent same-axis moves in `scramble + prefix` (same `cancelWaste` reduction; small gains only).

---

## 12. Importing reconstructions

The user wants to load a solve from elsewhere (a community reconstruction of a competition solve, an alg.cubing.net link, a pasted solve) and get the same review. Note: the **WCA publishes scrambles and results, not solutions**. Solutions come from videos, reconstructions or the competitor, so the import needs a solution text.

### 12.1 Input formats (tolerant, in this order)

| Format | Example | Handling |
|---|---|---|
| Two plain text blocks | scramble, blank line, solution | first block scramble, second solution |
| Labelled lines | `Scramble: R U…` / `Solution: …` / `Setup:` | labels case-insensitive |
| Comment-annotated solution | `F' D' F … // cross`, `/* pair 1 */`, `(2.08)` | strip comments, keep them as stage hints; `(number)` alone is a time mark, not a group |
| alg.cubing.net link (pasted, parsed locally, never fetched) | `…alg=F-_D-_F…&setup=…` | decode `_` → space, `-` → `'` (and `+` → space, `%0A` newline, `%2F%2F` comment); `setup` is the scramble. The encoding is from memory of the site's convention and must be checked against real links before release |
| Pasted "reconstruction" page text | lines with comments and move counts `(12)` | same tolerant parser; unknown prose lines are skipped |
| csTimer / cubeast style export | scramble plus a solution line | treated as two blocks |

Text copied from community pages (the SpeedCubeDB and cubesolv.es styles the user mentioned) was not inspected; the tolerant text parser is the only adapter, fed by paste or a file. Nothing is fetched (0.1).

### 12.2 Notation accepted

Face turns `U R F D L B` with `'`, `2`, `2'` (and `′ ’`); wide moves `Rw`, `r` (lowercase); slices `M E S`; rotations `x y z`; parentheses with repeats `(R U R' U')3`; commutators `[A, B]` and conjugates `[A: B]`; comments `//` and `/* */`. Big-cube prefixes (`2R`, `3Rw`) are rejected with a clear message.

### 12.3 Conversion (verified)

`_src/proto-import.mjs` converts tokens to canonical outer-face turns in a fixed-centre frame while tracking the whole-cube orientation:

- face turn → that physical face, same amount;
- `Rw` = opposite face `L` (same amount) + rotation `x`; `Lw` = `R` + `x'`; `Uw` = `D` + `y`; `Dw` = `U` + `y'`; `Fw` = `B` + `z`; `Bw` = `F` + `z'`;
- `M` = `R L'` + `x'`, `E` = `U D'` + `y'`, `S` = `F' B` + `z`;
- rotations only update the face map.

The orientation track is the equivalent of the gyro samples, so **Rotation labels work for imports** (measured from the text) and notation can be shown as written.

Check: 300 random algorithms mixing face turns, wide moves, lowercase wide, rotations and slices, each compared against an independent physical model (the repo's `applyMoves` with `Rw/Uw/Fw/M/E/S` moving the centres, then standardising the cube by rotations): **0 mismatches**. (A first version had `Rw` inverted; the random check caught it.)

Validation after parsing: apply scramble + solution; report "solves the cube" or "ends N moves from solved" and show the first wrong token. Also report the method: no cross edge solved after the first 12 moves and M slices heavy → "looks like Roux"; only CFOP is reviewed in v1, others get the generic labels (Cancel, rotations).

### 12.4 How the review degrades without timing

| Available | Not available |
|---|---|
| Cross optimality, Extra move, Detour, Better cross, Missed X-cross, Cancel, Better pair (v2), Pseudo pair (v2), Skip, Free pair, X-cross, Rotation (from text), Extra AUF and PLL case (v3), accuracy (moves only) | Pause, Slow recog, Flow, Regrip, Lockup, TPS |
| Stage split times if comments carry them (`// cross (2.08)` or a total time) | per-move gaps |

The UI labels this plainly ("No per-move times in this solve: move choices only") and the graph's x axis is moves. A total time, if pasted, gives the average TPS only. Stage boundaries come from `segmentSolve`, never from the comments (comments are hints shown next to the move list).

The same path serves **legacy Brain records** (they have `solveMoves` and `scramble` or `scrambleTurns`), so every past solve becomes reviewable, minus times.

Mockup: `R-dark-07-import`.

## 12b. Everything that names a skill is a link to its drill

From the results and the review, every label that names a case or a skill opens the drill for exactly that thing. All routes are local hash routes, the drills are lazy chunks precached by the PWA, and nothing is fetched (0.1). The route scheme extends `../trainers/README.md` (section 4) and `../algs/SPEC.md` (routes under `#/drills/algs`). The review's own routes are new.

### 12b.1 Routes

Review (new):

| Route | What |
|---|---|
| `#/review/<at>` | the review of the solve whose `record.at` is `<at>`; query `move=<i>` (1-based), `moment=<n>`, `view=time\|moves`, `notation=held\|cube` |
| `#/review/<at>/retry?move=<i>` | the retry flow for a moment (section 11) |
| `#/review/import` | paste or file import (section 12); the parser is shared with `#/drills/algs/import` |

Drill links from the review (every one carries `from=review:<at>:<move>`; the existing Brain results use `from=brain:<at>`):

| Tappable thing (where it appears) | Route | Query |
|---|---|---|
| A PLL case name (coach line, move list tag, results line, accuracy card) | `#/drills/pll` | `mode=mix`, `cases=Aa,Ab,E` (the case and its look-alikes), `round=20` |
| "Extra AUF" | `#/drills/pll` | `mode=transfer` (random AUF, exists today), `cases=<case>` |
| A slow recognition | `#/drills/pll` | `mode=mix`, `cases=<case>`, `glance=300` (the glance setting exists today) |
| The alg you used, or a mid-alg pause | `#/drills/algs/pll/<case>` (case ids are lowercase in the algs spec; accept either case) and `#/drills/algs/pll/<case>/drill?alg=<id>&mode=repeat` | `<id>` only when the moves match an alg in the database; otherwise the case page |
| An OLL case or 2-look shape (v3) | `#/drills/oll` (reserved in the trainers README) | `cases=<id>`. Until that drill exists: `#/drills/algs/oll/<id>` if the algs database has the set, otherwise the label is plain text |
| The cross segment, Detour, Better cross, Missed X-cross, X-cross | `#/drills/scout` | `scramble=<moves>` (existing), plus new `face=D` (or `face=all`) and `kind=cross\|xcross\|xxcross`. The scramble is this solve's |
| An F2L pair label (Better pair, pair waste, Pseudo pair) | `#/drills/f2l` | `drill=planner`, `setup=<moves from solved>` (the position at the start of that pair), `face=D`, `pseudo=1` when the pair was pseudo. **New:** the planner drill must accept a real position; today it builds cases from seeds (`createF2LCase`). A small adapter around `plannerChoices({state, solvedPairs})` |
| A pause between pairs | `#/drills/f2l` | `drill=scan`, `round=30s`, `pseudo=1` if you use it (the timed scan exists) |
| Flow (positive) | none | plain label |
| A skip | none | plain label (nothing to drill) |
| Rotation, Cancel, Stray offset | none | plain label with its tooltip: no drill trains it yet |
| A pause that is about not stopping at all (lookahead) | `#/drills/lookahead` | **Proposed small new drill:** `setup=<moves>` or `scramble=<moves>`, `pace=<tps>`: solve a scramble (cube or virtual pad) against a metronome at your own median speed and get flagged on any stop longer than the allowance |
| Retry this moment | `#/review/<at>/retry?move=<i>` | not a drill; stays the exact-moment tool |
| A stage accuracy card | the stage's default drill | cross → scout, F2L → f2l, LL → pll (the mapping in the trainers README section 5) |

Rules:

- A label is a link only when the destination exists and can be set to exactly that thing; otherwise it is plain text. The affordance never lies.
- Move strings in a query use `_` for space and `-` for prime (`F-_D-_F`, the same convention as the alg.cubing.net links the importer reads); the decoder also accepts spaces and `'`.
- A position late in a solve can make the URL long. `setup=` may instead be `setup=review:<at>:<move>`, resolved locally from the stored solve (works on this device; an early position uses the literal moves and is portable).
- Validation: case ids are checked against the local tables, scrambles go through `parseScramble` (at most 200 moves), unknown parameters are ignored (forward compatible), and a bad link opens the drills hub with a toast.
- Previews come from the drill registry: each drill exports a pure `describeLink(params) -> {title, cases, minutes, trains}` (PLL: 20 cases is about 2 min; F2L: a 30 s scan is 0.5 min; Scout: open). The review adds the `why` from this solve. Both are offline.

### 12b.2 The affordance

- **Orbit:** linked words get a 1.2 px dotted underline in the accent colour, 4 px below the baseline. Hover or focus turns the text accent and shows a `›`. Mono: the same, dashed, amber.
- **Preview:** hover (250 ms) on desktop, first tap on a phone (a bottom sheet). The popover says what you would get ("Drill Aa · 20 cases · Aa, Ab, E · about 2 min"), why (from this solve: "1.05 s mid-alg, your PLL median is 0.62 s"), and has Start drill and Alg page. A second tap, Enter, or Start drill goes. Frame `R-dark-08`.
- **Keyboard:** Tab walks the linked labels in reading order; `d` opens the preview of the focused or selected label; Enter starts; Esc closes. Screen readers get "Drill Aa, 20 cases, about 2 minutes".
- Badge icons are not links (they open the move tooltip); the label text is. Labels in the results screen link the same way (case names, pair slots, "cross").

### 12b.3 The way back

- The drill shows the pill `← review · solve 23 · move 53` (top bar, right) and the key `b`; its results screen has a "back to review" button. Frame `R-dark-09`.
- The review reopens at the same move with the same selection and scroll; the label carries a chip with the result ("drilled Aa: 20 cases, median 1.1 s"). Data path: each round is stored with its `from` in `cubesight-rounds-v1` (trainers README section 8); the review reads it.
- The return never depends on history state: `from=review:<at>:<move>` is enough to rebuild the route, so a reload in a drill still has a working pill.

---

## 13. Per-solve data and storage

New fields on the solve record (all raw; the review is derived):

| Field | Type | Notes |
|---|---|---|
| `solveMoves` | full list (drop `slice(-200)`) | canonical |
| `moveTimes` | ms delta per move, integers in 10 ms units (Uint16) | time of the last quarter of a double; prefer cube timestamps |
| `orient` | sparse `[i, bottom, front]` on change | only when a gyro was live; `gyro:boolean` |
| `marks` | `{crossIdx, pairIdx[4], pairFrame[4], eoIdx, coIdx, ollIdx, solvedIdx}` | from `segmentSolve` |
| `skips` | `[{stage, kind}]` | already produced live |
| `pseudo` | not stored as a setting; `pairFrame` carries it | |
| `ll` | `{oll, pll}` look settings | |
| `engine` | integer | review cache key |

Measured sizes (sample record with 68 moves, `_src` estimate): the existing record is about **864 B** of JSON; the new raw review inputs add about **321 B** (moveTimes as a number array, marks, orientation); so about **1.2 KB per solve**, **1.2 MB** at the existing cap of 1000 solves (the store is `localStorage`, about 5 MB). The derived review (labels, LU, accuracy, key moments, alternatives) is about **650 B**; store it in IndexedDB keyed by `(record.at, engine)`, not in `localStorage`. Imports are stored as solves with `source:'import'` without times, and count in the same cap.

Recorder note: `recorder.js` already captures every MOVE event with its `cubeTimestamp`, but it is a ring buffer of the last 100k entries and is not durable per solve; the record above is the durable copy.

---

## 14. Phased plan

**Phase 0: foundations (small, no UI).**
- Capture `moveTimes`, `orient`, marks and the full `solveMoves` in `solve-live.finishSolve`; add a schema version.
- Extract `segmentSolve` (pure) from `onSolveMove`; frame-aware, pseudo always on; `eoSolved`/`coSolved` directly; cross-on-D normalisation; cross-face inference.
- `cancelWaste`, `solveBatch` on the worker, `review-analysis.js` (pure) with an injected solver.

**v1: cross, pauses, cancellations, skips (plus import).**
- Labels: Optimal, Extra move, Detour, Cancel, Pause, Slow recog (boundary gaps only), Flow, Skip, Free pair, X-cross, Rotation (gyro), Better cross, Missed X-cross.
- Accuracy: cross exact; F2L and LL use defaults for `ref`, so they are flagged "flow" numbers (moves-only terms plus pauses).
- UI: the review screen, graph, move list, key moments, coach bubble, step controls, show best move, accuracy summary, results entry.
- Retry for cross moments (short setup), both with a cube and virtual.
- Import of a pasted reconstruction and review of legacy records (no timing).
- Exit criteria: golden solves in section 15 pass; a full review in ≤ 1.5 s warm.

**v2: F2L pair choice.**
- Pair options and waste for pairs 1 and 2 (existing solver), pair 3 and 4 with the new pair solver; Better pair, pair waste, Clean/Efficient; pseudo frames and labels (section 8); per-move losses in pairs; real F2L accuracy.
- Retry for any pair moment.

**v3: last layer.**
- PLL recognition time and execution TPS (timing), PLL case, best AUF, Extra AUF, 2-look reference; 2-look OLL shapes; OLL case table and alg alternatives (new data); `y` rotations (front sample); personal baselines per boundary; inferred labels (Regrip, Lockup).

Dependencies: v1 needs Phase 0 only; v2 needs the pair solver (or the interim filter); v3 needs alg data.

---

## 15. Test strategy

Everything runs in Node with `node --test tests/review-*-unit.test.mjs` (the real WASM runs in Node, verified). Golden solves live as JSON (`tests/review-golden/*.json`: scramble, moves, optional moveTimes/orient, expected per-move labels, stage LU, accuracy ± 1, key moments).

| # | Golden | Checks |
|---|---|---|
| G1 | Optimal cross | scramble above, `F' D' F R D' F`: all `Optimal`, cross accuracy 100, `Σloss = 0` |
| G2 | The mock solve's cross | `F' D' F D B D' R D'`: `d = 6 5 4 3 4 3 2 1 0`, losses `0 0 0 2 0 0 0 0`, move 4 Detour, best continuation `R D' F`, accuracy 80, `Σloss = n − d0` |
| G3 | Better cross | same scramble, cross on D (6) while B is 4 → Better cross only when colour neutral |
| G4 | X-cross | cross with a pair attached: cross distance not penalised, X-cross label |
| G5 | Cancels | `R U R' R' U' F F D L R L'`: waste 1, 1, 2; `R R'` counted once (max with the solver loss) |
| G6 | Pause and Slow recog | synthetic `moveTimes` with a 1.0 s gap at a boundary: LU by the formula; BLE jitter ±40 ms does not flip labels |
| G7 | Skips | existing `solve-live-unit` skip cases (EO, CO, OLL, PLL, f2l) reused |
| G8 | Pair choice | after the mock cross: FR chosen in 7 vs BL pseudo 5 → Better pair, LU 1 |
| G9 | Pseudo | section 8.4 cases 1–8 |
| G10 | No gyro | no Rotation labels, rotation term dropped, cross face inferred correctly for a colour-neutral solve |
| G11 | Legacy record | `solveMoves` and `scrambleTurns` only: move labels work, no time labels, no crash |
| G12 | Import | parser: the 300-random-algorithm check from `_src/proto-import.mjs` becomes a unit test; plus `alg.cubing.net` URL decode; a reconstruction with rotations and wide moves solves the cube |
| G13 | PLL AUF | `_src/proto.mjs` cases (T, Aa, Ua, Jb): best AUF cost 1,1,1,0 |
| G14 | Timeouts | force `timeoutMs = 1` on a hard pair query: no negative label from an unproven bound |
| G15 | Retry grading | prefix + attempt grades match the original engine on the same moves |

Property and metamorphic tests: `Σloss_i = n − d_0` for any cross; determinism; rotating the whole scramble and solution by `y` (relabel) leaves labels unchanged; adding a cancelling pair adds exactly its waste; `accuracy` is monotone in LU; the review engine is pure given the injected solver.

UI tests (Playwright): review opens from results; step keys; key moment jump; retry setup progress; mobile layout; screenshot comparison against the frames.

---

## 16. Open questions for the user

1. **Naming scheme**: A (Cuber's words), B (Coach voice), or C (Par)? Mixed?
2. **Do pauses count in accuracy** (the recommended LU conversion) or should accuracy be moves only with time shown separately?
3. **Ergonomic weights** for choosing the "cheapest pair" (F/B = 5 from the planner) or plain move count? Recommended: weights for *choice*, plain moves for *accuracy*.
4. **Pseudo suggestions**: `if-you-use-it` (default), `always`, or `never`?
5. **Colour neutral**: is "Better cross" on for everyone or only colour-neutral users (asked once, or inferred)?
6. **Retry from late moments** means a long setup (scramble plus prefix). Allow it, or restrict to cross and first pairs and offer "from the stage start"?
7. **Show inferred labels** (Regrip, Lockup) at all?
8. **Coach avatar**: a small cube-face character (mocked) or text only?
9. **Accuracy wording**: "accuracy", "efficiency", or "par score"; and the tier words in 5.4.
10. **Personal baselines**: compare pauses to your own history (recommended from 10 solves) or fixed allowances only?
11. **Imports**: which sources to prioritise (pasted text first; links later)? Are stored imports allowed to affect stats (recommended: no, review only)?
12. **Gyro drag**: the held face comes from the 3D view, which can also be dragged by hand. Accept the false rotations, or ignore rotation labels unless the gyro stream was live?
13. **Storage**: move solve history to IndexedDB now (recommended) or keep `localStorage` until ~1.5 MB?
14. **Missing drills**: there is no OLL drill and no lookahead drill; the links to them are reserved or proposed (12b.1). Build the lookahead drill (a pacing metronome) or leave pause labels unlinked?
15. **F2L from a real position**: the F2L planner drill needs a `setup=` adapter (12b.1). Acceptable scope for v2?
16. **One parser**: share the reconstruction parser with the algorithm database import (`#/drills/algs/import`), so pasting works the same in both places?

---

## 17. Mockups (this folder)

Orbit dark (primary), one Mono dark, one mobile. Rendered with Playwright from `_src/gen.mjs`; fonts embedded.

| File | Shows |
|---|---|
| `R-dark-00-badges` | The badge system and label set |
| `R-dark-01-results` | Results screen with accuracy and the "Review solve" entry |
| `R-dark-02-review` | Review screen: 3D cube with best-move arrow, move list with badges, solve graph with pauses, coach bubble, key moments, step controls, retry |
| `R-dark-03-tooltip` | Hover tooltip on a move |
| `R-dark-04-retry` | Retry this moment: set up, try again, re-graded |
| `R-dark-05-accuracy` | Per-stage accuracy summary (cross 80, F2L 75, LL 94, overall 83) |
| `R-dark-06-mobile` | Mobile review, key moments and retry |
| `R-dark-07-import` | Paste a reconstruction, then review |
| `R-dark-08-drill-link` | Tap a label (Aa): the drill preview popover with why, route, Start drill, Alg page |
| `R-dark-09-drill-return` | The drill opened from the review, with the `← review` pill and `b` |
| `R-mono-dark-02-review` | The review screen in Mono dark |

Data in the mockups: the cross (moves, distances, losses, best continuation) and the pair options are computed by the real engine (`_src/golden-mock.json`). Later-stage moves, times, pauses, the rotation and the pseudo pair 3 are illustrative.

Prototype scripts (run with Node from the repo root): `_src/proto.mjs` (solver evaluation, planner, pseudo trace, AUF, cancels, timings), `_src/proto-import.mjs` (parser and its physical-model check).
