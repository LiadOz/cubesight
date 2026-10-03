# Review of the merged fleet work, 2026-10-03: what is missing and what is broken

Lead review of `feature/smart-cube-guidance` after the fleet fast-forwarded 219 commits into it. Measured and screenshotted in a real browser at 1440×900, 1280×720 and 390×844, Orbit dark, on a dev server.

**The short version:** the foundation was built (`src/ui/cube/`, `src/ui/orbit/`, the approved widget prototypes) but **the screens were never rebuilt on it**. The approved design exists in the repo and is not used by the app.

Read before starting: `AGENTS.md`, `docs/design/WIDGETS.md` (47 approved decisions; the design phase is over, nothing is re-designed), `docs/design/orbit-v3/` direction A frames, and `docs/ideas/SPEC-FLEET.md` (ground rules and the user's binding feedback).

## A. Blocking gaps: approved features that are absent

**A1. There is no Orbit on the solve screen.** The ring around the cube is the central approved component (W-02; the user: "the orbit around the cube is the centre of everything"). The solve screen shows a bare cube with no ring in any phase. Build it per direction A: the open dial with the gap at the bottom holding the one number that matters, the full ring while connecting (uniform colour, the current sweep look), stage segments while solving, and the scramble moves as labels around the ring (W-21 desktop option ①, sections = extra spacing, no brackets).

**A2. The cube is too small.** Measured ≈31% of viewport height; approved is XL ≈45–50% on desktop (`SPEC-FLEET` F0, and the user asked for a bigger cube repeatedly). Apply the approved size steps (XL solve hero, L drills, M inline).

**A3. The config bar is plain text,** not the approved selection controls (W-05/06/07/08, option ③ "ink", selected = cream with a ✓). Same for every other settings surface.

**A4. Keycaps are flat squares.** Approved is **bevelled** (W-17), and *only* keyboard keys may be bevelled; combined keys use the cap–cap form (`[` – `]`, `1` – `4`).

**A5. The drills hero cube sits in a framed card.** Approved is containers ① **frameless** (W-10/14/15/29): sections are space and a heading; only lists and logs get a panel. Audit every screen for stray frames.

## B. Rule violations

**B1. `#/drills` scrolls by 249 px and `#/algs` by 137 px at 1440×900.** Binding feedback #11: solve, drills and the algorithm library must fit the viewport without vertical scrolling at 1280×720 and above. (Results, history and progress may scroll.) The F8 layout suite was supposed to catch this: either it does not cover these pages or the assertion is missing — fix the suite as well as the pages.

**B2. Verify the rest of the approved set is actually in use,** not merely present as modules: buttons ① quiet fill, status/toast ① bottom-right, lists ① open rows with the mini Orbit and count pills, navigation ③ (side rail, arrow links with crumbs, the cube chip opening a right drawer), inputs ① filled pill fields, timer ① (hidden = the word "hidden"), the coach line ① with the dotted connector, charts ③ (the Orbit for a few structural items, real charts where many points are compared), progress shown only via the Orbit.

## C. Correct, do not regress

The header matches the approved A design (wordmark, nav `solve · drills · algs · progress · history`, theme toggle, cube chip with battery, help). No footer anywhere. One canvas per page. No horizontal overflow at 1440, 1280 or 390 px on solve, drills, algs, timer, progress or history. Nav structure and drill list content are sound.

## D. Not reproduced, needs the user's input

The user reports "pages with overflow". I could not reproduce horizontal overflow on any of the six routes at three widths. Ask for the page and width, or look at states I did not reach (mid-solve, drawer open, results, review, a drill mid-round).

## E. Process failures that caused this (fix alongside)

1. **219 commits were fast-forwarded into the user's trunk with no review and no gate.** `AGENTS.md`: agents never merge to trunk; the lead reviews. F18's merge queue exists precisely to stop this — implement it and route everything through it.
2. **The merge broke the user's checkout twice:** it introduced a dependency (`es-module-lexer`) that was not installed here, so the pre-commit hook crashed and no commit could be made; and separately `core.bare = true` was set in the user's `.git/config`, which made git refuse to operate on the working tree. Both are now fixed. Agents must never run git or npm against `/home/loz/projects/cubesight`.
3. **Infrastructure was prioritised over the visible product.** A day produced test selectors, snapshot harnesses and performance budgets, while the screens the user looks at were untouched. The next wave reverses that: screens first.

## F. Test budgets (the user's hard limits)

Current measured baseline: **290 tests, 10.7 min wall clock, green** (`workers: 2`); 20.6 min of summed test time; 35 tests over 10 s. Required: **Tier 1 merge gate ≤ 60 s**, **Tier 2 full regression ≤ 10 min**. See `SPEC-FLEET` F19 for how (seed states instead of simulating them; set up once and capture many; prune the visual matrices deliberately), and the rule that no assertion may be deleted to hit a budget.

## Order of work

1. A1 and A2 (the Orbit and the cube size) — this is what the user sees first.
2. B1 (no scrolling on drills and algs) and the F8 coverage hole that let it through.
3. A3, A4, A5 and B2 (use the approved widgets everywhere).
4. E1 (the merge queue) before the next wave merges anything.
5. F (test budgets).

**Acceptance:** screenshots of solve (idle, connecting, scramble, inspection, solving, results), drills, algs, progress and history at 1440×900 and 390×844, Orbit dark, published as a gallery post, each showing the Orbit and the approved widgets; no scrolling on solve/drills/algs; the layout suite covering those pages; the full gate green.
