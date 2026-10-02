---
id: brain-v2-themes
title: Brain v2: both themes, dark and light, plus tokens
date: 2026-09-30
branch: design
parent: [brain-v2-mono, brain-v2-orbit]
status: chosen
author: design agent
decision: Mono and Orbit become two switchable themes, each in dark and light; the shared tokens are in brain-v2/tokens.md.
images: [/docs/design/brain-v2/C-dark-*, /docs/design/brain-v2/A-light-*]
---
The merge point: the Mono and Orbit lanes join here. The same app, two skins, switchable, each with a dark and a light variant.

- **C-dark** frames: the Orbit direction rendered dark first.
- **A-light** frames: the Mono direction in light.
- Semantic colour tokens (`--b-*`) are defined once per theme; components only read the tokens. See `docs/design/brain-v2/tokens.md`.
