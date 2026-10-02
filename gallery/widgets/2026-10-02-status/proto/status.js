/* global document */
import { q, mount, theme } from '../../_proto/common.js';
import * as S from '../../_proto/scenes.js';

const opt = ['1', '2', '3'].includes(q.get('opt')) ? q.get('opt') : '1';
const view = q.get('view') || 'states';
const withLegend = q.get('legend') !== '0';
const NAMES = { 1: 'bottom-right slot', 2: 'top-right, text only', 3: 'readout line + snackbar' };
const ID = { states: 'W-16-01', connecting: 'W-16-02', error: 'W-16-03', toast: 'W-16-04', phone: 'W-16-05' };

const G = {
  good: '<svg class="g" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1l1.6 3.9L13 6.5 8.6 8.1 7 13 5.4 8.1 1 6.5l4.4-1.6z" fill="var(--b-good)"/></svg>',
  warn: '<svg class="g" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.6" fill="none" stroke="var(--b-warn)" stroke-width="1.6"/><path d="M7 4v3.6M7 9.6v.1" stroke="var(--b-warn)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  error: '<svg class="g" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.6" fill="none" stroke="var(--b-dnf)" stroke-width="1.6"/><path d="M5 5l4 4M9 5l-4 4" stroke="var(--b-dnf)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  live: '<i class="g-dot"></i>',
  work: '<svg class="g g-spin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="var(--b-track)" stroke-width="2"/><path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="var(--b-fill-live)" stroke-width="2" stroke-linecap="round"/></svg>',
  info: '',
};
/** Status line: tone info|live|work|warn|error. */
const ST = (tone, text, { act = '', mono = false, co = '', actState = '' } = {}) =>
  `<span class="st st--${tone} ${mono ? 'st--mono' : ''}" role="${tone === 'error' ? 'alert' : 'status'}" ${co ? `data-co="${co}" data-co-side="tl"` : ''}>${G[tone]}<span>${text}</span>${act ? `<button class="act ${actState}">${act}</button>` : ''}</span>`;
/** Toast: tone info|good|warn. */
const TOAST = (tone, text, { act = '', state = '', actState = '', co = '' } = {}) =>
  `<span class="toast ${act ? 'has-act' : ''} ${state}" role="status" ${co ? `data-co="${co}" data-co-side="tl"` : ''}>${G[tone]}<span>${text}</span>${act ? `<button class="act ${actState}">${act}</button>` : ''}</span>`;
const abs = (style, html) => `<div class="abs" style="position:absolute;${style}">${html}</div>`;
const kbar = items => `<div class="kbar">${items.map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('')}</div>`;
const startBtn = (off = false, label = 'start') => `<span class="pill primary ${off ? 'is-off' : ''}">${label}${off ? '' : ' <kbd>space</kbd>'}</span>`;

/** Where the status and the toast live, per option and scene. */
const SLOT = {
  1: { status: h => ({ meta: '', overlay: abs('right:48px;bottom:14px', h) }), toast: h => ({ meta: '', overlay: abs('right:48px;bottom:8px', h) }) },
  2: { status: h => ({ overlay: abs('right:48px;top:68px', h) }), toast: h => ({ overlay: abs('right:48px;top:68px', h) }) },
  3: { status: h => ({ sub: h }), toast: h => ({ overlay: abs('left:48px;bottom:58px', h) }) },
};

