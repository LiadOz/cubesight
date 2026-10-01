import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildViewModel, frameState, screenFor, phaseText, deviceFor, brainDetail, inspectionLayout, inspectionState } from '../src/brain/view-model.js';
import { brainFixtures, FIXTURE_NAMES, EXAMPLE_RECORD } from '../src/brain/fixtures.js';
import { coachLines, resultsCoach } from '../src/brain/coach-lines.js';
import { normalizeSettings } from '../src/brain/settings.js';
import { DEFAULT_INSPECTION } from '../src/solve-live.js';

const tracking = { phase: 'tracking', detail: 'Live cube updated.', deviceName: 'GAN', protocol: 'GAN Gen4', gyro: null };

test('screens for every session and live phase', () => {
  assert.equal(screenFor({ phase: 'disconnected' }, { phase: 'idle' }), 'disconnected');
  assert.equal(screenFor({ phase: 'connecting' }, { phase: 'idle' }), 'connecting');
  assert.equal(screenFor({ phase: 'awaiting-solved' }, { phase: 'idle' }), 'connecting');
  assert.equal(screenFor(tracking, { phase: 'idle' }), 'idle');
  assert.equal(screenFor(tracking, { phase: 'applying' }), 'scramble');
  assert.equal(screenFor(tracking, { phase: 'inspecting' }), 'inspection');
  assert.equal(screenFor(tracking, { phase: 'ready' }), 'ready');
  assert.equal(screenFor(tracking, { phase: 'solving' }), 'solving');
  assert.equal(screenFor(tracking, { phase: 'done' }), 'results');
  assert.equal(screenFor({ phase: 'disconnected' }, { phase: 'done' }), 'results', 'a finished (or replayed) solve stays on screen');
  assert.equal(screenFor({ phase: 'desynced' }, { phase: 'solving' }), 'desynced');
  assert.equal(screenFor(tracking, { phase: 'desynced' }), 'desynced');
});

test('phase text follows the shared stage words and time format', () => {
  assert.deepEqual(phaseText({ phase: 'idle' }), { label: 'connect cube', detail: 'Cross follows the first face you solve.' });
  assert.deepEqual(phaseText({ phase: 'applying', applyStep: 2, applyTotal: 13 }), { label: 'apply scramble', detail: 'Scramble move 3 of 13.' });
  assert.deepEqual(phaseText({ phase: 'inspecting', inspection: { remainingMs: 6340 } }), { label: 'inspection', detail: 'Inspection · 6.3 s left. Clock starts on your first move.' });
  assert.equal(phaseText({ phase: 'inspecting', inspection: { remainingMs: null } }).detail, 'Inspection. Clock starts on your first move.');
  assert.equal(phaseText({ phase: 'ready' }).label, 'start');
  assert.deepEqual(phaseText({ phase: 'solving', solveMoveCount: 6, elapsedMs: 2000, progress: { phase: 'cross', crossDone: true, pairsSolved: 0 } }),
    { label: 'F2L', detail: '6 moves · 3.00 TPS · 2.00 s · 0/4 pairs' });
  assert.equal(phaseText({ phase: 'solving', solveMoveCount: 1, elapsedMs: 0, progress: { phase: 'pre-cross' } }).detail, '1 move · 0.00 TPS · 0.00 s');
  assert.equal(phaseText({ phase: 'solving', progress: { phase: 'co-pending', f2lDone: true } }).label, 'CO');
  assert.deepEqual(phaseText({ phase: 'done', record: { moveCount: 40, solveMs: 10000 }, progress: { f2lDone: true } }), { label: 'solved', detail: '40 moves · 4.00 TPS · 10.00 s · 4/4' });
});

