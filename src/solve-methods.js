// Solving-method configurations that drive the timeline stages.
//
// Each method lists the stages you WORK THROUGH, in order, followed by a finish point
// ('Solved') as the last entry. `mapProgress` turns the live tracker's monotonic
// `progress` (crossDone / pairsSolved / f2lDone / eoDone / coDone / ollDone / solved)
// into the index of the stage you are CURRENTLY working on: before the cross is done
// that is the first stage (Cross); once the cross is done it is F2L; and so on. A
// solved cube maps to the finish point (stages.length - 1). There is no Scramble stage:
// scrambling/inspection map to the first stage, since that is what you are about to do.
//
// CFOP is fully detected by the live tracker; other methods (Roux, ZZ, Petrus, …) list
// their stages so the UI is configurable now, with their `mapProgress` to be implemented
// alongside their method-specific milestone detection in the tracker (a documented TODO).

export const FINISH_STAGE = 'Solved';

// OLL is split into two looks (EO then CO) by default.
// TODO: there is no 1-look/2-look OLL setting yet. When one is added, a 1-look method
// should list a single 'OLL' stage (current until progress.ollDone) instead of EO/CO,
// and brain.js's skip-marker mapping should point eo/co/oll skips at it.
export const METHODS = [
  {
    id: 'cfop',
    label: 'CFOP',
    description: 'Cross → F2L → OLL (2-look: EO, CO) → PLL.',
    stages: ['Cross', 'F2L', 'EO', 'CO', 'PLL', FINISH_STAGE],
    mapProgress(progress) {
      const p = progress || {};
      if (p.solved) return 5;                      // finish
      if (!p.crossDone) return 0;                  // building the cross (also scramble/inspection)
      if (!p.f2lDone) return 1;                    // F2L (pair count in phase detail)
      if (!p.eoDone) return 2;                     // OLL look 1: orient edges
      if (!p.coDone) return 3;                     // OLL look 2: orient corners
      return 4;                                    // PLL
    },
  },
  {
    id: 'roux',
    label: 'Roux',
    description: 'First Block → Second Block → CMLL → L6E. (Stage detection is CFOP-based for now — Roux milestones are a TODO.)',
    stages: ['First Block', 'SB', 'CMLL', 'L6E', FINISH_STAGE],
    // TODO: detect Roux milestones (first block, second block, CMLL, L6E) in the live tracker.
    // Until then the CFOP milestones stand in: cross ≈ first block, F2L ≈ second block,
    // OLL ≈ CMLL, solve ≈ L6E.
    mapProgress(progress) {
      const p = progress || {};
      if (p.solved) return 4;                      // finish
      if (!p.crossDone) return 0;                  // First Block
      if (!p.f2lDone) return 1;                    // SB
      if (!p.ollDone) return 2;                    // CMLL
      return 3;                                    // L6E
    },
  },
];

export const DEFAULT_METHOD = 'cfop';
export function getMethod(id) { return METHODS.find(m => m.id === id) || METHODS[0]; }
