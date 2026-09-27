# Brain — design language (direction F)

The user rejected every card-based layout. The agreed direction is **fluent, no cards**:

## Rules
1. **No bordered cards/panels.** Sections are separated by **eyebrow labels + spacing** (small uppercase grey labels), never by boxes or borders.
2. **One continuous translucent glass surface** for the bottom HUD — a single rounded translucent panel with **no internal borders**. The timeline is a thin glowing line along its top edge with a dot at the current stage (not a row of chips).
3. **The cube is the hero** — huge, centered, with a soft glow. No box around it.
4. **Connection is a single floating chip** (top-right), not a panel/section. Setup lives in the same continuous surface, revealed by a labelled link, not a chunky card.
5. **Timer / phase / coach / metrics are floating text** on the glass surface (or floating beside the cube), never in their own boxes.
6. **Scramble is a flow** (nodes along a path, current highlighted), not chips/boxes.
7. **Phone**: the glass surface docks to the bottom as one sheet; the cube fills the screen above it.

## What this means for the code
- Replace the `.brain-pill` bordered card + the bordered `.brain-connection` / `.brain-setup` / `.brain-phase` / `.brain-coach` / `.brain-metrics` **cards** with a single borderless translucent surface where sections are typography + spacing only.
- Connect → a floating chip button (top-right), not a section.
- Timeline → a thin progress line with a moving dot, not `<i>` chips.
- Coach / metrics → inline text rows under eyebrow labels, no per-line borders.
- Remove `border` from every Brain sub-section; use background + padding + hairline dividers (1px lines) only where a break is truly needed, and prefer pure spacing.

## Sign-off
Before I touch the Brain code again, confirm this is the direction. The mockup is at `docs/design/brain-idea-F.svg` (served at `http://localhost:5173/design/brain-idea-F.svg`).

## Pseudo-F2L & F2L-coaching follow-ups (unchanged, captured earlier)
- Pseudo-pair = edge to its right location AND corner to the location relative to the two cross pieces beside it, cross still on bottom. (Implemented: `currentDShift` + `solvedPairsPseudo`.)
- F2L hindsight: after a pair insertion, evaluate the pre-insertion state, least-move insertion; prefer F-free, but F counts for orienting final/next pair; corner orientation roughly decides. (Needs the cross/X-cross solver per pair — next coach lens.)
