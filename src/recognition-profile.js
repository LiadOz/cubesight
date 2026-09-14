/* Recognition timing profile. Deliberately independent of the trainer UI. */
const validTiming = (item) => item && item.correct === true && !item.skipped && Number.isFinite(Number(item.ms)) && Number(item.ms) > 0 && Number(item.ms) < 10000;
const TARGET_NAMES = { UFL: 'Left corner (UFL)', UBR: 'Top-right corner (UBR)', DFR: 'Bottom-right corner (DFR)' };
const label = (value) => String(value || '').split(/[-_,]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' · ');
const ms = (value) => `${Math.round(Number(value))}ms`;
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (p === .5 && sorted.length % 2 === 0) return (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, index)];
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Normalize the timestamp formats used by current and older history records. */
export function timingTimestamp(item) {
  const value = item?.at ?? item?.timestamp ?? item?.createdAt;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8640000000000000) return value;
  if (typeof value === 'string' && value.trim()) { const parsed = Date.parse(value); return Number.isFinite(parsed) && parsed >= 0 && parsed <= 8640000000000000 ? parsed : null; }
  return null;
}
export function trendGroups(items, grouping = 'day') {
  if (grouping === 'attempt') return items.map((item, index) => ({
    key: `attempt-${index}`, firstTime: timingTimestamp(item), lastTime: timingTimestamp(item),
    items: [item], correct: Number(item.correct === true), total: 1, accuracy: Number(item.correct === true),
    median: validTiming(item) ? Number(item.ms) : null, p90: validTiming(item) ? Number(item.ms) : null,
    values: validTiming(item) ? [Number(item.ms)] : [],
  }));
  const sorted = items.map((item) => ({ item, time: timingTimestamp(item) })).filter((x) => x.time !== null).sort((a, b) => a.time - b.time);
  const groups = [];
  sorted.forEach(({ item, time }) => {
    let group = groups.at(-1);
    const date = new Date(time);
    const key = grouping === 'session' ? null : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (grouping === 'session' && (!group || time - group.lastTime > 30 * 60 * 1000)) group = null;
    if (grouping === 'day' && (!group || group.key !== key)) group = null;
    if (!group) { group = { key: grouping === 'session' ? `session-${time}` : key, firstTime: time, lastTime: time, items: [] }; groups.push(group); }
    group.items.push(item); group.lastTime = time;
  });
  return groups.map((group) => { const correct = group.items.filter((x) => x.correct === true); const values = correct.filter(validTiming).map((x) => Number(x.ms)); return { ...group, correct: correct.length, total: group.items.length, accuracy: group.items.length ? correct.length / group.items.length : 0, median: percentile(values, .5), p90: percentile(values, .9), values }; });
}
export function trendPeriod(items, period = 'all', now = Date.now()) {
  if (period === 'all') return items;
  const current = new Date(now); let start = now - ({ '7days': 7, '30days': 30 }[period] || 0) * 86400000;
  if (period === 'today') start = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  return items.filter((item) => { const time = timingTimestamp(item); return time !== null && time >= start && time <= now; });
}

/** A trailing mean follows recent changes instead of flattening them into one fitted line. */
export function rollingTrend(points, windowSize = 5) {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.value));
  return valid.map((point, index) => {
    const window = valid.slice(Math.max(0, index - Math.max(1, windowSize) + 1), index + 1);
    return { x: point.x, value: window.reduce((sum, item) => sum + item.value, 0) / window.length };
  });
}

export function timingCeiling(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1000;
  // With four or more samples, the slowest tail should not flatten the rest.
  const reference = sorted.length < 4 ? sorted.at(-1) : sorted[Math.floor((sorted.length - 1) * .9)];
  return Math.ceil(Math.max(100, reference * 1.15) / 100) * 100;
}
const trendDate = (time, grouping) => new Date(time).toLocaleString(undefined, {
  month: 'short', day: 'numeric', ...(grouping === 'session' ? { hour: 'numeric', minute: '2-digit' } : {}),
});

