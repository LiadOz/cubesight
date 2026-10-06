# Make the screens one-to-one with the approved design

Lead review of `fix/review-design-gaps` (tip `276d69b`), 2026-10-04, by six agents working in
parallel against the running branch at 1440×900, 1920×1080 and 390×844, Orbit dark.

**The user's instruction:** *"I really want to see the thing that you have rendered looks amazing.
Currently, it looks really bad. I want it to look one-to-one."*

## The failure mode, in one sentence

The approved components all exist in the repo; the screens feed them **wrong numbers** and are
missing their **final layer**. Nothing below needs a design decision — the decisions were made and
the values are recoverable from the frames.

This is why successive waves keep landing work that looks approximately right and gets rejected.
Every wave has eyeballed `docs/design/orbit-v3/`. Those frames are SVGs with exact coordinates.

## 0. You are not eyeballing this. Two tools now exist.

1. **`docs/design/orbit-v3/SPEC-A-EXACT.md`** and **`src/ui/design-spec.js`** (branch
   `fleet/design-exact-spec`) — every colour, type style, radius, angle and anchor, extracted
   from the thirteen A-frames by `scripts/extract-design-spec.mjs`. A unit test fails if the
   generated files drift from the SVGs. **Take values from here. Do not measure a PNG by eye.**
2. **`npm run design:diff`** (branch `fleet/design-diff-harness`) — drives the app into each
   frame's state, overlays the approved frame in magenta over the live render in grey, and reports
   differing-pixel % plus the largest offending regions. 15 frames in ~20 s, deterministic.
   Artifacts and an `index.html` grid land in `.agents/artifacts/design-diff/`.

**Baseline to beat: 12.81 % weighted, 14.29 % mean.** Every item below must move that number.
Re-run the harness after each change and quote the before/after in your commit message.

Both branches are cut from `fix/review-design-gaps` and must be merged before this work starts.

## 1. The numbers (from SPEC-A-EXACT; all desktop 1440×900)

| thing | approved | built |
|---|---|---|
| orbit centre | (720, 440) | varies; content column offset +72 px |
| orbit radius | **300** | 235 (`ui/orbit/index.js:79` hardcodes 190 in a 560 viewBox) |
| ring sweep | 215° → 145° clockwise, 290°, gap 70° centred on 180° | gap 70° ✓ |
| segment gaps | 2.5° (2° on A-02, 4° on A-06) | painted over, invisible |
| strokes | track **3**, done **6**, lit **8**, round caps | everything 4 |
| ring idle colour | `#34312b` | `#34312b` ✓ |
| lit colour | `#3dbfad` teal | only on the current segment |
| stage-label radius | **320** (≈20 px outside the ring) | ≈336 (≈101 px outside) |
| move-label radius | **330**, current move a pill at 330 | scattered 40–250 px out |
| cube | **372.4 × 430**, centred exactly on the orbit centre, **0.478 of canvas height** | 524 canvas, low and right, bursts the ring |
| shadow | ellipse (720, 612) 167.7 × 21.5, `#000` @ .35 | absent |
| glow | ellipse (720, 659.3) 290.25 × 64.5 | absent |

Palette tokens: `bg #141311`, `sheet #0d0c0b`, `ring-idle #34312b`, `text-faint #6d675c`,
`text-dim #9a9486`, `text-primary #ece6d8`, `teal #3dbfad`, `amber #e6a642`, `coral #ec6b5f`.
Type: **DM Mono** for numbers, notation, labels, keycaps, config and stats (370 texts);
**Manrope** for wordmark, nav, buttons, timer, big move glyph and prose (206 texts).

## 2. The work, in order. Each item moves the diff score.

Ordered by how many differing pixels it removes. Items 1–3 are region #1 of nearly every frame.

### 1. The global offset. `−72 px` on the content column.
The wordmark belongs at **x=48**; the app renders it at x=120, and the whole layout inherits the
shift. Visible as doubled magenta/grey text across the top of every overlay.
**Acceptance:** the A-01 wordmark region (260×29 at 48,23) drops below 100 differing px.

### 2. Orbit geometry. `ui/orbit/index.js:79`
`radius = mini ? 190 : 190` → the ring must render at **r=300** against a 900 px canvas, centred
at (720, 440). Derive from `design-spec.js` `ORBIT`, do not re-hardcode. The label budget currently
eats ~34 % of the SVG box; with labels at radius 320 it needs far less.
**Acceptance:** measured ring radius within 2 px of 300 at 1440×900.

