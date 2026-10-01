// Real WCA random-state 3×3 scrambles.
//
// cubing.js implements the official scramble algorithm (random reachable state
// + an optimal-ish solver to invert it), so generated scrambles share the
// distribution of competition scrambles. This is deliberately not the
// random-move generator we used before: a random-move sequence of fixed length
// is not uniformly distributed and can leave easier-than-average states, which
// matters for fair training. See e.g. the WCA Regulations §4b3 and the random-
// state scrambler used by the WCA (Singmaster-style random-state via a solver).
//
// The solver is dynamically imported so it loads only when a scramble is
// actually requested, keeping the initial/offline bundle and the service-
// worker precache small.

let scramblePromise = null;

function loadScrambler() {
  if (!scramblePromise) scramblePromise = (async () => {
    // Vite emits cubing.js worker entries under hashed URLs. Prefer its
    // bundled-import workaround so offline installs avoid the unbundled
    // `search-worker-entry.js` path.
    const { setSearchDebug } = await import('cubing/search');
    setSearchDebug({ prioritizeEsbuildWorkaroundForWorkerInstantiation: true });
    return import('cubing/scramble');
  })();
  return scramblePromise;
}

// Returns a standard WCA scramble as a notation string, e.g. "R2 L2 D B' ...".
export async function generateWcaScramble() {
  const { randomScrambleForEvent } = await loadScrambler();
  const scramble = await randomScrambleForEvent('333');
  return scramble.toString();
}
