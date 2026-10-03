import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings, normalizeSettings, setSetting, getSetting,
  parseCommand, buildSettingsPanel, buildConfigBar, inspectionLabel, withVoiceCalloutStatus,
} from '../src/brain/settings.js';
import { resolveKey, keyHints } from '../src/brain/keys.js';

const memoryStorage = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map };
};

test('defaults: Orbit style, WCA inspection, CFOP 2-look', () => {
  const s = loadSettings(memoryStorage());
  assert.equal(s.style, 'orbit');
  assert.equal(s.method, 'cfop');
  assert.equal(s.oll, '2look');
  assert.equal(s.pll, '2look');
  assert.deepEqual(s.inspection, { mode: 'wca', seconds: 15, overtime: 'wca', graceSeconds: 2, gracePenalty: 'plus2', callouts: true });
  assert.equal(s.toggles.crossSuggest, true);
});

test('the v1 per-setting keys migrate into v2 settings', () => {
  const storage = memoryStorage({
    'cubesight-brain-method': 'roux',
    'cubesight-brain-cross': '"xcross"',
    'cubesight-brain-pseudo': 'true',
    'cubesight-brain-inspection': 'false',
    'cubesight-brain-toggles-v1': JSON.stringify({ pllLens: false, unknown: true }),
  });
  const s = loadSettings(storage);
  assert.equal(s.method, 'cfop', 'Roux is hidden for now: a stored roux falls back to cfop');
  assert.equal('cross' in s, false, 'an old x-cross target is ignored');
  assert.equal(s.f2l, 'pseudo');
  assert.equal(s.inspection.mode, 'unlimited', 'unchecked inspection = no countdown, clock on first turn');
  assert.equal(s.toggles.pllLens, false);
  assert.equal('unknown' in s.toggles, false);
});

test('stored v2 settings win and bad values are normalized away', () => {
  const storage = memoryStorage({ 'cubesight-brain-method': 'roux' });
  saveSettings(storage, { ...DEFAULT_SETTINGS, style: 'mono', oll: 'bogus', inspection: { mode: 'custom', seconds: 99 } });
  const s = loadSettings(storage);
  assert.equal(s.method, 'cfop', 'v2 present: legacy keys are ignored');
  assert.equal(s.style, 'mono');
  assert.equal(s.oll, '2look');
  assert.equal(s.inspection.mode, 'custom');
  assert.equal(s.inspection.seconds, 60, 'clamped');
  assert.ok(storage.map.has(SETTINGS_KEY));
  assert.equal(normalizeSettings('garbage').style, 'orbit');
});

test('cross colour defaults to all faces and supports a selected colour', () => {
  assert.equal(DEFAULT_SETTINGS.crossColor, 'neutral');
  assert.equal(normalizeSettings({ crossColor: 'red' }).crossColor, 'red');
  assert.equal(normalizeSettings({ crossColor: 'purple' }).crossColor, 'neutral');
  assert.deepEqual(parseCommand('crosscolor green'), { path: 'crossColor', value: 'green' });
  assert.ok(buildSettingsPanel(normalizeSettings(), true).sections.find(section => section.id === 'solve').rows.some(row => row.id === 'crossColor'));
});

test('voice help status decorates cached settings immutably and idempotently', () => {
  const panel = buildSettingsPanel(normalizeSettings(), true);
  const base = panel.sections.flatMap(section => section.rows).find(row => row.id === 'voice');
  const status = 'no offline voice installed; callouts stay silent.';
  const decorated = withVoiceCalloutStatus(panel, status);
  const row = decorated.sections.flatMap(section => section.rows).find(item => item.id === 'voice');
  assert.equal(base.help, 'Speak the callouts with a local device voice.');
  assert.equal(row.help, `${base.help} ${status}`);
  assert.equal(withVoiceCalloutStatus(panel, status), decorated, 'repeated rendering reuses the same decorated panel');
  assert.equal(withVoiceCalloutStatus(panel, 'offline voice ready.').sections.flatMap(section => section.rows).find(item => item.id === 'voice').help,
    `${base.help} offline voice ready.`, 'changing status starts from the immutable base help');
});

