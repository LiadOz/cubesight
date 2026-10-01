# Voice and words

One vocabulary for every page, drill and message in cubesight. If a word is in
the glossary, use it, and only it. If a word is in the "never say" column, it
does not ship.

Status: proposal, written against the tree at `feature/smart-cube-guidance`
(2026-09-30). Sources audited: `src/*.js`, `src/brain/*.js`, and the copy in
`docs/design/brain-v2/**/README.md`, `review/SPEC.md` and the trainers mock
generator (`trainers/_src/genT.mjs`). Nav is `solve · drills · algs · progress`.
"Brain" is being retired as a name; the smart-cube screen is "solve".

Open decisions are marked **[D1]**, **[D2]** ... and collected in section 8.

---

## 1. Principles

1. **Talk like a cuber, not a manual.** PB, ao5, EO, AUF, recog, x-cross,
   lookahead. If a cuber would say it at a comp, use their word; never a
   textbook or chess word (no blunder, brilliant, mistake, inaccuracy, book
   move, excellent).
2. **One thing, one word, everywhere.** A concept has exactly one name. If two
   trainers do the same action, the button reads the same. Synonyms are bugs.
3. **Short and quiet, like monkeytype.** Labels are one or two words, lowercase,
   no full stop. Numbers are the hero; words stay out of their way. No filler
   ("Please", "Successfully", "Click here to").
4. **A friendly coach, not a referee.** Lead with what worked, then one idea,
   then a next step. Say "next time" and "worth a look", never "you should
   have" or "wrong". Celebrate real wins (PB, skip, clean solve) with at most
   one exclamation mark, and never for a miss.
5. **Specific over nice.** A message carries the number and the moves
   ("1.9 s pause before G perms, others 0.6 s"), never "Good job!" alone.
6. **Say what happens next.** Every empty state, error and pause names the
   action that fixes it, using the same verb the button uses.
7. **Never blame the user or the cube.** "The cube didn't report its state.
   Try again." not "Error: timeout". Keep technical detail in the dev log, not
   on the main screen.
8. **One spelling, one format.** American English (**[D2]**), seconds with two
   decimals, real minus sign, one prime character. Section 4.

### Casing rule (short version, **[D3]**)

| where | rule | example |
|---|---|---|
| nav, buttons, tabs, chips, labels, table headers, hints | lowercase, no full stop | `next scramble`, `retry misses` |
| acronyms and stat names in any of those | canonical case: upper for PB, PLL, OLL, F2L, EO, CO, CP, EP, AUF, TPS, DNF; lower for ao5, ao12, ao50, ao100, mo3 | `PLL recognition`, `ao12 15.03` |
| case and alg names | as written in cubing | `Aa`, `Ub`, `T-perm`, `Sune`, `OLL 21` |
| coach text, status, toasts, errors, empty states | sentence case, ends with a full stop, at most two sentences | `Cross took 9 moves. 6 was possible on yellow.` |
| device and brand names | as the maker writes them | `GAN 356 i3`, `Chrome` |
| all caps | never typed in source; style with CSS only if a theme asks | not `'CASE 001'` |

The mocks currently lowercase acronyms in chrome (`pll drill`, `f2l deduction`).
**[D3]** recommends the canonical case above, because cubers write PLL and PB
in capitals and a lowercase `pll` looks like a typo next to `Aa`. Everything
else in the mocks is already lowercase-first.

---

## 2. Glossary

Columns: what it means, where to use it, what **never** to write instead, an
example of it in a real string.

### 2.1 Actions

| term | meaning | use for | never say instead | example |
|---|---|---|---|---|
| **solve** (verb) | do a full solve with the cube | the solve screen, nav | play, practice, train, run | `ready to solve` |
| **start** | begin a solve, a round, a scan | primary button when idle | begin, launch, go, play, run it, "start training" | `start` / `start round` |
| **drill** (verb/noun) | a focused exercise from the drills section | "drill this", "drills" nav | practice, train, training, trainer, exercise, mini-game | `drill this` / `3 drills` |
| **round** | one timed or counted run of a drill | quick mode, results | sprint, session (for a drill), game, trial | `start round` |
| **next** | advance to the next case, scramble or move | after an answer, after a solve, playback arrows | continue, proceed, go on, forward, "run it again" | `next case` / `next scramble` |
| **again** / **one more round** | repeat the same round with the same settings | end of a round (phone) | replay, restart round, "run it again" | `one more round` |
| **retry** | repeat the same scramble, moment or missed cases | review, results | redo, try again, replay, reattempt | `retry misses` / `retry this moment` |
| **skip** | pass on a case without answering; also the noun for a free stage | drills, the skip toast | pass, dismiss, "not sure" | `skip` / `EO skip` |
| **reveal** | uncover an answer, cue, plan or hint the user was asked to find first | scout plan, PLL cue and alg, best move, F2L answer | show answer, show solution, uncover, peek | `reveal plan` / `reveal best move` |
| **show / hide** | toggle something always allowed | entries, timer, inferred labels, notation | reveal (for toggles) | `show entries` |
| **review** | look back over a finished solve (chess.com-style) | the review screen only | analyze, analyse, analysis, debrief, "solve complete" card | `review solve` |
| **due** | a drill case the spaced schedule wants again | drill queue counts | "review" (taken by solve review), "ready to review", retrieval, corrective | `14 due` |
| **find plans** | search cross / x-cross / xx-cross plans for a scramble | cross planning drill | analyze, calculate, solve the cross | `find plans` |
| **connect** / **disconnect** | pair the smart cube over Bluetooth | cube chip | pair, link, attach | `connect cube` |
| **sync** | tell the app the physical cube is solved so tracking starts | after connect, before a solve | reset, calibrate, baseline, "sync solved cube" (long form) | `solve the cube, then sync` |
| **recenter** | re-align the 3D cube's motion to how you hold the cube now | gyro cubes | reset view, calibrate, "recenter motion" (long form) | `recenter` |
| **reset view** | put the 3D camera back to its default angle | 3D view only | reload view, rebuild view, recenter | `reset view` |
| **restart** | go back to move 0 of a plan or replay | plan playback | reset (taken by view) | `restart` |
| **stop** | end a run in progress without saving it | stop a solve, search, replay | cancel, abort, exit, quit, "cancel solve" | `stop solve` |
| **back** | leave a screen or panel | drills -> solve, close panel | return, exit, close (for panels close is fine) | `back to solve` |
| **save** | keep something inside the app on this device | saved cube address, saved solve | log, record, store, persist | `solve saved` |
| **clear** | delete stored data; always asks first | history, log | reset, wipe, delete (except the confirm button) | `clear history` |
| **forget** | remove a remembered device | saved cube address | "clear saved", unpair | `forget this cube` |
| **export / import** | write to / read from a backup file | settings, data | download, upload, backup (as a verb), restore, load | `export data` |
| **copy** | put text on the clipboard | alg, scramble | "copy to clipboard" | `copy alg` |
| **settings** | the one page of options | `tab` | preferences, options, config, "training settings", setup | `settings` |
| **pause / resume** | drill timer stopped by inactivity, then continue | pause overlay | break, hold, "resume with a fresh case" | `resume` |

### 2.2 Objects

