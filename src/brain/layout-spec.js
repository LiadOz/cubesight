// The solve screen's geometry, read from the approved frames (src/ui/design-spec.js) and handed to CSS as custom
// properties (--ds-*, plain numbers in canvas px at 1440x900). css/orbit.css multiplies them by --u (one canvas px
// at the current viewport), so nothing on the solve screen is a number somebody typed from a screenshot.
import { ANCHORS, CANVAS, CUBE, ORBIT, TYPE } from '../ui/design-spec.js';
import { ORBIT_GEOMETRY } from '../ui/orbit/geometry.js';

const TYPES = new Map(TYPE.styles.map(style => [style.id, style]));
const frame = id => ANCHORS.frames[id];

/** The first drawn item of `frameId` matching all given fields (text, style, kind, x/y). */
export function anchor(frameId, match) {
  const hit = frame(frameId).find(item => Object.entries(match).every(([key, value]) => item[key] === value));
  if (!hit) throw new Error(`design-spec: no ${JSON.stringify(match)} in ${frameId}`);
  return hit;
}

/** `--ds-<name>-x/-y/-size/-weight/-ls` of a text item (y is the baseline). */
function text(vars, name, item) {
  const type = TYPES.get(item.style);
  vars[`--ds-${name}-x`] = item.x;
  vars[`--ds-${name}-y`] = item.y;
  if (type) {
    vars[`--ds-${name}-size`] = type.size;
    vars[`--ds-${name}-weight`] = type.weight;
    vars[`--ds-${name}-ls`] = type.letterSpacing ?? 0;
  }
}
function box(vars, name, item) {
  vars[`--ds-${name}-x`] = item.x;
  vars[`--ds-${name}-y`] = item.y;
  vars[`--ds-${name}-w`] = item.width;
  vars[`--ds-${name}-h`] = item.height;
}

