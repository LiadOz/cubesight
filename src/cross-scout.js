import './cross-scout.css';
import { createCube3D } from './cube-3d.js';
import { FACE_COLORS, COLOR_HEX, parseScramble, stateFromScramble, applyMoves, toRenderData, validateSolution, classifyOpportunity, randomScramble, planPieceIds, frontFacesFor, suggestInspectionFront, inspectionOrientation, movesForInspection } from './cross-cube.js';
import { solveCross, terminateCrossSolver } from './cross-solver.js';
import { smartCube } from './smart-cube-bluetooth.js';
import { createSmartCubeTurnGuide } from './smart-cube-turn-guide.js';
import { followPlanTurn, recoveryMoves } from './smart-cube-guidance.js';
import { fmt } from './copy/terms.js';
import { openHistory } from './store/history.js';


const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title = value => value[0].toUpperCase()+value.slice(1);
const stageName = count => count===0?'cross':count===1?'x-cross':count===2?'xx-cross':`${count}-pair x-cross`;
const CLUES = {
  'Cross fundamentals': ['Cross edges only', 'Follow the four cross edges; this plan does not finish an F2L pair.'],
  'Preserve a pair': ['Pieces already paired', 'The corner and edge start together and stay together.'],
  'Preserve connected pairs': ['Pieces already paired', 'The pairs start connected and stay connected throughout the plan.'],
  'One-move pairing': ['Paired after one move', 'After the first turn, the pair pieces are connected and stay together.'],
  'Use a solved piece': ['One piece already solved', 'A pair member starts solved and stays there; follow its partner.'],
  'Piece lands solved': ['One piece solves early', 'A pair member reaches its slot early; its partner joins later.'],
  'Tracking required': ['Several moves to track', 'No simple pairing cue was found; follow the pieces through the moves.'],
};
const clue = result => CLUES[result.cue.label] || [result.cue.label,result.cue.description];
const PRACTICE_STORE = 'cubesight-scout-practice-v1';
const practiceSummary = value => value ? fmt.time(value, { unit: true }) : '—';