| term | meaning | use for | never say instead | example |
|---|---|---|---|---|
| **solve** (noun) | one full solve of the cube | counts, history, review | attempt, run, trial, try | `23 solves` |
| **scramble** | the move sequence that mixes the cube | everything | shuffle, mix (as noun), "case" (for a scramble) | `next scramble` |
| **case** | one question in a drill; for algs, one alg case (Aa, OLL 21) | drill progress, alg list | trial, attempt, question, probe, problem, item | `case 13 of 20` |
| **answer** | one response to a case | counts inside a round | guess, pick, response, entry | `12 answered` |
| **round** | see actions | round length, results | sprint, session (drill), run | `2 min round` |
| **session** | everything since you opened solve, or a day of solving | solve stats ("this session") | drill run, round | `ao12 this session` |
| **miss** | an answer that was wrong, or a timeout | drill results, tally | error, wrong, incorrect, fail, mistake, "missed it" | `1 miss` |
| **alg** | a move sequence that solves a case | algorithm database, drills | algorithm (except in page titles), formula, sequence | `T-perm alg` |
| **move** | one item in notation (R, U2, r, M) | counts, plans, review | turn (as a noun count), step | `68 moves` |
| **turn** | the physical action, or TPS | verb only, TPS long form | "turns" as a count noun | `turn the top layer` / `turns per second` |
| **split** | time for one stage | timeline, results | lap, segment, phase time | `cross 2.08` |
| **stage** | one part of a solve (cross, F2L, EO...) | timeline, stats | phase, step, segment, lane, block (user-facing) | `stage accuracy` |
| **F2L pair** / **pair** | a corner and its edge joined, before inserting | first mention "F2L pair", then "pair" | match, couple, slot (slot is the place) | `pair 3` |
| **slot** | where a pair goes (FR, FL, BR, BL) | plans, review | pocket, hole | `FR slot` |
| **pseudo pair** | a pair solved while the D layer is offset | setting, review, labels | pseudo-slot (noun), pseudo F2L, D-shift pair | `pair 3 went in pseudo` |
| **D offset** | the D layer is turned off its home position | pseudo state | D shift, shifted D layer, "shift D layer" | `D offset: D′` |
| **x-cross** / **xx-cross** | cross plus 1 / 2 pairs | everywhere | double X, extended cross, XX cross, double x-cross | `xx-cross on white` |
| **cross** | the four edges on the bottom | everywhere | "bottom cross" | `cross took 9 moves` |
| **CN** | color neutral, any face may be the cross | settings, scout | "color-neutral" after first use, free face | `CN, all six` |
| **lookahead** | seeing the next pair or step while you execute | coach, review | "planning ahead", "anticipation" | `that is lookahead working` |
| **inspection** | the 15 s before the clock starts | solve | "prep", "look time", "insp" outside compact chips | `inspection 8.7 s` |
| **scan** | the timed F2L deduction drill | F2L drill | "round" is the generic word; scan is the drill's name | `30 s scan` |
| **glance** | how long the cube is visible in a drill | drills | exposure, view time, flash, pace window | `glance 300 ms` |
| **cube** | the physical smart cube | connect, status | "device" (except BLE log), "smart cube" after the first mention | `cube connected` |
| **3D cube** / **preview** | the on-screen cube | when it matters | "mirror", "virtual cube", "model" | `preview follows your cube` |
| **backup** | the export file | data section | "data dump", "archive" | `backup exported` |

### 2.3 Stats

| term | meaning | use for | never say instead | example |
|---|---|---|---|---|
| **PB** | fastest single you have ever done; also `PB ao5`, `PB ao12` | everywhere an all-time best is shown | best (alone), record, high score, personal record, fastest | `PB 12.41` |
| **best / worst** | fastest / slowest in the window shown | "best of session", "worst in this ao5" | min, max, top | `best 13.2 · worst 18.9` |
| **ao5, ao12, ao50, ao100** | average of the last 5, 12, 50, 100 solves, dropping best and worst (WCA trim); lowercase always | stats, history | avg5, avg of 5, "average of 12", "Ao12", "AO12" | `ao12 15.03` |
| **mo3** | mean of 3, no trim | sessions, WCA-style formats | "mean of 3", "m3" | `mo3 14.88` |
| **mean** | plain average of all solves in the window | session summary | "average" for this meaning | `mean 15.41` |
| **avg** | chip-only short form of "your average for that stage or case" | split deltas, chips | "average" in a chip, "mean" for this | `vs avg` |
| **median** | middle value | recog times in drills | "typical", "usual", "med" | `median 0.71 s` |
| **TPS** | turns per second (`moves ÷ time`), two decimals | solve, review | "speed", "moves/s", "tps" | `4.83 TPS` |
| **recog** | time to recognise a case before you start the alg; "recognition" in full names | stats, labels | "response time", "reaction", "think time", "cue time" | `recog 0.71 s` |
| **exec** | time from first move of the alg to its end | stats | "alg time", "execution" in chips | `exec 1.4 s` |
| **pause** | a stop between moves (review label and stat) | review, stats | hesitation, lag, gap (except in dev), stall | `1.9 s pause` |
| **+2** | two-second penalty; time shown already includes it | solves, history | "plus two", "+2s", "2s penalty", "penalty" alone | `14.97+` |
| **DNF** | did not finish; raw time kept in brackets | solves, history | "fail", "failed", "invalid", "X" | `DNF(13.20)` |
| **combo** | answers in a row that were right (and, in timed rounds, fast) | drills, current and best | streak (taken by days) | `combo x7` |
| **streak** | days in a row with at least one round or solve | progress, phone home | "win streak", "current streak" for answers | `4-day streak` |
| **accuracy** | correct answers as a percent of answered, in drills | drill results | score, rate, "practice accuracy", "transfer accuracy" | `94%` |
| **efficiency** | how close the solve's moves were to ideal, 0-100 (what SPEC calls accuracy) | review **[D6]** | accuracy (taken by drills), rating, elo | `stage efficiency 92` |
| **level** | drill progression tier | progress | rank, rating, elo | `level 3` |

### 2.4 Stage names

Use exactly these strings in the timeline, splits, labels, and coach text.
Stage names are acronyms, so they follow the casing rule (upper).

| method | stages (config-driven; the timeline follows the method setting) | never |
|---|---|---|
| CFOP | `cross` `F2L` `EO` `CO` `PLL`, then `solved` (1-look OLL: `OLL`; 2-look PLL: `CP` `EP`) | "Phase", "OLL · orient edges", "Building the cross", "Last layer" as a stage |
| CFOP cross variants | `cross`, `x-cross`, `xx-cross` | "double X", "extended cross" |
| Roux | `FB` `SB` `CMLL` `L6E`, then `solved` | `First Block` (code) next to `SB` |
| inspection | `inspection` (compact chip: `insp 8.7`) | "prep", "look" |
| inside F2L | `pair 1` ... `pair 4` | "F2L 1", "slot 1" |

The word for the parts is **stage**; `phase` stays a code identifier and never
appears on screen (today `brain.js:138` shows an eyebrow "Phase").

### 2.5 Execution words (coach and review)

| term | meaning | never say instead |
|---|---|---|
| **skip** | a stage done for free (EO skip, CO skip, OLL skip, PLL skip, LL skip) | "lucky", "bonus" |
| **free pair** | a pair that came with another move | "bonus pair" |
| **rotation** | a whole-cube turn (x, y, z) | "cube turn", "flip", "reorient" |
| **regrip** | hands re-adjusted mid-alg (inferred, low confidence) | "readjust", "fumble" |
| **lockup** | fingers jammed and released (`X X′` within 150 ms) | "stuck", "jam" |
| **AUF** | adjust the U layer before or after an alg | "U-turn fix", "setup turn" |
| **cancel** | two moves merge or undo (`R R′`) - review label only | never the abort action, use **stop** |

### 2.6 Review labels (from `review/SPEC.md` section 3.1, scheme A "Cuber's words")

Shown as lowercase chips in Mono/Orbit chrome, capitalised in prose and docs.
Use these exact names; scheme B and C names are not shipped unless the user
picks them (SPEC section 16).

