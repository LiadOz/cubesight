// Adapter from the xcross WASM module to the small solver interface the
// analysis uses. The module is the same one cross-solver-worker.js loads; here
// it is wrapped synchronously so node tests and a Web Worker can share it.
//
// Solver interface:
//   search({ scramble, face, mask = 0, maxDepth = 8, maxResults = 1, timeoutMs = 1000 })
//     -> { status, results: [{ moves: string[] }] }     (sync or a Promise)
// `scramble` is a move string: a position is "scramble + the moves played".
// status 0 means the search finished (results are optimal for the target).

const FACE_NUMBER = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

export function createWasmSolver(module) {
  return {
    search({ scramble, face, mask = 0, maxDepth = 8, maxResults = 1, timeoutMs = 1000 }) {
      const faceNumber = FACE_NUMBER[face];
      if (faceNumber === undefined) throw new Error('Unknown cross face.');
      const bytes = module.lengthBytesUTF8(scramble) + 1;
      const ptr = module._malloc(bytes);
      if (!ptr) throw new Error('Not enough memory for search.');
      try {
        module.stringToUTF8(scramble, ptr, bytes);
        return JSON.parse(module.UTF8ToString(module._xcross_wasm_analyze_json(ptr, faceNumber, mask, maxDepth, maxResults, timeoutMs)));
      } finally { module._free(ptr); }
    },
  };
}

// Memoise searches for the life of one analysis (positions repeat across
// frames and first-move probes).
export function cachedSolver(solver) {
  const cache = new Map();
  return {
    search(request) {
      const key = `${request.scramble}|${request.face}|${request.mask ?? 0}|${request.maxDepth ?? 8}|${request.maxResults ?? 1}`;
      if (cache.has(key)) return cache.get(key);
      const answer = solver.search(request);
      if (answer && typeof answer.then === 'function') return answer.then(value => { cache.set(key, value); return value; });
      cache.set(key, answer);
      return answer;
    },
  };
}
