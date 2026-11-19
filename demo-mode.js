/* DEBATE / SIGNAL: demo-first operator launchpad. No embedded secret and no replay claims in the live debate. */
(()=>{
'use strict';
const DEMO_ID='8ee348bb-acac-4934-8358-e183d0a57712';
const TODAY_ID='f3c2fd9b-5fa1-4818-a407-453f5cac4a34';
const currentToday=()=>localStorage.getItem('lfs_current_live')||TODAY_ID;
const YOUTUBE_ID='Sx5E5nLJpAE';
const YT_URL='https://www.youtube.com/watch?v='+YOUTUBE_ID;
const RTVE_URL='https://www.rtve.es/play/videos/directo/la-1/';
const $=s=>document.querySelector(s);
let mode=localStorage.getItem('debate_live_id')===DEMO_ID?'demo':'today';
let switching=false,demoTimer=null,summaryTimer=null,demoStarted=false,videoLoaded=false;
const setText=(id,text)=>{const e=$('#'+id);if(e)e.textContent=text};
const report=(message,type='')=>{
 const el=$('#lfModeMessage');if(!el)return;
 el.textContent=message;el.style.color=type==='error'?'#f5b49d':type==='success'?'#a2f2cf':'#b7cfce';
};
function video(){
 if(videoLoaded)return;
 const frame=$('#lfDemoVideo');
 const params=new URLSearchParams({enablejsapi:'1',origin:location.origin,playsinline:'1',rel:'0',controls:'1',iv_load_policy:'3'});
 frame.src='https://www.youtube-nocookie.com/embed/'+YOUTUBE_ID+'?'+params.toString();
 frame.setAttribute('loading','eager');
 videoLoaded=true;
}
function play(){
 const f=$('#lfDemoVideo');if(!videoLoaded||!f?.contentWindow)return;
 // YouTube IFrame Player API. A manual play control remains visible if autoplay is blocked.
 f.contentWindow.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}), 'https://www.youtube-nocookie.com');
}
function pause(){
 const f=$('#lfDemoVideo');if(!videoLoaded||!f?.contentWindow)return;
 f.contentWindow.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}), 'https://www.youtube-nocookie.com');
}
function ui(){
 const demo=mode==='demo';
 $('#lfDemoStage').hidden=!demo;
 $('#lfTodayStage').hidden=demo;
 $('#lfDemoBtn').classList.toggle('isActive',demo);
 $('#lfTodayBtn').classList.toggle('isActive',!demo);
 $('#lfDemoBtn').setAttribute('aria-pressed',String(demo));
 $('#lfTodayBtn').setAttribute('aria-pressed',String(!demo));
 setText('lfModeStatus',demo?'DEMO · SESIÓN AISLADA':'HOY · SESIÓN OFICIAL');
 if(demo)video();
 if(!demo)pause();
 const presets=$('#opPresets');
 if(presets){
  for(const b of presets.querySelectorAll('[data-id]'))b.classList.toggle('on',b.dataset.id===(demo?DEMO_ID:currentToday()));
 }
 setText('opCurrent',demo?'DEMO · 2023 · QA aislada':'Hoy · 19/11 · Sánchez vs. Feijóo');
 const wizard=$('#liveConnectWizard');
 if(wizard)wizard.open=!demo;
}
async function select(next){
 if(switching)return;
 const requested=next==='demo'?'demo':'today';
 const id=requested==='demo'?DEMO_ID:currentToday();
 switching=true;
 $('#lfDemoBtn').disabled=true;$('#lfTodayBtn').disabled=true;$('#lfGoToday').disabled=true;
 report(requested==='demo'?'Cargando debate de demostración y voces precargadas…':'Finalizando el audio de la demo antes de preparar el directo de hoy…');
 try{
  const core=window.LiveFactSignal;
  if(!core?.selectSession)throw Error('El motor todavía está iniciándose. Inténtalo de nuevo.');
  const result=await core.selectSession(id);
  if(!result?.ok)throw Error('No se pudo seleccionar la sesión.');
  mode=requested;
  if(mode==='today'){stopDemoTimer();demoStarted=false;}
  ui();
  report(mode==='demo'?'DEMO preparada. Introduce OpenRouter, pulsa «Reproducir y escuchar» y comparte audio de «Esta pestaña».':'Debate de HOY seleccionado. OpenRouter se mantiene en la misma pestaña. RTVE empezará a las 22:00.', 'success');
  if(mode==='demo')refreshDemo();
 }catch(e){report('No se ha cambiado de sesión: '+e.message,'error');}
 finally{switching=false;$('#lfDemoBtn').disabled=false;$('#lfTodayBtn').disabled=false;$('#lfGoToday').disabled=false;}
}
function stopDemoTimer(){if(demoTimer)clearTimeout(demoTimer);demoTimer=null;}
function stopDemo(){
 stopDemoTimer();
 if(mode!=='demo')return;
 window.LiveFactSignal?.stopCapture?.();pause();
 setText('lfDemoConclusion','Captura detenida. Se están terminando de analizar los últimos fragmentos…');
 setTimeout(refreshDemo,1500);
}
async function beginDemo(){
 if(mode!=='demo')return report('Selecciona primero DEMO.','error');
 const key=$('#routerKey')?.value.trim()||'';
 if(!key&&$('#healthBadge')?.textContent?.includes('BYOK')){
  report('Solo falta OpenRouter: introduce tu clave en el paso 02 y vuelve a pulsar Reproducir y escuchar.','error');
  $('#routerKey')?.focus();return;
 }
 const auth=$('#opCheckAuth')?.classList.contains('ok');
 if(!auth){report('Primero activa el acceso privado de operador desde el enlace enviado en esta conversación.','error');return;}
 video();
 report('Selecciona «Esta pestaña» y activa «Compartir audio» en el selector de Chrome/Edge.');
 try{
  demoStarted=true;
  await window.LiveFactSignal?.startCapture?.();
 }catch(e){report('No se pudo iniciar la captura: '+String(e?.message||e),'error');}
}
async function beginToday(){
 if(mode!=='today')return report('Selecciona primero HOY.','error');
 if(!$('#routerKey')?.value.trim()&&$('#healthBadge')?.textContent?.includes('BYOK')){
  report('Introduce tu clave OpenRouter en el paso 02.','error');$('#routerKey')?.focus();return;
 }
 if(!$('#opCheckAuth')?.classList.contains('ok'))return report('Activa primero tu acceso privado de operador.','error');
 report('Selecciona la pestaña RTVE y marca «Compartir audio». La consola debe permanecer abierta.');
 try{await window.LiveFactSignal?.startCapture?.()}catch(e){report(String(e.message||e),'error')}
}
async function refreshDemo(){
 if(mode!=='demo')return;
 try{
  const response=await fetch('/api/live?action=state&id='+encodeURIComponent(DEMO_ID),{cache:'no-store'});
  if(!response.ok)throw Error('No se pudieron consultar las pruebas');
  const j=await response.json(),segments=Array.isArray(j.segments)?j.segments:[],claims=(Array.isArray(j.claims)?j.claims:[]).filter(x=>x.state!=='excluded');
  const processed=segments.filter(s=>s.status==='processed').length;
  const voice=claims.filter(c=>c.speaker_origin==='voice_embedding'&&(c.speaker==='Pedro Sánchez'||c.speaker==='Alberto Núñez Feijóo')).length;
  const provisional=claims.filter(c=>c.state==='provisional').length;
  setText('lfDemoSegments',String(processed));
  setText('lfDemoClaims',String(claims.length));
  setText('lfDemoVoices',String(voice));
  setText('lfDemoVerified',String(provisional));
  const examples=$('#lfDemoExamples');
  if(examples){
   examples.replaceChildren();
   const recent=[...claims].sort((a,b)=>Number(b.start_ms||0)-Number(a.start_ms||0)).slice(0,4);
   if(!recent.length){const n=document.createElement('div');n.textContent='Aún no hay afirmaciones evaluables. Se mostrarán aquí, sin inventar resultados.';examples.appendChild(n);}
   for(const item of recent){
    const card=document.createElement('div'),speaker=document.createElement('b'),quote=document.createElement('div'),meta=document.createElement('span');
    speaker.textContent=item.speaker||'Sin identificar';
    quote.textContent='“'+String(item.quote||'').slice(0,350)+'”';
    meta.textContent=(item.speaker_origin==='voice_embedding'?'Coincidencia acústica · ':'Identificación pendiente · ')+(item.state==='provisional'?'Análisis IA provisional':item.state==='needs_review'?'Revisión necesaria':'En investigación');
    card.append(speaker,quote,meta);examples.appendChild(card);
   }
  }
  const status=$('#lfDemoConclusion');if(!status)return;
  status.classList.remove('good','warn');
  if(processed>=2&&claims.length>0&&voice>0&&provisional>0){
   status.classList.add('good');
   status.textContent='✓ DEMO VALIDADA PARCIALMENTE: audio transcrito, afirmaciones detectadas, voz atribuida acústicamente y evaluación IA. Antes de darla por certificada habría que contrastar la identidad y las fuentes con una referencia humana.';
  }else if(processed>0){
   status.classList.add('warn');
   status.textContent='Audio funcionando: '+processed+' fragmentos transcritos. '+(claims.length?claims.length+' afirmaciones detectadas. ':'Todavía no hay afirmaciones. ')+(voice?voice+' atribuidas acústicamente. ':'Identificación de voces pendiente. ')+(provisional?provisional+' evaluación(es) IA.':'Verificación en curso o pendiente.');
  }else{
   status.textContent=demoStarted?'Esperando el primer fragmento transcrito. Comprueba «AUDIO RECIBIDO» en el medidor de sonido.':'Pulsa «Reproducir y escuchar». Los contadores reflejarán datos reales de la sesión QA.';
  }
 }catch(e){setText('lfDemoConclusion','Lectura de resultados no disponible: '+e.message)}
}
function captureStart(){
 if(mode==='demo'){
  setText('lfDemoAudioBadge','● Compartiendo pestaña: comprobando niveles de audio');
  demoStarted=true;
  play();
  stopDemoTimer();
  demoTimer=setTimeout(()=>{stopDemo();report('DEMO de cinco minutos terminada. Valida los contadores y pulsa HOY.','success')},5*60*1000);
  report('● DEMO CAPTURANDO. Reproduciendo YouTube. Si se queda en pausa, pulsa ▶ en el vídeo.','success');
 }else report('● RTVE CAPTURANDO. La señal se está enviando para transcripción.','success');
}
function captureStop(){if(mode==='demo'){stopDemoTimer();pause();setText('lfDemoAudioBadge','■ Captura detenida');setTimeout(refreshDemo,500)}}
function handlePlayerEvent(event){
 if(mode!=='demo'||!videoLoaded||event.source!==$('#lfDemoVideo')?.contentWindow||!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(event.origin))return;
 try{
  const data=typeof event.data==='string'?JSON.parse(event.data):event.data;
  if(data?.event==='onStateChange'&&data.info===0&&window.LiveFactSignal?.snapshot?.().capturing){
   stopDemo();report('Fin del vídeo. Procesando los últimos fragmentos de la demo.','success');
  }
 }catch{}
}
function init(){
 if(!$('#lfDemoBtn'))return;
 $('#lfDemoBtn').addEventListener('click',()=>select('demo'));
 $('#lfTodayBtn').addEventListener('click',()=>select('today'));
 $('#lfGoToday').addEventListener('click',()=>select('today'));
 $('#lfDemoListen').addEventListener('click',beginDemo);
 $('#lfDemoValidate').addEventListener('click',()=>{stopDemo();refreshDemo()});
 $('#lfOpenRTVE').addEventListener('click',()=>window.open(RTVE_URL,'_blank','noopener,noreferrer'));
 $('#lfStartToday').addEventListener('click',beginToday);
 window.addEventListener('debate-capture-start',captureStart);
 window.addEventListener('debate-capture-stop',captureStop);
 window.addEventListener('message',handlePlayerEvent);
 ui();
 setInterval(()=>{if(mode==='demo'&&!document.hidden)refreshDemo();if(mode==='demo'&&$('#audioSignalStatus'))setText('lfDemoAudioBadge',$('#audioSignalStatus').textContent)},2400);
 if(mode==='demo')refreshDemo();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();