| tone | label | one-line meaning |
|---|---|---|
| positive | optimal | on a shortest path |
| positive | efficient | stage within 1 move of the reference |
| positive | clean | no waste, pause, cancel or rotation in the stage |
| positive | flow | no stop at the stage boundary (lookahead) |
| positive | skip | stage finished by the previous milestone (`EO skip`) |
| positive | free pair | two pairs in one move, or none spent |
| positive | x-cross | cross finished with a pair |
| positive | pseudo pair | pair solved under a D offset that saved moves |
| neutral | fine | nothing to flag |
| neutral | ok | waste of at most 1 |
| neutral | D fix | the turn that puts the D layer back |
| negative | extra move | one spare move |
| negative | detour | moved away from the goal |
| negative | cancel | wasteful same-axis run |
| negative | better pair | another slot was shorter |
| negative | better cross | another face was 2+ moves shorter |
| negative | missed x-cross | an x-cross was available |
| negative | pause | stop longer than your usual gap |
| negative | slow recog | pause before an EO/CO/OLL/PLL alg |
| negative | rotation | held bottom face changed |
| negative | extra AUF | more AUF than the case needs |
| negative | stray offset | D offset with no pair using it |
| inferred | regrip (likely), lockup (likely) | dashed, off by default |

Collisions to know about (none blocks shipping, all are noted):
`cancel` (label) vs the abort action: solved by reserving **stop** for the
action. `pause` (label) vs the drill pause overlay: same word, different
screens, accepted. `skip` (label) vs the skip action: they are the same idea
(a thing passed over) and fine. `accuracy` in SPEC section 5.2 vs drill accuracy:
see **[D6]**.

---

## 3. Coach vocabulary

Positive, in cubing language: `clean`, `nice`, `smooth`, `sharp`, `on pace`,
`fast`, `that is lookahead working`, `new PB`, `EO skip`, `free pair`.
Neutral next steps: `worth a look`, `next time`, `try`, `check the X slot
first`. Banned (chess or generic): blunder, brilliant, great move, excellent,
mistake, inaccuracy, book, forced, engine, "you should have", "wrong",
"incorrect", "failed", "unfortunately", "oops".

"not quite" is the one soft word for a missed answer.

---

## 4. Formatting

All of it lives in one module (section 7): `fmt.time`, `fmt.delta`,
`fmt.penalty`, `fmt.move`, `fmt.count`, `fmt.date`.

### 4.1 Times

| case | format | example | notes |
|---|---|---|---|
| a solve or average time | seconds, two decimals | `12.34` | drop the unit in big timers, tables and chips where the column or label says time |
| the same in a sentence or a label | number, space, `s` | `12.34 s` | one space, lowercase s. Never `12.34s`, `12.3 s`, `12.34 sec` |
| under 1 s | keep the leading zero | `0.71 s` | never `.71` |
| one minute or more | `m:ss.cc` | `1:02.34` | hours: `1:02:03.45` |
| inspection remaining | one decimal in text, whole seconds in the big countdown | `8.7 s`, `8` | |
| glance / exposure, BLE and input gaps | integer milliseconds with a space | `300 ms` | the only place ms appears. Never `300ms` |
| recog and drill results | seconds, two decimals | `0.71 s` | never switch to `710ms` mid-page (`recognition-profile.js:5` does today) |
| round lengths | `30 s`, `2 min` | `2 min round` | `2-minute round` only as an adjective |
| missing | em dash alone | `—` | no data, not enough solves for ao12 |
| TPS | two decimals, always upper `TPS` | `4.83 TPS` | |
| percent | no space | `94%` | |

### 4.2 Deltas

Deltas compare to a reference named next to them (`vs avg`, `vs PB`,
`vs before`). Always signed, always a real minus sign U+2212, two decimals,
negative means faster.

| do | don't |
|---|---|
| `−0.33` faster | `-0.33` (hyphen), `0.33 faster`, `(0.33)` |
| `+0.04` slower | `0.04`, `+0.04s` |
| `0.00` equal | `±0.00`, `+0.00` |
| `−0.33 vs avg` | `0.33 under average` |

Colour is never the only cue; the sign always shows.

### 4.3 Penalties

| state | list / history / chips | detail line | never |
|---|---|---|---|
| clean | `14.07` | | |
| +2 | `14.97+` (time includes the two seconds) | `12.97 +2 = 14.97` | `14.97 (+2)`, `12.97+2s`, `plus 2` |
| DNF | `DNF(13.20)` (raw time kept) | `DNF · 13.20 raw` | `DNF` with no time, `dnf` in lists, `13.20 DNF` |

Keys: `2` toggles +2, `d` marks DNF (from the solve spec). The text form `+2`
has a real plus and no space. `DNF` always upper-case in data and chips; the
command-line examples (`dnf in 1.2 s` in the A-04 mock) follow the **[D3]**
casing decision.

### 4.4 Move notation **[D1]**

| rule | display | accepted as input | notes |
|---|---|---|---|
| prime | `R′` (U+2032) | `R'` `R′` `R’` (U+2019, what phone keyboards type) `R‘` `` R` `` | stored as ASCII `R'`; convert once at render via `fmt.move()` |
| double | `R2` | `R2` `R2'` `R2′` `R2’` (all mean R2) | never `R²` |
| wide | `Rw` | `Rw` `r` `Rw'` | lowercase r is accepted as wide; display is always `Rw` |
| slice, rotation | `M E S` and `x y z` | same | |
| separators | one space | spaces, commas, newlines | |
| alg shown in mono type | exact display string above | | copy gives ASCII `'` so it pastes into any timer or solver |
| coach text | moves in the user's held-frame notation, in `code` style | | |

The mocks (A-06 `d′ aligned`), review SPEC ("the proper prime character") and
`cross-scout.js:43` already say `′`; the code's data and most text are ASCII
`'`. Decision needed only on whether the UI font draws `′` well; see **[D1]**.

### 4.5 Counts, plurals, ranges

* Digits always (`3 pairs`, never `three pairs`), except in fixed phrases
  ("one more round", "one-glance recall").
* Plural through `plural(n, 'move')`; never `move(s)`; `0 moves`, `1 move`.
* "n of m" in labels and sentences (`4 of 6 found`, `case 13 of 20`); `n/m`
  only inside a compact counter or chip (`13/20`).
* Multiplier uses the times sign: `combo ×7`. Not `x7`, not `7x`.
* Range and separators inside a label: `·` (middle dot) between fields,
  en dash for a range (`15–17 s`), never ` - ` or ` | `.
* Em dash inside a sentence is not used. Use a full stop or a comma
  (`solve-coach.js:52`, `brain.js:353` use one today).

### 4.6 Dates

| case | format | example |
|---|---|---|
| this year | day, short month lowercase | `31 aug` |
| other year | add the year | `31 aug 2025` |
| today, yesterday | words | `today`, `yesterday` |
| relative, under a week | number, unit, `ago` or `in` | `3 h ago`, `4 days ago`, `in 3 days` |
| due time | `in 10 min`, `tomorrow`, `in 3 days` | |
| times of day | 24-hour | `18:40` |
| files and keys | ISO | `2026-09-30` |

Never locale-default output (`recognition-profile.js:65` uses
`toLocaleString(undefined, ...)`, so every browser prints a different order).

---

## 5. Keyboard wording and key map

### 5.1 Hint bar wording

* Format: keycap, then a one-word lowercase verb: `space next · s skip · r retry · tab settings`.
* Keycap text is lowercase and literal: `space`, `enter`, `esc`, `tab`, `s`.
  Not `S`, `Space bar`, `Return` (`main.js:254`, `pll-trainer.js:137` print `S`).
* Use the glossary verb: `next`, `skip`, `retry`, `stop`, `back`, `settings`,
  `reveal`. A hint never introduces a new word.
* Show only the keys that are live in the current state. Answer keys and
  action keys never appear together (see conflicts).
