// "Best pair completion from here": IDA* over all 18 face turns on a compact
// 12-piece tracked model (4 cross edges + 4 slot edges + 4 slot corners), with
// max-of pruning tables. Every solution is verified by cubing.js KPuzzle in
// bench-pairs.mjs. Piece codes: edges slot*2+ori (0..23), corners slot*3+ori.
import { stateOf, compose, IDENTITY, tokens } from './cube.mjs';

export const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const SUF = ['', "'", '2'];
export const MOVES = FACES.flatMap(f => SUF.map(s => f + s));
const FACE_RANK = { U: 1, D: 0, R: 1, L: 0, F: 1, B: 0 }, FACE_AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
const moveFace = MOVES.map(m => m[0]);

// cubing layout: corners UFR UBR UBL UFL DFR DFL DBL DBR ; edges UF UR UB UL DF DR DB DL FR FL BR BL
export const CROSS_EDGES = [4, 5, 6, 7];
export const SLOTS = [ // name, corner index, edge index
  { name: 'FR', c: 4, e: 8 }, { name: 'BR', c: 7, e: 10 }, { name: 'BL', c: 6, e: 11 }, { name: 'FL', c: 5, e: 9 },
];
// piece tracking: t = 0..3 cross edges, 4..7 slot edges (slot order), 8..11 slot corners
const PIECE_KIND = t => (t < 8 ? 'e' : 'c');
const homeSlot = t => (t < 4 ? CROSS_EDGES[t] : t < 8 ? SLOTS[t - 4].e : SLOTS[t - 8].c);

// per-move transition tables over codes
const edgeNext = [], cornerNext = [];
for (const m of MOVES) {
  const s = stateOf(m);
  const en = new Uint8Array(24), cn = new Uint8Array(24);
  for (let i = 0; i < 12; i++) { const from = s[8 + i] - 8; for (let o = 0; o < 2; o++) en[from * 2 + o] = i * 2 + ((o + s[34 + i]) & 1); }
  for (let i = 0; i < 8; i++) { const from = s[i]; for (let o = 0; o < 3; o++) cn[from * 3 + o] = i * 3 + ((o + s[26 + i]) % 3); }
  edgeNext.push(en); cornerNext.push(cn);
}
const next = (t, code, mi) => (PIECE_KIND(t) === 'e' ? edgeNext[mi][code] : cornerNext[mi][code]);
const homeCode = t => homeSlot(t) * (PIECE_KIND(t) === 'e' ? 2 : 3);

// ---- tracked state from a scramble (cubing model) -------------------------
export function trackedFrom(scramble) {
  const s = stateOf(scramble || '');
  const codes = new Uint8Array(12);
  for (let t = 0; t < 12; t++) {
    const h = homeSlot(t);
    if (PIECE_KIND(t) === 'e') { const slot = s.subarray(8, 20).indexOf(8 + h); codes[t] = slot * 2 + s[34 + slot]; }
    else { const slot = s.subarray(0, 8).indexOf(h); codes[t] = slot * 3 + s[26 + slot]; }
  }
  return codes;
}
export const isHome = (codes, t) => codes[t] === homeCode(t);
export const crossSolved = codes => [0, 1, 2, 3].every(t => isHome(codes, t));
export const solvedSlots = codes => SLOTS.map((_, i) => i).filter(i => isHome(codes, 4 + i) && isHome(codes, 8 + i));

// ---- pruning tables -------------------------------------------------------
function bfs(pieces, size, encode) {
  const dist = new Uint8Array(size).fill(255), n = pieces.length;
  let frontier = Uint8Array.from(pieces.map(homeCode)); dist[encode(frontier)] = 0;
  const nxt = pieces.map(t => (PIECE_KIND(t) === 'e' ? edgeNext : cornerNext));
  const tmp = new Uint8Array(n);
  for (let d = 1; frontier.length; d++) {
    const out = [];
    for (let off = 0; off < frontier.length; off += n) for (let mi = 0; mi < 18; mi++) {
      for (let i = 0; i < n; i++) tmp[i] = nxt[i][mi][frontier[off + i]];
      const k = encode(tmp);
      if (dist[k] === 255) { dist[k] = d; for (let i = 0; i < n; i++) out.push(tmp[i]); }
    }
    frontier = Uint8Array.from(out);
  }
  return dist;
}
const enc = arr => { let a = 0; for (let i = 0; i < arr.length; i++) a = a * 24 + arr[i]; return a; };
let crossTable, pairTables = {};
export function buildTables() {
  if (crossTable) return;
  crossTable = bfs([0, 1, 2, 3], 24 ** 4, enc);
  for (let i = 0; i < 4; i++) pairTables[i] = bfs([4 + i, 8 + i], 24 ** 2, enc);
}
// cross edges + one slot edge (24^5 = 8M bytes per slot, built lazily)
const crossEdgeTables = {};
export function crossEdgeTable(i) { return crossEdgeTables[i] ||= bfs([0, 1, 2, 3, 4 + i], 24 ** 5, enc); }
export const tableStats = () => ({ crossTable: crossTable?.length, extra: Object.keys(crossEdgeTables).length });

