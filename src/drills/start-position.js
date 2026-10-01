import { parseHash } from '../routes.js';
import { parseAnalysisMoves } from '../analysis/long-replay.js';

const list = value => String(value ?? '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 100);

/** Read portable drill inputs from the current hash. `setup` is an alias for `scramble`. */
export function parseDrillStart(hash = globalThis.location?.hash ?? '') {
  const { query } = parseHash(hash);
  const params = new URLSearchParams(query);
  const raw = (params.get('scramble') ?? params.get('setup') ?? '').replaceAll('_', ' ');
  const review = /^review:(\d{1,16}):(\d{1,5})$/.exec(params.get('setup') ?? '');
  let moves = [];
  let invalid = false;
  if (raw && !review) {
    try { moves = parseAnalysisMoves(raw); }
    catch { moves = []; invalid = true; }
  }
  return {
    moves,
    invalid,
    cases: list(params.get('cases')),
    from: params.get('from')?.slice(0, 160) || null,
    face: /^[UDFBRL]$/.test(params.get('face') ?? '') ? params.get('face') : null,
    pseudo: params.get('pseudo') === '1',
    review: review ? { at: Number(review[1]), moveIdx: Number(review[2]) } : null,
  };
}

/** Portable start hash, with URL encoding for separators in a move sequence. */
export function drillStartHref(path, { scramble, cases, from, face, pseudo } = {}) {
  const params = new URLSearchParams();
  if (typeof scramble === 'string' && scramble.trim()) params.set('scramble', scramble.trim());
  if (Array.isArray(cases) && cases.length) params.set('cases', cases.join(','));
  if (from) params.set('from', String(from));
  if (face && /^[UDFBRL]$/.test(face)) params.set('face', face);
  if (pseudo) params.set('pseudo', '1');
  const query = params.toString();
  return `#${path}${query ? `?${query}` : ''}`;
}
