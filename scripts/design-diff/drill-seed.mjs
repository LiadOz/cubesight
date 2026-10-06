// The OLL drill of frame A-08, mid round: 12 of 20 cases answered, case 13 on screen. The labels around the ring are the cases
// just answered (27 21 33 45 2 9 22 31 26 57 37 51); the two amber arcs (45, 57) are the two slow ones. The stats the frame
// prints: combo x7, round avg 2.31 s, best case 0.92 s, "spaced . 12 due".
import { itemKey } from '../../src/learning.js';

export const FIXED_NOW = Date.UTC(2026, 0, 15, 12);
const CASES = [27, 21, 33, 45, 2, 9, 22, 31, 26, 57, 37, 51];
const MS = [2410, 1980, 920, 3850, 2230, 2120, 1990, 2260, 2480, 4210, 1650, 1620];

export function ollRoundStorage() {
  const answers = CASES.map((number, index) => ({ correct: true, ms: MS[index], caseId: `oll/${number}`, at: FIXED_NOW - (CASES.length - index) * 4000 }));
  const items = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [itemKey('oll', `oll/${60 + index}`), { attempts: 1, correct: 1, due: 0 }]));
  // The one due case, so the frame's case 13 is the same case on every run (OLL 25: all four edges and two adjacent corners oriented).
  items[itemKey('oll', 'oll/25')] = { attempts: 1, correct: 1, due: 0 };
  return {
    'cubesight-shell-v1': { version: 1, lastDrill: 'oll', settings: {}, bestCombos: { oll: 7 }, days: [], round: { drill: 'oll', preset: { kind: 'cases', cases: 20 }, startedAt: FIXED_NOW - 60_000, updatedAt: FIXED_NOW, status: 'active', answers, combo: 7, bestCombo: 7 } },
    'cubesight-oll-learning-v1': { version: 1, trial: 0, recentKeys: [], items, sessions: [] },
  };
}
