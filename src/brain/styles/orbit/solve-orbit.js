// The solve's one Orbit. Its segments change meaning with the solve state;
// the shared Cube and this SVG stay mounted for the page lifetime.
import { Orbit } from '../../../ui/orbit/index.js';
import { displayMove } from '../../../moves/notation.js';
import { inspectionSegments, inspectionMarkers, inspectionCaret } from './inspection-orbit.js';
import { ORBIT_GEOMETRY } from '../../../ui/orbit/geometry.js';
import { PILL, PLAN_LABEL } from '../../layout-spec.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const stageLabel = segment => [segment.label, ...(segment.tags ?? []).filter(tag => /x-cross/.test(tag))].join(' · ');
const seconds = ms => (ms / 1000).toFixed(2);
const TONE = { faster: 'good', slower: 'bad', even: 'neutral', none: 'neutral' };

/** One stage segment of the ring, from a timeline VM segment (live or stored). `results` colours it by its delta and adds the tag. */
function stageSegment(segment, { results = false, caseInfo = null, tag = null, selectable = false } = {}) {
  const future = segment.state === 'future';
  const skipped = segment.state === 'skipped';
  const delta = segment.delta?.text ? segment.delta : null;
  // Done stages are cream, or teal / amber when they beat / lost to the plan (A-05); a skip is the teal bridge.
  const state = skipped ? 'skipped' : results && segment.state === 'done' ? (delta?.tone === 'faster' ? 'good' : delta?.tone === 'slower' ? 'bad' : 'done') : segment.state;
  const value = future ? `~${seconds(segment.avgMs)}`
    : skipped ? 'skip'
      : segment.state === 'current' ? segment.currentText || undefined
        : segment.splitText || undefined;
  return {
    key: segment.key,
    label: caseInfo ? `${stageLabel(segment)} · ${caseInfo.name}` : stageLabel(segment),
    // The cross keeps its name ("cross" in every frame); the pairs and later stages use their short form (p1, eo, cp).
    short: segment.key === 'cross' ? segment.label : segment.short,
    value,
    delta: delta?.text,
    deltaTone: delta ? TONE[delta.tone] ?? 'neutral' : undefined,
    tag: tag?.text,
    tagTone: tag?.tone,
    merged: segment.merged || undefined,
    weight: segment.weight,
    fill: state === 'good' || state === 'bad' || state === 'done' ? 1 : segment.fill,
    state,
    importance: segment.state === 'current' ? 100 : (segment.tags ?? []).some(item => /x-cross/.test(item)) ? 80 : 10,
    ariaLabel: caseInfo ? `${segment.label} · ${caseInfo.name}${caseInfo.recognitionMs != null ? ` · recog ${(caseInfo.recognitionMs / 1000).toFixed(2)} s` : ''}${caseInfo.executionMs != null ? ` · exec ${(caseInfo.executionMs / 1000).toFixed(2)} s` : ''}` : undefined,
    selectable,
    caseKey: caseInfo ? (/^pair\d$/.test(segment.key) ? segment.key : caseInfo.kind) : undefined,
  };
}

/** The prominent review moment of a stage as a ring tag: "✦ pseudo pair" (good, teal) or "○ pause 0.9 s" (warning, amber). */
function stageTags(markers = []) {
  const tags = new Map();
  for (const marker of markers) {
    if (!marker.prominent || tags.has(marker.seg ?? marker.stage)) continue;
    const label = /^pair \d pseudo$/.test(marker.label) ? 'pseudo pair' : /^(eo|co|cp|ep|oll|pll) skip$/.test(marker.label) ? marker.label.replace(/^\w+/, word => word.toUpperCase()) : marker.label;
    tags.set(marker.seg ?? marker.stage, marker.tone === 'good' ? { text: `✦ ${label}`, tone: 'good' } : { text: `○ ${label}`, tone: 'bad' });
  }
  return tags;
}

/** A run of moves is separated from the next by this much ring (W-21, approved): two moves of one run sit `moveGapDeg` apart. */
const SECTION_BOUNDARY_DEG = 14;
const { moveGapDeg: MOVE_GAP_DEG, sweepDeg: RING_SWEEP_DEG } = ORBIT_GEOMETRY;
const spacer = (index, weight) => ({ key: `gap-${index}`, label: '', weight, state: 'spacer', fill: 0 });

