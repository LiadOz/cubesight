---
id: widgets-W-04-buttons
title: "W-04 Buttons: three consolidated designs (23 variants become 3 emphases)"
date: 2026-10-02
branch: widgets
parent: widget-inventory
status: exploring
author: widget design agent
decision: pending user choice
---
**What is there today.** 23 button variants on 21 pages (see the W-04 images in the inventory post). They differ in fill (teal in six of them, cream, dark surface, outline, none), shape (pill, 6 px, 8 px, 12 px), height (25 to 48 px), type (11 to 18 px, weight 400 to 700) and in whether the key hint is inside. The classless ones (reset, start, round presets) drift the most. The look in the A frames is much simpler: **one cream pill with the key inside, then two quiet text actions** (`next scramble · review · more…`), and dark pills with a number key for the drill answers.

**What every option shares (so you only judge the look).**

- Three emphases: **primary** (one per screen), **secondary**, **text** (ink, muted or danger tone), plus an **icon-only** form for close. At most 3 actions per screen; the answer set of a drill is one choice, not four actions.
- Sizes: L 48 (the hero primary), M 40 (default), S 32 (dense desktop rows only). On touch: L 52, M 44, S 40, so every target is at least 40 px. The key hint inside a button is hidden on touch (VOICE 5.1, D7).
- States: default, hover, focus-visible (2 px outline, 3 px off), pressed (a 3 % shrink and a darker fill), disabled (surface fill, faint label), loading (the label becomes "working…" with a 16 px mini ring; the only motion, and it is static under reduced motion). Danger is never a filled red: it is text in the DNF colour with a confirmation step.
- Answer buttons show **correct (teal edge + ✦)** and **wrong (amber edge + !)**, a glyph always accompanying the colour.
- Motion: colour changes in 140 ms with the standard ease, a 90 ms press; nothing else moves.

**The options** (images `W-04-01..05` option 1, `W-04-06..10` option 2, `W-04-11..15` option 3; `W-04-00` compares them):

1. **Quiet fill.** Cream primary pill (A-05 as drawn), secondary = surface-2 pill with a hairline edge, text = no container with a soft fill on hover. Teal is kept for good, on and focus.
2. **Outline.** The same cream primary, but the secondary is an outlined pill with no fill, and text hovers with an underline. Lightest on the page; the answer row in a drill recedes further behind the cube. Weakest affordance for the secondary on a light background.
3. **Teal action.** Teal primary with 12 px corners (the radius token for bars), secondary like option 1, text in teal. Matches today's dominant look (six teal variants) but the accent then means "do this", "good" and "on" at once, and it competes with the good markers and the glow around the cube.

**Trade-offs.** 1 and 2 follow the A frames exactly and keep one meaning per colour. 2 is quieter but a bordered pill is a slightly weaker affordance for the second tier. 3 is more conventional and easier to spot in a dense settings drawer, at the cost of calm and of colour meaning.

**Recommendation: option 1.** It is the A-05 look, keeps teal exclusive to good / on / focus, and the filled secondary stays visible in light mode. Take the underline-on-hover from option 2 only if you find hover fills too busy.

**Questions for you.**

1. Primary colour: cream (options 1 and 2, as in A-05) or teal (option 3)?
2. Secondary: a filled surface pill (1, 3) or an outlined pill (2)?
3. Shape: full pill (1, 2) or 12 px corners (3)? Note the bundled choices; you can mix them (for example a cream primary with 12 px corners).
4. Text buttons: soft fill on hover (1), underline on hover (2), or teal text (3)?
5. Sizes: are L 48 / M 40 / S 32 (touch 52 / 44 / 40) right, or should the hero primary be larger than A-05's 44?
6. The drill answers (W-04-04, -09, -14): filled, outlined or rectangular pills? And is the amber edge + ! for a wrong answer calm enough?
7. Settings drawer (W-04-03, -08, -13): one secondary S button at the end of every row, with a single primary "done" at the bottom. Right, or should rows be tappable and the buttons go away?
8. Loading: "working…" with a spinning mini ring, or just the dimmed label (no motion at all)?

The prototypes are in `proto/` (open `buttons.html?opt=1&view=states`); the keycap inside the buttons here is the flat form that W-17 proposes as option 1.
