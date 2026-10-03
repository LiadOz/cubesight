---
id: f3-cross-review-update
title: F3 cross hint and proof capture
date: 2026-10-02
branch: review
parent: f3-cross-review-evidence
status: built
author: F3
decision: No new direction chosen; captured the revised cross and X-cross evidence in the app.
images:
  - F3-10-inspection-dark.png
  - F3-11-inspection-light.png
  - F3-12-inspection-phone.png
  - F3-13-cross-color-dark.png
  - F3-14-cross-color-light.png
  - F3-15-cross-color-phone.png
  - F3-16-review-dark.png
  - F3-17-review-light.png
  - F3-18-review-phone.png
---

## Attempt and reason

The parent post linked the initial F3 inspection, review, and cross-color captures. After review, I updated the inspection hint to identify both faces and the pair, corrected the unsupported “PB cross” wording, and bounded tiny neutral-search budgets. This capture checks those surfaces in the Orbit shell.

## Changes from the parent

- F3-10–12 show the inspection hint with the best plain cross and the X-cross face plus its named pair.
- F3-13–15 show all-colors and selected-color controls at desktop and 390 px.
- F3-16–18 show review praise based on the real WASM-proven 8-move X-cross target. The selected note cites the proof and the 8-move minimum.
- Every desktop capture asserted the root `data-theme` and computed color scheme against the requested dark or light theme. Phone captures use a 390 px viewport with dark theme.

## Review feedback by frame

- F3-10–12: the X-cross hint should name its own cross face and paired edge colors, even when that face differs from the shortest plain cross.
- F3-13–15: retain the all-colors option and the individual cross-color choices.
- F3-16–18: describe the computed, proven minimum instead of claiming it is the user's PB; the review marker is based on the real WASM golden and does not compare the X-cross against a plain-cross minimum.

The shots use the development gallery fixtures; the X-cross review evidence was populated from the hand-verified `GOLD.xcross` solve and its real WASM analysis. These are implementation captures, not a new design direction.
