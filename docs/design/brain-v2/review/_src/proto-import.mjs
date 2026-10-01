// Prototype: parse a pasted reconstruction (scramble + solution text with rotations, wide moves, slices,
// groups, comments) into CANONICAL fixed-centre face turns + a per-move orientation track, and verify it
// against an independent physical model (applyMoves with Rw/Uw/Fw/M/E/S moving the centres).
// Run: node docs/design/brain-v2/review/_src/proto-import.mjs
import { applyMoves, createSolvedState, sameCubeState } from '../../../../../src/cross-cube.js';

const OPP = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };
// view-label -> physical face, after a whole-cube rotation (derived by hand, verified below)
const ROT = {
  x: { U: 'F', F: 'D', D: 'B', B: 'U', R: 'R', L: 'L' },
  y: { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' },
  z: { R: 'U', U: 'L', L: 'D', D: 'R', F: 'F', B: 'B' },
};
const inv = a => a === 2 ? 2 : 4 - a;
const suffix = a => a === 1 ? '' : a === 2 ? '2' : "'";
const amountOf = s => s === '2' || s === "2'" ? 2 : s === "'" ? 3 : 1;

/** text -> tokens. Strips // and /* *\/ comments (kept as annotations), expands (..)n, [A,B], [A:B]. */
export function tokenize(text) {
  const notes = [];               // {atToken, text}
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, m => { notes.push({ raw: m.slice(2, -2).trim() }); return ' '; })
    .split('\n').map(line => { const i = line.indexOf('//'); if (i < 0) return line; notes.push({ raw: line.slice(i + 2).trim() }); return line.slice(0, i); }).join(' ')
    .replace(/[′’]/g, "'");
  let pos = 0; const s = cleaned;
  function parseSeq(stop) {
    const out = [];
    while (pos < s.length && !stop.includes(s[pos])) {
      const c = s[pos];
      if (/\s/.test(c)) { pos++; continue; }
      if (c === '(') { pos++; const inner = parseSeq(')'); pos++; const m = /^\d+/.exec(s.slice(pos)); const n = m ? +m[0] : 1; if (m) pos += m[0].length; for (let i = 0; i < n; i++) out.push(...inner); continue; }
      if (c === '[') {
        pos++; const a = parseSeq(',:'); const sep = s[pos]; pos++; const b = parseSeq(']'); pos++;
        const invert = seq => seq.slice().reverse().map(t => ({ ...t, amt: inv(t.amt) }));
        out.push(...a, ...b, ...invert(a), ...(sep === ',' ? invert(b) : [])); continue;
      }
      const m = /^([URFDLB])(w?)(2'|2|')?|^([urfdlb])(2'|2|')?|^([MES])(2'|2|')?|^([xyz])(2'|2|')?/.exec(s.slice(pos));
      if (!m) throw new Error(`Unrecognised notation near “${s.slice(pos, pos + 8)}”`);
      pos += m[0].length;
      if (m[1]) out.push({ kind: m[2] ? 'wide' : 'face', face: m[1], amt: amountOf(m[3] || '') });
      else if (m[4]) out.push({ kind: 'wide', face: m[4].toUpperCase(), amt: amountOf(m[5] || '') });
      else if (m[6]) out.push({ kind: 'slice', face: m[6], amt: amountOf(m[7] || '') });
      else out.push({ kind: 'rot', face: m[8], amt: amountOf(m[9] || '') });
    }
    return out;
  }
  return { tokens: parseSeq(''), notes };
}

/** tokens -> canonical moves (outer face turns in the fixed-centre frame) + orientation track */
export function canonicalize(tokens) {
  let map = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' };     // view label -> physical face
  const rotate = (axis, amt) => { for (let i = 0; i < amt; i++) { const next = { ...map }; for (const [v, from] of Object.entries(ROT[axis])) next[v] = map[from]; map = next; } };
  const moves = [], orient = [];    // orient[i] = {bottom, front} physical faces in view D / F BEFORE move i
  const turn = (face, amt, src) => { orient.push({ bottom: map.D, front: map.F }); moves.push({ m: map[face] + suffix(amt), src }); };
  const AXIS = { R: ['x', 1], L: ['x', -1], U: ['y', 1], D: ['y', -1], F: ['z', 1], B: ['z', -1] };
  const rotAmt = (dir, amt) => dir === 1 ? amt : inv(amt);
  tokens.forEach((t, src) => {
    if (t.kind === 'face') turn(t.face, t.amt, src);
    else if (t.kind === 'rot') rotate(t.face, t.amt);
    else if (t.kind === 'wide') { const [axis, dir] = AXIS[t.face]; turn(OPP[t.face], t.amt, src); rotate(axis, rotAmt(dir, t.amt)); }
    else { // slice M follows L, E follows D, S follows F
      if (t.face === 'M') { turn('R', t.amt, src); turn('L', inv(t.amt), src); rotate('x', inv(t.amt)); }
      if (t.face === 'E') { turn('U', t.amt, src); turn('D', inv(t.amt), src); rotate('y', inv(t.amt)); }
      if (t.face === 'S') { turn('F', inv(t.amt), src); turn('B', t.amt, src); rotate('z', t.amt); }
    }
  });
  return { moves, orient, finalMap: map };
}

