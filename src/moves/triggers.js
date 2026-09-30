// Known triggers, for grouping a sequence into chunks a cuber recognises.
import { parseSequence } from './notation.js';

// Longest first: a match takes the longest pattern that fits at the position.
const TRIGGERS = [
  { label: 'sune', moves: "R U R' U R U2 R'" },
  { label: 'anti-sune', moves: "R U2 R' U' R U' R'" },
  { label: 'sexy move', moves: "R U R' U'" },
  { label: 'reverse sexy', moves: "U R U' R'" },
  { label: 'left sexy', moves: "L' U' L U" },
  { label: 'sledgehammer', moves: "R' F R F'" },
  { label: 'trigger', moves: "R U R'" },
].map(t => ({ ...t, tokens: parseSequence(t.moves) })).sort((a, b) => b.tokens.length - a.tokens.length);

/**
 * Groups of a sequence as [start, end, label] (end inclusive). `grouping` is
 * 'none', 'auto' (detect the known triggers) or an explicit array of groups.
 */
export function groupMoves(moves, grouping = 'auto') {
  if (Array.isArray(grouping)) return grouping.map(([start, end, label = '']) => [start, end, label]);
  if (grouping === 'none' || !grouping) return [];
  const list = parseSequence(moves);
  const groups = [];
  for (let i = 0; i < list.length;) {
    const hit = TRIGGERS.find(t => t.tokens.every((token, k) => list[i + k] === token));
    if (hit) { groups.push([i, i + hit.tokens.length - 1, hit.label]); i += hit.tokens.length; } else i++;
  }
  return groups;
}
