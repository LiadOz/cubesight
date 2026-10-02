---
id: widgets-selection-controls
title: Selection controls as one system: chips, segmented, switch, select, choice button (W-05, W-06, W-07, W-08, W-28)
date: 2026-10-02
branch: widgets
parent: widget-inventory
status: exploring
author: widget design agent
decision: pending user choice
images: [W-SEL-01-overview-three-options-hd.png, W-SEL-11-option1-states-hd.png, W-SEL-12-option1-states-light-hd.png, W-SEL-21-option2-states-hd.png, W-SEL-22-option2-states-light-hd.png, W-SEL-31-option3-states-hd.png, W-SEL-32-option3-states-light-hd.png, W-SEL-01-overview-three-options.png, W-SEL-11-option1-states.png, W-SEL-21-option2-states.png, W-SEL-31-option3-states.png]
---
Five families that all do one job, "let the user pick", and today do it in 5 to 14 looks each. This post proposes them as **one system**: the same anatomy, the same heights, the same focus ring, the same selected state, in three possible looks. Pick a look (①②③) and the whole family follows. Nothing in `src/` was changed; the prototypes are real HTML and CSS using only the Orbit tokens (`src/brain/css/tokens-orbit.css`), Manrope and DM Mono, in `proto/` next to this post (`proto.html?opt=1&theme=dark&scene=states`).

Image IDs: `W-SEL-<option><n>`. Option 1 is 11 to 18, option 2 is 21 to 28, option 3 is 31 to 38; in each decade: 1 every state (dark), 2 every state (light), 3 the settings drawer, 4 the settings sheet on a 390 phone, 5 the alg playback speed (A-11), 6 the history filters (A-07), 7 the drill answers (A-08), 8 the phone drill. `W-SEL-01` puts the three looks side by side.

## Today's variants (from the inventory, W-05a to W-08n, W-28a to W-28e)

| family | variants | instances | what is wrong today |
|---|---|---|---|
| W-05 chips | 8 | 126 | five different borders and fills; "selected" is teal in one place and plain in another; the same pill is a filter (`g-chip`), a marker (`b-rev-chip`) and an action (`b-rev-pin`, `b-rev-close`) |
| W-06 segmented | 6 | 221 | four looks for one idea: the legacy `.segmented` (a dark well), `.pll-segmented`, the settings `b-opt` pills and the timer `tm-opt` pills |
| W-07 toggles | 10 | 536 | native checkboxes in three sizes, `b-cfg` text toggles (teal text for "on", no shape at all), a `b-configbar` row of them separated by bars |
| W-08 selects | 14 | 142 | native selects in 6 looks; the speed 0.5x/1x/2x/4x select alone appears in four styles; five of them (`rp-*`) are pills, the rest are boxes; 5 are short fixed lists that should not be selects |
| W-28 choices | 5 | 90 | the colour answer, the PLL name, the face picker and the review's virtual pad are four sizes of the same button, with the keycap in four places |

What A already shows: the **speed chips in A-11** (a teal-tinted pill for the selected one, quiet outlined pills for the rest) and the **answer buttons with a small keycap in A-08**. Option 1 is built from those two; options 2 and 3 are deliberately different.

## The rule for which control (the same in all three options)

| the user is choosing... | use | example |
|---|---|---|
| on or off | **switch** (W-07) | `cross hint`, `WCA penalties`, `pseudo pairs` |
| one of 2 to 5 short fixed labels (12 characters or fewer) | **segmented** (W-06) | speed `0.5× 1× 2× 4×`; `1-look · 2-look`; `15 s · ∞ · off` |
| one of 6 or more, or long labels, or a list that grows | **select** (W-08) | case colours, sessions, case set |
| any number of filters or tags, shown or hidden in place | **chip** (W-05) | history `PB 2`, `DNF 1`; `show on the ring` |
| the answer in a drill | **choice button** (W-28) | `OLL 27` with key 2; the colour picker `Yellow` with key Y |
| ticking items in a list (bulk) | **checkbox** (W-07) | choosing cases for a custom set. Nowhere else |

Never: a select for 5 or fewer options (the speed select goes away), a chip as a plain action (that is a button, W-04), a switch for something that is not on or off. Chips that toggle say **what they show** (`DNF`), switches say **the thing** (`cross hint`, never "enable cross hint"); all lowercase per VOICE.md.

## What every option shares

