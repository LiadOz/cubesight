# Orbit v3: the orbit around the cube is the whole site

Design only. Nothing under `src/`, `tests/` or config was touched. Open `index.html` for the gallery. Every frame is an SVG with its fonts embedded (Manrope and DM Mono, as in `docs/design/brain-v2/tokens.md`) and a PNG render next to it. Orbit-dark is the only style; Mono and light are ignored. The generator is in `_src/` (`node gen.mjs && node render.mjs`).

## 1. What the app does today (studied by running it)

Run at 1440×900, dark, fake GAN cube driving a full solve (the `tests/helpers/fake-brain.js` harness).

| screen | what I saw | the problem |
|---|---|---|
| solve, idle | ring 330 px across, cube about 210 px tall (23 % of the viewport), a settings strip above, the clock to the right | the cube is small and the ring labels (`~2.42`) read as chrome |
| guided scramble | the scramble is a strip of move chips to the right of the cube; the cube shows a lit face | the strip is a second, separate representation of the same scramble |
| solving | ring labels, plus a stage table (`cross 1.50 −1.52 …`) next to the clock, plus coach text | the splits are already on the ring and are repeated beside it |
| results | the page is about 1800 px tall. Splits appear **four times**: ring labels, a left table, split bars, and stage bands on a TPS chart. Then coach card, chip strip, session stats, recent list, 7 key hints | the finish is a dashboard, not a finish |
| history | a heading, four filter controls, a text list (`12.00 · 21 sep · 17:13 · flow · cube`), a tiny cube and a slider | no overview, no sense of how a solve went |
| timer | a bordered card with the scramble chip strip, a cube, transport buttons, then digits | a different layout from the solve screen |
| algs, drills, progress | a ring with `group 1…4` labels; a bordered round panel; stat cards | each page invents its own component |

The brain-v2 mockups (C-dark) already proved the ring idea; v3 makes it the only graphic.

## 2. The design system: two components, five pieces

Sheets: `00-system-components`, `00-system-pieces`, `00-system-flows`, `00-flow-storyboard`.

**CUBE.** One cube, five sizes: XS 9 (compass), S 30 (glyph centre), M 70 (phone drills), L 130 (phone hero, cards), XL 215 (desktop hero: 430 px tall is 48 % of a 900 px viewport; on a phone the hero is 118). Sources: live (the cube in your hand), case (a drill or alg case, unknown stickers dark), replay (the position at a playhead). Overlays on any source: highlight (pieces outlined, teal focus or amber wrong) and cue (the face to turn lit and the move named beside it).

**ORBIT.** One ring with one API:

```
Orbit({ cx, cy, r, start, sweep,        // sweep 360 (ring) or 290 (dial with a slot)
  segs: [{ key, weight, state,          // future | current | done | skipped | wrong | good | bad
           fill?,                       // 0..1 on the current segment
           label?, value?, delta?,      // outer label rule
           marker?: 'good' | 'bad' }],
  caret?: deg })                        // start tick, playhead, countdown
```

Strokes are the tokens: track 3 px, done 6 px, current 8 px plus a leading dot; 2.5° gaps. Labels are always outside, along the radius, anchored by side (name, value, delta, then a marker line). A marker is a shape plus a colour (spark on teal = good, `!` on amber = to fix), never colour alone. The glyph form for lists is the same ring at r 14, 17 or 44.

**Five pieces** (and nothing else may appear on a frame): header, key bar (at most 3 keys), coach line (one sentence tied to one marker), actions (one primary pill, at most two quiet text actions, the rest behind “more…”), chip (filters, speed).

**Every flow is the same ring** (`00-system-flows`):

| flow | segments | weight | replaces today |
|---|---|---|---|
| guided scramble | the moves | 1 each | the chip strip beside the cube |
| inspection | zones: remaining, +2, DNF | seconds | the separate timer ring and the digits-only countdown |
| solving | the stages | your average (pace map) | split bars, TPS chart, stage rows |
| results | the same stages | seconds you spent | split table, split bars, donut, TPS chart, chip strip, coach card |
| alg playback | the moves, grouped by trigger | 1 each, wide gap between groups | the alg-page ring with `group 1…4` labels and the chip strip |
| drill round | the round's cases | 1 each | the bordered round panel and its stats row |
| manual timer | inspection ring, then the solve | seconds | the bordered card with chips and transport buttons |
| history | sessions as concentric rings; each solve a mini orbit | one tick per solve | select list, separate mini cube, scrub slider |
| progress | the average split per stage over a period | seconds | the "where your time goes" card, stat cards, sparklines |

