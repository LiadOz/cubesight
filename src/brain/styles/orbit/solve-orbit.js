// The solve's one Orbit. Its segments change meaning with the solve state;
// the shared Cube and this SVG stay mounted for the page lifetime.
import { Orbit } from '../../../ui/orbit/index.js';

const moveSegments = scramble => {
  const moves = scramble?.moves ?? [];
  const recovery = scramble?.recovery ?? [];
  return [
    ...moves.map((move, index) => ({
      key: move.key,
      label: move.text,
      value: move.state === 'current' ? `move ${index + 1} of ${moves.length}` : undefined,
      weight: 1,
      state: move.state === 'current' ? 'current' : move.state === 'done' ? 'done' : 'future',
      importance: move.state === 'current' ? 1000 : Math.max(10, 90 - Math.abs(index - (scramble?.step ?? 0))),
    })),
    ...recovery.map((move, index) => ({ key: `undo-${move.key}`, label: move.text, value: index === 0 ? 'undo' : undefined, weight: 1, state: 'wrong', importance: 800 - index })),
  ];
};

function inspectionSegments(inspection) {
  const limit = inspection.limitMs;
  const zones = inspection.zones ?? [];
  if (!limit) return [{ key: 'elapsed', label: 'inspection', weight: 1, fill: inspection.caret, state: 'current', importance: 100 }];
  const scale = Math.max(limit + 2000, inspection.scaleMs || limit + 2000);
  const normal = zones.find(zone => zone.kind === 'normal');
  const plus2 = zones.find(zone => zone.kind === 'plus2');
  const dnf = zones.find(zone => zone.kind === 'dnf');
  const elapsed = inspection.elapsedMs ?? 0;
  const result = [
    { key: 'inspection', label: `${limit / 1000} s`, weight: Math.max(1, (normal?.toMs ?? limit) / scale), fill: Math.min(1, elapsed / limit), state: elapsed < limit ? 'current' : 'done', importance: 100 },
  ];
  if (plus2) result.push({ key: 'plus2', label: '+2', weight: Math.max(.04, (plus2.toMs - plus2.fromMs) / scale), fill: Math.min(1, Math.max(0, (elapsed - plus2.fromMs) / (plus2.toMs - plus2.fromMs))), state: elapsed >= plus2.toMs ? 'bad' : elapsed >= plus2.fromMs ? 'wrong' : 'future', importance: 90 });
  if (dnf) result.push({ key: 'dnf', label: 'DNF', weight: Math.max(.04, (scale - (dnf.fromMs ?? limit + 2000)) / scale), fill: elapsed >= dnf.fromMs ? 1 : 0, state: elapsed >= dnf.fromMs ? 'bad' : 'future', importance: 85 });
  return result;
}

export function createSolveOrbit(host, { dispatch = () => {} } = {}) {
  const orbit = new Orbit(host, {
    size: 'XL', shape: 'open', gap: 70, labelStyle: 'around', label: 'Solve progress',
    segments: [], markers: [], onSegment: segment => {
      if (segment.selectable) dispatch({ type: 'openDetail', kind: 'stage', key: segment.key });
    },
    onMarker: marker => dispatch({ type: 'selectMarker', id: marker.key }),
  });
  let lastScreen = '';
  let lastInspection = null;

  function model(vm) {
    const connecting = vm.device?.phase === 'connecting' || vm.device?.phase === 'syncing';
    if (connecting) return { shape: 'full', gap: 0, segments: [{ key: 'connecting', weight: 1, fill: .18, state: 'current', label: '' }], markers: [], caret: null };
    if (vm.screen === 'scramble') return { shape: 'full', gap: 0, segments: moveSegments(vm.scramble), markers: [], caret: null };
    if (vm.screen === 'inspection') {
      const i = vm.inspection;
      const ticks = (i?.ticks ?? []).map(tick => ({ key: `inspection-${tick.kind}-${tick.atMs}`, segment: 'inspection', position: (tick.atMs / Math.max(1, i.scaleMs)) * .95, label: tick.label, tone: 'good', type: 'tick' }));
      return { shape: 'full', gap: 0, segments: inspectionSegments(i), markers: ticks, direction: 'counterclockwise', caret: 180 - (i?.caret ?? 0) * 360 };
    }
    const timeline = vm.timeline;
    const results = vm.screen === 'results' ? vm.results : null;
    const caseLinks = results?.caseLinks ?? {};
    const segments = (timeline?.segments ?? []).map(segment => {
      const caseInfo = caseLinks[segment.key] ?? (segment.key === 'pll' || segment.key === 'ep' ? caseLinks.pll : segment.key === 'oll' || segment.key === 'co' ? caseLinks.oll : null);
      const splitValue = results ? (segment.skipped ? 'skip' : segment.splitText) : segment.state === 'done' ? segment.splitText : '';
      return {
        key: segment.key,
        label: caseInfo ? `${segment.label} · ${caseInfo.name}` : segment.label,
        value: splitValue || undefined,
        delta: results && segment.delta?.text ? segment.delta.text : undefined,
        weight: segment.weight,
        fill: segment.fill,
        state: segment.state === 'skipped' ? 'skipped' : segment.state,
        importance: segment.state === 'current' ? 100 : 10,
        ariaLabel: caseInfo ? `${segment.label} · ${caseInfo.name}${caseInfo.recognitionMs != null ? ` · recog ${(caseInfo.recognitionMs / 1000).toFixed(2)} s` : ''}${caseInfo.executionMs != null ? ` · exec ${(caseInfo.executionMs / 1000).toFixed(2)} s` : ''}` : undefined,
        selectable: Boolean(results),
        caseKey: caseInfo ? (/^pair\d$/.test(segment.key) ? segment.key : caseInfo.kind) : undefined,
      };
    });
    const markers = (results?.review?.markers ?? []).map(marker => ({ key: marker.id, segment: marker.seg, position: marker.frac, label: marker.label, tone: marker.tone === 'good' ? 'good' : 'bad', type: marker.tone === 'good' ? 'spark' : 'warning' }));
    return { shape: 'open', gap: 70, segments, markers, caret: null };
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
        void orbit.update({ segments, caret: 180 - (inspection.caret ?? 0) * 360 }, { animate: false });
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
      key: segment.key, label: info ? `${segment.label} · ${info.name}` : segment.label,
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