/**
 * Sections are spacing, never brackets (W-21): between runs the ring leaves SECTION_BOUNDARY_DEG, built from an invisible spacer
 * segment so the Orbit's own gap rule (one gap between neighbours) stays untouched. A spacer of weight w among N moves and k
 * spacers takes  A * w / (N + k * w)  degrees, A = the sweep minus every gap; solve for the spacer width `s`.
 */
function withSections(runs) {
  const filled = runs.filter(run => run.length);
  const count = filled.reduce((sum, run) => sum + run.length, 0), spacers = filled.length - 1;
  if (spacers <= 0) return filled.flat();
  const s = SECTION_BOUNDARY_DEG - 2 * MOVE_GAP_DEG;
  const available = RING_SWEEP_DEG - (count + spacers - 1) * MOVE_GAP_DEG;
  const weight = s * count / (available - s * spacers);
  return filled.flatMap((run, at) => at ? [spacer(at, weight), ...run] : run);
}

/** The scramble ring: one segment per move, drawn by the Orbit as labels at r=330 (done faint, current teal, upcoming bright). */
const moveSegments = scramble => {
  const moves = scramble?.moves ?? [];
  const recovery = scramble?.recovery ?? [];
  const step = Math.min(scramble?.step ?? 0, moves.length);
  const plan = moves.map((move, index) => ({
    key: move.key,
    label: displayMove(move.text),
    weight: 1,
    state: move.state === 'current' ? 'current' : move.state === 'done' ? 'done' : 'future',
    importance: move.state === 'current' ? 1000 : Math.max(10, 90 - Math.abs(index - step)),
  }));
  if (!recovery.length) return plan;
  // After a wrong turn: [done] gap [the way back, amber] gap [the planned move, then the rest]. The planned move is no longer "current".
  const undo = recovery.map((move, index) => ({ key: `undo-${move.key}`, label: displayMove(move.text), weight: 1, state: 'wrong', importance: 800 - index }));
  const upcoming = plan.slice(step).map(segment => segment.state === 'current' ? { ...segment, state: 'future' } : segment);
  return withSections([plan.slice(0, step), undo, upcoming]);
};

/** Draw what the Orbit does not: the current-move pill (A-02 / A-02b) and a state class on each stage label. */
function decorate(orbit) {
  const root = orbit.element.querySelector('.orbit__svg');
  if (!root) return;
  const byKey = new Map((orbit.displayed?.segments ?? []).map((segment, index) => [String(segment.key ?? index), segment]));
  const layout = new Map((orbit.displayed?.layout ?? []).map(part => [String(part.key), part]));
  const scale = Number(orbit.element.style.getPropertyValue('--orbit-label-scale')) || 1;
  for (const label of root.querySelectorAll('.orbit__label[data-label-for]')) {
    const key = label.dataset.labelFor, segment = byKey.get(key);
    if (!segment) continue;
    label.classList.add(`is-${segment.state}`, `delta-${segment.deltaTone ?? 'none'}`);
    // The Orbit seats every block as if it had four rows. A plan label (two quiet 12 px rows) is shorter: move it down by the difference,
    // in the Orbit's own proportion (the whole difference at the top of the ring, half of it on the sides, none at the bottom).
    const placed = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(label.getAttribute('transform') ?? '');
    const part = layout.get(key);
    if (segment.state === 'future' && !segment.tag && placed && part) {
      const lift = Math.cos(part.mid * Math.PI / 180), reach = Math.sign(lift) * Math.min(1, Math.abs(lift) * 2.5);
      const orbitHeight = (10 + 21 + 8) * scale, ownHeight = PLAN_LABEL.height * scale;
      label.setAttribute('transform', `translate(${placed[1]} ${Number(placed[2]) + (orbitHeight - ownHeight) / 2 * (1 + reach)})`);
    }
  }
  const first = root.querySelector('.orbit__move-label.is-current, .orbit__move-label.is-wrong');
  for (const text of first ? [first] : []) {
    const pill = document.createElementNS(SVG_NS, 'rect');
    pill.setAttribute('class', `orbit__pill ${text.classList.contains('is-wrong') ? 'is-wrong' : 'is-current'}`);
    pill.setAttribute('width', String(PILL.width)); pill.setAttribute('height', String(PILL.height)); pill.setAttribute('rx', String(PILL.height / 2));
    pill.setAttribute('x', String(Number(text.getAttribute('x')) - PILL.width / 2)); pill.setAttribute('y', String(Number(text.getAttribute('y')) - PILL.height / 2));
    text.before(pill);
  }
}

