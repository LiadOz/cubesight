---
id: widgets-dev-pages
title: "Dev pages: timeline graph, thumbnail card, blog post, compare view (W-32 to W-35)"
date: 2026-10-02
branch: widgets
parent: widget-inventory
status: exploring
author: widget design agent
decision: pending user choice
images: [DP-00-decide-hd.png, DP-00-b1-option1-post-article-hd.png, DP-00-b1-option2-post-two-columns-hd.png, DP-00-b1-option3-post-pictures-first-hd.png, DP-00-q1-option1-timeline-git-graph-hd.png, DP-00-q1-option2-timeline-rings-hd.png, DP-00-q1-option3-timeline-spine-hd.png, DP-00-q2-option1-card-image-card-hd.png, DP-00-q2-option2-card-contact-tile-hd.png, DP-00-q2-option3-card-row-card-hd.png, DP-00-q3-option1-compare-two-panes-hd.png, DP-00-q3-option2-compare-stage-dock-hd.png, DP-00-q3-option3-compare-wipe-first-hd.png, DP-01-shared-pieces-hd.png, DP-14-timeline-phone-hd.png, DP-24-card-phone-hd.png, DP-34-post-phone-hd.png, DP-45-compare-phone-hd.png, DP-46-compare-reuse-hd.png, DP-91-light-sheet-hd.png, DP-00-decide.png]
---
Pick by looking at **DP-00** (Q1 to Q3). Built with the approved widgets only; real data (the 43 posts of this repo). 3 options each:

- **W-32 timeline** (DP-11 to 14): ① the git graph kept, one neutral lane per branch, the chosen path thick. ② every branch a ring around a centre, posts as points. ③ one spine ring = the chosen path, side branches folded into +n badges. **Pick ③** (it does not grow with the post count; ① stays as the "all posts" list).
- **W-33 card** (DP-21 to 24): ① image + ID + title + copy link. ② a dense contact tile, ID only. ③ a row card with a caption. **Pick ①.**
- **W-34 blog post** (DP-31 to 34): ① one column. ② two columns, a sticky rail with decision and lineage. ③ pictures first. **I build ②, no question.**
- **W-35 compare** (DP-41 to 46): ① two panes on a toolbar. ② an immersive stage with a dock. ③ wipe first with a list of changes (all three have side by side, overlay and wipe). **Pick ③.**

Shared pieces and the two unapproved widgets (text field, wipe handle): DP-01. Light sheet: DP-91.

**HD:** DP-00 is re-rendered at 2x as `DP-00-decide-hd` (each option 1800 px wide); the full-size 1440 x 900 screen of every option follows it (`DP-00-q1…`, `q2`, `q3`, `b1`). The earlier 1x images stay after them.
