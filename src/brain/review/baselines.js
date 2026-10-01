// Your own averages for the results review, from the OTHER solves of the same session focus
// (speed, flow and learning are never mixed: src/store/focus.js). Pure. A comparison is only
// offered once there are enough solves behind it, so "you average 1.2" is never a guess.

export const MIN_SOLVES = 3;

const mean = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The typical gap between moves of one solve (median of the gaps), ms; null without times. */
export function medianGap(moveTimes) {
  if (!Array.isArray(moveTimes) || moveTimes.length < 4) return null;
  const gaps = moveTimes.slice(1).map((t, i) => t - moveTimes[i]).filter(g => Number.isFinite(g) && g >= 0);
  return median(gaps);
}

/**
 * @param {Object[]} others  solved records of the same focus, this one excluded
 * @returns {{solves:number, rotations:number|null, medianGapMs:number|null, crossMoves:number|null, crossExtra:number|null,
 *   cancelWaste:number|null, pauses:number|null, reliable:boolean}}
 */
export function reviewBaselines(others = []) {
  const solved = others.filter(r => r && r.solved !== false);
  const analysed = solved.filter(r => r.analysis);
  const rotations = solved.filter(r => Number.isFinite(r.rotations)).map(r => r.rotations);
  const gaps = solved.map(r => medianGap(r.moveTimes)).filter(Number.isFinite);
  const onlyWith = pick => mean(analysed.map(pick).filter(Number.isFinite));
  const caseTimes = new Map();
  for (const record of analysed) for (const stage of ['oll', 'pll']) {
    const row = record.analysis?.lastLayer?.[stage];
    if (!row?.caseId || !Number.isFinite(row.recognitionMs)) continue;
    const values = caseTimes.get(`${stage}/${row.caseId}`) ?? [];
    values.push(row.recognitionMs);
    caseTimes.set(`${stage}/${row.caseId}`, values);
  }
  const caseRecognitionMs = Object.fromEntries([...caseTimes].filter(([, values]) => values.length >= MIN_SOLVES)
    .map(([key, values]) => [key, mean(values)]));
  return {
    solves: solved.length,
    reliable: solved.length >= MIN_SOLVES,
    rotations: rotations.length >= MIN_SOLVES ? mean(rotations) : null,
    medianGapMs: gaps.length >= MIN_SOLVES ? median(gaps) : null,
    crossMoves: analysed.length >= MIN_SOLVES ? onlyWith(r => r.analysis.cross?.moves) : null,
    crossExtra: analysed.length >= MIN_SOLVES ? onlyWith(r => r.analysis.cross?.extra) : null,
    cancelWaste: analysed.length >= MIN_SOLVES ? mean(analysed.map(r => r.analysis.cancels.reduce((sum, c) => sum + c.waste, 0))) : null,
    pauses: analysed.length >= MIN_SOLVES ? mean(analysed.map(r => r.analysis.pauses.length)) : null,
    caseRecognitionMs,
  };
}