test('device view: actions, gyro and unsupported browsers', () => {
  const d = deviceFor({ ...tracking, gyro: { x: 0, y: 0, z: 0, w: 1 }, battery: 84 });
  assert.equal(d.phase, 'tracking');
  assert.equal(d.gyro, true);
  assert.deepEqual(d.actions, { connect: false, sync: true, recenter: true, disconnect: true, clearSaved: false, reconnect: false, resume: false });
  assert.match(d.detail, /tap recenter/);
  const off = deviceFor({ phase: 'disconnected', detail: 'x' }, false);
  assert.equal(off.actions.connect, true, 'connect stays offered; trying it explains what is missing');
  assert.equal(off.supported, false);
  assert.match(off.detail, /Web Bluetooth needs/);
  assert.equal(deviceFor({ phase: 'awaiting-solved', detail: '' }).phase, 'syncing');
});

test('inspection layouts for every overtime rule', () => {
  const layout = patch => inspectionLayout({ ...DEFAULT_INSPECTION, ...patch });
  const wca = layout({});
  assert.equal(wca.scaleMs, 17000);
  assert.deepEqual(wca.zones.map(z => [z.kind, z.fromMs, z.toMs]), [['normal', 0, 15000], ['plus2', 15000, 17000], ['dnf', 17000, null]]);
  assert.deepEqual(wca.ticks.map(t => [t.label, t.kind, t.atMs]), [['8s', 'callout', 8000], ['12s', 'callout', 12000], ['', 'limit', 15000]]);
  assert.deepEqual(layout({ callouts: false }).ticks.map(t => t.kind), ['limit']);
  const count = layout({ overtime: 'count' });
  assert.deepEqual(count.zones.map(z => [z.kind, z.toMs]), [['normal', 15000], ['count', null]]);
  assert.deepEqual(count.ticks.filter(t => t.kind === 'count').map(t => t.label), ['+1', '+2', '+3']);
  const grace = layout({ mode: 'custom', seconds: 10, overtime: 'grace', graceSeconds: 3, gracePenalty: 'dnf' });
  assert.deepEqual(grace.zones.map(z => [z.kind, z.fromMs, z.toMs]), [['normal', 0, 10000], ['grace', 10000, 13000], ['dnf', 13000, null]]);
  assert.deepEqual(grace.ticks.map(t => t.kind), ['limit'], 'no callouts under a 12 s limit');
  assert.deepEqual(layout({ overtime: 'grace', gracePenalty: 'plus2' }).zones.map(z => [z.kind, z.toMs]).slice(-1), [['plus2', 19000]]);
  assert.deepEqual(layout({ overtime: 'grace', gracePenalty: 'none' }).zones.map(z => z.kind), ['normal', 'grace']);
  assert.equal(layout({ overtime: 'autostart' }).scaleMs, 17000);
  assert.deepEqual(layout({ mode: 'unlimited' }), { limitMs: null, scaleMs: 60000, zones: [], ticks: [] });
});

test('inspection state at the WCA boundaries', () => {
  const at = ms => inspectionState({ ...DEFAULT_INSPECTION }, ms);
  assert.equal(at(8700).bigText, '7');
  assert.equal(at(8700).callout, 8);
  assert.equal(at(8700).penalty, null);
  assert.equal(at(15000).penalty, null, 'exactly 15 s is fine');
  assert.equal(at(15800).bigText, '+1');
  assert.equal(at(15800).penalty, '+2');
  assert.equal(at(15800).tone, 'warn');
  assert.match(at(15800).consequence, /\+2 penalty · dnf in 1\.2 s/);
  assert.equal(at(17001).penalty, 'DNF');
  assert.equal(at(17001).tone, 'error');
  assert.equal(at(8500).caret, 0.5);
  const count = inspectionState({ ...DEFAULT_INSPECTION, overtime: 'count' }, 17200);
  assert.equal(count.penalty, null);
  assert.equal(count.bigText, '+2', 'whole seconds over');
  assert.equal(inspectionState({ ...DEFAULT_INSPECTION, mode: 'unlimited' }, 61000).bigText, '1:01');
  assert.equal(inspectionState({ ...DEFAULT_INSPECTION, overtime: 'grace' }, 16300).bigText, '+1.3');
  assert.equal(inspectionState({ ...DEFAULT_INSPECTION, overtime: 'grace' }, 16300).tone, 'accent', 'grace time is not a warning yet');
  assert.equal(inspectionState({ ...DEFAULT_INSPECTION, mode: 'custom', seconds: 10, overtime: 'grace', graceSeconds: 2, gracePenalty: 'none' }, 13000).penalty, null);
});