function connectingFrame() {
  const slot = SLOT[opt].status(ST('work', 'Connecting to GAN 356 i3…', { co: '1' }));
  return S.idle({ chip: 'GAN 356 i3 · connecting', dot: 'warn', full: true, spin: true, clock: '0.00', actions: startBtn(true), keybar: kbar([['esc', 'cancel']]), ...slot });
}
function errorFrame() {
  const slot = SLOT[opt].status(ST('error', "Couldn't connect. Check that Bluetooth is on, then try again.", { co: '1' }));
  const actions = `<span class="pill primary" data-co="2">try again <kbd>space</kbd></span><span class="pill txt ink">help</span>`;
  return S.idle({ chip: 'no cube', dot: 'off', actions, keybar: kbar([['esc', 'back']]), ...slot });
}
function toastFrame() {
  const slot = SLOT[opt].toast(TOAST('good', 'Solve saved · 12.41 PB', { act: 'undo', co: '1' }));
  const actions = `<span class="pill primary">next scramble <kbd>space</kbd></span><span class="pill txt ink">review</span><span class="pill txt">more…</span>`;
  return S.results({ actions, keybar: kbar([['[ ]', 'markers']]), ...slot });
}
function phoneFrames() {
  const strip = h => abs('left:0;right:0;top:62px;display:flex;justify-content:center', h);
  const corner = h => abs('right:24px;top:56px', h);
  const put = opt === '2' ? corner : strip;
  const left = S.phoneDrill({
    answers: ['OLL21', 'OLL27', 'OLL31', 'OLL33'].map(t => `<span class="pill" style="background:var(--b-surface-2);box-shadow:inset 0 0 0 1px var(--b-hairline);font-size:17px">${t}</span>`).join(''),
    stop: '<span class="pill txt">stop</span>',
    status: put(ST('work', opt === '2' ? 'Reconnecting…' : 'Cube disconnected. Reconnecting…', { co: '1' })),
  });
  const right = S.phoneResults({
    actions: `<span class="pill primary">next scramble</span><div style="display:flex;justify-content:center;gap:12px"><span class="pill txt ink">review</span><span class="pill txt">more…</span></div>`,
    status: put(TOAST('good', 'Solve saved · 12.41 PB', { act: 'undo', co: '2' })),
  });
  return `<div style="display:flex;gap:44px;padding:28px;justify-content:center;background:var(--b-canvas)"><div class="touch">${left}</div><div class="touch">${right}</div></div>`;
}

const DIAGRAM = (o, label) => {
  const box = (style, t) => `<div class="box" style="${style}">${t}</div>`;
  const parts = {
    1: box('left:150px;top:164px;width:140px;height:18px', 'status · toast'),
    2: box('left:150px;top:30px;width:140px;height:18px', 'status · toast'),
    3: box('left:116px;top:152px;width:110px;height:14px', 'status') + box('left:12px;top:140px;width:92px;height:20px;background:var(--b-ink);color:var(--b-bg);box-shadow:none', 'toast'),
  }[o];
  return `<div><div class="colhead" style="margin-bottom:6px;font:400 12px var(--b-font-mono);color:var(--b-muted)">${label}</div><div class="slot-demo"><div class="ring"></div><div class="coach"></div>
    <div style="position:absolute;right:10px;top:8px;width:70px;height:10px;border-radius:5px;background:var(--b-faint);opacity:.6"></div>
    <div style="position:absolute;left:12px;bottom:6px;width:60px;height:8px;border-radius:3px;background:var(--b-faint);opacity:.6"></div>${parts}</div></div>`;
};

function statesFrame() {
  const row = (label, st, to) => `<div class="colhead">${label}</div><div class="cell">${st}</div><div class="cell">${to}</div>`;
  const none = '<span class="st st--mono" style="color:var(--b-faint)">not a toast: errors stay as a status line until fixed</span>';
  const noneS = '<span class="st st--mono" style="color:var(--b-faint)">not a status: it is over by itself</span>';
  const matrix = `<div class="matrix" style="grid-template-columns:130px minmax(0,1fr) minmax(0,1fr)">
    <div></div><div class="colhead">status line (stays while true)</div><div class="colhead">toast (4 s, then gone)</div>
    ${row('info / hint', ST('info', 'Start a round when you’re ready.', { co: '1' }), TOAST('info', 'Recording saved'))}
    ${row('working', ST('work', 'connecting…'), '<span class="st st--mono" style="color:var(--b-faint)">not a toast: it has no end yet</span>')}
    ${row('ok / saved', ST('live', 'Connected to GAN 356 i3.'), TOAST('good', 'Solve saved · 12.41 PB', { act: 'undo', co: '3' }))}
    ${row('warn', ST('warn', 'Solve the cube, then sync.'), TOAST('warn', 'Taking a break? This one won’t count.'))}
    ${row('error', ST('error', 'Couldn’t connect. Check Bluetooth and try again.', { act: 'try again', co: '2' }), none)}
  </div>`;
  const life = `<div class="matrix" style="grid-template-columns:130px repeat(5,minmax(0,1fr));margin-top:6px;align-items:start">
    <div class="colhead">toast life cycle</div>
    ${[['enter 200 ms (fade, 8 px up)', 'is-enter', ''], ['visible 4 s (6 s with an action)', '', ''], ['action focus-visible', '', 'is-focus'], ['hover or focus pauses the clock', '', 'is-hover'], ['exit 160 ms (fade)', 'is-exit', '']].map(([n, st, as], i) => `<div><div class="colhead" style="margin-bottom:10px;min-height:30px">${n}</div>${TOAST('good', 'Solve saved', { act: 'undo', state: st, actState: as, co: i === 0 ? '4' : '' })}</div>`).join('')}
  </div>`;
  const place = `<div style="display:flex;gap:30px;align-items:flex-start;margin-top:12px" data-co="5" data-co-side="tl">${DIAGRAM(opt, 'where it lives (this option)')}<div style="font-size:13px;line-height:1.5;color:var(--b-muted);max-width:640px;padding-top:22px">The coach line stays in the left rail (A-05) and the cube chip stays top-right (item 14). One message at a time: a toast waits for the orbit to finish moving, and replaces the status line in the same place for its 4 s.</div></div>`;
  return `<div class="sheet"><h3>tones x kind</h3>${matrix}<div class="spacer"></div><h3>toast states</h3>${life}<div class="spacer"></div>${place}</div>`;
}