test('setSetting: paths, inspection merge (including the legacy shape), toggles and presets', () => {
  let s = normalizeSettings();
  s = setSetting(s, 'oll', '1look');
  assert.equal(s.oll, '1look');
  s = setSetting(s, 'inspection.seconds', 10);
  assert.equal(s.inspection.mode, 'custom');
  assert.equal(s.inspection.seconds, 10);
  s = setSetting(s, 'inspection', { overtime: 'grace', graceSeconds: 3, gracePenalty: 'dnf' });
  assert.equal(s.inspection.mode, 'custom', 'merged, not replaced');
  assert.equal(s.inspection.gracePenalty, 'dnf');
  s = setSetting(s, 'inspection', { enabled: false });
  assert.equal(s.inspection.mode, 'unlimited');
  s = setSetting(s, 'toggles.f2lHint', false);
  assert.equal(s.toggles.f2lHint, false);
  s = setSetting(s, 'stats.source', 'all');
  assert.equal(s.stats.source, 'all');
  assert.equal(normalizeSettings({ stats: { source: 'bad' } }).stats.source, 'smart');
  s = setSetting(s, 'preset', 'drill');
  assert.equal(s.inspection.mode, 'off');
  s = setSetting(s, 'preset', 'wca');
  assert.equal(s.inspection.mode, 'wca');
  assert.equal(setSetting(s, 'style', 'neon').style, s.style, 'unknown style ignored');
  assert.equal(getSetting(s, 'inspection.overtime'), 'wca');
});

test('the command line sets any setting', () => {
  assert.deepEqual(parseCommand('insp 10'), { path: 'inspection', value: { mode: 'custom', seconds: 10 } });
  assert.deepEqual(parseCommand('insp wca'), { path: 'inspection', value: { mode: 'wca' } });
  assert.deepEqual(parseCommand('insp off'), { path: 'inspection', value: { mode: 'off' } });
  assert.deepEqual(parseCommand('INSP inf'), { path: 'inspection', value: { mode: 'unlimited' } });
  assert.deepEqual(parseCommand('overtime count'), { path: 'inspection.overtime', value: 'count' });
  assert.deepEqual(parseCommand('grace 3'), { path: 'inspection', value: { overtime: 'grace', graceSeconds: 3 } });
  assert.deepEqual(parseCommand('oll 1'), { path: 'oll', value: '1look' });
  assert.deepEqual(parseCommand('pll 2-look'), { path: 'pll', value: '2look' });
  assert.deepEqual(parseCommand('style mono'), { path: 'style', value: 'mono' });
  assert.deepEqual(parseCommand('orbit'), { path: 'style', value: 'orbit' });
  assert.deepEqual(parseCommand('mode dark'), { path: 'theme', value: 'dark' });
  assert.deepEqual(parseCommand('light'), { path: 'theme', value: 'light' });
  assert.deepEqual(parseCommand('theme system'), { path: 'theme', value: 'system' });
  assert.deepEqual(parseCommand('theme mono'), { path: 'style', value: 'mono' }, 'the old spelling still picks the style');
  assert.deepEqual(parseCommand('timer hide'), { path: 'timer', value: 'hide' });
  for (const text of ['cross x', 'xcross', 'xxcross', 'cross']) assert.equal(parseCommand(text), null, `${text}: x-cross is not a target`);
  assert.deepEqual(parseCommand('pseudo'), { path: 'f2l', value: 'pseudo' });
  assert.deepEqual(parseCommand('compare pb'), { path: 'compare', value: 'pb' });
  assert.deepEqual(parseCommand('preset relaxed'), { path: 'preset', value: 'relaxed' });
  assert.equal(parseCommand('oll 3'), null);
  assert.equal(parseCommand('nonsense'), null);
  assert.equal(parseCommand(''), null);
});

