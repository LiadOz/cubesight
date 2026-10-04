// The solve's one Orbit. Its segments change meaning with the solve state;
// the shared Cube and this SVG stay mounted for the page lifetime.
import { Orbit } from '../../../ui/orbit/index.js';
import { inspectionSegments, inspectionMarkers, inspectionCaret } from './inspection-orbit.js';

const stageLabel = segment => [segment.label, ...(segment.tags ?? []).filter(tag => /x-cross/.test(tag))].join(' · ');

const moveSegments = scramble => {
  const moves = scramble?.moves ?? [];
  const recovery = scramble?.recovery ?? [];
  const plan = moves.map((move, index) => ({
      key: move.key,
      label: move.text,
      value: move.state === 'current' ? `move ${index + 1} of ${moves.length}` : undefined,
      weight: 1,
      state: move.state === 'current' ? 'current' : move.state === 'done' ? 'done' : 'future',
      importance: move.state === 'current' ? 1000 : Math.max(10, 90 - Math.abs(index - (scramble?.step ?? 0))),
    }));
  if (!recovery.length) return plan;
  const step = Math.min(scramble.step ?? 0, plan.length);
  const undo = recovery.map((move, index) => ({ key: `undo-${move.key}`, label: move.text, value: index === 0 ? 'undo' : undefined, weight: 1, state: 'wrong', sectionStart: index === 0, importance: 800 - index }));
  const upcoming = plan.slice(step);
  if (upcoming.length) upcoming[0] = { ...upcoming[0], sectionStart: true };
  return [...plan.slice(0, step), ...undo, ...upcoming];
};

export function createSolveOrbit(host, { dispatch = () => {} } = {}) {
  const orbit = new Orbit(host, {
    size: 'XL', shape: 'open', gap: 70, fitHost: true, centerClearance: 160, labelStyle: 'around', label: 'Solve progress',
    segments: [], markers: [], onSegment: segment => {
      if (segment.selectable) dispatch({ type: 'openDetail', kind: 'stage', key: segment.key });
    },
    onMarker: marker => dispatch({ type: 'selectMarker', id: marker.key }),
  });
  let lastScreen = '';
  let lastInspection = null;

  function model(vm) {
    const connecting = vm.device?.phase === 'connecting' || vm.device?.phase === 'syncing';
    if (connecting) return { shape: 'full', gap: 0, direction: 'clockwise', segments: [{ key: 'connecting', weight: 1, fill: .18, state: 'current', label: '' }], markers: [], caret: null };
    if (vm.screen === 'scramble') return { shape: 'open', gap: 70, direction: 'clockwise', segments: moveSegments(vm.scramble), markers: [], caret: null };
    if (vm.screen === 'inspection') {
      const i = vm.inspection;
      const ticks = inspectionMarkers(i);
      return { shape: 'open', gap: 70, segments: inspectionSegments(i), markers: ticks, direction: 'counterclockwise', caret: inspectionCaret(i) };
    }
    const timeline = vm.timeline;
    const results = vm.screen === 'results' ? vm.results : null;
    const caseLinks = results?.caseLinks ?? {};
    const segments = (timeline?.segments ?? []).map(segment => {
      const caseInfo = caseLinks[segment.key] ?? (segment.key === 'pll' || segment.key === 'ep' ? caseLinks.pll : segment.key === 'oll' || segment.key === 'co' ? caseLinks.oll : null);
      const splitValue = results ? (segment.skipped ? 'skip' : segment.splitText) : segment.state === 'skipped' ? 'skip' : segment.state === 'done' ? segment.splitText : '';
      return {
        key: segment.key,
        label: caseInfo ? `${stageLabel(segment)} · ${caseInfo.name}` : stageLabel(segment),
        value: splitValue || undefined,
        delta: results && segment.delta?.text ? segment.delta.text : undefined,
        weight: segment.weight,
        fill: segment.fill,
        state: segment.state === 'skipped' ? 'skipped' : segment.state,
        importance: segment.state === 'current' ? 100 : (segment.tags ?? []).some(tag => /x-cross/.test(tag)) ? 80 : 10,
        ariaLabel: caseInfo ? `${segment.label} · ${caseInfo.name}${caseInfo.recognitionMs != null ? ` · recog ${(caseInfo.recognitionMs / 1000).toFixed(2)} s` : ''}${caseInfo.executionMs != null ? ` · exec ${(caseInfo.executionMs / 1000).toFixed(2)} s` : ''}` : undefined,
        selectable: Boolean(results),
        caseKey: caseInfo ? (/^pair\d$/.test(segment.key) ? segment.key : caseInfo.kind) : undefined,
      };
    });
    const markers = (results?.review?.markers ?? []).map(marker => ({ key: marker.id, segment: marker.seg, position: marker.frac, label: marker.label, tone: marker.tone === 'good' ? 'good' : 'bad', type: marker.tone === 'good' ? 'spark' : 'warning' }));
    return { shape: 'open', gap: 70, direction: 'clockwise', segments, markers, caret: null };
  }

  return {
    orbit,
    update(vm) {
      const next = model(vm);
      lastScreen = vm.screen;
      lastInspection = vm.screen === 'inspection' ? vm.inspection : null;
      void orbit.update({ ...next, label: vm.screen === 'inspection' ? 'Inspection' : vm.screen === 'results' ? 'Solve results' : 'Solve progress' }, { animate: true });
    },
    frame(frameState) {
      if (frameState?.inspection && lastScreen === 'inspection' && lastInspection) {
        const inspection = frameState.inspection;
        // Recompute every WCA zone from the live elapsed time. The initial VM
        // is emitted only on state changes; without this frame refinement the
        // +2 and DNF arcs stayed visually empty after the normal zone expired.
        const segments = inspectionSegments({ ...lastInspection, elapsedMs: inspection.elapsedMs });
        void orbit.update({ segments, markers: inspectionMarkers({ ...lastInspection, elapsedMs: inspection.elapsedMs }), caret: inspectionCaret({ ...lastInspection, ...inspection }) }, { animate: false });
      } else if (frameState?.currentFill != null && lastScreen === 'solving') {
        const segments = orbit.options.segments.map(segment => segment.state === 'current' ? { ...segment, fill: frameState.currentFill } : segment);
        void orbit.update({ segments }, { animate: false });
      }
    },
    destroy() { orbit.destroy(); },
  };
}

