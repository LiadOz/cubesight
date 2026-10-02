---
id: widgets-system-check
title: "System check: the approved widgets together on the same screens"
date: 2026-10-02
branch: widgets
parent: [widgets-W-21-moves-v2, widgets-W-17-keycap-pairs]
status: exploring
author: widget design agent
decision: pending user review (finding: ink chips and the cream primary can be confused; proposed fix B, a check mark in the selected chip)
---
**What this is.** One stylesheet of the approved set (W-04 quiet-fill buttons, W-05 to W-08 and W-28 ink selection controls, W-17 bevelled keycaps, W-16 bottom-right status and toast, W-21 labels on the Orbit on desktop and the wrapped sequence on a phone) used together on five screens. Every image is dark above and light below. Nothing in `src/` changed.

**Screens, desktop 1440 x 900:** SC-01 solve with a scramble ready and settings open, SC-02 results, SC-03 a drill round, SC-04 history filters, SC-05 alg playback. **Phone 390 x 844:** SC-11 the same five screens in one row.

**Findings**

1. **Confusion risk, ink chip against the cream primary (SC-31).** A selected ink chip is a cream pill with dark text, like the cream primary. In light they are both near-black. What separates them today: height (chip 32 px, primary 48 px; on a phone 40 against 52, full width), weight, and the bevelled key inside the primary on desktop. On a phone the key is hidden, so only size and position separate them. The risk is real where both sit together: the settings drawer, the results screen (chips on the right rail, primary at the bottom) and the alg bar. It is small elsewhere (history and drills have no primary).
2. **Proposed fix, B: a check mark inside the selected chip** (SC-31, column B). A second, non-colour cue for "selected", 14 px wider, keeps the approved cream and the pill; a primary never carries a check. Keep the size gap as a rule: chips 32/40 px, primary 48/52 px, one primary per screen. C (rounded rectangles) breaks the approved pill shape; D (a teal edge) adds a second colour to the ink look.
3. **Segmented controls** (the ink thumb in a track) are not confused with a button because the track says "choice"; the alg bar (SC-05) puts the segmented, a quiet secondary and the primary in one row and still reads.
4. **W-16 slot.** Bottom-right works on every screen. It needs one rule: with a drawer open the slot moves to the left of the drawer (SC-01); on a phone the toast sits above the bottom action zone and status text is one line at the bottom (SC-11).
5. **Keycaps.** The key bar and the cap inside buttons work with the bevel; in dark the lip is faint. The pair `[ ]` is drawn here as two caps (form b) only as a placeholder until the keycap-pairs post is decided.
6. **W-21.** Labels on the Orbit work in SC-01 and SC-05; the mini form works in every history row (SC-04) and in the results header (SC-02); the wrapped sequence works on the phone (SC-11).

**In progress shows the Orbit, never a spinner or a bar:** SC-41 connecting (a closed ring with a bright arc and a fading tail; the status line in the slot; cancel as a quiet button), SC-42 analysing a solve (the stage arcs of the results ring fill in one by one), SC-43 searching for a better pair (one arc per candidate: tried faint, better bright, current thick). Each has a plain status line bottom-right; under reduced motion the arc rests.

**Questions for you.**

1. Do you accept fix B, the check mark in the selected ink chip? If not, C or D?
2. In the settings drawer, should the slot always move left of the drawer, or should toasts appear inside the drawer?
3. On results (SC-02), are the ring toggles on the right rail a good place, or should they live in a drawer?
4. For the Orbit in progress, is a travelling arc with a tail (connecting) and filling arcs (analysing) the right motion language?
5. Should the status line carry an amber dot while working (as drawn), or no dot?
6. In dark, should the keycap lip be lighter so the bevel is visible?
7. Is the phone toast above the primary acceptable, or should it replace the text buttons below the primary?

Prototype: `proto/sys.html?view=d1|d2|d3|d4|d5|phones|confuse|connect|analyse|search`; render with `node scripts/widget-proposal-shots.mjs system`.
