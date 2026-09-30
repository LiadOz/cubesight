// Shared stage geometry for the Orbit ring overlays (timeline + inspection).
// Both SVGs use the same viewBox and are stacked over the cube, so the ring
// sits exactly around it. The ring hugs the cube (the cube mount is ~54 % of
// the stage width, see orbit.css); labels live outside the ring, in the margin
// the box leaves around it.
export const VB_W = 640;
export const VB_H = 500;
export const CX = VB_W / 2;
export const CY = VB_H / 2;
export const R = 200;
export const VIEWBOX = `0 0 ${VB_W} ${VB_H}`;

export const secs = ms => (ms == null || !Number.isFinite(ms) ? '' : (ms / 1000).toFixed(2));

/** Short ring label: the full label when it is short, otherwise the short form. */
export const ringName = seg => (seg.label && seg.label.length <= 5 ? seg.label : seg.short || seg.label || seg.key);

/** Four-point spark used for skips (centred on 0,0). */
export const SPARK_PATH = 'M0 -7 C1 -2 2 -1 7 0 C2 1 1 2 0 7 C-1 2 -2 1 -7 0 C-2 -1 -1 -2 0 -7 Z';
