// Brain keyboard shortcuts (monkeytype-style: every action has a key).
// Pure: the controller passes a plain description of the keydown event and the
// current screen, and dispatches the returned action (preventing the browser
// default when there is one).
//
//   space  start (idle) · next scramble (results) · connect (disconnected)
//   esc    abort the scramble/inspection/solve · open the command line (idle/results)
//   tab ,  settings (tab only while focus is on the page, so keyboard
//          navigation of controls still works)
//   r      retry this scramble (results)
//   2 / d  toggle +2 / DNF on the finished solve (results)
//   t      hide/show the timer · c cycle coach (live/after/off)

const TIMING = new Set(['scramble', 'inspection', 'ready', 'solving']);

/**
 * @param {{key:string, repeat?:boolean, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean,
 *   editable?:boolean, dialogOpen?:boolean, focusOnPage?:boolean, settingsOpen?:boolean}} event
 * @param {import('./types.js').Screen} screen
 * @returns {import('./types.js').BrainAction|null}
 */
export function resolveKey(event, screen) {
  if (!event || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.editable || event.dialogOpen) return null;
  const key = event.key === 'Spacebar' ? ' ' : event.key;
  if (key === 'Escape') {
    if (event.settingsOpen) return { type: 'toggleSettings' };
    if (TIMING.has(screen)) return { type: 'cancel' };
    if (screen === 'idle' || screen === 'results') return { type: 'command', text: '' };
    return null;
  }
  if (key === 'Tab') return event.focusOnPage ? { type: 'toggleSettings' } : null;
  if (key === ',') return { type: 'toggleSettings' };
  if (key === ' ') {
    if (screen === 'idle') return { type: 'start' };
    if (screen === 'results') return { type: 'next' };
    if (screen === 'disconnected') return { type: 'connect' };
    return null;
  }
  const lower = key.length === 1 ? key.toLowerCase() : key;
  if (screen === 'results') {
    if (lower === 'r') return { type: 'retry' };
    if (lower === '2') return { type: 'togglePenalty', penalty: '+2' };
    if (lower === 'd') return { type: 'togglePenalty', penalty: 'DNF' };
  }
  if (lower === 't') return { type: 'toggleTimer' };
  if (lower === 'c') return { type: 'cycleCoach' };
  return null;
}

/** Key hints shown at the bottom of each screen. */
export function keyHints(screen, { timerHidden = false, coach = 'live' } = {}) {
  const coachLabel = coach === 'live' ? 'coach after solve' : coach === 'after' ? 'coach off' : 'coach live';
  switch (screen) {
    case 'disconnected': return [{ key: 'space', label: 'connect', action: 'connect' }, { key: 'tab', label: 'settings', action: 'toggleSettings' }];
    case 'idle': return [{ key: 'space', label: 'start', action: 'start' }, { key: 'tab', label: 'settings', action: 'toggleSettings' }, { key: 'esc', label: 'command', action: 'command' }];
    case 'scramble': return [{ key: 'esc', label: 'abort', action: 'cancel' }];
    case 'inspection': case 'ready': return [{ key: 'turn', label: 'start solve', action: 'start' }, { key: 'esc', label: 'abort', action: 'cancel' }];
    case 'solving': return [
      { key: 'esc', label: 'abort', action: 'cancel' },
      { key: 't', label: timerHidden ? 'show timer' : 'hide timer', action: 'toggleTimer' },
      { key: 'c', label: coachLabel, action: 'cycleCoach' },
    ];
    case 'results': return [
      { key: 'space', label: 'next scramble', action: 'next' },
      { key: 'r', label: 'retry this scramble', action: 'retry' },
      { key: '2', label: '+2', action: 'togglePenalty' },
      { key: 'd', label: 'dnf', action: 'togglePenalty' },
      { key: 'tab', label: 'settings', action: 'toggleSettings' },
    ];
    default: return [];
  }
}
