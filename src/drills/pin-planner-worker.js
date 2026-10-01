import { bestCompletions } from '../analysis/pair-completion.js';

self.addEventListener('message', event => {
  const { id, scramble, options } = event.data || {};
  try { self.postMessage({ id, result: bestCompletions(scramble, options) }); }
  catch (error) { self.postMessage({ id, error: error?.message || 'Could not verify this position.' }); }
});
