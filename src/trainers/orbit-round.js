import { createCoachLine } from '../ui/shared/index.js';
import { buildRoundSegments } from '../drills/round-segments.js';
import './trainer-orbit.css';

/** Keeps a timer and marker-linked coach sentence on the trainer's one round Orbit. */
export function createTrainerOrbit(stage, { customSegments = () => null } = {}) {
  if (!stage) return null;
  let orbit = null, getViewModel = () => null;
  stage.classList.add('trainer-orbit-stage');
  const slot = document.createElement('span');
  slot.className = 'trainer-orbit-slot';
  slot.setAttribute('aria-live', 'polite');
  const coachHost = document.createElement('div');
  coachHost.className = 'trainer-coach-host';
  coachHost.hidden = true;
  stage.append(slot, coachHost);
  const coach = createCoachLine(coachHost, { text: '' });
  let activeIndex = 0, generation = 0, lastCoachText = '', lastCoachMarker = null;

  function paint({ index = activeIndex, value = '', text = '', state = 'current', elapsed = null } = {}) {
    const paintGeneration = ++generation;
    activeIndex = Math.max(0, Number(index) || 0);
    if (!orbit) return;
    const round = getViewModel()?.round;
    const answers = round?.answers ?? [];
    const total = round?.total || 1;
    // A drill may own the ring for a smaller unit than the round (the corner drill's three guesses of one case).
    const custom = customSegments();
    const segments = custom ?? buildRoundSegments(round ?? { status: 'idle', answers: [] }, total);
    const markers = custom ? custom.flatMap((segment, at) => segment.state === 'good' || segment.state === 'bad'
      ? [{ key: `result-${at + 1}`, segment: segment.key, position: .5, type: segment.state === 'good' ? 'good' : 'wrong', label: segment.state === 'good' ? 'correct' : 'miss' }] : [])
      : answers.map((answer, at) => ({ key: `result-${at + 1}`, segment: `case-${at + 1}`, position: .5,
      type: answer.correct ? 'good' : 'wrong', label: answer.correct ? 'correct' : 'miss' }));
    const currentMarker = ['good', 'bad', 'wrong'].includes(state) ? `result-${activeIndex + 1}` : null;
    if (currentMarker) lastCoachMarker = currentMarker;
    if (text) lastCoachText = text;
    else if (state === 'current') { lastCoachMarker = null; lastCoachText = ''; }
    coachHost.hidden = !lastCoachText;
    const update = orbit.update({ segments, markers });
    if (value || elapsed != null) slot.textContent = value || `${(elapsed / 1000).toFixed(2)} s`;
    else slot.textContent = custom ? '' : round ? `${round.answered} / ${round.total}` : `${activeIndex + 1}`;
    Promise.resolve(update).then(() => {
      if (paintGeneration === generation) coach.update({ text: lastCoachText, marker: lastCoachMarker, orbit });
    });
  }

  return {
    connect(nextOrbit, getModel = () => null) { orbit = nextOrbit; getViewModel = getModel; paint(); },
    update: paint,
    tick(value) { slot.textContent = String(value ?? ''); },
    destroy() { generation++; coach.destroy(); slot.remove(); coachHost.remove(); stage.classList.remove('trainer-orbit-stage'); },
  };
}
