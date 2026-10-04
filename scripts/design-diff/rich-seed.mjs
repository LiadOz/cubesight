// A realistic history for the history frames (A-07, A-10, A-11, A-12). The approved frames show 23 solves in
// two sessions (evening, morning) with stage rings, annotations and a 68-move replay; the one-solve
// HISTORY_SEED cannot be compared fairly with them (part of the diff would be data, not design).
// Every record is the real recorded solve of tests/fixtures/rotation-cross-recording.json, analysed with the
// real solver, with its time, splits and move times rescaled to the value the frame shows. Built in node.
import { replayRecord, analysed, timesFor } from '../../tests/helpers/review-fixtures.mjs';

const day = (h, m, back = 0) => Date.UTC(2026, 0, 15 - back, h, m);
// [clock hour, minute, result seconds, penalty], newest first within each session. The rows the frame prints are
// exact (A-07: evening 17:33 14.07 ... 17:08 12.41 PB; morning 18.40, 15.02, 14.36, DNF 13.20); the rest is plausible
// fill so the three sessions together hold the 23 solves the frame counts. The frame's session heads say "14 solves"
// and "9 solves" while showing 7 and 4 rows, which no list can do; here each head states what the list shows.
const EVENING = [[17, 33, 14.07], [17, 29, 14.83], [17, 24, 14.55], [17, 20, 15.36], [17, 17, 12.97, '+2'], [17, 12, 15.94], [17, 8, 12.41]];
const MORNING = [[8, 51, 18.4], [8, 46, 15.02], [8, 41, 14.36], [8, 37, 13.2, 'DNF'], [8, 33, 16.01], [8, 28, 15.7], [8, 23, 15.9], [8, 17, 16.4], [8, 12, 17.2]];
const EARLIER = [[16, 40, 16.11], [16, 36, 15.84], [16, 31, 14.92], [16, 27, 15.52], [16, 22, 16.3], [16, 18, 15.2], [16, 12, 14.7]].map(([h, m, s]) => [h, m, s, null, -1]);

export const RICH_AT = day(17, 33);

const STAGES = ['cross', 'pair1', 'pair2', 'pair3', 'pair4', 'eo', 'co', 'cp', 'ep'];

/** Stage rows (cumulative moveTimes -> per-stage ms), the way the tracker stores them. */
function splitsFor(record) {
  const marks = record.analysis.marks, ends = [marks.cross, ...marks.pairs, marks.eo, marks.co, marks.cp, marks.solved];
  let previous = -1;
  return STAGES.map((key, index) => {
    const end = Number.isInteger(ends[index]) ? Math.max(ends[index], previous) : record.solveMoves.length - 1;
    const row = { key, ms: Math.max(0, record.moveTimes[end] - (previous >= 0 ? record.moveTimes[previous] : 0)), moves: end - previous, skipped: end === previous, pseudo: false };
    previous = end;
    return row;
  });
}

export async function buildRichSeed() {
  const recorded = await replayRecord();
  const count = recorded.solveMoves.length;
  // Evenly paced with two hesitations, so the analysis has a pause to report.
  const times = timesFor(count, { step: 140, pauses: { 30: 700, 45: 900 } });
  const timed = await analysed({ ...recorded, moveTimes: times, solveMs: times.at(-1) });
  const base = { ...timed, splits: splitsFor(timed) };
  const scale = factor => ({
    ...structuredClone(base),
    solveMs: Math.round(base.solveMs * factor),
    moveTimes: base.moveTimes.map(ms => Math.round(ms * factor)),
    splits: base.splits.map(split => ({ ...split, ms: Math.round(split.ms * factor) })),
  });
  const records = [...EARLIER, ...MORNING, ...EVENING].reverse().map(([hour, minute, seconds, penalty, back]) => {
    const record = scale(seconds * 1000 / base.solveMs);
    record.at = day(hour, minute, back ? 1 : 0);
    record.penalty = penalty ?? null;
    record.focus = 'speed'; record.source = 'smart';
    delete record.sessionId;
    return record;
  });
  return { version: 1, records };
}
