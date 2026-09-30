// Session focus. People train differently, so every solve (and therefore every
// automatic session) carries the focus that was active when it finished:
//   speed     full-speed solving: time, ao5/ao12/ao50/ao100, PB
//   flow      steady TPS with few pauses: TPS mean and spread, gap consistency, pauses
//   learning  slow and deliberate: move count, review accuracy
// Statistics are never mixed across foci (a slow learning solve must not spoil a
// speed average); an explicit "all" view exists and is flagged as mixed.
// Records written before foci existed are 'speed'.

export const FOCI = Object.freeze(['speed', 'flow', 'learning']);
export const DEFAULT_FOCUS = 'speed';

export const normalizeFocus = value => (FOCI.includes(value) ? value : DEFAULT_FOCUS);

/** The focus of a record; missing means speed (migrated old records). */
export const focusOf = record => normalizeFocus(record?.focus);

/** Only the records of one focus. */
export const inFocus = (records, focus) => {
  const wanted = normalizeFocus(focus);
  return records.filter(r => focusOf(r) === wanted);
};
