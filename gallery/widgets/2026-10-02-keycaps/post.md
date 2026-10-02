---
id: widgets-W-17-keycaps
title: "W-17 Keycaps and the key bar: three consolidated designs (8 variants become one cap)"
date: 2026-10-02
branch: widgets
parent: widget-inventory
status: exploring
author: widget design agent
decision: pending user choice
images: [W-17-00-compare-options-hd.png, W-17-01-option1-states-hd.png, W-17-05-option2-states-hd.png, W-17-09-option3-states-hd.png]
---
**What is there today.** 8 `kbd` / key-hint variants on 14 pages: 160 instances of the `b-key` button (cap plus verb), caps inside buttons (`r`, `s`), tiny 9 px answer keys with a blue fill, the `space` inside the start pill, an outlined `enter`, `esc` in the review close. They differ in size (9 to 12 px), radius (4 or 6), fill (dark, blue, none, cream) and edge colour. The A frames use one thing: a small dark cap and one lowercase verb (`space next scramble · [ ] markers · esc back`), at most three, bottom-left, and a cap inside the cream primary.

**What every option shares.**

- One cap, two sizes: **S 20** in the key bar, **M 24** inside buttons. DM Mono 500, 11 px, radius from the key token (6 px). Lowercase and literal (`space`, `esc`, `s`); a **range (`1-4`) and a pair (`[ ]`, `‹ ›`) are one cap**, never two.
- **The key bar** is one row, bottom-left, **at most 3 keys**, cap then one lowercase verb, only the keys that are live now. A key that is temporarily unavailable is dimmed rather than removed, so the bar does not jump. If a button already carries its key (the drill answers), the bar does not repeat it.
- **States:** default, **pressed** (the real key is down; a pair lights only the half that is down), **held** (a hold is arming, for example the timer's space), **unavailable**. Motion is 90 ms, once. Caps are not clickable and are hidden on touch (the button text is the verb), so there is no touch size.
- Dark and light share the tokens; the surface a cap sits on (plain, cream/ink primary, surface secondary) decides its colours.

**The options** (`W-17-01..04` option 1, `W-17-05..08` option 2, `W-17-09..12` option 3; `W-17-00` compares them):

1. **Flat.** A key-colour fill, no edge, as drawn in the A frames. Pressed inverts the cap; held is teal.
2. **Bevel.** A fill with a hairline edge and a 2 px lip, like a real cap; pressed sinks 2 px. Reads most clearly as a key, but heavier, and the only option where a cap moves.
3. **Outline.** No fill, a 1 px edge and muted text; pressed fills with ink. The lightest bar, the closest to the calm of A-05, weakest on the cream primary.

**Recommendation: option 1.** It is the A-frame look, needs no extra weight beside the cube, and its pressed state is a clear colour change. Option 3 is a good fit if you want the bottom bar even quieter.

**Questions for you.**

1. Flat (1), bevel (2) or outline (3)?
2. Pressed feedback: should the cap react when you press the real key (all three do), or is a static hint better?
3. Held (teal) while space arms the timer: show it, or keep the cap unchanged?
4. Unavailable keys: dimmed in place (shown here) or removed from the bar?
5. Should the bar drop a key the buttons already show (the `1-4` on the drill answers), as drawn?
6. Is S 20 / M 24 the right size, given the bar's 13 px verbs?
7. Pairs as one cap (`[ ]`, `‹ ›`): keep, or two caps as today?
