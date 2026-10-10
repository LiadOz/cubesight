---
id: solve-rotation-stalls-20261010
title: Solve cube rotation · recording saves
date: 2026-10-10
branch: solve
status: built
author: Codex
decision: Save changed recording chunks instead of repeatedly copying the full history.
images: [SL-01-recording-save.png]
---
Latest recording: 96,996 events. Browser save preparation fell from 1,231 ms to 11 ms (median of three runs; anonymization and structured clone, including chunk planning).

Existing recordings migrate automatically. Export, replay and reload recovery remain supported. This measures recorder work; physical cube smoothness still needs verification.