* On touch devices the bar is hidden **[D7]**; the same verbs are the button text.
* Two keys for one action: show the primary only (`space`), document the alias
  (`enter`) in the help overlay (`?`).

### 5.2 Shared key map

| key | verb | meaning everywhere | notes |
|---|---|---|---|
| `space` | next / start | primary: start a solve or round, next scramble, next case, one more round | never destructive |
| `enter` | next / accept | alias of `space` after an answer; accepts the focused suggestion; starts a quick round from the hub | |
| `esc` | stop / back | stops or closes what is open (solve, panel, dialog); with nothing open, opens the command line | **[D4]** |
| `tab` | settings | settings page or bar (Orbit and Mono) | today Orbit uses `esc`; unify on `tab` |
| `s` | skip | skip the case; never "start", never "share" | F2L scan start moves to `space`; Brain "share" moves to `c` (copy link) |
| `r` | retry | retry this scramble, this moment, or the misses | only live on idle and results screens |
| `b` | back | back to solve when you came from solve | only live on results screens |
| `f` | drill this | open the matching drill, pre-filtered | hub `f` = F2L shortcut is dropped (hub uses `1-3`) |
| `x` | scout | open this cross in cross scout | |
| `p` | progress | this drill's progress | |
| `2` / `d` | +2 / DNF | toggle the penalty on the last solve | solve and review only |
| `?` | help | key map and glossary | |
| `1-9` | answer | pick the n-th answer | drills, only while a case is open |
| `w y g b r o` | answer | corner colors, only while a case is open | |
| per-case keys | answer | PLL: `1 2 ... 0 q w ... a` on the full set; `1-N` on a filtered set | only while a case is open |

### 5.3 Conflicts found and their resolution

| conflict | where | resolution |
|---|---|---|
| `s` = skip (corners `main.js:1662`, PLL `pll-trainer.js:339`) vs `s` = start scan (F2L `main.js:1652`) vs `s` = share (Brain, trainers README) | three meanings | `s` is skip only. F2L scan starts on `space`. Share becomes `c` |
| `n` = next (corner recall `main.js:1657`) vs `n` = new case/skip (F2L `main.js:1654`) vs `enter` = next (PLL) | three nexts | drop `n`. `space` and `enter` both mean next after an answer |
| `r` = red answer (corners), `r` = answer key in PLL (`q w e r t y`), `r` = retry | answers vs action | state-scoped: answer keys live only while a case is open, `r` only on results. Test enforces it (section 7) |
| `b` = blue answer (corners) vs `b` = back to solve | same | same state scoping |
| `f` = drill this (solve results) vs `f` = F2L (hub) | trainers README open question 5 | hub uses `1-3` for "for you" and `enter` to open; `f` stays "drill this" |
| `esc` = settings/command line (README) vs `esc` = abort | overloaded | abort first, command line when nothing is open **[D4]** |
| `space` = next scramble (solve) vs "one more round" (drills) | same verb, different object | intentional: both read `space next`; the hint names the object (`space next scramble`, `space one more round`) |

---

## 6. Messages and states

### 6.1 Patterns

| kind | shape | example |
|---|---|---|
| **empty** | what is missing, then the action, one sentence | `No solves yet. Connect your cube and solve.` |
| **loading** | `loading <thing>…` (lowercase, one ellipsis character) | `loading solve…` |
| **working** | present participle, same thing you clicked | `finding plans…`, `generating scramble…` |
| **error** | what did not happen, then what to do; no exception text | `Couldn't load drills. Reload and try again.` |
| **success / toast** | past tense, the object, and the number if any | `Solve saved · 12.41 PB` |
| **pause** | friendly and blame-free, says nothing was lost or scored | `Taking a break? This one won't count. Space to resume.` |
| **result line** | `n answered · n miss · median x.xx s` | `12 answered · 1 miss · 0.71 s median` |
| **coach bubble** | (what worked) + number + moves + next idea, max two sentences | see 6.3 |

Short technical detail goes to the dev log, never the main line
(`Load failed: HTTP 500` is for the dev area).

### 6.2 Do and don't

| situation | don't | do |
|---|---|---|
| empty drill history | `Eight corner families will be tracked here.` | `No cases yet. Start a round.` |
| no cube | `No cube connected` / `Connect a smart cube to start.` (two phrasings) | `No cube. Connect to start.` |
| not synced | `Connect and sync a solved cube first.` / `Sync a solved cube before starting a guided scramble.` / `Solve the cube (or sync) before...` | `Solve the cube, then sync.` (one sentence everywhere) |
| module fails | `Brain could not load: ${message}` / `Cross Scout could not load: ${message}. Switch trainers and try again.` | `Couldn't load solve. Reload and try again.` |
| missed answer | `× Not quite · Red was correct` / `Skipped — it was Green` | `Not quite, it was red.` / `Skipped, it was green.` |
| correct answer | `✓ Correct · White` / `Correct — 0.71s` | `Nice · 0.71 s` |
| PB | `Best 12.41s` | `New PB 12.41. −0.33.` |
| unscored | `This trial was not recorded—your times, accuracy, and adaptive pace are unchanged.` | `Taking a break? This one won't count.` |
| skip toast | `EO skipped — edges oriented while solving F2L!` | `EO skip!` |
| stored | `Solve logged` / `unscored` / `not recorded` | `Solve saved` / `won't count` |
| privacy line | three wordings (see audit A20) | `Everything stays on this device.` |
| overly long help | two paragraphs in an empty state | one sentence, link to `?` |

### 6.3 Coach templates

Write these from the variables in the review spec (section 9 of
`review/SPEC.md`), and keep them this short. At most two sentences plus the
notation line. Lead with what worked. No "you should have".

| label | template | example |
|---|---|---|
| optimal | `{move} is exactly right. {d} moves left, none spare.` | `R′ is exactly right. 4 moves left, none spare.` |
| extra move | `{move} cost one spare move. Best from here: {best}.` | `U cost one spare move. Best from here: D R F.` |
| cross total | `Cross took {n}. {opt} was possible on {face}: {alg}.` | `Cross took 8. 6 was possible on yellow: D R′ F.` |
| better cross | `{face} cross was {len} moves: {alg}. Worth a look in inspection.` | |
| skip | `{stage} skip! {saved} moves saved.` | `EO skip! 4 moves saved.` |
| free pair | `Pair {k} came free. Nice setup.` | |
| pause | `{gap} s pause before {move}. You usually move every {median} s. Try looking at the next pair while you insert.` | `1.9 s pause before R. ...` |
| slow recog | `{gap} s recog on {case}. Your last {n} average {avg} s.` | `1.9 s recog on Gc. Your last 5 average 0.6 s.` |
| flow | `No stop between {prev} and {next}. That is lookahead working.` | |
| pseudo | `Pair {k} went in pseudo: {saved} moves fewer than the best normal pair.` | |
| rotation | `The cube turned in your hands before {move} ({rot}).` | |
| weak case (drill) | `{case} read as {other}, twice. Find the {cue} first.` | `Gc read as Ga, twice. Find the bar pattern first.` |
| drill result | `{n} answered · {m} miss · {x.xx} s median. {case} comes back in {when}.` | |
| end of round | `Clean round. One more?` / `Good round, 2 misses. Retry them?` | |
| fallback no timing | `No per-move times for this solve, so I can judge your moves but not your pauses.` | |

---

## 7. Enforcing it in code (proposal)

Nothing below is applied yet; `src/` is being rewritten by the UI builders.

### 7.1 One terms module

`src/copy/terms.js` (plain ES module, no dependencies, importable from node
tests):

