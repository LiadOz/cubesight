// Smart-cube hardware clock helpers.
//
// A GAN cube stamps every move with its own millisecond clock (the library
// reports it as `cubeTimestamp`):
//   Gen2   an accumulated sum of 16-bit elapsed-ms deltas (monotonic, no wrap)
//   Gen3/4 a 32-bit millisecond counter (wraps after ~49.7 days)
//   Gen1   a 16-bit counter of unverified units (wraps every 65 536 ticks)
// The clock starts from an arbitrary origin at every connection, so two stamps
// are only comparable within one connection (`epoch`).
//
// The official solve time is the difference of two stamps, unwrapped against
// the host clock: the number of whole wraps is whichever brings the hardware
// interval closest to the host-measured one, and an interval that disagrees
// with the host by more than a generous tolerance is rejected (the caller then
// falls back to host time). Host time is only ever a cross-check and a
// fallback, so BLE latency jitter never leaks into a hardware-timed result.

const TWO_32 = 2 ** 32;

/** Wrap modulus of the cube clock for a protocol name; null when it never wraps. */
export function cubeClockModulus(protocolName) {
  const name = String(protocolName || '');
  if (/gen\s*1/i.test(name)) return 65536;
  if (/gen\s*2/i.test(name)) return null;
  return TWO_32;
}

/** Allowed disagreement between a hardware and a host interval of `hostMs`. */
export function clockTolerance(hostMs) { return Math.max(500, Math.abs(hostMs) * 0.05); }

/**
 * Hardware milliseconds between two cube stamps, or null when they cannot be
 * trusted (missing, negative on a non-wrapping clock, or off from the host
 * interval `hostMs` by more than the tolerance).
 */
export function cubeElapsedMs(startTs, endTs, hostMs, modulus = TWO_32) {
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || !Number.isFinite(hostMs)) return null;
  let delta = endTs - startTs;
  if (modulus) {
    delta = ((delta % modulus) + modulus) % modulus;
    const wraps = Math.max(0, Math.round((hostMs - delta) / modulus));
    delta += wraps * modulus;
  } else if (delta < 0) return null;
  return Math.abs(delta - hostMs) <= clockTolerance(hostMs) ? delta : null;
}

/** Official display: truncated (never rounded) to hundredths of a second, in ms. */
export function truncateToHundredths(ms) {
  return Number.isFinite(ms) ? Math.floor(ms / 10 + 1e-9) * 10 : ms;
}
