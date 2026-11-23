// Independent second pass. Wait five minutes after each embedding has been
// produced, then cluster similar voices over a wider window and classify them
// against all rostered reference speakers in the server. Never store raw audio.
(()=>{
'use strict';
const DELAY_MS=300000,KEEP_MS=850000,TICK_MS=20000,MAX_SAMPLES=190;
let current='',queue=[],working=false,lastResult=null,lastError='',lastRun=0;
const key=x=>x.seq+':'+x.start_ms+':'+x.end_ms;
const el=()=>document.getElementById('voiceDelayedStatus');
function currentSession(){return localStorage.getItem('debate_live_id')||''}
function render(){
 const pending=queue.filter(x=>!x.confirmed).length;
 const mature=queue.filter(x=>!x.confirmed&&Date.now()-x.captured_at>=DELAY_MS).length;
 const oldest=queue.find(x=>!x.confirmed);
 const remaining=oldest?Math.max(0,Math.ceil((DELAY_MS-(Date.now()-oldest.captured_at))/1000)):0;
 const line='SEGUNDA PASADA · retraso 5 min · '+pending+' vectores pendientes · '+
   mature+' listos · próxima revisión '+remaining+' s'+
   (lastResult?' · '+lastResult.groups+' voces agrupadas, '+lastResult.recognized+' tramos reconocidos, '+lastResult.claims_changed+' citas actualizadas':'')+
   (lastError?' · ERROR: '+lastError:'');
 if(el())el().textContent=line;
 window.dispatchEvent(new CustomEvent('debate-voice-delayed-status',
   {detail:{pending,mature,remaining,working,lastResult,lastError}}));
}
function reset(id){current=id;queue=[];working=false;lastError='';lastResult=null;lastRun=0;render()}
function push(x){
 const live=currentSession();
 if(!x||x.id!==live)return;
 if(current!==live)reset(live);
 if(!Number.isSafeInteger(x.seq)||!Number.isSafeInteger(x.start_ms)||!Number.isSafeInteger(x.end_ms)
   ||!Array.isArray(x.embedding)||x.embedding.length!==192)return;
 // Only eight-or-more-person sessions, so there is no extra traffic for a
 // two-person capture; this feature runs independently of CAM++ v2.
 if(Number(x.referenceCount)<60)return;
 const entry={seq:x.seq,start_ms:x.start_ms,end_ms:x.end_ms,
  captured_at:Date.now(),embedding:x.embedding.slice(),confirmed:false};
 if(queue.some(v=>key(v)===key(entry)))return;
 queue.push(entry);
 if(queue.length>MAX_SAMPLES){
  const removed=queue.splice(0,queue.length-MAX_SAMPLES);
  console.warn('[CAM++ DELAY] RAM limit reached, lost',removed.length,'old audio fingerprints');
 }
 render();
 void flush();
}
async function flush(){
 if(working||!current||current!==currentSession())return;
 const now=Date.now();
 const matured=queue.filter(x=>!x.confirmed&&now-x.captured_at>=DELAY_MS).slice(0,35);
 if(!matured.length){render();return}
 const start=matured[0].start_ms;
 // Include up to five minutes of later acoustic context to disambiguate
 // voices; only commit the embeddings that are at least five minutes old.
 const candidates=queue.filter(x=>x.start_ms>=start-120000&&x.start_ms<=start+300000);
 const spans=candidates.slice(0,90);
 const included=new Set(spans.map(key));
 const ready=matured.filter(x=>included.has(key(x)));
 if(!ready.length)return;
 working=true;lastError='';render();
 try{
  const response=await fetch('/api/voice-delayed',{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:current,spans:spans.map(x=>({
     seq:x.seq,start_ms:x.start_ms,end_ms:x.end_ms,captured_at:x.captured_at,embedding:x.embedding
   })),commit_keys:ready.map(key)})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'HTTP '+response.status);
  if(current!==currentSession())return;
  lastResult=data;lastRun=Date.now();
  const saved=new Set(ready.map(key));
  for(const entry of queue)if(saved.has(key(entry)))entry.confirmed=true;
  const cutoff=Date.now()-KEEP_MS;
  queue=queue.filter(x=>!x.confirmed||x.captured_at>=cutoff);
  window.dispatchEvent(new CustomEvent('debate-voice-delayed-result',{detail:data}));
 }catch(err){lastError=String(err?.message||err).slice(0,180);
  console.warn('[CAM++ DELAY]',err);
 }finally{working=false;render()}
}
window.addEventListener('livefact-session-changed',e=>reset(e.detail?.id||currentSession()));
window.debateVoiceDelay={push,flush,diagnostics:()=>({session:current,pending:queue.filter(x=>!x.confirmed).length,
 lastResult,lastError,lastRun})};
setInterval(()=>{if(current&&current===currentSession())void flush();else if(current&&current!==currentSession())reset(currentSession())},TICK_MS);
render();
})();
