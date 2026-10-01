import { applyMoves } from '../../cross-cube.js';
import { physicalModelTokens, tokenizeReconstruction } from '../../review/import-parser.js';
import { caseSetupState, f2lStateIntact } from './cube.js';

/**
 * Keep a virtual case view in sync with the user's physical move stream. After
 * a clean round, repaint() selects a fresh case setup while the real cube stays
 * where it is, so the next round does not require a manual reset.
 */
export function createVirtualRepaint(caseData) {
  if (!caseData) throw new Error('Choose a case to repaint.');
  if (!['oll', 'pll', 'oll2'].includes(caseData.set)) {
    throw new Error('Virtual repaint is available for last-layer cases only. Set up F2L cases again between rounds.');
  }
  let virtualState = caseSetupState(caseData);
  let activeCaseId = caseData.id;
  let moveCount = 0;
  return {
    turn(input) {
      const tokens = tokenizeReconstruction(String(input ?? '')).tokens;
      const moves = physicalModelTokens(tokens);
      if (moves.length) { virtualState = applyMoves(virtualState, moves); moveCount += moves.length; }
      return virtualState;
    },
    repaint(nextCase) {
      if (!nextCase) throw new Error('Choose a case to repaint.');
      if (!['oll', 'pll', 'oll2'].includes(nextCase.set)) {
        throw new Error('Virtual repaint is available for last-layer cases only.');
      }
      virtualState = caseSetupState(nextCase);
      activeCaseId = nextCase.id;
      moveCount = 0;
      return virtualState;
    },
    f2lIntact(physicalState) { return f2lStateIntact(virtualState) && f2lStateIntact(physicalState); },
    get state() { return virtualState; },
    get caseId() { return activeCaseId; },
    get moveCount() { return moveCount; },
  };
}
