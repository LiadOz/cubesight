/** Build equal case progress while a round is active and time-weighted arcs once it is complete. */
export function buildRoundSegments(round, total = round?.total ?? 0) {
  const answers = Array.isArray(round?.answers) ? round.answers : [];
  const count = Math.max(0, Math.trunc(Number(total) || 0));
  const completed = round?.status === 'complete';
  return Array.from({ length: count }, (_, index) => {
    const answer = answers[index];
    const milliseconds = Number(answer?.ms);
    const weight = completed ? (Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0) : 1;
    const current = (round?.status === 'active' && index === answers.length)
      || (round?.status === 'idle' && index === 0);
    return {
      key: `case-${index + 1}`,
      weight,
      state: answer ? answer.correct ? 'good' : 'wrong' : current ? 'current' : 'future',
      value: answer?.ms == null || !Number.isFinite(milliseconds) ? null : `${(milliseconds / 1000).toFixed(1)} s`,
    };
  });
}
