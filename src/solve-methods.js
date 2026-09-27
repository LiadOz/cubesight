// Solving-method configurations that drive the timeline stages.
//
// Each method defines the stages its timeline shows and a `mapProgress` function that
// turns the live tracker's monotonic `progress` (crossDone / pairsSolved / f2lDone /
// ollDone / solved) into a stage index for THIS method. CFOP is fully detected by
// the live tracker; other methods (Roux, ZZ, Petrus, …) list their stages so the UI is configurable
// now, with their `mapProgress` to be implemented alongside their
// method-specific milestone detection in the tracker (a documented TODO).

export const METHODS = [
  {
    id: 'cfop',
    label: 'CFOP',
    description: 'Cross → F2L → OLL → PLL.',
    stages: ['Scramble', 'Cross', 'F2L', 'EO', 'CO', 'PLL', 'Solved'],
    mapProgress(progress, phase) {
      const p = progress || {};
      if (phase === 'applying' || phase === 'inspecting') return 0;  // Scramble
      if (!p.crossDone) return 0;                            // pre-cross
      if (!p.f2lDone) return 1;                               // Cross
      if (!p.eoDone) return 2;                               // F2L (pair count in phase detail)
      if (!p.coDone) return 3;                               // EO (orient edges)
      if (!p.solved) return 4;                               // CO (orient corners = OLL done)
      return 5;                                             // Solved
    },
  },
  {
    id: 'roux',
    label: 'Roux',
    description: 'First Block → SB Pairs → CMLL → L6E. (Stage detection is CFOP-based for now — Roux milestones are a TODO.)',
    stages: ['Scramble', 'First Block', 'SB Pairs', 'CMLL', 'L6E', 'Solved'],
    // TODO: detect Roux milestones (first block, SB pairs, CMLL, L6E) in the live tracker.
    mapProgress(progress, phase) {
      const p = progress || {};
      if (phase === 'applying' || phase === 'inspecting') return 0;
      if (!p.crossDone) return 0;        // Roux "First Block" ≈ cross for now
      if (!p.f2lDone) return 1 + Math.min(3, Math.max(0, Math.floor((p.pairsSolved ?? 0) / 4 * 3)));
      if (!p.ollDone) return 4;
      if (!p.solved) return 5;
      return 6;
    },
  },
];

export const DEFAULT_METHOD = 'cfop';
export function getMethod(id) { return METHODS.find(m => m.id === id) || METHODS[0]; }
