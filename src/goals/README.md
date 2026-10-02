# Goals, weekly report, and voice

All data stays in the browser. `adapter.js` exposes `readGoal(storage)`,
`saveGoal(storage, { targetSeconds, baselineSeconds, createdAt })`,
`goalProgress(goal, currentAo12Seconds)`, and
`buildWeeklyReport({ solves, rounds }, { now, weekStartsOn, source, focus })`.

The weekly report uses local calendar weeks (Monday by default), includes solve
records shaped like `{ at, solveMs, splits: [{ key, ms }] }` and round records
shaped like `{ at, n|total, correct }`, and reports a canonical WCA-trimmed
ao12 only with 12 solves. Official +2 / DNF penalties are included through the
shared solve-metrics functions. `source` (`smart`, `manual`, `all`) and
`focus` (`speed`, `flow`, `learning`, `all`) options select one cohort; smart
is the default and excludes manual/imported solves, speed is the default focus.
Round counts include all local drill activity because rounds are not tagged
with a solve source or session focus.
The week is a local calendar week, including across daylight-saving changes.
`improvedMost` compares split averages between the first and second half of the
selected cohort and stays `null` when there is no measurable improvement.

`share-card.js` renders the shared `Orbit` component, embeds its SVG in a card,
and turns that card into a PNG in memory. It performs no network requests and
stores no copy. `voice-callouts.js` speaks only enabled 8 s / 12 s transitions
with an installed local SpeechSynthesis voice; voice remains off by default.

F5 progress adapter contract: the goal value is seconds, solve times and split
times are milliseconds, `goalProgress().percent` is 0–100 or `null`, and its
`mode` is `progress` (movement from a captured baseline), `proximity` (relative
target closeness without a baseline), or `waiting`. Weekly report `ao12Ms`,
`trendMs`, and split fields are milliseconds. `ao12Ms` may be
`Infinity` when the selected ao12 is a DNF; callers should show `DNF` rather
than treating it as missing data.
