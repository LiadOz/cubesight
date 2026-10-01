// Coach text for the Brain, ported line for line from the v1 renderCoach()
// and review hindsight. The lens functions (solve-coach.js) are injected so
// node tests don't need the cross solver or WASM. Keys are stable per line:
// unchanged lines keep their DOM node, running counters use a fixed key.

// 'pair 1' -> 'Pair 1'; step codes stay upper case ('eo' -> 'EO').
const skipName = name => (/^(eo|co|cp|ep|oll|pll|cmll|l6e)$/.test(name) ? name.toUpperCase() : name[0].toUpperCase() + name.slice(1));
const title = color => (color ? color[0].toUpperCase() + color.slice(1) : '');
const seconds = ms => (ms == null ? '—' : !Number.isFinite(ms) ? 'DNF' : `${(ms / 1000).toFixed(2)}s`);

/**
 * Live coach lines.
 * @param {{live:Object, state:Object|null, toggles:Object, optimalCross:{face:string,length:number}|null,
 *   xcross?:string|null, coach?:'live'|'after'|'off'}} input   xcross: 'x-cross' | 'xx-cross' when the cross came with pairs
 * @param {{crossHindsight:Function, f2lNextPairHint:Function, ollStage:Function, pllLens:Function,
 *   efficiencyScore:Function, faceColors:Object}} lenses
 * @returns {import('./types.js').CoachLine[]}
 */
export function coachLines({ live: snap, state, toggles, optimalCross, xcross = null, coach = 'live' }, lenses) {
  const lines = [];
  const p = snap?.progress || {};
  const crossFace = snap?.crossFace;
  const colorOf = face => (lenses.faceColors?.[face] ?? face ?? '').toLowerCase();
  const showLive = coach === 'live' || (coach === 'after' && snap?.phase === 'done');
  if (coach === 'off') return [{ key: 'off', tone: 'muted', text: 'Coach is off.' }];
  if (snap?.phase === 'applying') {
    lines.push({ tone: 'info', text: 'Follow the scramble. A wrong move shows the way back.' });
  } else if ((snap?.phase === 'solving' || snap?.phase === 'done') && crossFace && state && showLive) {
    if (xcross) lines.push({ key: 'xcross', tone: 'good', text: `${xcross.startsWith('xx') ? 'xx-cross' : 'x-cross'}! The cross came together with ${xcross.startsWith('xx') ? 'pairs' : 'a pair'}. The scramble allowed it and you took it.` });
    if (toggles.crossSuggest && optimalCross) {
      lines.push({ tone: 'info', text: `PB cross: ${colorOf(optimalCross.face)}, ${optimalCross.length} move${optimalCross.length === 1 ? '' : 's'}` });
    }
    if (toggles.crossHindsight && snap.crossMoveCount != null && optimalCross) {
      const h = lenses.crossHindsight(snap.crossMoveCount, optimalCross.length, colorOf(crossFace));
      if (h) lines.push({ tone: h.kind === 'optimal' ? 'good' : 'warn', text: h.text });
    }
    if (p.crossDone && !p.f2lDone && toggles.f2lHint) {
      const hint = lenses.f2lNextPairHint(state, crossFace);
      if (hint) lines.push({ tone: 'info', text: hint.text });
    }
    if (toggles.ollStage && p.f2lDone && !p.ollDone) {
      const stage = lenses.ollStage(state, crossFace);
      lines.push({ tone: 'info', text: stage.eoDone ? 'EO done. CO next.' : 'Orient the last-layer edges first (2-look OLL).' });
    }
    if (toggles.pllLens && p.ollDone && !p.solved) {
      const pll = lenses.pllLens(state, crossFace);
      if (pll?.name) lines.push({ tone: 'info', text: `PLL: ${pll.name} (${pll.family}). ${pll.cue}` });
    }
    if (toggles.rotationFlag && snap.rotations > 2) {
      lines.push({ key: 'rotations', tone: 'warn', text: `${snap.rotations} rotation${snap.rotations === 1 ? '' : 's'} this solve. Fewer often saves time.` });
    }
    if (toggles.efficiencyScore) {
      const score = lenses.efficiencyScore({ userCrossMoves: snap.crossMoveCount ?? 0, optimalCrossMoves: optimalCross?.length ?? null, rotations: snap.rotations, solved: p.solved, f2lPairs: p.pairsSolved, ollDone: p.ollDone });
      lines.push({ key: 'efficiency', tone: 'good', text: `Efficiency ${score}/100.` });
    }
  } else if (snap?.phase === 'done' && snap.record) {
    lines.push({ tone: 'good', text: `Solved in ${seconds(snap.record.solveMs)} · ${snap.record.moveCount} moves · ${snap.record.tps?.toFixed(2) ?? '—'} TPS.` });
    if (snap.record.xcross) lines.push({ tone: 'good', text: `${snap.record.xcross === 'xxcross' ? 'xx-cross' : 'x-cross'} built with the cross.` });
  }
  if (!lines.length) lines.push({ key: 'empty', tone: 'muted', text: 'Coach insights appear here as you solve.' });
  return lines.map(l => ({ key: l.key ?? `${l.tone}:${l.text}`, tone: l.tone, text: l.text }));
}

