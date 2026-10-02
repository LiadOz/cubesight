---
id: widgets-containers
title: "Containers: cards and panels (W-10), drawers (W-14), dialogs and sheets (W-15), disclosures (W-29) as one system"
date: 2026-10-02
branch: widgets
parent: widget-inventory
status: exploring
author: widget design agent
decision: pending user choice
images: [C-00-ladder-which-container-when.png, C-01-compare-settings-drawer.png]
---
**What this is.** Four registry families (10 card looks, 2 drawer looks, 5 dialog looks, 7 disclosure looks today) designed as ONE system, because the real question is *when* a thing is a frameless section, a panel, a drawer or a dialog. The Orbit look (direction A) is mostly frameless, so the system starts there and only escalates by rule. Everything is built as real HTML/CSS with the real tokens and the approved widgets (W-04 quiet-fill buttons, ink selection controls with the check, bevelled keycaps with cap-cap ranges, W-16 bottom-right toast, W-21 labels). Nothing in `src/` changed. Every image is dark above, light below (C-00 is dark only).

**The ladder (C-00, the same for all three options).**

1. **section** (default): a mono head and white space. Never framed.
2. **group**: several rows of one kind (switches, key/value rows) inside a section.
3. **panel**: a list or a log, read line by line. Never around a single control, never nested.
4. **disclosure**: rarely needed content on the same screen; opens in place, never a modal.
5. **drawer / sheet**: a side task that keeps the page visible (settings, dev, detail). Right on desktop, bottom on a phone; no primary button.
6. **dialog**: one decision that must come first. Destructive or irreversible only; reversible things get a toast with undo (W-16).

**The three options** differ only in how much frame each container wears (C-01 puts the settings drawer side by side):

- **Option 1, frameless first** (C-11 to C-18): sections are spacing, groups are bare rows, only lists and logs are panels (a soft fill, no edge). The drawer is the page colour with a soft shadow; the dialog is a soft raised fill.
- **Option 2, soft panels** (C-21 to C-28): every group and disclosure is a soft panel (fill + 1 px hairline, radius 20); the drawer floats inset with radius 28.
- **Option 3, hairline rules** (C-31 to C-38): no fills, nothing rounded except the dialog; structure by hairlines. The drawer is cut by one hairline on its left edge.

**Contexts per option** (same numbering in each option, the digit after C- is the option): 1 the five containers (kit), 2 the settings drawer over solve, 3 the debug drawer (the ` key), 4 the help page, 5 the review/detail panel over results, 6 the delete-solve confirm dialog, 7 the import sheet, 8 phone 390 x 844 (settings sheet, confirm dialog, import sheet).

**Notes on choices.**

- The review detail panel is a frameless left rail in option 1 (as in A-06: it does not cover the Orbit, so it needs no drawer); in options 2 and 3 it is the same non-modal drawer as settings.
- The help page is a page (feedback #12), not a dialog; it holds the footer content (build, storage, "everything stays on this device").
- The eyebrow style in these frames is provisional; the real one comes from the lists post (W-30).
- Delete is a danger quiet-fill secondary, never the cream primary; cancel is a text button and the focus default.

**Questions for you.**

1. Which skin: 1 frameless first, 2 soft panels, or 3 hairline rules (or the ladder with a mix, e.g. 1 for pages and 2 only inside drawers)?
2. Is the ladder right? In particular: groups of switches stay unframed in option 1, and panels are only for lists and logs.
3. Deleting a solve: a confirm dialog (C-16) or no dialog and a toast with undo? The ladder says dialogs are for irreversible actions, so this decides whether delete is irreversible.
4. Review detail: frameless left rail (option 1, A-06) or a right drawer (options 2 and 3)?
5. Import: a centred dialog on desktop and a tall bottom sheet on a phone (as drawn), or a right drawer on both?
6. Should the drawer on desktop float (option 2) or be flush to the edge (options 1 and 3)? It also decides the phone sheet (floating vs flush).
7. Disclosures: closed text rows (option 1), panel rows (option 2) or ruled rows (option 3)? Seven looks today become one.
8. Should the debug drawer be wider (560 px) than settings (392 px), or the same width?

Prototype: `proto/containers.html?view=rules|compare|kit|settings|debug|help|review|confirm|import|phone&opt=1|2|3&theme=dark|light`; render with `node scripts/widget-proposal-shots.mjs containers`.