export function createRecognitionProfile(container) {
  if (!container) throw new TypeError('createRecognitionProfile requires a container');
  container.innerHTML = `<section class="recognition-profile" aria-label="Recognition timing profile">
    <div class="rp-head"><div><p class="eyebrow">Recognition profile</p><h2>Timing by piece</h2></div>
      <div class="rp-controls"><label>Piece <select class="rp-family" aria-label="Filter by corner piece"></select></label>
      <label>Drill <select class="rp-mode" aria-label="Filter by drill mode"><option value="all">All drills</option><option value="single">Single corner</option><option value="triple">Three corners</option><option value="recall">Recall · one glance, three answers</option></select></label>
      <label>View <select class="rp-view" aria-label="Filter by viewing mode"><option value="all">All views</option><option value="open">Open view</option><option value="glance">Glance</option></select></label></div></div>
    <div class="rp-summary" aria-live="polite"><div><span>Median</span><strong class="rp-median">—</strong></div><div><span>90th percentile</span><strong class="rp-p90">—</strong></div><div><span>Correct samples</span><strong class="rp-count">0</strong></div></div>
    <section class="rp-trend" aria-label="Recognition time trend">
      <div class="rp-trend-head"><p class="rp-muted">Response time (Y) · attempt number (X). Includes key / click input.</p>
        <div class="rp-trend-controls"><label>Period <select class="rp-period" aria-label="Filter trend period"><option value="all">All history</option><option value="today">Today</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option></select></label>
          <label>X-axis <select class="rp-group" aria-label="Group trend by"><option value="attempt">Attempt</option><option value="day">Day</option><option value="session">Session</option></select></label>
          <button type="button" class="rp-entry-toggle" aria-pressed="false">Show entries</button>
        </div>
      </div>
      <div class="rp-trend-chart-wrap"><svg class="rp-trend-chart" role="img" aria-label="Recognition timing trend by piece" viewBox="0 0 760 250"></svg><p class="rp-trend-empty" hidden></p></div>
      <p class="rp-trend-readout" aria-live="polite">Select a point to inspect its timing.</p>
      <p class="rp-trend-note"></p>
      <details class="rp-time-breakdown"><summary>Timing details</summary><div class="rp-trend-rows"></div></details>
    </section>
    <div class="rp-details"><div class="rp-problems"><h3>Problem breakdown</h3><p class="rp-note"></p><div class="rp-rows"></div></div><div class="rp-profile"><h3>Timing profile</h3><p class="rp-muted">Correct answers per time range</p><div class="rp-bars"></div></div></div>
  </section>`;
  const familySelect = container.querySelector('.rp-family');
  const modeSelect = container.querySelector('.rp-mode');
  const viewSelect = container.querySelector('.rp-view');
  const trendChart = container.querySelector('.rp-trend-chart');
  let currentStats = {};
  let selectedFamily = 'all';
  let trendSamples = [];
  let showEntries = false;

  function selectFamily(value) { selectedFamily = value || 'all'; familySelect.value = selectedFamily; render(); }
  function render() {
    const history = Array.isArray(currentStats.history) ? currentStats.history : [];
    const families = [...new Set(history.map((x) => x?.family).filter(Boolean))].sort();
    const previous = selectedFamily;
    familySelect.innerHTML = `<option value="all">All pieces</option>${families.map((f) => `<option value="${esc(f)}">${esc(label(f))}</option>`).join('')}`;
    selectedFamily = families.includes(previous) || previous === 'all' ? previous : 'all';
    familySelect.value = selectedFamily;
    const mode = modeSelect.value;
    const matching = history.filter((item) => item && (selectedFamily === 'all' || item.family === selectedFamily) && (mode === 'all' || item.mode === mode) && (viewSelect.value === 'all' || item.glance === (viewSelect.value === 'glance')));
    const scoped = trendPeriod(matching, container.querySelector('.rp-period').value);
    const samples = scoped.filter(validTiming);
    const values = samples.map((x) => Number(x.ms));
    container.querySelector('.rp-median').textContent = percentile(values, .5) === null ? '—' : ms(percentile(values, .5));
    container.querySelector('.rp-p90').textContent = percentile(values, .9) === null ? '—' : ms(percentile(values, .9));
    container.querySelector('.rp-count').textContent = String(values.length);
    renderTrend(scoped);
    renderProblems(scoped, samples, mode);
  }
  function renderTrend(scoped) {
    trendSamples = scoped;
    const period = container.querySelector('.rp-period').value, grouping = container.querySelector('.rp-group').value;
    const dated = scoped.filter((item) => timingTimestamp(item) !== null), filtered = trendPeriod(grouping === 'attempt' ? scoped : dated, period);
    const groups = trendGroups(filtered, grouping), values = groups.flatMap((g) => g.values), missing = scoped.length - dated.length;
    const note = container.querySelector('.rp-trend-note');
    const groupName = grouping === 'attempt' ? 'attempt' : grouping === 'day' ? 'day' : 'session';
    const groupLabel = (group, index) => grouping === 'attempt' ? `Attempt ${index + 1}` : trendDate(group.firstTime, grouping);
    const axisLabel = (group, index) => grouping === 'attempt' ? String(index + 1) : trendDate(group.firstTime, grouping);
    container.querySelector('.rp-trend-head > .rp-muted').textContent = grouping === 'attempt'
      ? `Response time (Y) · attempt number (X). Gold is the rolling 5-result trend${showEntries ? '; dots are exact entries' : ''}.`
      : `Median response time (Y) · ${groupName} (X).${showEntries ? ' Dots include exact entries.' : ''}`;
    note.textContent = `${groups.length} ${groupName}${groups.length === 1 ? '' : 's'} · Timing excludes wrong, skipped, and ≥10s responses.${missing ? ` ${missing} record${missing === 1 ? '' : 's'} lack a usable date${grouping === 'attempt' ? '' : ' and cannot appear here'}.` : ''}`;
    if (grouping === 'attempt') note.textContent += ' Attempts are numbered within your selected filters; errors keep their attempt number but have no timing point.';
    note.textContent += ' Lower is faster. Based on retained history, not your entire training history.';
    if (grouping === 'session') note.textContent += ' Sessions are inferred from gaps over 30 minutes between matching attempts.';
    container.querySelector('.rp-trend-readout').textContent = showEntries
      ? 'Hover, tap or focus an entry for its exact timing.'
      : 'Trend only. Use “Show entries” to inspect individual results.';
    container.querySelector('.rp-trend-empty').hidden = groups.length > 0;
    if (!groups.length) { trendChart.innerHTML = ''; container.querySelector('.rp-trend-empty').textContent = 'No attempts for this selection.'; }
    else {
      const max = timingCeiling(values);
      const width = Math.max(280, trendChart.clientWidth || 760), height = 250, pad = { l: 58, r: 14, t: 18, b: 42 }, plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;
      trendChart.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const datedTimes = filtered.map(timingTimestamp), firstTime = Math.min(...datedTimes), lastTime = Math.max(...datedTimes), span = lastTime - firstTime;
      const xAt = (time) => pad.l + (span === 0 ? .5 : (time - firstTime) / span) * plotW;
      const points = groups.map((g, index) => ({
        x: grouping === 'attempt' ? pad.l + (groups.length === 1 ? .5 : index / (groups.length - 1)) * plotW : xAt(g.firstTime),
        y: g.median === null ? null : pad.t + plotH - Math.min(g.median, max) / max * plotH,
        g, index,
      }));
      const rolling = rollingTrend(points.filter((point) => point.y !== null).map((point) => ({ x: point.x, value: Math.min(point.g.median, max) })));
      const trendY = (value) => pad.t + plotH - Math.max(0, Math.min(max, value)) / max * plotH;
      const labelIndexes = [0];
      for (let i = 1; i < points.length; i++) {
        if (points[i].x - points[labelIndexes.at(-1)].x >= (grouping === 'session' ? 150 : 85)) labelIndexes.push(i);
      }
      trendChart.innerHTML = `<title>Recognition timing trend</title>
        ${[0, max / 2, max].map((t) => {
          const y = pad.t + plotH - t / max * plotH;
          return `<line class="rp-grid" x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}"/><text x="${pad.l - 7}" y="${y + 4}" text-anchor="end">${esc(ms(t))}</text>`;
        }).join('')}
        <line class="rp-axis" x1="${pad.l}" x2="${width - pad.r}" y1="${pad.t + plotH}" y2="${pad.t + plotH}"/>
        ${rolling.length > 1 ? `<polyline class="rp-rolling-line" points="${rolling.map((point) => `${point.x},${trendY(point.value)}`).join(' ')}"/>` : ''}
        ${showEntries && grouping !== 'attempt' ? filtered.filter(validTiming).map((item, index) => `<circle class="rp-entry-point" tabindex="0" data-entry-index="${index}" cx="${xAt(timingTimestamp(item))}" cy="${trendY(Number(item.ms))}" r="4"><title>${esc(ms(item.ms))}</title></circle>`).join('') : ''}
        ${showEntries ? points.filter((point) => point.y !== null).map((point) => `<circle class="rp-trend-point" tabindex="0" data-trend-key="${esc(point.g.key)}" cx="${point.x}" cy="${point.y}" r="6"><title>${esc(trendDate(point.g.firstTime, grouping))}: median ${esc(ms(point.g.median))}</title></circle>`).join('') : ''}
        ${labelIndexes.map((i) => `<text class="rp-axis-label" x="${points[i].x}" y="${height - 13}" text-anchor="middle">${esc(axisLabel(points[i].g, i))}</text>`).join('')}`;
      if (values.some((value) => value > max)) note.textContent += ` The chart ceiling is ${max} ms so unusually slow results do not flatten the useful range; tap a top-edge dot for its exact time.`;
      if (rolling.length > 1) {
        const change = Math.round(Math.abs(rolling.at(-1).value - rolling[0].value));
        note.textContent += ` Rolling trend ends roughly ${change} ms ${rolling.at(-1).value <= rolling[0].value ? 'faster' : 'slower'} than it starts.`;
      } else note.textContent += ' Complete at least two timed attempts to draw a trend line.';
      trendChart.querySelectorAll('.rp-axis-label').forEach((text) => {
        if (+text.getAttribute('x') > width - 80) text.setAttribute('text-anchor', 'end');
        else if (+text.getAttribute('x') < pad.l + 40) text.setAttribute('text-anchor', 'start');
      });
      trendChart.querySelectorAll('.rp-trend-point').forEach((point) => {
        const group = groups.find((item) => item.key === point.dataset.trendKey);
        const description = grouping === 'attempt'
          ? `${groupLabel(group, groups.indexOf(group))}: ${ms(group.median)} · ${label(group.items[0].family)}${group.firstTime === null ? ' · date unavailable' : ` · ${trendDate(group.firstTime, 'session')}`}`
          : `${groupLabel(group, groups.indexOf(group))}: ${group.correct}/${group.total} correct · ${Math.round(group.accuracy * 100)}% accuracy · median ${ms(group.median)}, p90 ${ms(group.p90)}${group.values.length < 10 ? ' · Small sample' : ''}`;
        point.setAttribute('aria-label', description);
        point.querySelector('title').textContent = description;
        const show = () => { container.querySelector('.rp-trend-readout').textContent = description; };
        point.addEventListener('pointerenter', show);
        point.addEventListener('click', show);
        point.addEventListener('focus', show);
      });
      const exactEntries = filtered.filter(validTiming);
      trendChart.querySelectorAll('.rp-entry-point').forEach((point) => {
        const item = exactEntries[Number(point.dataset.entryIndex)];
        const description = `${ms(item.ms)} · ${label(item.family)} · ${trendDate(timingTimestamp(item), 'session')}`;
        point.setAttribute('aria-label', description);
        point.querySelector('title').textContent = description;
        const show = () => { container.querySelector('.rp-trend-readout').textContent = description; };
        point.addEventListener('pointerenter', show);
        point.addEventListener('click', show);
        point.addEventListener('focus', show);
      });
    }
    container.querySelector('.rp-trend-rows').innerHTML = groups.map((g, index) => `<div class="rp-trend-row"><strong>${esc(groupLabel(g, index))}</strong><span>${g.correct}/${g.total} · ${Math.round(g.accuracy * 100)}% accuracy</span><span>${g.median === null ? 'no timing' : grouping === 'attempt' ? ms(g.median) : `median ${ms(g.median)} · p90 ${ms(g.p90)}`}</span></div>`).join('');
  }
  function renderProblems(scoped, samples, mode) {
    const withMeta = scoped.filter((x) => x?.target || x?.visible || x?.missing);
    const correct = scoped.filter((x) => x.correct === true).length;
    const skipped = scoped.filter((x) => x.skipped === true).length;
    const note = container.querySelector('.rp-note');
    note.textContent = `${correct}/${scoped.length || 0} correct${skipped ? ` · ${skipped} skipped` : ''}${withMeta.length < scoped.length ? ` · ${scoped.length - withMeta.length} older record${scoped.length - withMeta.length === 1 ? '' : 's'} lack piece detail` : ''}${samples.length < 10 ? ' · Small sample' : ''}. Retained history only (last 1000).${mode === 'triple' ? ' Three-corner timing includes feedback-to-next-corner time.' : ''}`;
    if (mode === 'all' && scoped.some((item) => item.mode === 'triple')) note.textContent += ' Mixed drills: later three-corner times include feedback after the previous answer. Filter drills for a fair comparison.';
    if (mode === 'recall') note.textContent += ' Recall: the first answer includes the initial glance; later answers use input-to-input timing.';
    if (viewSelect.value === 'glance') note.textContent += ' Glance durations may differ between trials.';
    const groups = new Map();
    withMeta.forEach((item) => { const key = `${item.target || 'unknown'}|${(item.visible || []).join(',')}|${item.missing || ''}`; const g = groups.get(key) || { item, total: 0, correct: 0, times: [], wrong: {} }; g.total++; if (item.correct === true) g.correct++; if (validTiming(item)) g.times.push(Number(item.ms)); if (item.selected && item.selected !== item.missing) g.wrong[item.selected] = (g.wrong[item.selected] || 0) + 1; groups.set(key, g); });
    const ranked = [...groups.values()].sort((a, b) => (a.correct / a.total - b.correct / b.total) || ((percentile(b.times, .5) || 0) - (percentile(a.times, .5) || 0))).slice(0, 8);
    container.querySelector('.rp-rows').innerHTML = ranked.length ? ranked.map((g) => `
      <div class="rp-row">
        <div><strong>${esc(TARGET_NAMES[g.item.target] || g.item.target || 'Unlabelled target')}</strong>
          <small>${g.item.visible?.length ? `Saw ${esc(g.item.visible.join(' · '))}` : 'Visible colors not recorded'}${g.item.missing ? ` · Missing ${esc(g.item.missing)}` : ''}</small>
        </div>
        <span>${Math.round(g.correct / g.total * 100)}% · ${g.times.length ? `median ${ms(percentile(g.times, .5))}` : 'no timing'}</span>
        <small>${Object.keys(g.wrong).length ? `Confusions: ${Object.entries(g.wrong).map(([k, v]) => `${esc(k)} (${v})`).join(', ')} · ` : ''}${g.total} attempt${g.total === 1 ? '' : 's'}${g.total < 10 ? ' · Small sample' : ''}</small>
      </div>`).join('') : '<p class="rp-muted">Detailed piece problems appear after you complete new trials.</p>';
    if (groups.size > 8) note.textContent += ` Showing 8 of ${groups.size} patterns, lowest accuracy then slowest median first.`;
    const vals = samples.map((x) => Number(x.ms));
    const bucketMax = Math.max(...vals, 1), bucketSize = Math.max(100, Math.ceil(bucketMax / 5 / 100) * 100), buckets = Array.from({ length: 5 }, (_, i) => vals.filter((v) => v >= i * bucketSize && (i === 4 ? v <= (i + 1) * bucketSize : v < (i + 1) * bucketSize)).length), tallest = Math.max(...buckets, 1);
    const bars = samples.length ? buckets.map((count, i) => `<div class="rp-bar"><span>${i * bucketSize}–${(i + 1) * bucketSize}ms</span><i><b style="width:${Math.max(count ? 4 : 0, count / tallest * 100)}%"></b></i><strong>${count}</strong></div>`).join('') : '<p class="rp-muted">Timing distribution will appear here.</p>';
    container.querySelector('.rp-bars').innerHTML = bars;
  }
  familySelect.addEventListener('change', () => { selectedFamily = familySelect.value; render(); });
  modeSelect.addEventListener('change', render);
  viewSelect.addEventListener('change', render);
  ['.rp-period', '.rp-group'].forEach((selector) => container.querySelector(selector).addEventListener('change', render));
  container.querySelector('.rp-entry-toggle').addEventListener('click', (event) => {
    showEntries = !showEntries;
    event.currentTarget.setAttribute('aria-pressed', String(showEntries));
    event.currentTarget.textContent = showEntries ? 'Hide entries' : 'Show entries';
    render();
  });
  const resizeObserver = new ResizeObserver(() => renderTrend(trendSamples));
  resizeObserver.observe(trendChart);
  return { update(stats) { currentStats = stats || {}; render(); }, selectFamily };
}

export default createRecognitionProfile;
