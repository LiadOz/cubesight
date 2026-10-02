---
id: widgets-dev-pages
title: "Dev pages: the timeline graph, the thumbnail card, the blog post and the compare view (W-32 to W-35)"
date: 2026-10-02
branch: widgets
parent: widget-inventory
status: exploring
author: widget design agent
decision: pending user choice
---
**Why this post.** The dev pages (gallery, blog, timeline, compare) are first-class pages that you approve like any other, but they still look like the old app: the timeline is a 12-colour git graph, the thumbnail card has three text sizes, the blog post is a plain card and the compare page is two selects over two images. This post proposes three consolidated designs for each of the four widgets, built as real HTML/CSS with the real tokens and **only the approved widgets**: the A header, the W-04 quiet-fill buttons, the ink selection controls with the ✓ (chips, segmented, switch, select), the bevelled W-17 keys (cap – cap) and the W-16 bottom-right toast. Every screen is rendered at 1440 x 900 (some as the full page) and on a 390 x 844 phone, dark, plus one light sheet (`DP-91`). The data is real: the 43 posts of this repo plus this one, and real images from the gallery.

**The small pieces all four share** (`DP-01`): the A header unchanged, the dev tabs under the page title (the header nav pattern one level down), a flat **status badge** (glyph + word: ✦ built, ✓ chosen, ! rejected, dashed superseded), a **branch tag** (a dot and a mono word, one colour for every branch: the twelve branch hues go), and the caption with the ID and a text "copy link". Two things on these pages are **not in the registry and not approved**: the text field (the gallery filter) and the wipe handle (W-35). They are drawn but flagged.

## W-32 the timeline graph (`DP-11` to `DP-14`)

The question: keep the git-graph look, or express the history in the Orbit language? With 44 posts today and every day adding more, all three options keep **the chosen path** (the lineage of what you chose and built, 11 posts from the first sketches to now) as the one emphasized line.

1. **The git graph, kept** (`DP-11`). One neutral lane per branch (12), newest on top, every post a one-line row (title, branch tag, status badge, date). The chosen path is the thick cream line; the selected row opens in place with W-33 tiles, the decision line and two buttons; two picks (ink ✓) bring up the compare toast. *Precise and complete*: you see all 44 posts and every fork. But it is a different language from everything else, the lane column eats 190 px, and it only gets longer.
2. **Every branch is a ring** (`DP-12`). Branches are concentric rings (oldest inside), a post is a point on its ring, the angle is the order in time (clockwise from the top, day ticks outside), the chosen path is a thick cream line that hugs a ring while the work stays on a branch and hops outward when it moves. The selected post's thumbnail takes the cube's place at the centre. All 44 posts are visible as a picture and it is clearly Orbit. *But* it is a picture, not a list: only the 11 path posts can carry labels, 12 rings are hard to tell apart without the names stacked in the bottom gap, and on a phone (158 px radius, 10 px between rings) it can only be an overview.
3. **One spine, side branches folded** (`DP-13`). The ring is the chosen path itself, drawn exactly like the Orbit (cream done arcs, 2.5 degree gaps, the newest arc live in teal, labels outside as name, date, status). The 33 other posts are **cluster badges** on the path post they grew from (+7, +5, as in the crowded-Orbit rule); one cluster at a time unfolds into numbered points on an inner arc, listed in the rail. *Scales best* (the ring stays 11 to 15 posts however many branches there are), legible on a phone (`DP-14`), and the most Orbit-native. *But* branches are hidden until you unfold them, so "show me everything" needs the list.

**Readability with 40+ posts.** 1 stays readable (a list scrolls) but is a wall of rows; 2 is dense but still reads at 44, and degrades past about 70 posts because the rings fill up; 3 does not depend on the post count at all. On a phone 3 is calmest, 1 is the most precise, 2 degrades the most (`DP-14`).

## W-33 the thumbnail card and its grid (`DP-21` to `DP-24`)

All three keep the picture, the visible **ID** and a **copy link**, and all three show the same card in a blog-post strip and in history / alg browsing with the mini Orbit instead of a picture (so the card is one widget, as the registry asks).

1. **The image card** (`DP-21`). 4:3 picture, ID in accent mono, one-line title, a size note, a W-04 text "copy link"; a ✓ square on hover, a 2 px ink edge when picked for compare. Four per row on desktop, two on a phone. The closest to today's card.
2. **The contact tile** (`DP-22`). 16:10 crop, only the ID chip on the picture; hover grows it into ID + title + copy. Six per row (24 on screen), three on a phone: made for the 311-image inventory folder. You need a hover or a tap to read a title.
3. **The row card** (`DP-23`). A 148 px picture with ID, size, a two-line title and a two-line caption from the manifest, a W-04 secondary "open" and a text "copy link"; two per row, one on a phone (best to read, fewest pictures per screen). The strip in a post is a marked horizontal scroller (the only sideways scroll, flagged for the layout tests).