/**
 * Results-screen coach: v1 review hindsight plus per-stage insights from the
 * splits (the slowest stage vs its average, pseudo pairs, skips).
 * @param {{record:Object, optimalCross:Object|null, stages?:{key:string, ms:number|null, skipped:boolean, pseudo:boolean}[],
 *   plan?:{key:string,label:string}[], averages?:{byKey:Object}, faceColors:Object, skipCount?:number}} input
 * @returns {{key:string, tag:string, text:string, alg?:string, tone:'good'|'warn'|'info'}[]}
 */
export function resultsCoach({ record, optimalCross, stages = [], plan = [], averages = null, faceColors = {} }) {
  const out = [];
  if (!record) return out;
  const label = key => plan.find(s => s.key === key)?.label ?? key;
  if (record.crossMoveCount != null && optimalCross && record.crossMoveCount > optimalCross.length) {
    out.push({ key: 'cross', tag: 'cross', tone: 'warn', text: `Your cross took ${record.crossMoveCount} moves; an optimal ${faceColors[optimalCross.face] ?? optimalCross.face} cross here is ${optimalCross.length}.`, ...(optimalCross.solution ? { alg: optimalCross.solution } : {}) });
  }
  if (record.xcross && record.xcross !== 'cross') out.push({ key: 'xcross', tag: record.xcross, tone: 'good', text: `${record.xcross === 'xxcross' ? 'xx-cross' : 'x-cross'} built with the cross.` });
  if (averages) {
    const over = stages.filter(s => !s.skipped && s.ms != null && averages.byKey?.[s.key]?.source === 'history')
      .map(s => ({ s, over: s.ms - averages.byKey[s.key].avgMs }))
      .sort((a, b) => b.over - a.over)[0];
    if (over && over.over > 200) out.push({ key: `slow-${over.s.key}`, tag: label(over.s.key), tone: 'warn', text: `${title(label(over.s.key))} was ${(over.over / 1000).toFixed(2)} s over your average.` });
  }
  for (const s of stages.filter(s => s.pseudo)) out.push({ key: `pseudo-${s.key}`, tag: 'pseudo pair', tone: 'info', text: `${title(label(s.key))} used a pseudo pair (D offset).` });
  for (const s of stages.filter(s => s.skipped && s.key !== 'cross')) out.push({ key: `skip-${s.key}`, tag: `${label(s.key)} skip`, tone: 'good', text: `${skipName(label(s.key))} skip.` });
  if (record.rotations > 2) out.push({ key: 'rotations', tag: 'rotations', tone: 'warn', text: `${record.rotations} rotation${record.rotations === 1 ? '' : 's'}. Fewer often saves time.` });
  return out;
}
