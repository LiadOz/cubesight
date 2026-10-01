// The results review panel, shared by Orbit and Mono: the coach card (the SELECTED marker's note,
// not a list), the marker chips (the few that matter big, the rest small, none dropped), and the
// detail view of a stage or marker (its moves, time, TPS and pauses against your average, its
// labels, "yours vs better" with a play button for each, and the pin). The cube itself is the
// shell's live cube: the controller puts it on the position this panel asks for.
import '../css/review.css';
import { setAttr, setText, toggleClass } from '../dom.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const button = (className, text, data = {}) => {
  const node = el('button', className, text);
  node.type = 'button';
  for (const [key, value] of Object.entries(data)) node.dataset[key] = String(value);
  return node;
};

const TEMPLATE = `
  <header class="b-rev-head">
    <span class="b-rev-eyebrow">coach</span>
    <span class="b-rev-hint"></span>
    <span class="b-rev-pins" title="Pinned moments open in their drill later">pinned · <b class="b-rev-pin-count">0</b></span>
  </header>
  <div class="b-rev-card" data-tone="info">
    <div class="b-rev-tagrow"><span class="b-rev-tag"></span><span class="b-rev-compare"></span></div>
    <p class="b-rev-note" aria-live="polite"></p>
    <div class="b-rev-actions">
      <span class="b-rev-better"></span>
      <button class="b-rev-open" type="button" data-act="open" hidden>show on the cube</button>
      <button class="b-rev-pin" type="button" data-act="pin" aria-pressed="false">pin</button>
    </div>
  </div>
  <ul class="b-rev-chips" aria-label="Moments in this solve"></ul>
  <section class="b-rev-detail" hidden aria-label="Stage detail">
    <div class="b-rev-dhead"><strong class="b-rev-dtitle"></strong><button class="b-rev-close" type="button" data-act="close" aria-label="Close detail"><span>close</span><kbd>esc</kbd></button></div>
    <div class="b-rev-dmoves" role="group" aria-label="Moves of this stage"></div>
    <dl class="b-rev-dstats"></dl>
    <ul class="b-rev-dlabels"></ul>
    <div class="b-rev-dcmp">
      <p class="b-rev-dcmp-text"></p>
      <div class="b-rev-variants">
        <button class="b-rev-variant" type="button" data-variant="yours">yours ▶</button>
        <button class="b-rev-variant" type="button" data-variant="better">better ▶</button>
        <button class="b-rev-pin b-rev-pin-detail" type="button" data-act="pin" aria-pressed="false">pin</button>
      </div>
      <p class="b-rev-alg b-rev-alg-yours"><span>yours</span><code></code></p>
      <p class="b-rev-alg b-rev-alg-better"><span>better</span><code></code></p>
    </div>
  </section>`;

/**
 * @param {HTMLElement} host
 * @param {{dispatch:(a:import('../types.js').BrainAction)=>void}} ctx
 */
