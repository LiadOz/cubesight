import { parseDrillStart } from './start-position.js';
import { resolveDrillPosition } from './position.js';
import { analysisStateFromScramble } from '../analysis/long-replay.js';
import { relabelMoves } from '../analysis/normalize.js';
import { identifyPllCase, PLL_CASES } from '../pll-logic.js';

/** Resolve the exact PLL position before creating any recognition prompt. */
export async function resolvePLLStart(hash, { historyStore = null } = {}) {
  const start = parseDrillStart(hash);
  const query = new URLSearchParams(String(hash).split('?')[1] ?? '');
  const named = start.cases.map(name => name.replace(/^pll\//i, ''));
  const allowed = named.length ? PLL_CASES.filter(row => named.some(name => name.toLowerCase() === row.name.toLowerCase())).map(row => row.name) : null;
  if (named.length && !allowed.length) return { error: 'No known PLL cases match this link.' };
  if (!(query.get('setup') || query.get('scramble'))) return { allowed, start };
  if (start.invalid || (!start.review && !start.moves.length)) return { error: 'This setup is not valid move notation. Check the link and try again.' };
  const position = await resolveDrillPosition(start, 'pll', { historyStore });
  if (position.missing) return { error: 'This saved position is no longer available. Open the solve from history to choose another point.' };
  const face = position.pin?.crossFace || start.face || 'D';
  const moves = face === 'D' ? position.moves : relabelMoves(position.moves, face);
  let state;
  try { state = analysisStateFromScramble(moves.join(' ')); } catch { return { error: 'This position could not be loaded.' }; }
  const recognized = identifyPllCase(state);
  if (!recognized) return { error: 'This position is not a PLL case. Finish the first two layers and orientation before PLL recognition.' };
  if (allowed && !allowed.includes(recognized.name)) return { error: 'This setup does not match the PLL cases requested in this link.' };
  return { allowed, start, state, recognized, pin: position.pin ? { ...position.pin, scramble: moves.join(' '), movesUpTo: [], crossFace: 'D' } : null };
}
