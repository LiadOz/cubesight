# Working on CubeSight: rules for every agent

Read this before doing anything in this repository. It applies to every agent (Claude, Codex, or other) on every task. The product spec and work packages live in `docs/ideas/SPEC-FLEET.md`; read the parts relevant to your task (its ground rules and the user's binding feedback always apply).

## 1. Where you work
- **Never modify the main checkout** `/home/loz/projects/cubesight` directly. It is the user's live checkout and dev server. Do not create, edit or delete files there; do not run `npm ci`/`npm install`, builds, tests or servers there; never delete or move its `node_modules`.
- Work in **your own git worktree** (e.g. `git worktree add .agents/worktrees/<task> -b <branch> main`) or the isolated worktree you were given. Branch from the tip of `main`.
- Dependencies in your worktree: install there, or symlink read-only: `ln -s /home/loz/projects/cubesight/node_modules node_modules`. Vite in a worktree needs `server.fs.allow` for that path.
- **Put worktrees and test artifacts in `/home/loz/projects/cubesight/.agents/`** (`worktrees/`, `artifacts/`). This is the ONE exception to the rule above: it is gitignored, it is host-backed (about 511 GB free) and it is already visible inside the sandboxes, whereas a sandbox's own filesystem is a 20 GB overlay that has repeatedly filled to 99% and caused browser crashes, lost test output and stalled runs. Never put them on `/tmp` or in sandbox-local paths such as `/home/loz/projects/cubesight-<something>`. Check with `df -h <your actual output path>` before a long run: it must show the 924 GB host filesystem, not a 20 GB overlay.
- Scratch files (local configs, logs, temporary specs) live in your worktree (untracked) or under `.agents/artifacts/`, never loose in the main checkout.
- **Port 5173 belongs to the user.** Use another free port for dev servers and tests.
- **Keep test runs cheap so agents can test in parallel.** Browser tests do not render the cube (the test dev server sets `VITE_CUBESIGHT_TEST_STUB=1`; `PW_REAL_GL=1` opts back in). Run browser suites at low priority on your own port — `nice -n 19`, `PW_PORT=<free port>` — and never serialize agents behind a lock: if a run is expensive, make the run cheaper.

## 2. Commits and merges
- Small, descriptive commits. **Never bypass the pre-commit hook** (`--no-verify` is forbidden). No auto "WIP" commits.
- Never push. Land work with `npm run queue -- <your-branch>` from your own worktree (how it works, what a rejection looks like and how to recover: [`docs/MERGE-QUEUE.md`](docs/MERGE-QUEUE.md)). The queue merges your branch into the current trunk and runs the Tier 1 gate on the merged result; it never advances trunk while a worktree has it checked out, so the lead (the user's main Claude session) takes a green tip with the `git merge --ff-only` command it prints. Never run git in the live checkout yourself to land work.
- **Trunk is `main`, and `main` is what is deployed. Branch from it, merge back within hours, and update from it often.** (`feature/smart-cube-guidance` is retired.) Do not create or use a second integration branch, and never re-apply your own commits onto another branch: that duplication is what made the history unreadable. Work lands only through the merge queue (F18), which runs the gate on the *merged result*, so a change that passes alone but breaks in combination is rejected rather than landing.

## 3. Tests: `npm test` while you work, Tier 2 before a release
**`npm test` is the one command while iterating, and it is the merge gate** (`npm run tier1` is the same thing, and the merge queue runs it on the merged result). It takes ≤ 60 s wall clock and is change-aware: it diffs against trunk (`main`) plus your uncommitted work, then runs lint, **all** unit tests (about 7 s; they are cheap, so they are never selected), the build, and **only the browser tests the diff reaches**, with the 2 smoke tests as a floor.
- *How it selects.* Each browser run records, per test, which **functions** it executed (V8 coverage). A changed hunk is mapped to the functions it touches, and the tests that executed those functions run, direct hits first. Startup code runs in every test; feature code runs only in its own tests, so editing `src/main.js` selects the features you touched, not the suite. Comment and formatting edits select nothing.
- *Edge cases, by rule.* A changed spec runs (only its changed tests when that can be told). Module-scope code follows the functions that read what it declares. A new function is reached through the changed function that calls it. A new file with no history falls back to specs named after it or importing it, with a warning. CSS has no JS coverage: the classes and ids it styles are searched for in the code, and layout/visual coverage is Tier 2. Config, dependency or global-CSS changes run the smoke floor and say so. If nothing relevant is found for a source change it prints **NO RELEVANT BROWSER TESTS** and runs the smoke floor only: treat that as unverified, not green.
- *Budget.* Selected tests are ordered by relevance and packed into what is left of 60 s using recorded durations. Anything that does not fit is **deferred and listed by name, never dropped**: Tier 2 (and the merge queue's full stage) must cover it. When the machine is oversubscribed (load above the core count) the estimate is scaled by the load, so more is deferred rather than the gate overrunning. A typical single-feature change fits entirely.
- *Freshness.* The map (`tests/impact-map.json`, a committed seed) is updated incrementally from every `npm test` run into a per-worktree overlay (`test-results/impact-map/live.json`); the gate never does a full refresh. `npm run test:impact-map` (full capture, about 10 min or more) refreshes the seed: run it from Tier 2 or on a schedule and commit the result. See what a change reaches without running it: `npm run test:affected -- --dry-run [--files <paths>]`; replay it on history: `npm run test:replay -- <commit> ...`.
- Never delete a test to meet a budget: move the assertion to a cheaper tier or prove it redundant.

**Tier 2, full regression (≤ 10 min, never more):** everything, including the full visual matrix and the tests the gate deferred; scheduled and before a release candidate: `npm run tier2` (or the pieces: `npm run check` · the full `npm run test:browser` · `npm run test:pwa` · `npm run test:layout` · `npm run test:snapshots` · `npm run perf:check`). Tests never write into `docs/` or `src/`.
Before you report done, `npm test` must be green and any deferred tests it listed must be run (`npm run test:browser -- <spec>`) or handed to Tier 2.

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

## 7. Time accounting
The user wants to see where time goes, so every task keeps a clock.
- **When you start:** run `date -u +%H:%MZ`, state the time in your first message, and create `.agents/artifacts/<task>/timelog.md` with that line.
- **As you work:** append one line when each phase starts — `HH:MMZ <what> (expect ~N min)`. Always add one **before any command you expect to take over a minute**, saying why you need it *now*. If you are about to wait more than ~5 minutes on a test run, first ask whether a targeted run answers the same question.
- **When you finish:** your report opens with a **Time** block — start, end, elapsed — then the three things that took longest and *why*, e.g. `38 min waiting for the full Playwright suite: needed a baseline before changing the config`.
- **The lead checks it.** `node scripts/agent-time.mjs <your transcript>` measures every tool call from the transcript's own timestamps, groups it (waiting on tests, builds, editing, the model's own time) and separates out periods when the whole session was paused. Where your account and the measurement disagree, the measurement wins.
