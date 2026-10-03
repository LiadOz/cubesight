import { applyMoves, CORNERS, EDGES, createSolvedState, parseScramble } from '../cross-cube.js';
import { describeMove, parseSequence } from '../moves/notation.js';
import { CASE_COLORS, normalizeCaseColorSetting } from '../ui/cube/orientation.js';

export const DEMO_MAX_CHARS = 8000;
export const DEMO_MAX_PARTS = 12;
const NORMAL = { U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };
const FACE = Object.fromEntries(Object.entries(NORMAL).map(([face, vector]) => [vector.join(','), face]));
const VALID_PIECES = new Set([...CORNERS, ...EDGES]);
const quarter = (vector, normal) => {
  const projection = vector.reduce((sum, value, index) => sum + value * normal[index], 0);
  const cross = [normal[1] * vector[2] - normal[2] * vector[1], normal[2] * vector[0] - normal[0] * vector[2], normal[0] * vector[1] - normal[1] * vector[0]];
  return vector.map((_, index) => Math.round(normal[index] * projection - cross[index]));
};

export function applyDemoMove(state, move) {
  if (!/^[xyz]/.test(move)) return applyMoves(state, [move]);
  const normal = NORMAL[move[0] === 'x' ? 'R' : move[0] === 'y' ? 'U' : 'F'];
  const turns = move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1;
  return { cubies: state.cubies.map(cubie => {
    let position = cubie.position;
    let stickers = cubie.stickers;
    for (let turn = 0; turn < turns; turn++) {
      position = quarter(position, normal);
      stickers = Object.fromEntries(Object.entries(stickers).map(([face, color]) => [FACE[quarter(NORMAL[face], normal).join(',')], color]));
    }
    return { ...cubie, position, stickers };
  }) };
}

