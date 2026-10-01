# Review of REVIEW-NEXT (round 2): verified items and follow-ups

Lead review on 2026-10-01 of `docs/ideas/REVIEW-NEXT-IMPLEMENTATION.md`. Same ground rules as SPEC-NEXT / REVIEW-NEXT.

## Independently verified
- Real user recordings (`/home/loz/Downloads/cubesight-recording-2026-09-30T15-44-50-425Z.json`, `...T18-11-10-363Z.json`) replay OK; solve 3 cross on D, crossMs 3486.
- `npm run check` green; full Playwright 274 passed (5 optional skipped); PWA 13/13.
- Pair benchmark (`node scripts/benchmark-pair-search.mjs 2000`, a fresh process, under concurrent load): **48/50 proven (96%)**, 2 partial (both pseudo), 0 verification failures, median 44 ms, p95 1.13 s. This meets the ≥80% target. The report's 100% is a best case on a quiet machine.
- F2L library: 123 setups / 356 algs; a random sample of 120 algs checked with an independent cubing.js script: all solve F2L (allowing whole-cube rotation for algs containing y/d/x), and every setup starts unsolved.
- R1 pages render one canvas each with no page errors (algs case, OLL drill, timer, drills hub).

## Follow-ups (please fix)
1. **The algs case page ring shows meaningless labels** ("11–14 −0.00", "1–3", "4–7 −0.00", "8–10 −0.00"). The Orbit ring is reused from the solve timeline with split/delta labels. For alg playback, show move-group ticks (or the trigger names) without numeric deltas; never show "−0.00".
2. **Timer preview cube too small and cramped:** the ring labels ("16–21", "1–5", "11–15") crowd a ~100 px cube, and the move-chip strip is clipped on the left (the first chip shows "2" instead of "B2"). Make the timer cube a proper size (comparable to the drills/OLL cube), drop or simplify the ring labels at small sizes, make the chip strip scroll/centre the current chip without clipping, and avoid showing the scramble twice (the big text line + the chips): pick one primary display (chips that double as the scramble text, or text with the cue on the cube).
3. **The algs case page cube is small inside a card**, so it doesn't feel like the solve screen. Give the case cube the same visual weight as the solve/OLL-drill cube (big, centred, the same shadow/glow), with the playback controls under it.
4. **The solve page config bar wraps to two lines** ("focus speed flow learning | stats smart cube manual timer all"). Move the stats-source selector out of the config bar (it belongs to results/progress filters) or collapse it; the config bar must fit on one line at 1280 px in Orbit and Mono.
5. **Unknown routes silently show solve** (e.g. `#/drills/cross`). Show a small styled "not found · go to drills/solve" page instead, keeping legacy redirects working.
6. Re-check the alg playback ring/lane in Mono for the same label issue as item 1.

Acceptance: screenshots (Orbit/Mono × dark/light + 390 px) of the algs case page, the timer, the solve idle config bar and the not-found page, Read and reported; the full quality gate green.