export function createSolveOrbit(host, { dispatch = () => {} } = {}) {
  const orbit = new Orbit(host, {
    size: 'XL', shape: 'open', gap: 70, fitHost: true, centerClearance: 160, labelStyle: 'around', label: 'Solve progress',
    segments: [], markers: [], onSegment: segment => {
      if (segment.selectable) dispatch({ type: 'openDetail', kind: 'stage', key: segment.key });
    },
    onMarker: marker => dispatch({ type: 'selectMarker', id: marker.key }),
  });
  orbit.element.addEventListener('orbitchange', () => decorate(orbit));
  let lastScreen = '';
  let lastInspection = null;

  function model(vm) {
    const connecting = vm.device?.phase === 'connecting' || vm.device?.phase === 'syncing';
    if (connecting) return { shape: 'full', gap: 0, direction: 'clockwise', segments: [{ key: 'connecting', weight: 1, fill: .18, state: 'current', label: '' }], markers: [], caret: null, labelKind: 'stage' };
    if (vm.screen === 'scramble') {
      const undo = vm.scramble?.recovery?.[0];
      // The wrong move stays visible as an amber "!" token where the way back starts.
      const markers = undo ? [{ key: 'wrong-turn', segment: `undo-${undo.key}`, position: 0, label: `you turned ${(vm.scramble.detour ?? []).map(displayMove).join(' ')}`, tone: 'bad', type: 'warning' }] : [];
      return { shape: 'open', gap: 70, direction: 'clockwise', segments: moveSegments(vm.scramble), markers, caret: null, labelKind: 'move' };
    }
    if (vm.screen === 'inspection') {
      const i = vm.inspection;
      const ticks = inspectionMarkers(i);
      return { shape: 'open', gap: 70, segments: inspectionSegments(i), markers: ticks, direction: 'counterclockwise', caret: inspectionCaret(i), labelKind: 'stage' };
    }
    const timeline = vm.timeline;
    const results = vm.screen === 'results' ? vm.results : null;
    const caseLinks = results?.caseLinks ?? {};
    const tags = results ? stageTags(results.review?.markers) : new Map();
    const segments = (timeline?.segments ?? []).map(segment => {
      const caseInfo = caseLinks[segment.key] ?? (segment.key === 'pll' || segment.key === 'ep' ? caseLinks.pll : segment.key === 'oll' || segment.key === 'co' ? caseLinks.oll : null);
      return stageSegment({ ...segment, currentText: vm.screen === 'solving' && segment.state === 'current' ? '0.00' : '' }, { results: Boolean(results), caseInfo, tag: tags.get(segment.key), selectable: Boolean(results) });
    });
    const markers = (results?.review?.markers ?? []).map(marker => ({ key: marker.id, segment: marker.seg, position: marker.frac, label: marker.label, tone: marker.tone === 'good' ? 'good' : 'bad', type: marker.tone === 'good' ? 'spark' : 'warning' }));
    return { shape: 'open', gap: 70, direction: 'clockwise', segments, markers, caret: null, labelKind: 'stage' };
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
        const segments = orbit.options.segments.map(segment => segment.state === 'current' ? { ...segment, fill: frameState.currentFill, value: frameState.currentSplitText || segment.value } : segment);
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
  const tags = stageTags(vm.review?.markers);
  const segments = (vm.timeline.segments ?? []).map(segment => {
    const info = segment.caseKey ? caseLinks[segment.caseKey] ?? caseLinks[segment.caseKey.split(':')[0]] : null;
    return { ...stageSegment(segment, { results: true, caseInfo: info, tag: tags.get(segment.key), selectable: true }), importance: segment.state === 'done' ? 20 : 10, onCase: Boolean(info) };
  });
  const markers = (vm.review?.markers ?? []).map(marker => ({ key: marker.id, segment: marker.seg, position: marker.frac, label: marker.label, tone: marker.tone === 'good' ? 'good' : 'bad', type: marker.tone === 'good' ? 'spark' : 'warning' }));
  void orbit.update({ size: 'XL', shape: 'open', gap: 70, label: 'Past solve results', segments, markers,
    onSegment: segment => dispatch({ type: 'openDetail', kind: 'stage', key: segment.key }),
    onMarker: marker => dispatch({ type: 'selectMarker', id: marker.key }),
  }, { animate: true });
}