export function createReviewPanel(host, { dispatch }) {
  const root = el('section', 'b-rev');
  root.setAttribute('aria-label', 'Solve review');
  root.innerHTML = TEMPLATE;   // one-time mount template
  host.append(root);
  const $ = selector => root.querySelector(selector);
  let shown = null;

  root.addEventListener('click', event => {
    const target = /** @type {HTMLElement} */ (event.target).closest('button');
    if (!target || !root.contains(target)) return;
    if (target.dataset.marker) dispatch({ type: 'selectMarker', id: target.dataset.marker });
    else if (target.dataset.at != null) dispatch({ type: 'jumpTo', at: Number(target.dataset.at) });
    else if (target.dataset.variant) dispatch({ type: 'playVariant', variant: target.dataset.variant });
    else if (target.dataset.act === 'close') dispatch({ type: 'closeDetail' });
    else if (target.dataset.act === 'pin') dispatch({ type: 'togglePin' });
    else if (target.dataset.act === 'open' && shown?.coach.markerId) dispatch({ type: 'selectMarker', id: shown.coach.markerId });
  });

  function renderChips(review) {
    const chips = review.markers.slice().sort((a, b) => a.tMs - b.tMs || a.rank - b.rank).map(m => {
      const chip = button(`b-rev-chip is-${m.tone}${m.prominent ? ' is-prominent' : ' is-small'}${m.selected ? ' is-selected' : ''}`, '', { marker: m.id });
      chip.append(el('i', 'b-rev-dot'), el('span', 'b-rev-chip-label', m.label));
      if (m.prominent) chip.append(el('span', 'b-rev-chip-cost', m.costText));
      setAttr(chip, 'aria-pressed', String(m.selected));
      setAttr(chip, 'title', `${m.stageLabel} · ${m.label} · ${m.costText}`);
      const li = el('li');
      li.append(chip);
      return li;
    });
    $('.b-rev-chips').replaceChildren(...chips);
  }

  function renderDetail(detail) {
    const box = $('.b-rev-detail');
    box.hidden = !detail;
    if (!detail) return;
    setText($('.b-rev-dtitle'), detail.title);
    const moves = [];
    if (detail.replayable) moves.push(button(`b-rev-mv is-start${detail.cursor === detail.from ? ' is-here' : ''}`, 'start', { at: detail.from }));
    for (const move of detail.moves) {
      const node = detail.replayable ? button('b-rev-mv', move.text, { at: move.at }) : el('span', 'b-rev-mv', move.text);
      for (const flag of move.flags) node.classList.add(`has-${flag}`);
      if (detail.cursor === move.at) node.classList.add('is-here');
      if (move.flags.length) setAttr(node, 'title', move.flags.join(' · '));
      moves.push(node);
    }
    $('.b-rev-dmoves').replaceChildren(...moves);
    const s = detail.stats;
    const stat = (key, value, sub, tone) => {
      const box = el('div');
      const dd = el('dd', null, value);
      if (tone) dd.dataset.tone = tone;
      box.append(el('dt', null, key), dd, el('dd', 'b-rev-sub', sub));
      return box;
    };
    $('.b-rev-dstats').replaceChildren(
      stat('time', s.time, s.delta ? `${s.delta} vs avg ${s.avgTime}` : s.avgTime !== '—' ? `avg ${s.avgTime}` : '', s.deltaTone),
      stat('moves', s.moves, s.avgMoves !== '—' ? `avg ${s.avgMoves}` : ''),
      stat('tps', s.tps, s.avgTps !== '—' ? `avg ${s.avgTps}` : ''),
      stat('pauses', s.pauses.startsWith('no ') ? 'none' : s.pauses.split(' · ')[0], s.pauses.startsWith('no ') ? '' : s.pauses.split(' · ').slice(1).join(' · ')),
    );
    $('.b-rev-dlabels').replaceChildren(...detail.labels.map(label => { const li = el('li', `b-rev-label is-${label.tone}`, label.text); return li; }));
    const cmp = detail.compare;
    setText($('.b-rev-dcmp-text'), cmp.text);
    $('.b-rev-dcmp').dataset.status = cmp.status;
    const better = cmp.status === 'better';
    for (const node of root.querySelectorAll('.b-rev-variant')) {
      const isBetter = node.dataset.variant === 'better';
      node.hidden = isBetter ? !better : !cmp.yours.length;
      toggleClass(node, 'is-active', detail.variant === node.dataset.variant);
      setAttr(node, 'aria-pressed', String(detail.variant === node.dataset.variant));
    }
    $('.b-rev-alg-yours').hidden = !cmp.yours.length;
    setText($('.b-rev-alg-yours code'), cmp.yoursText);
    $('.b-rev-alg-better').hidden = !better;
    setText($('.b-rev-alg-better code'), cmp.betterText);
  }

  return {
    update(review) {
      if (!review || review === shown) return;
      shown = review;
      setText($('.b-rev-hint'), review.status === 'pending' ? 'reviewing solve…' : '');
      setText($('.b-rev-pin-count'), String(review.pin.count));
      const card = $('.b-rev-card');
      card.dataset.tone = review.coach.tone;
      setText($('.b-rev-tag'), review.coach.tag);
      setText($('.b-rev-compare'), review.coach.compare ?? '');
      setText($('.b-rev-note'), review.coach.text);
      setText($('.b-rev-better'), review.coach.better ?? '');
      $('.b-rev-open').hidden = !review.coach.markerId || Boolean(review.detail && review.detail.key === review.coach.markerId);
      for (const node of root.querySelectorAll('.b-rev-pin')) {
        node.hidden = !review.pin.available || (node.classList.contains('b-rev-pin-detail') ? !review.detail : Boolean(review.detail));
        setText(node, review.pin.pinned ? 'pinned · unpin' : 'pin');
        setAttr(node, 'aria-pressed', String(review.pin.pinned));
        setAttr(node, 'title', review.pin.pinned ? 'unpin this moment' : review.pin.trainer ? `pin this moment; it opens in the ${review.pin.trainer} drill` : 'pin this moment');
      }
      renderChips(review);
      renderDetail(review.detail);
      toggleClass(root, 'has-detail', Boolean(review.detail));
    },
    destroy() { root.remove(); },
  };
}
