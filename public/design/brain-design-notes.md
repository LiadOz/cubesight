# Brain view — design idea

One standalone, viewable SVG mockup lives next to this file:

- `brain-idea-B.svg` — **Clean isometric cube + floating HUD chips + slim expandable rail + flowing scramble + phone bottom tabs (recommended).** The cube is a proper isometric rhombus + parallelograms (not a broken skewed look); the scramble shows as a **flow** (moves as nodes along a smooth path, current highlighted, completed dimmed, future faint) instead of boxed chips; the timer + live turn/TPS + phase sit as floating chips directly beside the cube; a slim left rail holds collapsible drawers (Setup ›, Coach ›, Metrics ›, Diagnostics); on phone the cube fills the screen and the HUD collapses into a bottom tab bar.

### Recommendation
Build the live Brain toward this mockup. Concretely:
- **Cube hero, big and centered.** Cap the `.brain-cube-stage` width so the shared renderer's fixed camera fills it (a wide canvas otherwise makes the cube look small).
- **Floating chips beside the cube** for the live timer / turn-TPS / phase (not a separate row).
- **Scramble as a flow, not a row of boxed chips**: the moves as nodes along a smooth path with the current move highlighted, completed dimmed, future faint. It's part of the cube's component (under it).
- **Slim expandable side rail** with collapsible drawers, not a wall of equal panels.
- **Phone**: cube fills the width; HUD becomes a swipeable bottom tab bar; primary Start thumb-reachable.

### Pseudo-F2L definition (confirmed against the user's words)
A pseudo-pair is inserted when an edge goes to its right location **and** a corner goes to the location relative to the two cross pieces beside it, with the cross still on the bottom. Implemented in `solve-tracker.js`: `currentDShift` finds the whole-D offset that brings the cross edges home, then `solvedPairsPseudo` counts pairs solved in that aligned frame. A D-rotated solved cube reads as 4 pseudo pairs / 0 standard — unit-tested.

### F2L insertion coaching (follow-up, captured for later)
After a pair insertion, evaluate the state *before* the insertion and compute the least-move insertion to reach the post-state — flag a better insertion when one exists. User's heuristic to honour:
- prefer algorithms **without F moves** (U/R/L/D and wide-U);
- F moves **do** count when they orient the final pair or the next pair, or are a known neat algorithm;
- "after you complete your previous pair, evaluate the next pair from the state where the previous one was before it, and calculate the least moves to get there";
- corner orientation roughly determines whether an F is avoidable.
This needs the cross/X-cross solver per pair (worker-based) and is the next coach lens to build after the layout is settled.

## More ideas (varying the side info — the part that was "still weirding")

- `brain-idea-C.svg` — **No side rail at all.** Everything floats: connection + setup become one slim top hairline bar; the timer and phase are floating chips directly beside the cube; the coach insights sit in a single compact glass card bottom-center; metrics is a tiny corner chip. Zero boxes on the sides. The most radical — pure floating HUD.
- `brain-idea-D.svg` — **One continuous glass rail.** A single tall translucent panel on the right with sections separated only by hairlines (no individual boxed cards) — reads as one surface, not a wall of boxes. Keeps scannability without the "boxy" feel.
- `brain-idea-E.svg` — **Bottom-center pill HUD.** A wide rounded pill docks under the cube holding phase + live counter + coach lines + metrics all inline, separated by hairlines. The sides stay totally empty; on phone it becomes a swipeable bottom sheet. The cube dominates the whole upper area.

Open all four (B, C, D, E) and pick the direction; the differences are mostly about how the side info is presented, not the cube.
