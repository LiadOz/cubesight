import { bestCompletions } from '../analysis/pair-completion.js';

self.addEventListener('message', ({ data }) => {
  const { id, scramble, startShifts = [0], options = {} } = data || {};
  try {
    const results = [];
    for (const startShift of startShifts) {
      try { results.push({ startShift, ...bestCompletions(scramble, { ...options, startShift }) }); }
      catch { /* This position does not have a cross in that start frame. */ }
    }
    self.postMessage({ id, results });
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'Could not search this position.' });
  }
});
