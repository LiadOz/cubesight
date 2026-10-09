// State main.js and the two legacy trainers (corners, F2L) share. Kept tiny and free of imports, so main.js can
// hold it without pulling any trainer code in.

/** activeTool and paused mirror the page's route and pause state; toast is the app toast slot. */
export const host = {
  activeTool: 'corner',
  paused: false,
  toast: null,
  trialTimeout: null,
  /** Set by main.js: pause the practice the user is on (the trial timeout calls it). */
  pause: () => {},
};

/** The round panel of each trainer, by tool id; created by the trainer when it opens. */
export const legacyRounds = Object.create(null);
