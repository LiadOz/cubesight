/** Completion is a single advancing fill, independent of the live elapsed clock. */
export const COMPLETION_DURATION = 180;
const terminal = new Set(['done', 'good', 'bad', 'quiet', 'skipped']);
export const isCompleted = segment => terminal.has(segment?.state);
export const segmentKey = (segment, index) => String(segment.key ?? index);
const ratio = value => Math.max(0, Math.min(1, Number(value) || 0));

export function completionPlan(previous, displayed, next, pending = []) {
  const old = new Map(previous.map((segment, index) => [segmentKey(segment, index), segment]));
  const shown = new Map(displayed.map((segment, index) => [segmentKey(segment, index), segment]));
  const active = new Set(pending.map(item => item.key));
  return next.flatMap((segment, index) => {
    const key = segmentKey(segment, index), before = old.get(key);
    if (!before || !terminal.has(segment.state) || (!active.has(key) && terminal.has(before.state))) return [];
    const start = ratio(shown.get(key)?.fill);
    return start < 1 ? [{ key, start }] : [];
  });
}

export function completionSegments(segments, plan, progress) {
  let remaining = plan.reduce((sum, item) => sum + 1 - item.start, 0) * progress;
  const fills = new Map(plan.map(item => {
    const advance = Math.min(1 - item.start, remaining);
    remaining -= advance;
    return [item.key, item.start + advance];
  }));
  const leading = plan.find(item => fills.get(item.key) < 1)?.key;
  return segments.map((segment, index) => {
    const key = segmentKey(segment, index), fill = fills.get(key);
    return fill == null ? segment : { ...segment, fill, fillOffset: 0, completing: fill < 1, completionLeading: key === leading };
  });
}
