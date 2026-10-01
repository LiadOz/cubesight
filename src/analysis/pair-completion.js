// "Best pair completion from here": IDA* over all 18 face turns on a compact
// 12-piece tracked model (4 cross edges + 4 slot edges + 4 slot corners), with
// max-of pruning tables. Every solution is verified by cubing.js KPuzzle in
// bench-pairs.mjs. Piece codes: edges slot*2+ori (0..23), corners slot*3+ori.
import { stateOf, tokens } from './cube-model.js';

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
// crossFrame.k is the turn that removes the offset; the matching pseudo goal
// is therefore the inverse D-layer turn from solved.
const GOAL_SHIFTS = ['', "D'", 'D2', 'D'];
const GOAL_CODES = GOAL_SHIFTS.map(alg => alg ? trackedFrom(alg) : Uint8Array.from({ length: 12 }, (_, t) => homeCode(t)));
export const isHome = (codes, t, goalShift = 0) => codes[t] === GOAL_CODES[goalShift][t];
export const crossSolved = (codes, goalShift = 0) => [0, 1, 2, 3].every(t => isHome(codes, t, goalShift));
export const solvedSlots = (codes, goalShift = 0) => SLOTS.map((_, i) => i).filter(i => isHome(codes, 4 + i, goalShift) && isHome(codes, 8 + i, goalShift));

// ---- pruning tables -------------------------------------------------------
function bfs(pieces, size, encode) {
  const dist = new Uint8Array(size).fill(255), n = pieces.length;
  const seeds = [];
  for (let shift = 0; shift < 4; shift++) {
    const seed = Uint8Array.from(pieces.map(t => GOAL_CODES[shift][t]));
    const key = encode(seed);
    if (dist[key] === 255) { dist[key] = 0; seeds.push(...seed); }
  }
  let frontier = Uint8Array.from(seeds);
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
const tablesByShift = new Map();
const PAIR_CROSS_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0]];
const pairCrossTables = {};
export const PAIR_CROSS_TABLE_VERSION = 1;
export const PAIR_CROSS_TABLE_BYTES = 4 * 24 ** 4;
export function buildTables() {
  if (tablesByShift.has(0)) return tablesByShift.get(0);
  const tables = {
    cross: bfs([0, 1, 2, 3], 24 ** 4, enc),
    pairs: Object.fromEntries(Array.from({ length: 4 }, (_, i) => [i, bfs([4 + i, 8 + i], 24 ** 2, enc)])),
  };
  tablesByShift.set(0, tables);
  return tables;
}
// cross edges + one slot edge (24^5 = 8M bytes per slot, built lazily)
const crossEdgeTables = {};
export function crossEdgeTable(i) { return crossEdgeTables[i] ||= bfs([0, 1, 2, 3, 4 + i], 24 ** 5, enc); }
// A compact optional joint table for one pair and its two adjacent cross
// edges. Four 24^4 byte tables add ~1.27 MiB and strengthen the default 332 KB
// PDB without allocating the 32 MB full cross+edge set.
export function pairCrossTable(i) {
  if (!pairCrossTables[i]) {
    const [a, b] = PAIR_CROSS_EDGES[i];
    pairCrossTables[i] = bfs([a, b, 4 + i, 8 + i], 24 ** 4, enc);
  }
  return pairCrossTables[i];
}
export function buildPairCrossTables() { return PAIR_CROSS_EDGES.map((_, i) => pairCrossTable(i)); }
export function installPairCrossTables(tables) {
  if (!Array.isArray(tables) || tables.length !== PAIR_CROSS_EDGES.length) return false;
  const checked = tables.map((table, i) => {
    if (!(table instanceof Uint8Array) || table.length !== 24 ** 4) return null;
    for (const value of table) if (value !== 255 && value > 31) return null;
    const [a, b] = PAIR_CROSS_EDGES[i];
    for (let shift = 0; shift < 4; shift++) {
      const goal = GOAL_CODES[shift];
      const index = (((goal[a] * 24 + goal[b]) * 24 + goal[4 + i]) * 24 + goal[8 + i]);
      if (table[index] !== 0) return null;
    }
    return table;
  });
  if (checked.some(table => table === null)) return false;
  for (let i = 0; i < checked.length; i++) pairCrossTables[i] = checked[i];
  return true;
}
export const tableStats = () => ({ shifts: tablesByShift.size, extra: Object.keys(crossEdgeTables).length, pairCross: Object.keys(pairCrossTables).length });