```js
export const T = {           // the glossary as constants; buttons and labels import these
  start: 'start', next: 'next', again: 'one more round', retry: 'retry', skip: 'skip',
  reveal: 'reveal', stop: 'stop', back: 'back', sync: 'sync', recenter: 'recenter',
  connect: 'connect cube', disconnect: 'disconnect', settings: 'settings',
  exportData: 'export data', importData: 'import data', clear: 'clear',
  nav: { solve: 'solve', drills: 'drills', algs: 'algs', progress: 'progress' },
  stage: { cross: 'cross', f2l: 'F2L', eo: 'EO', co: 'CO', cp: 'CP', ep: 'EP', pll: 'PLL',
           fb: 'FB', sb: 'SB', cmll: 'CMLL', l6e: 'L6E', solved: 'solved' },
  stat: { pb: 'PB', tps: 'TPS', recog: 'recog', ao5: 'ao5', ao12: 'ao12', mo3: 'mo3' },
  label: { /* the review labels from section 2.6 */ },
};
export const MSG = {         // every shared sentence, with {placeholders}
  noCube: 'No cube. Connect to start.',
  syncFirst: 'Solve the cube, then sync.',
  stays: 'Everything stays on this device.',
  loadFailed: name => `Couldn't load ${name}. Reload and try again.`,
  // ... coach templates from section 6.3
};
export const fmt = {         // section 4 as code, unit-tested once
  time(ms, { unit = false } = {}) {},      // 12.34 | 12.34 s | 1:02.34 | —
  delta(ms) {},                            // −0.33 | +0.04 | 0.00  (U+2212)
  penalty(rec) {},                         // 14.97+ | DNF(13.20)
  move(m) {}, moves(str) {},               // ' -> ′
  parseMoves(str) {},                      // accepts ' ′ ’ ‘ ` and lower-case wide
  count(n, noun) {},                       // plural()
  date(ts, now) {},
};
export const KEYS = {        // one key map; hint bar and handlers both read it
  global:  { space: 'next', enter: 'next', esc: 'stop', tab: 'settings', '?': 'help' },
  results: { r: 'retry', b: 'back', f: 'drill this', x: 'scout', p: 'progress' },
  case:    { s: 'skip' },       // answer keys are added per drill, see below
};
```

Rules for builders:

* Import, do not retype. A button whose label is in the glossary takes it
  from `T`; a number takes it from `fmt`. One-off prose (a help paragraph) may
  stay a literal but must pass the lint.
* Replace the four private time formatters (`brain.js:19`, `main.js:852`,
  `pll-trainer.js:156,177`, `recognition-profile.js:5`, `cross-scout.js:23`)
  with `fmt.time`.
* The hint bar renders from `KEYS[state]`, so it cannot show a key the handler
  does not bind. Key handlers (`main.js:1647`, `pll-trainer.js:337`) look up
  `KEYS` instead of hard-coding letters.

### 7.2 Lint for banned synonyms

Two layers, both cheap:

1. **Unit test** `tests/copy.test.js` (runs in the normal test task). It reads
   `src/**/*.js`, extracts string and template literals with a small regex
   tokenizer that skips comments, `import` paths, CSS selectors and identifiers,
   keeps only literals that look user-facing (contain a space and a letter, or
   start with a capital, or sit in `textContent`, `aria-label`, `title`,
   `placeholder`, `>text<`), then tests each against `BANNED`:

   ```js
   export const BANNED = [
     [/\b(practi[cs]e|train(ing|er)?)\b/i, 'drill'],
     [/\b(analy[sz]e|analysis)\b/i, 'review (solve) / find plans (scout)'],
     [/\bcontinue\b/i, 'next (or resume)'],
     [/\b(attempt|trial|probe|retrieval|sprint)s?\b/i, 'case / answer / round / recall'],
     [/\bcancel(?! \(label\))\b/i, 'stop'],
     [/\b(colour|recognis|practis|centre|unlabelled)/i, 'American spelling'],
     [/\bdouble x(-| )?cross|extended cross\b/i, 'xx-cross / x-cross'],
     [/\b(pseudo[- ]?F2L|D[- ]shift|shift(ed)? D\b)/i, 'pseudo pair / D offset'],
     [/\bbest\b(?! (move|of|next))/i, 'PB (all-time) or "best of session"'],
     [/\b\d+(\.\d+)?(s|ms)\b/, 'number, space, unit: 12.34 s, 300 ms'],
     [/\bturns?\b(?= \d)|\b\d+ turns?\b/i, 'moves'],
     [/\b(blunder|brilliant|mistake|inaccuracy|excellent)\b/i, 'coach words (section 3)'],
     [/ — /, 'use "·" or a full stop'],
     [/[A-Z]{5,}/, 'no all-caps in source; use CSS'],
     [/\b(Brain)\b/, 'solve'],
   ];
   ```

   Output is `file:line  "text"  -> use <replacement>`, same shape as the audit
   table, so the test failure is the to-do list.
2. **Key-map test**: for each state in `KEYS` (idle, case open, answered,
   results), assert no key is bound twice, and that answer keys and action keys
   are never live in the same state. This is what catches `r`/`b`/`s` today.

Introduce it as a **ratchet**: commit `tests/copy-baseline.json` with the
current violations (one entry per `file:line`), fail when a new one appears or
when a fixed one is still listed. Delete the baseline when the audit table is
applied. A line that must keep a banned word (for example the review label
`cancel`) gets `// copy-ok: <reason>`.

Optional third layer: an ESLint `no-restricted-syntax` rule with
`Literal[value=/…/]` and `TemplateElement[value.raw=/…/]` selectors built from
the same `BANNED` array, so the editor flags it while typing (`eslint.config.js`
already exists).

### 7.3 Docs

The mocks (`trainers/_src/genT.mjs`, `review/_src/gen.mjs`,
`brain-v2/_src/gen*.mjs`) should import `T`, `MSG` and `fmt` too, so the
renders stay in sync with the app. Until then they need the small fixes in the
audit (A10, A12, A19).

---

## 8. Decisions needed

| # | decision | recommendation | why it matters |
|---|---|---|---|
| **D1** | prime symbol in the UI | `′` (U+2032) for display, ASCII `'` stored and copied, accept all primes as input | SPEC and mocks already assume `′`; needs a quick check that the UI font (DM Mono, Manrope) draws it at 30 px. Fallback: curly `’` is wrong, keep ASCII `'` |
| **D2** | spelling | American (`color`, `recognize`, `center`, `practice` if used at all) | code is almost all American; the mock text and docs use `colour`, `recognise`, `centre`; WCA text is American |
| **D3** | acronym casing in lowercase chrome | canonical (`PLL recognition`, `PB`, `DNF`), lowercase for ao5/ao12/mo3 | the mocks lowercase them; this is the one place they disagree with "the way cubers write" |
| **D4** | `esc` | abort first, command line if nothing is open; `tab` = settings everywhere | README says `esc` = settings in Orbit and `tab` in Mono |
| **D5** | the drill pace mode "transfer" | rename to `random AUF` (or `check`) | "transfer probe" and "retrieval" are learning-science words, not cuber words |
| **D6** | review "accuracy" | call it `efficiency` in the UI (code already has `efficiencyScore`), keep "accuracy" for drills | two meanings of one word on the same progress page |
| **D7** | keycaps on touch | hide the bar, keep the verbs as button text | trainers README open question 6 |
| **D8** | which label scheme for review | scheme A "Cuber's words" as recommended; scheme B only for the avatar voice | section 2.6 uses A |
| **D9** | `best move` in review | keep (plain words), never "engine" or "line" | it reads chess-like; `best continuation` is the safer alternative |
| **D10** | `Cross Scout` name | `cross scout` in drill lists, `Cross Scout` only in prose | README already decides lowercase for drills, but the tool is a proper name |

---

## 9. Audit findings

Method: read every user-facing string in `src/`; grep for duplicates and
near-duplicates; compare with the brain-v2 and trainers mock copy. Line
numbers are from the tree on 2026-09-30 and will drift while the builders
integrate the new UI, so search by the quoted text.