test('inspection shows the proven best cross and only a proven X-cross opportunity', () => {
  const live = { phase: 'inspecting', inspection: { elapsedMs: 1000 }, inspectionConfig: { ...DEFAULT_INSPECTION } };
  const base = { session: tracking, live, records: [], settings: normalizeSettings(), now: 1000 };
  const proven = buildViewModel({ ...base, optimalCross: { face: 'D', length: 6, proven: true,
    best: { face: 'D', length: 6, proven: true }, bestXcross: { face: 'F', length: 8, proven: true } } });
  assert.equal(proven.inspection.bestStart, 'best cross: yellow, 6 · x-cross possible in 8');
  const partial = buildViewModel({ ...base, optimalCross: { face: 'D', length: 6, proven: false,
    best: { face: 'D', length: 6, proven: false }, bestXcross: { face: 'F', length: 8, proven: false } } });
  assert.equal(partial.inspection.bestStart, 'cross found so far: yellow, 6');
});

test('every fixture builds, in both styles', () => {
  for (const style of ['orbit', 'mono']) {
    const fixtures = brainFixtures({ style, theme: 'light' });
    assert.deepEqual(Object.keys(fixtures), FIXTURE_NAMES);
    for (const [name, vm] of Object.entries(fixtures)) {
      assert.equal(vm.style, style, name);
      assert.equal(vm.theme, 'light', name);
      assert.ok(vm.phaseText.label, name);
      assert.ok(Array.isArray(vm.keys), name);
    }
  }
  const f = brainFixtures();
  assert.ok(FIXTURE_NAMES.length >= 40);
  assert.equal(f['inspection:off/wca/early'].screen, 'ready');
  assert.equal(f['inspection:wca/wca/over'].inspection.penalty, '+2');
  assert.equal(f['inspection:custom/grace/over'].inspection.consequence, 'starting now = +2');
  assert.equal(f.settings.settings.open, true);
  assert.equal(f.desynced.screen, 'desynced');
});

test('solving fixture: the design’s pair-3 moment', () => {
  const vm = brainFixtures().solving;
  assert.equal(vm.screen, 'solving');
  assert.equal(vm.clock.text, '6.91');
  assert.equal(vm.clock.running, true);
  assert.deepEqual(vm.clock.stepLine.map(s => s.text), ['f2l', 'pair 3', 'pseudo']);
  assert.equal(vm.clock.stepTitle, 'Pair 3');
  const t = vm.timeline;
  assert.equal(t.currentIndex, 3);
  assert.deepEqual(t.segments.map(s => s.state), ['done', 'done', 'done', 'current', 'future', 'future', 'future', 'future', 'future']);
  assert.equal(t.segments[0].splitText, '2.08');
  assert.equal(t.segments[0].delta.tone, 'faster');
  assert.ok(Math.abs(t.segments.reduce((s, x) => s + x.weight, 0) - 1) < 1e-9, 'weights sum to 1');
  assert.equal(t.insp.text, 'insp 8.7');
  assert.equal(vm.chromeDimmed, true);
  // The frame refines the clock and the current fill between emits.
  const frame = frameState(vm, 1_000_000 + 7910);
  assert.equal(frame.clockText, '7.91');
  assert.equal(frame.currentSplitText, '2.16');
  assert.ok(frame.currentFill > t.segments[3].fill);
});

