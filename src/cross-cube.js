// Input-independent cube state. A future device adapter can supply this same
// representation; search and rendering do not depend on a scramble textbox.
export const FACE_COLORS = Object.freeze({ U:'white', D:'yellow', F:'green', B:'blue', R:'red', L:'orange' });
export const COLOR_HEX = Object.freeze({ white:'#ffffff', yellow:'#ffd500', green:'#009b48', blue:'#0051ba', red:'#e7332a', orange:'#ff6b00' });
const NORMAL = { U:[0,1,0], D:[0,-1,0], F:[0,0,1], B:[0,0,-1], R:[1,0,0], L:[-1,0,0] };
const FACE_BY_NORMAL = Object.fromEntries(Object.entries(NORMAL).map(([f,n])=>[n.join(','),f]));
export const OPPOSITE_FACE = Object.freeze({U:'D',D:'U',F:'B',B:'F',R:'L',L:'R'});
export const CORNERS = ['UFR','UBR','UBL','UFL','DFR','DBR','DBL','DFL'];
export const EDGES = ['UF','UR','UB','UL','FR','BR','BL','FL','DF','DR','DB','DL'];
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const positionOf = id => [...id].reduce((p,f)=>p.map((v,i)=>v+NORMAL[f][i]),[0,0,0]);
const nameOf = ([x,y,z]) => `${y===1?'U':y===-1?'D':''}${z===1?'F':z===-1?'B':''}${x===1?'R':x===-1?'L':''}`;

export function inspectionOrientation(bottomFace='D',frontFace='F') {
  if (!(bottomFace in NORMAL) || !(frontFace in NORMAL)) throw new Error('Unknown inspection face.');
  if (bottomFace===frontFace || OPPOSITE_FACE[bottomFace]===frontFace) throw new Error('The front face must be adjacent to the bottom face.');
  const top=OPPOSITE_FACE[bottomFace];
  const right=FACE_BY_NORMAL[cross(NORMAL[top],NORMAL[frontFace]).join(',')];
  return {bottom:bottomFace,top,front:frontFace,right,visibleFaces:[top,frontFace,right]};
}

/**
 * Express canonical scramble moves in the notation of the cube as it is
 * currently held for inspection. The physical moves do not change; only the
 * face letters shown to the learner do.
 */
export function movesForInspection(input=[],bottomFace='D',frontFace='F') {
  const moves=parseScramble(typeof input==='string'?input:input.join(' '));
  const orientation=inspectionOrientation(bottomFace,frontFace);
  const faceMap={
    [orientation.top]:'U',
    [orientation.bottom]:'D',
    [orientation.front]:'F',
    [OPPOSITE_FACE[orientation.front]]:'B',
    [orientation.right]:'R',
    [OPPOSITE_FACE[orientation.right]]:'L',
  };
  return moves.map(move=>`${faceMap[move[0]]}${move.slice(1)}`);
}

export function frontFacesFor(bottomFace='D') {
  if (!(bottomFace in NORMAL)) throw new Error('Unknown bottom face.');
  const conventional={U:'F',D:'F',F:'U',B:'U',R:'U',L:'U'}[bottomFace];
  return [conventional,...Object.keys(NORMAL).filter(face=>face!==conventional&&face!==bottomFace&&face!==OPPOSITE_FACE[bottomFace])];
}

/**
 * Choose a useful fixed inspection angle without changing scramble notation.
 * Cross-colored stickers get the strongest weight, followed by distinct
 * target pieces and then the total number of their visible stickers.
 */