// ---- IDA* -----------------------------------------------------------------
// targets: array of slot indices that must end solved (preserved + new)
export function findCompletions(codes0, { newSlots, preserve = solvedSlots(codes0), maxDepth = 10, maxSolutions = 50, slack = 1, timeBudgetMs = 4000, useCrossEdge = !process.env.NOCE }) {
  buildTables();
  const goalSlots = [...new Set([...preserve, ...newSlots])];
  const pieces = [0, 1, 2, 3, ...goalSlots.flatMap(i => [4 + i, 8 + i])];
  const ceTables = useCrossEdge ? goalSlots.map(i => [i, crossEdgeTable(i)]) : [];
  const n = pieces.length;
  const homes = pieces.map(homeCode);
  const start = Uint8Array.from(pieces, t => codes0[t]);
  const t0 = performance.now(); let nodes = 0, timedOut = false;
  const solutions = []; const path = [];
  const stack = Array.from({ length: maxDepth + 2 }, () => new Uint8Array(n));
  function h(st) {
    let best = crossTable[enc([st[0], st[1], st[2], st[3]])];
    let k = 4;
    for (const i of goalSlots) {
      const d = pairTables[i][st[k] * 24 + st[k + 1]]; if (d > best) best = d; k += 2;
    }
    for (const [i, tab] of ceTables) {
      const idx = goalSlots.indexOf(i); const d = tab[enc([st[0], st[1], st[2], st[3], st[4 + 2 * idx]])]; if (d > best) best = d;
    }
    return best;
  }
  function dfs(depth, limit, prevMi) {
    if (performance.now() - t0 > timeBudgetMs && (nodes & 0xfff) === 0) { timedOut = true; }
    if (timedOut) return;
    const st = stack[depth]; nodes++;
    const hv = h(st);
    if (hv === 0) { if (depth === limit) solutions.push(path.slice(0, depth).map(i => MOVES[i]).join(' ')); return; }
    if (depth + hv > limit) return;
    const pf = prevMi < 0 ? null : moveFace[prevMi];
    for (let mi = 0; mi < 18; mi++) {
      const f = moveFace[mi];
      if (pf && (f === pf || (FACE_AXIS[f] === FACE_AXIS[pf] && FACE_RANK[f] < FACE_RANK[pf]))) continue;
      const nx = stack[depth + 1];
      for (let i = 0; i < n; i++) nx[i] = next(pieces[i], st[i], mi);
      path[depth] = mi; dfs(depth + 1, limit, mi);
      if (solutions.length >= maxSolutions || timedOut) return;
    }
  }
  let found = -1;
  for (let limit = 0; limit <= maxDepth && !timedOut; limit++) {
    stack[0].set(start); dfs(0, limit, -1);
    if (solutions.length && found < 0) found = limit;
    if (found >= 0 && limit >= found + slack) break;
    if (solutions.length >= maxSolutions) break;
  }
  return { solutions, shortest: found, nodes, ms: Math.round(performance.now() - t0), timedOut };
}

// Planner weight used by src/f2l-planner.js weightedMoveCount (F/B = 5, rotations 2)
export const plannerWeight = moves => moves.reduce((t, m) => t + (m[0] === 'F' || m[0] === 'B' ? 5 : 1), 0);
// Finger-friendliness score: STM + per-move penalties (D 1, L 1.5, B 2, F 1) + regrips
export function ergoScore(moves) {
  const pen = { F: 1, D: 1, L: 1.5, B: 2 }; let s = moves.length, run = false;
  for (const m of moves) { s += pen[m[0]] || 0; const off = 'FBDL'.includes(m[0]); if (off && !run) s += 1; run = off; }
  return s;
}

// Best completion for every unsolved slot (single pairs) and every two-slot combo (multislot).
export function bestCompletions(scramble, opts = {}) {
  const codes = trackedFrom(scramble);
  if (!crossSolved(codes)) throw new Error('cross must be solved (plain frame) for this prototype');
  const solved = solvedSlots(codes);
  const open = SLOTS.map((_, i) => i).filter(i => !solved.includes(i));
  const out = [];
  const t0 = performance.now();
  for (const i of open) {
    const r = findCompletions(codes, { newSlots: [i], preserve: solved, ...opts });
    const ranked = r.solutions.map(s => ({ moves: s, tokens: tokens(s), w: plannerWeight(tokens(s)), e: ergoScore(tokens(s)) })).sort((a, b) => a.e - b.e || a.w - b.w);
    out.push({ slots: [SLOTS[i].name], shortest: r.shortest, ms: r.ms, nodes: r.nodes, timedOut: r.timedOut, options: ranked.slice(0, 5) });
  }
  return { solved: solved.map(i => SLOTS[i].name), candidates: out, totalMs: performance.now() - t0 };
}