test('the settings panel shows only rows that apply', () => {
  const rows = s => buildSettingsPanel(s).sections.flatMap(x => x.rows.map(r => r.id));
  const wca = rows(normalizeSettings());
  assert.ok(wca.includes('inspection.overtime'));
  assert.ok(!wca.includes('inspection.seconds'));
  assert.ok(!wca.includes('inspection.graceSeconds'));
  const grace = rows(setSetting(normalizeSettings(), 'inspection', { mode: 'custom', seconds: 10, overtime: 'grace' }));
  assert.ok(grace.includes('inspection.seconds') && grace.includes('inspection.graceSeconds') && grace.includes('inspection.gracePenalty'));
  assert.ok(!wca.includes('method'), 'one offered method is not a choice');
  const panel = buildSettingsPanel(normalizeSettings(), true);
  assert.equal(panel.open, true);
  const style = panel.sections.find(s => s.id === 'look').rows[0];
  assert.deepEqual(style.options.map(o => [o.value, o.active, o.isDefault]), [['orbit', true, true], ['mono', false, false]]);
  // The site mode is one more row beside the style; the preference comes from src/theme.js.
  const mode = panel.sections.find(s => s.id === 'look').rows[1];
  assert.deepEqual([mode.id, mode.label], ['theme', 'mode']);
  assert.deepEqual(mode.options.map(o => [o.value, o.active]), [['light', false], ['dark', false], ['system', true]]);
  assert.deepEqual(buildSettingsPanel(normalizeSettings(), false, 'dark').sections.find(s => s.id === 'look').rows[1].options.map(o => o.active), [false, true, false]);
});

test('config bar and inspection labels', () => {
  const bar = buildConfigBar(normalizeSettings({ f2l: 'pseudo' }));
  assert.deepEqual(bar.items.map(i => i.id), ['f2l', 'oll', 'pll', 'inspection.mode', 'penalties', 'session.focus']);
  assert.deepEqual(bar.items.map(i => i.label ?? ''), ['', 'oll', 'pll', 'insp', '', 'focus']);
  const f2l = bar.items.find(i => i.id === 'f2l').options[0];
  assert.deepEqual([f2l.active, f2l.value], [true, 'standard'], 'a toggle carries the value it switches to');
  assert.deepEqual(bar.items.find(i => i.id === 'oll').options.map(o => [o.label, o.active]), [['1-look', false], ['2-look', true]]);
  assert.deepEqual(bar.items.find(i => i.id === 'inspection.mode').options.map(o => o.label), ['15s', '15s', '∞', 'off']);
  // Every option is a valid setSetting(item.id, option.value).
  for (const item of bar.items) for (const option of item.options) assert.notEqual(setSetting(normalizeSettings({ f2l: 'pseudo' }), item.id, option.value), null);
  assert.equal(setSetting(normalizeSettings(), 'inspection.mode', 'off').inspection.mode, 'off');
  assert.equal(setSetting(normalizeSettings(), 'penalties', 'ignore').penalties, 'ignore');
  assert.equal(buildSettingsPanel(normalizeSettings({ stats: { source: 'manual' } })).sections.find(section => section.id === 'stats').rows[0].options.find(option => option.active).value, 'manual');
  assert.equal(inspectionLabel({ mode: 'wca', seconds: 15 }), 'insp 15s');
  assert.equal(inspectionLabel({ mode: 'custom', seconds: 10 }), 'insp 10s');
  assert.equal(inspectionLabel({ mode: 'unlimited' }), 'insp ∞');
  assert.equal(inspectionLabel({ mode: 'off' }), 'insp off');
});