**One flow, no page swaps** (`00-flow-storyboard`): solving → results → history → a drill → back. The cube and the ring persist and transform; the page does not change.

### What each frame is made of
Only the cube, the orbit and the five pieces. The things in today's app that no frame uses: bordered cards, split tables, split bars, the TPS chart, the donut, the Mono lane, chip strips, select dropdowns, session stat cards, recent-solves lists, a second ring with a different meaning.

## 3. Decisions shared by all three directions

**Duplicates removed.** The ring now carries all stage information once: name, split, delta, and a marker line. Removed: the left split table, the split bars with average ticks, the TPS chart and its stage bands, the donut, the stage chip strip, the "recent" list, the session stat grid, and the two number rows under the clock. TPS survives as one number inside the selected-stage panel (C) or the review. Why: the user said the orbit already shows it more nicely, and a finish screen should be one number, one story and one next step.

**Praise as well as problems.** The coach line is one sentence, praise first, then at most one thing to fix, tied to one marker. Markers come in both tones, in the same positions on the ring: good (optimal X-cross, best pair chosen, pseudo pair, EO or PLL skip, clean cross, no pause) and bad (cross detour, pause, cancelled moves, slow pair). They are the positive and negative labels already defined in `docs/design/brain-v2/review/SPEC.md` (section 3.1); no new analysis is assumed. If there are no markers there is no sentence (no filler). Tap a marker to swap the sentence, and tap again to review it. VOICE.md applies: lowercase labels, `ao5`, `PB`, one prime character `′`, no chess words.

**The finish is calm.** Time (big), the one number it is compared to, the ring, one sentence, and `next scramble · review · more…`. +2, DNF, pin, share, delete and export live behind “more…”. The key bar shows at most three keys.

**Scramble progress is on the ring.** 20 move segments: done (dim), current (teal lozenge with the move readable on the ring and again, big, in the slot), upcoming. A wrong turn turns the current segment amber, shows what you did against what was wanted, and offers the single recovery (`F2`). Frames `02` and `02b` in every direction.

**Praise and negatives in review.** Review of a bad moment shows yours (outer ring) against better (inner ring); review of a good moment shows yours against the usual way (frame C-06, the pseudo pair, 6 moves against 9). Both use the same ring.

**History and the past solve.** Frames `07` (history), `10` (a past solve), `11` (replay) and `12` (phone).

