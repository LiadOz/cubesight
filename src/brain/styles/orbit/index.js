// Orbit style module: the timeline is a ring around the cube, inspection is
// a countdown ring, results turn the ring into a donut. Default Brain style.
import '../../css/tokens-orbit.css';
import '../../css/charts.css';
import '../../css/orbit.css';
import { createInspectionRing } from './inspection-ring.js';
import { createOrbitResults } from './results-orbit.js';
import { createRingTimeline } from './timeline-ring.js';

/** @type {import('../../types.js').StyleModule & {asides: {timeline: boolean, inspection: boolean}}} */
export const orbitStyle = {
  id: 'orbit',
  layout: 'orbit',
  timeline: createRingTimeline,
  inspection: createInspectionRing,
  results: createOrbitResults,
  // Orbit renders the inspection countdown and the live split list in the
  // right-hand column when the shell passes ctx.aside to these factories.
  asides: { timeline: true, inspection: true },
};

export default orbitStyle;