/** Paint a stored results VM into an externally owned Orbit (history/past solve). */
export function presentResultsOrbit(orbit, vm, { dispatch = () => {} } = {}) {
  if (!orbit || !vm?.timeline) return;
  const caseLinks = vm.caseLinks ?? {};
  const segments = (vm.timeline.segments ?? []).map(segment => {
    const info = segment.caseKey ? caseLinks[segment.caseKey] ?? caseLinks[segment.caseKey.split(':')[0]] : null;
    return {
      key: segment.key, label: info ? `${stageLabel(segment)} · ${info.name}` : stageLabel(segment),
      value: segment.splitText || undefined, delta: segment.delta?.text || undefined,
      weight: segment.weight, fill: segment.fill, state: segment.state,
      importance: segment.state === 'done' ? 20 : 10, selectable: true,
      ariaLabel: info ? `${segment.label} · ${info.name}${info.recognitionMs != null ? ` · recog ${(info.recognitionMs / 1000).toFixed(2)} s` : ''}${info.executionMs != null ? ` · exec ${(info.executionMs / 1000).toFixed(2)} s` : ''}` : undefined,
      onCase: Boolean(info),
    };
  });
  const markers = (vm.review?.markers ?? []).map(marker => ({ key: marker.id, segment: marker.seg, position: marker.frac, label: marker.label, tone: marker.tone === 'good' ? 'good' : 'bad', type: marker.tone === 'good' ? 'spark' : 'warning' }));
  void orbit.update({ size: 'XL', shape: 'open', gap: 70, label: 'Past solve results', segments, markers,
    onSegment: segment => dispatch({ type: 'openDetail', kind: 'stage', key: segment.key }),
    onMarker: marker => dispatch({ type: 'selectMarker', id: marker.key }),
  }, { animate: true });
}