export function suggestInspectionFront(state,bottomFace='D',pieceIds=[]) {
  const targets=pieceIds.length?[...new Set(pieceIds)]:state.cubies.filter(c=>c.id.length===2&&c.id.includes(bottomFace)).map(c=>c.id);
  const ranked=frontFacesFor(bottomFace).map((face,index)=>{
    const visible=new Set(inspectionOrientation(bottomFace,face).visibleFaces);
    let crossStickers=0,visiblePieces=0,visibleStickers=0;
    for(const id of targets){
      const cubie=state.cubies.find(candidate=>candidate.id===id);if(!cubie)continue;
      const shown=Object.keys(cubie.stickers).filter(stickerFace=>visible.has(stickerFace));
      if(shown.length)visiblePieces++;
      visibleStickers+=shown.length;
      const crossSticker=Object.entries(cubie.stickers).find(([,color])=>color===FACE_COLORS[bottomFace])?.[0];
      if(crossSticker&&visible.has(crossSticker))crossStickers++;
    }
    return {face,crossStickers,visiblePieces,visibleStickers,index,score:crossStickers*100+visiblePieces*10+visibleStickers};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
  const best=ranked[0];
  return {...best,choices:ranked.length,tiedChoices:ranked.filter(candidate=>candidate.score===best.score).length};
}

// allowRotations (opt-in, used by the move guide) also admits lowercase wide
// (r) and whole-cube rotations (x y z) as algorithm notation writes them; the
// smart-cube session never passes it, so its behaviour is unchanged.
export function parseScramble(input='', { allowWide = false, allowRotations = false } = {}) {
  if (typeof input !== 'string') throw new TypeError('Enter a scramble as move notation.');
  const tokens = input.trim().replace(/[′’]/g,"'").split(/\s+/).filter(Boolean);
  if (tokens.length > 200) throw new Error('Use at most 200 moves.');
  // allowWide also admits slice moves (M, E, S): smart cubes and the move model
  // treat both as ordinary single moves, but manual scramble entry stays strict.
  const pattern = allowRotations ? /^(?:[URFDLB]w?|[urfdlb]|[MESxyz])(?:2|')?$/
    : allowWide ? /^(?:[URFDLB]w?|[MES])(?:2|')?$/ : /^[URFDLB](?:2|')?$/;
  for (const token of tokens) if (!pattern.test(token)) throw new Error(`Unsupported move “${token.slice(0,30)}”. Use U, D, R, L, F, B${allowWide ? ', a wide move such as Rw, or a slice move (M, E, S),' : ''}${allowRotations ? ' a lowercase wide move (r), a rotation (x, y, z),' : ''} with 2 or a prime.`);
  return tokens;
}

export function createSolvedState() {
  return { cubies: [...CORNERS,...EDGES,...Object.keys(NORMAL)].map(id=>({ id, position:positionOf(id), stickers:Object.fromEntries([...id].map(f=>[f,FACE_COLORS[f]])) })) };
}

export function sameCubeState(a, b) {
  if (!a?.cubies || !b?.cubies || a.cubies.length !== b.cubies.length) return false;
  const byId = new Map(b.cubies.map(cubie => [cubie.id, cubie]));
  return a.cubies.every(cubie => {
    const other = byId.get(cubie.id);
    return other && cubie.position.every((value, index) => value === other.position[index])
      && Object.entries(cubie.stickers).every(([face, color]) => other.stickers[face] === color);
  });
}

// A clockwise face move is -90 degrees about its outward normal.
function quarter(v, n) {
  const projection = dot(v,n);
  const cross = [n[1]*v[2]-n[2]*v[1], n[2]*v[0]-n[0]*v[2], n[0]*v[1]-n[1]*v[0]];
  return v.map((_,i)=>n[i]*projection-cross[i] || 0);
}

// Slice moves turn the middle layer in the direction of a reference face (WCA):
// M follows L, E follows D, S follows F. Like wide moves, they carry centres.
const SLICE_FACE = Object.freeze({ M:'L', E:'D', S:'F' });

export function applyMoves(state, input) {
  const moves = parseScramble(typeof input === 'string' ? input : input.join(' '), { allowWide: true });
  let cubies = state.cubies.map(c=>({id:c.id,position:[...c.position],stickers:{...c.stickers}}));
  for (const move of moves) {
    const slice = move[0] in SLICE_FACE;
    const normal = NORMAL[slice ? SLICE_FACE[move[0]] : move[0]];
    const wide = move[1] === 'w';
    // Layer depth along the turning face's normal: 1 = face, 0 = middle, -1 = opposite face.
    const turnsLayer = depth => slice ? depth === 0 : wide ? depth >= 0 : depth === 1;
    const turns = move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1;
    for (let turn=0;turn<turns;turn++) cubies = cubies.map(c=>!turnsLayer(dot(c.position,normal)) ? c : {
      id:c.id, position:quarter(c.position,normal),
      stickers:Object.fromEntries(Object.entries(c.stickers).map(([f,color])=>[FACE_BY_NORMAL[quarter(NORMAL[f],normal).join(',')],color])),
    });
  }
  return { cubies };
}
export function stateFromScramble(scramble) { return applyMoves(createSolvedState(),parseScramble(scramble)); }

// Rotate the whole cube so that `toBottomFace` sits on the bottom (D). Used to
// bring a colour-neutral cross onto D so last-layer recognisers (PLL/OLL, which
// are defined relative to U) can run. This is a rigid-body relabelling: it
// permutes positions and sticker face keys, and moves centres along with the
// pieces — physically rotating the cube, not turning a layer.
const rotationMatrix = (fromNormal, toNormal) => {
  const a = fromNormal, b = toNormal;
  const dotP = dot(a, b);
  if (dotP > 0.999999) return [[1,0,0],[0,1,0],[0,0,1]];
  if (dotP < -0.999999) {
    // 180° about any axis perpendicular to a.
    const axis = Math.abs(a[1]) < 0.9 ? cross(a,[0,1,0]) : cross(a,[1,0,0]);
    const n = Math.hypot(...axis) || 1;
    const [x,y,z] = axis.map(v => v/n);
    return [[2*x*x-1, 2*x*y, 2*x*z],[2*x*y, 2*y*y-1, 2*y*z],[2*x*z, 2*y*z, 2*z*z-1]];
  }
  const axis = cross(a, b);
  const sin = Math.hypot(...axis);
  const cos = dotP;
  const [x,y,z] = axis.map(v => v/sin);
  const t = 1 - cos;
  return [
    [t*x*x+cos,   t*x*y - z*sin, t*x*z + y*sin],
    [t*x*y + z*sin, t*y*y+cos,   t*y*z - x*sin],
    [t*x*z - y*sin, t*y*z + x*sin, t*z*z+cos],
  ];
};
const applyMatrix = (m, v) => [m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2], m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2], m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]];
export function reorientState(state, toBottomFace = 'D') {
  if (!(toBottomFace in NORMAL)) throw new Error('Unknown face.');
  const m = rotationMatrix(NORMAL[toBottomFace], NORMAL.D);
  const faceByNormal = new Map(Object.entries(NORMAL).map(([face, n]) => [n.join(','), face]));
  const remapFace = (face) => faceByNormal.get(applyMatrix(m, NORMAL[face]).map(v => Object.is(v, -0) ? 0 : v).join(','));
  return { cubies: state.cubies.map(cubie => ({
    id: cubie.id,
    position: applyMatrix(m, cubie.position).map(v => Object.is(v, -0) ? 0 : v),
    stickers: Object.fromEntries(Object.entries(cubie.stickers).map(([face, color]) => [remapFace(face), color])),
  })) };
}

