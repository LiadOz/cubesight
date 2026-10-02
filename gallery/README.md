# Gallery and development blog

Every image the project produces (design mockups, agent screenshots) is browsable at one URL on the dev
server, and every iteration is a **post** in a branching development blog. The user cannot open files in
your sandbox, so this is how they see your work.

- Gallery of folders: `http://localhost:5173/#/dev/gallery`
- Blog (newest first): `http://localhost:5173/#/dev/gallery/blog`
- Timeline (branches, parents, merges): `http://localhost:5173/#/dev/gallery/timeline`
- One post: `http://localhost:5173/#/dev/gallery/post/<id>`
- One folder: `http://localhost:5173/#/dev/gallery/gallery/<folder>`, e.g. `.../#/dev/gallery/docs/design/orbit-v3`
- One image in the lightbox: add `?img=<file>`, e.g. `http://localhost:5173/#/dev/gallery/docs/design/orbit-v3?img=A-05-results.png`
- Compare two posts: `http://localhost:5173/#/dev/gallery/compare?a=<id>&b=<id>`

It exists only on the Vite dev server (`npm run dev`); a production build contains none of it.

## The rules

1. **Every time you produce images, add a post.** A post is one exploration or one iteration.
2. **Keep every image forever.** Images are committed. Never overwrite and never delete one: a new iteration
   goes into a NEW folder (`gallery/F1-solve-v2/`, or a new dated post folder), never over the old one.
3. Name files with a visible ID prefix so the user can refer to them: `F1-03-results-dark.png`
   (the ID is `F1-03`; it is shown on the card and in the lightbox). Formats: png, jpg, webp, svg.
4. Give the user the link to your post or folder (see above), not file paths.
5. `npm run gallery:coverage` must report 0 uncovered images (it runs in `npm run check`): every image under
   `docs/design/**`, `gallery/**` and `tests/**-snapshots/**` has to be shown by some post.

## A post

```
gallery/<branch>/<YYYY-MM-DD>-<slug>/
  post.md                                  one post = one exploration / iteration
  F1-01-idle.png  F1-02-scramble.png ...   its images (ID-prefixed)
```

`post.md` is YAML front matter plus a markdown body:

```
---
id: orbit-v3            # unique, stable
title: Orbit v3: one Cube + one Orbit
date: 2026-10-01
branch: design          # the lane in the timeline (design, solve, trainers, review, moves, algs ...)
parent: orbit-wins      # id(s) it evolved from; a list for merges: [brain-v2-mono, brain-v2-orbit]
status: chosen          # exploring | chosen | rejected | superseded | built
author: design agent    # or the work package id, e.g. F1
decision: Direction A chosen; A-05 and A-10 loved.    # one line: what the user decided
images: [A-05-results.png, A-10-past-solve.png]       # optional, see below
---
Markdown body: what we tried, why, what changed vs the parent, and the user's feedback, numbered to match
image IDs (for example "A-05 (2): the dotted connector").
```

- Required in practice: `id`, `title`, `date`, `branch`, `status`. A missing `date` falls back to the folder
  name prefix, a missing `branch` to `main`.
- `images:` is optional. Without it, the post shows every image in its own folder, by name. With it, the
  listed images come first (featured order) and the folder's own images follow. An entry is a name relative
  to the post folder, or a `/project/relative/path` (so a post can show files in `docs/design/**` or
  `tests/**-snapshots/**` without moving them). A `*` in the file name is a glob over that folder:
  `/docs/design/brain-v2/C-dark-*`.
- The body is markdown (headings, lists, **bold**, *italic*, `code`, links, ![image](name.png) by relative
  name, quotes and fenced code). HTML is escaped.
- `status` meanings: `exploring` open, `chosen` the user picked it, `rejected` the user dropped it,
  `superseded` replaced by a later decision (say which in `decision`), `built` implemented in the app.
- Use `parent` so the timeline draws the history: a new iteration of an idea has the previous post as parent;
  a post that combines two ideas lists both parents. Pick a `branch` per topic and keep using it.
- Optional: a `manifest.json` next to images (`{ "<file>": { "title", "caption", "id" } }`, or a group
  `{ "title", "description", "order": [...] }`) sets titles and order in the Folders view.

## Quick start

1. `mkdir -p gallery/solve/2026-10-03-f1-solve` (branch `solve`, today's date, a slug).
2. Copy `F1-01-idle.png`, `F1-02-scramble.png`, ... into it and write `post.md` next to them.
3. Tell the user `http://localhost:5173/#/dev/gallery/gallery/solve/2026-10-03-f1-solve` (the folder) or
   `http://localhost:5173/#/dev/gallery/post/<id>` (the post).

The old, pre-blog screenshots are in `gallery/_import/<date>-<source>/`; each has a post in place.
