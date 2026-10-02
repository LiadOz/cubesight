# Working on CubeSight: rules for every agent

Read this before doing anything in this repository. It applies to every agent (Claude, Codex, or other) on every task. The product spec and work packages live in `docs/ideas/SPEC-FLEET.md`; read the parts relevant to your task (its ground rules and the user's binding feedback always apply).

## 1. Where you work
- **Never modify the main checkout** `/home/loz/projects/cubesight` directly. It is the user's live checkout and dev server. Do not create, edit or delete files there; do not run `npm ci`/`npm install`, builds, tests or servers there; never delete or move its `node_modules`.
- Work in **your own git worktree** (e.g. `git worktree add ../cubesight-<task> -b <branch> feature/smart-cube-guidance`) or the isolated worktree you were given. Branch from the tip of `feature/smart-cube-guidance`.
- Dependencies in your worktree: install there, or symlink read-only: `ln -s /home/loz/projects/cubesight/node_modules node_modules`. Vite in a worktree needs `server.fs.allow` for that path.
- Scratch files (local configs, logs, temporary specs) live in your worktree (untracked) or in `/tmp`, never in the main checkout.
- **Port 5173 belongs to the user.** Use another free port for dev servers and tests.

## 2. Commits and merges
- Small, descriptive commits. **Never bypass the pre-commit hook** (`--no-verify` is forbidden). No auto "WIP" commits.
- Never push. The lead (the user's main Claude session) reviews and merges into `feature/smart-cube-guidance`.

## 3. Tests: affected while iterating, full gate before reporting
While iterating, run `npm run test:affected` (once it exists; F11) instead of the whole suite. Before you report done, the full gate below must be green.
`npm run check` (lint 0 errors, unit tests, build, gallery coverage) · the full `npx playwright test` · `npx playwright test --config=playwright.pwa.config.js` · and, once they exist, `npm run test:layout`, `npm run test:snapshots`, `npm run perf:check`. Tests never write into `docs/` or `src/`.

## 4. Product rules (short form; the full list is in SPEC-FLEET.md)
- Offline-first PWA: no backend, no calls to other origins; imports via paste/file.
- Design: direction A of `docs/design/orbit-v3/`; the cube is the centrepiece; **only approved widgets** from `docs/design/WIDGETS.md`; progress only via the Orbit; one animation at a time; full-turn demonstrations; no footer; no horizontal scroll; the main pages fit one screen.
- Wording per `docs/design/VOICE.md`.
- Behaviour must stay replayable (`src/recorder.js`, `scripts/replay-recording.mjs`); saved recordings are anonymized.

## 5. Show your work: the gallery
Publish screenshots as a post in the in-app gallery (`gallery/README.md`): `gallery/<branch>/<YYYY-MM-DD>-<slug>/post.md` + ID-prefixed images. Never overwrite or delete images; new iterations go in new posts. Report the link `http://localhost:5173/#/dev/gallery/post/<id>`.

## 6. Report
Commits, files, test results, the gallery link, deviations from the spec, open questions.