// Colour-neutral view for last-layer recognisers (PLL/OLL), which are defined
// relative to a white U layer. Unlike reorientState, this derives the
// rotation from where the cross colour's centre ACTUALLY sits, so it works for
// any canonical or pre-rotated state: bring the cross colour to the bottom,
// then recolour every sticker from the resulting centres so the cube reads as a
// standard solved-frame scramble with the same piece permutation.
const centerWithColor = (state, color) => state.cubies.find(c => c.id.length === 1 && Object.values(c.stickers).includes(color));
export function canonicalizeForRecognition(state, crossFace = 'D') {
  if (!(crossFace in FACE_COLORS)) throw new Error('Unknown cross face.');
  const crossColor = FACE_COLORS[crossFace];
  const crossCenter = centerWithColor(state, crossColor);
  if (!crossCenter) return state;
  const pos = crossCenter.position;
  const m = rotationMatrix(pos, NORMAL.D);
  const faceByNormal = new Map(Object.entries(NORMAL).map(([face, n]) => [n.join(','), face]));
  const remapFace = (face) => faceByNormal.get(applyMatrix(m, NORMAL[face]).map(v => Object.is(v, -0) ? 0 : v).join(','));
  const reoriented = { cubies: state.cubies.map(cubie => ({
    id: cubie.id,
    position: applyMatrix(m, cubie.position).map(v => Object.is(v, -0) ? 0 : v),
    stickers: Object.fromEntries(Object.entries(cubie.stickers).map(([face, color]) => [remapFace(face), color])),
  })) };
  const colorOfFace = {};
  for (const face of Object.keys(FACE_COLORS)) {
    const center = reoriented.cubies.find(c => c.id.length === 1 && c.stickers[face] !== undefined);
    if (center) colorOfFace[center.stickers[face]] = FACE_COLORS[face];
  }
  return { cubies: reoriented.cubies.map(cubie => ({
    id: cubie.id, position: cubie.position,
    stickers: Object.fromEntries(Object.entries(cubie.stickers).map(([f, color]) => [f, colorOfFace[color] || color])),
  })) };
}

export function planPieceIds(state, face, pairs=[]) {
  return [...new Set([
    ...state.cubies.filter(c=>c.id.length===2 && c.id.includes(face)).map(c=>c.id),
    ...pairs.flatMap(pair=>[pair.cornerId,pair.edgeId]),
  ])];
}

