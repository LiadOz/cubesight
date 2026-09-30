# Brain v2 — design directions

Brain is becoming the whole product, and today it "feels like a school hobby
project". These are three complete visual directions for it, inspired by
monkeytype: minimal, dark-first, one accent, big tabular numbers, almost no
chrome, a clean results screen, and one key to go again. None of them reuses
the rejected ideas B–F (cards, glass pill, side rails, floating chips,
dot-timeline).

Open `index.html` for the gallery (it embeds the SVGs; every SVG embeds its
fonts, so they render correctly on their own too). Each `.svg` has a `.png`
render next to it, made with headless Chromium and checked for
clipping and overlap.

## Frames (same set for every direction)

| # | state |
|---|---|
| 01 | Idle / connected: device + battery, 3D cube mirror, one start action, inline config bar |
| 02 | Guided scramble: current move highlighted, done moves dimmed, wrong turn (L instead of L′) with L2 recovery |
| 03 | Inspection: timeline swoops in, WCA 15 s countdown, 8 s / 12 s callouts, optional cross hint |
| 04 | Overtime (WCA): +1, +2… counting, +2 zone 15–17 s, DNF past 17 s |
| 05 | Inspection variants: WCA · custom N s · unlimited · off · count-only · grace · auto-start · callouts |
| 06 | Solving: F2L pair 3 (pseudo pair), segments filling live with splits, big running timer |
| 07 | Solving: EO skip celebrated, now in PLL corners |
| 08 | Results: time, moves, TPS, inspection, TPS chart, split bars vs average, ao5/ao12/PB, history with `+2` / `DNF(x)`, coach, key hints |
| 09 | Mobile / portrait: inspection, solving, results |
| 10 | Settings: config bar + expanded panel, WCA defaults |
| 11 | (A only) Motion storyboard of the scramble → inspection swoop |

All frames use the same realistic solve:
- **Scramble:** `D2 F2 U' B2 R2 U2 F2 U' L2 D' B' L' U F' R' D2 R U' F2 L'`
- **Splits:** cross 2.08 · pairs 1.71 / 1.96 / 1.52 (pseudo) / 2.31 · EO skip · CO 1.64 (Sune) · CP 1.47 (Aa) · EP 1.38 (Ub)
- **Totals:** 14.07 s, 68 moves, 4.83 TPS, 8.7 s inspection
- **Session:** ao5 14.62, ao12 15.03, PB 12.41, 23 solves including one +2 and one DNF

## Shared behaviour (all directions)

- **WCA is the default.** 15 s inspection. Starting between 15 and 17 s is +2, and starting after 17 s is a DNF.
- **Inspection and overtime are configurable:**

  | setting | options |
  |---|---|
  | inspection | 15 s / custom N s / unlimited / off (clock starts on first turn) |
  | overtime | WCA +2/DNF / count-only (+1 +2 +3, no penalty) / grace N s (then penalty or nothing) / auto-start (clock starts when inspection ends) |
  | judge callouts | off / 8 s + 12 s (flash, optional voice) |

- **Penalties are recorded everywhere.** Results and history show them as `14.97+` / `12.97 +2` and `DNF(13.20)`, and the sparkline marks them. Keys: `2` toggles +2, `d` marks DNF.
- **Method config:**

  | setting | options |
  |---|---|
  | method | CFOP / Roux |
  | cross | cross / x-cross / xx-cross |
  | F2L pairs | standard / pseudo (D-shift) |
  | OLL | 1-look / 2-look (EO → CO) |
  | PLL | 1-look / 2-look (CP → EP) |

  The timeline segments follow this config exactly.
- **Training toggles:**

  | setting | options |
  |---|---|
  | scramble | guided / paste / free |
  | coach | live / after solve / off |
  | cross hint | on tab / always / off |
  | timer | visible / hide while solving |
  | timeline | on / off |
  | split compare | vs average / vs PB / raw |
  | presets | wca / relaxed / drill (C) |

  A monkeytype-style command line (`esc`, then e.g. `insp 10`) sets any of them without the mouse.
- **The timeline is a pace map.** Every direction sizes each step segment by *your average* time for that step. Before you start it shows where your time usually goes; as you solve, each segment fills against that expectation.


## A · Mono — pure monkeytype-dark minimal

