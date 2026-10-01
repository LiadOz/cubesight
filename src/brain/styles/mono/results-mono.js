// Mono results (design A-08): the time and headline stats on the left, turns
// per second over the solve against your average on the right, one column per
// split, then session stats with a sparkline, recent times and coach notes.

import { setText } from '../../dom.js';
import { createTpsLine } from '../../charts/tps-line.js';
import { createSplitBars } from '../../charts/split-bars.js';
import { createSparkline } from '../../charts/sparkline.js';
import { createReviewPanel } from '../../review/panel.js';

/** @typedef {import('../../types.js').BrainVM} BrainVM */
/** @typedef {import('../../types.js').ResultsVM} ResultsVM */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const TEMPLATE = `
  <div class="m-res-top">
    <div class="m-res-summary">
      <p class="b-label">time</p>
      <p class="m-res-time"><span class="m-res-time-text"></span><span class="m-res-penalty"></span></p>
      <dl class="m-res-facts">
        <div><dt>moves</dt><dd class="m-res-moves m-res-big"></dd></div>
        <div><dt>tps</dt><dd class="m-res-tps m-res-big"></dd></div>
        <div><dt>inspection</dt><dd class="m-res-insp"></dd></div>
        <div><dt>method</dt><dd class="m-res-method"></dd></div>
      </dl>
      <a class="m-res-full-review" hidden>Review solve →</a>
    </div>
    <figure class="m-res-chart">
      <figcaption><span class="b-label">tps</span><span class="m-legend"><i class="m-legend-this"></i>this solve<i class="m-legend-avg"></i>your avg</span></figcaption>
      <div class="m-res-chart-host"></div>
    </figure>
  </div>
  <section class="m-res-splits" aria-label="Splits">
    <header><span class="b-label">splits</span><span class="m-legend">* pseudo pair  |  = your average</span></header>
    <div class="m-res-splits-cols"></div>
    <div class="m-res-splits-rows"></div>
  </section>
  <section class="m-res-review" aria-label="Review"></section>
  <div class="m-res-bottom">
    <section class="m-res-session" aria-label="Session">
      <dl class="m-res-session-stats"></dl>
      <div class="m-res-spark"></div>
    </section>
    <section class="m-res-recent" aria-label="Recent solves"><p class="b-label">recent</p><ol></ol></section>
  </div>`;

/** @type {import('../../types.js').ComponentFactory} */
export function createMonoResults(host, ctx = {}) {
  const root = el('div', 'm-res');
  root.innerHTML = TEMPLATE;   // one-time mount
  host.append(root);
  const $ = selector => root.querySelector(selector);
  const select = (kind, key) => ctx.dispatch?.(kind === 'marker' ? { type: 'selectMarker', id: key } : { type: 'openDetail', kind: 'stage', key });
  const tps = createTpsLine($('.m-res-chart-host'), { variant: 'mono', onSelect: select });
  const cols = createSplitBars($('.m-res-splits-cols'), { layout: 'columns', onSelect: key => select('stage', key) });
  const rows = createSplitBars($('.m-res-splits-rows'), { layout: 'rows', onSelect: key => select('stage', key) });
  const review = createReviewPanel($('.m-res-review'), { dispatch: action => ctx.dispatch?.(action) });
  const spark = createSparkline($('.m-res-spark'));
  /** @type {ResultsVM|null} */
  let shown = null;

  function fill(results) {
    const fresh = results.key !== shown?.key;
    setText($('.m-res-time-text'), results.time.resultText);
    $('.m-res-time').dataset.tone = results.time.tone;
    const penalty = $('.m-res-penalty');
    setText(penalty, results.time.penalty ?? '');
    penalty.hidden = !results.time.penalty;
    setText($('.m-res-moves'), results.moves);
    setText($('.m-res-tps'), results.tps);
    setText($('.m-res-insp'), results.inspection);
    setText($('.m-res-method'), results.method);
    const fullReview = $('.m-res-full-review');
    fullReview.hidden = !Array.isArray(results.record?.solveMoves) || !results.record.solveMoves.length;
    fullReview.href = `#/review/${encodeURIComponent(results.record?.at ?? '')}`;
    if (fresh || results.tpsSeries !== shown?.tpsSeries || results.review !== shown?.review) tps.update(results.tpsSeries, { drawIn: fresh, markers: results.review.markers });
    if (fresh || results.splits !== shown?.splits) { cols.update(results.splits); rows.update(results.splits); }
    if (fresh || results.spark !== shown?.spark) spark.update(results.spark);

    const stats = [['ao5', results.session.ao5], ['ao12', results.session.ao12], ['pb', results.session.pb], ['mean', results.session.mean]];
    $('.m-res-session-stats').replaceChildren(...stats.map(([k, v]) => {
      const d = el('div');
      d.dataset.tone = results.session.tones[k] ?? 'none';
      d.append(el('dt', null, k), el('dd', null, v));
      return d;
    }));
    $('.m-res-recent ol').replaceChildren(...results.recent.map(r => {
      // The text already reads '14.97+' / 'DNF(13.20)'; the tag only colours it.
      return el('li', [r.current ? 'is-current' : '', r.penaltyTag ? 'is-penalty' : ''].filter(Boolean).join(' '), r.text);
    }));
    review.update(results.review);
    shown = results;
  }

  /** @param {BrainVM} vm */
  function update(vm) {
    root.hidden = !vm.results;
    if (vm.results && vm.results !== shown) fill(vm.results);
  }

  return {
    update,
    destroy() { tps.destroy(); cols.destroy(); rows.destroy(); spark.destroy(); review.destroy(); root.remove(); },
  };
}
