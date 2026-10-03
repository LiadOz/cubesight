const actions = {
  A: `.brain .f1-results[data-lab-proposal="results-actions"][data-lab-variant="A"] .f1-results__actions { display:flex; flex-wrap:wrap; gap:.5rem; } .brain .f1-results[data-lab-proposal="results-actions"][data-lab-variant="A"] .f1-results__actions > * { flex:1 1 9rem; }`,
  B: `.brain .f1-results[data-lab-proposal="results-actions"][data-lab-variant="B"] .f1-results__actions { display:grid; grid-template-columns:1fr 1fr; gap:.65rem; } .brain .f1-results[data-lab-proposal="results-actions"][data-lab-variant="B"] .f1-results__actions > :first-child { grid-column:1/-1; }`,
  C: `.brain .f1-results[data-lab-proposal="results-actions"][data-lab-variant="C"] .f1-results__actions { display:flex; flex-direction:column; gap:.4rem; max-width:22rem; } .brain .f1-results[data-lab-proposal="results-actions"][data-lab-variant="C"] .f1-results__actions > * { width:100%; }`,
};

export default {
  id: 'results-actions',
  title: 'Results actions',
  why: 'Compare action hierarchy and reach while keeping the real solve summary, Orbit, and Cube in place.',
  page: 'solve results',
  route: '/solve',
  component: '.f1-results__actions',
  fixture: 'results',
  states: ['results', 'review-detail'],
  variants: [
    { id: 'A', label: 'Wrapped row', description: 'Actions share the available width.', apply: () => actions.A },
    { id: 'B', label: 'Lead action', description: 'The first action gets a full row.', apply: () => actions.B },
    { id: 'C', label: 'Stacked', description: 'Actions use a single vertical column.', apply: () => actions.C },
  ],
};