## W-34 the blog post (`DP-31` to `DP-34`)

1. **The article** (`DP-31`). One 760 px column: meta row (date, branch tag, status badge, author), the title at 34 px, the **decision as a framed line right under the title**, the text, one inline figure, then the image index as tiles and the lineage (grew out of / led to) as plain links. Simple; the decision and the lineage are far from each other.
2. **Two columns with a sticky rail** (`DP-32`). The rail (300 px) keeps the meta, the **decision**, the lineage, a numbered image list and the one W-04 primary "compare with parent" in view while you read; the main column has the title, the text and figures placed next to the paragraph that cites them. The best for long posts with many pictures. On a phone the rail cannot stay, so it falls to the end and needs the decision line copied under the title (`DP-34`).
3. **Pictures first** (`DP-33`). A hero stage (860 px) with a filmstrip, the decision and lineage beside it, the text underneath. The best for posts whose pictures are the point (all the widget proposals); the weakest for a text-only post.

## W-35 the compare view (`DP-41` to `DP-46`)

Every option offers the three modes **side by side, overlay (onion skin) and wipe** through one W-06 segmented control (shown on A-05 against B-05, the same screen in two directions). The differences are the layout.

1. **Toolbar on top, two panes** (`DP-41`). Selects per pane (post · image), modes, zoom (fit · 100% · 200%) and an ink "sync zoom" switch, two same-size panes with their post status. Familiar and safe; the least room for the images.
2. **Immersive stage with a dock** (`DP-42`, `DP-43`). The stage takes the width; one dock holds the modes, **opacity in five steps (a W-06 segmented, instead of a new slider)**, a "difference" chip (identical pixels go black, the changes light up) and swap. A and B are small thumbnails at the side. The best way to see small shifts; the dock sits on the image.
3. **Wipe first, with a list of changes** (`DP-44`). The wipe is the default: an ink handle you drag (or move with the arrow keys), the pickers and the modes in a right column, and a **numbered "what differs" list** that the author or the design lab fills in. That list is the "yours vs better" explanation slot. The easiest on a phone: one stage, one gesture, a 44 px handle (`DP-45`).

**Reuse** (`DP-46`): the stage takes any two renderings, not only images: the design lab (F10) wipes option 1 against option 2, review shows yours vs better as two Orbits side by side (a ring inside a ring stays reserved for comparison, as you decided), history overlays a solve on the one before.

## Recommendation

- **W-32: option 3 (the spine)** as the page, with **option 1's list as the "all posts" mode** (the segmented control already carries it). It is the only one that stays the same size as posts pile up, it is Orbit-native, and the git list remains for the day you want every fork. Option 2 is the one to pick if you want every post visible on the Orbit and accept that only the path is labelled.
- **W-33: option 1 (the image card)**, with the contact tile (2) available later as a density toggle for the big folders.
- **W-34: option 2 (two columns)** on desktop, collapsing to option 1's order on a phone (with the decision under the title).
- **W-35: option 3 (wipe first)**: modes on one segmented control, the changes list, the same stage reused by the design lab and "yours vs better". The overlay's opacity is five segmented steps; the difference chip comes from option 2.

## Questions for you

1. **W-32:** the spine ③ as the page and the git list ① behind "all posts", or one of the three alone?
2. **W-32:** is the **chosen path** (what you chose and built) the right backbone? It is a lineage I traced by hand through the data; the real one needs a `path` marker on posts (or "status chosen or built and an ancestor of the newest post"). Which rule do you want?
3. **W-32:** the branch hues go, every branch is one neutral colour with its name. Fine, or do you want a few hues back for the busiest branches?
4. **W-32:** compare pick: an ink ✓ at the end of a row (①) or in the Orbit by tapping two points (②, ③)?
5. **W-33:** the image card ①, the contact tile ② or the row card ③? And should the caption carry the manifest text (③) or only the title (①, ②)?
6. **W-33:** is a ✓ pick square on hover (and always on touch) the right way to pick for compare, or would you rather open compare from the lightbox?
7. **W-34:** two columns ② or pictures first ③? Should the decision always sit under the title as well, even with the rail?
8. **W-35:** is wipe the right default, with side by side and overlay one tap away? Is five steps of opacity enough, or do you want a real slider (a new widget to approve)?
9. **W-35:** the wipe handle and the text field (gallery filter) are not in the registry. Do you want me to propose them as widgets (W-36 text field, W-37 wipe handle), or keep a simpler stand-in?
10. **All four:** status badges as flat pills with a glyph (✦ ✓ !) and a branch as a dot and a word: approved as drawn in `DP-01`?

The prototypes are in `proto/` (open `dev.html?view=t3`; views: `shared t1 t2 t3 tp c1 c2 c3 cp b1 b2 b3 bp x1 x2 x2d x3 xp xr light`, `&theme=light` for the light theme). The renders come from `node scripts/widget-proposal-shots.mjs devpages`.