// ---- IDA* -----------------------------------------------------------------
// targets: array of slot indices that must end solved (preserved + new)
export function findCompletions(codes0, { newSlots, preserve = solvedSlots(codes0), maxDepth = 10, maxSolutions = 50, slack = 1, timeBudgetMs = 4000, useCrossEdge = true, usePairCross = false, goalShift = 0 }) {
  const { cross: crossTable, pairs: pairTables } = buildTables();
  const goalSlots = [...new Set([...preserve, ...newSlots])];
  const pieces = [0, 1, 2, 3, ...goalSlots.flatMap(i => [4 + i, 8 + i])];
  const ceTables = useCrossEdge && goalShift === 0 ? goalSlots.map(i => [i, crossEdgeTable(i)]) : [];
  const pcTables = usePairCross ? goalSlots.map(i => [i, pairCrossTable(i)]) : [];
  const pieceIndex = new Map(pieces.map((piece, index) => [piece, index]));
  const n = pieces.length;
  const start = Uint8Array.from(pieces, t => codes0[t]);
  const t0 = performance.now(); let nodes = 0, timedOut = false;
  const solutions = []; const solutionGoalShifts = []; const path = [];
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
    for (const [i, tab] of pcTables) {
      const [a, b] = PAIR_CROSS_EDGES[i];
      const d = tab[enc([st[pieceIndex.get(a)], st[pieceIndex.get(b)], st[pieceIndex.get(4 + i)], st[pieceIndex.get(8 + i)]])];
      if (d > best) best = d;
    }
    return best;
  }
  function goalFor(st) {
    const shifts = goalShift === 'any' ? [0, 1, 2, 3] : [goalShift];
    for (const shift of shifts) {
      let match = true;
      for (let i = 0; i < pieces.length; i++) if (st[i] !== GOAL_CODES[shift][pieces[i]]) { match = false; break; }
      if (match) return shift;
    }
    return -1;
  }
  function dfs(depth, limit, prevMi) {
    if (performance.now() - t0 > timeBudgetMs && (nodes & 0xfff) === 0) { timedOut = true; }
    if (timedOut || solutions.length >= maxSolutions) return false;
    const st = stack[depth]; nodes++;
    const hv = h(st);
    const goal = goalFor(st);
    if (goal >= 0) {
      if (depth === limit) {
        solutions.push(path.slice(0, depth).map(i => MOVES[i]).join(' '));
        solutionGoalShifts.push(goal);
      }
      return solutions.length < maxSolutions;
    }
    if (depth + hv > limit) return true;
    const pf = prevMi < 0 ? null : moveFace[prevMi];
    for (let mi = 0; mi < 18; mi++) {
      const f = moveFace[mi];
      if (pf && (f === pf || (FACE_AXIS[f] === FACE_AXIS[pf] && FACE_RANK[f] < FACE_RANK[pf]))) continue;
      const nx = stack[depth + 1];
      for (let i = 0; i < n; i++) nx[i] = next(pieces[i], st[i], mi);
      path[depth] = mi;
      if (!dfs(depth + 1, limit, mi)) return false;
    }
    return true;
  }
  let found = -1, shortestProven = false, completedThroughDepth = -1, alternativesComplete = true;
  for (let limit = 0; limit <= maxDepth && !timedOut; limit++) {
    stack[0].set(start);
    const complete = dfs(0, limit, -1);
    if (complete) completedThroughDepth = limit;
    else alternativesComplete = false;
    if (solutions.length && found < 0) { found = limit; shortestProven = completedThroughDepth >= limit - 1; }
    if (!complete || (found >= 0 && limit >= found + slack)) break;
  }
  return { solutions, solutionGoalShifts, shortest: found, shortestProven, completedThroughDepth, alternativesComplete,
    nodes, ms: Math.round(performance.now() - t0), timedOut };
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
  const startShift = opts.startShift ?? 0;
  if (!crossSolved(codes, startShift)) throw new Error('cross must be solved in the requested D-offset start frame');
  const solved = solvedSlots(codes, startShift);
  const open = SLOTS.map((_, i) => i).filter(i => !solved.includes(i));
  const out = [];
  const coldStart = performance.now();
  buildTables();
  const coldMs = performance.now() - coldStart;
  const optionalStart = performance.now();
  if (opts.usePairCross) buildPairCrossTables();
  const optionalColdMs = performance.now() - optionalStart;
  const t0 = performance.now();
  let incumbent = Infinity;
  for (const i of open) {
    const variants = [];
    const remainingMs = Math.max(1, (opts.timeBudgetMs ?? 4000) - (performance.now() - t0));
    const r = remainingMs <= 1 && performance.now() - t0 >= (opts.timeBudgetMs ?? 4000)
      ? { solutions: [], solutionGoalShifts: [], shortest: -1, shortestProven: false, completedThroughDepth: -1, alternativesComplete: false, nodes: 0, timedOut: true }
      : findCompletions(codes, {
        newSlots: [i], preserve: solved, ...opts,
        maxDepth: Math.min(opts.maxDepth ?? 10, Number.isFinite(incumbent) ? incumbent : (opts.maxDepth ?? 10)),
        maxSolutions: 1, slack: 0,
        goalShift: 'any', useCrossEdge: false, timeBudgetMs: remainingMs,
      });
    if (r.shortest >= 0) incumbent = Math.min(incumbent, r.shortest);
    variants.push(...r.solutions.map((s, index) => ({ s, goalShift: r.solutionGoalShifts[index] ?? startShift })));
    const ranked = variants.map(({ s, goalShift }) => {
      const moveList = tokens(s);
      const finalCodes = trackedFrom(`${scramble} ${s}`);
      const finalSlots = solvedSlots(finalCodes, goalShift);
      const added = finalSlots.filter(slot => !solved.includes(slot));
      return { moves: s, tokens: moveList, slots: added.map(slot => SLOTS[slot].name), w: plannerWeight(moveList), e: ergoScore(moveList), goalShift };
    }).sort((a, b) => a.e - b.e || a.w - b.w || a.tokens.length - b.tokens.length);
    out.push({ slots: [SLOTS[i].name], shortest: r.shortest, shortestProven: r.shortestProven,
      completedThroughDepth: r.completedThroughDepth, alternativesComplete: r.alternativesComplete,
      ms: performance.now() - t0, nodes: r.nodes, timedOut: r.timedOut,
      searchedGoalShifts: [0, 1, 2, 3], options: ranked.slice(0, 5) });
  }
  const best = out.filter(candidate => candidate.shortest >= 0).sort((a, b) => a.shortest - b.shortest)[0] ?? null;
  const proven = Boolean(best && out.length === open.length && out.every(candidate =>
    (candidate.shortestProven && candidate.shortest >= best.shortest)
      || candidate.completedThroughDepth >= best.shortest - 1));
  return { solved: solved.map(i => SLOTS[i].name), candidates: out, shortest: best?.shortest ?? -1, proven,
    coldMs, optionalColdMs, searchMs: performance.now() - t0 };
}
