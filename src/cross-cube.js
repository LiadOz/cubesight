// Input-independent cube state. A future device adapter can supply this same
// representation; search and rendering do not depend on a scramble textbox.
export const FACE_COLORS = Object.freeze({ U:'white', D:'yellow', F:'green', B:'blue', R:'red', L:'orange' });
export const COLOR_HEX = Object.freeze({ white:'#ffffff', yellow:'#ffd500', green:'#009b48', blue:'#0051ba', red:'#e7332a', orange:'#ff6b00' });
const NORMAL = { U:[0,1,0], D:[0,-1,0], F:[0,0,1], B:[0,0,-1], R:[1,0,0], L:[-1,0,0] };
const FACE_BY_NORMAL = Object.fromEntries(Object.entries(NORMAL).map(([f,n])=>[n.join(','),f]));
const CORNERS = ['UFR','UBR','UBL','UFL','DFR','DBR','DBL','DFL'];
const EDGES = ['UF','UR','UB','UL','FR','BR','BL','FL','DF','DR','DB','DL'];
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const positionOf = id => [...id].reduce((p,f)=>p.map((v,i)=>v+NORMAL[f][i]),[0,0,0]);
const nameOf = ([x,y,z]) => `${y===1?'U':y===-1?'D':''}${z===1?'F':z===-1?'B':''}${x===1?'R':x===-1?'L':''}`;

export function parseScramble(input='') {
  if (typeof input !== 'string') throw new TypeError('Enter a scramble as move notation.');
  const tokens = input.trim().replace(/[′’]/g,"'").split(/\s+/).filter(Boolean);
  if (tokens.length > 200) throw new Error('Use at most 200 moves.');
  for (const token of tokens) if (!/^[URFDLB](?:2|')?$/.test(token)) throw new Error(`Unsupported move “${token.slice(0,30)}”. Use U, D, R, L, F, B with 2 or a prime.`);
  return tokens;
}

export function createSolvedState() {
  return { cubies: [...CORNERS,...EDGES,...Object.keys(NORMAL)].map(id=>({ id, position:positionOf(id), stickers:Object.fromEntries([...id].map(f=>[f,FACE_COLORS[f]])) })) };
}

// A clockwise face move is -90 degrees about its outward normal.
function quarter(v, n) {
  const projection = dot(v,n);
  const cross = [n[1]*v[2]-n[2]*v[1], n[2]*v[0]-n[0]*v[2], n[0]*v[1]-n[1]*v[0]];
  return v.map((_,i)=>n[i]*projection-cross[i]);
}

export function applyMoves(state, input) {
  const moves = parseScramble(typeof input === 'string' ? input : input.join(' '));
  let cubies = state.cubies.map(c=>({id:c.id,position:[...c.position],stickers:{...c.stickers}}));
  for (const move of moves) {
    const normal = NORMAL[move[0]];
    const turns = move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1;
    for (let turn=0;turn<turns;turn++) cubies = cubies.map(c=>dot(c.position,normal)!==1 ? c : {
      id:c.id, position:quarter(c.position,normal),
      stickers:Object.fromEntries(Object.entries(c.stickers).map(([f,color])=>[FACE_BY_NORMAL[quarter(NORMAL[f],normal).join(',')],color])),
    });
  }
  return { cubies };
}
export function stateFromScramble(scramble) { return applyMoves(createSolvedState(),parseScramble(scramble)); }

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
function solved(c) { return c && [...c.id].every(f=>c.stickers[f]===FACE_COLORS[f]); }
export function validateSolution(state,moves=[],crossFace='D') {
  if (!(crossFace in NORMAL)) throw new Error('Unknown cross face.');
  const result = applyMoves(state,moves);
  const byId = Object.fromEntries(result.cubies.map(c=>[c.id,c]));
  const crossSolved = EDGES.filter(id=>id.includes(crossFace)).every(id=>solved(byId[id]));
  const pairs = CORNERS.filter(id=>id.includes(crossFace)).flatMap(cornerId=>{
    const sides = [...cornerId].filter(f=>f!==crossFace);
    const edgeId = EDGES.find(id=>sides.every(f=>id.includes(f)));
    return solved(byId[cornerId]) && solved(byId[edgeId]) ? [{cornerId,edgeId,slot:edgeId}] : [];
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
