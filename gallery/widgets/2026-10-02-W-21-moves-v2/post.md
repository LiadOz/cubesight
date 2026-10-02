---
id: widgets-W-21-moves-v2
title: "W-21 Move display v2: desktop labels on the Orbit, phone wrapped sequence, a section is only extra space"
date: 2026-10-02
branch: widgets
parent: widgets-W-21-moves
status: chosen
author: widget design agent
decision: "Desktop = option 1 (labels on the Orbit), phone = option 3 (wrapped sequence): two implementations. A section is only MORE SPACE than usual between two points on the Orbit (or two words on the phone): no brackets, no arcs above the curve, no parentheses. On the phone the undo moves form a spaced section. Long scrambles must work."
---
**What the user decided** on the first proposal (widgets-W-21-moves): desktop option 1, phone option 3, and "a section is just something separated by more space than usual; no bracketed sections above the curve". Frames 11 and 15 had brackets and names and were wrong; 12, 13, 16 and 91 were good and are replicated here in the approved style. This post is the revised approved design. Desktop 1440 x 900 and phone 390 x 844, dark, plus one light sheet (W-21v2-99).

**The one rule.** Two moves of the same run sit 2.4 degrees apart on the Orbit. A section boundary (between two trigger groups of an alg, and before and after an undo group) is 14 degrees: the only mark. On the phone the same rule is a 24 px wider space between two words of the wrapped text. A section has no name, bracket, arc or parenthesis; it may even wrap onto the next line, and a section space that falls at the start of a line is dropped.

**Desktop (labels on the Orbit)**

- W-21v2-12 (replaces 12): mid scramble, the A-02 look. (1) labels, (2) the current pill, (3) all 20 readable, (4) the big move.
- W-21v2-13 (replaces 13): a wrong turn; the one undo move is a spaced section (5): a wide gap each side of the amber pill, nothing drawn around it.
- W-21v2-14: two wrong turns give a group of two undo moves, still one section (5, 6).
- W-21v2-15 (replaces 15): the T-perm; the two gaps (3) separate R U R′ U′ | R′ F R2 U′ R′ U′ | R U R′ F′. No bracket, no name.
- W-21v2-16 (replaces 16): a 45-move scramble. A window of 22 labels follows the current move; the ring keeps all 45 segments; neighbouring labels sit closer than their width so they fan out over three radii; ‹ 15 and 8 › count what is outside.
- W-21v2-17: the long scramble with a wrong turn; the undo group is a spaced section inside the window.
- W-21v2-11: the states sheet (token states, buttons, the ring snippets with the gaps marked, how the Orbit grows).

**Phone (wrapped sequence)**

- W-21v2-34: scramble and wrong turn. The undo move is amber with the return arrow and has extra space before and after (4, the planned F′ marked); the wrong turn stays as an amber ! word.
- W-21v2-35: the T-perm as three runs separated by space only, and an undo group of two.
- W-21v2-36: a 45-move scramble at move 5, 23 and 24 (with an undo group): the block rolls by lines, the current line stays near the top, the ends fade.
- W-21v2-31: the states sheet in the wrapped form.

**Mini form and light.** W-21v2-91 is the list-row form (history, algs, review): one line of DM Mono, sections as extra space, `… +8` for long ones. W-21v2-99 is the light sheet: three desktop frames and three phone frames.

**Questions for you.**

1. Is 14 degrees (24 px on the phone) enough to read as a section, or do you want it wider? The two-undo frame (W-21v2-14) is the hardest case.
2. On the phone, is it fine that a section can break across lines (the space marks where it starts), or must a section stay on one line?
3. Is a window of 22 labels right for a long scramble on desktop, with the three-radius fan, or would you rather see fewer, bigger labels?
4. Should the wrong turn itself (the amber ! move) also appear on the desktop ring, as it does on the phone, or stay in the centre text only?
5. Should the alg name of a section ever be shown (it is dropped here), for instance in the help page only?

Prototype: `proto/moves.html?view=states|solve|wrong|wrong2|alg|long|long-wrong|mini|light|p-states|p-solve|p-alg|p-long`; render with `node scripts/widget-proposal-shots.mjs moves2`.
