// Stylelint: syntax errors and likely mistakes only (no style/ordering nits).
// An unclosed block is a CssSyntaxError and always fails.
export default {
  extends: ['stylelint-config-recommended'],
  rules: {
    // Ordering heuristic; flags dozens of intentional component-scoped rules.
    'no-descending-specificity': null,
    // Worth seeing, but not build-breaking.
    'no-duplicate-selectors': [true, { severity: 'warning' }],
    'declaration-property-value-keyword-no-deprecated': [true, { severity: 'warning' }],
  },
};
