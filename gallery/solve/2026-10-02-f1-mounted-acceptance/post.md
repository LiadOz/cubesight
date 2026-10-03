---
id: f1-mounted-acceptance
title: F1 solve flow: mounted states and case links
date: 2026-10-02
branch: solve
parent: visual-baselines
status: built
author: F1
decision: The real mounted F1 fixture driver passes all 14 registered solve states; combined browser matrix and merge gate remain pending.
images:
  - F1-01-idle-dark.png
  - F1-01-idle-phone-light.png
  - F1-02-guided-scramble-dark.png
  - F1-02-guided-scramble-phone-light.png
  - F1-03-inspection-dark.png
  - F1-03-inspection-phone-light.png
  - F1-04-solving-dark.png
  - F1-04-solving-phone-light.png
  - F1-05-results-dark.png
  - F1-05-results-phone-light.png
  - F1-06-case-links-dark.png
  - F1-06-case-links-phone-light.png
  - F1-07-review-comparison-dark.png
  - F1-07-review-comparison-phone-light.png
  - F1-08-deep-review-dark.png
  - F1-08-deep-review-phone-light.png
---

These captures come from the shared smart-cube session, the mounted Brain controller, and its read-only F0 snapshot bridge. The registered F1 fixture states all pass on the 1280×720 desktop viewport. Each numbered state also has a 390 px Orbit-light capture.

- **F1-01:** idle solve screen.
- **F1-02:** guided scramble with current progress.
- **F1-03:** normal inspection.
- **F1-04:** solving with the live stage fill.
- **F1-05:** completed solve and results rail.
- **F1-06:** canonical OLL 1, PLL T, and F2L 4 case destinations. The F2L case is recognized from the actual pair-start state; `FR` remains its target slot, not its case ID.
- **F1-07:** actual cross analysis proves an 8-to-6-move alternative. The mounted Cube reaches the independently modeled state for both full-turn demonstrations.
- **F1-08:** the live results link mounts the lazy review page with the selected solve and one Cube canvas.

At 1280×720, the results document is 736 px tall (16 px of allowed vertical scrolling) and contains exactly one canvas. The Cube and Orbit remain in view at the top, middle, and bottom scroll positions. This is focused F1 evidence; the combined fleet browser, layout, snapshot, PWA, and performance gates are still pending.