const LEG = {
  1: [
    '<b>tone glyph</b>: a dot (live), a spinning mini ring (working), ✦ (good), ! in an amber ring (warn), × in a red ring (error). The text stays ink or muted; only the glyph is coloured.',
    '<b>error</b>: a status line that stays until fixed, with at most one text action. Sentence case, a full stop, no exception text (VOICE 6.1).',
    '<b>toast</b>: a surface pill in the same slot as the status line; past tense, the object, the number. At most one text action.',
    '<b>life cycle</b>: 200 ms in, 4 s (6 s with an action), 160 ms out. Hover or focus pauses it; esc dismisses. Under reduced motion it just appears and disappears.',
    '<b>slot</b>: bottom-right, where A-05 prints “solve 23 · today 17:33”. Never over the coach line.',
  ],
  2: [
    '<b>tone glyph</b>: the same glyph set. Text stays ink or muted.',
    '<b>error</b>: a status line under the cube chip, right-aligned, where you look for connection problems; stays until fixed, with one text action.',
    '<b>toast</b>: no container at all, the same text as the status line plus a 4 s life. It cannot look like a button or a card.',
    '<b>life cycle</b>: 200 ms in, 4 s, 160 ms out; hover or focus pauses it.',
    '<b>slot</b>: top-right under the chip, an empty corner in every A frame.',
  ],
  3: [
    '<b>tone glyph</b>: the same glyph set, 12 px.',
    '<b>error</b>: a status line in the readout line under the clock; stays until fixed, with one text action. The readout (“vs ao12…”) is hidden while an error is showing.',
    '<b>toast</b>: an inverse snackbar (ink fill, 12 px corners) at bottom-left. The loudest of the three.',
    '<b>life cycle</b>: 200 ms in, 4 s, 160 ms out; hover or focus pauses it.',
    '<b>slot</b>: status centred under the clock; toast bottom-left above the key bar, clear of the coach line.',
  ],
};
const LEG_CON = {
  1: ['<b>connecting</b>: the status line in the bottom-right slot, spinning mini ring + “Connecting to GAN 356 i3…”. The full orbit is the only large motion; the mini ring is the same shape, so it reads as one thing.', '<b>the chip</b> carries the state too (“connecting”), so the line can be dismissed without losing it.', '<b>start</b> is disabled (surface fill) until connected.'],
  2: ['<b>connecting</b>: the line sits under the cube chip, right-aligned; the full orbit is the only large motion.', '<b>the chip</b> says “connecting” and the line says which cube.', '<b>start</b> is disabled until connected.'],
  3: ['<b>connecting</b>: the line is the readout under the clock; the cube and the full orbit stay the centrepiece.', '<b>the chip</b> says “connecting”.', '<b>start</b> is disabled until connected.'],
};
const LEG_ERR = {
  1: ['<b>error line</b>: bottom-right, one sentence and what to do. No exception text (that goes to the dev log).', '<b>one primary</b>: “try again” takes over from start; “help” is the quiet text action. Never two bright things.', '<b>no toast</b>: errors do not auto-dismiss.'],
  2: ['<b>error line</b>: under the chip, where the connection status already lives.', '<b>one primary</b>: “try again”, plus a text “help”.', '<b>no toast</b>: errors do not auto-dismiss.'],
  3: ['<b>error line</b>: in the readout line under the clock, the nearest text to the thing that failed.', '<b>one primary</b>: “try again”, plus a text “help”.', '<b>no toast</b>: errors do not auto-dismiss.'],
};
const LEG_TOA = {
  1: ['<b>saved toast</b>: a surface pill in the bottom-right slot (it replaces the stats line for 4 s). One text action: undo.', '<b>coach</b>: left rail, untouched; the dotted connector is not crossed.', '<b>actions</b>: still next scramble · review · more…; a toast never adds a fourth.'],
  2: ['<b>saved toast</b>: plain text under the chip. Nothing to compete with the ring labels or the coach line.', '<b>coach</b>: left rail, untouched.', '<b>actions</b>: unchanged, three at most.'],
  3: ['<b>saved toast</b>: an inverse snackbar bottom-left, above the key bar. 100 px below the coach line, visible but separate.', '<b>coach</b>: left rail, untouched. A cream bar next to the cream primary could be mistaken for a button, so it has 12 px corners and no key.', '<b>actions</b>: unchanged, three at most.'],
};
const LEG_PHONE = {
  1: ['<b>strip under the header</b>: the one free line on a phone; the status line sits there, a toast replaces it for 4 s. Action text is 44 px high.', '<b>toast</b>: the surface pill, 48 px high, centred.', '<b>coach and actions</b> are not covered.'],
  2: ['<b>top-right under the chip</b>: short wording on a phone (“Reconnecting…”).', '<b>toast</b>: text only, 44 px action.', '<b>coach and actions</b> are not covered.'],
  3: ['<b>strip under the header</b>: the status sits there; with no readout line on this screen.', '<b>toast</b>: the inverse snackbar, 48 px high, at the top on a phone (the bottom holds the primary).', '<b>coach and actions</b> are not covered.'],
};