// ---- independent physical check ----
const PHYS = { x: ['Rw', "L'"], y: ['Uw', "D'"], z: ['Fw', "B'"] };
function physicalTokens(tokens) {
  const out = [];
  for (const t of tokens) {
    const suf = suffix(t.amt);
    if (t.kind === 'face') out.push(t.face + suf);
    else if (t.kind === 'wide') out.push(t.face + 'w' + suf);
    else if (t.kind === 'slice') out.push(t.face + suf);
    else for (let i = 0; i < t.amt; i++) out.push(...PHYS[t.face]);
  }
  return out;
}
function standardize(state) {           // physically rotate until every centre is home
  const seen = new Set(); const found = []
  let frontier = [[]];
  for (let depth = 0; depth < 6 && frontier.length; depth++) {
    const next = [];
    for (const seq of frontier) for (const r of [PHYS.x, PHYS.y]) {
      const s2 = [...seq, ...r]; const st = applyMoves(state, s2);
      const key = st.cubies.filter(c => c.id.length === 1).map(c => c.id + c.position).join('');
      if (seen.has(key)) continue; seen.add(key); next.push(s2); found.push([s2, st]);
    }
    frontier = next;
  }
  const home = createSolvedState().cubies.filter(c => c.id.length === 1);
  const ok = st => home.every(h => { const c = st.cubies.find(x => x.id === h.id && x.position.join() === h.position.join()); return c && Object.entries(h.stickers).every(([f, col]) => c.stickers[f] === col); });
  if (ok(state)) return state;
  return found.find(([, st]) => ok(st))?.[1] ?? null;
}
function selfTest(n = 300) {
  const faces = 'URFDLB', tail = ['', "'", '2'], extra = ['x', 'y', 'z', 'M', 'E', 'S'];
  let seed = 12345; const rnd = k => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; };
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const len = 4 + rnd(14); const toks = [];
    for (let j = 0; j < len; j++) {
      const r = rnd(10);
      if (r < 5) toks.push(faces[rnd(6)] + tail[rnd(3)]);
      else if (r < 7) toks.push(faces[rnd(6)] + 'w' + tail[rnd(3)]);
      else if (r < 8) toks.push('rufldb'[rnd(6)] + tail[rnd(3)]);
      else if (r < 9) toks.push(extra.slice(0, 3)[rnd(3)] + tail[rnd(3)]);
      else toks.push(extra.slice(3)[rnd(3)] + tail[rnd(3)]);
    }
    const text = toks.join(' ');
    const { tokens } = tokenize(text);
    const { moves } = canonicalize(tokens);
    const canonical = applyMoves(createSolvedState(), moves.map(m => m.m));
    const phys = standardize(applyMoves(createSolvedState(), physicalTokens(tokens)));
    if (!phys || !sameCubeState(canonical, phys)) { bad++; if (bad < 4) console.log('MISMATCH', text); }
  }
  return bad;
}
console.log('random rotation/wide/slice algs checked against the physical model, mismatches:', selfTest(300));

// ---- a whole reconstruction ----
const sample = `// scramble
D2 F2 U' B2 R2 U2 F2 U' L2 D' B' L' U F' R' D2 R U' F2 L'
// solution
F' D' F D B D' R D'  // cross (2.08)
R F R U' F' U' R'    /* pair 1 */
y' (U' L' U L)2 U2   // pair 2
Rw U Rw' U' M2 [R, U] x'`;
const [scr, ...sol] = sample.split('// solution');
const S = tokenize(scr).tokens.map(t => t.face + (t.amt === 1 ? '' : t.amt === 2 ? '2' : "'"));
const { tokens, notes } = tokenize(sol.join(''));
const { moves, orient } = canonicalize(tokens);
console.log('scramble', S.length, 'moves | solution tokens', tokens.length, '-> canonical face turns', moves.length, '| notes', notes.map(n => n.raw));
console.log('canonical:', moves.map(m => m.m).join(' '));
console.log('orientation track sample (bottom/front physical face before move 10,11):', JSON.stringify(orient.slice(10, 12)));