Priority: **P1** contradicts another screen or the decided structure, fix
first. **P2** inconsistent wording. **P3** polish.

### 9.1 Top ten

1. **Three to four different time formats**: `12.34s` (`brain.js:19`, `main.js:852`, `pll-trainer.js:156`), `12.3 s` (`cross-scout.js:23`), `710ms` (`recognition-profile.js:5`), `25 ms` (`main.js:588`), `0.71 s` in every mock.
2. **"Best" instead of PB**: `brain.js:470,495`, `main.js:860,942`; and "Best" means a streak in `main.js:268`.
3. **Practice / Train / Drill / Sprint / Round** all mean "a drill": `Practice / Corners`, `Training settings`, `Open practice`, `10-answer sprint`, `Start training`, `Practice paused`, `Corner drill`.
4. **Case / trial / attempt / answer**: `CASE 001` (`main.js:241`), `TRIAL 001` (`pll-trainer.js:274`), `Attempt N` (`recognition-profile.js:126`), `plan retrievals` (`cross-scout.js:131`).
5. **Next / Continue / Skip**: `Continue` (`brain.js:472`), `Next cube →` (`main.js:255`), `Next case →` (`pll-trainer.js:137`), `Skip case N` (`main.js:315`), `Run it again` (`main.js:340`); and `n`, `enter`, `s` all mean next or skip in different trainers.
6. **"Reset view" means two things** in `brain.js:125` and `brain.js:148`, and `cross-scout.js:263` tells the user to tap "Reset view" while the button is "Recenter motion" (`cross-scout.js:46`).
7. **Analyze vs review**: scout `Analyze` (`cross-scout.js:227`), session text `then Analyze` (`smart-cube-session.js:51,125`), while "review" is now the solve review.
8. **Pseudo pair has five names**: `Pseudo pairs · shift D` (`main.js:292`), `Shift D layer` (`main.js:294`), `Pseudo F2L · D-shift` (`brain.js:156`), `D offset` (`main.js:1190`), `shifted cross/pair` (`main.js:1076`).
9. **x-cross naming**: `Double X` (`brain.js:155`), `Extended cross` (`brain.js:368,479`), `double X-cross` (`cross-scout.js:58,69,296`), mocks `xx-cross`.
10. **Casing, spelling, source caps**: `Cross Scout`/`Brain` title case next to the lowercase mocks; `practise` (`pll-trainer.js:26`), `Unlabelled` (`recognition-profile.js:216`), `colour`/`recognise` in mocks; `CASE 001`, `WHITE BOTTOM`, `LEARN · ALL CASES` typed in caps.

### 9.2 Table

