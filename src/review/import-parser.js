// Local reconstruction importer. It accepts standard algorithm notation,
// comments, groups/commutators, wide and slice turns, and whole-cube rotations.
// Rotations are converted to fixed-centre outer turns plus a sparse hand-frame
// track so the existing cube and review engine can replay imported solutions.
import { applyMoves, createSolvedState, sameCubeState } from '../cross-cube.js';

const OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };
const ROTATION = {
  x: { U: 'F', F: 'D', D: 'B', B: 'U', R: 'R', L: 'L' },
  y: { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' },
  z: { R: 'U', U: 'L', L: 'D', D: 'R', F: 'F', B: 'B' },
};
const inverseAmount = amount => amount === 2 ? 2 : 4 - amount;
const suffix = amount => amount === 1 ? '' : amount === 2 ? '2' : "'";
const amount = suffixText => suffixText === '2' || suffixText === "2'" ? 2 : suffixText === "'" ? 3 : 1;
const MAX_SOURCE_LENGTH = 100_000;
const MAX_TOKENS = 10_000;
const applyChunks = (initial, moves) => {
  let state = initial;
  for (let at = 0; at < moves.length; at += 200) state = applyMoves(state, moves.slice(at, at + 200));
  return state;
};

/** Parse notation to raw tokens and retain comments as notes. */
export function tokenizeReconstruction(text, { allowEmpty = false } = {}) {
  if (typeof text !== 'string') throw new TypeError('Paste a reconstruction as text.');
  if (text.length > MAX_SOURCE_LENGTH) throw new Error('This reconstruction is too long to import.');
  const notes = [];
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, comment => { notes.push(comment.slice(2, -2).trim()); return ' '; })
    .split('\n').map(line => {
      const at = line.indexOf('//');
      if (at < 0) return line;
      notes.push(line.slice(at + 2).trim());
      return line.slice(0, at);
    }).join(' ').replace(/[′’]/g, "'");
  let cursor = 0;
  function sequence(stops) {
    const out = [];
    while (cursor < cleaned.length && !stops.includes(cleaned[cursor])) {
      const c = cleaned[cursor];
      if (/\s/.test(c)) { cursor++; continue; }
      if (c === '(') {
        cursor++;
        const inner = sequence(')');
        if (cleaned[cursor] !== ')') throw new Error('Unclosed move group.');
        cursor++;
        const repeat = /^\d+/.exec(cleaned.slice(cursor));
        const n = repeat ? Number(repeat[0]) : 1;
        if (repeat) cursor += repeat[0].length;
        if (n > 100) throw new Error('A move group can repeat at most 100 times.');
        for (let i = 0; i < n; i++) out.push(...inner);
      } else if (c === '[') {
        cursor++;
        const a = sequence(',:');
        const separator = cleaned[cursor];
        if (separator !== ',' && separator !== ':') throw new Error('A commutator needs a comma or colon.');
        cursor++;
        const b = sequence(']');
        if (cleaned[cursor] !== ']') throw new Error('Unclosed commutator.');
        cursor++;
        const invert = list => list.slice().reverse().map(token => ({ ...token, amount: inverseAmount(token.amount) }));
        out.push(...a, ...b, ...invert(a), ...(separator === ',' ? invert(b) : []));
      } else {
        const match = /^(?:([URFDLB])(w?)(2'|2|')?|([urfdlb])(2'|2|')?|([MES])(2'|2|')?|([xyz])(2'|2|')?)/.exec(cleaned.slice(cursor));
        if (!match) throw new Error(`Unrecognised notation near “${cleaned.slice(cursor, cursor + 12)}”.`);
        cursor += match[0].length;
        if (match[1]) out.push({ kind: match[2] ? 'wide' : 'face', face: match[1], amount: amount(match[3] || '') });
        else if (match[4]) out.push({ kind: 'wide', face: match[4].toUpperCase(), amount: amount(match[5] || '') });
        else if (match[6]) out.push({ kind: 'slice', face: match[6], amount: amount(match[7] || '') });
        else out.push({ kind: 'rotation', face: match[8], amount: amount(match[9] || '') });
      }
      if (out.length > MAX_TOKENS) throw new Error('This reconstruction has too many moves.');
    }
    return out;
  }
  const tokens = sequence('');
  if (!tokens.length && !allowEmpty) throw new Error('Paste at least one solution move.');
  return { tokens, notes };
}

/** Convert raw tokens into canonical turns and hand orientation before each turn. */
export function canonicalizeReconstruction(tokens) {
  let view = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' };
  const moves = [], orient = [];
  const rotate = (axis, turns) => {
    for (let i = 0; i < turns; i++) {
      const before = { ...view };
      for (const [label, source] of Object.entries(ROTATION[axis])) view[label] = before[source];
    }
  };
  const turn = (face, turns, sourceToken) => {
    orient.push([moves.length, view.D, view.F]);
    moves.push({ move: `${view[face]}${suffix(turns)}`, sourceToken });
  };
  const axisFor = { R: ['x', 1], L: ['x', -1], U: ['y', 1], D: ['y', -1], F: ['z', 1], B: ['z', -1] };
  const signedAmount = (direction, turns) => direction > 0 ? turns : inverseAmount(turns);
  tokens.forEach((token, sourceToken) => {
    if (token.kind === 'face') turn(token.face, token.amount, sourceToken);
    else if (token.kind === 'rotation') rotate(token.face, token.amount);
    else if (token.kind === 'wide') {
      const [axis, direction] = axisFor[token.face];
      turn(OPPOSITE[token.face], token.amount, sourceToken);
      rotate(axis, signedAmount(direction, token.amount));
    } else if (token.face === 'M') {
      turn('R', token.amount, sourceToken); turn('L', inverseAmount(token.amount), sourceToken); rotate('x', inverseAmount(token.amount));
    } else if (token.face === 'E') {
      turn('U', token.amount, sourceToken); turn('D', inverseAmount(token.amount), sourceToken); rotate('y', inverseAmount(token.amount));
    } else {
      turn('F', inverseAmount(token.amount), sourceToken); turn('B', token.amount, sourceToken); rotate('z', token.amount);
    }
  });
  return { moves, orient, finalView: view };
}

