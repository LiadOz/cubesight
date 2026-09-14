// A single, disposable worker isolates synchronous WASM search from the UI.
let worker=null, pending=null, nextId=0;
const abortError=()=>new DOMException('Search cancelled','AbortError');
function finish(value,error) {
  if(!pending)return;
  const item=pending;pending=null;clearTimeout(item.timer);
  item.signal?.removeEventListener('abort',item.cancel);
  if(error)item.reject(error);else item.resolve(value);
}
function getWorker() {
  if(worker)return worker;
  // Keep the URL in the Worker constructor for Vite's production bundler.
  worker=new Worker(new URL('./cross-solver-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(!pending || data.id!==pending.id)return;
    if(data.type==='ready') {
      clearTimeout(pending.timer);
      pending.timer=setTimeout(forceBudgetEnd,pending.budget+1500);
    } else if(data.type==='progress') {
      pending.results=data.results||pending.results;
      pending.onProgress?.(data);
    } else if(data.type==='error')finish(null,new Error(data.message));
    else finish(data);
  };
  worker.onerror=event=>{
    worker?.terminate();worker=null;
    finish(null,new Error(event.message||'Cross solver failed to load.'));
  };
  return worker;
}
function forceBudgetEnd(){
  const item=pending;if(!item)return;
  worker?.terminate();worker=null;
  finish({results:item.results,complete:false,backend:'cube-xcross-lite-wasm',reason:'time-limit'});
}
export function solveCross(request,{signal,onProgress}={}) {
  if(signal?.aborted)return Promise.reject(abortError());
  if(pending)return Promise.reject(new Error('A search is already running.'));
  const budget=Math.min(15000,Math.max(100,Number(request.timeLimitMs)||2500));
  return new Promise((resolve,reject)=>{
    const w=getWorker(),id=++nextId;
    const cancel=()=>{worker?.terminate();worker=null;finish(null,abortError());};
    pending={id,resolve,reject,signal,cancel,onProgress,budget,results:[],timer:setTimeout(forceBudgetEnd,15000)};
    signal?.addEventListener('abort',cancel,{once:true});
    w.postMessage({...request,id,type:'solve',timeLimitMs:budget});
  });
}
export function terminateCrossSolver(){worker?.terminate();worker=null;finish(null,abortError());}
export const CROSS_SOLVER_CAPABILITIES=Object.freeze({backend:'cube-xcross-lite-wasm',supports:['cross','xcross','xxcross'],faces:['U','D','F','B','R','L']});
