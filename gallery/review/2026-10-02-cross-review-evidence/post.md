---
id: f3-cross-review-evidence
title: F3 cross planning and review evidence
date: 2026-10-02
branch: review
parent: review-built
status: exploring
author: F3
decision: Tighten review wording, search budgets, and inspection X-cross identification.
images:
  - /docs/design/f3-review-gallery/01-inspection-dark.png
  - /docs/design/f3-review-gallery/02-inspection-light.png
  - /docs/design/f3-review-gallery/03-inspection-phone.png
  - /docs/design/f3-review-gallery/04-review-dark.png
  - /docs/design/f3-review-gallery/05-review-light.png
  - /docs/design/f3-review-gallery/06-review-phone.png
  - /docs/design/f3-review-gallery/07-cross-color-dark.png
  - /docs/design/f3-review-gallery/08-cross-color-light.png
  - /docs/design/f3-review-gallery/09-cross-color-phone.png
---

## Attempt and reason

The parent post, `review-built`, shows the implemented review and settings. This iteration checked whether its claims and hints matched the solver evidence for each cross target. The first pass exposed a misleading “PB cross” label and an inspection hint that hid the X-cross face and pair.

## Changes from the parent

- F3-01–03: inspection hint now names the X-cross cross color and the paired edge colors.
- F3-04–06: review text describes a shortest proven solver result; a hand-verified +1 X-cross golden checks the target optimum, move loss, praise, and no plain-cross penalty.
- F3-07–09: the existing cross-color controls still show neutral and selected-color search choices.
- Neutral search shares one finite deadline across all cross and X-cross requests. A zero share is skipped instead of being treated as the solver default timeout.

## Review feedback by frame

- F3-01–03: identify both the X-cross face and pair in the inspection suggestion.
- F3-04–06: do not describe the solver's shortest cross as the user's personal best; state what the search actually proved.
- F3-07–09: retain the selected-color scope when evaluating alternatives.

The images are the existing parent captures and were not edited. The inspection and review text updates need a fresh browser capture when the shared browser slot is available.