Frames: `A-01` … `A-11` (A-11 is a motion storyboard of the scramble → inspection swoop).

### Rationale
The current Brain reads as a hobby project because every idea gets its own
widget: cards, chips, glows, a glass pill, a timeline of dots. Monkeytype feels
finished for the opposite reason: one typeface, one accent, one thing on screen
at a time, and chrome that fades out while you work. A applies that literally.

- **One column, one focus.** Each state shows one hero: the start action, the scramble line, the countdown, the running clock, the result. Everything else is `sub` grey or hidden.
- **Chrome fades while you solve.** The top bar drops to 35 % opacity from the first scramble move, and the config bar is hidden. Both come back on the results screen.
- **The timeline is a pace map, not a progress bar.** Each step segment is as wide as *your average* for that step, so before you start it already reads as "where my time usually goes". Segments fill in accent as you solve, the split sits under each one, and the delta vs average sits under the split. Delta colours: accent means faster, error means slower.
- **Everything is a key.** Every action has a keycap hint (`space` start/next, `r` retry, `tab` settings, `esc` command line), like monkeytype's footer.
- **The cube mirror stays small.** In A it is a status display, not the hero: it confirms that the cube and the app agree.

### Palette
| token | hex | use |
|---|---|---|
| bg | `#16171b` | page |
| alt | `#1f2126` | config bar, keycaps, inactive buttons, chart bands |
| dim | `#34373f` | tracks, done scramble moves, future segments |
| sub | `#6b6f7a` | labels, secondary text |
| text | `#d9d6cb` | primary text, running clock |
| accent | `#e7b34c` | the one accent: active config, current move/step, countdown, filled segments, results numbers |
| error | `#e0675e` | wrong turn, overtime, +2 / DNF, slower-than-average deltas |
| error-dim | `#5a2d2a` | +2 zone at rest, recovery tag background |

Cube stickers are slightly muted (`#e8e6de #f2c94c #3fa66a #3d6fd6 #d9534a #e98a3c`) so they don't fight the single accent.

### Type (DM Mono only: 300 / 400 / 500)
| role | size / weight |
|---|---|
| running clock, countdown | 168 / 300, tracking −4 |
| results time | 80 / 300 |
| results secondary numbers | 36 / 300 · 22–26 / 300 |
| scramble moves | 36 / 400 |
| body, config bar | 13–16 / 400 |
| labels, deltas, axis | 11–12 / 400 |

Spacing is on an 8 px grid: the content column is x 160–1280 (1120 wide), and the timeline spans the full column.

### Timeline, inspection and overtime
- **Inspection lane** (A-03): a 6 px track with an x scale of 0–17 s plus a DNF stub. The remaining time is the accent span from a white caret to `15`, so it drains toward 15. The `+2` zone (15–17 s) rests in error-dim, and the DNF stub past 17 s is hatched error. The 8 s and 12 s callout ticks turn white once passed, and the big number shows whole seconds remaining. Below it, the solve lane waits as a 45 % ghost, which previews the plan (cross → 4 pairs → 2-look OLL → 2-look PLL).
- **Overtime** (A-04): the big number switches to error and counts `+1, +2…`. The caret enters the +2 zone and fills it, and one line spells out the consequence: "starting now = +2 penalty · dnf in 1.2 s". There is no flashing screen. The number pulses gently at 1 Hz (opacity 1 → .7).
- **Config variants** (A-05): the lane changes with the config.
  - **Custom N** rescales the lane to N s; the +2 and DNF zones follow.
  - **Unlimited** turns the lane into a count-up ruler.
  - **Count-only** replaces the red zones with neutral `+1 +2 +3 +4` ticks.
  - **Grace** adds a hatched neutral zone, which is either penalty-free or followed by the +2 zone.
  - **Auto-start** ends the lane in a "▸ solve" hand-off.
  - **Callouts** add the 8 / 12 ticks, flashed and optionally spoken.
  - **Off** removes the lane, and the solve lane waits at 0.00.
- **Solving** (A-06): completed segments are filled with their split and delta underneath. The current segment fills toward its average width, with a 22 px accent caret at the leading edge and its live split in accent. The step name above the clock ("f2l · pair 3 · pseudo · d′ aligned") is the only other accent text.
- **Pseudo pairs** get a small "pseudo" tag next to the segment label, the step line names the D-shift, and the results mark the pair with `*`.
- **Skip** (A-07): the skipped segment collapses to a hairline with a 4-point spark. A one-shot "✦ eo skip" toast rises above it, and the split reads "skip".