- **Sizes.** Segmented, select, switch row, checkbox row: **40 px** high. Chip: **32 px** on desktop, **40 px** under 720 px. Choice button: **48 px** (52 px on phones, where the keycap is hidden). Switch track 44 by 26, thumb 20. All radii are `--b-radius-control` (pill); the select list uses 20 px, option rows 14 px. Every hit area is at least 40 px high on a phone: the segmented options fill the full 40 px, the switch is a full row.
- **Type.** Manrope 14/500 for controls (13/500 for chips), the selected one 600. DM Mono 12 only for counts and keycaps.
- **States.** default, hover, focus-visible (2 px `--b-accent` ring, 2 px offset, on the element you would activate; around the track for a switch), selected or checked, pressed (scale .97; a switch thumb stretches to 24 px), disabled (40 % opacity, no hover, not focusable). The selected state is never colour alone: a check inside the switch and the select list, a leading weight change, an underline or a fill shape.
- **Keyboard.** *Chip*: Tab, Space or Enter toggles; each chip is its own tab stop. *Segmented* (radiogroup): one tab stop (the selected option); Left/Right (and Up/Down) move **and select** at once, wrapping; Home/End jump; disabled options are skipped. *Switch and checkbox*: Space toggles (Enter too). *Select*: Enter, Space or Down opens; Up/Down move, Home/End jump, typing a letter jumps to a match, Enter picks, Esc closes and gives focus back; on phones the native picker opens, with the same closed look. *Choice*: Tab and Enter, plus the number key on the keycap (the key bar says `1-4 answer`, as in A-08). All of this works in the prototype: open `proto.html?opt=1` and try it.
- **Motion** (calm, one thing moves at a time). Colour and border 160 ms `--b-ease`; the segmented thumb slides 220 ms `--b-ease`; the switch thumb slides 200 ms; the select chevron turns 200 ms; the underline of option 2 grows 220 ms. No bounce (`--b-ease-pop` is not used). `prefers-reduced-motion`: every transition is instant.
- **Light.** Everything is token roles, so light works without new colours (see the light state sheets). Contrast, computed: muted text on the page 6.1 (dark) and 5.5 (light), selected teal text on its tint 5.1 in both, page ink on the cream fill 14.9 and 15.1; the faint hairline (1.3 to 3.3) is decoration only: switch outlines and checkbox borders use `--b-muted` (5.5 or better) so the shape of an off control always reads.

## Option ①: tint (recommended)

**Anatomy.** Chips and options are quiet text with a hairline pill; **selected = the teal tint** (`--b-accent-soft` fill, `--b-accent-text` text, 1 px `--b-accent` border), exactly the A-11 speed chips. The segmented control is a `--b-surface-2` track with a sliding tinted thumb. The switch is a 44 by 26 track: `--b-track` off, `--b-accent` on, a check in the thumb. The select is a `--b-surface-2` pill with a chevron; its open list is a rounded sheet with the selected row in teal and a check. The choice button is a surface pill with the keycap hanging on its top-left corner (A-08), selected = teal tint, correct = teal tint plus a check, a miss = amber outline plus `!`, the answer revealed after a miss = a dashed teal outline.

![option 1, every state, dark](W-SEL-11-option1-states.png)
![option 1, every state, light](W-SEL-12-option1-states-light.png)

In context: ![the settings drawer](W-SEL-13-option1-drawer.png) ![the phone sheet](W-SEL-14-option1-phone-drawer.png) ![alg playback speed, A-11](W-SEL-15-option1-speed.png) ![history filters, A-07](W-SEL-16-option1-history-filters.png) ![drill answers, A-08](W-SEL-17-option1-drill-answers.png) ![phone drill](W-SEL-18-option1-phone-drill.png)

Look at: ① in the drawer, the segmented control (does the tinted thumb read as "selected" on its own?); ② the switches (the check in the thumb); ③ the select; ④ the chips for `show on the ring`; in the history frame ① the select next to ② chips.

Pros: the same teal means "selected" in every control and it matches the A-11 frame the user already liked; the selected state works without reading a word; calm. Cons: the teal is also the Orbit's "live/good" colour, so a screen with many selected controls gets a lot of teal (the drawer has 9); the segmented and chip look close to each other (that is deliberate, and the track tells them apart).

## Option ②: underline

**Anatomy.** Text first, no fills. Chips and segmented options are muted text; the selected one is page ink with the **nav's teal underline** (2 px, grows in); the segmented control shares one hairline baseline that the underline slides along. The switch is an outlined pill with a dot; on = teal outline and teal dot. The select is text with a hairline underline (teal when open). The choice button is an outlined pill; selected is teal outline and text.

![option 2, every state, dark](W-SEL-21-option2-states.png)
![option 2, every state, light](W-SEL-22-option2-states-light.png)

