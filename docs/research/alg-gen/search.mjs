// Meet-in-the-middle search for last-layer algorithms restricted to a move set.
//
// Let E be the effect of a reference algorithm for a case. We look for X such
// that scramble(case) * X reaches the goal, where scramble = inverse(E) with a
// pre-AUF U^i applied first. X = A * B; the A half is tabulated by an F2L key,
// the B half is enumerated as W = B^-1 and probed against the table, and every
// candidate is verified exactly on the full cubie state.
import { N, IDENTITY, compose, invert, equal, stateOf, makeMoveSet, allowed, invertAlg, tokens } from './cube.mjs';

const F2L_SLOTS = [4, 5, 6, 7, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const ORI_MOD = i => (i < 8 ? 3 : i < 20 ? 2 : 1);
const oriOf = (s, i) => (i < 20 ? s[26 + i] : 0);

function keyA(a) { // where is the piece that sits in each F2L slot of a^-1
  let h1 = 0x811c9dc5 | 0, h2 = 0x9e3779b9 | 0;
  for (const i of F2L_SLOTS) {
    let j = 0; while (a[j] !== i) j++;
    const v = j * 4 + oriOf(a, j);
    h1 = Math.imul(h1 ^ v, 0x01000193); h2 = Math.imul(h2 + v + 1, 0x85ebca6b) ^ (h2 >>> 13);
  }
  return (h1 >>> 0) * 0x200000 + (h2 >>> 11);
}
function keyB(b) {
  let h1 = 0x811c9dc5 | 0, h2 = 0x9e3779b9 | 0;
  for (const i of F2L_SLOTS) {
    const j = b[i]; const m = ORI_MOD(i);
    const v = j * 4 + ((m - oriOf(b, i)) % m);
    h1 = Math.imul(h1 ^ v, 0x01000193); h2 = Math.imul(h2 + v + 1, 0x85ebca6b) ^ (h2 >>> 13);
  }
  return (h1 >>> 0) * 0x200000 + (h2 >>> 11);
}

const U1 = stateOf('U');
const Upow = [IDENTITY, U1, stateOf('U2'), stateOf("U'")];

// goals: final state (after scramble*X) must satisfy one of these
export const goals = {
  pll(final) { // solved up to a final AUF
    for (let j = 0; j < 4; j++) if (equal(compose(final, Upow[(4 - j) % 4]), IDENTITY)) return (4 - j) % 4; // the AUF to apply is U^-j
    return -1;
  },
  oll(final) { // F2L solved, every LL sticker oriented
    for (const i of [4,5,6,7,12,13,14,15,16,17,18,19,20,21,22,23,24,25]) if (final[i] !== i) return -1;
    for (let i = 0; i < 8; i++) if (final[26 + i]) return -1;
    for (let i = 8; i < 20; i++) if (final[26 + i]) return -1;
    return 0;
  },
};

export function search({ effect, goal, faces, dA, dW, maxResults = 4000, timeBudgetMs = 120000 }) {
  const t0 = Date.now();
  const moves = makeMoveSet(faces);
  const scr = invert(effect);
  const scrambles = [0, 1, 2, 3].map(i => compose(scr, Upow[i])); // scramble, then a pre-AUF U^i on the case
  const L = dA + 1;
  // ---- table of A halves
  const cap = 4_000_000;
  const seqs = new Uint8Array(cap * L), next = new Int32Array(cap);
  const table = new Map();
  let count = 0;
  const bufA = Array.from({ length: dA + 1 }, () => new Uint8Array(N));
  bufA[0].set(IDENTITY);
  const path = new Array(dA + 1);
  (function dfs(depth, prev) {
    if (count >= cap) return;
    {
      if (depth > 0) {
        const k = keyA(bufA[depth]);
        const id = count++;
        seqs[id * L] = depth; for (let i = 0; i < depth; i++) seqs[id * L + 1 + i] = path[i];
        next[id] = table.has(k) ? table.get(k) : -1; table.set(k, id);
      }
    }
    if (depth === dA) return;
    for (let mi = 0; mi < moves.length; mi++) {
      const m = moves[mi];
      if (!allowed(prev, m)) continue;
      if (depth === 0 && m.face === 'U') continue; // leading U is the pre-AUF
      path[depth] = mi; compose(bufA[depth], m.state, bufA[depth + 1]); dfs(depth + 1, m);
    }
  })(0, null);
  const tTable = Date.now() - t0;
  // ---- W halves
  const found = new Map();
  const bufW = Array.from({ length: dW + 1 }, () => new Uint8Array(N));
  bufW[0].set(IDENTITY);
  const wpath = new Array(dW);
  const tmp = new Uint8Array(N), full = new Uint8Array(N), fin = new Uint8Array(N);
  let probes = 0, candidates = 0, truncated = false;
  function probe(depth) {
    // W = w1..wk, B = inverse(W); first move of W is the last of X: not U
    const b = bufW[depth]; // state of W; B state = invert(W)
    const k = keyB(invert(b)); probes++;
    let id = table.get(k); if (id === undefined) return;
    const Bstate = invert(b);
    for (; id !== -1; id = next[id]) {
      const da = seqs[id * L]; const A = [];
      for (let i = 0; i < da; i++) A.push(moves[seqs[id * L + 1 + i]]);
      let ok = true;
      if (da && depth) { // seam: last of A, first of B (= inverse of last of W)
        const a = A[da - 1], w = moves[wpath[depth - 1]];
        if (a.face === w.face) ok = false; // would merge into one move
        else if (a.axis === w.axis && !(a.rank < w.rank)) ok = true; // fine: reorder duplicates are deduped later
      }
      if (da && depth === 0 && A[da - 1].face === 'U') ok = false; // trailing U is the post-AUF
      if (!ok) continue;
      candidates++;
      // exact state of X = A * B
      let st = IDENTITY; for (const m of A) st = compose(st, m.state);
      full.set(compose(st, Bstate, tmp));
      for (let i = 0; i < 4; i++) {
        const j = goal(compose(scrambles[i], full, fin));
        if (j >= 0) {
          const xs = [...A.map(m => m.name), ...tokens(invertAlg(wpath.slice(0, depth).map(x => moves[x].name).join(' ')))];
          const alg = xs.join(' ');
          if (!found.has(alg)) found.set(alg, { alg, preAUF: i, postAUF: j });
          break;
        }
      }
    }
  }
  (function dfs(depth, prev) {
    if (found.size >= maxResults || Date.now() - t0 > timeBudgetMs) { truncated = true; return; }
    if (depth > 0 && moves[wpath[0]].face !== 'U') probe(depth);
    if (depth === 0) probe(0);
    if (depth === dW) return;
    for (let mi = 0; mi < moves.length; mi++) {
      const m = moves[mi];
      if (!allowed(prev, m)) continue;
      wpath[depth] = mi; compose(bufW[depth], m.state, bufW[depth + 1]); dfs(depth + 1, m);
    }
  })(0, null);
  return { results: [...found.values()], tableSize: count, probes, candidates, truncated, ms: Date.now() - t0, tTable };
}
