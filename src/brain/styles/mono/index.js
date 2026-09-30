// Mono: the monkeytype-like Brain style (design A). One monospace face, one
// accent, a linear timeline sized by your average splits.

import '@fontsource/dm-mono/latin-300.css';
import '../../css/tokens-mono.css';
import '../../css/mono.css';
import { createLinearTimeline } from './timeline-linear.js';
import { createInspectionLane } from './inspection-lane.js';
import { createMonoResults } from './results-mono.js';

/** @type {import('../../types.js').StyleModule} */
export const monoStyle = {
  id: 'mono',
  layout: 'column',
  timeline: createLinearTimeline,
  inspection: createInspectionLane,
  results: createMonoResults,
};

export default monoStyle;
