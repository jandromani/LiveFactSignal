// DEBATE/SIGNAL · Biometric speaker gallery. Audio is decoded locally and discarded.
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let worker=null,req=0,pending=new Map(),profileCount=0,sessionId='',busy=0,queue=[],loading=false;
const status=(m,error=false)=>{const x=$('#voiceStatus');if(x){x.textContent=m;x.style.color=error?'#f18e91':'#75ead0'}};
const admin=()=>$('#adminKey')?.value?.trim()||sessionStorage.getItem('debate_admin')||'';
const debate=()=>localStorage.getItem('debate_live_id')||'';
function ensureWorker(){
 if(worker)return worker;
 worker=new Worker('/voice-worker.js',{type:'module'});
 worker.onmessage=e=>{const a=pending.get(e.data?.id);if(!a)return;pending.delete(e.data.id);e.data.ok?a.resolve(e.data):a.reject(Error(e.data.error||'Error CAM++'));};
 worker.onerror=e=>{status('El modelo local no ha podido arrancar: '+(e.message||'error de descarga'),true);for(const x of pending.values())x.reject(Error('No se pudo inicializar el worker'));pending.clear();worker?.terminate();worker=null;};
 return worker;
}
function rpc(type,pcm,sampleRate=16000){
 ensureWorker();
 const id=++req;
 return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});try{worker.postMessage({id,type,samples:pcm,sampleRate},pcm?.buffer?[pcm.buffer]:[])}catch(e){pending.delete(id);reject(e)}});
}
async function decode(blob,span=null){
 if(!blob||blob.size<2000)throw Error('Audio vacío');
 const ac=new AudioContext({sampleRate:16000});
 try{
  const buf=await ac.decodeAudioData(await blob.arrayBuffer());
  const sr=buf.sampleRate;
  if(buf.duration<2)throw Error('Se necesitan al menos 2 segundos de una sola voz');
  const first=buf.getChannelData(0),other=buf.numberOfChannels>1?buf.getChannelData(1):null;
  const from=span?Math.max(0,Math.round(span.start_rel_ms/1000*sr)):0;
  const until=span?Math.min(first.length,Math.round(span.end_rel_ms/1000*sr)):first.length;
  if(until-from<sr*2.5)throw Error('Tramo de voz inferior a 2,5 segundos');
  const pcm=new Float32Array(until-from);
  let sum=0;
  for(let i=from;i<until;i++){const x=other?(first[i]+other[i])*.5:first[i];pcm[i-from]=x;sum+=x*x;}
  if(Math.sqrt(sum/pcm.length)<0.002)throw Error('Audio demasiado silencioso para reconocer una voz');
  return {pcm,sampleRate:sr,duration_ms:Math.round(pcm.length/sr*1000)};
 }finally{await ac.close().catch(()=>{});}
}
async function embedding(blob,span=null){
 const x=await decode(blob,span);const r=await rpc('embed',x.pcm,x.sampleRate);
 return {embedding:r.embedding,duration_ms:x.duration_ms};
}
async function api(action,data){
 const id=debate();if(!id)throw Error('Crea primero una sesión');
 const response=await fetch('/api/voice?action='+encodeURIComponent(action)+(data?'':'&id='+encodeURIComponent(id)),{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','x-admin-token':admin()}:{},body:data?JSON.stringify({id,...data}):undefined});
 const value=await response.json().catch(()=>({}));if(!response.ok)throw Error(value.error||'HTTP '+response.status);
 return value;
}
async function roster(){
 const id=debate();if(!id)return [];
 const response=await fetch('/api/supervisor?action=identity&id='+encodeURIComponent(id));
 const j=await response.json();return j.roster||[];
}
async function refresh(){
 const id=debate();if(!id||loading)return;loading=true;
 try{
  const [people,data]=await Promise.all([roster(),api('list')]);
  if(id!==debate())return;
  const sel=$('#voiceCandidate'),previous=sel.value;
  sel.innerHTML='<option value="">Seleccionar político o moderador</option>'+people.map(p=>'<option value="'+escape(p.name)+'">'+escape(p.name)+' · '+escape(p.party)+'</option>').join('');
  if(people.some(p=>p.name===previous))sel.value=previous;
  const counts=new Map();for(const p of data.profiles)counts.set(p.person_name,(counts.get(p.person_name)||0)+1);
  profileCount=data.profiles.length;sessionId=id;
  $('#voiceProfiles').innerHTML=data.profiles.length?people.map(p=>'<div class="measure"><span>'+escape(p.name)+'</span><strong>'+(counts.get(p.name)||0)+' muestras</strong></div>').join('')+'<div class="caption">Total: '+data.profiles.length+' referencias; compara mediante similitud coseno, no probabilidad.</div>':'<div class="micro">Todavía no hay referencias. Selecciona Pedro Sánchez y carga una muestra de voz para empezar.</div>';
  $('#voiceRemove').innerHTML='<option value="">Eliminar una muestra concreta…</option>'+data.profiles.map(p=>'<option value="'+escape(p.id)+'">'+escape(p.person_name)+' · '+escape(p.source_type)+' · '+new Date(p.created_at).toLocaleString('es-ES')+'</option>').join('');
  const latest=data.events?.[0];
  if(latest)status('Última comparación: '+(latest.decision==='matched'?latest.person_name:'desconocido')+' · similitud '+Number(latest.score||0).toFixed(3));
  else status(data.profiles.length+' muestras registradas. Preparado para identificar voces.');
 }catch(e){status('Perfiles: '+e.message,true)}
 finally{loading=false}
}
async function saveSample(blob,kind){
 const name=$('#voiceCandidate').value;
 if(!name)throw Error('Selecciona primero el candidato o moderador');
 if(!admin())throw Error('Necesitas la clave de administrador');
 status('Calculando huella CAM++ local… La primera carga descarga el modelo y WASM.');
 const r=await embedding(blob);
 const response=await api('enroll',{name,embedding:r.embedding,duration_ms:r.duration_ms,source_type:kind,source_reference:$('#voiceSourceUrl').value.trim()});
 status('Referencia de '+name+' registrada: '+(r.duration_ms/1000).toFixed(1)+'s y 192 dimensiones.');
 await refresh();
 return response;
}
async function enrollFile(){
 const file=$('#voiceFile').files?.[0];if(!file)return status('Selecciona primero un archivo WAV, MP3, M4A, OGG o WebM',true);
 if(file.size>35_000_000)return status('Máximo 35 MB por muestra',true);
 try{await saveSample(file,'file')}catch(e){status(e.message,true)}
}
async function enrollTab(){
 if(!$('#voiceCandidate').value)return status('Selecciona primero el candidato a identificar',true);
 if(!navigator.mediaDevices?.getDisplayMedia)return status('La captura de pestaña requiere Chrome/Edge y HTTPS',true);
 let stream;try{
 stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:{echoCancellation:false,noiseSuppression:false}});
 if(!stream.getAudioTracks().length)throw Error('Marca «Compartir audio de la pestaña»');
 const audio=new MediaStream(stream.getAudioTracks()),mime=['audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime)throw Error('MediaRecorder no admite WebM');
 const rec=new MediaRecorder(audio,{mimeType:mime,audioBitsPerSecond:64000}),parts=[];
 status('Grabando 12 segundos de UNA voz de la pestaña compartida…');
 await new Promise((resolve,reject)=>{
  let timer;
  rec.ondataavailable=e=>{if(e.data?.size)parts.push(e.data)};
  rec.onerror=e=>reject(Error('Error de grabación de voz'));
  rec.onstop=()=>{clearTimeout(timer);resolve()};
  rec.start();timer=setTimeout(()=>{if(rec.state==='recording')rec.stop()},12000);
  stream.getAudioTracks()[0].onended=()=>{if(rec.state==='recording')rec.stop()};
 });
 const blob=new Blob(parts,{type:mime});await saveSample(blob,'tab');
 }catch(e){status(e.message,true)}finally{stream?.getTracks().forEach(t=>t.stop())}
}
async function processChunk(blob,result,start_ms,end_ms,seq,id){
 if(!$('#voiceAuto')?.checked)return;
 if(id!==debate()||profileCount<1)return;
 // Chunk-level embeddings are only meaningful for monophonic segments.
 // Never assign every word in a mixed-speaker chunk to one candidate.
 const monophonic=Number(result.speaker_count)===1;
 if(!monophonic){status('Varias voces en un mismo bloque: identificación aplazada para evitar atribución incorrecta.');return}
 const spans=Array.isArray(result.voice_spans)&&result.voice_spans.length?
   result.voice_spans.filter(s=>Number(s.duration_ms)>=6500&&s.speaker_key!=='desconocido'):
   [{start_rel_ms:0,end_rel_ms:end_ms-start_ms,start_ms,end_ms,duration_ms:end_ms-start_ms,speaker_key:'single'}].filter(s=>s.duration_ms>=6500);
 for(const span of spans){
  if(queue.length>=12){status('Cola de huellas llena: espera al procesamiento para evitar atrasos',true);break;}
  queue.push({blob,start_ms:span.start_ms,end_ms:span.end_ms,seq,id,span});
 }
 if(spans.length)drain();
}
async function drain(){
 if(busy||!queue.length)return;busy=1;const item=queue.shift();
 try{
  const r=await embedding(item.blob,item.span);
  const match=await api('match',{embedding:r.embedding,start_ms:item.start_ms,end_ms:item.end_ms,seq:item.seq});
  if(match.matched){status('Voz reconocida: '+match.name+' · similitud '+match.score.toFixed(3)+' (no es probabilidad). '+match.changed+' afirmaciones actualizadas.');}
  else if(match.status==='unknown')status('Voz desconocida (similitud máx. '+match.score?.toFixed(3)+'); se conserva sin identificar.');
  window.dispatchEvent(new CustomEvent('debate-voice-result',{detail:match}));
 }catch(e){status('Huella vocal: '+e.message,true)}
 finally{busy=0;drain()}
}
async function remove(){
 const profile_id=$('#voiceRemove').value;if(!profile_id)return;
 if(!confirm('¿Eliminar permanentemente esta huella vocal?'))return;
 try{await api('delete',{profile_id});await refresh();status('Huella eliminada')}catch(e){status(e.message,true)}
}
function findSample(){
 const name=$('#voiceCandidate').value;if(!name)return status('Selecciona un participante',true);
 const query=name+' entrevista '+($('#eventDate')?.value?.slice(0,4)||'2019')+' voz';
 window.open('https://www.youtube.com/results?search_query='+encodeURIComponent(query),'_blank','noopener,noreferrer');
}
$('#voiceFileSend').onclick=enrollFile;
$('#voiceTabSend').onclick=enrollTab;
$('#voiceRemoveGo').onclick=remove;
$('#voiceSearch').onclick=findSample;
$('#voiceRefresh').onclick=refresh;
$('#voiceAuto').onchange=()=>status($('#voiceAuto').checked?'Comparación vocal activada':'Comparación vocal en pausa');
window.debateVoice={processChunk,refresh,embed:embedding,warmup:async()=>{const r=await rpc('warmup');status('Motor acústico CAM++ listo: 192 dimensiones.');return r}};
window.addEventListener('debate-voice-result',()=>setTimeout(refresh,800));
setInterval(()=>{if(debate()!==sessionId)refresh()},5000);
refresh();
