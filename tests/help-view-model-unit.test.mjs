import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHelpViewModel } from '../src/help/view-model.js';

test('help view model reports all expanded groups, current backup status and return destination', () => {
  const model = buildHelpViewModel({ build: 'abc1234', backupStatus: 'Imported 2 solves.', returnHref: '#/drills/f2l', returnLabel: 'return to F2L deduction', expandedSections: ['shortcuts', 'shortcuts-manual-timer-results', 'privacy'] });
  assert.deepEqual(model.expandedSections, ['shortcuts', 'shortcuts-manual-timer-results', 'privacy']);
  assert.equal(model.selectedSection, 'privacy');
  assert.equal(model.backupStatus, 'Imported 2 solves.');
  assert.equal(model.returnHref, '#/drills/f2l');
  assert.equal(model.returnLabel, 'return to F2L deduction');
});

test('help shortcuts show shared developer drawer and honest page contexts', () => {
  const shortcuts = buildHelpViewModel().shortcuts;
  assert(shortcuts.some(item => item.context === 'every page' && item.key === '?' && item.action === 'help'));
  assert(shortcuts.some(item => item.context === 'every page' && item.key === '`' && item.action === 'open developer drawer'));
  assert(shortcuts.some(item => item.context === 'manual timer · results' && item.key === '2' && item.action === '+2'));
  assert(shortcuts.some(item => item.context === 'algs · focused playback' && item.key === '→'));
  assert(!shortcuts.some(item => item.context === 'every page' && item.key === 'space'));
});