const PHYSICAL_ROTATIONS = { x: ['Rw', "L'"], y: ['Uw', "D'"], z: ['Fw', "B'"] };
/** Expand notation to physical model turns, independently of canonicalization. */
export function physicalModelTokens(tokens) {
  const out = [];
  for (const token of tokens) {
    const s = suffix(token.amount);
    if (token.kind === 'face') out.push(`${token.face}${s}`);
    else if (token.kind === 'wide') out.push(`${token.face}w${s}`);
    else if (token.kind === 'slice') out.push(`${token.face}${s}`);
    else for (let i = 0; i < token.amount; i++) out.push(...PHYSICAL_ROTATIONS[token.face]);
  }
  return out;
}

const centreKey = state => state.cubies.filter(cubie => cubie.id.length === 1)
  .map(cubie => `${cubie.id}${cubie.position.join(',')}`).join('|');
function normalizePhysicalFrame(state) {
  const solved = createSolvedState();
  const homeCentres = solved.cubies.filter(cubie => cubie.id.length === 1);
  const matches = candidate => homeCentres.every(home => {
    const centre = candidate.cubies.find(cubie => cubie.id === home.id && cubie.position.join() === home.position.join());
    return centre && Object.entries(home.stickers).every(([face, color]) => centre.stickers[face] === color);
  });
  if (matches(state)) return state;
  // Rotate the physical model until its centres match the fixed-centre frame.
  let frontier = [{ state, path: [] }];
  const seen = new Set([centreKey(state)]);
  for (let depth = 0; depth < 6; depth++) {
    const next = [];
    for (const item of frontier) for (const rotation of [PHYSICAL_ROTATIONS.x, PHYSICAL_ROTATIONS.y]) {
      const path = [...item.path, ...rotation];
      const candidate = applyMoves(item.state, rotation);
      if (matches(candidate)) return candidate;
      const key = centreKey(candidate);
      if (!seen.has(key)) { seen.add(key); next.push({ state: candidate, path }); }
    }
    frontier = next;
  }
  return null;
}

export function verifyReconstruction(tokens, canonicalMoves) {
  const canonical = applyChunks(createSolvedState(), canonicalMoves);
  const physical = normalizePhysicalFrame(applyChunks(createSolvedState(), physicalModelTokens(tokens)));
  return Boolean(physical && sameCubeState(canonical, physical));
}

const urlTokens = value => String(value ?? '').replace(/_/g, ' ').replace(/-/g, "'");
/** alg.cubing.net URL -> editable scramble and solution fields. */
export function parseAlgCubingUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Paste a valid alg.cubing.net URL.'); }
  if (!/(^|\.)alg\.cubing\.net$/i.test(url.hostname)) throw new Error('This link is not from alg.cubing.net.');
  const alg = url.searchParams.get('alg');
  const setup = url.searchParams.get('setup') ?? '';
  if (!alg) throw new Error('This alg.cubing.net link has no solution moves.');
  return { scramble: urlTokens(setup), solution: urlTokens(alg) };
}

/** Parse, canonicalize, verify, and return a review-ready local reconstruction. */
export function buildImportedReconstruction({ scramble = '', solution = '' } = {}) {
  const scrambleParsed = tokenizeReconstruction(scramble, { allowEmpty: true });
  const solutionParsed = tokenizeReconstruction(solution);
  const canonicalScramble = canonicalizeReconstruction(scrambleParsed.tokens).moves.map(item => item.move);
  const canonical = canonicalizeReconstruction(solutionParsed.tokens);
  const canonicalSolution = canonical.moves.map(item => item.move);
  const solves = verifyReconstruction([...scrambleParsed.tokens, ...solutionParsed.tokens], [...canonicalScramble, ...canonicalSolution]);
  let ending = applyChunks(createSolvedState(), canonicalScramble);
  ending = applyChunks(ending, canonicalSolution);
  const solvedState = createSolvedState();
  const distance = ending.cubies.reduce((sum, cubie) => sum + Number(cubie.position.some((n, i) => n !== solvedState.cubies.find(home => home.id === cubie.id).position[i])), 0);
  return {
    record: {
      at: Date.now(), source: 'import', scramble: canonicalScramble.join(' '), scrambleTurns: canonicalScramble,
      solveMoves: canonicalSolution, moveCount: canonicalSolution.length, solveMs: null, moveTimes: null,
      solved: solves && distance === 0, penalty: null,
    },
    notes: [...scrambleParsed.notes, ...solutionParsed.notes],
    solves: solves && distance === 0,
    distance,
    orient: canonical.orient,
  };
}
