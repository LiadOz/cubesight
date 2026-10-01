// Review scheme A and loss-unit scoring: design/review/SPEC.md §§3–5.
// A compact cached summary is evidence, not permission to guess missing labels.
export const REVIEW_THRESHOLDS = Object.freeze({ efficiencyScale: 1.5, pauseMarginMs: 250, pauseMedianRatio: 2.5, flowMaximumMs: 250, flowMedianRatio: 1.2, rotationLoss: 2, rotationCap: 6, betterPairMinimumMoves: 2 });
const timeLabel = ms => Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)} s` : '—';
const moveCount = text => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
const hasTimes = r => Array.isArray(r?.moveTimes) && r.moveTimes.length === r.solveMoves?.length && r.moveTimes.every((time, i, times) => Number.isFinite(time) && time >= 0 && (!i || time >= times[i - 1]));
const measuredRotations = r => r?.gyro === true ? r.rotationMarks ?? [] : [];
const valid = (i, n) => Number.isInteger(i) && i >= 0 && i < n;
const indexMarks = r => r.analysis?.marks ?? {};
const pairLength = p => p.yours ? moveCount(p.yours) : Math.max(0, p.to - p.from + 1);
const provenChosen = p => p.chosenProven === true && Number.isFinite(p.chosenShortest) && p.chosenShortest >= 0;
const bestLength = p => Number.isFinite(p.better?.stm) ? p.better.stm : moveCount(p.better?.moves);

export function labelsFor(record, { inferred = false } = {}) {
  const count = record?.solveMoves?.length ?? 0, a = record?.analysis;
  const labels = Array.from({ length: count }, () => []);
  if (!a) return labels;
  const push = (i, text, kind, detail, loss = 0, extra = {}) => { if (valid(i, count)) labels[i].push({ text, kind, detail, loss, ...extra }); };
  const losses = a.cross?.losses ?? [];
  const allCrossLosses = a.cross?.proven === true && a.cross?.done === true && Number.isFinite(a.cross.total)
    && losses.reduce((sum, row) => sum + row.loss, 0) === a.cross.total;
  const chosenCrossLength = a.cross?.faces?.[a.face] ?? a.cross?.d0;
  const alternateCross = a.crossSource === 'inferred' && a.cross?.startProven === true && a.cross?.faceProven?.[a.face] === true && a.cross?.done === true
    ? Object.entries(a.cross.faces ?? {}).filter(([face, length]) => face !== a.face && a.cross.faceProven?.[face] === true && Number.isFinite(length) && chosenCrossLength - length >= 2)
      .sort((left, right) => left[1] - right[1])[0] : null;
  if (alternateCross) {
    const [face, length] = alternateCross, loss = Math.min(3, chosenCrossLength - length - 1);
    push(0, 'Better cross', 'warn', `${face} cross was ${length} moves; your inferred ${a.face} cross needs ${chosenCrossLength}.`, loss, { face });
  }
  for (const row of losses) if (row.loss > 0) push(row.i, row.loss >= 2 ? 'Detour' : 'Extra move', 'warn', `Cross distance ${row.d} → ${row.after}; suggested continuation: ${row.best || 'no suggestion yet'}.`, row.loss);

  if (allCrossLosses) for (let i = 0; i <= a.marks?.cross && i < count; i++) if (!labels[i].length) push(i, 'Optimal', 'good', 'This move stays on a shortest path to the cross.');
  for (const cancel of a.cancels ?? []) {
    if (!(cancel.waste > 0)) continue;
    // copy-ok: Cancel is the SPEC-NEXT move-review label, not a button action.
    for (let i = Math.max(0, cancel.from); i <= cancel.to && i < count; i++) push(i, 'Cancel', 'warn', `Moves ${cancel.from + 1}–${cancel.to + 1} waste ${cancel.waste} move${cancel.waste === 1 ? '' : 's'}.`);
  }
  if (hasTimes(record)) {
    for (const pause of a.pauses ?? []) {
      if (!pauseLoss(pause, a.medianGapMs)) continue;
      const slow = /(?:f2l-oll|oll-pll|oll-oll)/.test(pause.boundary ?? '');
      push(pause.i, slow ? 'Slow recog' : 'Pause', 'warn', `${timeLabel(pause.ms)} gap; allowance ${timeLabel(pause.allow)}.`, pauseLoss(pause, a.medianGapMs));
    }
    for (const end of new Set([a.marks?.cross, ...(a.marks?.pairs ?? []), a.marks?.eo, a.marks?.co])) {
      const i = end + 1;
      if (!Number.isInteger(end) || !valid(i, count) || end < 0) continue;
      const gap = record.moveTimes[i] - record.moveTimes[end];
      if (gap >= 0 && gap <= REVIEW_THRESHOLDS.flowMaximumMs && gap <= REVIEW_THRESHOLDS.flowMedianRatio * a.medianGapMs) push(i, 'Flow', 'good', 'You continued into the next stage without stopping.');
    }
  }
  for (const rotation of measuredRotations(record)) push(rotation.idx, 'Rotation', 'neutral', 'The cube reported a change in its held frame.');
  for (const skip of a.skips ?? []) push(skip.idx, skip.kind === 'f2l' ? 'Free pair' : 'Skip', 'good', skip.kind === 'f2l' ? 'A pair finished with the previous stage.' : `${String(skip.kind).toUpperCase()} was already complete at this boundary.`);
  if (a.xcross) push(a.marks?.cross, 'X-cross', 'good', 'The cross finished with a pair already solved.');
  for (const pair of a.pairs ?? []) {
    const saved = provenChosen(pair) ? pair.chosenShortest - bestLength(pair) : 0;
    if (pair.better && (saved >= REVIEW_THRESHOLDS.betterPairMinimumMoves || (saved >= 1 && pair.w - pair.better.w >= 6))) push(pair.from, 'Better pair', 'warn', `A verified continuation saves ${saved} move${saved === 1 ? '' : 's'}: ${pair.better.moves}.`, Math.min(3, Math.max(0, saved - 1)));
    if (pair.frame && pair.pseudoSaving >= 1) push(pair.to, 'Pseudo pair', 'good', 'The D offset saved moves for this pair.');
  }
  for (const [key, stage] of [['oll', a.lastLayer?.oll], ['pll', a.lastLayer?.pll]]) {
    if (!stage || !valid(stage.from, count)) continue;
    const label = key === 'oll' ? `OLL ${stage.number ?? stage.name}` : `PLL ${stage.name}`;
    push(stage.from, label, 'neutral', `${stage.caseId} recognized from the recorded cube state.`, 0, { stage: key, caseId: stage.caseId });
    if (stage.better && stage.better.loss > 0) push(stage.from, `Better ${key.toUpperCase()} alg`, 'warn', `A verified ${key.toUpperCase()} algorithm saves ${stage.better.loss} move${stage.better.loss === 1 ? '' : 's'}: ${stage.better.best}.`, stage.better.loss, { stage: key, caseId: stage.caseId });
    if (stage.extraAuf?.loss > 0) for (const index of stage.extraAuf.indices ?? []) push(index, 'Extra AUF', 'warn', `The verified continuation needs fewer U turns: ${stage.extraAuf.best || 'no U adjustment'}.`, 1, { stage: key, caseId: stage.caseId });
  }
  for (const fix of a.dFixes ?? []) push(typeof fix === 'number' ? fix : fix.i, 'D fix', 'neutral', 'This move resolves a D offset used by a pair.');
  for (const offset of a.offsets ?? []) {
    if (offset.stray) push(offset.at, 'Stray offset', 'warn', 'The D layer was turned, but no pair used that frame. One spare move.', 1);
    if (offset.used && valid(offset.resolvedAt, count)) push(offset.resolvedAt, 'D fix', 'neutral', 'This move resolves a D offset used by a pair.');
  }
  // Stage labels are attached to the last move of that stage so the review can
  // deep-link them to the exact position immediately before the move.
  const verifiedCross = a.cross?.proven === true && a.cross?.done === true && Number.isFinite(a.cross?.d0) && Number.isFinite(a.cross?.total) && valid(a.marks?.cross, count);
  const pairRows = (a.pairs ?? []).filter(pair => !pair.unsupported);
  const verifiedPairs = pairRows.length > 0 && pairRows.every(provenChosen) && (a.marks?.pairs ?? []).some(index => valid(index, count));
  const scoreByKey = new Map(stageScores(record).map(score => [score.key, score]));
  const addStageQuality = (key, stage, end, verified, actual, reference) => {
    if (!verified || !valid(end, count) || !Number.isFinite(actual) || !Number.isFinite(reference) || reference <= 0) return;
    const score = scoreByKey.get(key);
    if (!score) return;
    if (actual > reference && actual <= reference + 1) push(end, 'Efficient', 'good', `${stage} finished within one move of its verified reference.`, 0, { stage: key });
    if (score.loss === 0 && hasTimes(record)) push(end, 'Clean', 'good', `${stage} had no counted move waste, pause, inverse turn pair, or measured rotation.`, 0, { stage: key });
    else if (score.loss > 0 && score.loss <= 1) push(end, 'OK', 'neutral', `${stage} lost ${score.loss.toFixed(1)} efficiency point${score.loss === 1 ? '' : 's'}.`, 0, { stage: key });
  };
  if (verifiedCross) addStageQuality('cross', 'Cross', a.marks.cross, true, a.marks.cross + 1, a.cross.d0);
  if (verifiedPairs) {
    const completedPairs = (a.marks.pairs ?? []).filter(index => valid(index, count));
    const end = Math.max(...completedPairs);
    const actual = end + 1 - (valid(a.marks.cross, count) ? a.marks.cross + 1 : 0);
    const reference = pairRows.reduce((sum, pair) => sum + pair.chosenShortest, 0);
    addStageQuality('f2l', 'F2L', end, true, actual, reference);
  }
  const llReference = a.lastLayerReference;
  const llStart = Math.max(-1, ...(a.marks.pairs ?? []).filter(index => valid(index, count)), valid(a.marks.cross, count) ? a.marks.cross : -1) + 1;
  const llEnd = valid(a.marks.solved, count) ? a.marks.solved : count - 1;
  if (Number.isFinite(llReference) && llStart <= llEnd) {
    const reference = llReference;
    const actual = llEnd - llStart + 1;
    const stage = Number.isInteger(a.marks.eo) && Number.isInteger(a.marks.co) ? 'pll' : 'last layer';
    addStageQuality('ll', 'Last layer', llEnd, true, actual, reference);
    // Attach the canonical drill destination metadata when this is a complete
    // LL score, while preserving the visible "Efficient/Clean/OK" copy.
    for (const item of labels[llEnd]) if (['Efficient', 'Clean', 'OK'].includes(item.text)) item.stage = stage;
  }
  if (Array.isArray(inferred)) for (const entry of inferred) push(entry.i, entry.label, 'inferred', `Looks like ${entry.label.toLowerCase()}; this label is inferred.`);
  for (let i = 0; i < count; i++) if (!labels[i].length) push(i, 'Fine', 'neutral', 'No verified move evaluation is available at this position.');
  return labels;
}

function pauseLoss(pause, median) {
  if (!(median > 0) || !Number.isFinite(pause.ms) || !Number.isFinite(pause.allow)) return 0;
  if (pause.ms < Math.max(pause.allow + REVIEW_THRESHOLDS.pauseMarginMs, REVIEW_THRESHOLDS.pauseMedianRatio * median)) return 0;
  return Math.min(6, Math.max(0, pause.ms - pause.allow) / median);
}
function boundaries(record) {
  const n = record?.solveMoves?.length ?? 0, marks = indexMarks(record);
  const crossEnd = valid(marks.cross, n) ? marks.cross + 1 : 0;
  const f2lEnd = (marks.pairs ?? []).filter(i => valid(i, n)).reduce((end, i) => Math.max(end, i + 1), crossEnd);
  return { n, crossEnd, f2lEnd };
}
function lossLedger(record) {
  const a = record.analysis ?? {}, { n, crossEnd, f2lEnd } = boundaries(record);
  const ledger = Array(n).fill(0), choice = Array(n).fill(0);
  for (const row of a.cross?.losses ?? []) if (valid(row.i, n)) ledger[row.i] = Math.max(ledger[row.i], Number.isFinite(row.loss) ? row.loss : 0);
  // Summaries can truncate move-level losses. Keep the stage total truthful.
  const known = ledger.slice(0, crossEnd).reduce((sum, x) => sum + x, 0);
  if (crossEnd && Number.isFinite(a.cross?.total) && a.cross.total > known) ledger[crossEnd - 1] += a.cross.total - known;
  for (const pair of a.pairs ?? []) if (provenChosen(pair) && valid(pair.to, n)) ledger[pair.to] += Math.max(0, pairLength(pair) - pair.chosenShortest);
  for (const cancel of a.cancels ?? []) {
    const from = Math.max(0, cancel.from), to = Math.min(n - 1, cancel.to);
    if (!valid(from, n) || !valid(to, n) || !(cancel.waste > 0)) continue;
    // A cancelling run's distance losses already account for its waste. Add
    // only the uncovered portion, rather than charging the same run twice.
    const coveredPair = (a.pairs ?? []).find(pair => provenChosen(pair) && from >= pair.from && to <= pair.to);
    if (coveredPair) continue; // Exact segment waste includes its cancelling runs.
    const existing = ledger.slice(from, to + 1).reduce((sum, value) => sum + value, 0);
    ledger[to] += Math.max(0, cancel.waste - existing);
  }
  for (const offset of a.offsets ?? []) if (offset.stray && valid(offset.at, n)) ledger[offset.at] = Math.max(ledger[offset.at], 1);
  if (hasTimes(record)) for (const pause of a.pauses ?? []) if (valid(pause.i, n)) choice[pause.i] += pauseLoss(pause, a.medianGapMs);
  let rotationLoss = 0;
  for (const rotation of measuredRotations(record)) if (valid(rotation.idx, n)) {
    const add = Math.min(REVIEW_THRESHOLDS.rotationLoss, REVIEW_THRESHOLDS.rotationCap - rotationLoss);
    choice[rotation.idx] += add; rotationLoss += add;
  }
  for (const pair of a.pairs ?? []) if (pair.better && provenChosen(pair) && valid(pair.from, n)) {
    const saving = pair.chosenShortest - bestLength(pair);
    if (saving >= 2) choice[pair.from] += Math.min(3, Math.max(0, saving - 1));
  }
  for (const stage of [a.lastLayer?.oll, a.lastLayer?.pll]) {
    if (stage?.better?.loss > 0 && valid(stage.from, n)) choice[stage.from] += stage.better.loss;
    if (stage?.extraAuf?.loss > 0) for (const index of stage.extraAuf.indices ?? []) if (valid(index, n)) choice[index] += 1;
  }
  const chosenCrossLength = a.cross?.faces?.[a.face] ?? a.cross?.d0;
  if (a.crossSource === 'inferred' && a.cross?.startProven === true && a.cross?.faceProven?.[a.face] === true && a.cross?.done === true && valid(0, n)) {
    const bestAlternative = Object.entries(a.cross.faces ?? {}).filter(([face, length]) => face !== a.face && a.cross.faceProven?.[face] === true && Number.isFinite(length))
      .reduce((best, [face, length]) => !best || length < best.length ? { face, length } : best, null);
    if (bestAlternative && chosenCrossLength - bestAlternative.length >= 2) choice[0] += Math.min(3, chosenCrossLength - bestAlternative.length - 1);
  }
  return { values: ledger.map((loss, i) => loss + choice[i]), crossEnd, f2lEnd, n };
}
const efficiency = (loss, ref) => ref > 0 ? Math.round(100 * Math.exp(-Math.max(0, loss) / (REVIEW_THRESHOLDS.efficiencyScale * ref))) : 100;
export function stageScores(record) {
  const a = record?.analysis;
  if (!a) return [];
  const { values, crossEnd, f2lEnd, n } = lossLedger(record);
  const pairs = (a.pairs ?? []).filter(pair => !pair.unsupported);
  const exactPairs = pairs.length > 0 && pairs.every(provenChosen);
  const llReference = a.lastLayerReference;
  const base = [
    { key: 'cross', label: 'Cross', from: 0, to: crossEnd, ref: crossEnd ? Math.max(4, a.cross?.d0 ?? 4) : 0, flow: a.cross?.proven !== true },
    { key: 'f2l', label: 'F2L', from: crossEnd, to: f2lEnd, ref: f2lEnd > crossEnd ? (exactPairs ? pairs.reduce((sum, pair) => sum + pair.chosenShortest, 0) : 28) : 0, flow: !exactPairs },
    { key: 'll', label: 'Last layer', from: f2lEnd, to: n, ref: n > f2lEnd ? (Number.isFinite(llReference) ? llReference : 24) : 0, flow: !Number.isFinite(llReference) },
  ].map(row => {
    const loss = values.slice(row.from, row.to).reduce((sum, x) => sum + x, 0);
    const score = efficiency(loss, row.ref);
    return { ...row, loss, accuracy: score, text: `${score}%`, skipped: row.from === row.to };
  });
  const loss = base.reduce((sum, row) => sum + row.loss, 0), ref = base.reduce((sum, row) => sum + row.ref, 0), score = efficiency(loss, ref);
  return [...base, { key: 'overall', label: 'Overall', from: 0, to: n, ref, loss, accuracy: score, text: `${score}%`, flow: base.some(row => row.flow && !row.skipped) }];
}

export function keyMoments(record) {
  const labels = labelsFor(record), moments = labels.flatMap((items, i) => items.filter(item => item.kind === 'warn').map(item => ({ i, label: item.text, detail: item.detail })));
  const marks = indexMarks(record);
  for (const [key, idx] of [['Cross', marks.cross], ...(marks.pairs ?? []).map((i, n) => [`Pair ${n + 1}`, i]), ['Last layer', marks.solved]]) if (valid(idx, labels.length)) moments.push({ i: idx, label: `${key} complete`, detail: `${key} finished after move ${idx + 1}.` });
  return moments.sort((a, b) => a.i - b.i).filter((item, i, all) => !i || item.i !== all[i - 1].i || item.label !== all[i - 1].label);
}
export function stageOf(record, moveIndex) {
  const marks = indexMarks(record);
  if (Number.isInteger(marks.cross) && moveIndex <= marks.cross) return 'cross';
  const pairIndex = (marks.pairs ?? []).findIndex(index => Number.isInteger(index) && moveIndex <= index);
  if (pairIndex >= 0) return `pair ${pairIndex + 1}`;
  if (!Number.isInteger(marks.eo) || !Number.isInteger(marks.co)) return 'oll';
  return moveIndex <= Math.max(marks.eo, marks.co) ? 'oll' : 'pll';
}
// The timestamps are cumulative, not individual gap durations. The graph's
// vertical axis is verified loss units, rather than the number of badges.
export function graphPath(record, _labels, width = 640, height = 180, view = 'auto') {
  const moves = record?.solveMoves ?? [];
  if (!moves.length) return '';
  const timed = view !== 'moves' && hasTimes(record), last = record.moveTimes?.at(-1), maxX = timed ? Math.max(1, last) : moves.length;
  const { values } = lossLedger(record);
  let total = 0;
  const points = [[8, height / 2]];
  for (let i = 0; i < moves.length; i++) {
    total += values[i];
    points.push([8 + ((timed ? record.moveTimes[i] : i + 1) / maxX) * (width - 16), Math.min(height - 12, height / 2 + total * 9)]);
  }
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}
