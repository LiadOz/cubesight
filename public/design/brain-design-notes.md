# Brain view — design ideas

Three standalone SVG mockups live next to this file:

- `brain-idea-A.svg` — **Cube hero + right rail.** The classic
  "training app" layout: a big cube on the left, a compact vertical rail on
  the right with stacked, labelled sections (Connection · Setup · Phase · Coach · Metrics) and a collapsible
  "Coach settings" at the bottom. The timer lives as a floating chip
  top-right of the cube; the scramble strip is directly under the cube
  in the same stage. A small phone inset shows the cube filling the width with a thumb-reachable Start button.
  **Trade-off:** most structured / scannable; risk of feeling like "a wall of panels"
  unless sections are clearly collapsible. Good default.

- `brain-idea-B.svg` — **Floating HUD chips + slim icon rail + phone bottom tabs.**
  More radical: the cube is huge and centered with minimal chrome —
  a timer chip and a phase chip float directly on the cube stage
  beside the cube, and a slim left rail holds collapsible *drawers*
  (Setup ›, Coach ›, Metrics › Diagnostics) that expand on demand. On phone,
  the rail collapses into a bottom tab bar; the cube fills the screen.
  **Trade-off:** cleanest, most focused; the drawers need clear labels so
  nothing important is hidden. This is my recommendation — it best matches
  "focus on the cube, things to the side, expandable."

### Recommendation
**Idea B**, with one tweak: keep the floating timer/phase chips from B (timer
beside the cube is the user's explicit ask) and the scramble strip under the
  cube from A. So: huge centered cube, a slim expandable left rail (drawers),
  floating live-timer + phase chips beside the cube, scramble strip under the
  cube, and a phone bottom-tab bar. The current implementation is closest to
  Idea A; B is the upgrade target.

### Notes for implementation (from the user's feedback)
- Cube must read BIG and be the visual focus — cap the stage width so the
  shared renderer's fixed camera fills it (otherwise a wide canvas makes the
  cube look small).
- Timer + live turn/TPS + inspection countdown sit beside the cube, not in a
  separate row.
- Scramble cue is part of the cube's component (under it), not a top section.
- Side info is expandable/collapsible, not a fixed wall of equal panels.
- Phone: cube fills width; HUD becomes a swipeable bottom sheet / tab bar; primary
  Start button thumb-reachable.

### Pseudo-F2L definition (confirmed against the user's words)
A pseudo-pair is inserted when an edge goes to its right location **and** a
corner goes to the location relative to the two cross pieces beside it,
with the cross still on the bottom. Implemented in `solve-tracker.js`:
`currentDShift` finds the whole-D offset that brings the cross edges
home, then `solvedPairsPseudo` counts pairs solved in that aligned frame.
A D-rotated solved cube reads as 4 pseudo pairs / 0 standard — unit-tested.

### F2L insertion coaching (follow-up, captured for later)
After a pair insertion, evaluate the state *before* the insertion and
compute the least-move insertion to reach the post-state — flag a
better insertion when one exists. User's heuristic to honour:
- prefer algorithms **without F moves** (U/R/L/D and wide-U);
- F moves **do** count when they orient the final pair or the next
  pair, or are a known neat algorithm;
- "after you complete your previous pair, you then evaluate the next
  pair from the state where the previous one was before it, and calculate
  the least moves to get there."
- corner orientation roughly determines whether an F is avoidable.
This needs the cross/X-cross solver per pair (heavier, worker-based) and is
the next coach-lens to build after the layout is settled.