### Motion
- **Scramble done → inspection** (A-11, 520 ms total, `cubic-bezier(.22,1,.36,1)`):
  1. At 0 ms the last move lands and every token flashes accent for 80 ms.
  2. From 0 to 200 ms the scramble lifts 24 px and fades out, while the cube eases up and scales to 76 %.
  3. From 160 to 440 ms both lanes rise from +48 px to 0 with about 4 px of overshoot. Solve segments stagger by 24 ms from left to right, and the inspection track draws in from left to right.
  4. From 360 to 520 ms the countdown number fades in, scaling from .96 to 1. The countdown starts on the first frame after the swoop, and the width is always derived from the clock, never animated independently.
- **Inspection → solving:** on the first turn the inspection lane collapses into a small `insp 8.7` label at the left (200 ms). The ghost lane goes to 100 % opacity (160 ms), and the number cross-fades to `0.00`.
- **Segment fill:** the fill is driven by the timer every frame (no CSS transition). When a step completes, the segment snaps to full, the split number rolls in from +6 px (120 ms) and the delta fades in 80 ms later. If a step overruns its average, the fill stays at 100 % and the live split turns error.
- **Skip:** the segment's width animates to 0 over 240 ms, the spark scales from 0 to 1 with overshoot (`cubic-bezier(.34,1.56,.64,1)`), and the toast rises 8 px and fades out after 1.6 s.
- **Solved → results:** the clock stops, holds for 250 ms, then the whole solve view cross-fades (180 ms) into results. The TPS line draws left to right over 600 ms, and the split bars grow with a 30 ms stagger. `space` works immediately; it never waits for animations.

### Pros / cons
- **+** Fastest to build: one font, flat shapes, and it maps directly onto the existing DOM (the lanes are two flex rows).
- **+** Most "finished" in the monkeytype sense. The results screen is dense but calm.
- **+** Scales cleanly to phones and to future trainers (same bar, lanes and keycaps).
- **−** Least distinctive. It could read as "a monkeytype theme for cubing".
- **−** The cube mirror is deliberately small, so people who love the 3D cube may miss the hero treatment.

## B · Pit wall — bold broadcast / F1 timing

Frames: `B-01` … `B-10` (B-05 is 1440×1080, B-09 is 1440×1000).

### Rationale
A pit-wall timing screen with monkeytype's discipline: one accent, no cards, no panels, almost no chrome. The screen holds three things:
- the cube, as the hero on the left;
- one giant number on the right;
- **the band**, a thick timeline pinned to the bottom edge.

The band is the spine of the product, and it is the same object in every state:
- at idle it previews the method;
- during inspection it drains;
- in overtime it turns amber;
- during the solve it fills live;
- on the results screen it becomes the split record.

You never read a table mid-solve. You read colour and width.

### Palette
| role | hex | use |
|---|---|---|
| background | `#0a0a0b` | everything |
| raised | `#141417` | band blocks, config bar, key chips only |
| future block | `#0f0f11` | band blocks not reached yet |
| text | `#f5f5f2` | timer, values |
| sub | `#7b7d85` | labels, secondary copy |
| dim | `#3a3b41` | ghosted/idle, done scramble moves |
| **accent lime** | `#c8f542` | the only brand accent: live state, primary action, remaining inspection |
| violet (split) | `#b18cff` | best-ever split / PB, on split values only |
| amber | `#ffb020` | slower than average; overtime; +2; wrong turn |
| red | `#ff4d4d` | DNF only |

The sector colours (violet, lime, amber) appear only on split values, block underlines and split bars, never on chrome.

### Type (Manrope variable + DM Mono)
| role | font / size |
|---|---|
| display timer | Manrope 800, 220 px (results 150 px, phone 88–120 px), tabular numerals, −6 tracking |
| countdown / overtime numeral | Manrope 800, 320–360 px |
| step title | Manrope 800, 44 px |
| stat values | Manrope 700, 24–28 px |
| body, coach | Manrope 500–600, 16 px |
| labels | DM Mono 500, 10–12 px, uppercase, +1.4 tracking |
| algorithms | DM Mono, lime |