In context: ![the settings drawer](W-SEL-23-option2-drawer.png) ![the phone sheet](W-SEL-24-option2-phone-drawer.png) ![alg playback speed, A-11](W-SEL-25-option2-speed.png) ![history filters, A-07](W-SEL-26-option2-history-filters.png) ![drill answers, A-08](W-SEL-27-option2-drill-answers.png) ![phone drill](W-SEL-28-option2-phone-drill.png)

Look at: ① the segmented underline and ② the chips with only a line to say "on". Pros: the quietest option and the closest to "the cube is the centrepiece"; settings drawers look like text, not like a form. Cons: it is the weakest at saying "this is tappable" (a row of words with underlines is also what the header nav and the tabs, W-13, look like, so the two families would have to be told apart by context); selected-vs-not is carried by 2 px and a small ink change, which is the most fragile for low vision and for a phone in sunlight; an off switch is a thin outline.

## Option ③: ink

**Anatomy.** Filled surfaces; the selected one flips to the page ink: cream in dark, near-black in light (`--b-fill` with `--b-bg` text, the same fill as the A frames' "next scramble" pill). Chips and options are `--b-surface-2` pills; the segmented thumb is cream; the switch track turns cream with a dark thumb and a check; the select is a `--b-surface-2` pill; the choice button is a surface pill, selected = cream, correct = solid teal, a miss = solid amber.

![option 3, every state, dark](W-SEL-31-option3-states.png)
![option 3, every state, light](W-SEL-32-option3-states-light.png)

In context: ![the settings drawer](W-SEL-33-option3-drawer.png) ![the phone sheet](W-SEL-34-option3-phone-drawer.png) ![alg playback speed, A-11](W-SEL-35-option3-speed.png) ![history filters, A-07](W-SEL-36-option3-history-filters.png) ![drill answers, A-08](W-SEL-37-option3-drill-answers.png) ![phone drill](W-SEL-38-option3-phone-drill.png)

Look at: ① the cream selected chip and thumb in the history frame, next to the cream "open this solve" button. Pros: the strongest selected state (14.9 to 1), readable at a glance and on a phone in the sun; no extra teal. Cons: **it competes with the primary action**: in A the one cream pill on a screen is the thing to press (`next scramble`, `open this solve`), and in this option every selected chip is the same cream, so the eye no longer knows which is the action; the cream drill answer in the correct state needs a separate solid teal; it is the loudest option and the least calm.

## Side by side

![the three looks](W-SEL-01-overview-three-options.png)

| | ① tint | ② underline | ③ ink |
|---|---|---|---|
| selected is shown by | teal tint, border, weight | ink text and an underline | cream fill |
| matches the A frames | yes (A-11 speed chips, A-08 keycaps) | the header nav | the primary pill |
| calm | high | highest | lowest |
| reads as tappable | good | weakest | strongest |
| selected-state strength | 5.1:1 text on tint, border 8.2:1 (dark) and 4.4:1 (light) | ink vs muted 6.1 vs 11, 2 px line | 14.9:1 |
| risk | a lot of teal on busy screens | confusable with nav and tabs | competes with the primary action |

## Recommendation

**Option ①.** It is the one already in the user's favourite frames (A-11, A-08), it has one rule ("teal tint = selected") that works for all five controls, and its two risks are small: the amount of teal can be capped (switches and the segmented thumb carry it, chips use the same tint but there are few on one screen) and nothing in it competes with the cream primary pill. If the user wants the settings to feel even quieter, take ② for the drawer only (it is the same DOM, so mixing is a CSS switch), but I would not use it for drill answers.

Whichever look wins, these hold: the choice rule in the table above, **no selects for 5 or fewer options** (the speed select and the `exposure-picker` become segmented), **no native checkbox look** and no `b-cfg` text toggles, and the choice button replaces the four answer buttons.

## Questions for the user

1. Which look: ①, ②, ③, or ① with ② for the settings drawer only?
2. The switch carries a **check inside the thumb** when on (so on/off is never colour alone). Keep it, or plain thumb?
3. Segmented options are **equal width** (so the thumb slides cleanly; labels up to about 12 characters). OK, or content-width?
4. Chips in a group are **independent toggles** (filters). For "pick one" the rule sends you to the segmented control. Agreed that a chip never means "pick one"?
5. Select on phones opens the **native picker** (closed look identical). OK, or one custom list everywhere?
6. Drill answers: keycap hanging on the top-left (as A-08) on desktop, **hidden on phones**. OK?
7. A miss on an answer is **amber with `!`** and the right answer is shown with a **dashed teal outline** (no red, per VOICE.md). OK?
8. Checkbox only for ticking items in lists (custom sets); nowhere else. OK, or drop it entirely?