### 3. Label placement. `ui/orbit/index.js:103,199`
`offset: 82` puts labels ≈101 px outside the ring; approved is **≈20 px** (stage) and **30 px**
(moves). `src/ui/orbit/end-labels.js` **does not exist** — a copy lives unused at
`src/brain/styles/orbit/end-labels.js`. Without it, `placeLabels` collision-slides labels off
their own angle into two ragged columns, and returns `hidden:true` for the rest, silently dropping
moves from a long scramble.
**Acceptance:** every label's centre is within 6° of its segment's mid-angle; no label hidden on a
45-move scramble.

### 4. Segment gaps are painted over. `ui/orbit/index.js:204`
A full-sweep `.orbit__track` is drawn under all segments in the same `rgb(52,49,43)` as the future
segments (`orbit.css:5`), so the 2.5° gaps vanish and the halo reads as one uniform circle.
Remove the full-sweep track, or draw it only in `ring-template #2a2823`. Apply the real stroke
ladder: track 3 / done 6 / lit 8, round caps.
**Acceptance:** nine distinct dashes visible at idle, as in A-01.

### 5. The cube. Size, position, shadow, glow.
**372.4 × 430 px, centred on the orbit centre, 0.478 of viewport height.** Add the shadow ellipse
and the `glow` radialGradient; both are specced and neither is implemented. Also: the 3D camera is
a tilted perspective; the frames are a symmetric isometric.
**Acceptance:** cube bounding box within 2 % of spec; its corners ≈110 px clear of the ring.

### 6. Missing regions on the solve screen.
Three blocks of the approved design are simply absent, and a fourth is an unapproved substitute:
- bottom-left `cfop · 2-look · pseudo pairs · wca inspection` + `tab settings` / `esc command`
- bottom-right `ao5 14.62 · ao12 15.03 · pb 12.41` + `23 solves today · history`
- the centred `start [space]` pill
- **the top chip bar is not in any frame** and displaces the config line that is. Remove it.
- stage labels need their second line: `p1` over `~1.88`, the user's own pace estimate. The app
  renders `pair 1` with nothing under it. The data exists.
- stray `cue` and `stop` strings are leaking onto the canvas as visible text.
- `move N of M` renders **three times** (ring, left rail, big glyph). The design shows it once.
- the left-rail teal paragraph ("Turn the left face (orange center) 180°…") is not in the design;
  A-02 has `top face, clockwise` centred under the glyph.
- the big move glyph is cream; approved is teal `#3dbfad`.

### 7. W-21 scramble and undo. `brain/styles/orbit/solve-orbit.js`
The move model is correct; the rendering is not.
- **No teal pill on the current segment**, and no lit 8 px teal arc behind it. This is the single
  most recognisable element of A-02.
- **Sections are not spacing.** The undo is flagged `sectionStart` (`:21`) but renders as a ~20 px
  coral sliver touching the current segment. Approved: a **14°** gap each side (same-run moves sit
  2.4° apart), amber, with a return arrow, and the wrong move kept visible as an amber `!` token.
- **No rolling window.** A 45-move scramble draws all 45 labels as dense columns. Approved: a
  22-label window following the current move, fanned over three radii, with `‹ 15` / `8 ›` counts.
- **Phone undo is wrong.** It renders as a teal boxed chip on its own row below the sequence
  (`brain/shell.js:102-104`, `orbit.css:200`) — teal reads as *current*. Approved: an amber spaced
  section **inline** in the wrapped sequence, with the planned move marked after it.
- no dim-done / bright-upcoming contrast; all labels are the same grey.

### 8. The coach connector takes a 990 px detour. `ui/shared/index.js:109-142`
`createCoachLine` anchors at `sentenceBox.right`, but the sentence is a full-width `<p>`, so that
is the **panel edge**, not the end of the text. It then detects the cube in the path and switches
to an orthogonal route instead of the approved Bézier. Measured on `#/history/<at>` at 1440×900:
starts (1259,565) → down 157 px → **left 990 px** → up to (269,639), crossing the key hints and
the "20" marker. It reaches the right marker; it just goes the long way round.
Also: **three connectors are mounted at once**, two of them dead.
**Acceptance:** anchor to the text's own inline box; the connector stays a short dotted curve and
never crosses another label. One connector in the DOM.