test('skip fixture marks the EO skip as fresh exactly once', () => {
  const f = brainFixtures();
  const eo = f.skip.timeline.segments.find(s => s.key === 'eo');
  assert.equal(eo.state, 'skipped');
  assert.deepEqual(eo.skip, { label: 'eo skip', fresh: true });
  assert.equal(f.skip.clock.stepTitle, 'CO');
  assert.equal(f.skip.toast.text, '✦ eo skip');
});

test('results fixture: time, splits, charts, history with penalties, coach', () => {
  const f = brainFixtures();
  const r = f.results.results;
  assert.equal(f.results.screen, 'results');
  assert.deepEqual(r.time, { text: '14.07', resultText: '14.07', penalty: null, tone: 'accent' });
  assert.equal(r.moves, '68');
  assert.equal(r.tps, '4.83');
  assert.equal(r.inspection, '8.70');
  assert.equal(r.method, 'cfop · 2-look · pseudo');
  assert.equal(r.splits.length, 9);
  assert.equal(r.splits.find(s => s.key === 'eo').text, 'skip');
  assert.ok(r.recent.some(x => x.text === '14.97+'));
  assert.ok(r.spark.points.some(p => p.kind === 'dnf'));
  assert.equal(r.spark.points[r.spark.points.length - 1].kind, 'current');
  assert.equal(r.session.pb, '12.41');
  assert.ok(r.tpsSeries.points.length > 100);
  assert.ok(r.tpsSeries.marks.some(m => m.kind === 'pause'));
  assert.ok(r.coach.some(c => c.tag === 'cross'));
  assert.ok(r.coach.some(c => c.tag === 'eo skip'));
  assert.equal(f.results.clock.text, '14.07');
  assert.equal(f.resultsPlus2.results.time.text, '16.07');
  assert.equal(f.resultsPlus2.results.time.resultText, '14.07 +2');
  assert.equal(f.resultsDnf.results.time.text, 'DNF');
  assert.equal(f.resultsDnf.clock.tone, 'error');
});

test('penalties can be ignored by setting; stored penalties win over the live record', () => {
  const settings = normalizeSettings({ penalties: 'ignore' });
  const records = [{ ...EXAMPLE_RECORD, penalty: '+2' }];
  const live = { phase: 'done', record: EXAMPLE_RECORD, progress: { solved: true } };
  const vm = buildViewModel({ session: tracking, live, records, settings, now: 0 });
  assert.equal(vm.results.time.penalty, null);
  const applied = buildViewModel({ session: tracking, live, records, settings: normalizeSettings(), now: 0 });
  assert.equal(applied.results.time.penalty, '+2');
});

test('unchanged slices keep their identity between builds', () => {
  const settings = normalizeSettings();
  const input = { session: tracking, live: { phase: 'idle', progress: null }, records: [], settings, now: 0, coach: [{ key: 'a', tone: 'muted', text: 'x' }] };
  const a = buildViewModel(input);
  const b = buildViewModel({ ...input, coach: [{ key: 'a', tone: 'muted', text: 'x' }] }, a);
  assert.equal(b.rev, a.rev + 1);
  for (const key of ['device', 'configBar', 'settings', 'stats', 'keys', 'timeline', 'clock', 'coach', 'phaseText']) assert.equal(b[key], a[key], key);
  const c = buildViewModel({ ...input, settings: { ...settings, style: 'mono' } }, b);
  assert.notEqual(c.configBar, b.configBar);
  assert.equal(c.style, 'mono');
});

test('solve stats separate manual solves until stats source is set to all', () => {
  const records = [
    { at: 1, source: 'manual', focus: 'speed', solved: true, solveMs: 11_000, moveCount: 0, solveMoves: [] },
    { at: 2, focus: 'speed', solved: true, solveMs: 12_000, moveCount: 50, solveMoves: ['R'] },
  ];
  const input = { session: tracking, live: { phase: 'idle', progress: null }, records, now: 0 };
  const smart = buildViewModel({ ...input, settings: normalizeSettings() });
  assert.equal(smart.stats.solves, '1');
  const all = buildViewModel({ ...input, settings: normalizeSettings({ stats: { source: 'all' } }) });
  assert.equal(all.stats.solves, '2');
});