const validateMoves = (value, label) => {
  try { return parseSequence(value); }
  catch (error) { throw new Error(`${label}: ${error.message}`); }
};
function parseSteps(value, alg) {
  if (!value) return [];
  const steps = String(value).split(';').map(chunk => {
    const colon = chunk.indexOf(':');
    if (colon < 1) throw new Error('Each step uses moves:note, separated by semicolons.');
    const moves = validateMoves(chunk.slice(0, colon), 'Step moves');
    const note = chunk.slice(colon + 1);
    if (!note.trim()) throw new Error('Each step needs a note.');
    return { moves, note };
  });
  if (steps.flatMap(step => step.moves).join(' ') !== alg.join(' ')) throw new Error('Step moves must cover the alg in order.');
  return steps;
}
function readPart(params, prefix = '') {
  const get = key => params.get(`${prefix}${key}`);
  const title = (get('title') || (!prefix ? get('partTitle') : '') || '').trim();
  const setupText = get('setup') || '';
  const algText = get('alg') || '';
  let setup, alg;
  try { setup = parseScramble(setupText.replace(/[′’‘`]/g, "'"), { allowWide: true, allowRotations: true }); }
  catch (error) { throw new Error(`Setup: ${error.message}`); }
  alg = validateMoves(algText, 'Alg');
  if (!alg.length) throw new Error('Add an alg to make a demo.');
  if (alg.length > 200 || setup.length > 200) throw new Error('Use at most 200 moves in setup and alg.');
  const highlight = (get('highlight') || '').split(',').map(value => value.trim()).filter(Boolean);
  if (highlight.some(value => !VALID_PIECES.has(value) && !/^pair:(?:FR|BR|BL|FL)$/.test(value))) throw new Error('Highlight pieces must be real cubie names such as UFR, FR, or pair:FR.');
  const caseId = get('case') || '';
  if (caseId && !/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(caseId)) throw new Error('Case links use a path such as f2l/8.');
  const speed = Number(get('speed') || 1);
  if (!Number.isFinite(speed) || speed < .25 || speed > 4) throw new Error('Speed must be between 0.25 and 4.');
  const rawColor = get('color') || '';
  const colorSetting = rawColor ? normalizeCaseColorSetting(rawColor) : 'yellow top';
  if (rawColor && (!CASE_COLORS.includes(colorSetting) || (colorSetting === 'yellow top' && rawColor !== 'yellow top'))) throw new Error('Choose a supported case color setting.');
  const stepPrefix = prefix ? `${prefix}step` : 'step';
  const stepIds = [...new Set([...params.keys()].map(key => new RegExp(`^${stepPrefix}(\\d+)\\.moves$`).exec(key)?.[1]).filter(Boolean))].map(Number).sort((a, b) => a - b);
  const steps = stepIds.length
    ? stepIds.map(index => {
      const moves = validateMoves(params.get(`${stepPrefix}${index}.moves`) || '', 'Step moves');
      const note = params.get(`${stepPrefix}${index}.note`) ?? '';
      if (!note.trim()) throw new Error('Each step needs a note.');
      return { moves, note };
    })
    : parseSteps(get('steps'), alg);
  if (steps.length && steps.flatMap(step => step.moves).join(' ') !== alg.join(' ')) throw new Error('Step moves must cover the alg in order.');
  return { title, setup, alg, steps, highlight, caseId, speed, colorSetting };
}

export function parseDemoHash(hash = '') {
  if (String(hash).length > DEMO_MAX_CHARS) throw new Error(`Demo links are limited to ${DEMO_MAX_CHARS} characters.`);
  const query = String(hash).replace(/^#?\/demo(?:\/format)?\??/, '');
  const params = new URLSearchParams(query);
  const indexes = [...new Set([...params.keys()].map(key => /^part(\d+)\.(?:title|setup|alg|steps|highlight|case|speed|color|step\d+\.(?:moves|note))$/.exec(key)?.[1]).filter(Boolean))].map(Number).sort((a, b) => a - b);
  let parts;
  if (indexes.length) {
    if (indexes.length > DEMO_MAX_PARTS) throw new Error(`A lesson can contain at most ${DEMO_MAX_PARTS} parts.`);
    if (indexes.some((index, position) => index !== position + 1)) throw new Error('Lesson parts must be numbered in order starting at part1.');
    parts = indexes.map(index => readPart(params, `part${index}.`));
  } else parts = [readPart(params)];
  return { title: (params.get('title') || parts[0].title || 'cube demo').trim(), parts };
}

export function serializeDemo(demo) {
  const params = new URLSearchParams();
  if (demo.title) params.set('title', demo.title);
  if (demo.parts.length === 1) {
    const part = demo.parts[0];
    if (part.title && part.title !== demo.title) params.set('partTitle', part.title);
    params.set('setup', part.setup.join(' ')); params.set('alg', part.alg.join(' '));
    part.steps.forEach((step, index) => { params.set(`step${index + 1}.moves`, step.moves.join(' ')); params.set(`step${index + 1}.note`, step.note); });
    if (part.highlight.length) params.set('highlight', part.highlight.join(','));
    if (part.caseId) params.set('case', part.caseId);
    if (part.speed !== 1) params.set('speed', String(part.speed));
    if (part.colorSetting && part.colorSetting !== 'yellow top') params.set('color', part.colorSetting);
  } else demo.parts.forEach((part, index) => {
    const prefix = `part${index + 1}.`;
    for (const [key, value] of [['title', part.title], ['setup', part.setup.join(' ')], ['alg', part.alg.join(' ')], ['highlight', part.highlight.join(',')], ['case', part.caseId], ['speed', part.speed === 1 ? '' : String(part.speed)], ['color', !part.colorSetting || part.colorSetting === 'yellow top' ? '' : part.colorSetting]]) if (value) params.set(`${prefix}${key}`, value);
    part.steps.forEach((step, stepIndex) => { params.set(`${prefix}step${stepIndex + 1}.moves`, step.moves.join(' ')); params.set(`${prefix}step${stepIndex + 1}.note`, step.note); });
  });
  return `#/demo?${params}`;
}

export function parseDemoPaste(text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Paste a demo link or add setup and alg moves.');
  const directHash = value.match(/#\/demo(?:\/format)?(?:\?[^\s<>"]*)?/i)?.[0]?.replace(/[),.;!?]+$/, '');
  if (directHash && !/^https?:\/\//i.test(value)) return parseDemoHash(directHash);
  const link = value.match(/https?:\/\/[^\s<>"]+/i)?.[0]?.replace(/[),.;!?]+$/, '');
  if (link) {
    const url = new URL(link);
    if (url.hash.startsWith('#/demo')) return parseDemoHash(url.hash);
    const supportedHost = url.hostname === 'alg.cubing.net' || url.hostname === 'twizzle.net' || url.hostname.endsWith('.twizzle.net');
    if (!supportedHost) throw new Error('Paste a CubeSight demo, alg.cubing.net, or twizzle.net link.');
    const params = new URLSearchParams(url.search);
    const alg = (params.get('alg') || params.get('moves') || '').replace(/_/g, ' ');
    const setup = (params.get('setup') || '').replace(/_/g, ' ');
    if (!alg) throw new Error('This link has no alg parameter.');
    const clean = new URLSearchParams({ title: params.get('title') || 'cube demo', setup, alg });
    return parseDemoHash(`#/demo?${clean}`);
  }
  const fields = Object.fromEntries(value.split(/\r?\n/).map(line => {
    const match = /^\s*(setup|alg|title)\s*:\s*(.*)$/i.exec(line);
    return match ? [match[1].toLowerCase(), match[2]] : [];
  }).filter(pair => pair.length));
  if (fields.alg) return parseDemoHash(`#/demo?${new URLSearchParams(fields)}`);
  throw new Error('Use “setup: …” and “alg: …” on separate lines.');
}

export function demoDescriptions(moves) { return moves.map(move => ({ move, ...describeMove(move) })); }
export function setupState(setup) { return setup.reduce((state, move) => applyDemoMove(state, move), createSolvedState()); }
