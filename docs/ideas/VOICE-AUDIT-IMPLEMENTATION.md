# VOICE §9.2 implementation audit

This maps each row in [VOICE §9.2](../design/VOICE.md#92-table) to the current integrated source. The old file names and line numbers describe an earlier implementation; this audit follows the live modules after the refactor.

**Covered** means the current UI has the requested wording or a consistent replacement. **Partial** names a remaining inconsistency. **N/A** means the old surface is retired or the row only describes a design mock; the current equivalent is stated where useful.

The automated copy baseline is empty, so it is not treated as proof. tests/copy-unit.test.mjs scans active JS source for reviewed banned vocabulary and checks shared terms/formats; each row below also points to feature source and, where available, behavior tests.

| ID | Status | Current implementation and evidence |
|---|---|---|
| A1 | Covered | src/brain/format.js centralizes display and DNF raw-time formatting through fmtTime/fmtResult; src/copy/terms.js and tests/copy-unit.test.mjs verify formats. |
| A2 | Covered | Shared fmt.time formatting is used by the corner and PLL clocks (src/main.js, src/pll-trainer.js); the solve timer intentionally drops the unit while running, as the row requests. |
| A3 | Covered | src/cross-scout.js uses fmt.time with a spaced unit for recall timing. |
| A4 | Covered | src/recognition-profile.js formats recognition times through fmt.time; shared formatting tests cover the output. |
| A5 | Covered | Millisecond settings and glance labels use a space before ms; second durations use the shared spaced-unit formatter (src/main.js, src/copy/terms.js). |
| A6 | Covered | Solve results use PB terminology in src/brain/view-model.js; src/copy/terms.js and tests/copy-unit.test.mjs lock casing. |
| A7 | Covered | All-time algorithm records say PB (all-time), corner bests say PB, and round summaries scope the result as best of round (src/algs/page.js, src/main.js). |
| A8 | Covered | Corner recognition says combo / best combo for consecutive correct answers (src/main.js). |
| A9 | Covered | Shared key terms map Space/Enter to next; live solve and drills use the next action (src/copy/terms.js, src/brain/keys.js). |
| A10 | Covered | Case navigation says next case (src/main.js, src/brain/shell.js). |
| A11 | Covered | PLL recognition labels the action next case (src/pll-trainer.js). |
| A12 | Covered | Skip uses s; follow-up action and aria label say next case (src/main.js); shared key map is checked in tests/copy-unit.test.mjs. |
| A13 | Covered | Shared T.again term is one more round and the corner result action uses it (src/copy/terms.js, src/main.js). |
| A14 | Covered | F2L scan starts with Space while skip uses s (src/main.js); see tests/training.spec.js. |
| A15 | Covered | Space/Enter advance to the next case (src/main.js, src/copy/terms.js); see tests/training.spec.js. |
| A16 | Covered | Solve camera action is reset view, titled Reset the camera (src/brain/shell.js). The row explicitly permits dropping the separate reload-view action. |
| A17 | Covered | The solve prompt says “tap recenter” and the Cross Scout view control says reset view for a different camera action; the old mismatched instruction/control pair is gone (src/brain/view-model.js, src/brain/shell.js, src/cross-scout.js). |
| A18 | Covered | Smart-cube actions use the same short labels, sync and recenter, in solve and Cross Scout; supporting instructions use “tap recenter” (src/brain/shell.js, src/brain/view-model.js, src/cross-scout.js). |
| A19 | Covered | Cross Scout actions say find plans / find plans for this cube; solve review is separate (src/cross-scout.js, src/review/index.js). |
| A20 | Covered | Privacy copy is Everything stays on this device. (src/copy/terms.js, src/brain/shell.js). |
| A21 | Covered | Live drill eyebrows use drills / …; document titles and internal route metadata are not visible breadcrumb copy (src/main.js, src/pll-trainer.js, src/cross-scout.js, src/copy/nav.js). |
| A22 | Covered | Settings sections and summaries use settings (src/main.js, src/brain/settings.js). |
| A23 | Covered | Corner modes are endless and 10-case round (src/main.js); sprint remains internal and does not appear in the interface. |
| A24 | Covered | Primary actions say start, and pause copy says Taking a break? (src/main.js, src/pll-trainer.js). The retired practice-mode labels are not shown. |
| A25 | Covered | drill is the user-facing action across the library and drill hub (src/algs/page.js, src/drills/hub.js). |
| A26 | Covered | User-visible labels say case N and interruptions say This one won’t count. (src/main.js, src/pll-trainer.js); trial remains internal state only. |
| A27 | Covered | Recognition trend labels and points use answer N / answer (src/recognition-profile.js). |
| A28 | Covered | Drill counters distinguish answers, cases, and accuracy; “No cases yet” is the approved empty-history wording in §6.2 (src/recognition-profile.js, src/main.js). |
| A29 | Covered | Cross Scout calls the activity recall and displays recall rounds with the found count; the retired “retrieval(s) logged” wording is gone (src/cross-scout.js). |
| A30 | Covered | Live coaching uses x-cross / xx-cross (src/brain/coach-lines.js, src/brain/view-model.js); old terminology remains only in comments. |
| A31 | Covered | Cross Scout uses x-cross / xx-cross in case names and descriptions (src/cross-scout.js). |
| A32 | Covered | User-facing settings, coaching, and review copy use pseudo pair, D offset, and D fix consistently (src/brain/settings.js, src/main.js, src/solve-live.js, src/brain/review/detail.js, src/brain/review/panel.js). |
| A33 | Covered | Method catalog uses FB / SB labels (src/solve-methods.js, src/copy/terms.js). |
| A34 | Covered | Stage map exposes cross, F2L, EO, CO, OLL, PLL (src/copy/terms.js, src/brain/view-model.js); tests/brain-view-model-unit.test.mjs checks CO labels. |
| A35 | Covered | Coach toggles use explicit labels rather than title-cased internal keys (src/brain/controller.js); stage labels come from the shared map (src/copy/terms.js). |
| A36 | Covered | Visible timeline/result labels use stages and moves (src/brain/view-model.js, src/brain/stage-plan.js); remaining phase terms are internal state/documentation. |
| A37 | Covered | Navigation uses solve · drills · algs · progress; the lazy smart-cube screen is named studio and failures use that label (src/copy/nav.js, src/main.js; route labels are covered by tests/routes-unit.test.mjs). |
| A38 | Covered | Lazy module-load failures use the shared “Couldn't load {name}. Reload and try again.” message and discard exception details (src/copy/terms.js, src/main.js). Operation-specific input/search errors are separate from module-load failures. |
| A39 | Covered | Stage skip cues use concise labels such as “EO skip!” and “2 pairs at once!” (src/solve-live.js); review uses separate stage skip markers (src/brain/review/markers.js, src/review/index.js). |
| A40 | Covered | Saved solve records use PB and spaced times; completion status says Solve saved (src/brain/controller.js, src/brain/format.js, src/history/index.js). |
| A41 | Covered | Recognition and algorithm drills use Taking a break? This one won’t count. (src/pll-trainer.js, src/copy/terms.js). |
| A42 | Covered | MSG.syncFirst provides “Solve the cube, then sync.” across solve setup and smart-cube recovery messages (src/copy/terms.js, src/solve-live.js, src/smart-cube-session.js). |
| A43 | N/A | Former guided/free corner chooser is not a current screen. Current solve has one start action and method/inspection settings (src/brain/controller.js, src/brain/settings.js). |
| A44 | Covered | Actions use stop consistently, with an object when needed (“stop search”, “stop replay”); the former cancel/exit variants are gone (src/copy/terms.js, src/cross-scout.js, src/brain/controller.js). |
| A45 | Covered | Saved device control says forget this cube; confirmation says Cube address forgotten (src/brain/shell.js, src/brain/controller.js). |
| A46 | N/A | Former save/load recording controls are retired. Current personal data actions are export data / import data (src/brain/shell.js, src/data-port.js). |
| A47 | Covered | Visible progress states use lowercase verbs and the single ellipsis character, including lazy loaders, case preparation, cross search, PLL variants, lookahead choices, and smart-cube sync (src/main.js, src/pll-trainer.js, src/drills/cross-planning.js, src/drills/lookahead.js, src/smart-cube-session.js). |
| A48 | Covered | Corner and PLL controls use glance / adaptive glance for visibility timing; remaining `exposure` references are internal setting IDs or code comments, not displayed copy (src/main.js, src/pll-trainer.js). |
| A49 | Covered | Corner/F2L prompts support taps and keyboard input (src/main.js); see tests/training.spec.js. |
| A50 | Covered | Recognition graphs and summaries use recog (src/recognition-profile.js, src/pll-trainer.js). |
| A51 | Covered | PLL metrics say recog, median recog, accuracy, random AUF accuracy, 24 h retention, and due (src/pll-trainer.js). |
| A52 | Covered | PLL mode labels are learn, mix, and random AUF; explanatory copy describes cases, AUFs, and recog rather than retrieval/transfer probes (src/pll-trainer.js). |
| A53 | Covered | Learning queues use due and solve review has a separate route (src/pll-trainer.js, src/progress/adapter.js, src/review/index.js). |
| A54 | Covered | Recognition stats say due, accuracy, and median recog; “No cases yet” matches the approved empty-state copy (src/pll-trainer.js, src/progress/adapter.js, src/main.js). |
| A55 | Covered | Pause overlays use the friendly Taking a break? wording (src/main.js, src/pll-trainer.js). |
| A56 | Covered | Feedback uses Nice / Not quite, it was red. / Skipped, it was green. with lowercase colors (src/main.js, src/pll-trainer.js). |
| A57 | Covered | Cross Scout ratings use found / missed; F2L feedback says “Found.”, “Miss.”, and “Pseudo pair!” (src/cross-scout.js, src/main.js). |
| A58 | N/A | Old “outside deduction targets” screen is gone; current F2L scan mismatch is Not a pair. (src/main.js). |
| A59 | Covered | Cross Scout uses “New scramble”; F2L generation failure asks the user to select the next case (src/cross-scout.js, src/main.js). |
| A60 | Covered | New scramble remains the Cross Scout action (src/cross-scout.js). |
| A61 | Covered | Cross Scout uses recall, reveal plan, found/missed, stop, and drill this plan; its rating prompt is “Did you spot it?” as requested (src/cross-scout.js). |
| A62 | Covered | Plan playback labels are restart, play, pause, and move navigation (src/cross-scout.js). |
| A63 | Covered | Visible Cross Scout heading and breadcrumb are sentence-case cross scout (src/cross-scout.js). |
| A64 | Covered | Move prompts display prime and notation parsers accept input variants (src/cross-scout.js, src/review/import-parser.js). |
| A65 | Covered | Cross Scout spells out “color neutral (CN)” before the selector uses the abbreviation, and the selector labels it “color neutral · all six” (src/cross-scout.js, src/main.js). |
| A66 | Covered | Recovery guide says “back on plan · N moves” and its navigation says previous move (src/smart-cube-turn-guide.js). |
| A67 | Covered | Cube guidance uses clockwise/counterclockwise and American center (src/smart-cube-guidance.js). |
| A68 | Covered | Recognition profile uses Unlabeled and colors not saved for missing data (src/recognition-profile.js). |
| A69 | Covered | Dates use stable fmt.date output (src/copy/terms.js, src/recognition-profile.js); tests/copy-unit.test.mjs covers date formatting. |
| A70 | Covered | Trend captions use recog (Y) · answer number (X) (src/recognition-profile.js). |
| A71 | Covered | The named source labels are lowercase; dynamic proper case names and color names retain their conventional casing, as the row specifies (src/main.js, src/pll-trainer.js). |
| A72 | Covered | Skip action and keycap are lowercase (src/main.js, src/pll-trainer.js). |
| A73 | N/A | Cited taglines were removed from live screens; current intros are functional directions (src/main.js, src/pll-trainer.js, src/cross-scout.js). |
| A74 | Covered | Header actions are theme and help (src/main.js). |
| A75 | Covered | Current timer/status durations use numeric s units (src/copy/terms.js, src/brain/view-model.js, src/main.js). |
| A76 | Covered | Scan durations and actions use spaced units such as 30 s scan (src/main.js). |
| A77 | Covered | F2L scan messages pluralize miss/misses and separate s with a space (src/main.js). |
| A78 | Covered | F2L timing says “find … · match …” with spaced units; the unrequested “includes pointing” suffix is gone (src/main.js). |
| A79 | Covered | Solve results expose TPS, moves, solve counts, and mean stats (src/brain/view-model.js, src/brain/styles/orbit/results-orbit.js, src/brain/styles/mono/results-mono.js). |
| A80 | Covered | Live solve says Inspection · N s left. Clock starts on your first move. (src/brain/view-model.js); covered by tests/brain-view-model-unit.test.mjs. |
| A81 | Covered | EO and CO are separate stage labels (src/copy/terms.js, src/brain/view-model.js); old combined cue is retired. |
| A82 | Covered | Cross hindsight uses a short stage label and singular/plural “extra move(s)” without the longer sentence or em dash (src/solve-coach.js, tests/solve-coach-unit.test.mjs). |
| A83 | Covered | Solve review scores report efficiency points; live coaching uses the concise “efficiency N” label (src/review/index.js, src/brain/coach-lines.js). |
| A84 | Covered | A wrong scramble move keeps the attempt and shows the way back (src/brain/coach-lines.js, src/smart-cube-guidance.js, src/solve-live.js). |
| A85 | Covered | Scramble status says Scramble ready. The clock starts on your first move. (src/brain/controller.js). |
| A86 | Covered | Result headline is solved (src/brain/view-model.js); the live review renders key moments only when available and has no roadmap placeholder (src/review/index.js, src/review/view-model.js). |
| A87 | N/A | British spelling / avg examples are in retired trainer mockups (docs/design/brain-v2/trainers/); runtime uses American spelling (src/main.js, src/recognition-profile.js). |
| A88 | N/A | PB/date/review examples are in retired mockups (docs/design/brain-v2/trainers/); runtime uses PB and due (src/copy/terms.js, src/pll-trainer.js). |
| A89 | N/A | Old README penalty examples do not describe runtime. Live result formatting is centralized in src/brain/format.js and checked by tests/copy-unit.test.mjs. |
| A90 | N/A | British spellings are in design documentation; the approved spelling policy applies to UI strings. Active source is checked by tests/copy-unit.test.mjs. |
| A91 | N/A | Row concerns retired trainer documentation. Current user-facing actions use stage/drill vocabulary (src/copy/terms.js, src/brain/view-model.js). |
| A92 | Covered | Review action says “reveal best move”; stage scores report efficiency points, and Flow remains a permitted stage grade in the design (src/review/index.js, src/review/view-model.js). |

## Verification record

- tests/copy-unit.test.mjs checks shared terms, format contracts, key map, and active-source banned-copy scan.
- Feature evidence includes tests/brain-view-model-unit.test.mjs, tests/training.spec.js, tests/scout.spec.js, tests/recognition-profile.spec.js, tests/solve-review.spec.js, and tests/algs-page.spec.js.
- The copy baseline currently has no recorded violations. This map independently checks live source paths instead of treating an empty baseline as completion.
