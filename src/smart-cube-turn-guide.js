import './smart-cube-turn-guide.css';
import { describeTurn } from './smart-cube-guidance.js';

// Shared move cue for scramble, plan, and recovery flows. The caller owns its
// cube state and passes only the next visible instruction and navigation hooks.
export function createSmartCubeTurnGuide(container, { onPrevious = () => {}, onNext = () => {} } = {}) {
  container.classList.add('smart-turn-guide');
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Move guidance');
  container.setAttribute('aria-live', 'polite');
  container.innerHTML = `<div><span class="smart-turn-kicker"></span><strong class="smart-turn-notation"></strong><span class="smart-turn-symbol" aria-hidden="true"></span><p class="smart-turn-instruction"></p></div><div class="smart-turn-actions"><button class="smart-turn-prev" type="button" aria-label="Previous scramble turn">←</button><button class="smart-turn-next" type="button" aria-label="Next scramble turn">Next →</button></div>`;
  const $ = selector => container.querySelector(selector);
  $('.smart-turn-prev').addEventListener('click', onPrevious);
  $('.smart-turn-next').addEventListener('click', onNext);
  return {
    render({ mode = null, move, index = 0, total = 0, bottom = 'D', front = 'F', recovery = [] } = {}) {
      container.hidden = !mode;
      if (!mode) return;
      container.dataset.guideMode = mode;
      const cue = describeTurn(move, bottom, front);
      const label = mode === 'plan' ? 'Plan' : mode === 'guide' ? 'Guide' : 'Scramble';
      const heading = mode === 'recovery' ? `Return to plan · ${total} turn${total === 1 ? '' : 's'}`
        : move ? `${label} turn ${index + 1} of ${total}` : `${label} complete`;
      $('.smart-turn-kicker').textContent = heading;
      $('.smart-turn-notation').textContent = move || '✓';
      $('.smart-turn-symbol').textContent = cue?.symbol || '';
      $('.smart-turn-instruction').textContent = mode === 'recovery'
        ? `${cue?.text} Full return: ${recovery.slice(0, 8).join(' ')}${recovery.length > 8 ? ' …' : ''}.`
        : cue?.text || (mode === 'plan' ? 'The selected plan is complete.' : mode === 'guide' ? 'The whole algorithm is shown.' : 'All scramble turns are shown. Analyze when your cube matches.');
      $('.smart-turn-actions').hidden = mode !== 'scramble' && mode !== 'guide';
      $('.smart-turn-prev').setAttribute('aria-label', `Previous ${mode === 'guide' ? 'guide' : 'scramble'} turn`);
      $('.smart-turn-next').setAttribute('aria-label', `Next ${mode === 'guide' ? 'guide' : 'scramble'} turn`);
      $('.smart-turn-prev').disabled = index === 0;
      $('.smart-turn-next').disabled = !move;
    },
  };
}