test('coach lines port the v1 texts and keys', () => {
  const lenses = {
    crossHindsight: (n, opt) => ({ kind: n > opt ? 'long' : 'optimal', text: `cross ${n} vs ${opt}` }),
    f2lNextPairHint: () => ({ text: 'hint' }),
    ollStage: () => ({ eoDone: true }),
    pllLens: () => ({ name: 'T', family: 'adjacent', cue: 'headlights' }),
    efficiencyScore: () => 88,
    faceColors: { D: 'yellow' },
  };
  const toggles = { crossSuggest: true, crossHindsight: true, f2lHint: true, ollStage: true, pllLens: true, rotationFlag: true, efficiencyScore: true };
  const live = { phase: 'solving', crossFace: 'D', crossMoveCount: 8, rotations: 3, progress: { crossDone: true, f2lDone: false } };
  const lines = coachLines({ live, state: {}, toggles, optimalCross: { face: 'D', length: 6 } }, lenses);
  assert.deepEqual(lines.map(l => l.text), [
    'Suggested cross: yellow, 6 moves', 'cross 8 vs 6', 'hint',
    '3 rotations this solve. Fewer often saves time.', 'efficiency 88',
  ]);
  assert.deepEqual(lines.slice(-2).map(l => l.key), ['rotations', 'efficiency']);
  assert.equal(lines[1].tone, 'warn');
  assert.equal(coachLines({ live: { phase: 'applying' }, toggles }, lenses)[0].text, 'Follow the scramble. A wrong turn shows the way back.');
  assert.deepEqual(coachLines({ live: { phase: 'idle' }, toggles }, lenses), [{ key: 'empty', tone: 'muted', text: 'Coach insights appear here as you solve.' }]);
  assert.deepEqual(coachLines({ live, state: {}, toggles, coach: 'off' }, lenses).map(l => l.key), ['off']);
  assert.equal(coachLines({ live, state: {}, toggles, coach: 'after' }, lenses)[0].key, 'empty', 'after-solve coach stays quiet while solving');
  const results = resultsCoach({ record: { crossMoveCount: 8, rotations: 1, xcross: 'xcross' }, optimalCross: { face: 'D', length: 6 }, faceColors: { D: 'yellow' } });
  assert.deepEqual(results.map(r => r.tag), ['xcross'], 'X-cross solve is not compared with the plain-cross minimum');
});

test('live X-cross suppresses plain-cross hindsight and passes no mismatched efficiency target', () => {
  const calls = [];
  const lenses = {
    crossHindsight: () => { throw new Error('plain cross hindsight must be suppressed'); },
    f2lNextPairHint: () => null,
    ollStage: () => ({ eoDone: false }),
    pllLens: () => null,
    efficiencyScore: input => { calls.push(input); return 80; },
    faceColors: { D: 'yellow' },
  };
  const live = { phase: 'solving', crossFace: 'D', crossMoveCount: 8, rotations: 0, progress: {} };
  const lines = coachLines({ live, state: {}, toggles: { crossSuggest: false, crossHindsight: true, efficiencyScore: true }, optimalCross: { face: 'D', length: 6 }, xcross: 'x-cross' }, lenses);
  assert.deepEqual(lines.map(line => line.key), ['xcross', 'efficiency']);
  assert.equal(calls[0].crossTarget, 'xcross');
});

