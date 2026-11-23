// Independent second pass. Keep captured WebM blobs ONLY in volatile browser RAM
// until five minutes have elapsed, extract additional short CAM++ windows locally,
// then send embeddings (never raw audio) for clustering and 8-way backend matching.
(()=>{
'use strict';
const DELAY_MS=300000,KEEP_MS=850000,TICK_MS=20000,MAX_SAMPLES=190;
let current='',queue=[],rawQueue=[],working=false,rawWorking=false,lastResult=null,lastError='',lastRun=0;
const key=x=>x.seq+':'+x.start_ms+':'+x.end_ms;
const el=()=>document.getElementById('voiceDelayedStatus');
function currentSession(){return localStorage.getItem('debate_live_id')||''}
function render(){
 const pending=queue.filter(x=>!x.confirmed).length;
 const mature=queue.filter(x=>!x.confirmed&&Date.now()-x.captured_at>=DELAY_MS).length;
 const oldest=queue.find(x=>!x.confirmed);
 const remaining=oldest?Math.max(0,Math.ceil((DELAY_MS-(Date.now()-oldest.captured_at))/1000)):0;
 const waitingRaw=rawQueue.filter(x=>!x.done).length;
 const line='SEGUNDA PASADA · retraso 5 min · '+waitingRaw+' fragmentos WebM en memoria · '+pending+' vectores pendientes · '+
   mature+' listos · próxima revisión '+remaining+' s'+
   (lastResult?' · '+lastResult.groups+' grupos de voz, '+lastResult.recognized+' tramos reconocidos, '+lastResult.claims_changed+' citas actualizadas':'')+
   (lastResult?.nogueras?.length?' · Nogueras: '+lastResult.nogueras.filter(x=>x.accepted).length+' grupos confirmados, '+
     lastResult.nogueras.filter(x=>!x.accepted).length+' pendientes (no atribuidos)':'')+
   (lastError?' · ERROR: '+lastError:'');
 if(el())el().textContent=line;
 window.dispatchEvent(new CustomEvent('debate-voice-delayed-status',
   {detail:{pending,mature,remaining,rawQueued:waitingRaw,working,rawWorking,lastResult,lastError}}));
}
function reset(id){current=id;queue=[];rawQueue=[];working=false;rawWorking=false;lastError='';lastResult=null;lastRun=0;render()}
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
  captured_at:Number.isSafeInteger(x.captured_at)?x.captured_at:Date.now(),embedding:x.embedding.slice(),confirmed:false};
 if(queue.some(v=>key(v)===key(entry)))return;
 queue.push(entry);
 if(queue.length>MAX_SAMPLES){
  const removed=queue.splice(0,queue.length-MAX_SAMPLES);
  console.warn('[CAM++ DELAY] RAM limit reached, lost',removed.length,'old audio fingerprints');
 }
 render();
 void flush();
}
// Separate diarization path: do not rely on Scribe supplying accurate speaker
// boundaries. Sample 4.7-second overlapping windows every 3 seconds.
function windowSpans(result,start_ms,end_ms){
 const duration=end_ms-start_ms;
 const annotated=(Array.isArray(result?.voice_spans)?result.voice_spans:[]).map(x=>{
  const a=x.start_rel_ms!=null?Number(x.start_rel_ms):Number(x.start_ms)-start_ms;
  const b=x.end_rel_ms!=null?Number(x.end_rel_ms):Number(x.end_ms)-start_ms;
  return {start_rel_ms:Math.round(Math.max(0,a)),end_rel_ms:Math.round(Math.min(duration,b))};
 }).filter(x=>Number.isFinite(x.start_rel_ms)&&Number.isFinite(x.end_rel_ms)
  &&x.end_rel_ms-x.start_rel_ms>=2800&&x.end_rel_ms-x.start_rel_ms<=16000);
 if(annotated.length>=2){
  const sorted=annotated.sort((a,b)=>a.start_rel_ms-b.start_rel_ms);
  const clean=sorted.filter(x=>!sorted.some(y=>x!==y&&
   Math.min(x.end_rel_ms,y.end_rel_ms)-Math.max(x.start_rel_ms,y.start_rel_ms)>350));
  if(clean.length>=2)return clean.slice(0,5);
 }
 const windows=[];
 for(let from=0;from<duration&&windows.length<5;from+=3000){
  const until=Math.min(duration,from+4700);
  if(until-from>=2800)windows.push({start_rel_ms:from,end_rel_ms:until});
 }
 return windows;
}
function captureRaw({id,seq,start_ms,end_ms,blob,result}={}){
 const live=currentSession();
 if(id!==live||!blob||blob.size<2000||end_ms-start_ms<6000)return;
 if(current!==live)reset(live);
 if(rawQueue.some(x=>x.seq===seq))return;
 rawQueue.push({id,seq,start_ms,end_ms,blob,result,captured_at:Date.now(),done:false});
 if(rawQueue.length>72){
  // A browser reload/closed tab discards everything; this bound prevents
  // accidental unlimited memory growth during stalled worker inference.
  const overflow=rawQueue.length-72;
  console.warn('[CAM++ DELAY] Discarding',overflow,'old unprocessed browser blobs');
  rawQueue.splice(0,overflow);
 }
 render();
}
async function processRaw(){
 if(rawWorking||current!==currentSession())return;
 const ready=rawQueue.filter(x=>!x.done&&Date.now()-x.captured_at>=DELAY_MS).slice(0,5);
 if(!ready.length)return;
 const embed=window.debateVoice?.embed;
 const count=window.debateVoice?.diagnostics?.().profiles||0;
 if(typeof embed!=='function'||count<60){
  lastError='CAM++ no tiene suficientes referencias en el navegador para analizar la segunda pasada';
  render();return;
 }
 rawWorking=true;
 try{
  for(const item of ready){
   if(item.id!==currentSession())break;
   const windows=windowSpans(item.result,item.start_ms,item.end_ms);
   let valid=0;
   for(const span of windows){
    try{
     const sample=await embed(item.blob,span);
     if(item.id!==currentSession())break;
     push({id:item.id,seq:item.seq,
      start_ms:item.start_ms+span.start_rel_ms,end_ms:item.start_ms+span.end_rel_ms,
      captured_at:item.captured_at,referenceCount:count,embedding:sample.embedding});
     valid++;
    }catch(e){console.warn('[CAM++ DELAY] Acoustic window skipped:',e.message)}
   }
   item.done=true;item.blob=null;item.result=null; // release audio RAM promptly
   if(!valid)lastError='STT #'+item.seq+': ninguna ventana de voz válida para segunda pasada';
  }
  rawQueue=rawQueue.filter(x=>!x.done);
 }catch(e){lastError=String(e?.message||e).slice(0,170)}
 finally{rawWorking=false;render();void flush()}
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
window.debateVoiceDelay={push,captureRaw,flush,diagnostics:()=>({session:current,
 pending:queue.filter(x=>!x.confirmed).length,rawQueued:rawQueue.length,
 lastResult,lastError,lastRun})};
setInterval(()=>{
 if(current&&current===currentSession()){void processRaw();void flush()}
 else if(current&&current!==currentSession())reset(currentSession())
},TICK_MS);
render();
})();