### 9. Markers cluster instead of fanning out. `ui/orbit/geometry.js` `clusterMarkers`
Threshold 5° merges anything nearby: one badge on the ring swallowed **20 markers**. The approved
behaviour (W-20, TC-00 Q3 B) is that a crowded ring **fans markers out onto a second radius**.
Grep finds no fan-out code anywhere — it was never built.
**Acceptance:** with 20 markers in one arc, all are individually visible and hittable.

### 10. Results segments are never coloured. `brain/styles/orbit/solve-orbit.js:60`
States are only `done` / `skipped` / `current`; `good` and `bad` are never emitted, though
`orbit.css:10-11` defines `.is-good` and `.is-bad`. A-05 has teal and amber segments. Labels also
need name + value + delta + tag (`cross 2.08 −0.33`, `✦ pseudo pair`, `○ pause 0.9 s`); the app
shows `pair 1 / with cross`.

### 11. The cube is tiny on history and *shrinks* as the screen grows.
`history/history.css:43` caps the stage at ~470 px and `:47` sets the cube to 38 % × 44 % of it.

| view | 1440×900 | 1920×1080 | approved |
|---|---|---|---|
| history, selected | 23 % vh | 23 % | ~45–50 % |
| past solve / replay | 24 % | **20 %** | |
| stage review | 21 % | **17 %** | |

The page container is also capped at ~1120 px, leaving **400 px dead on each side at 1920**, plus a
90–100 px dead band under the filters row. The user: *"Why am I seeing such a small cube? I have so
much space left in my app."*

### 12. `#/review/<at>` is a legacy page and the source of the overflow.
`src/review/index.js:209-220`, `brain/css/review-screen.css:5-8`.
- **`document.scrollWidth = 5370` at a 1440 viewport.** `.sequence-player`
  (`moves/sequence-player.css:1`) has no width bound; a 95-move solve runs ~4000 px off screen and
  pressing → scrolls the whole page sideways. **This is the overflow the user reported and I
  previously could not reproduce.**
- No Orbit, no coach line, no connector. A 308 px cube in a bordered card with a black blob and
  "group 1..4" labels. Score tiles (Cross 51 % / F2L 43 % / Overall 60 %) show progress **without
  the ring**, which the spec forbids. The nav highlights "solve". It scrolls vertically too.
- It is a **second review screen**: history links to `/history/<at>/review/<marker>` instead.
  Decide which survives and delete the other.
- Chess phrasing to replace with cubing vocabulary: "reveal best move", "Suggested continuation",
  "Optimal · cross planning", "Retry this moment". 20 of 29 key-moment chips are a bare
  `move N · Cancel` with no sentence.

### 13. Highlighting exists and almost nothing uses it.
`ui/cube/index.js:111` `highlight({pieces, slot, dimOthers})` works. `cube-3d.js:561-641` applies
cages, border and dimming **only when `interactionMode === 'scout'`**, so any cube created in
`corner` mode ignores it silently (`pll-trainer.js:160`).

| surface | status |
|---|---|
| demo page | implemented and visible |
| algs case page | highlights but never dims (`algs/page.js:225` passes no `dimOthers`) |
| Cross Scout | implemented, behind a toggle, off by default |
| review moments, `#/review/<at>`, history detail, replay, pins | **absent** |
| all drills (OLL, lookahead, cross planning, corners) | **absent** |

Required by `REVIEW-NEXT-2.md:23` item 7 and `SPEC-FLEET.md:107`: F2L case → its corner + edge +
the target slot; cross → the 4 cross edges; X-cross → cross edges + the pair; and the rest dimmed.
No derivation logic for "cross edges" or "last layer" exists outside Cross Scout.
`tests/ui-foundation.spec.js:244` calls `highlight()` directly, so the gate passes with no screen
using it — **add an assertion that a real screen dims the right cubies.**

### 14. Replay. `history/index.js`
Controls overprint ("‹ past solve" / "more…" under "next marker ›"). The time wraps to two lines
inside the ring. **The ring shows no fill and no markers while stepping**, though SPEC F2 says the
ring *is* the scrubber. Does not use the lists widget.