Layout: 8 px grid, 48 px page margins, band 64 px high.

### The band: timeline, inspection and overtime
- **Idle:** ghosted blocks for the configured method. Their widths are your average split per step, and changing a toggle re-flows the band immediately.
- **Scramble:** only a 4 px lime progress hairline is shown. The giant number becomes the move to make. A wrong turn replaces it with the amber recovery move (`L2`) and marks the grid cell "WAS L'".
- **Inspection:** one bar on a 0–18 s scale. Lime is the remaining time, draining behind a white playhead. The +2 zone (15–17 s, amber hatching) and the DNF zone (>17 s, red hatching) are visible but faint. The 8 s and 12 s callout ticks light up and read "8 S CALLED".
- **Overtime:** at 15.00 the playhead turns amber, the 15–17 s zone fills with solid amber hatching, and the numeral becomes `+1`, `+2`… A chip states the consequence ("+2 if you start now"), with a red "DNF IN 1.2 S" underneath. Past 17 s the DNF zone fills red.
- **Config variants (B-05):**
  - **Custom N s** rescales the same bar.
  - **Unlimited** is an open-ended count-up fade with no zones.
  - **Off** shows the solve blocks waiting, with the clock armed for the first turn.
  - **Count-only** is a grey hatch with +1/+2/+3 and no penalty.
  - **Grace** is a lime hatch for N s, then the chosen penalty.
  - **Auto-start** hands the inspection bar straight to the Cross block at 0.00.
- **Solving:**
  - The current block fills with a 16 % lime wash and a 3 px lime leading edge.
  - Done blocks show the split in its sector colour, with a 4 px underline.
  - Future blocks show "AVG x.xx".
  - Pseudo pairs get a violet PSEUDO tag.
  - On phones the current block widens 2.4× and the others compress.
- **Skip:** the skipped block collapses to a 28 px lime sliver stamped SKIP, with a small spark and an "EO SKIP · 3RD THIS SESSION" note above it.
- **Results:** the band stays on screen and gains ± deltas vs your average in every block.

### Motion
- **Swoop-in (scramble → inspection):**
  - On the last scramble move the progress hairline grows into the 64 px band: height 4 → 64 px and translateY 24 → 0, over 420 ms with `cubic-bezier(.16,1,.3,1)` (expo-out).
  - The lime fill then wipes in from the right (180 ms, 60 ms delay).
  - The big number cross-fades from the move to "15" (120 ms out, then 200 ms in with a .92 → 1 scale).
- **Countdown:** the playhead moves linearly with real time. Each whole second the numeral ticks with a 90 ms 1.04 → 1 pulse, and callout ticks flash for 600 ms.
- **Overtime flip:** at 15.00 lime changes to amber over 160 ms, and the hatching starts scrolling at 20 px/s. A single 1 px amber flash runs along the top edge. There is no shake.
- **Inspection → solve:** the inspection bar splits into the step blocks, each taking 260 ms with a 30 ms stagger (expo-out). The timer takes over the giant slot.
- **Segment fill:** linear with time. When a step completes, the leading edge snaps to the block end, the lime wash fades to the sector colour (220 ms), and the underline draws left → right (180 ms).
- **Skip:** the block's width animates to 28 px over 280 ms with `cubic-bezier(.34,1.56,.64,1)`. The spark scales 0 → 1 and rotates 45° over 320 ms. The label holds for 1.6 s, then fades to 40 %.
- **Results:** the timer glides to the top-left (360 ms, expo-out) while the cube fades out. The chart line draws over 600 ms and the split bars grow with a 25 ms stagger. `space` reverses everything in 200 ms and starts the next scramble.

### Pros / cons
- **+** The most glanceable direction. Each state has one colour (lime = live, amber = warning, red = DNF), which reads in peripheral vision while your eyes are on the cube.
- **+** One band tells the whole story, so the product feels engineered rather than assembled.
- **+** Sector colouring shows how each step went without reading numbers.
- **−** Loud. The 220–360 px numerals and the lime glow will feel aggressive to some users, so B needs a calm theme variant.
- **−** It uses three semantic colours besides the accent, which breaks monkeytype's single-accent purity. The extra colours have to stay confined to splits.
- **−** Band blocks narrower than about 40 px get cramped (phones, 2-look steps). B relies on the widen-current-block rule and on short labels.


