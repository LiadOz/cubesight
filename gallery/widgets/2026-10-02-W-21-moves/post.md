---
id: widgets-W-21-moves
title: "W-21 Scramble and move display: three ways to pair one move strip with the Orbit (13 variants become 1)"
date: 2026-10-02
branch: widgets
parent: widget-inventory
status: exploring
author: widget design agent
decision: pending user choice
---
**What is there today.** 13 variants on 9 pages (the W-21 images in the inventory post). The main one is `mg-strip` (W-21a, 544 uses): a row of boxed DM Mono tokens with the current one ringed in teal, used for the scramble and for algs. Around it live a second copy (`mg-guide`), a "21 / 21" counter (W-21c), small bordered buttons for review moves (W-21d), plain text lines in history (W-21e), a "move 2 · Cross complete" chip (W-21f), a scramble head and recovery cue (W-21h, W-21j, W-21k) and screen-reader variants. They disagree on box size, border, font size and on how a wrong turn looks, and none is tied to the Orbit.

**What every option shares (so you only judge the layout).** One token model, three presentations, used for scrambles, alg playback, review detours and list rows.

- **States:** done (faint), current (the only teal token), upcoming (full ink), wrong turn (amber, with a ! glyph), undo queued (amber), undo current (amber with a return arrow), disabled (faint). Tokens that are buttons (alg playback, review jump) add hover, pressed and a focus-visible ring (2 px teal, 3 px off, as in W-04). A scramble in progress is read-only and not focusable.
- **Lookahead (feedback #4):** the whole scramble is readable at once up to about 22 to 24 moves; beyond that a rolling window keeps the current move in the left third with faded ends and a count.
- **Sections (feedback #5):** a bigger gap between sections plus a bracket (parentheses in option 3), with an optional name such as "sexy move". The Orbit shows the same gap between its arcs in every option.
- **The Orbit grows (feedback #3):** a wrong turn inserts the undo moves; the ring gets that many more segments and the amber ones show where. The planned move waits, unchanged, after the undo group, and the wrong turn stays visible as an amber ! token.
- **Primes** are drawn as ′ (VOICE); display only. Colour never carries meaning alone: amber always has the return arrow, the ! or the word "undo".
- **Mini form** (W-21-91): one line of DM Mono 13 px with parentheses for sections, the current move a small highlight, long ones cut as `… +8`. It is text-like in all three options so a row can be copied as notation.
- **Progress is only the ring** (feedback #1): no bar or line anywhere; the strip says where the moves are, the ring says how far.

**The options** (images `W-21-11..16` option 1, `W-21-21..26` option 2, `W-21-31..36` option 3; `W-21-01` compares them; `W-21-91` is the mini form). Each option has the states sheet (dark and light), the scramble on desktop (A-02), the wrong turn (A-02b), a phone pair, alg playback with sections (light) and a long 45-move sequence (light).

1. **Labels on the Orbit.** Exactly A-02: every move is a label on the ring, the current one an outlined pill. Nothing is added to the screen. Sections are brackets outside the labels. Past about 24 moves only a window of labels is drawn while the ring keeps all segments. Best fit with the chosen direction, but labels are small, the ring is the only place to read (no copyable text), and on a phone the labels are 15 px and cannot be buttons.
2. **A tape under the cube.** The Orbit carries only arcs; a single row of boxed tokens sits under the cube and rolls. All 20 fit on desktop; on a phone the tape holds about 9 (7 with an undo group), a shorter lookahead. Tokens can be buttons for alg jump; brackets sit under each section. Costs vertical space (the big move shrinks to 72 px) and repeats the position the ring already shows.
3. **A wrapped sequence.** A block of text like the words of a typing test, in the left rail on desktop (the coach-line slot) and under the cube on a phone. Whole scramble readable on a phone too, sections are real parentheses, and the text can be copied. It is the furthest from the cube and takes about 150 px of phone height (smaller cube); it is a block, so it is the most "new" element.

**Trade-offs.** Option 1 is the least new UI and keeps the A-02 look, but it has the lowest density and the weakest touch story. Option 2 is the easiest line to read and the most tappable, at the cost of height and a duplicate of the ring. Option 3 gives the best lookahead on a phone and copyable notation, at the cost of a new block and an eye trip away from the cube.

**Recommendation: option 1 as the default in the solve and alg screens, plus the mini form everywhere in lists.** It is the A-02 and A-02b look the user already chose, adds no widget, and the Orbit grows exactly as feedback #3 asks. Use the tape of option 2 only where tokens must be buttons (alg playback and review jumps), and keep option 3 as the phone fallback if the 15 px labels prove too small on a real device.

**Questions for you.**

1. Should the move strip live **on the ring** (1), **under the cube** (2) or **beside it as text** (3)? Or one on desktop and another on a phone?
2. Is the **lookahead** right: all moves up to about 24, then a rolling window with the current move in the left third? Would you rather see more upcoming than done?
3. **Sections:** a gap plus a bracket (1, 2) or written parentheses (3)? Should names be shown always, only for named sections as here, or never?
4. **Wrong turn:** do you want the wrong move itself to stay visible (amber !) next to the undo moves, or vanish and show only the undo?
5. Is **amber with a return arrow** calm enough for the inserted undo, and is the ring growing by one segment per undo move enough, or should it also flash?
6. **Tokens as buttons** (alg playback, review jump): should every token be clickable (2 and 3), or only the ring labels on the alg page?
7. On a **phone**, is the shorter 9-move tape (2) acceptable, or do you want the whole scramble (1 or 3)?
8. **Mini form** (W-21-91): parentheses in lists for all options, and `… +8` for long ones. Right?
9. The ′ glyph in DM Mono is small at 15 px (see the labels). Keep DM Mono for moves or draw them in the sans font?

The prototypes are in `proto/` (open `moves.html?opt=1&view=states`; views are states, solve, wrong, phone, alg, long, mini and compare). Render with `node scripts/widget-proposal-shots.mjs moves`.
