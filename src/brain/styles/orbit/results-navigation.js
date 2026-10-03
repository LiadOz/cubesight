export function resolvePastReviewHref(pastNavigation, selectedMarker, fallback) {
  const destination = typeof pastNavigation?.reviewHref === 'function'
    ? pastNavigation.reviewHref(selectedMarker)
    : pastNavigation?.reviewHref;
  return typeof destination === 'string' && destination ? destination : fallback;
}