| P | file:line | current | issue | replacement |
|---|---|---|---|---|
| A1 P1 | `brain.js:19` | `${(v/1000).toFixed(2)}s`, non-finite gives `DNF` | `12.34s` unit glued; DNF loses the raw time | `fmt.time` (`12.34`, `12.34 s` in text); `DNF(13.20)` |
| A2 P1 | `main.js:852,859,868,941`; `pll-trainer.js:156,177`; `main.js:685,704,735` | `formatMs` -> `0.71s`, `<span>s</span>` | second copy of the formatter; unit style differs | `fmt.time(ms)`; big timers drop the unit |
| A3 P1 | `cross-scout.js:23` | `(v/1000).toFixed(1) s` | one decimal and a space, unlike the rest | `fmt.time` |
| A4 P1 | `recognition-profile.js:5` | `${Math.round(v)}ms` | drill times in ms while PLL shows s | `fmt.time(ms)` -> `0.71 s` |
| A5 P1 | `main.js:588`, mocks | `25 ms` vs `25ms` | only ms place; unit spacing | `300 ms` (space) |
| A6 P1 | `brain.js:470`, `brain.js:495` | `Best ${ms(...)}`, `['Best', ...]` | PB not used | `PB` |
| A7 P1 | `main.js:860`, `main.js:942` | `Best ${formatMs}`, `<span>Best</span>` | same; drill best is "best" of the round | `PB` (all-time) or `best` (this round) |
| A8 P1 | `main.js:268` | `Current streak` / `Best: 0` | streak = days; this is correct answers in a row | `combo` / `best combo` |
| A9 P1 | `brain.js:472` | `Continue` | closes results and gets the next scramble | `next` (`space`) |
| A10 P1 | `main.js:255` | `Next cube →` | "cube" for a case | `next` |
| A11 P1 | `pll-trainer.js:137` | `Next case →` | fine word, arrow glyph is decoration | `next` |
| A12 P1 | `main.js:315`, `main.js:1215` | `Skip case <kbd>N</kbd>`; aria `Continue to the next F2L case` | `n` and "continue" | `skip` with `s`; aria `next case` |
| A13 P1 | `main.js:340` | `Run it again` | "again" word differs from phone mock | `one more round` |
| A14 P1 | `main.js:1649,1652` | F2L: `s` starts scan | `s` = skip elsewhere | `space` starts scan |
| A15 P1 | `main.js:1657` | recall `n` for next | extra key | `space`/`enter` |
| A16 P1 | `brain.js:125` and `brain.js:148` | `Reset view` and `Reset view` | different actions, same label | `reset view` (camera) and `reload view` (rebuild); or drop the second |
| A17 P1 | `cross-scout.js:263` | `tap Reset view to align its motion` | button is named `Recenter motion` (`:46`) | `tap recenter` |
| A18 P1 | `cross-scout.js:46`, `brain.js:129` | `Sync solved cube` / `Sync`; `Recenter motion` / `Recenter` | long and short forms of one action | `sync`, `recenter` |
| A19 P1 | `cross-scout.js:227`, `:263,:202,:208`; `smart-cube-session.js:51,125`; `main.js:1384` | `Analyze`, `Analyze current cube`, `then Analyze` | "review" is the solve review | `find plans`, `find plans for this cube` |
| A20 P1 | `main.js:331`; `brain.js:145,166`; mock `genT.mjs` | `Your progress stays on this device.` / `All data stays on this device.` / `Your data stays on this device.` / `everything stays on this device.` | four wordings | `Everything stays on this device.` |
| A21 P1 | `main.js:186,284`; `brain.js:122`; `pll-trainer.js:127`; `cross-scout.js:39` | eyebrows `Practice / Corners`, `Practice / F2L`, `Practice / Smart cube`, `Practice / PLL recognition`, `Explore / Cross planning` | breadcrumb uses "Practice" for everything; Explore differs | `drills / corner recognition` and so on (or remove the eyebrow) |
| A22 P1 | `main.js:193,288`; `pll-trainer.js:128`; `main.js:194` | `Training settings` | "training" banned; settings page is one | `settings` |
| A23 P1 | `main.js:206-207,922` | `Open practice`, `10-answer sprint`, `Sprint complete` | practice and sprint | `endless`, `10-answer round`, `round done` |
| A24 P1 | `main.js:350,334,1540`; `pll-trainer.js:130` | `Start training`, `Practice paused`, `Practice mode` | same | `start`, `paused`, `mode` |
| A25 P1 | `main.js:196-197` | `Drill` label + `aria-label="Corner drill"` | label correct; keep as the model | keep `drill` |
| A26 P1 | `pll-trainer.js:274`, `main.js:1540,334` | `TRIAL 001`, `This trial...`, `Your interrupted trial` | trial | `case 001` (or `case 1`), `This one won't count.` |
| A27 P1 | `recognition-profile.js:126,132,220` | `Attempt N`, `Attempts are numbered...`, `${n} attempt(s)` | attempt | `answer N`, `answers`, `answers` |
| A28 P1 | `main.js:905`, `main.js:266` | `attempts` counters, `No cases yet` | mixed attempts and cases | `answers` for count, `cases` for questions |
| A29 P1 | `cross-scout.js:131,161` | `plan retrieval(s) logged · N found` | retrieval, logged | `N drills · N found` or `N plans · N found` |
| A30 P1 | `brain.js:155`, `brain.js:368,479` | `Double X`, `Extended cross: ... built with the cross.` | x-cross naming | `xx-cross`; `x-cross: pair built with the cross.` |
| A31 P1 | `cross-scout.js:58,69,296` | `double X-cross`, `Double X-cross:` | same | `xx-cross` |
| A32 P1 | `main.js:292,294`; `brain.js:156`; `main.js:1076,1190` | `Pseudo pairs · shift D`, `Shift D layer`, `Pseudo F2L · D-shift`, `D restores the shifted cross/pair`, `D offset` | five names | setting `pseudo pairs`; state `D offset`; turn `D fix` |
| A33 P1 | `solve-methods.js:41`, SPEC/mocks | `First Block`, `SB` | mixed long and short; mocks say FB | `FB`, `SB` |
| A34 P1 | `brain.js:425` | `Building the cross`, `F2L` for key `cross`, `OLL · orient edges` for both `eo` and `co` | wrong label for CO; stage words differ from timeline (`EO`, `CO`) | `cross`, `F2L`, `EO`, `CO`, `PLL` from one map |
| A35 P1 | `brain.js:181-182` | toggle names built by regex: `Cross Suggest`, `F2l Hint`, `Pll Lens`, `Oll Stage`, `Rotation Flag`, `Efficiency Score`, `Auto Cross` | broken acronyms, internal names shown | explicit labels: `cross hint`, `next pair hint`, `PLL cue`, `OLL stages`, `rotation flag`, `efficiency`, `auto cross` |
| A36 P1 | `brain.js:138,437` | eyebrow `Phase`; `${n} turns` | phase; turns for a count | `stage`; `${n} moves` |
| A37 P1 | `main.js:166-171`, `main.js:1451,1464,1477,1490` | nav and loading names `Brain`, `Debug`, `Cross Scout`, `Loading Brain…`, `Smart Cube debug could not load` | Brain retired; Debug renamed `dev`; title case | nav `solve · drills · algs · progress`; `loading solve…` |
| A38 P1 | `main.js:1456,1469,1482,1495` | `X could not load: ${error.message}. Switch trainers and try again.` (only on two) | raw exception, inconsistent | `Couldn't load {name}. Reload and try again.` |
| A39 P2 | `solve-live.js:383-388` | `Last layer skipped — solved straight out of F2L!`, `PLL skipped — solved straight after OLL!`, `EO skipped — edges oriented while solving F2L!`, `${n} F2L pairs solved at once!` | verbs vary, em dash, always `!` | `LL skip!`, `PLL skip!`, `OLL skip!`, `EO skip!`, `CO skip!`, `{n} pairs at once!` |
| A40 P2 | `brain.js:529` | `Solve logged · 12.41s · 68 moves.` | logged | `Solve saved · 12.41 s · 68 moves.` |
| A41 P2 | `pll-trainer.js:216`; `main.js:1541` | `will not be logged`, `was not recorded—your times, accuracy, and adaptive pace are unchanged` | logged, recorded, scored, long | `Taking a break? This one won't count.` |
| A42 P2 | `brain.js:560,590`; `solve-live.js:201,209,226`; `smart-cube-session.js:89,167,186` | `Connect and sync a solved cube first.` / `Sync a solved cube before starting a guided scramble.` / `Solve the cube (or sync)...` / `Solve it, then tap Sync solved cube.` / `Cube is not solved yet. Solve it, then try again.` | six phrasings of "solve the cube, then sync" | `MSG.syncFirst`: `Solve the cube, then sync.` |
| A43 P2 | `brain.js:599` | `Start guided` / `Start free`; `:148` `Start guided solve` | two labels for one button; "free" vs "guided" is the scramble kind | `start` (primary) and a `guided / free` toggle |
| A44 P2 | `brain.js:148` | `Cancel solve`; `cross-scout.js:52` `Stop search`; `Exit practice`; `brain.js` `Stop replay` | cancel / stop / exit | `stop solve`, `stop search`, `stop`, `stop replay` |
| A45 P2 | `brain.js:129` | `Clear saved`; `brain.js:724` `Saved cube address cleared.` | unclear what is cleared | `forget this cube`; `Cube address forgotten.` |
| A46 P2 | `brain.js` (data port), `Save recording`, `Load recording…` | save/load for files | save = inside app; load | `export recording`, `import recording` |
| A47 P2 | `brain.js:543,566` and others | `Generating…`, `Searching for verified choices…`, `Checking the server…`, `Finding optimal next-pair plans locally…`, `Sending…` | verbs/ellipsis style varies | `generating scramble…` pattern: lowercase, noun, one `…` |
| A48 P2 | `main.js:216-217`, `pll-trainer.js:132,227`, `main.js:1376` | `Glance mode`, `Pace`, `View`, `Glance window`, `Hide after exposure`, `Glance exposure`, `Adaptive · 300 ms · 4/10` | glance / exposure / view / pace / window for one setting | `glance`: `glance on`, `glance time 300 ms`, `adaptive glance` |
| A49 P2 | `main.js:225,253,702` | `Find the hidden color`, `Click a color or type its first letter` | fine, but `Click` on touch | `Tap or press a color key.` (`or w y g b r o`) |
| A50 P2 | `main.js:243,630,661,705` | `Response time · includes key / click`, `First answer · from cube reveal` | "response time" | `recog` (`recog · includes key`) |
| A51 P2 | `pll-trainer.js:137,139` | `Recognition time`, `Median recognition`, `Practice accuracy`, `Transfer accuracy`, `24h retention`, `Reviews ready` | recog and practice words | `recog`, `median recog`, `accuracy`, `random AUF accuracy`, `24 h`, `14 due` |
| A52 P2 | `pll-trainer.js:25-27`, `:360` | modes `Learn / Mix / Transfer`, notes `Interleave cases and practise retrieval.`, `Transfer probes return...` | practise, retrieval, transfer, probe | `learn / mix / random AUF`; notes in cuber words **[D5]** |
| A53 P2 | `main.js:328`, `recognition-profile.js` | `Ready to review`, `Complete cases to build your review queue`, `Reviews ready` | "review" now belongs to solve review | `due`, `No cases due. Do a round to build your queue.` |
| A54 P2 | `main.js:889-894` | `0 cases`, `After 24h+: ...`, `practice accuracy`, `median correct response` | wording | `14 due`, `24 h+: 5 of 6`, `accuracy`, `median recog` |
| A55 P2 | `main.js:1543`, `main.js:1540` | `Taking a break?` / `Practice paused` | two tones in one overlay | `Taking a break?` (friendly) |
| A56 P2 | `main.js:810,574-576` | `Skipped — it was Green`, `✓ Correct · White`, `× Not quite · Red was correct` | symbol and words differ; colors capitalised | `Nice · 0.71 s`, `Not quite, it was red.`, `Skipped, it was green.` |
| A57 P2 | `main.js:1130-1340` | `Found. Keep scanning.`, `Not a pair. Keep scanning.`, `Pseudo pair found.` | fine, pick `miss` for wrong | `Found.`, `Miss.`, `Pseudo pair!` |
| A58 P2 | `main.js:1307` | `Those pieces match. This case is outside the trainer's deduction targets; unscored.` | long, scored | `Those match, but it isn't one of this case's pairs. Won't count.` |
| A59 P2 | `main.js:295` | `New cube ↗` | "cube" for a case; `↗` | `next case` |
| A60 P2 | `cross-scout.js:42` | `New scramble` | correct; model | keep |
| A61 P2 | `cross-scout.js:154-362` | `Retrieval practice`, `I found it · reveal plan`, `Found it`/`Missed it`, `Exit practice`, `Practice this plan`, `How did the retrieval feel?` | practice, retrieval, "missed it" | `recall`, `reveal plan`, `found` / `missed`, `stop`, `drill this plan`, `Did you spot it?` |
| A62 P2 | `cross-scout.js:219`, `:41-42` | `Play` / `Pause`; `Reset`; `Start practice` | `Reset` = restart plan | `play`, `pause`, `restart` |
| A63 P2 | `cross-scout.js:252` | `Cross Scout` title-case heading; `Your plan`, `Plans found`, `Recognizable cues first` | casing | `cross scout` in lists; sentence case in body |
| A64 P2 | `cross-scout.js:43`, all-caps autocapitalize | `Standard face turns only: U D R L F B, with 2 or ′.` | uses `′` while app data uses `'` | keep `′`; accept both |
| A65 P2 | `cross-scout.js:53,58`, `main.js:288` | `CN`, `Color neutral`, `CN · all six` | `CN` undefined on first use | `color neutral (CN)` once, `CN` after |
| A66 P2 | `smart-cube-turn-guide.js:22,29,31` | `Return to plan · 3 turns`, `Previous scramble turn` | turns | `back on plan · 3 moves`, `previous move` |
| A67 P2 | `smart-cube-guidance.js:68` | `Turn the top face (white center) clockwise` | `center` American, fine; `counterclockwise` | keep; add `clockwise` test |
| A68 P2 | `recognition-profile.js:216,217` | `Unlabelled target`, `Visible colors not recorded` | British double-l; `recorded` | `Unlabeled`; `colors not saved` |
| A69 P2 | `recognition-profile.js:65` | `toLocaleString(undefined, ...)` | date order varies by browser | `fmt.date` |
| A70 P2 | `recognition-profile.js:129-133` | `Response time (Y) · attempt number (X).`, `Lower is faster.` | chart caption prose, "response" | `recog (Y) · answer (X).` |
| A71 P3 | `main.js:240,541-542,1049,1191`; `pll-trainer.js:137,274` | `SINGLE CORNER`, `CASE 001`, `WHITE BOTTOM`, `LEARN · ALL CASES` | caps typed in source | lowercase source; CSS if a theme wants caps |
| A72 P3 | `main.js:254`, `pll-trainer.js:137` | `Skip <kbd>S</kbd>` | uppercase keycap | `skip <kbd>s</kbd>` |
| A73 P3 | `main.js:189,285,1399`; `pll-trainer.js:127` | taglines `See the pattern. Build the instinct.`, `Find your next pair. Before your next turn.`, `Recognize, don't calculate.`, `See the permutation. Call it instantly.`, `A little practice. A quicker instinct.` | slogan voice differs; "practice" | short, optional, or remove |
| A74 P3 | `main.js:174,178` | `Switch to dark mode`, `How to play` | "play" for a cubing app | `theme`, `help` |
| A75 P3 | `main.js:1541` | `10 seconds elapsed.` | unit spelled out | `10 s` |
| A76 P3 | `main.js:291` | `15 seconds`, `30 seconds`; `Start ${n}s scan` (`:1014`) | `30 seconds` / `30s` | `30 s scan` |
| A77 P3 | `main.js:1127` | `12.3s left · 3 pairs · 1 misses` | `1 misses`, unit glued | `12.3 s · 3 pairs · 1 miss` |
| A78 P3 | `main.js:1338` | `Search 0.61s · match 0.82s · includes pointing` | search/match/pointing undefined | `find 0.61 s · match 0.82 s` |
| A79 P3 | `brain.js:19,494-497` | `Median TPS`, `Median moves`, `Solves` | fine, but `median` here and `ao5` next to it | keep; add `mean` |
| A80 P3 | `brain.js:430` | `Inspect — 8.7s left (clock starts on your first move)` | em dash, `Inspect` vs `inspection` | `Inspection · 8.7 s left. Clock starts on your first move.` |
| A81 P3 | `brain.js:353` | `Edges oriented — orient the corners (2-look OLL).` | em dash; stage words | `EO done. CO next.` |
| A82 P3 | `solve-coach.js:52,57,78,94` | `Your yellow-face cross took 7 moves — optimal for this scramble.`, `${extra} extra move(s)` | em dash; "optimal" correct; `(face)` hyphen | `Cross took 7 moves, optimal on yellow.` |
| A83 P3 | `brain.js:364` | `Solve efficiency so far: 83/100.` | fine | `efficiency 83` **[D6]** |
| A84 P3 | `brain.js:338` | `Perform the scramble shown in the cue. A wrong turn shows the return path without discarding the attempt.` | wrong, attempt | `Follow the scramble. A wrong turn shows the way back.` |
| A85 P3 | `brain.js:584` | `Scramble ready — inspect, then start solving on your first move. The clock starts when you turn.` | two sentences saying the same | `Scramble ready. The clock starts on your first move.` |
| A86 P3 | `brain.js:468,483` | `Solve complete`, `No key-moment insights for this solve. Snapshots and per-pair hindsight arrive with the F2L solver lens.` | internal roadmap text on screen | `Solved.` and hide the empty state |
| A87 P3 | mocks `genT.mjs` | `which colour is hidden?`, `recognise first`, `avg`/`your avg` next to `average` | British spelling; avg vs average | `color`, `recognize` (or recog); `avg` only in chips |
| A88 P3 | mocks `genT.mjs` | `pb 12.41`, `0.71 s` vs code `0.71s`, `31 aug`, `spaced review`, `due for review` | casing and review/due | `PB 12.41` (D3), `due` |
| A89 P3 | `brain-v2/README.md` | `Keys: 2 toggles +2, d marks DNF`; `14.97+` / `12.97 +2` | two penalty formats | section 4.3 |
| A90 P3 | `brain-v2/README.md`, `moves/README.md` | `colour`, `centre`, `recognise` (docs) | spelling in docs | American, or leave docs British but UI strings American |
| A91 P3 | `trainers/README.md` | `step → drill`, `where your time goes` | "step" vs "stage" | `stage → drill` |
| A92 P3 | `review/SPEC.md` 9 | `{gap} s`, `Flow`, `Show best move`, `Stage accuracy` | `s` with a space is right; accuracy collision | `reveal best move`; `stage efficiency` **[D6]** |