function compareFrame() {
  const col = n => `<div class="o${n}" style="display:contents"><div>
      <div class="colhead" style="font:600 14px var(--b-font-sans);color:var(--b-ink);margin-bottom:12px">${['①', '②', '③'][n - 1]} ${NAMES[n]}</div>
      <div style="display:flex;flex-direction:column;gap:18px;align-items:flex-start">
        ${DIAGRAM(String(n), 'where')}
        ${ST('error', 'Couldn’t connect. Check Bluetooth and try again.', { co: n === 1 ? '1' : '' }).replace('st st--error', 'st st--error')}
        ${TOAST('good', 'Solve saved · 12.41 PB', { act: 'undo', co: n === 1 ? '2' : '' })}
      </div></div></div>`;
  return `<div class="sheet"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:30px">${col(1)}${col(2)}${col(3)}</div></div>`;
}
const LEG_CMP = [
  '<b>status line</b>: the same one line of text with a tone glyph in all three; only where it lives differs.',
  '<b>toast</b>: a surface pill (①), plain text (②), an inverse snackbar (③).',
  '<b>coach line</b> (A-05, left rail) is not touched by any option.',
  '<b>one rule for all</b>: one message at a time, errors never auto-dismiss, a toast has one text action at most, no progress bars (feedback 1).',
];

const views = {
  compare: { frame: compareFrame, legend: LEG_CMP, cols: 2, name: 'the three options side by side' },
  states: { frame: statesFrame, legend: LEG[opt], cols: 2, name: 'states, dark and light' },
  connecting: { frame: connectingFrame, legend: LEG_CON[opt], cols: 3, name: 'in context: connecting (A-01 + full orbit)' },
  error: { frame: errorFrame, legend: LEG_ERR[opt], cols: 3, name: 'in context: connect failed' },
  toast: { frame: toastFrame, legend: LEG_TOA[opt], cols: 3, name: 'in context: saved toast on results (A-05)' },
  phone: { frame: phoneFrames, legend: LEG_PHONE[opt], cols: 3, name: 'in context: phone (A-09)', width: 900 },
};
const v = views[view];
mount({
  id: `${q.get('id') || ID[view]}${view === 'compare' ? '' : ` · option ${opt}`}`,
  name: view === 'compare' ? `W-16 status and toast · ${v.name}` : `W-16 status and toast · ${['①', '②', '③'][opt - 1]} ${NAMES[opt]} · ${v.name}`,
  frame: `<div class="o${opt}" style="display:contents">${v.frame()}</div>`,
  legend: withLegend ? v.legend : [],
  cols: v.cols,
  width: v.width,
});
document.documentElement.dataset.theme = theme;