## C · Orbit — light, editorial, circular timeline

Frames: `C-01` … `C-10`.

### Rationale
The cube stays the hero, and the timeline wraps around it as a thin ring, so your eye never leaves the cube to read progress. The page is light, warm and editorial, like a printed timing sheet: calm, readable in daylight, and clearly not a dashboard.

There are no cards, panels or rails. Structure comes only from type, spacing and one hairline. The monkeytype influence is in the restraint: one accent, a single config line, big airy numbers, key hints at the bottom and nothing else.

### Palette
| role | hex |
|---|---|
| paper (background) | `#f3f0e8` |
| ink (text, done arcs, "slower") | `#1c1b18` |
| sub (secondary text) | `#8a857a` |
| hairline / future arcs | `#dcd6c8` |
| wash (chart bands, key caps) | `#e9e4d8` / `#ebe6da` |
| **accent: brand teal** (live, faster than average, skips) | `#0a7d71` (tint `#d3e6e1`) |
| penalty / overtime | `#c77700` (wash `#f1dcb4`) |
| DNF | `#c8372d` |

### Type (Manrope for words and big numbers with tabular numerals; DM Mono for moves, splits and labels)
| role | font / size |
|---|---|
| live timer | Manrope 300, 168 px desktop / 112 px phone, −4 tracking |
| inspection countdown | Manrope 300, 220 px |
| results time | Manrope 300, 120 px, teal |
| current step | Manrope 700, 34 px |
| stat values | Manrope 600, 22–28 px |
| scramble moves | DM Mono 30 px |
| splits | DM Mono 13–15 px |
| labels | DM Mono 12–13 px, lowercase |
| body, coach | Manrope 500, 13–16 px |

### Timeline, inspection and overtime
- **Pace map:** each step is an arc whose length is proportional to your average for that step. Arcs have 3° gaps and start at 12 o'clock.
  - At idle the ring is a faint ghost with `~avg` under each label.
  - The arcs follow the config: 1-look OLL/PLL gives a single arc each, and Roux gives FB / SB / CMLL / L6E.
- **Live:**
  - Future arcs are 3 px hairlines.
  - The current arc fills clockwise at 8 px in teal, with a dot on its leading edge.
  - Finished arcs turn ink at 6 px and show `split ±delta` outside the ring.
  - A pseudo pair gets a dashed inner arc and a "pseudo · D′ shift" pill.
- **Skip:** the arc collapses to a dot with a teal spark, and one line gives the odds.
- **Inspection:** the ring becomes a single 15 s arc (24°/s) that drains anticlockwise back to 12 o'clock. The 8 s and 12 s callout ticks darken once passed, and the voice call is echoed as text.
- **Overtime (WCA):** past 12 o'clock an amber arc keeps growing, with +1/+2 ticks, over a pale "+2 zone" band (15–17 s). A dashed red DNF sector follows it. The big number shows +1, +2…, with a small "DNF in 1.2 s" meter.
- **Config variants (C-05):**
  - **Custom N s** rescales the ring.
  - **Unlimited** counts up at one lap per minute on a dotted ring, with no penalty.
  - **Off** shows an empty ring with a start tick.
  - **Count-only** shows an amber arc with ticks and no red.
  - **Grace** shows a grey sector, then the chosen penalty.
  - **Auto-start** flips the ring straight into the solve ring.
  - **Callouts** toggles the tick marks.

### Motion
- **Swoop-in:**
  - The 20 scramble ticks slide together into one continuous arc (420 ms, `cubic-bezier(.22,1,.36,1)`).
  - The ring then draws itself clockwise from 12 o'clock (stroke-dashoffset, 480 ms, same easing).
  - The countdown fades up from 8 px below (240 ms, 120 ms delay).
