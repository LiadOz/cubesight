// The Brain style modules (src/brain/styles/*) draw inspection from an InspectionVM and
// per-frame FrameVM.inspection. The manual timer feeds them the same shapes, built from the
// Brain's own pure inspectionState(), so the visuals and the wording match the Brain exactly.

import { inspectionState } from '../brain/view-model.js';

/** @returns {import('../brain/types.js').InspectionVM} */
export function buildInspectionVM(config, elapsedMs = 0) {
  const st = inspectionState(config, elapsedMs);
  return {
    mode: config.mode, overtime: config.overtime,
    limitMs: st.layout.limitMs, elapsedMs: st.elapsedMs, remainingMs: st.remainingMs, overtimeMs: st.overtimeMs,
    penalty: st.penalty, callout: st.callout,
    scaleMs: st.layout.scaleMs, zones: st.layout.zones,
    ticks: st.layout.ticks.map(t => ({ ...t, passed: st.elapsedMs >= t.atMs })),
    bigText: st.bigText, tone: st.tone, consequence: st.consequence,
    autostartHandoff: config.overtime === 'autostart' && st.remainingMs != null && st.remainingMs <= 1000,
    startedAt: null,
  };
}

/** The moving part, for style.inspection().frame(). */
export function inspectionFrame(config, elapsedMs) {
  const st = inspectionState(config, elapsedMs);
  return { elapsedMs: st.elapsedMs, remainingMs: st.remainingMs, overtimeMs: st.overtimeMs, bigText: st.bigText, tone: st.tone, caret: st.caret, consequence: st.consequence };
}
