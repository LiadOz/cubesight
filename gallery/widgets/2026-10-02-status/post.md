---
id: widgets-W-16-status
title: "W-16 Status lines and toast: three consolidated designs (20 variants become a status line and a toast)"
date: 2026-10-02
branch: widgets
parent: widget-inventory
status: exploring
author: widget design agent
decision: pending user choice
images: [W-16-00-compare-options-hd.png, W-16-01-option1-states-hd.png, W-16-05-option1-phone-hd.png, W-16-06-option2-states-hd.png, W-16-10-option2-phone-hd.png, W-16-11-option3-states-hd.png, W-16-15-option3-phone-hd.png]
---
**What is there today.** 20 variants of one-line text across 11 pages: hint paragraphs at 10 to 21 px (`cp-hint`, `oll-hint`, `lookahead-hint`), mono captions at 9 and 10 px (`cube-caption`, `p@corner-view`), notes at 12 px (`rp-note`, `rp-trend-note`), an amber connect error (`Connection failed: GATT server busy`, exception text on the main line), a 16 px idle line (`b-idle-status`), and a bold 20 px prompt used as a status. Colour is the only tone cue, there is no toast at all, and the position varies per page. The A frames have exactly three kinds of text near the edges: a mono readout under the clock (`−0.96 vs ao12 …`, `case 13 of 20`), the stats line bottom-right (`solve 23 · today 17:33`), and the coach line in the left rail (A-05), which this post does not touch.

**The two components every option shares.**

- **Status line:** one line of text, never a box, 13.5 px, muted by default, with an optional tone glyph and at most one text action. Tones: info (no glyph), live (a dot), working (a 16 px mini ring), good (✦), warn (an amber ring with !), error (a red ring with ×). Only the glyph is coloured; the text stays ink or muted, so tone is never colour alone. It stays while the condition is true. Errors say what did not happen and what to do, with no exception text (VOICE 6.1); sentence case and a full stop.
- **Toast:** a transient confirmation (“Solve saved · 12.41 PB”, “Recording saved”) with at most one text action (“undo”). One at a time, never stacked. 200 ms in (fade and 8 px up), 4 s on screen (6 s with an action), 160 ms out; hover or keyboard focus pauses the clock; esc dismisses. It waits for the orbit to stop moving (one animation at a time) and, under reduced motion, simply appears and disappears. Errors are never toasts: they stay as a status line until fixed.
- Size and touch: the action is a text button, 32 px high on desktop and 44 px on touch; the toast is 40 px high (48 on touch).
- **They must not compete with the coach line:** the coach stays in the left rail, the status and toast use other places, and a toast replaces the status line in its own place rather than adding a third text.

**The options** (`W-16-01..05` option 1, `W-16-06..10` option 2, `W-16-11..15` option 3; `W-16-00` compares them):

1. **Bottom-right slot.** Status line and toast share the slot where A-05 prints the stats line. The toast is a surface pill. Phone: a strip under the header.
2. **Top-right, text only.** Both live under the cube chip, which is where connection state already lives (feedback 14). The toast has no container, so it can never be mistaken for a button or a card. Phone: under the chip, with shorter wording.
3. **Readout line and snackbar.** The status line replaces the readout under the clock while a condition is true; the toast is an inverse (ink fill) snackbar at bottom-left above the key bar, 100 px below the coach line. Loudest and easiest to notice; on results the readout (“vs ao12”) is hidden while an error shows.

**Trade-offs.** 1 is closest to the A frames (the slot already exists) but errors are far from the cube chip. 2 puts every connection message next to its source and leaves the stage empty, but the top-right corner is also where the dev menu and chip menu open. 3 has the strongest presence and is best for a connect failure, at the cost of competing with the hero number and the cream primary.

**Recommendation: option 2.** Messages sit next to the thing they are about (the chip), the cube, the ring and the coach line stay untouched, and a text-only toast cannot read as a button. Use option 1's bottom-right slot only for the page hints (“Start a round when you're ready.”), if you want hints and connection messages apart.

**Questions for you.**

1. Where should messages live: bottom-right (1), top-right under the chip (2), or the readout line plus a bottom-left snackbar (3)?
2. Toast look: a surface pill (1), plain text (2) or an inverse bar (3)?
3. Should page hints (“Pick a face before seeing the plans.”) use the same status line in the same place, or stay next to the thing they explain?
4. Errors stay until fixed (shown). Is that right for “Couldn't connect”, or should they fade to a chip dot after a while?
5. Is 4 s (6 s with undo) right? Should hover pause it?
6. Should “Solve saved” appear on every solve, or only on a PB and on manual saves?
7. The mini ring for “working”: spinning (shown, the one motion on the screen) or a static ring with the words only?
