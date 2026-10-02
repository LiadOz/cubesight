---
id: widgets-lists-data
title: "Lists and data: list rows with the mini Orbit (W-11), stat blocks (W-19), badges and tags (W-18), empty states (W-25), eyebrows and section heads (W-30)"
date: 2026-10-02
branch: widgets
parent: widget-inventory
status: exploring
author: widget design agent
decision: pending user choice
images: [L-00-compare-parts.png]
---
**What this is.** Five registry families designed together, because every list page is made of the same few parts. List rows carry the **mini Orbit glyph at the left** (feedback #2: browsing uses the mini ring, with its labels to the SIDE, never around it). Built as real HTML/CSS with the real tokens and the approved widgets (quiet-fill buttons, ink selection controls, bevelled keycaps, W-16, W-21 rules), in the A-07 history frame, an algs case list, a drill's case list, progress, empty states and a phone. Nothing in `src/` changed. Every image is dark above, light below.

**The glyph.** One arc per item, 40 px (36 on a phone, 80 for a session count). History rows: one arc per stage (teal good, amber to fix, a small dot where a marker is). Alg rows: one arc per move with a wider gap between triggers (a section is only more space, as in the approved W-21). Drill rows: the last 8 answers (teal fast, amber slow or missed, a dim arc for not seen yet). Progress: the last 10 rounds, or the solves of a day. Only the Orbit and numbers show progress; no bars and no sparklines.

**The three options** (L-00 puts the parts side by side; the digit after L- is the option):

- **Option 1, open rows** (L-11 to L-17): the A-07 look. Rows have no frame; only the selected row has a soft fill. Tags are text with a symbol (a spark or a ring); only PB and the status words (due, learned) are tinted pills. Stats are frameless numbers; the section head is a mono eyebrow with the count at the right; the empty state is a dashed empty mini Orbit with one teal dot, centred.
- **Option 2, banded rows** (L-21 to L-27): every row is a soft block, the selected one is lifted with a 1.5 px edge; every tag and badge is a pill; stats are soft tiles; the count in the head is a small pill; the empty state sits in a soft panel.
- **Option 3, hairline list** (L-31 to L-37): rows are cut by hairlines, the selected row turns its time teal and shows "open ›"; tags are text, PB and status are outlines; stats read as one line of text; the section head runs a hairline to its count; the empty state is text only under a rule.

**Contexts per option:** 1 the five parts (kit), 2 history with sessions and solves (A-07, with the session ring, stats and the selected solve beside the Orbit), 3 the algs case list, 4 a drill's stats and case list (A-08 counters), 5 progress (stat blocks and two lists), 6 empty states (empty history, empty pins, no cases due), 7 phone 390 x 844 (history, algs, empty pins).

**Notes.**

- The empty states follow VOICE: one sentence ending with a full stop, one hint, one action with the same verb as the button. The action is a primary only when nothing else on the page is useful (empty history).
- Alg glyphs with many moves (17) become fine dashes at 40 px; the section gaps remain visible, but this is the limit of the glyph. A text count ("17 moves") always sits beside it.
- Every alg shown is marked verified (only proven algorithms are shown as facts).
- Sample data is for the mockup only.

**Questions for you.**

1. Which skin: 1 open rows (the A-07 look), 2 banded rows, 3 hairline list?
2. Tags (W-18): text with a symbol (option 1, quiet) or pills (option 2)? In option 1, are PB and status pills enough tint?
3. Stat blocks (W-19): frameless numbers (option 1), tiles (option 2) or one line of text (option 3), for the session stats, the drill counters and the progress row?
4. Is the 40 px glyph at the left of every row right, or should rows without a natural ring (e.g. the algs list) have none?
5. Algs glyph: one arc per move with trigger gaps (as drawn), or a small picture of the case instead?
6. Section head (W-30): eyebrow with the count at the right (1), count as a pill (2), or an eyebrow with a hairline to the count (3)?
7. Empty state: a dashed empty mini Orbit with the sentence (1 and 2) or text only (3)? Is the one teal dot (where the first arc will start) a good touch?
8. Selected row: soft fill (1), lifted block (2), or teal time with "open ›" (3)?

Prototype: `proto/lists.html?view=compare|kit|history|algs|drill|progress|empty|phone&opt=1|2|3&theme=dark|light`; render with `node scripts/widget-proposal-shots.mjs lists`.