### 9.3 What is already consistent (keep)

* `…` (single ellipsis character) for in-progress text.
* `·` (middle dot) as the field separator.
* `Skip` as the skip button in corners, PLL and F2L.
* `Connect` / `Disconnect` for the cube.
* `ao5`, `ao12`, `TPS`, `PLL`, `OLL` spellings in the solve screen.
* Color names spelled American (`color`, `center`) in all `src/` strings except the two British slips above.

## Decisions confirmed by the user (2026-09-30)
1. Prime: display `R′` (U+2032); accept `'` `′` `’` `‘` as input; store/copy ASCII `'`.
2. Spelling: American (color, recognize, practice).
3. Casing: PLL, OLL, PB, DNF, TPS, AUF in capitals; ao5, ao12, ao50, ao100, mo3 lowercase.
4. Keys (every page): space = start/next, esc = stop/close, tab = settings, b = back, r = retry.
5. combo = correct answers in a row; streak = days in a row.
6. The action is "drill" (not practice/train/sprint); one attempt = a "case".
7. Review labels: the cubing set (scheme A: Optimal, Clean, Skip, Pseudo pair, Extra move, Detour, Pause, …).
8. The review score is "efficiency" (0–100); "accuracy" stays for drills.
9. Inferred labels (regrip, lockup) are hidden by default.
10. The smart-cube screen is "solve"; nav `solve · drills · algs · progress`.
Site name: undecided.
