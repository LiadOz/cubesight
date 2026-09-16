const pose = (id,label,yaw,pitch) => Object.freeze({id,label,yaw,pitch});

// Degrees relative to the ordinary U/F/R solve view. Horizontal variation is
// intentionally wider than vertical variation, and every pose remains well
// inside the same three-face viewing octant.
export const CORNER_VIEW_POSES = Object.freeze([
  pose('center','centered',0,0),
  pose('left','slightly left',-8,0),
  pose('right','slightly right',8,0),
  pose('up','slightly above',0,-4.5),
  pose('down','slightly below',0,4.5),
  pose('left-up','left and above',-6,-3.5),
  pose('right-up','right and above',6,-3.5),
  pose('left-down','left and below',-6,3.5),
  pose('right-down','right and below',6,3.5),
]);

export function chooseCornerView(previousId='',random=Math.random) {
  const candidates=CORNER_VIEW_POSES.filter(item=>item.id!==previousId);
  const value=Number(random());
  const index=Math.min(candidates.length-1,Math.max(0,Math.floor((Number.isFinite(value)?value:0)*candidates.length)));
  return candidates[index];
}
