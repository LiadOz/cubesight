import createXCross from './xcross-wasm/xcross.js';
import wasmUrl from './xcross-wasm/xcross.wasm?url';
import { parseScramble } from './cross-cube.js';

let modulePromise;
function load(){return modulePromise ||= createXCross({locateFile:()=>wasmUrl});}
function search(module,scramble,face,mask,maxDepth,maxResults,timeoutMs){
  const bytes=module.lengthBytesUTF8(scramble)+1,ptr=module._malloc(bytes);
  if(!ptr)throw new Error('Not enough memory for search.');
  try{
    module.stringToUTF8(scramble,ptr,bytes);
    return JSON.parse(module.UTF8ToString(module._xcross_wasm_analyze_json(ptr,face,mask,maxDepth,maxResults,timeoutMs)));
  }finally{module._free(ptr);}
}
self.onmessage=async({data})=>{
  if(data.type!=='solve')return;
  try{
    const scramble=parseScramble(data.scramble||'').join(' ');
    const faceNumber={U:0,R:1,F:2,D:3,L:4,B:5}[data.face];
    if(faceNumber===undefined)throw new Error('Unknown cross face.');
    const masks={cross:[0],xcross:[1,2,4,8],xxcross:[3,5,9,6,10,12]}[data.kind];
    if(!masks)throw new Error('Unknown search goal.');
    const module=await load();
    self.postMessage({id:data.id,type:'ready'});
    const budget=Math.min(15000,Math.max(100,Number(data.timeLimitMs)||2500));
    const deadline=performance.now()+budget;
    const maxResults=Math.min(8,Math.max(1,Number(data.maxResults)||3));
    const maxDepth=Math.min(14,Math.max(0,Number(data.maxDepth??(data.kind==='cross'?8:12))));
    let complete=true;const results=[];
    for(let i=0;i<masks.length;i++){
      const remaining=deadline-performance.now();
      if(remaining<=0){complete=false;break;}
      // Share the budget between slots: an obscure first slot must not prevent
      // an easy opportunity in another slot from being considered.
      const timeout=Math.max(1,Math.floor(remaining/(masks.length-i)));
      const reply=search(module,scramble,faceNumber,masks[i],maxDepth,maxResults,timeout);
      if(reply.status!==0)complete=false;
      for(const candidate of reply.results||[]){
        if(results.some(r=>r.moves.join(' ')===candidate.moves.join(' ')))continue;
        results.push({face:data.face,moves:candidate.moves,slotMask:masks[i],optimality:reply.status===0?'proven-for-target':'unproven'});
      }
      self.postMessage({id:data.id,type:'progress',results,completedMasks:i+1,totalMasks:masks.length});
    }
    self.postMessage({id:data.id,type:'result',face:data.face,kind:data.kind,results,complete,backend:'cube-xcross-lite-wasm'});
  }catch(error){self.postMessage({id:data.id,type:'error',message:error.message||String(error)});}
};