- **Inspection drain:** linear and redrawn every frame. The 8 s and 12 s ticks pulse 1 → 1.4 → 1 over 300 ms.
- **Overtime:** at 15.00 the leading dot changes from teal to amber over 150 ms with no bounce, and the "+2 zone" band fades in over 200 ms.
- **First turn:** the inspection arc shrinks to the 12 o'clock tick (200 ms, ease-in) while the step arcs grow out of it with a 40 ms stagger, 300 ms each.
- **Arc fill:** tied directly to time. When a step completes, the arc thickens 8 → 6 px and turns ink over 180 ms, and the split fades in over 160 ms.
- **Skip:** the arc collapses over 260 ms with `cubic-bezier(.5,0,.2,1)`. The spark scales 0 → 1.15 → 1 and rotates 20° over 380 ms.
- **Results:** the ring detaches from the cube and moves right to become the solve donut, re-proportioned to actual times (500 ms). The cube fades out. The chart draws over 600 ms and the split bars grow with a 30 ms stagger. `space` shrinks the donut back into the ring.

### Pros / cons
- **+** The most distinctive direction. The ring is a memorable signature that ties the timeline to the cube.
- **+** Calm and light, which is good for long sessions. It matches the current light app and the brand teal.
- **+** Inspection and overtime read naturally on a clock face.
- **−** Circular splits are harder to compare than a line, and labels crowd with 9+ steps or on phones.
- **−** Light-first departs from the monkeytype dark look, so C needs a dark theme.
- **−** The most custom drawing to build: SVG arcs and label collision handling.


## Recommendation

**Build A (Mono) as the product, and borrow two things from B.**

- **A is closest to the brief.** It is monkeytype's minimalism applied to cubing: one font, one accent, and chrome that disappears while you solve. It is also the cheapest to build well, because the lanes are two flex rows, so the "finished product" feel comes from consistency rather than custom drawing. And it generalises: the same config bar, lanes, keycaps and results grid carry over to future trainers that branch off Brain.
- **Borrow B's glanceability.** Give the solving timer more weight: DM Mono 300 at 168 px is elegant but thin at arm's length, so test DM Mono 500 or Manrope 700 with tabular numerals. Also take B's rule that the current step's block widens on phones.
- **Keep sector colours out of the default.** B's violet "best-ever split" colour could be an opt-in split-compare mode ("vs PB") rather than part of the default palette.
- **Keep C as a theme or a later signature.** The ring is the most original idea here, but it costs the most to build and makes splits harder to compare. It could return later as an optional "orbit" timeline style, or as the light theme, once A has shipped.

Suggested build order:
1. Config bar and settings, with WCA defaults.
2. Inspection lane, including overtime and every config variant.
3. Solve lane with live splits.
4. Results screen.
5. Motion polish, following the A-11 timings.

## Regenerating

The SVGs are generated. The generator scripts are copied to `_src/`:
- `lib.mjs`: shared data, cube renderer and font embedding
- `genA.mjs`, `genB.mjs`, `genC.mjs`: one generator per direction
- `render.mjs`: renders PNGs with Playwright

Paths are relative to this folder. Run `node _src/genA.mjs && node _src/render.mjs A-` from here (the same pattern works for B and C).

## Update: chosen styles (Orbit and Mono, each in dark and light)

The user chose **both C (Orbit) and A (Mono)**. They will ship as two switchable Brain styles. Each style comes in dark and light, and the site's theme switch (`data-theme` on `<html>`) decides which mode is used. Dark mode is the priority.

- **`C-dark-*`: Orbit dark.** This is a proper dark design, not an inversion:
  - Background is warm ink `#141311`, with paper-cream text `#ece6d8`.
  - The brand teal is lifted to `#3dbfad` so it glows rather than sinks.
  - Finished arcs are cream and future arcs are `#34312b` hairlines. On the donut, teal means faster than average and cream means slower.
  - The cube body is `#1d1b18`, so the cube separates from the background. It sits over a soft teal radial glow with a 35 % black contact shadow.
  - Phone bezels are dark.
  - Frames: idle, inspection, overtime, solving, skip, results, mobile, settings.
- **`A-light-*`: Mono light.**
  - Background is paper `#f1eee6`, with ink `#2b2a27`.
  - The amber accent is darkened to bronze `#8a5e07` so it passes AA.
  - Frames: idle, solving, results, mobile, settings.
- **`tokens.md`** has the exact CSS custom properties for orbit-dark, orbit-light, mono-dark and mono-light. It also covers fonts, the type scale and radii, plus a WCAG AA contrast table with its exceptions.

To regenerate:

```sh
ORBIT_THEME=dark node _src/genC.mjs && node _src/render.mjs C-dark
MONO_THEME=light node _src/genA.mjs && node _src/render.mjs A-light
```
