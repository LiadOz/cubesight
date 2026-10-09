// The one animations switch. Animations are off when the system asks for reduced motion or
// when the setting `cubesight-motion` is 'off' (tests set it, so nothing animates while they
// run). Off: <html data-motion="off"> stops every CSS animation and transition (shared.css),
// and code that animates asks motionOff() / reducedMotion.matches before it does.
const KEY = 'cubesight-motion';
const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let settingOff = false;
try { settingOff = globalThis.localStorage?.getItem(KEY) === 'off'; } catch { /* storage blocked: follow the system */ }
if (settingOff && typeof document !== 'undefined') document.documentElement.dataset.motion = 'off';

export const motionOff = () => settingOff || Boolean(query?.matches);
/** A MediaQueryList-shaped view of the switch, for code that keeps one and reads `.matches`. */
export const reducedMotion = { get matches() { return motionOff(); } };