### 15. Legacy ring duplicates still in the tree.
`brain/styles/orbit/timeline-ring.js` (302 lines) and `inspection-ring.js` (222 lines) draw rings
via `brain/charts/arc.js`, a duplicate of `geometry.js` + `placeLabels`. `moves/sequence-player.js:4`
still imports `createRingTimeline`, so **alg and drill playback use the legacy ring**. Also legacy
`.b-oring` / `.b-slot` markup in `brain/shell.js:89-90,121`. Migrate to the shared Orbit and delete.
Good news: `#/solve` has no competing ring.

## 3. Decisions (user, 2026-10-04) — these are settled

1. **The frames win over "no footer".** Build the bottom keycap row and the bottom-right stats
   line on every desktop screen. `AGENTS.md`'s "no footer" means no site-chrome footer block; it
   does not mean an empty bottom edge. `AGENTS.md` has been reworded to say so.
2. **The timer size ladder is deliberate — implement all six.** 120 idle / 168 inspection /
   128 solving / 124 results / 96 replay / 76 history, weight 300, letter-spacing per the spec.
3. **`#/history/<at>/review/<marker>` survives.** Delete the legacy `src/review/index.js` screen
   (item 12) and rebuild `/review/import` so importing a solve lands you in the history review.
   This removes the 5370 px overflow with it.

## 4. Process

The branch under review carries uncommitted edits to `history/history.css`, `history/index.js`,
`ui/orbit/index.js`, `brain/css/results-orbit.css` and two layout test helpers. Left in place;
whoever picks this up should commit or discard them deliberately.

Nothing here lands on trunk without the F18 merge queue running the gate on the **merged result**.
The last wave fast-forwarded 219 unreviewed commits into the user's trunk and that is how we got here.

**Acceptance for the whole piece:** `npm run design:diff` under 2 % mean, no frame above 4 %;
no horizontal scroll on any route; solve, drills and algs fit the viewport at 1280×720 and above;
the full gate green; one gallery post with the before/after overlays.

## 5. Phone navigation (lead decision, 2026-10-06)

Decided from the frames, which are unambiguous once you look at A-09 and A-12 together.

- **The phone header is ONE row, 72 px**: the `cubesight` wordmark left, the `● GAN 356 i3` cube
  pill right. There is no nav row in any phone frame, in any state. The current 90 px (solve) /
  108 px two-row header is wrong everywhere, not just on solve.
- **Going back is a crumb row** under the header, not a nav bar: A-12 shows `‹ history   23 of 23`
  and `‹ results   replay · 1×`. This is approved navigation ③ ("arrow links with crumbs") with the
  desktop side rail simply absent on phone.
- **Going across** (solve / drills / algs / progress / history) is the **nav drawer**, opened by
  tapping the wordmark. Navigation ③ already establishes the drawer pattern for the cube chip, so
  this adds no new widget. The existing test that requires nav to stay reachable is satisfied by
  the drawer; it must be updated to open the drawer rather than to assert a visible nav row.
- **Contextual actions do the rest** and are already in the frames: `next scramble` as the primary
  pill with `review` / `more…` beneath it, and `replay` on a past solve.

Do not hide and re-show the nav per solve phase. That was a workaround for the 72 px target and it
is not what the frames show.

## 6. Lead decisions, 2026-10-06 (second wave)

**Demo links stay on desktop.** The A-06 frame shows exactly two actions (`better line`,
`retry this moment`) and no demo action, so rebuilding the review moment on the frame dropped
"copy your demo link" / "copy better demo link" from desktop; phone kept them in the legacy detail
panel. `SPEC-FLEET` asks for demo links, and silently losing a feature to match a mock is the wrong
trade. Restore them in the **left rail beside `back to results`**, as quiet text actions in the
same style. The rail is empty below the legend in the frame, so this costs a little diff — accept
it. The frames are the spec for *layout and style*, not an exhaustive inventory of actions.

**The A-08 frame draws an impossible cube; do not match it.** The frame shows a yellow top with
green and red on the two visible side faces and no orange. With yellow up, the side faces run
green → orange → blue → red clockwise, so a (left, right) pair of (green, red) is the mirror image
of a legal cube; the legal pair is (red, green). The app renders orange on the right and is
correct. The frame's OLL case is also not among its own answer pills (21, 27, 31, 33).
**Consequence:** `A-08-drill` has an irreducible diff floor and can never reach ~0 %. Do not
contort the renderer to match it. Regenerate the frame from `docs/design/orbit-v3/_src/` with a
legal cube and a case that matches its pills, then re-baseline.
