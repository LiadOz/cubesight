// Small, pure notation helpers shared by the algorithm browser and drill.
// They intentionally do not fetch or depend on an external notation service.

const MOVE_RE = /^(?:[URFDLBMESxyz](?:w)?|[urfdlb])(?:[234]'?|')?$/;
const BASE = /^[URFDLBMESxyz](?:w)?|[urfdlb]$/;

function canonicalMove(token) {
  const base = /^(?:[URFDLBMESxyz](?:w)?|[urfdlb])/.exec(token)?.[0];
  const suffix = token.slice(base?.length ?? token.length);
  if (!base) throw new Error(`Unsupported move ${token}.`);
  if (!suffix || suffix === '4') return suffix === '4' ? null : base;
  if (suffix === '2' || suffix === "2'") return `${base}2`;
  if (suffix === "'" || suffix === '3') return `${base}'`;
  if (suffix === "3'") return base;
  if (suffix === "4'") return `${base}'`;
  throw new Error(`Unsupported move ${token}.`);
}

function readTokens(source) {
  const input = String(source ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const out = [];
  let at = 0;
  const sequence = stopAtParen => {
    const row = [];
    while (at < input.length) {
      if (/\s/.test(input[at])) { at++; continue; }
      if (input[at] === ')') {
        if (!stopAtParen) throw new Error('Unexpected ) in algorithm.');
        at++; return row;
      }
      if (input[at] === '(') {
        at++;
        const inner = sequence(true);
        const repeat = /^\d+/.exec(input.slice(at));
        if (repeat) at += repeat[0].length;
        const count = repeat ? Number(repeat[0]) : 1;
        if (!Number.isSafeInteger(count) || count > 99) throw new Error('Algorithm repetition is too large.');
        for (let i = 0; i < count; i++) row.push(...inner);
        continue;
      }
      const match = /^(?:[URFDLBMESxyz](?:w)?|[urfdlb])(?:[234]'?|')?/.exec(input.slice(at));
      if (!match || !match[0]) throw new Error(`Unsupported algorithm notation at “${input.slice(at, at + 12)}”.`);
      const token = canonicalMove(match[0]);
      if (token && !MOVE_RE.test(token)) throw new Error(`Unsupported move ${token}.`);
      if (token) row.push(token); at += match[0].length;
    }
    if (stopAtParen) throw new Error('Missing ) in algorithm.');
    return row;
  };
  out.push(...sequence(false));
  return out;
}

export const parseAlg = input => Object.freeze(readTokens(input));

function invertMove(move) {
  if (move.endsWith('2')) return move;
  return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

export const invertAlg = input => [...parseAlg(input)].reverse().map(invertMove);

function simplify(tokens) {
  const stack = [];
  for (const token of tokens) {
    const prior = stack.at(-1);
    const face = token.match(BASE)?.[0];
    const priorFace = prior?.match(BASE)?.[0];
    if (face && face === priorFace) {
      stack.pop();
      const amount = move => move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1;
      const sum = (amount(token) + amount(prior)) % 4;
      if (sum) stack.push(`${face}${sum === 2 ? '2' : sum === 3 ? "'" : ''}`);
    } else stack.push(token);
  }
  return stack;
}

/** A stable token key that absorbs grouping, redundant suffixes, and cancellations. */
export const normalizeAlg = input => simplify(parseAlg(input)).join(' ');

/** Remove an optional pre/post U-turn while preserving the middle algorithm. */
export function stripAuf(input) {
  let moves = simplify(parseAlg(input));
  const turns = new Set(['U', "U'", 'U2']);
  while (turns.has(moves[0])) moves = moves.slice(1);
  while (turns.has(moves.at(-1))) moves = moves.slice(0, -1);
  return moves;
}

export function algorithmMetrics(input) {
  const moves = parseAlg(input);
  const turns = moves.filter(move => !'xyz'.includes(move[0]));
  const stm = turns.length;
  const etm = turns.reduce((sum, move) => sum + (/[w]$/.test(move) || 'MES'.includes(move[0]) || /^[urfdlb]/.test(move) ? 2 : 1), 0);
  const qtm = moves.reduce((sum, move) => sum + (move.endsWith('2') ? 2 : 1), 0);
  return { stm, etm, qtm, normalized: normalizeAlg(moves.join(' ')) };
}
