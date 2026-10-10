// Resolve the actual target of the line being reviewed, in the recording's face frame.
// The Cube follows these piece identities throughout playback.
import { FACE_TO_D } from '../../analysis/normalize.js';
export function reviewEmphasis(record, stageKey, variant = 'yours', targetSlots = null) {
  if (!stageKey) return null;
  const analysis = record?.analysis;
  const crossFace = analysis?.face ?? record?.crossFace ?? 'D';
  const pairNumber = /^pair([1-4])$/.exec(stageKey)?.[1];
  const pair = pairNumber && analysis?.pairs?.find(row => row.n === Number(pairNumber));
  const caseInfo = analysis?.f2lCases?.[stageKey];
  const originalFaces = Object.fromEntries(Object.entries(FACE_TO_D[crossFace] ?? FACE_TO_D.D).map(([from, to]) => [to, from]));
  const caseSlot = caseInfo?.targetPair ? [...caseInfo.targetPair].map(face => originalFaces[face]).join('') : null;
  const slots = pairNumber
    ? variant === 'better'
      ? targetSlots ?? (pair?.better?.slots?.length ? pair.better.slots : [pair?.better?.slot].filter(Boolean))
      : pair?.chosenSlots?.length ? pair.chosenSlots : [pair?.chosenSlot ?? caseSlot].filter(Boolean)
    : stageKey === 'cross' ? analysis?.cross?.target?.slots ?? [] : [];
  return { stage: stageKey === 'cross' && slots.length ? 'xcross' : stageKey, options: { crossFace, slots } };
}
