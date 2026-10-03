import { readCaseColorSetting } from '../ui/cube/case-color.js';

export function buildTimerViewModel(input = {}) {
  const snap = input.snapshot ?? {};
  return {
    phase: snap.phase ?? 'idle',
    hold: snap.hold ?? null,
    scramble: input.scramble ?? null,
    scrambleState: input.scrambleState ?? 'loading',
    elapsedMs: Number.isFinite(Number(snap.elapsedMs)) ? Number(snap.elapsedMs) : 0,
    inspectionElapsedMs: Number.isFinite(Number(snap.inspectionElapsedMs)) ? Number(snap.inspectionElapsedMs) : null,
    penalty: snap.penalty ?? snap.result?.penalty ?? null,
    display: {
      cube: 'case',
      caseColor: input.caseColor ?? readCaseColorSetting(),
      orbitShape: 'open',
      orbitSegments: Array.isArray(input.orbitSegments) ? input.orbitSegments.map(segment => ({ key: segment.key, state: segment.state, label: segment.label ?? null, value: segment.value ?? null, fill: Number.isFinite(Number(segment.fill)) ? Number(segment.fill) : 0 })) : [],
    },
    stats: Array.isArray(input.stats) ? input.stats.map(row => ({ key: row.key, value: row.value })) : [],
    notice: input.notice ?? '',
  };
}
