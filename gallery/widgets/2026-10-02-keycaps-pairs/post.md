---
id: widgets-W-17-keycap-pairs
title: "W-17 Keycap pairs: four ways to write a combined key on the bevelled cap"
date: 2026-10-02
branch: widgets
parent: widgets-W-17-keycaps
status: exploring
author: widget design agent
decision: pending user choice (the bevelled keycap is approved; only keyboard keys are bevelled; combined keys need more examples before a decision)
---
**Settled.** The keycap is bevelled (a fill, a hairline edge and a 2 px lip, so it reads as a real key). Nothing that is not a keyboard key may be bevelled. The user asked for more examples of combined keys before deciding.

**The four forms** (every image labels them "form a" to "form d"):

- **form a, one cap:** one cap holds both glyphs: `[ ]`, `1–4`, `← →`, `shift + R`.
- **form b, two caps:** two separate caps side by side, 4 px apart.
- **form c, joined:** two caps joined by a thin 8 px connector.
- **form d, cap – cap:** a cap, a written separator, a cap: `1 – 4` for ranges and `shift + R` for chords. A pair such as `[` `]` has nothing to put between, so in form d it is two caps as in form b.

**Images**

- W-17p-01: all four forms in every context, dark above and light below: the key bar (a pair, a range, arrows, a chord), the key bar with `]` pressed, a secondary button with a pair or a chord inside, and the single space cap in the primary for reference.
- W-17p-11 to W-17p-14: one image per form in real contexts: the bottom of the results screen (A-05) with the key bar and the primary, the bottom of a drill (A-08) where the bar says 1–4 and the answers carry no cap of their own, the help shortcut list, and three buttons with a combined key inside, plus the pressed state.
- W-17p-21: what is not a key stays flat, dark and light: chips, badges, tags, buttons and the toast next to keycaps, with the forbidden bevelled look drawn beside them.

**What the examples show.** Form a is the narrowest and reads as one key, which is wrong for `shift + R` (two keys) and hides which half of `[ ]` is held. Form b is the most literal but a range as `1` `4` is ambiguous. Form c says "go together" but the same connector would mean a pair, a range and a chord. Form d is the clearest for ranges and chords and the widest. Pressed: only forms b to d can sink just the half that is down. In buttons the two-cap forms make the button about 28 px wider than form a; form d about 44 px.

**Questions for you.**

1. Which form for a pair such as `[ ]` and `← →`: a, b or c?
2. Which form for a range `1–4`: a (one cap) or d (cap – cap)?
3. Which form for a chord `shift + R`: a, b or d (with the plus)?
4. Should one form be used for all three kinds, or the best form per kind?
5. When `[` or `]` is pressed, must only that half sink (rules out form a)?
6. On the drill, should the answers carry their own number caps (A-08) or should the bar say `1–4 answers` as drawn here?
7. In dark the lip is hard to see (it is the cube-body colour on the page colour); in light it is strong. Do you want a lighter lip in dark?
8. Are the badges, tags and chips next to keys (W-17p-21) clear enough as not-keys?

Prototype: `proto/pairs.html?view=matrix|a|b|c|d|notkeys`; render with `node scripts/widget-proposal-shots.mjs pairs`. The shared kit of approved widgets is `gallery/widgets/_proto/approved.css`.