/** Every value the solve layout needs, keyed by custom-property name. */
export function layoutVars() {
  const vars = {};
  const idle = 'A-01-idle', scramble = 'A-02-scramble', wrong = 'A-02b-wrong-turn', inspection = 'A-03-inspection', solving = 'A-04-solving', results = 'A-05-results';
  vars['--ds-w'] = CANVAS.desktop.width;
  vars['--ds-h'] = CANVAS.desktop.height;
  vars['--ds-cx'] = ORBIT.centre.x;
  vars['--ds-cy'] = ORBIT.centre.y;
  vars['--ds-orbit-view'] = ORBIT_GEOMETRY.view;   // the Orbit's square viewBox, centred on the ring
  // Cube: the bounding box of the isometric hexagon. The WebGL canvas is a square a little larger than the cube
  // (CUBE_CANVAS_SCALE) so a turning layer never clips; the camera frames the silhouette to exactly `height`.
  vars['--ds-cube-w'] = CUBE.desktop.width;
  vars['--ds-cube-h'] = CUBE.desktop.height;
  vars['--ds-cube-box'] = CUBE_BOX;
  // Timer ladder (user decision): one style per state.
  text(vars, 'timer-idle', anchor(idle, { style: 'T03' }));
  text(vars, 'timer-inspection', anchor(inspection, { style: 'T23' }));
  text(vars, 'timer-solving', anchor(solving, { style: 'T05' }));
  text(vars, 'timer-results', anchor(results, { style: 'T04' }));
  // Start pill (idle) and the results pill row.
  box(vars, 'start', anchor(idle, { k: 'rect', x: 618, y: 818 }));
  text(vars, 'start-label', anchor(idle, { text: 'start' }));
  box(vars, 'start-key', anchor(idle, { k: 'rect', x: 761, y: 831 }));
  text(vars, 'start-key-label', anchor(idle, { text: 'space' }));
  box(vars, 'next', anchor(results, { k: 'rect', x: 536, y: 836 }));
  text(vars, 'next-label', anchor(results, { text: 'next scramble' }));
  box(vars, 'next-key', anchor(results, { k: 'rect', x: 665, y: 847 }));
  text(vars, 'next-review', anchor(results, { text: 'review' }));
  text(vars, 'next-more', anchor(results, { text: 'more…' }));
  text(vars, 'compare', anchor(results, { style: 'T92' }));
  // Bottom-left config line and key row; bottom-right lines.
  text(vars, 'config', anchor(idle, { text: 'cfop · 2-look · pseudo pairs · wca inspection' }));
  box(vars, 'keys-idle', anchor(idle, { k: 'rect', x: 48, y: 870 }));
  text(vars, 'keys-idle-label', anchor(idle, { text: 'tab' }));
  box(vars, 'keys-live', anchor(scramble, { k: 'rect', x: 48, y: 866 }));
  text(vars, 'keys-live-label', anchor(scramble, { text: 'esc' }));
  text(vars, 'keys-action', anchor(idle, { text: 'settings' }));
  text(vars, 'stats-1', anchor(idle, { text: 'ao5 14.62 · ao12 15.03 · pb 12.41' }));
  text(vars, 'stats-2', anchor(idle, { text: '23 solves today · history' }));
  text(vars, 'note', anchor(scramble, { text: 'guided · follow the lit face' }));
  // Scramble guidance: the big glyph, its words and the move counter; and the wrong-turn variant.
  text(vars, 'glyph', anchor(scramble, { style: 'T01' }));
  text(vars, 'glyph-desc', anchor(scramble, { style: 'T24' }));
  text(vars, 'glyph-count', anchor(scramble, { style: 'T82' }));
  text(vars, 'wrong-glyph', anchor(wrong, { style: 'T48' }));
  text(vars, 'wrong-head', anchor(wrong, { style: 'T26' }));
  text(vars, 'wrong-hint', anchor(wrong, { style: 'T13' }));
  text(vars, 'wrong-count', anchor(wrong, { style: 'T82' }));
  vars['--ds-pill-w'] = anchor(scramble, { k: 'rect', width: 54, height: 34 }).width;
  vars['--ds-pill-h'] = anchor(scramble, { k: 'rect', width: 54, height: 34 }).height;
  // Solving: the live stage title above the timer.
  text(vars, 'stage-title', anchor(solving, { style: 'T41' }));
  // The live callout pill under the p4 label ("pseudo pair, nice").
  box(vars, 'callout', anchor(solving, { k: 'rect', width: 140.4, height: 24 }));
  text(vars, 'callout-label', anchor(solving, { text: 'pseudo pair, nice' }));
  // Inspection: the countdown digit, its hint line and the plan block on the left.
  text(vars, 'insp-hint', anchor(inspection, { style: 'T13' }));
  text(vars, 'plan-eyebrow', anchor(inspection, { text: 'cross hint' }));
  text(vars, 'plan-head', anchor(inspection, { style: 'T35' }));
  text(vars, 'plan-moves', anchor(inspection, { style: 'T94' }));
  text(vars, 'plan-usual', anchor(inspection, { text: 'your usual: 7.3 moves' }));
  text(vars, 'insp-note', anchor(inspection, { text: 'start any time. +2 after 15, DNF after 17' }));
  // Results: the coach block in the left rail.
  text(vars, 'coach-tag', anchor(results, { text: 'coach' }));
  text(vars, 'coach-body', anchor(results, { style: 'T33' }));
  // The coach paragraph's measure: its longest frame line, at the type size's average advance.
  const coachLines = frame(results).filter(item => item.style === 'T33');
  vars['--ds-coach-w'] = Math.ceil(Math.max(...coachLines.map(item => item.text.length)) * TYPES.get('T33').size * 0.52);
  vars['--ds-coach-pitch'] = anchor(results, { text: 'skip were the highlights; the' }).y - anchor(results, { text: 'Pseudo pair 3 and the EO' }).y;
  text(vars, 'result-note', anchor(results, { text: 'solve 23 · today 17:33 · speed · cube' }));
  // Phone (device-local, 390x844): ring centre/radius, timer, pill and the stacked blocks.
  const phone = 'A-09-phone';
  const device = (dx) => frame(phone).filter(item => item.offset?.[0] === dx);
  const left = device(40), right = device(470);
  const find = (list, match) => { const hit = list.find(item => Object.entries(match).every(([key, value]) => item[key] === value)); if (!hit) throw new Error(`design-spec: no ${JSON.stringify(match)} on the phone`); return hit; };
  vars['--ds-phone-w'] = CANVAS.phoneSheet.device.width;
  vars['--ds-phone-h'] = CANVAS.phoneSheet.device.height;
  vars['--ds-phone-cx'] = ORBIT.phone.centre.x;
  vars['--ds-phone-cy'] = ORBIT.phone.centre.y;
  vars['--ds-phone-r'] = ORBIT.phone.radius;
  vars['--ds-phone-scale'] = ORBIT.phone.radius / ORBIT.radius;   // the Orbit renders at this fraction of its desktop size on a phone
  vars['--ds-phone-cube-h'] = CUBE.phone.height;
  vars['--ds-phone-cube-box'] = Math.round(CUBE.phone.height * CUBE_CANVAS_SCALE);
  vars['--ds-phone-cube-w'] = CUBE.phone.width;
  text(vars, 'phone-brand', find(left, { style: 'T32' }));
  text(vars, 'phone-device', find(left, { style: 'T55' }));
  text(vars, 'phone-stage', find(left, { style: 'T30' }));
  text(vars, 'phone-timer-live', find(left, { style: 'T49' }));
  text(vars, 'phone-timer-done', find(right, { style: 'T47' }));
  box(vars, 'phone-callout', find(left, { k: 'rect', x: 108, y: 560 }));
  text(vars, 'phone-callout-label', find(left, { text: 'pseudo pair, nice' }));
  text(vars, 'phone-stop', find(left, { text: 'stop' }));
  text(vars, 'phone-compare', find(right, { style: 'T70', text: '−0.96 vs ao12 · pb 12.41' }));
  text(vars, 'phone-coach-tag', find(right, { text: 'coach' }));
  text(vars, 'phone-coach-body', find(right, { style: 'T25' }));
  vars['--ds-phone-coach-pitch'] = find(right, { text: 'the highlights; the cross detour at' }).y - find(right, { text: 'Pseudo pair 3 and the EO skip were' }).y;
  box(vars, 'phone-next', find(right, { k: 'rect', x: 24, y: 722 }));
  text(vars, 'phone-next-label', find(right, { text: 'next scramble' }));
  text(vars, 'phone-review', find(right, { text: 'review' }));
  text(vars, 'phone-more', find(right, { text: 'more…' }));
  return vars;
}

