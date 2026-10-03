// Solve style module: the same shared Orbit and Cube carry scramble,
// inspection, solve progress and results. Mono remains the legacy skin.
import '../../css/tokens-orbit.css';
import '../../css/charts.css';
import '../../css/orbit.css';
import { createOrbitResults } from './results-orbit.js';
import { createSolveOrbit } from './solve-orbit.js';

const inspectionView = () => ({ update() {}, frame() {}, destroy() {} });

/** @type {import('../../types.js').StyleModule & {asides: {timeline: boolean, inspection: boolean}}} */
export const orbitStyle = {
  id: 'orbit',
  layout: 'orbit',
  timeline: createSolveOrbit,
  // Inspection is another state of the same Orbit instance, never a second ring.
  inspection: inspectionView,
  results: createOrbitResults,
  // The Orbit carries both the inspection countdown and live stage progress.
  asides: { timeline: true, inspection: true },
};

export default orbitStyle;
