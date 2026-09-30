# CubeSight roadmap: pending work

Status as of 2026-09-30. Details and rationale: `docs/ideas/FEATURES.md` (numbered items) and the designs in `docs/design/`.

## Done (merged on feature/smart-cube-guidance)
- Brain v2 (Orbit + Mono, dark/light), settings panel, debug drawer, connect progress, mode row
- Desync/crash fixes, record & replay, lint + pre-commit + CI, offline PWA tests
- Live tracker fixes: the cross face from the cube, stable rotations, pseudo D fix, X-cross as an opportunity
- IndexedDB history, automatic sessions + focus, delete/undo, penalty edit, ao50/ao100/mo3
- Cube-clock timing, interrupted solves, desync detection, auto-reconnect
- On-cube move cue + plain scramble line, wrong-turn recovery
- Analysis engine (segmentation, pseudo detection, cross evaluation)
- Results v1: coach markers on the timeline/chart, stage detail, yours-vs-better (cross, pairs 1–2), pins (stored)

## Waiting on the user
- The 12 questions (prime symbol, spelling, casing, keys, combo vs streak, review label names, accuracy scoring, inferred labels, coach avatar, Cross Scout split, "solve" rename, site name)
- Test on the real GAN cube: cube-clock time, disconnect mid-solve, reconnect, rotation markers
- Send the permission requests for algorithm/reconstruction data (drafts in `docs/research/reconstructions.md` and `docs/design/brain-v2/algs/SPEC.md`)
- Review the fingertrick table (parked; the cue-only guide for now)

## Solve screen (today's "Brain")
- [ ] Rename Brain → "solve" in the UI; the new site name everywhere (manifest, header)
- [ ] Full review screen: step through the solve, solve graph, per-stage accuracy, move tooltips (review SPEC v1 rest)
- [ ] Better pair for pairs 3–4 (a new pair solver), last-layer alg/AUF choice (review v2/v3)
- [ ] "Retry this moment": a guided setup of that position on the smart cube, then re-grade
- [ ] Focus-specific results/coach layout, plus a "switch to learning?" suggestion
- [ ] Mono: show the timeline lane with markers on results (desktop)
- [ ] Results left column: fill the empty space under the pinned cube
- [ ] Voice callouts at 8 s/12 s (setting exists, default off): verify it's implemented
- [ ] Case capture (which OLL/PLL each solve had) for per-case stats and weak-case drills
- [ ] Per-case recognition vs execution time

## History & data
- [ ] History page: list, search/filter by session/focus, per-solve detail with replay on the 3D cube
- [ ] csTimer-compatible import/export
- [ ] Pins included in export/import
- [ ] Small fixes from the audit: phone nav clipped, the "no cube" dot shows green, the manifest still says "Recognition Training"

## Site structure (trainers proposal, option B)
- [ ] Nav `solve · drills · algs · progress`, new routes + redirects for old hashes
- [ ] Debug/Studio moves to a developer area (settings → diagnostics)
- [ ] Phone home = drills when no cube is connected; desktop home = solve
- [ ] Shared shell for every trainer (top bar, cube chip, style/mode, settings, key hints, results pattern)
- [ ] Progress page across solves and drills (read-only adapter over the existing keys)
- [ ] Manual timer page (no smart cube; space/touch; works on iPhone)

## Drills (phone-first, no cube needed)
- [ ] Quick-round mode: 60 s / 20 cases, combos, day streak, "one more round", resume where you left off
- [ ] Spaced repetition + retrieval practice across drills
- [ ] Cross planning drill (from Cross Scout); the scramble explorer becomes a tool in review
- [ ] OLL recognition drill; PLL recognition upgrades (case filters, `cases=` links)
- [ ] F2L trainer accepts a start position (`setup=`); lookahead / slow-solve drill
- [ ] Pins open in the matching trainer; variations randomize the non-essential pieces
- [ ] New mini-games: name the AUF, PLL from two sides, cross count, daily puzzle, EO spotting, alg recall, colour neutrality, BLD letter pairs
- [ ] Drill ↔ solve link ("your PLL recog drill time dropped 0.3 s → your PLL split dropped 0.2 s")

## Algorithms
- [ ] Algorithm database: cases, algs, sources/credits (clearly usable algs only), "my pick"
- [ ] Algorithm browser + case pages (`#/algs/...`)
- [ ] Smart-cube alg drill: repeat an alg, per-move timing, virtual last-layer repaint
- [ ] Reconstruction import (paste/file) + review of imported solves; "used by top cubers" stats
- [ ] Bundle official WCA scrambles (with the required credit notice)

## Consistency & polish
- [ ] Vocabulary pass: apply the 92 audit fixes in `docs/design/VOICE.md`, add a shared terms module + a banned-synonyms test
- [ ] Deep links: every case/stage/label mentioned links to its drill, with a way back
- [ ] Goals, weekly report, share card image

## Parked / later
- Fingertricks drawn on the cube (needs a reviewed table)
- Roux (hidden until real Roux detection)
- Other smart-cube brands (no hardware to test)
- Left-handed / mirrored holds