* *Open any past solve* gets the exact results screen again: the same orbit, the same markers, the same sentence. The only differences are chrome: a `‹ history` crumb, `solve 23 of 23 ‹ ›` to step through neighbours, and `replay` as the primary action instead of `next scramble`. Route proposal: `#/history/<id>` (results), `#/history/<id>/replay`, `#/history/<id>/review/<marker>`. Back: `esc` or the crumb, returning to the list with the same row selected and the same scroll.
* *Replay* plays the solve on the 3D cube while the ring fills in real time. The ring is the scrubber: drag to scrub, tap an arc to jump to the start of that stage, tap a marker to jump to it and open its review; the transport is a play/pause button, previous/next marker, and speed chips (0.5×, 1×, 2×). Keys: `space`, `‹ ›` to step a move, `[ ]` for markers, `esc` back to results. Upcoming markers show as hollow dots and fill in as the playhead passes them.
* *Data dependency, to decide:* the review SPEC says the record has no per-move times yet (`moveTimes` is promised in the contract but missing) and keeps only the last 200 moves. Replay needs both. Old records can still show results and markers; for them replay falls back to stepping by stage with the ring split (no real-time fill) and says so in one line.
* *History options*, one per direction (any can be used with any direction):
  * **A, timeline by session.** Sessions as a list with a mini orbit per solve (r 17), a session ring and PB/ao12/ao5 at the top, three calm dropdown filters in one row, and a large preview orbit of the selected solve with `open this solve`.
  * **B, calendar heat.** A month grid where every day is a ring (one tick per solve, coloured against that day's average); the selected day fills the rail with its solves as rows.
  * **C, grid of orbit cards.** A grid of solves, each card its own orbit with a tiny cube in the middle, grouped by session; tap a card to open its orbit.
  All three have the same filters (session, focus, source as chips or dropdowns), the same context numbers, and `tap → that solve's orbit`.

**Phone (390 px).** Same ring, with the stage labels reduced to coloured numbers. The cube is 118 (28 % of the screen). One primary pill. The time sits under the ring. Frames `09` (solve and results) and `12` (past solve and replay).

## 4. The three directions

### A. One orbit (a single dial)
**Idea.** One giant cube (215, 48 % of the viewport) inside one open dial of 290°. The 70° gap at the bottom is the one slot for the number that matters in each phase: the ghost `0.00`, the current scramble move, the countdown, the clock, the finished time. Margins are almost empty: a left column holds the one sentence (and the review text), the footer holds the key bar.

**Interaction model.** Focus first. While solving, the header drops to 30 %. Everything is tapped on the ring: arcs, markers. The slot changes content, never position. History is a master-detail list whose preview is the same dial.

**Strengths.** The most distinct and the calmest. The slot rule is easy to build: one text element anchored under the cube. It is the closest to what the user said: nothing but the orbit.
**Risks.** On short viewports the slot runs close to the actions row; words have only the left margin, so long review text is cramped.

### B. Orbit + rail (a full ring plus one thin rail)
**Idea.** A full 360° ring left of centre, and a borderless rail on the right (one hairline, type, no cards). The rail holds exactly what the phase needs: ready and session context; the current move and what is next; the countdown and the cross hint; the clock; the time, the sentence and the actions; yours-versus-better. It is the only place words may live.

**Interaction model.** Tap the ring, read the rail. The rail's content is a single column in a fixed order (kicker, number, sentence, actions, key bar), so every phase has the same rhythm. On the phone the rail becomes the lower third under the ring.

**Strengths.** The safest and the clearest. Text has room, review reads well, the existing layout (cube left, numbers right) maps straight onto it, and the phone version is the same thing turned over.
**Risks.** Less bold: the ring is off-centre, so the cube is not literally the middle of the page.

### C. Orbit as navigation (the ring is the UI)
**Idea.** Two rings. Inside, the stage ring: tap an arc to open that stage on the right (its moves, TPS, and a link to its drill). Outside, a second ring that changes role: at idle it holds the five sections of the site (solve, drills, algs, progress, history) as nodes you tap, so the sections orbit the cube; on results it holds the three actions (`review`, `next scramble`, `more…`); in a drill it holds the four answers; in replay it holds the transport. On every other page it shrinks to a compass in the header (cube XS and five dots).

**Interaction model.** Everything is a node or an arc. Tapping a section node rotates the outer ring so that section is at the top, then the page content changes (the cube and the ring persist). Keys stay as the fast path. Nodes are real links, so they work for keyboard and screen readers (order: sections clockwise from the top).

**Strengths.** The most faithful to "the entire site is the orbit". Discoverable drill-downs: each arc leads to its stage's drill.
**Risks.** It spends about 90 px of radius on the second ring, so the story ring and labels are tighter. The outer nodes need care at small heights. Navigation by ring is less conventional, so it needs the compass and a visible `tap a section` hint at first.

## 5. Motion: one animation at a time

Rules for all directions:
1. At most one animated thing at a time. Ring changes finish before the cube or the text move; markers appear one at a time, 200 ms apart.
2. No CSS transitions while the clock runs. The live arc is driven by the timer every frame. `space` and the cube's first turn never wait for an animation.
3. Every transition is under 320 ms, ease-out `cubic-bezier(.22, 1, .36, 1)`. Reduced motion: 80 ms cross-fades only.

How the ring changes between phases:

| from → to | the ring | then |
|---|---|---|
| idle → scramble | pace-map arcs fade (120 ms); 20 move segments draw in clockwise, 8 ms stagger (160 ms) | the first move lozenge appears; the slot (A), rail (B) or left column (C) swaps to the current move |
| each scramble move | the segment turns done; the next lozenge slides along the ring (120 ms) | a wrong turn: the segment turns amber with a 2-frame shake; the recovery chip fades in |
| scramble → inspection | the last move flashes teal (80 ms); segments thin to the track (200 ms) | the countdown arc sweeps in from the start tick (240 ms) and the pace-map hairline fades in underneath |
| inspection → solving | on the first turn the countdown arc stops and cross-fades into the pace-map arcs (200 ms); the length is conserved | the number cross-fades to `0.00` |
| during solving | no animation except the clock-driven fill; a stage finishing snaps its arc to full, the split rolls in 6 px (120 ms), a marker pops with a small overshoot | one at a time, queued |
| solved → results | hold 250 ms; arcs re-weight from average widths to the time you spent (300 ms); labels fade in with a 24 ms stagger | markers drop in left to right; then the sentence fades in. Nothing else moves |
| results → review a marker | the selected stage's arc expands to the full ring while the others fade (320 ms); its moves become segments; the inner ring (better) draws in (200 ms) | the cube animates to that position (cube only) |
| results ⇄ history | the ring contracts into the glyph of its row (a 320 ms move of one shape); reverse on open | the list fades (A, B) or the card grid (C) |
| any → drill | the ring cross-fades to the 20 case segments (260 ms); each answer recolours the segment | the cube swaps its case (120 ms fade) |
| replay | the fill runs per frame at the chosen speed; scrubbing sets the time directly with no easing | markers fill as the playhead passes them |
| C only: section change | the outer ring rotates until the chosen node is at the top (320 ms) | the inner ring changes meaning (rules above) |

## 6. Recommendation

**Build B as the shell, and borrow two ideas from the other directions.**

* B is the lowest-risk way to hit every complaint: the cube is 48 % of the viewport, the scramble progress is on the ring, the finish is time, ring, one sentence and three actions, splits exist once, and the rail gives words room (review, history preview, coach) without turning back into cards. Its phone version is the same layout turned over.
* From C, take **tap an arc to open that stage and its drill**, and the **compass** in the header as the compact form of navigation. It delivers "the whole site is the orbit" without giving up a stable text rail or spending 90 px of ring radius on every screen. The outer-ring section nodes can ship later, only on the idle screen, if the compass tests well.
* From A, take the **dial slot** for the phone and for focus mode while solving (the number under the cube), because it keeps the clock and the cube together on a small screen.
* The implementation is mostly the two components in section 2: build `Orbit` and `Cube` once (`brain/charts/arc.js` is the start), retire the donut, split bars, TPS line and chip strip, and let timer, algs, drills, history and progress use the same ring.

## 7. Notes and assumptions

* All frames use one solve: `D2 F2 U′ B2 R2 U2 F2 U′ L2 D′ B′ L′ U F′ R′ D2 R U′ F2 L′`, 14.07 s, 68 moves, ao12 15.03, PB 12.41, splits 2.08 / 1.71 / 1.96 / 1.52 (pseudo) / 2.31 / EO skip / 1.64 / 1.47 / 1.38 (the brain-v2 data). The history list is deterministic sample data. Cube positions are hand-made, not solved from real scrambles.
* The marker list is for design only: cross detour (2 moves lost), best pair chosen (pair 2), pseudo pair (pair 3), pause 0.9 s (pair 4), EO skip. Other glyph tags in history use the review SPEC labels (optimal x-cross, PLL skip, clean cross, cancelled 2 moves, slow pair 4).
* Replay needs recorded per-move times and the full move list (see section 3). Everything stays local, as the offline PWA rule requires; nothing here calls a service.
* Frame counts per direction: 01 idle, 02 scramble, 02b wrong turn, 03 inspection, 04 solving, 05 results, 06 review, 07 history, 08 drill, 09 phone (solve and results), 10 past solve, 11 replay, 12 phone (past solve and replay). Review frames: A and B review a negative marker (yours against better); C reviews a positive marker (yours against the usual way).
