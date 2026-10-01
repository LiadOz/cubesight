// The manual timer's state machine (spacebar or touch, like csTimer). Pure: the clock is
// injected, so node tests drive it with a fake one. It owns no DOM and no storage.
//
//   idle ──hold ≥ holdMs, release──▶ inspecting ──hold ≥ holdMs, release──▶ running ──down──▶ done
//          (inspection off: straight to running)                (autostart: the clock starts by itself at the limit)
//
// `phase` is the base state. `hold` is an overlay while the key or finger is down:
// 'holding' until the hold threshold passes, then 'ready' (release now to go on).
// Releasing early changes nothing. Stopping happens on the DOWN, like csTimer, and the
// release that follows is swallowed so it cannot start the next attempt.
//
// The inspection rules are NOT reimplemented: inspectionLimitMs / inspectionPenalty from
// src/solve-live.js decide the limit and the penalty (wca, custom, unlimited, off × wca,
// count, grace, autostart). The penalty is fixed when the solve clock starts.

import { DEFAULT_INSPECTION, inspectionLimitMs, inspectionPenalty } from '../solve-live.js';

export const HOLD_OPTIONS = Object.freeze([0, 300, 550]);
export const DEFAULT_HOLD_MS = 300;

/** The official time: truncated (never rounded) to hundredths of a second (WCA 9f). */
export const truncateMs = ms => Math.max(0, Math.floor(ms / 10) * 10);

export const normalizeHoldMs = value => (HOLD_OPTIONS.includes(Number(value)) ? Number(value) : DEFAULT_HOLD_MS);

/**
 * @param {{now?:()=>number, inspection?:Object, holdMs?:number, onFinish?:(result:Object)=>void, onChange?:()=>void}} options
 */
export function createTimerMachine({ now = () => performance.now(), inspection = DEFAULT_INSPECTION, holdMs = DEFAULT_HOLD_MS, onFinish = () => {}, onChange = () => {} } = {}) {
  let config = { ...inspection };
  let hold = normalizeHoldMs(holdMs);
  let phase = 'idle';          // idle | inspecting | running | done
  let holding = null;          // { since } while the key/finger is down and will act on release
  let swallowUp = false;       // the release after a stop
  let inspectStartAt = 0;
  let startAt = 0;
  let inspectionMs = null;
  let penalty = null;
  let result = null;

  const change = () => onChange();

  function startRunning(at, inspectedMs, pen) {
    phase = 'running';
    startAt = at;
    inspectionMs = inspectedMs;
    penalty = pen;
    holding = null;
    result = null;
  }

  // Time-driven transition: autostart starts the solve clock by itself at the limit.
  function tick(at = now()) {
    if (phase === 'inspecting' && config.overtime === 'autostart') {
      const limit = inspectionLimitMs(config);
      if (limit != null && at - inspectStartAt >= limit) { startRunning(inspectStartAt + limit, limit, null); change(); }
    }
  }

  const machine = {
    /** Key or finger went down. */
    down(at = now()) {
      tick(at);
      if (phase === 'running') {
        const elapsed = at - startAt;
        phase = 'done';
        swallowUp = true;
        result = { solveMs: truncateMs(elapsed), penalty, inspectionMs, inspectionMode: config.mode };
        change();
        onFinish(result);
        return;
      }
      if (swallowUp || holding) return;
      holding = { since: at };
      change();
    },
    /** Key or finger came up. */
    up(at = now()) {
      tick(at);
      if (swallowUp) { swallowUp = false; return; }
      if (!holding) return;
      const ready = at - holding.since >= hold;
      holding = null;
      if (ready) {
        if (phase === 'inspecting') startRunning(at, Math.round(at - inspectStartAt), inspectionPenalty(config, at - inspectStartAt));
        else if (config.mode === 'off') startRunning(at, null, null);
        else { phase = 'inspecting'; inspectStartAt = at; result = null; }
      }
      change();
    },
    /** Abandon the attempt without a result (esc). */
    cancel() {
      if (phase === 'idle' && !holding) return;
      holding = null;
      swallowUp = false;
      if (phase !== 'done') { phase = 'idle'; result = null; }
      change();
    },
    /** The key or finger vanished (window blur, pointercancel): drop the hold, change nothing else. */
    abortHold() { if (holding) { holding = null; change(); } },
    /** Advance time-driven state; call often (every frame) while not idle. */
    tick(at = now()) { tick(at); },
    /** Forget a finished attempt (a new scramble was asked for). */
    reset() { if (phase === 'done') { phase = 'idle'; result = null; change(); } },
    setInspection(next) { config = { ...next }; change(); },
    setHoldMs(value) { hold = normalizeHoldMs(value); change(); },
    get holdMs() { return hold; },
    get inspection() { return config; },
    /** Everything the view needs at this instant. */
    snapshot() {
      tick();
      const t = now();
      const limit = inspectionLimitMs(config);
      const inspectElapsed = phase === 'inspecting' ? t - inspectStartAt : null;
      return {
        phase,
        hold: holding ? (t - holding.since >= hold ? 'ready' : 'holding') : null,
        holdMs: hold,
        inspectionElapsedMs: inspectElapsed,
        inspectionLimitMs: limit,
        projectedPenalty: inspectElapsed == null ? null : inspectionPenalty(config, inspectElapsed),
        elapsedMs: phase === 'running' ? truncateMs(t - startAt) : phase === 'done' ? result.solveMs : 0,
        penalty,
        result,
      };
    },
  };
  return machine;
}