export function createCrossScout(root, cubeSession = smartCube) {
  let allowed=['U'];
  try { const saved=JSON.parse(localStorage.getItem('cubesight-scout-colors')); if(Array.isArray(saved) && saved.length && saved.every(f=>Object.hasOwn(FACE_COLORS,f))) allowed=[...new Set(saved)]; } catch { /* Use white initially. */ }
  const routeQuery = new URLSearchParams((globalThis.location?.hash ?? '').split('?')[1] ?? '');
  const reviewFrom = /^review:(\d+):(\d+)$/.exec(routeQuery.get('from') ?? '');
  const reviewSetup = /^review:(\d+):(\d+)$/.exec(routeQuery.get('setup') ?? '');
  const linkedScramble = (routeQuery.get('scramble') ?? (reviewSetup ? '' : routeQuery.get('setup')))?.replaceAll('_', ' ').replaceAll('-', "'").replace(/[′’]/g, "'").trim() ?? '';
  const linkedFace = routeQuery.get('face');
  if (reviewFrom && linkedFace && Object.hasOwn(FACE_COLORS, linkedFace)) allowed = [linkedFace];
  let source=stateFromScramble(''), results=[], selected=null, step=0, states=[], active=true, playing=false, playbackGeneration=0;
  let controller=null, requestGeneration=0, currentScramble='', busy=false;
  let highlightsOn=false;
  let fullTouchRotation=false;
  let practice=null;
  let viewBottom='D',viewFront='F',suggestedFront=null;
  let lastLiveScramble=null;
  let scrambleGuideIndex=0,manualScrambleGuide=true;
  let offPlanMoves=[];
  let lastGyro=null,lastSmartStatus='';
  root.innerHTML=`
    <section class="intro-row"><div><p class="eyebrow">drills / cross scout</p><h1>cross scout</h1></div><p class="intro-copy">Find a cross plan.<br>See what to look for.</p></section>
    <section class="scout-input" aria-label="Cross calculator input">
      <label for="scout-scramble">your scramble</label>
      <div class="scout-scramble-row"><textarea id="scout-scramble" rows="2" spellcheck="false" autocomplete="off" autocapitalize="characters" placeholder="Paste a scramble, or generate one…"></textarea><button class="scout-button" id="scout-random">New scramble</button></div>
      <small>Enter the scramble from solved with white on top and green in front. After you select a plan, its move notation follows the held view below. Face turns only: U D R L F B, with 2 or ′.</small>
      <div class="scout-smart-cube" aria-label="Smart cube connection">
        <div><strong id="scout-smart-title">cube · disconnected</strong><p id="scout-smart-status" role="status" aria-live="polite">Connect to mirror turns from a solved position.</p></div>
        <div class="scout-smart-actions"><button class="scout-button" id="scout-smart-connect">connect cube</button><button class="scout-button" id="scout-smart-sync" hidden>sync</button><button class="scout-button" id="scout-smart-recenter" hidden>recenter</button><button class="scout-button" id="scout-smart-disconnect" hidden>disconnect</button></div>
        <details class="scout-mac-help" id="scout-mac-help"><summary>Asked for a cube MAC address? Find it in Chrome</summary>
          <ol><li>Open Chrome on Android, Windows, or Linux. If CubeSight is installed as an app, switch to Chrome so you have an address bar.</li><li>Paste <code>chrome://bluetooth-internals/#devices</code> into Chrome’s address bar and open it. <button type="button" class="scout-mac-copy" id="scout-mac-copy">copy address</button><span class="scout-mac-copy-status" id="scout-mac-copy-status" role="status" aria-live="polite"></span></li><li>Turn on your GAN cube, tap <strong>start scan</strong>, and find its Bluetooth name in the device list. Copy the value in the <strong>address</strong> column (six pairs of hex digits).</li><li>Return to CubeSight, connect the cube, and enter that address if prompted. After a verified connection, this browser remembers it.</li></ol>
          <p>Chrome on macOS can show a substitute address, so use Android, Windows, or Linux to find the real one. If Chrome does not show it on Android, a Bluetooth scanner such as <a href="https://github.com/NordicSemiconductor/Android-nRF-Connect" target="_blank" rel="noopener noreferrer">nRF Connect</a> can show nearby device addresses.</p>
        </details>
      </div>
      <div class="scout-options"><div><span class="scout-label">cross colors · choose a subset or color neutral (CN)</span><div class="scout-colors" id="scout-colors" role="group" aria-label="cross colors"></div></div><div class="scout-options-actions"><button class="new-case-button" id="scout-analyze">find plans</button><button class="scout-button" id="scout-stop" hidden>stop search</button></div></div>
      <div class="scout-orientation"><div><span class="scout-label">Inspection orientation</span><strong id="scout-bottom-label"></strong><small id="scout-front-reason"></small></div><label for="scout-front"><span>Front face</span><select id="scout-front" aria-label="Front face for inspection"></select></label></div>
      <p class="scout-message" id="scout-message" role="status" aria-live="polite">Apply the scramble to your cube, then compare plans. No timer or score.</p>
    </section>
    <section class="trainer-shell scout-shell">
      <div class="cube-stage"><div class="stage-topline"><span class="status-dot"><i></i> inspect every face</span><span class="view-lock">free tumble</span></div><div id="scout-cube" class="cube-mount"></div><div class="cube-caption"><span id="scout-view-caption">white top · green front · red right</span><div class="scout-view-actions"><button class="text-button" id="scout-touch-mode" aria-pressed="false">touch: scroll + rotate</button><button class="text-button" id="scout-reset-view">reset view</button></div></div><div id="scout-turn-guide" hidden></div></div>
      <div class="scout-plan"><p class="eyebrow">your plan</p><span id="scout-family" class="scout-family">start with the cross</span><h2 id="scout-plan-title">What can you spot?</h2><p id="scout-explanation">Find plans for cross, x-cross, and xx-cross. Select one to see which pieces matter.</p><p class="scout-pieces" id="scout-pieces"></p><div id="scout-moves" class="scout-moves" aria-label="solution moves"></div><div class="scout-playback"><button class="scout-button" id="scout-start" disabled>restart</button><button class="scout-button" id="scout-prev" disabled aria-label="previous move">←</button><button class="scout-button" id="scout-play" disabled>play</button><button class="scout-button" id="scout-next" disabled aria-label="next move">→</button></div><span class="scout-step-note" id="scout-step">scrambled state</span><button class="scout-practice-launch" id="scout-practice" disabled>drill this plan</button><section class="scout-practice-panel" id="scout-practice-panel" hidden aria-live="polite"><span class="scout-practice-kicker">recall</span><h3 id="scout-practice-title">Find the pieces before you reveal the plan</h3><p id="scout-practice-copy">On the unassisted cube, identify the four cross edges and highlighted pair pieces. Choose what you would inspect first, then reveal.</p><div class="scout-practice-actions"><button class="scout-button scout-practice-reveal" id="scout-practice-reveal">reveal plan</button><button class="scout-button" id="scout-practice-exit">stop</button></div><div class="scout-practice-result" id="scout-practice-result" hidden><p id="scout-practice-time"></p><p id="scout-practice-cue"></p><div class="scout-practice-rating"><span>Did you spot it?</span><button class="scout-button" data-practice-rating="found">found</button><button class="scout-button" data-practice-rating="missed">missed</button></div><p class="scout-practice-history" id="scout-practice-history"></p></div></section></div>
    </section>
    <section class="scout-results"><div class="scout-results-head"><h2>plans found</h2><select id="scout-sort" aria-label="sort plans"><option value="cue">easiest cues first</option><option value="moves">fewest moves first</option></select></div><div id="scout-results" class="scout-result-grid"></div><p id="scout-empty" class="scout-empty">Choose cross colors and find plans for candidates.</p><p class="scout-footnote">Recognition labels describe structural cues in the plan, not measured human difficulty. They do not account for what was visible from your chosen viewing angle. Search is bounded: “not found” does not mean impossible. Move counts use face turns (R2 counts as one). These are random-move scrambles, not competition random-state scrambles.</p><p class="scout-footnote">Search uses the MIT-licensed <a href="https://github.com/vangie/cube-xcross" target="_blank" rel="noopener noreferrer">cube-xcross engine</a>, which runs locally. Smart-cube moves stay on your device. Bluetooth needs a compatible cube and a supported browser on a secure page.</p></section>`;
  const $=selector=>root.querySelector(selector);
  if (reviewFrom) {
    const back = document.createElement('a');
    back.className = 'scout-review-back';
    back.href = `#/review/${reviewFrom[1]}?move=${reviewFrom[2]}`;
    back.textContent = `← review · solve · move ${Number(reviewFrom[2]) + 1}`;
    $('.intro-row').append(back);
  }
  const turnGuide=createSmartCubeTurnGuide($('#scout-turn-guide'),{
    onPrevious:()=>{scrambleGuideIndex=Math.max(0,scrambleGuideIndex-1);renderTurnGuide();},
    onNext:()=>{scrambleGuideIndex++;renderTurnGuide();},
  });
  const guide=document.createElement('details');
  guide.className='scout-guide';
  guide.innerHTML=`<summary>What do the plan labels mean?</summary>
    <div><h3>What gets solved</h3><p><strong>cross:</strong> the four cross edges. <strong>x-cross:</strong> cross + one F2L pair. <strong>xx-cross:</strong> cross + two F2L pairs.</p>
    <h3>What to look for</h3><p>These are recognition clues, not different solving methods or guaranteed difficulty ratings. A plan can have several clues; we show the first matching one.</p>
    <dl>${Object.entries(CLUES).filter(([key])=>key!=='Preserve connected pairs'&&key!=='Cross fundamentals').map(([,value])=>`<dt>${value[0]}</dt><dd>${value[1]}</dd>`).join('')}</dl>
    <p class="scout-check-note">Every plan is simulated from your scramble to check that its cross and listed pairs finish solved. This confirms the moves. It does not mean the plan is easy to spot or ideal for you.</p></div>`;
  $('.scout-results-head').after(guide);
  const highlightButton=document.createElement('button');
  highlightButton.id='scout-highlight';highlightButton.className='scout-highlight';
  highlightButton.textContent='Highlight pieces';
  highlightButton.setAttribute('aria-label','Highlight cross and F2L pieces');
  highlightButton.setAttribute('aria-pressed','false');highlightButton.disabled=true;
  $('.stage-topline .view-lock').replaceWith(highlightButton);
  const cube=createCube3D($('#scout-cube'),{mode:'scout'});
  function renderTouchMode(){
    cube.setFullTouchRotation(fullTouchRotation);
    $('#scout-touch-mode').setAttribute('aria-pressed',String(fullTouchRotation));
    $('#scout-touch-mode').textContent=fullTouchRotation?'Touch: full rotate':'Touch: scroll + rotate';
    $('#scout-touch-mode').title=fullTouchRotation?'Every drag rotates the cube; drag outside it to scroll the page.':'Vertical drags may scroll the page; enable full rotate for unrestricted touch movement.';
  }
  renderTouchMode();
  function planData(state,plan=selected){return toRenderData(state,highlightsOn&&plan?planPieceIds(source,plan.face,plan.pairs):[]);}
  function message(text){ $('#scout-message').textContent=text; }
  function updateOrientation(useSuggestion=false){
    if(!selected){
      // Live turns redraw this view repeatedly. Re-anchoring its gyro on
      // every turn would erase the physical rotation we are following.
      const changedHold=viewBottom!=='D'||viewFront!=='F';
      viewBottom='D';viewFront='F';suggestedFront=null;
      if(changedHold)cube.setOrientation(viewBottom,viewFront);
      $('#scout-bottom-label').textContent='Default cube view';
      $('#scout-front').innerHTML='<option value="F" selected>Green · F</option>';
      $('#scout-front').disabled=true;
      $('#scout-front-reason').textContent='White stays on top, green in front, and red on the right until you choose a plan.';
      $('#scout-view-caption').textContent='White top · Green front · Red right';
      return;
    }
    viewBottom=selected.face;
    const targets=planPieceIds(source,selected.face,selected.pairs);
    suggestedFront=suggestInspectionFront(source,viewBottom,targets);
    const fronts=frontFacesFor(viewBottom);
    if(useSuggestion||!fronts.includes(viewFront))viewFront=suggestedFront.face;
    cube.setOrientation(viewBottom,viewFront);
    $('#scout-front').disabled=false;
    $('#scout-bottom-label').textContent=`${title(FACE_COLORS[viewBottom])} on bottom`;
    $('#scout-front').innerHTML=fronts.map(face=>`<option value="${face}"${face===viewFront?' selected':''}>${title(FACE_COLORS[face])} · ${face}${face===suggestedFront.face?' (suggested)':''}</option>`).join('');
    const tieNote=suggestedFront.tiedChoices>1?' It ties for the clearest view, so the conventional front wins the tie.':'';
    $('#scout-front-reason').textContent=`Suggested ${title(FACE_COLORS[suggestedFront.face])} because it shows ${suggestedFront.crossStickers} of 4 cross-color stickers and ${suggestedFront.visiblePieces} of ${targets.length} plan pieces from the starting angle. Cross stickers count first, then visible plan pieces.${tieNote}`;
    const held=inspectionOrientation(viewBottom,viewFront);
    $('#scout-view-caption').textContent=`${title(FACE_COLORS[held.top])} top · ${title(FACE_COLORS[held.front])} front · ${title(FACE_COLORS[held.right])} right · ${title(FACE_COLORS[held.bottom])} bottom`;
  }
  function renderColors(){
    $('#scout-colors').innerHTML=`<button data-scout-color="CN" aria-pressed="${allowed.length===6}">color neutral · all six</button>`+Object.entries(FACE_COLORS).map(([face,color])=>`<button data-scout-color="${face}" aria-pressed="${allowed.includes(face)}"><i style="--color:${COLOR_HEX[color]}" aria-hidden="true"></i>${title(color)}</button>`).join('');
  }
  function stopPlayback(){playing=false;playbackGeneration++;renderPlayback();}
  function cancelSearch(){ requestGeneration++; controller?.abort();controller=null;terminateCrossSolver();busy=false;$('#scout-stop').hidden=true;$('#scout-analyze').disabled=false; }
  function clearPlans(){stopPlayback();practice=null;highlightsOn=false;selected=null;results=[];states=[];step=0;offPlanMoves=[];delete root.dataset.scoutCanonicalMoves;updateOrientation();renderResults();renderPlan();}
  function readPracticeHistory(){try{const value=JSON.parse(localStorage.getItem(PRACTICE_STORE));return Array.isArray(value)?value:[];}catch{return [];}}
  function savePracticeAttempt(rating){
    if(!practice?.revealedAt || practice.rated || !selected)return;
    const attempt={face:selected.face,stage:stageName(selected.pairs.length),cue:selected.cue.label,durationMs:Math.round(practice.revealedAt-practice.startedAt),rating,at:new Date().toISOString()};
    const history=[...readPracticeHistory(),attempt].slice(-60);
    try{localStorage.setItem(PRACTICE_STORE,JSON.stringify(history));}catch{/* Keep the session usable if storage is unavailable. */}
    practice.rated=rating;
    $('#scout-practice-history').textContent=`${history.length} recall rounds · ${history.filter(item=>item.rating==='found').length} found.`;
  }
  function renderPractice(){
    const panel=$('#scout-practice-panel');
    panel.hidden=!practice;
    $('#scout-practice').disabled=!selected;
    $('#scout-practice').hidden=Boolean(practice);
    const attempting=Boolean(practice&&!practice.revealedAt);
    root.classList.toggle('scout-practising',attempting);
    $('.scout-plan').classList.toggle('is-practice-attempt',attempting);
    highlightButton.disabled=!selected||attempting;
    ['scout-start','scout-prev','scout-play','scout-next'].forEach(id=>{$(`#${id}`).disabled=attempting||$(`#${id}`).disabled;});
    if(!practice)return;
    const revealed=Boolean(practice.revealedAt);
    if(attempting){
      $('#scout-family').textContent='recall';
      $('#scout-plan-title').textContent='What would you spot first?';
      $('#scout-explanation').textContent='Identify the cross edges and the plan pieces from the unassisted cube, then commit before revealing.';
      $('#scout-pieces').textContent='';
      $('#scout-moves').replaceChildren();
      $('#scout-step').textContent='Unassisted cube · timer running';
    }
    panel.classList.toggle('is-revealed',revealed);
    $('#scout-practice-title').textContent=revealed?'Plan revealed':'Find the pieces before you reveal the plan';
      $('#scout-practice-copy').textContent=revealed?'The selected, verified plan is visible. Follow the cyan piece frames, then rate whether you spotted the structure before the reveal.':'On the unassisted cube, identify the four cross edges and the plan’s pair pieces. Choose what you would inspect first, then reveal.';
    $('#scout-practice-reveal').hidden=revealed;
    $('#scout-practice-result').hidden=!revealed;
    $('#scout-practice-time').textContent=revealed?`Commitment time: ${practiceSummary(practice.revealedAt-practice.startedAt)}`:'';
    $('#scout-practice-cue').textContent=revealed?`${clue(selected)[0]} · ${selected.cue.description}`:'';
    if(revealed){
      const history=readPracticeHistory();$('#scout-practice-history').textContent=history.length?`${history.length} recall rounds · ${history.filter(item=>item.rating==='found').length} found`:'';
      root.querySelectorAll('[data-practice-rating]').forEach(button=>{button.disabled=Boolean(practice.rated);});
    }
  }
  function loadScramble(){
    const moves=parseScramble($('#scout-scramble').value);
    currentScramble=moves.join(' ');source=stateFromScramble(currentScramble);
    $('#scout-cube').style.visibility='';
    clearPlans();cube.update(toRenderData(source));
  }
  function renderSmartStatus(snapshot){
    const connected=snapshot.phase!=='disconnected'&&snapshot.phase!=='connecting';
    const gyroLive=connected&&snapshot.protocol.startsWith('GAN')&&Boolean(snapshot.gyro);
    const supported=Boolean(window.isSecureContext&&navigator.bluetooth?.requestDevice);
    $('#scout-smart-title').textContent=connected?`${snapshot.deviceName}${snapshot.protocol?` · ${snapshot.protocol}`:''}`:snapshot.phase==='connecting'?'cube · connecting':'cube · disconnected';
    $('#scout-smart-status').textContent=supported?`${snapshot.detail}${gyroLive?' Motion follows the cube; hold it as shown and tap recenter.':''}`:'Bluetooth is unavailable here. Use Chrome or Edge on Android, Windows, or Linux; manual scrambles still work.';
    $('#scout-smart-connect').hidden=snapshot.phase!=='disconnected';
    $('#scout-smart-connect').disabled=!supported;
    $('#scout-smart-sync').hidden=!connected;
    $('#scout-smart-recenter').hidden=!gyroLive;
    $('#scout-smart-disconnect').hidden=snapshot.phase==='disconnected';
    const tracking=snapshot.phase==='tracking';
    $('#scout-scramble').readOnly=tracking;
    $('#scout-random').disabled=tracking;
  }
  function applyLiveCube(snapshot){
    manualScrambleGuide=false;
    const scramble=snapshot.moves.join(' ');
    if(lastLiveScramble===scramble)return;
    lastLiveScramble=scramble;
    $('#scout-scramble').value=scramble;
    if(selected){
      const progress=followPlanTurn(states,step,offPlanMoves,snapshot.state,snapshot.lastMove);
      stopPlayback();
      step=progress.step;offPlanMoves=progress.detour;
      if(progress.onPlan){
        const data=planData(states[step]);if(snapshot.lastMove)cube.queueLiveMove(snapshot.lastMove,data);else cube.update(data);
        renderPlayback();message(`Smart cube matched move ${step} of this plan.`);return;
      }
      const data=planData(snapshot.state);if(snapshot.lastMove)cube.queueLiveMove(snapshot.lastMove,data);else cube.update(data);
      renderPlayback();
      message('Off plan. Follow the return moves below, or find plans for this cube.');
      return;
    }
    cancelSearch();
    source=snapshot.state;currentScramble=scramble;
    clearPlans();const data=toRenderData(source);if(snapshot.lastMove)cube.queueLiveMove(snapshot.lastMove,data);else cube.update(data);
    message(snapshot.moves.length>200?'Cube tracked over 200 moves. Return to solved and sync to start a new case.':'Cube mirrored. Find plans for its current state.');
  }
  function onSmartCube(snapshot){
    const gyro=snapshot.protocol.startsWith('GAN')?snapshot.gyro:null;
    if(gyro!==lastGyro){cube.setGyroOrientation(gyro);lastGyro=gyro;}
    const statusKey=[snapshot.phase,snapshot.detail,snapshot.deviceName,snapshot.protocol,Boolean(gyro)].join('|');
    if(statusKey!==lastSmartStatus){renderSmartStatus(snapshot);lastSmartStatus=statusKey;}
    if(snapshot.phase==='tracking')applyLiveCube(snapshot);
    if(snapshot.phase==='disconnected')lastLiveScramble=null;
  }
  function renderPlayback(){
    $('#scout-play').textContent=playing?'Pause':'Play';
    $('#scout-play').disabled=!selected || !selected.moves.length || offPlanMoves.length>0;
    $('#scout-start').disabled=!selected || step===0 || offPlanMoves.length>0;
    $('#scout-prev').disabled=!selected || step===0 || offPlanMoves.length>0;
    $('#scout-next').disabled=!selected || step>=selected.moves.length || offPlanMoves.length>0;
    $('#scout-step').textContent=offPlanMoves.length?`Off plan · return to move ${step}`:selected?`Move ${step} of ${selected.moves.length}${step===selected.moves.length?' · plan complete':''}`:'Scrambled state';
    const displayed=selected?movesForInspection(selected.moves,viewBottom,viewFront):[];
    $('#scout-moves').innerHTML=selected?displayed.map((move,index)=>`<button class="scout-move ${index<step?'done':''} ${index===step-1?'current':''}" data-scout-step="${index+1}" aria-label="Show state after move ${index+1}: ${escape(move)}"${offPlanMoves.length?' disabled':''}>${escape(move)}</button>`).join(''):'';
    $('#scout-analyze').textContent=offPlanMoves.length?'find plans for this cube':'find plans';
    renderTurnGuide();
  }
  function renderTurnGuide(){
    let move,mode,index=0,total=0,recovery=[];
    if(selected&&offPlanMoves.length){
      recovery=recoveryMoves(offPlanMoves,viewBottom,viewFront);
      move=recovery[0];total=recovery.length;mode='recovery';
    }else if(selected){
      const moves=movesForInspection(selected.moves,viewBottom,viewFront);
      move=moves[step];index=step;total=moves.length;mode='plan';
    }else if(manualScrambleGuide){
      let moves=[];
      try { moves=parseScramble($('#scout-scramble').value); } catch { /* Invalid manual input has no turn cue. */ }
      scrambleGuideIndex=Math.min(scrambleGuideIndex,moves.length);
      move=moves[scrambleGuideIndex];index=scrambleGuideIndex;total=moves.length;mode='scramble';
    }
    turnGuide.render({mode:practice&&!practice.revealedAt?null:mode,move,index,total,bottom:viewBottom,front:viewFront,recovery});
  }
  function renderPlan(){
    highlightButton.disabled=!selected;
    highlightButton.title=selected?`Highlight 4 cross edges and ${selected.pairs.length*2} F2L pieces`:'Select a plan first';
    $('#scout-family').textContent=selected?`Look for: ${clue(selected)[0]}`:'Start with the cross';
    $('#scout-plan-title').textContent=selected?`${title(FACE_COLORS[selected.face])} · ${stageName(selected.pairs.length)}`:'What can you spot?';
    $('#scout-explanation').textContent=selected?selected.cue.description:'Find plans for cross, x-cross, and xx-cross. Select one to see which pieces matter.';
    $('#scout-pieces').textContent=selected?.pairs.length?selected.pairs.map(pair=>`${[...pair.cornerId].map(f=>title(FACE_COLORS[f])).join('–')} corner + ${[...pair.edgeId].map(f=>title(FACE_COLORS[f])).join('–')} edge`).join(' · '):'';
    renderPlayback();
    renderPractice();
  }
  function selectPlan(index){
    stopPlayback();practice=null;highlightsOn=false;offPlanMoves=[];selected=results[index];step=0;states=[source];
    root.dataset.scoutCanonicalMoves=selected.moves.join(' ');
    for(const move of selected.moves) states.push(applyMoves(states.at(-1),[move]));
    viewBottom=selected.face;updateOrientation(true);
    cube.update(planData(source));renderPlan();renderResults();
    const held=inspectionOrientation(viewBottom,viewFront);
    message(`Hold the cube with ${FACE_COLORS[held.top]} on top and ${FACE_COLORS[held.front]} in front, then tap recenter. Follow the center color named in each turn cue.`);
  }
  function renderResults(){
    const ranks={easy:0,medium:1,hard:2};
    const ordered=results.map((result,index)=>({...result,index})).sort((a,b)=>($('#scout-sort').value==='cue'?ranks[a.cue.difficulty]-ranks[b.cue.difficulty]:0)||a.moves.length-b.moves.length||b.pairs.length-a.pairs.length);
    $('#scout-results').innerHTML=ordered.map(result=>`<button class="scout-result" data-scout-result="${result.index}" aria-pressed="${selected===results[result.index]}"><span><i style="--color:${COLOR_HEX[FACE_COLORS[result.face]]}" aria-hidden="true"></i>${title(FACE_COLORS[result.face])} · ${stageName(result.pairs.length)}</span><small>${result.pairs.length?`Cross + ${result.pairs.length} solved F2L pair${result.pairs.length===1?'':'s'}`:'Four cross edges; no F2L pair'}</small><strong>${result.moves.length} moves</strong><span class="scout-family">Look for: ${escape(clue(result)[0])}</span><small>${escape(clue(result)[1])}</small></button>`).join('');
    $('#scout-empty').hidden=results.length>0;
  }
  function jump(target){stopPlayback();if(!selected||offPlanMoves.length)return;step=Math.max(0,Math.min(target,selected.moves.length));cube.update(planData(states[step]));renderPlayback();}
  async function advance(){
    if(!selected || offPlanMoves.length || step>=selected.moves.length)return;
    const token=playbackGeneration, plan=selected,next=step+1;
    await cube.animateMove(plan.moves[step],planData(states[next],plan));
    if(token!==playbackGeneration||plan!==selected)return;
    step=next;renderPlayback();
  }
  async function play(){
    if(playing){stopPlayback();cube.update(planData(states[step]));return;}
    if(!selected||offPlanMoves.length)return;if(step===selected.moves.length)jump(0);
    playing=true;const token=playbackGeneration;renderPlayback();
    while(playing&&active&&token===playbackGeneration&&step<selected.moves.length) await advance();
    if(token===playbackGeneration){playing=false;renderPlayback();}
  }
  async function analyze(){
    cancelSearch();try{loadScramble();}catch(error){message(error.message);return;}
    const generation=requestGeneration;controller=new AbortController();busy=true;
    $('#scout-analyze').disabled=true;$('#scout-stop').hidden=false;
    let attempted=0, incomplete=0,rejected=0;const total=allowed.length*3;
    try {
      // Cross baselines appear before deeper searches. Every returned plan is
      // independently simulated, including its cross and actual solved pairs.
      for(const kind of ['cross','xcross','xxcross']) for(const face of allowed){
        if(generation!==requestGeneration)return;
        message(`finding ${title(FACE_COLORS[face])} ${kind==='xxcross'?'xx-cross':kind} plans · ${attempted}/${total}. Stop to keep these results.`);
        const reply=await solveCross({scramble:currentScramble,face,kind,maxResults:3,timeLimitMs:2500},{signal:controller.signal});
        if(generation!==requestGeneration)return;
        attempted++;if(!reply.complete)incomplete++;
        for(const candidate of reply.results||[]){
          const moves=parseScramble(Array.isArray(candidate.moves)?candidate.moves.join(' '):candidate.moves);
          const verified=validateSolution(source,moves,face);
          const required=kind==='cross'?0:kind==='xcross'?1:2;
          if(!verified.crossSolved||verified.pairs.length<required){rejected++;continue;}
          if(results.some(r=>r.face===face&&r.moves.join(' ')===moves.join(' ')))continue;
          const cue=classifyOpportunity(source,moves,face,verified.pairs);
          results.push({face,moves,pairs:verified.pairs,cue});
        }
        renderResults();
      }
      message(`${results.length} plans found.${incomplete?' Some searches reached their limit; more plans may exist.':''}${rejected?' Unverified plans were excluded.':''} Compare stages, move counts, and clues.`);
      if(!results.length)$('#scout-empty').textContent='No plan found within these search limits. Try fewer colors or a shorter scramble.';
    } catch(error){if(generation===requestGeneration)message(error.name==='AbortError'?'Search stopped.':'Search could not finish: '+error.message);}
    finally{if(generation===requestGeneration){busy=false;controller=null;$('#scout-analyze').disabled=false;$('#scout-stop').hidden=true;}}
  }
  $('#scout-analyze').addEventListener('click',analyze);
  $('#scout-smart-connect').addEventListener('click',()=>{void cubeSession.connect();});
  $('#scout-mac-copy').addEventListener('click',async()=>{
    try { await navigator.clipboard.writeText('chrome://bluetooth-internals/#devices');$('#scout-mac-copy-status').textContent='Copied. Paste into Chrome’s address bar.'; }
    catch { $('#scout-mac-copy-status').textContent='Select and copy the address above, then paste it into Chrome.'; }
  });
  $('#scout-smart-sync').addEventListener('click',()=>{void cubeSession.syncSolved().catch(()=>{});});
  $('#scout-smart-recenter').addEventListener('click',()=>{cube.recenterGyro();message('Cube motion recentered to the current view.');});
  $('#scout-smart-disconnect').addEventListener('click',()=>{void cubeSession.disconnect();});
  $('#scout-stop').addEventListener('click',()=>{cancelSearch();message(`Search stopped. ${results.length} plans kept; search is incomplete.`);});
  $('#scout-random').addEventListener('click',()=>{cancelSearch();manualScrambleGuide=true;scrambleGuideIndex=0;$('#scout-scramble').value=randomScramble();loadScramble();message('New scramble ready. Apply it to a solved cube, then find plans.');});
  $('#scout-scramble').addEventListener('input',()=>{
    manualScrambleGuide=true;scrambleGuideIndex=0;
    cancelSearch();clearPlans();
    try{loadScramble();$('#scout-cube').style.visibility='';message('Cube updated. Find plans to see options.');}
    catch(error){$('#scout-cube').style.visibility='hidden';message(error.message);}
  });
  $('#scout-colors').addEventListener('click',event=>{
    const face=event.target.closest('[data-scout-color]')?.dataset.scoutColor;if(!face)return;
    if(face==='CN')allowed=Object.keys(FACE_COLORS);
    else if(allowed.length===6)allowed=[face];
    else if(allowed.includes(face)){if(allowed.length===1){message('Keep at least one cross color selected.');return;}allowed=allowed.filter(f=>f!==face);}
    else allowed.push(face);
    try{localStorage.setItem('cubesight-scout-colors',JSON.stringify(allowed));}catch{/* Keep in memory. */}
    cancelSearch();clearPlans();cube.update(toRenderData(source));renderColors();message(`Cross colors updated. The cube stays white-top / green-front until you choose a plan.`);
  });
  $('#scout-front').addEventListener('change',event=>{if(!selected)return;stopPlayback();viewFront=event.target.value;updateOrientation(false);cube.update(planData(states[step]||source));renderPlayback();message(`${title(FACE_COLORS[viewFront])} is now in front. The displayed solution notation has been remapped to this held view.`);});
  $('#scout-results').addEventListener('click',event=>{const button=event.target.closest('[data-scout-result]');if(button)selectPlan(Number(button.dataset.scoutResult));});
  $('#scout-sort').addEventListener('change',renderResults);
  $('#scout-moves').addEventListener('click',event=>{const button=event.target.closest('[data-scout-step]');if(button)jump(Number(button.dataset.scoutStep));});
  $('#scout-reset-view').addEventListener('click',()=>{if(selected)jump(step);cube.resetView();});
  $('#scout-touch-mode').addEventListener('click',()=>{fullTouchRotation=!fullTouchRotation;renderTouchMode();});
  $('#scout-start').addEventListener('click',()=>jump(0));
  $('#scout-prev').addEventListener('click',()=>jump(step-1));
  $('#scout-next').addEventListener('click',()=>{stopPlayback();advance();});
  $('#scout-play').addEventListener('click',play);
  $('#scout-practice').addEventListener('click',()=>{
    if(!selected)return;
    stopPlayback();highlightsOn=false;step=0;practice={startedAt:performance.now(),revealedAt:null,rated:null};
    cube.update(toRenderData(source));renderPlan();message('Recall started. Identify the cross and pair pieces before you reveal the verified plan.');
  });
  $('#scout-practice-reveal').addEventListener('click',()=>{
    if(!practice||!selected||practice.revealedAt)return;
    practice.revealedAt=performance.now();highlightsOn=true;cube.update(planData(source));renderPlan();message('Plan revealed. The cyan frames show the cross and selected pair pieces.');
  });
  $('#scout-practice-exit').addEventListener('click',()=>{practice=null;highlightsOn=false;cube.update(planData(source));renderPlan();message('Recall stopped. Select the plan when you are ready to try again.');});
  $('#scout-practice-panel').addEventListener('click',event=>{const rating=event.target.closest('[data-practice-rating]')?.dataset.practiceRating;if(!rating||practice?.rated)return;savePracticeAttempt(rating);const group=event.target.closest('.scout-practice-rating');group.classList.add('is-rated');group.querySelectorAll('button').forEach(button=>{button.disabled=true;});});
  highlightButton.addEventListener('click',()=>{
    if(!selected)return;
    const resume=playing;
    stopPlayback();highlightsOn=!highlightsOn;
    highlightButton.setAttribute('aria-pressed',String(highlightsOn));
    cube.update(planData(states[step]));
    if(resume)play();
  });
  renderColors();
  try {
    $('#scout-scramble').value = linkedScramble ? parseScramble(linkedScramble).join(' ') : randomScramble();
    loadScramble();
  } catch {
    $('#scout-scramble').value = randomScramble(); loadScramble();
    if (reviewFrom) message('This review link has no usable scramble. Paste a scramble to start a Cross Scout search.');
  }
  if (reviewSetup) {
    const [, atText, moveText] = reviewSetup;
    const setupGeneration = requestGeneration;
    void openHistory().then(history => {
      if (!active || setupGeneration !== requestGeneration) return;
      const record = history.records.find(item => item.at === Number(atText));
      if (!record) throw new Error('The linked solve is no longer in local history.');
      const move = Math.min(record.solveMoves.length, Number(moveText));
      const setup = [...parseScramble(record.scramble), ...record.solveMoves.slice(0, move)];
      if (setup.length > 200) throw new Error('This position is over Cross Scout’s 200-move setup limit. Choose an earlier move.');
      $('#scout-scramble').value = setup.join(' ');
      loadScramble();
      message(`Review position loaded · move ${move + 1}. Analyze to practice this ${routeQuery.get('kind') === 'xcross' ? 'X-cross' : 'cross'} opportunity.`);
    }).catch(error => {
      if (active) message(error.message || 'The linked review position could not be loaded.');
    });
  }
  cubeSession.subscribe(onSmartCube);
  return {setActive(value){active=value;if(!value){stopPlayback();if(selected)cube.update(planData(states[step]));if(busy){cancelSearch();message('Search stopped while away. Existing results are kept.');}}}};
}
