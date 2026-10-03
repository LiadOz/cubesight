import { applyDemoMove, parseDemoHash, setupState } from './model.js';
import { caseDisplayState } from '../ui/cube/orientation.js';

/** Stable, JSON-only state consumed by F9 snapshots; never includes the player DOM or WebGL objects. */
export function buildDemoViewModel({ hash = '', partIndex = 0, moveIndex = 0, playing = false } = {}) {
  if (/^#?\/demo\/format(?:\?|$)/.test(String(hash))) {
    return { kind: 'format', title: 'demo link format', examples: [
      '#/demo?title=F2L%20pair&setup=R%20U%20R%27&alg=U%27%20R%20U%20R%27&highlight=pair%3AFR',
      '#/demo?title=Two%20cases&part1.title=case%201&part1.setup=R%20U&part1.alg=R%27%20U%27&part2.title=case%202&part2.setup=F%20R&part2.alg=R%27%20F%27',
    ] };
  }
  let demo;
  try { demo = parseDemoHash(hash); }
  catch (error) { return { kind: 'demo', title: 'demo link needs a check', error: error.message, parts: [] }; }
  const index = Math.max(0, Math.min(demo.parts.length - 1, Number.isInteger(partIndex) ? partIndex : 0));
  const source = demo.parts[index];
  const alg = source.alg.slice();
  const applied = Math.max(0, Math.min(alg.length, Number.isInteger(moveIndex) ? moveIndex : 0));
  const setup = source.setup.slice();
  const state = alg.slice(0, applied).reduce((current, move) => applyDemoMove(current, move), setupState(setup));
  const seed = `${demo.title}:${index + 1}:${source.title || `case ${index + 1}`}`;
  const displayed = caseDisplayState(state, source.colorSetting, seed);
  return {
    kind: 'demo', title: demo.title, partIndex: index, partCount: demo.parts.length,
    part: { title: source.title, setup, alg, steps: source.steps.map(step => ({ moves: step.moves.slice(), note: step.note })),
      highlight: source.highlight.slice(), caseId: source.caseId, speed: source.speed, colorSetting: source.colorSetting },
    moveIndex: applied, moveCount: alg.length, playing: Boolean(playing), displayState: displayed.state,
    color: { setting: source.colorSetting, topColor: displayed.topColor, allowedColors: displayed.allowedColors },
  };
}
