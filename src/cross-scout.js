import './cross-scout.css';
import { createCube3D } from './cube-3d.js';
import { FACE_COLORS, COLOR_HEX, parseScramble, stateFromScramble, applyMoves, toRenderData, validateSolution, classifyOpportunity, randomScramble, planPieceIds } from './cross-cube.js';
import { solveCross, terminateCrossSolver } from './cross-solver.js';

const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title = value => value[0].toUpperCase()+value.slice(1);
const stageName = count => count===0?'Cross':count===1?'X-cross':count===2?'Double X-cross':`${count}-pair X-cross`;
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
const practiceSummary = value => value ? `${(value / 1000).toFixed(1)} s` : '—';

export function createCrossScout(root) {
  let allowed=['U'];
  try { const saved=JSON.parse(localStorage.getItem('cubesight-scout-colors')); if(Array.isArray(saved) && saved.length && saved.every(f=>Object.hasOwn(FACE_COLORS,f))) allowed=[...new Set(saved)]; } catch { /* Use white initially. */ }
  let source=stateFromScramble(''), results=[], selected=null, step=0, states=[], active=true, playing=false, playbackGeneration=0;
  let controller=null, requestGeneration=0, currentScramble='', busy=false;
  let highlightsOn=false;
  let practice=null;
  root.innerHTML=`
    <section class="intro-row"><div><p class="eyebrow">Explore / Cross planning</p><h1>Cross Scout</h1></div><p class="intro-copy">Find the opportunity.<br>Understand what to look for.</p></section>
    <section class="scout-input" aria-label="Cross calculator input">
      <label for="scout-scramble">Your scramble</label>
      <div class="scout-scramble-row"><textarea id="scout-scramble" rows="2" spellcheck="false" autocomplete="off" autocapitalize="characters" placeholder="Paste a scramble, or generate one…"></textarea><button class="scout-button" id="scout-random">New scramble</button></div>
      <small>Start from solved, white on top and green in front. Standard face turns only: U D R L F B, with 2 or ′. An empty scramble represents a solved cube.</small>
      <div class="scout-options"><div><span class="scout-label">Allowed cross colors · choose a subset or CN</span><div class="scout-colors" id="scout-colors" role="group" aria-label="Allowed cross colors"></div></div><div class="scout-options-actions"><button class="new-case-button" id="scout-analyze">Analyze</button><button class="scout-button" id="scout-stop" hidden>Stop search</button></div></div>
      <p class="scout-message" id="scout-message" role="status" aria-live="polite">Apply the scramble to your cube, then compare plans. No timer, no score.</p>
    </section>
    <section class="trainer-shell scout-shell">
      <div class="cube-stage"><div class="stage-topline"><span class="status-dot"><i></i> Inspect every face</span><span class="view-lock">Free rotation</span></div><div id="scout-cube" class="cube-mount"></div><div class="cube-caption"><span>Move frame: white U · green F</span><button class="text-button" id="scout-reset-view">Reset view</button></div></div>
      <div class="scout-plan"><p class="eyebrow">Your plan</p><span id="scout-family" class="scout-family">Start with the cross</span><h2 id="scout-plan-title">What can you spot?</h2><p id="scout-explanation">Analyze the scramble to compare cross, X-cross, and double X-cross candidates. Select a plan to see which pieces matter.</p><p class="scout-pieces" id="scout-pieces"></p><div id="scout-moves" class="scout-moves" aria-label="Solution moves"></div><div class="scout-playback"><button class="scout-button" id="scout-start" disabled>Reset</button><button class="scout-button" id="scout-prev" disabled aria-label="Previous move">←</button><button class="scout-button" id="scout-play" disabled>Play</button><button class="scout-button" id="scout-next" disabled aria-label="Next move">→</button></div><span class="scout-step-note" id="scout-step">Scrambled state</span><button class="scout-practice-launch" id="scout-practice" disabled>Practice this plan</button><section class="scout-practice-panel" id="scout-practice-panel" hidden aria-live="polite"><span class="scout-practice-kicker">Retrieval practice</span><h3 id="scout-practice-title">Find the pieces before you reveal the plan</h3><p id="scout-practice-copy">On the unassisted cube, identify the four cross edges and the highlighted-plan pair pieces. Commit to what you would inspect first, then reveal.</p><div class="scout-practice-actions"><button class="scout-button scout-practice-reveal" id="scout-practice-reveal">I found it — reveal plan</button><button class="scout-button" id="scout-practice-exit">Exit practice</button></div><div class="scout-practice-result" id="scout-practice-result" hidden><p id="scout-practice-time"></p><p id="scout-practice-cue"></p><div class="scout-practice-rating"><span>How did the retrieval feel?</span><button class="scout-button" data-practice-rating="found">Found it</button><button class="scout-button" data-practice-rating="missed">Missed it</button></div><p class="scout-practice-history" id="scout-practice-history"></p></div></section></div>
    </section>
    <section class="scout-results"><div class="scout-results-head"><h2>Plans found</h2><select id="scout-sort" aria-label="Sort plans"><option value="cue">Recognizable cues first</option><option value="moves">Fewest moves first</option></select></div><div id="scout-results" class="scout-result-grid"></div><p id="scout-empty" class="scout-empty">Choose your colors and analyze to find candidate plans.</p><p class="scout-footnote">Recognition labels describe structural cues in the plan, not measured human difficulty. They do not account for what was visible from your chosen viewing angle. Search is bounded: “not found” does not mean impossible. Move counts use face turns (R2 counts as one). Random scrambles here are random-move practice scrambles, not competition random-state scrambles.</p><p class="scout-footnote">Search powered by the MIT-licensed <a href="https://github.com/vangie/cube-xcross" target="_blank" rel="noopener noreferrer">cube-xcross engine</a>, running locally in WebAssembly. Smart-cube connection is not available yet; the cube model is separate from scramble input for a future device adapter.</p></section>`;
  const $=selector=>root.querySelector(selector);
  const guide=document.createElement('details');
  guide.className='scout-guide';
  guide.innerHTML=`<summary>What do the solution classes mean?</summary>
    <div><h3>What gets solved</h3><p><strong>Cross:</strong> the four cross edges. <strong>X-cross:</strong> cross + one F2L pair. <strong>Double X-cross:</strong> cross + two F2L pairs.</p>
    <h3>What to look for</h3><p>These are recognition clues, not different solving methods or guaranteed difficulty ratings. A plan can have several clues; we show the first matching one.</p>
    <dl>${Object.entries(CLUES).filter(([key])=>key!=='Preserve connected pairs'&&key!=='Cross fundamentals').map(([,value])=>`<dt>${value[0]}</dt><dd>${value[1]}</dd>`).join('')}</dl>
    <p class="scout-check-note">Every displayed plan is simulated from your scramble to check that its cross and listed pairs finish solved. That checks correctness—it does not mean the plan is easy to spot or the best choice for you.</p></div>`;
  $('.scout-results-head').after(guide);
  const highlightButton=document.createElement('button');
  highlightButton.id='scout-highlight';highlightButton.className='scout-highlight';
  highlightButton.textContent='Highlight pieces';
  highlightButton.setAttribute('aria-label','Highlight cross and F2L pieces');
  highlightButton.setAttribute('aria-pressed','false');highlightButton.disabled=true;
  $('.stage-topline .view-lock').replaceWith(highlightButton);
  const cube=createCube3D($('#scout-cube'),{mode:'scout'});
  function planData(state,plan=selected){return toRenderData(state,highlightsOn&&plan?planPieceIds(source,plan.face,plan.pairs):[]);}
  function message(text){ $('#scout-message').textContent=text; }
  function renderColors(){
    $('#scout-colors').innerHTML=`<button data-scout-color="CN" aria-pressed="${allowed.length===6}">CN · all six</button>`+Object.entries(FACE_COLORS).map(([face,color])=>`<button data-scout-color="${face}" aria-pressed="${allowed.includes(face)}"><i style="--color:${COLOR_HEX[color]}" aria-hidden="true"></i>${title(color)}</button>`).join('');
  }
  function stopPlayback(){playing=false;playbackGeneration++;renderPlayback();}
  function cancelSearch(){ requestGeneration++; controller?.abort();controller=null;terminateCrossSolver();busy=false;$('#scout-stop').hidden=true;$('#scout-analyze').disabled=false; }
  function clearPlans(){stopPlayback();practice=null;highlightsOn=false;selected=null;results=[];states=[];step=0;renderResults();renderPlan();}
  function readPracticeHistory(){try{const value=JSON.parse(localStorage.getItem(PRACTICE_STORE));return Array.isArray(value)?value:[];}catch{return [];}}
  function savePracticeAttempt(rating){
    if(!practice?.revealedAt || practice.rated || !selected)return;
    const attempt={face:selected.face,stage:stageName(selected.pairs.length),cue:selected.cue.label,durationMs:Math.round(practice.revealedAt-practice.startedAt),rating,at:new Date().toISOString()};
    const history=[...readPracticeHistory(),attempt].slice(-60);
    try{localStorage.setItem(PRACTICE_STORE,JSON.stringify(history));}catch{/* Keep the session usable if storage is unavailable. */}
    practice.rated=rating;
    $('#scout-practice-history').textContent=`${history.length} plan retrieval${history.length===1?'':'s'} logged · ${history.filter(item=>item.rating==='found').length} found.`;
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
      $('#scout-family').textContent='Retrieval prompt';
      $('#scout-plan-title').textContent='What would you spot first?';
      $('#scout-explanation').textContent='Identify the cross edges and the plan pieces from the unassisted cube, then commit before revealing.';
      $('#scout-pieces').textContent='';
      $('#scout-moves').replaceChildren();
      $('#scout-step').textContent='Unassisted cube · timer running';
    }
    panel.classList.toggle('is-revealed',revealed);
    $('#scout-practice-title').textContent=revealed?'Plan revealed':'Find the pieces before you reveal the plan';
    $('#scout-practice-copy').textContent=revealed?'The selected, verified plan is now visible. Follow the cyan piece frames, then rate whether you retrieved the structure before the reveal.':'On the unassisted cube, identify the four cross edges and the plan’s pair pieces. Commit to what you would inspect first, then reveal. This is a retrieval commitment, not a click-accuracy test.';
    $('#scout-practice-reveal').hidden=revealed;
    $('#scout-practice-result').hidden=!revealed;
    $('#scout-practice-time').textContent=revealed?`Commitment time: ${practiceSummary(practice.revealedAt-practice.startedAt)}`:'';
    $('#scout-practice-cue').textContent=revealed?`${clue(selected)[0]} · ${selected.cue.description}`:'';
    if(revealed){
      const history=readPracticeHistory();$('#scout-practice-history').textContent=history.length?`${history.length} plan retrieval${history.length===1?'':'s'} logged · ${history.filter(item=>item.rating==='found').length} found.`:'';
      root.querySelectorAll('[data-practice-rating]').forEach(button=>{button.disabled=Boolean(practice.rated);});
    }
  }
  function loadScramble(){
    const moves=parseScramble($('#scout-scramble').value);
    currentScramble=moves.join(' ');source=stateFromScramble(currentScramble);
    $('#scout-cube').style.visibility='';
    clearPlans();cube.update(toRenderData(source));
  }
  function renderPlayback(){
    $('#scout-play').textContent=playing?'Pause':'Play';
    $('#scout-play').disabled=!selected || !selected.moves.length;
    $('#scout-start').disabled=!selected || step===0;
    $('#scout-prev').disabled=!selected || step===0;
    $('#scout-next').disabled=!selected || step>=selected.moves.length;
    $('#scout-step').textContent=selected?`Move ${step} of ${selected.moves.length}${step===selected.moves.length?' · plan complete':''}`:'Scrambled state';
    $('#scout-moves').innerHTML=selected?selected.moves.map((move,index)=>`<button class="scout-move ${index<step?'done':''} ${index===step-1?'current':''}" data-scout-step="${index+1}" aria-label="Show state after move ${index+1}: ${escape(move)}">${escape(move)}</button>`).join(''):'';
  }
  function renderPlan(){
    highlightButton.disabled=!selected;
    highlightButton.title=selected?`Highlight 4 cross edges and ${selected.pairs.length*2} F2L pieces`:'Select a plan first';
    $('#scout-family').textContent=selected?`Look for: ${clue(selected)[0]}`:'Start with the cross';
    $('#scout-plan-title').textContent=selected?`${title(FACE_COLORS[selected.face])} · ${stageName(selected.pairs.length)}`:'What can you spot?';
    $('#scout-explanation').textContent=selected?selected.cue.description:'Analyze the scramble to compare cross, X-cross, and double X-cross candidates. Select a plan to see which pieces matter.';
    $('#scout-pieces').textContent=selected?.pairs.length?selected.pairs.map(pair=>`${[...pair.cornerId].map(f=>title(FACE_COLORS[f])).join('–')} corner + ${[...pair.edgeId].map(f=>title(FACE_COLORS[f])).join('–')} edge`).join(' · '):'';
    renderPlayback();
    renderPractice();
  }
  function selectPlan(index){
    stopPlayback();practice=null;highlightsOn=false;selected=results[index];step=0;states=[source];
    for(const move of selected.moves) states.push(applyMoves(states.at(-1),[move]));
    cube.update(planData(source));renderPlan();renderResults();
  }
  function renderResults(){
    const ranks={easy:0,medium:1,hard:2};
    const ordered=results.map((result,index)=>({...result,index})).sort((a,b)=>($('#scout-sort').value==='cue'?ranks[a.cue.difficulty]-ranks[b.cue.difficulty]:0)||a.moves.length-b.moves.length||b.pairs.length-a.pairs.length);
    $('#scout-results').innerHTML=ordered.map(result=>`<button class="scout-result" data-scout-result="${result.index}" aria-pressed="${selected===results[result.index]}"><span><i style="--color:${COLOR_HEX[FACE_COLORS[result.face]]}" aria-hidden="true"></i>${title(FACE_COLORS[result.face])} · ${stageName(result.pairs.length)}</span><small>${result.pairs.length?`Cross + ${result.pairs.length} solved F2L pair${result.pairs.length===1?'':'s'}`:'Four cross edges; no F2L pair'}</small><strong>${result.moves.length} moves</strong><span class="scout-family">Look for: ${escape(clue(result)[0])}</span><small>${escape(clue(result)[1])}</small></button>`).join('');
    $('#scout-empty').hidden=results.length>0;
  }
  function jump(target){stopPlayback();if(!selected)return;step=Math.max(0,Math.min(target,selected.moves.length));cube.update(planData(states[step]));renderPlayback();}
  async function advance(){
    if(!selected || step>=selected.moves.length)return;
    const token=playbackGeneration, plan=selected,next=step+1;
    await cube.animateMove(plan.moves[step],planData(states[next],plan));
    if(token!==playbackGeneration||plan!==selected)return;
    step=next;renderPlayback();
  }
  async function play(){
    if(playing){stopPlayback();cube.update(planData(states[step]));return;}
    if(!selected)return;if(step===selected.moves.length)jump(0);
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
        message(`Analyzing ${title(FACE_COLORS[face])} ${kind==='xxcross'?'double X-cross':kind} · ${attempted}/${total} searches. You can stop and keep results.`);
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
        if(!selected&&results.length)selectPlan(0);else renderResults();
      }
      message(`${results.length} plans found.${incomplete?' Some searches reached their limit; more plans may exist.':''}${rejected?' Unverifiable engine results were excluded.':''} Compare what gets solved, move counts, and recognition clues.`);
      if(!results.length)$('#scout-empty').textContent='No plan found within these search limits. Try fewer colors or a shorter scramble.';
    } catch(error){if(generation===requestGeneration)message(error.name==='AbortError'?'Search stopped.':'Search could not finish: '+error.message);}
    finally{if(generation===requestGeneration){busy=false;controller=null;$('#scout-analyze').disabled=false;$('#scout-stop').hidden=true;}}
  }
  $('#scout-analyze').addEventListener('click',analyze);
  $('#scout-stop').addEventListener('click',()=>{cancelSearch();message(`Search stopped. ${results.length} plans kept; search is incomplete.`);});
  $('#scout-random').addEventListener('click',()=>{cancelSearch();$('#scout-scramble').value=randomScramble();loadScramble();message('New scramble ready. Apply it to a solved cube, then Analyze.');});
  $('#scout-scramble').addEventListener('input',()=>{
    cancelSearch();clearPlans();
    try{loadScramble();$('#scout-cube').style.visibility='';message('Cube updated. Select Analyze to find plans.');}
    catch(error){$('#scout-cube').style.visibility='hidden';message(error.message);}
  });
  $('#scout-colors').addEventListener('click',event=>{
    const face=event.target.closest('[data-scout-color]')?.dataset.scoutColor;if(!face)return;
    if(face==='CN')allowed=Object.keys(FACE_COLORS);
    else if(allowed.length===6)allowed=[face];
    else if(allowed.includes(face)){if(allowed.length===1){message('Keep at least one cross color selected.');return;}allowed=allowed.filter(f=>f!==face);}
    else allowed.push(face);
    try{localStorage.setItem('cubesight-scout-colors',JSON.stringify(allowed));}catch{/* Keep in memory. */}
    cancelSearch();clearPlans();cube.update(toRenderData(source));renderColors();message('Cross colors changed. Analyze to compare this selection.');
  });
  $('#scout-results').addEventListener('click',event=>{const button=event.target.closest('[data-scout-result]');if(button)selectPlan(Number(button.dataset.scoutResult));});
  $('#scout-sort').addEventListener('change',renderResults);
  $('#scout-moves').addEventListener('click',event=>{const button=event.target.closest('[data-scout-step]');if(button)jump(Number(button.dataset.scoutStep));});
  $('#scout-reset-view').addEventListener('click',()=>{if(selected)jump(step);cube.resetView();});
  $('#scout-start').addEventListener('click',()=>jump(0));
  $('#scout-prev').addEventListener('click',()=>jump(step-1));
  $('#scout-next').addEventListener('click',()=>{stopPlayback();advance();});
  $('#scout-play').addEventListener('click',play);
  $('#scout-practice').addEventListener('click',()=>{
    if(!selected)return;
    stopPlayback();highlightsOn=false;step=0;practice={startedAt:performance.now(),revealedAt:null,rated:null};
    cube.update(toRenderData(source));renderPlan();message('Practice started. Identify the cross and plan pieces before revealing the verified solution.');
  });
  $('#scout-practice-reveal').addEventListener('click',()=>{
    if(!practice||!selected||practice.revealedAt)return;
    practice.revealedAt=performance.now();highlightsOn=true;cube.update(planData(source));renderPlan();message('Plan revealed. The cyan frames show the cross and selected pair pieces.');
  });
  $('#scout-practice-exit').addEventListener('click',()=>{practice=null;highlightsOn=false;cube.update(planData(source));renderPlan();message('Practice ended. Select the plan again when you are ready to retrieve it.');});
  $('#scout-practice-panel').addEventListener('click',event=>{const rating=event.target.closest('[data-practice-rating]')?.dataset.practiceRating;if(!rating||practice?.rated)return;savePracticeAttempt(rating);const group=event.target.closest('.scout-practice-rating');group.classList.add('is-rated');group.querySelectorAll('button').forEach(button=>{button.disabled=true;});});
  highlightButton.addEventListener('click',()=>{
    if(!selected)return;
    const resume=playing;
    stopPlayback();highlightsOn=!highlightsOn;
    highlightButton.setAttribute('aria-pressed',String(highlightsOn));
    cube.update(planData(states[step]));
    if(resume)play();
  });
  renderColors();$('#scout-scramble').value=randomScramble();loadScramble();
  return {setActive(value){active=value;if(!value){stopPlayback();if(selected)cube.update(planData(states[step]));if(busy){cancelSearch();message('Search stopped while away. Existing results are kept.');}}}};
}
