// The reviewed moment of frame A-06 as a pure view model: a marker and its detail in, what the screen shows out (no DOM, no CSS).
import { DRILLS } from '../../drills/catalog.js';
import { fmtMoves, plural } from '../format.js';

const trainerHref = (trainer, record, idx) => {
  const drill = DRILLS.find(item => item.id === (trainer === 'cross' ? 'scout' : trainer)) ?? DRILLS.find(item => item.id === 'lookahead');
  return `${drill.href}?setup=review:${record.at}:${idx}`;
};

/**
 * @param {{marker:Object, detail:Object, record:Object, backHref:string}} input  detail = buildDetail() of that marker.
 * @returns {null|{tone:'warn'|'good', badge:string, prose:string, outer:{text:string, state:'done'|'current'|'later'}[], inner:{text:string, state:'before'|'better'}[],
 *   outerLegend:string, innerLegend:string|null, count:string, why:string, canPlayBetter:boolean, retryHref:string|null, backHref:string, backLabel:string}}
 */
export function buildMoment({ marker, detail, record, backHref }) {
  if (!marker || !detail || !Array.isArray(detail.moves)) return null;
  const stage = String(detail.title ?? '').split(' · ').at(-1) || marker.stage;
  let here = detail.moves.findIndex(move => move.i >= marker.idx);
  if (here < 0) here = Math.max(0, detail.moves.length - 1);
  const outer = detail.moves.map((move, index) => ({ text: move.text, state: index < here ? 'done' : index === here ? 'current' : 'later' }));
  const better = marker.better?.moves?.length ? marker.better : null;
  const before = better ? outer.slice(0, Math.max(0, better.from - detail.from)).map(move => ({ text: move.text, state: 'before' })) : [];
  const inner = better ? [...before, ...better.moves.map(move => ({ text: fmtMoves(move), state: 'better' }))] : [];
  const tail = better ? better.yours.map(fmtMoves) : [];
  const warn = marker.tone !== 'good';
  const move = outer[here]?.text ?? '';
  const prose = better && tail.length
    ? `From here ${better.moves.map(fmtMoves).join(' ')} gets the ${stage} in ${plural(better.moves.length, 'move')}; your ${tail.join(' ')} took ${tail.length}.`
    : marker.note || '';
  const why = marker.kind === 'detour' ? `${move} turned you away from the ${stage}`
    : marker.kind === 'extra-move' ? `${move} cost a spare turn`
      : marker.label;
  return {
    tone: warn ? 'warn' : 'good',
    badge: detail.title,
    prose,
    outer,
    inner,
    outerLegend: `outer · yours, ${plural(outer.length, 'move')}`,
    innerLegend: inner.length ? `inner · better, ${plural(inner.length, 'move')}` : null,
    count: outer.length ? `move ${here + 1} of ${outer.length}` : marker.label,
    why,
    canPlayBetter: Boolean(better),
    retryHref: detail.pin?.available ? trainerHref(marker.trainer, record, marker.idx) : null,
    backHref,
    backLabel: 'back to results',
  };
}
