// Orbit results (C-08): time and stats, the TPS chart, and the solve donut
// on top; splits and the session (averages, sparkline, recent, coach) below.
// When a new result arrives, the donut flies in from where the timeline ring
// was (the ring "detaches" from the cube and becomes the donut).

import { createDonut } from '../../charts/donut.js';
import { createSparkline } from '../../charts/sparkline.js';
import { createSplitBars } from '../../charts/split-bars.js';
import { createTpsLine } from '../../charts/tps-line.js';
import { reconcileChildren, setText, toggleClass } from '../../dom.js';
import { ringHandoff } from './geometry.js';

const TEMPLATE = `
  <section class="b-ores-top">
    <div class="b-ores-time">
      <p class="b-ores-eyebrow">time</p>
      <p class="b-ores-big"><span class="b-ores-num"></span><span class="b-ores-unit">s</span><span class="b-ores-penalty"></span></p>
      <dl class="b-ores-stats">
        <div><dt>moves</dt><dd class="b-ores-moves"></dd></div>
        <div><dt>tps</dt><dd class="b-ores-tps"></dd></div>
        <div><dt>inspection</dt><dd class="b-ores-insp"></dd></div>
        <div class="b-ores-vs-wrap"><dt>vs ao12</dt><dd class="b-ores-vs"></dd></div>
      </dl>
      <p class="b-ores-method"></p>
    </div>
    <div class="b-ores-chart">
      <p class="b-ores-chart-head"><span class="b-ores-eyebrow">turns per second</span><span class="b-ores-legend"><i aria-hidden="true"></i><span class="b-ores-avg-label"></span></span></p>
      <div class="b-ores-chart-host"></div>
    </div>
    <div class="b-ores-donut-host"></div>
  </section>
  <hr class="b-ores-rule">
  <section class="b-ores-bottom">
    <div class="b-ores-splits">
      <p class="b-ores-splits-head"><span class="b-ores-eyebrow">splits</span><span class="b-ores-avg-key"><i aria-hidden="true"></i>your average</span><span class="b-ores-eyebrow b-ores-vs-head">vs avg</span></p>
      <div class="b-ores-splits-host"></div>
    </div>
    <div class="b-ores-session">
      <p class="b-ores-eyebrow">session</p>
      <div class="b-ores-session-row">
        <dl class="b-ores-avgs">
          <div><dt>ao5</dt><dd data-stat="ao5"></dd></div>
          <div><dt>ao12</dt><dd data-stat="ao12"></dd></div>
          <div><dt>pb</dt><dd data-stat="pb"></dd></div>
          <div><dt>mean</dt><dd data-stat="mean"></dd></div>
        </dl>
        <div class="b-ores-spark-host"></div>
      </div>
      <p class="b-ores-eyebrow">recent</p>
      <p class="b-ores-recent"></p>
      <p class="b-ores-eyebrow">coach</p>
      <ul class="b-ores-coach"></ul>
    </div>
  </section>`;

/** @type {import('../../types.js').ComponentFactory} */
export function createOrbitResults(host) {
  const root = document.createElement('div');
  root.className = 'b-ores is-hidden';
  root.innerHTML = TEMPLATE;   // one-time mount template
  host.append(root);
  const $ = sel => root.querySelector(sel);
  const tps = createTpsLine($('.b-ores-chart-host'), { variant: 'orbit' });
  const donut = createDonut($('.b-ores-donut-host'));
  const splits = createSplitBars($('.b-ores-splits-host'), { layout: 'rows' });
  const spark = createSparkline($('.b-ores-spark-host'));
  let key = null;

  function flyInFromRing() {
    const from = ringHandoff.rect;
    const el = donut.element;
    if (!from || Date.now() - ringHandoff.at > 3000 || !el.animate) return;
    const to = el.getBoundingClientRect();
    if (!to.width) return;
    const scale = from.height / Math.max(1, to.height) * 0.72;
    const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.4 },
      { transform: 'none', opacity: 1 },
    ], { duration: 500, easing: 'cubic-bezier(.22,1,.36,1)' });
    ringHandoff.rect = null;
  }

  return {
    update(vm, prev) {
      const r = vm.screen === 'results' ? vm.results : null;
      toggleClass(root, 'is-hidden', !r);
      if (!r) { key = null; return; }
      if (prev && prev.results === r && key === r.key) return;
      const fresh = key !== r.key;
      key = r.key;
      setText($('.b-ores-num'), r.time.text);
      setText($('.b-ores-penalty'), r.time.penalty ? ` ${r.time.penalty === 'DNF' ? 'DNF' : '+2'}` : '');
      $('.b-ores-big').className = `b-ores-big is-${r.time.tone}`;
      toggleClass($('.b-ores-unit'), 'is-hidden', r.time.penalty === 'DNF');
      setText($('.b-ores-moves'), r.moves);
      setText($('.b-ores-tps'), r.tps);
      setText($('.b-ores-insp'), r.inspection);
      setText($('.b-ores-vs'), r.vsAo12?.text ?? '—');
      $('.b-ores-vs').className = `b-ores-vs is-${r.vsAo12?.tone || 'none'}`;
      setText($('.b-ores-method'), r.method);
      const avg = r.tpsSeries?.avgFlat;
      setText($('.b-ores-avg-label'), avg != null ? `your avg ${avg.toFixed(2)}` : '');
      tps.update(r.tpsSeries, { drawIn: fresh });
      donut.update(r.donut);
      splits.update(r.splits);
      spark.update(r.spark);
      for (const k of ['ao5', 'ao12', 'pb', 'mean']) {
        const dd = root.querySelector(`[data-stat="${k}"]`);
        setText(dd, r.session[k]);
        dd.className = `is-${r.session.tones?.[k] || 'none'}`;
      }
      reconcileChildren($('.b-ores-recent'), r.recent.map(x => ({
        key: x.key, text: `${x.text}${x.penaltyTag}`,
        className: `b-ores-recent-item${x.current ? ' is-current' : ''}${x.penaltyTag ? ' is-penalty' : ''}`,
      })), 'span');
      renderCoach($('.b-ores-coach'), r.coach);
      if (fresh) {
        root.classList.remove('is-entering');
        void root.offsetWidth;
        root.classList.add('is-entering');
        requestAnimationFrame(flyInFromRing);
      }
    },
    destroy() { tps.destroy(); donut.destroy(); splits.destroy(); spark.destroy(); root.remove(); },
  };
}

function renderCoach(list, lines = []) {
  reconcileChildren(list, lines.map(l => ({ key: l.key, text: '', className: `b-ores-coach-line is-${l.tone}` })), 'li');
  lines.forEach((l, i) => {
    const li = list.children[i];
    const text = document.createElement('span');
    text.textContent = l.text;
    const parts = [text];
    if (l.alg) { const alg = document.createElement('code'); alg.textContent = l.alg; parts.push(alg); }
    li.replaceChildren(...parts);
    if (l.tag) li.dataset.tag = l.tag;
  });
}
