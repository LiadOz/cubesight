---
id: dev-gallery
title: The in-app gallery and development blog
date: 2026-10-02
branch: qa
parent: gallery-lightbox
status: built
author: gallery agent
decision: Gallery at #/dev/gallery: folders, blog, timeline, compare. Dev server only.
---
The gallery lists every image under `docs/design/**` and `gallery/**`; the blog and timeline are built from `gallery/**/post.md`.

- DG-01 the folder list, newest first, with search and the design / agent screenshots filter.
- DG-02 a folder grid (orbit-v3); DG-03 the shared lightbox opened by the deep link `?img=A-05-results.png`.
- DG-04 the branching timeline, DG-05 the blog, DG-07 compare two posts side by side.
- DG-06 and DG-08 at 390 px.

How agents publish: see `gallery/README.md`.