/**
 * A stage label that is only a plan (name over ~estimate, 12 px both): the frames space its two rows 17 px apart, the Orbit's
 * block for a done stage (16 px value) uses 21. `height` is the 12 px block's own height so decorate() can re-seat it on the ring.
 */
export const PLAN_LABEL = (() => {
  const name = anchor('A-01-idle', { text: 'cross' }), estimate = anchor('A-01-idle', { text: '~2.41' });
  const pitch = estimate.y - name.y, ascent = 10, descent = 2.5;   // ascent / descent: the Orbit's block puts the first baseline 10 below its top; 12 px mono hangs about 2.5 below a baseline
  return { pitch, height: ascent + pitch + descent };
})();

/** The current-move pill on the scramble ring (A-02): 54 x 34, fully rounded, 330 px from the ring centre. */
export const PILL = (() => { const rect = anchor('A-02-scramble', { k: 'rect', width: 54, height: 34 }); return { width: rect.width, height: rect.height }; })();

/**
 * The cube's WebGL canvas is a square a little larger than the cube. cube-3d.js frames the isometric silhouette (hexagon height) to
 * CUBE_SILHOUETTE_FILL of the canvas height (its ISO_HALF_HEIGHT: 4.85 world units in a 2 x 2.82 frustum), so a canvas of
 * height / fill px shows the hexagon at exactly the frames' 430 px.
 */
export const CUBE_SILHOUETTE_FILL = 4.85 / (2 * 2.82);
export const CUBE_CANVAS_SCALE = 1 / CUBE_SILHOUETTE_FILL;
export const CUBE_BOX = Math.round(CUBE.desktop.height * CUBE_CANVAS_SCALE);

let cached = null;
export function applyLayoutVars(element) {
  cached ??= layoutVars();
  for (const [name, value] of Object.entries(cached)) element.style.setProperty(name, String(value));
}