test('keys: space, esc, tab, penalties, retry per screen', () => {
  const key = (k, screen, extra = {}) => resolveKey({ key: k, focusOnPage: true, ...extra }, screen);
  assert.deepEqual(key(' ', 'idle'), { type: 'start' });
  assert.deepEqual(key(' ', 'results'), { type: 'next' });
  assert.deepEqual(key(' ', 'disconnected'), { type: 'connect' });
  assert.equal(key(' ', 'solving'), null, 'space never interrupts a solve');
  assert.deepEqual(key('Escape', 'solving'), { type: 'cancel' });
  assert.deepEqual(key('Escape', 'inspection'), { type: 'cancel' });
  assert.deepEqual(key('Escape', 'idle'), { type: 'command', text: '' });
  assert.deepEqual(key('Escape', 'idle', { settingsOpen: true }), { type: 'toggleSettings' });
  assert.deepEqual(key('Tab', 'idle'), { type: 'toggleSettings' });
  assert.equal(key('Tab', 'idle', { focusOnPage: false }), null, 'tab keeps focus navigation on controls');
  assert.deepEqual(key(',', 'idle', { focusOnPage: false }), { type: 'toggleSettings' });
  assert.deepEqual(key('2', 'results'), { type: 'togglePenalty', penalty: '+2' });
  assert.deepEqual(key('D', 'results'), { type: 'togglePenalty', penalty: 'DNF' });
  assert.deepEqual(key('r', 'results'), { type: 'retry' });
  assert.equal(key('r', 'solving'), null);
  assert.deepEqual(key('t', 'solving'), { type: 'toggleTimer' });
  assert.deepEqual(key('c', 'idle'), { type: 'cycleCoach' });
  // Panels: one key opens, esc closes (the debug drawer first), even from inside a text field.
  assert.deepEqual(key('`', 'solving'), { type: 'toggleDebug' });
  assert.deepEqual(key('Escape', 'solving', { debugOpen: true }), { type: 'toggleDebug' });
  assert.deepEqual(key('Escape', 'idle', { debugOpen: true, settingsOpen: true }), { type: 'toggleDebug' });
  assert.deepEqual(key('Escape', 'idle', { settingsOpen: true, editable: true }), { type: 'toggleSettings' });
  assert.equal(key('Escape', 'idle', { editable: true }), null);
  assert.equal(key('`', 'idle', { editable: true }), null);
});

test('keys are ignored while typing, repeating, with modifiers or a dialog open', () => {
  assert.equal(resolveKey({ key: ' ', editable: true }, 'idle'), null);
  assert.equal(resolveKey({ key: ' ', repeat: true }, 'idle'), null);
  assert.equal(resolveKey({ key: 'r', ctrlKey: true }, 'results'), null);
  assert.equal(resolveKey({ key: 'r', metaKey: true }, 'results'), null);
  assert.equal(resolveKey({ key: ' ', dialogOpen: true }, 'idle'), null);
});

test('key hints follow the screen', () => {
  assert.deepEqual(keyHints('idle').map(h => h.key), ['space', 'tab', 'esc']);
  assert.deepEqual(keyHints('results').map(h => h.key), ['space', '[ ]', 'r', '2', 'd', 'tab']);
  assert.equal(keyHints('solving', { timerHidden: true }).find(h => h.key === 't').label, 'show timer');
});

test('Roux is not offered anywhere, and voice callouts start off', () => {
  const s = normalizeSettings({ method: 'roux' });
  assert.equal(s.method, 'cfop');
  assert.equal(setSetting(normalizeSettings(), 'method', 'roux').method, 'cfop');
  assert.equal(parseCommand('roux'), null);
  assert.equal(parseCommand('method roux'), null);
  const offered = [
    ...buildConfigBar(s).items.flatMap(i => i.options.map(o => o.value)),
    ...buildSettingsPanel(s).sections.flatMap(x => x.rows.flatMap(r => r.options.map(o => o.value))),
  ];
  assert.ok(!offered.includes('roux'));
  assert.equal(DEFAULT_SETTINGS.voice, false, 'voice off by default');
  assert.equal(DEFAULT_SETTINGS.inspection.callouts, true, 'visual 8 s / 12 s callouts stay on');
  assert.equal(normalizeSettings({}).voice, false);
});
