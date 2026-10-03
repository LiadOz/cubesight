const variants = {
  A: `[data-lab-proposal="history-list"][data-lab-variant="A"] .history-list { display:grid; gap:.75rem; } [data-lab-proposal="history-list"][data-lab-variant="A"] .history-list > * { border-inline-start:3px solid var(--accent); }`,
  B: `[data-lab-proposal="history-list"][data-lab-variant="B"] .history-list { display:grid; gap:0; border-block-start:1px solid var(--line); } [data-lab-proposal="history-list"][data-lab-variant="B"] .history-list > * { border:0; border-block-end:1px solid var(--line); border-radius:0; box-shadow:none; }`,
};

export default {
  id: 'history-list',
  title: 'History list',
  why: 'Compare card separation with a compact timeline while using stored-record rows from the real History page.',
  page: 'history',
  route: '/history',
  component: '.history-list',
  fixture: 'history',
  states: ['default', 'filtered'],
  variants: [
    { id: 'A', label: 'Separated cards', description: 'Each solve reads as its own card.', apply: () => variants.A },
    { id: 'B', label: 'Timeline rows', description: 'A continuous list with dividers.', apply: () => variants.B },
  ],
};
