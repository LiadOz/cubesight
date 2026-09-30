// Mono inspection: a big countdown number over a 6 px lane that drains toward
// the limit, with the +2 zone and a hatched DNF zone ahead of it (or the
// count/grace/auto-start variants). The shell's stage is a flex column; these
// parts join it directly (the slot is display: contents) so the coach line can
// sit between the countdown and the lane.

import { setStyle, setText, toggleClass } from '../../dom.js';

/** @typedef {import('../../types.js').BrainVM} BrainVM */
/** @typedef {import('../../types.js').InspectionVM} InspectionVM */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const ZONE_LABEL = { plus2: '+2', dnf: 'dnf', grace: 'grace', count: '' };

/** @type {import('../../types.js').ComponentFactory} */
export function createInspectionLane(host) {
  const label = el('p', 'm-insp-label');
  const big = el('div', 'm-insp-big');
  const consequence = el('p', 'm-insp-consequence');
  const note = el('p', 'm-insp-note');
  const lane = el('div', 'm-lane');
  const zoneLabels = el('div', 'm-lane-zonelabels');
  const track = el('div', 'm-lane-track');
  const zones = el('div', 'm-lane-zones');
  const remaining = el('i', 'm-lane-remaining');
  const over = el('i', 'm-lane-over');
  const caret = el('b', 'm-lane-caret');
  track.append(zones, remaining, over, caret);
  const ticks = el('div', 'm-lane-ticks');
  lane.append(zoneLabels, track, ticks);
  const parts = [label, big, consequence, note, lane];
  host.append(...parts);

  /** @type {InspectionVM|null} */
  let current = null;
  let structureKey = '';

  const pct = (ms, scale) => `${Math.max(0, Math.min(100, (ms / scale) * 100)).toFixed(3)}%`;
  // The lane's drawn length: the VM scale plus a short stub for an open-ended
  // zone that starts at the end (the hatched DNF zone after 17 s).
  const laneMs = insp => insp.scaleMs + (insp.zones.some(z => z.toMs == null && z.fromMs >= insp.scaleMs) ? insp.scaleMs * 0.08 : 0);

  function rebuild(insp) {
    const scale = laneMs(insp);
    zones.replaceChildren();
    zoneLabels.replaceChildren();
    ticks.replaceChildren();
    for (const zone of insp.zones) {
      const node = el('i', `m-zone m-zone-${zone.kind}`);
      setStyle(node, 'left', pct(zone.fromMs, scale));
      setStyle(node, 'right', `${(100 - parseFloat(pct(zone.toMs ?? scale, scale))).toFixed(3)}%`);
      zones.append(node);
      const text = ZONE_LABEL[zone.kind];
      if (text) {
        const tag = el('span', `m-zonelabel m-zonelabel-${zone.kind}`, text);
        setStyle(tag, 'left', pct(((zone.fromMs + (zone.toMs ?? scale)) / 2), scale));
        zoneLabels.append(tag);
      }
    }
    for (const tick of insp.ticks) {
      const node = el('span', `m-tick m-tick-${tick.kind}`);
      node.dataset.at = String(tick.atMs);
      node.append(el('i'), el('span', null, tick.label));
      setStyle(node, 'left', pct(tick.atMs, scale));
      ticks.append(node);
    }
  }

  /** Geometry that moves with the clock. */
  function paint(insp, elapsedMs) {
    const scale = laneMs(insp);
    setStyle(caret, 'left', pct(elapsedMs, scale));
    if (insp.limitMs != null) {
      // Remaining inspection drains from the caret to the limit.
      const from = Math.min(elapsedMs, insp.limitMs);
      setStyle(remaining, 'left', pct(from, scale));
      setStyle(remaining, 'width', pct(Math.max(0, insp.limitMs - from), scale));
      // Overtime fills from the limit to the caret.
      setStyle(over, 'left', pct(insp.limitMs, scale));
      setStyle(over, 'width', pct(Math.max(0, elapsedMs - insp.limitMs), scale));
    } else {
      // Unlimited: the lane counts up.
      setStyle(remaining, 'left', '0%');
      setStyle(remaining, 'width', pct(elapsedMs, scale));
      setStyle(over, 'width', '0%');
    }
    for (const tick of ticks.children) toggleClass(tick, 'is-passed', Number(tick.dataset.at) <= elapsedMs && Number(tick.dataset.at) > 0);
  }

  function paintText(insp, bigText, tone, consequenceText, overtimeMs) {
    setText(big, bigText);
    big.dataset.tone = tone;
    setText(consequence, consequenceText);
    consequence.dataset.tone = tone;
    const overtime = overtimeMs > 0;
    setText(label, overtime ? 'overtime' : insp.overtime === 'autostart' && insp.autostartHandoff ? 'go' : 'inspection');
    label.dataset.tone = overtime ? tone : 'muted';
    // Only WCA overtime has consequences worth pointing at the setting.
    setText(note, overtime && insp.overtime === 'wca' ? 'wca rules · change in settings → inspection' : '');
  }

  /** @param {BrainVM} vm @param {BrainVM|null} prev */
  function update(vm, prev) {
    const insp = vm.inspection;
    const visible = Boolean(insp) && vm.screen === 'inspection';
    for (const part of parts) part.hidden = !visible;
    if (!insp || insp === prev?.inspection && current === insp) { current = insp ?? null; return; }
    const key = `${insp.mode}|${insp.overtime}|${insp.scaleMs}|${insp.zones.map(z => `${z.kind}${z.fromMs}-${z.toMs}`).join(',')}|${insp.ticks.map(t => `${t.atMs}${t.label}`).join(',')}`;
    if (key !== structureKey) { rebuild(insp); structureKey = key; }
    lane.dataset.mode = insp.mode;
    lane.dataset.overtime = insp.overtime;
    toggleClass(lane, 'is-over', insp.overtimeMs > 0);
    toggleClass(lane, 'is-callout', insp.callout != null);
    paint(insp, insp.elapsedMs);
    paintText(insp, insp.bigText, insp.tone, insp.consequence, insp.overtimeMs);
    current = insp;
  }

  /** @param {import('../../types.js').FrameVM} f */
  function frame(f) {
    if (!current || !f.inspection) return;
    paint(current, f.inspection.caret * current.scaleMs);
    paintText(current, f.inspection.bigText, f.inspection.tone, f.inspection.consequence, f.inspection.overtimeMs);
    toggleClass(lane, 'is-over', f.inspection.overtimeMs > 0);
  }

  return { update, frame, destroy() { for (const part of parts) part.remove(); } };
}
