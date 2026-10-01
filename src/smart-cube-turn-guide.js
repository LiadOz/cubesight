import './smart-cube-turn-guide.css';
import { describeTurn } from './smart-cube-guidance.js';
import { fmt } from './copy/terms.js';

// Shared move cue for scramble, plan, and recovery flows. The caller owns its
// cube state and passes only the next visible instruction and navigation hooks.
export function createSmartCubeTurnGuide(container, { onPrevious = () => {}, onNext = () => {} } = {}) {
  container.classList.add('smart-turn-guide');
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'move guidance');
  container.setAttribute('aria-live', 'polite');
  container.innerHTML = `<div><span class="smart-turn-kicker"></span><strong class="smart-turn-notation"></strong><span class="smart-turn-symbol" aria-hidden="true"></span><p class="smart-turn-instruction"></p></div><div class="smart-turn-actions"><button class="smart-turn-prev" type="button" aria-label="previous move">←</button><button class="smart-turn-next" type="button" aria-label="next move">next</button></div>`;
  const $ = selector => container.querySelector(selector);
  $('.smart-turn-prev').addEventListener('click', onPrevious);
  $('.smart-turn-next').addEventListener('click', onNext);
  return {
    render({ mode = null, move, index = 0, total = 0, bottom = 'D', front = 'F', recovery = [] } = {}) {
      container.hidden = !mode;
      if (!mode) return;
      container.dataset.guideMode = mode;
      const cue = describeTurn(move, bottom, front);
      const label = mode === 'plan' ? 'plan' : mode === 'guide' ? 'guide' : 'scramble';
      const heading = mode === 'recovery' ? `back on plan · ${total} ${total === 1 ? 'move' : 'moves'}`
        : move ? `${label} move ${index + 1} of ${total}` : `${label} complete`;
      $('.smart-turn-kicker').textContent = heading;
      $('.smart-turn-notation').textContent = fmt.move(move) || '✓';
      $('.smart-turn-symbol').textContent = cue?.symbol || '';
      $('.smart-turn-instruction').textContent = mode === 'recovery'
        ? `${cue?.text} Full return: ${fmt.moves(recovery.slice(0, 8).join(' '))}${recovery.length > 8 ? ' …' : ''}.`
        : cue?.text || (mode === 'plan' ? 'The selected plan is complete.' : mode === 'guide' ? 'The whole alg is shown.' : 'All scramble moves are shown. Find plans when your cube matches.');
      $('.smart-turn-actions').hidden = mode !== 'scramble' && mode !== 'guide';
      $('.smart-turn-prev').setAttribute('aria-label', `previous ${mode === 'guide' ? 'guide' : 'scramble'} move`);
      $('.smart-turn-next').setAttribute('aria-label', `next ${mode === 'guide' ? 'guide' : 'scramble'} move`);
      $('.smart-turn-prev').disabled = index === 0;
      $('.smart-turn-next').disabled = !move;
    },
  };
}
