# Working on CubeSight: rules for every agent

Read this before doing anything in this repository. It applies to every agent (Claude, Codex, or other) on every task. The product spec and work packages live in `docs/ideas/SPEC-FLEET.md`; read the parts relevant to your task (its ground rules and the user's binding feedback always apply).

## 1. Where you work
- **Never modify the main checkout** `/home/loz/projects/cubesight` directly. It is the user's live checkout and dev server. Do not create, edit or delete files there; do not run `npm ci`/`npm install`, builds, tests or servers there; never delete or move its `node_modules`.
- Work in **your own git worktree** (e.g. `git worktree add ../cubesight-<task> -b <branch> feature/smart-cube-guidance`) or the isolated worktree you were given. Branch from the tip of `feature/smart-cube-guidance`.
- Dependencies in your worktree: install there, or symlink read-only: `ln -s /home/loz/projects/cubesight/node_modules node_modules`. Vite in a worktree needs `server.fs.allow` for that path.
- **Put worktrees and test artifacts in `/home/loz/projects/cubesight/.agents/`** (`worktrees/`, `artifacts/`). This is the ONE exception to the rule above: it is gitignored, it is host-backed (about 511 GB free) and it is already visible inside the sandboxes, whereas a sandbox's own filesystem is a 20 GB overlay that has repeatedly filled to 99% and caused browser crashes, lost test output and stalled runs. Never put them on `/tmp` or in sandbox-local paths such as `/home/loz/projects/cubesight-<something>`. Check with `df -h <your actual output path>` before a long run: it must show the 924 GB host filesystem, not a 20 GB overlay.
- Scratch files (local configs, logs, temporary specs) live in your worktree (untracked) or under `.agents/artifacts/`, never loose in the main checkout.
- **Port 5173 belongs to the user.** Use another free port for dev servers and tests.

## 2. Commits and merges
- Small, descriptive commits. **Never bypass the pre-commit hook** (`--no-verify` is forbidden). No auto "WIP" commits.
- Never push. The lead (the user's main Claude session) reviews and merges into `feature/smart-cube-guidance`.
- **Trunk is `feature/smart-cube-guidance`. Branch from it, merge back within hours, and update from it often.** Do not create or use a second integration branch, and never re-apply your own commits onto another branch: that duplication is what made the history unreadable. Work lands only through the merge queue (F18), which runs the gate on the *merged result*, so a change that passes alone but breaks in combination is rejected rather than landing.

## 3. Tests: two tiers with hard budgets
**Tier 1, the merge gate (≤ 60 s):** lint + node unit tests + build + a browser smoke set + the affected browser tests. This runs on every merge, on the merged result. **Tier 2, full regression (≤ 10 min, never more):** everything including the full visual matrix; scheduled and before a release candidate. Never delete a test to meet a budget: move the assertion to a cheaper tier or prove it redundant.
While iterating, run `npm run test:affected` (once it exists; F11) instead of the whole suite. Before you report done, the full gate below must be green.
`npm run check` (lint 0 errors, unit tests, build, gallery coverage) · the full `npx playwright test` · `npx playwright test --config=playwright.pwa.config.js` · and, once they exist, `npm run test:layout`, `npm run test:snapshots`, `npm run perf:check`. Tests never write into `docs/` or `src/`.

## 4. Product rules (short form; the full list is in SPEC-FLEET.md)
- Offline-first PWA: no backend, no calls to other origins; imports via paste/file.
- Design: direction A of `docs/design/orbit-v3/` is the **exact** spec — take values from `docs/design/orbit-v3/SPEC-A-EXACT.md` and `src/ui/design-spec.js`, never by eye, and check with `npm run design:diff`; the cube is the centrepiece; **only approved widgets** from `docs/design/WIDGETS.md`; progress only via the Orbit; one animation at a time; full-turn demonstrations; no site-chrome footer block (the frames DO have a bottom keycap row and a bottom-right stats line — build those); no horizontal scroll; the main pages fit one screen.
- Wording per `docs/design/VOICE.md`.
- Behaviour must stay replayable (`src/recorder.js`, `scripts/replay-recording.mjs`); saved recordings are anonymized.

## 5. Show your work: the gallery
Publish screenshots as a post in the in-app gallery (`gallery/README.md`): `gallery/<branch>/<YYYY-MM-DD>-<slug>/post.md` + ID-prefixed images. Never overwrite or delete images; new iterations go in new posts. Report the link `http://localhost:5173/#/dev/gallery/post/<id>`.
**Posts are short:** a few lines of text ("3 options" + one line each on what differs); at most 3 questions, asked VISUALLY in one decision image (`<ID>-00-decide.png`) that shows all the options side by side, labelled ①②③ and Q1–Q3. Detail images follow; no long question lists in the text.
**As few images as possible:** show only what is genuinely NEW or undecided. Never re-show already-approved widgets (check `docs/design/WIDGETS.md` first) except as context inside one frame. Aim for the decision image + at most 2–3 detail images per option; if a family is mostly settled, say so and show one frame.

## 6. Report
Commits, files, test results, the gallery link, deviations from the spec, open questions.