export function toRenderData(state, highlightedIds=[]) {
  const data = {mode:'scout', colors:{},cornerStickers:{},stickerColors:{},targets:[],showAllCorners:true,highlightedPieces:[],corners:[],edges:[]};
  for (const cubie of state.cubies) {
    const position = nameOf(cubie.position);
    if (highlightedIds.includes(cubie.id)) data.highlightedPieces.push(position);
    const kind = cubie.id.length;
    if (kind===1) for (const [face,color] of Object.entries(cubie.stickers)) data.colors[face]=COLOR_HEX[color];
    else {
      data[kind===3?'corners':'edges'].push({...cubie,position});
      for (const [face,color] of Object.entries(cubie.stickers)) data[kind===3?'cornerStickers':'stickerColors'][`${face}:${position}`]=COLOR_HEX[color];
    }
  }
  return data;
}
function solved(c, centers = FACE_COLORS) { return c && Object.entries(c.stickers).every(([face,color])=>color===centers[face]); }
export function validateSolution(state,moves=[],crossFace='D') {
  if (!(crossFace in NORMAL)) throw new Error('Unknown cross face.');
  const result = applyMoves(state,moves);
  const byId = Object.fromEntries(result.cubies.map(c=>[c.id,c]));
  const centers = Object.fromEntries(result.cubies.filter(c=>c.id.length===1).flatMap(c=>Object.entries(c.stickers)));
  const crossSolved = EDGES.filter(id=>id.includes(crossFace)).every(id=>solved(byId[id],centers));
  const pairs = CORNERS.filter(id=>id.includes(crossFace)).flatMap(cornerId=>{
    const sides = [...cornerId].filter(f=>f!==crossFace);
    const edgeId = EDGES.find(id=>sides.every(f=>id.includes(f)));
    return solved(byId[cornerId],centers) && solved(byId[edgeId],centers) ? [{cornerId,edgeId,slot:edgeId}] : [];
  });
  return {crossSolved,pairs};
}

function connected(state,pair) {
  const corner = state.cubies.find(c=>c.id===pair.cornerId), edge = state.cubies.find(c=>c.id===pair.edgeId);
  if (!corner || !edge || corner.position.reduce((sum,v,i)=>sum+Math.abs(v-edge.position[i]),0)!==1) return false;
  return Object.entries(edge.stickers).every(([face,color])=>corner.stickers[face]===color);
}

export function classifyOpportunity(state,moves=[],face='D',pairs=[]) {
  const ids = pairs.flatMap(p=>[p.cornerId,p.edgeId]);
  if (!pairs.length) return {label:'Cross fundamentals',difficulty:'medium',description:'Compare the cross-edge route and its move count. This plan does not finish an F2L pair.',highlightedIds:[]};
  const states=[state];
  for (const move of moves) states.push(applyMoves(states.at(-1),[move]));
  const allPreserved = pairs.every(pair=>states.every(s=>connected(s,pair)));
  if (allPreserved) return {label:pairs.length>1?'Preserve connected pairs':'Preserve a pair',difficulty:'easy',description:'These corner–edge pieces are already connected, and this entire plan keeps them together. Look for their matching two-color block before planning the cross.',highlightedIds:ids};
  const firstMovePairs = moves.length && pairs.every(pair=>states.slice(1).every(s=>connected(s,pair)));
  if (firstMovePairs) return {label:'One-move pairing',difficulty:'easy',description:`After the first move (${moves[0]}), all highlighted pairs are connected and stay together for the rest of this plan.`,highlightedIds:ids};
  const anchors = pairs.every(pair=>[pair.cornerId,pair.edgeId].some(id=>states.every(s=>solved(s.cubies.find(c=>c.id===id)))));
  if (anchors) return {label:'Use a solved piece',difficulty:'medium',description:'Each highlighted pair has a piece already solved that this plan leaves in place. Track its partner instead of both pieces.',highlightedIds:ids};
  const lands = pairs.every(pair=>states.slice(1,-1).some((s,i)=>[pair.cornerId,pair.edgeId].some(id=>states.slice(i+1).every(t=>solved(t.cubies.find(c=>c.id===id))))));
  if (lands) return {label:'Piece lands solved',difficulty:'medium',description:'A pair member reaches its solved position before the plan ends and stays there. Step through to see where its partner joins it.',highlightedIds:ids};
  return {label:'Tracking required',difficulty:'hard',description:'No preserved-pair or one-move-pairing cue was found in this plan. It may be short, but discovering it requires tracking the highlighted pieces through several moves.',highlightedIds:ids};
}

export function randomScramble(length=25) {
  const values = crypto.getRandomValues(new Uint32Array(length*2));
  const faces=Object.keys(NORMAL); let previous=''; const moves=[];
  for(let i=0;i<length;i++) {
    const allowed=faces.filter(f=>f!==previous); const face=allowed[values[i*2]%allowed.length];
    moves.push(face+['',"'",'2'][values[i*2+1]%3]); previous=face;
  }
  return moves.join(' ');
}
