// The move cue's motion, as pure functions of time (the cube applies it in cube-3d.js).
// One cycle: the layer eases out to a partial turn (about 36 degrees, further and twice
// for a double), holds, eases back to rest, pauses and loops. `pose` (0..1) freezes the
// cue at that fraction of its peak (screenshots); reduced motion / loop:false freeze it
// at a small still offset.
export const CUE_PEAK = Object.freeze({ quarter: 36, double: 60, rot: 30, rotDouble: 50 });
export const CUE_START_DELAY_MS = 350;
export const CUE_STILL_POSE = .45;

const smooth = t => { const x = Math.min(Math.max(t, 0), 1); return x * x * (3 - 2 * x); };
// One pulse: ease out, hold, ease back (fractions of the period), starting at `at`.
const pulse = (phase, at, out, hold, back) => {
  const t = phase - at;
  if (t <= 0) return 0;
  if (t < out) return smooth(t / out);
  if (t < out + hold) return 1;
  if (t < out + hold + back) return 1 - smooth((t - out - hold) / back);
  return 0;
};

/** The fraction of the peak (0..1) at `phase` (0..1) of one loop; a double pulses twice. */
export function cueShape(phase, double) {
  if (!double) return pulse(phase, 0, .28, .12, .28);
  return Math.max(pulse(phase, 0, .14, .05, .14), pulse(phase, .36, .14, .05, .14));
}

export const cueLoopMs = double => (double ? 2800 : 2400);

/** Peak angle in degrees for a turn kind ('rot' for rotations) and whether it is a double. */
export const cuePeak = (kind, double) => kind === 'rot' ? (double ? CUE_PEAK.rotDouble : CUE_PEAK.rot) : (double ? CUE_PEAK.double : CUE_PEAK.quarter);

/** The fraction of the peak at time `now` for a cue started (built) with `startedAt` already delayed. */
export function cueFraction({ now, startedAt, double, pose = null, loop = true, reducedMotion = false }) {
  if (pose != null) return pose;
  if (!loop || reducedMotion) return CUE_STILL_POSE;
  if (now < startedAt) return 0;
  const period = cueLoopMs(double);
  return cueShape(((now - startedAt) % period) / period, double);
}