test('an x-cross is a tag on the cross segment and the merged pairs are done at the same moment', async () => {
  const { createTrack, trackMilestones } = await import('../src/brain/milestones.js');
  const settings = normalizeSettings();
  const live = (count, progress) => ({ phase: 'solving', solveMoveCount: count, elapsedMs: 3000, inspectionMs: 8000, crossFace: 'D', inspectionConfig: { ...DEFAULT_INSPECTION }, progress });
  let track = createTrack();
  track = trackMilestones(track, live(1, { crossDone: false }), 1000);
  const snap = live(5, { crossDone: true, pairsSolved: 1, f2lDone: false, eoDone: false, coDone: false, ollDone: false, solved: false, skip: null });
  track = trackMilestones(track, snap, 4000);
  const vm = buildViewModel({ session: tracking, live: snap, records: [], settings, track, now: 4000 });
  const [cross, pair1, pair2] = vm.timeline.segments;
  assert.equal(vm.timeline.segments.length, 9, 'the plan is always the cross and four pairs');
  assert.deepEqual([cross.state, cross.xcross, cross.tags.includes('x-cross')], ['done', 'x-cross', true]);
  assert.deepEqual([pair1.state, pair1.merged, pair1.splitText, pair1.delta], ['done', true, 'with cross', null]);
  assert.deepEqual([pair2.state, pair2.merged], ['current', false]);
  assert.equal(vm.timeline.currentIndex, 2);
  const coach = coachLines({ live: snap, state: {}, toggles: { rotationFlag: false }, xcross: 'x-cross' }, { faceColors: {} });
  assert.equal(coach[0].key, 'xcross');
  assert.equal(coach[0].tone, 'good');
  assert.match(coach[0].text, /^x-cross!/);
});

test('connecting: the device status is the latest step; a failure keeps its reason and offers a retry', () => {
  const connecting = { phase: 'connecting', detail: 'Select your cube…' };
  assert.deepEqual([deviceFor(connecting, false).detail, deviceFor(connecting, false).busy], ['Select your cube…', true], 'even without Web Bluetooth: the attach is under way');
  assert.equal(deviceFor(connecting, true, 'MAC provider called (attempt 1).').detail, 'MAC provider called (attempt 1).');
  assert.equal(deviceFor({ phase: 'awaiting-solved', detail: 'connected · checking whether the cube is solved…' }, true).busy, true);
  const failed = deviceFor({ phase: 'disconnected', detail: 'Connection failed: GATT server busy' }, false);
  assert.deepEqual([failed.failed, failed.busy, failed.detail, failed.actions.connect], [true, false, 'Connection failed: GATT server busy', true]);
  assert.equal(deviceFor({ phase: 'disconnected', detail: 'Cube disconnected. The last mirrored position is kept.' }, true).failed, false);
  assert.equal(deviceFor({ phase: 'disconnected', detail: '' }, false).detail, 'Web Bluetooth needs Chrome or Edge on Android/desktop over HTTPS.');
});

test('the Brain words the session status without the scout button names (VOICE.md)', () => {
  assert.equal(brainDetail('Solved baseline synced. Turn the cube, then Analyze.'), "Cube synced. Start a scramble when you're ready.");
  assert.equal(brainDetail('Live cube updated. Analyze when ready.'), 'Live cube updated.');
  assert.equal(brainDetail('Live cube updated.'), 'Live cube updated.');
  assert.equal(deviceFor({ phase: 'tracking', detail: 'Solved baseline synced. Turn the cube, then Analyze.', deviceName: 'GAN', protocol: 'GAN Gen4' }).detail, "Cube synced. Start a scramble when you're ready.");
});

test('the cross hindsight names the colour, not a face letter', () => {
  const lenses = { crossHindsight: (n, opt, face) => ({ kind: 'long', text: `${face}|${n}|${opt}` }), faceColors: { B: 'blue' }, f2lNextPairHint: () => null };
  const live = { phase: 'solving', crossFace: 'B', crossMoveCount: 8, progress: { crossDone: false } };
  const lines = coachLines({ live, state: {}, toggles: { crossSuggest: true, crossHindsight: true }, optimalCross: { face: 'B', length: 6 } }, lenses);
  assert.deepEqual(lines.map(l => l.text), ['Suggested cross: blue, 6 moves', 'blue|8|6']);
});
