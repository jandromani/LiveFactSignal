(()=>{
'use strict';
const nativeFetch=window.fetch.bind(window);
const routes=new Set(['live','scribe','scribe-v2','catalog','voice','voice-auto','supervisor','monitor']);
window.fetch=function(input,opts){
 try{
  const url=typeof input==='string'?input:input.url,parsed=new URL(url,location.href);
  const method=String(opts?.method||(typeof input==='object'?input.method:'GET')).toUpperCase();
  const route=parsed.pathname.startsWith('/api/')?parsed.pathname.slice(5):'';
  if(method!=='POST'||parsed.origin!==location.origin||!routes.has(route))return nativeFetch(input,opts);
  const to=new URL('/api/operator-proxy',location.origin);to.search=parsed.search;to.searchParams.set('route',route);
  const headers=new Headers(opts?.headers||{});headers.delete('x-admin-token');
  const promise=nativeFetch(to.pathname+to.search,{...opts,method:'POST',headers,credentials:'same-origin'});
  if(route==='live'&&parsed.searchParams.get('action')==='probe')promise.then(async r=>{routerVerified=r.ok;check('opCheckRouter',r.ok?'✓ OpenRouter probado':'! Clave OpenRouter inválida',r.ok)}).catch(()=>{routerVerified=false;check('opCheckRouter','! Sin conexión a OpenRouter',false)});
  return promise;
 }catch{return nativeFetch(input,opts)}
};
// The value is deliberately NOT the admin secret; the server-side proxy injects that
// secret only after validating a signed HttpOnly session cookie.
sessionStorage.setItem('debate_admin','operator-session-managed');
const $=s=>document.querySelector(s);
function check(id,message,ready){
 const el=$('#'+id);if(!el)return;
 el.textContent=message;el.classList.toggle('ok',Boolean(ready));el.classList.toggle('warn',!ready);
}
let authReady=false,voiceWarm=false,voiceLoading=false,activeCapture=false,wakeLock=null,routerVerified=false;
const voiceSeedLastAttempt=new Map(),voiceInitialized=new Set(),voiceReconciledSignatures=new Map(),voiceManuallyDisabled=new Set();
function updateLocalVoiceInfo(x){
 const el=$('#opVoiceLocalDiagnostics');if(!el||!x)return;
 const active=x.enabled?'✓ activo':'! desactivado';
 el.textContent='NAVEGADOR · CAM++ '+active+' · '+x.profiles+' huellas · '+x.received+' respuestas STT recibidas · '+x.queued+' ventanas encoladas · '+x.attempted+' intentos · '+x.compared+' respuestas API · '+x.skipped+' descartes · '+x.errors+' errores · Último: '+x.lastReason;
 el.style.color=x.errors||x.skipped&&!x.compared?'#ffcc8d':'#a7ded1';
}
async function preflight(){
 const selected=window.LiveFactSignal?.snapshot?.().id||localStorage.getItem('debate_live_id')||'';
 if(!selected)return;
 try{
  const authResult=await nativeFetch('/api/operator-auth?action=status',{credentials:'same-origin',cache:'no-store'});
  const auth=await authResult.json();
  authReady=auth.authorized===true;
  check('opCheckAuth',authReady?'✓ Operador autorizado':'! Falta activar operador',authReady);
  try{
   const r=await nativeFetch('/api/live?action=health',{cache:'no-store'});
   const j=await r.json();check('opCheckDb',r.ok&&j.database?'✓ Neon conectado':'! Neon no disponible',r.ok&&Boolean(j.database));
  }catch{check('opCheckDb','! Sin lectura de Neon',false)}
  if(!authReady){check('opCheckVoice','◌ Huellas protegidas: activa tu acceso',false);return}
  async function health(){
   const r=await nativeFetch('/api/voice-health?id='+encodeURIComponent(selected),{credentials:'same-origin',cache:'no-store'});
   const v=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(v.error||'API vocal HTTP '+r.status);
   return v;
  }
  let info=await health();
  const needsSeed=info.total_candidates===0||info.ready_candidates<info.total_candidates;
  const since=Date.now()-(voiceSeedLastAttempt.get(selected)||0);
  if(needsSeed&&since>45000){
   voiceSeedLastAttempt.set(selected,Date.now());
   check('opCheckVoice','◌ Sincronizando huellas con Neon · '+selected.slice(0,8),false);
   const r=await nativeFetch('/api/voice-seed',{method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected})});
   const v=await r.json().catch(()=>({}));
   if(!r.ok)throw Error('Sincronización: '+(v.error||r.status));
   info=await health();
   try{await Promise.resolve(window.debateVoice?.refresh?.())}catch{}
  }
  // Apply persisted acoustic spans to late-arriving, still-unknown claims.
  if(info.voice_v2?.total>0&&info.claims?.unknown>0){
   const signature=String(info.voice_v2.total)+':'+String(info.claims.total);
   if(voiceReconciledSignatures.get(selected)!==signature){
    try{
     const resp=await nativeFetch('/api/voice-reconcile',{method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected})});
     const output=await resp.json().catch(()=>({}));
     if(resp.ok){
      voiceReconciledSignatures.set(selected,signature);
      if(output.updated>0){info=await health();try{await Promise.resolve(window.debateVoice?.refresh?.())}catch{}}
     }else console.warn('[VOICE reconcile]',output.error||resp.status);
    }catch(e){console.warn('[VOICE reconcile]',e.message)}
   }
  }
  const allReady=info.total_candidates>0&&info.ready_candidates===info.total_candidates;
  const refs=info.roster?.filter(x=>x.role==='candidate').reduce((n,x)=>n+Number(x.reference_count||0),0)||0;
  const detail=(info.ready_candidates||0)+'/'+(info.total_candidates||0)+' candidatos · '+refs+' huellas';
  check('opCheckVoice',(allReady?'✓ ':'! ')+detail+' · sesión '+selected.slice(0,8),allReady);
  const stats=$('#opVoiceDiagnostics');
  if(stats){
   stats.textContent='CAM++ · '+(info.voice_v2?.matched||0)+' tramos reconocidos / '+(info.voice_v2?.total||0)+' comparados · '+(info.voice_v2?.candidate_pending||0)+' esperando continuidad · '+(info.claims?.voice_attributed||0)+' afirmaciones atribuidas por voz / '+(info.claims?.total||0)+' totales · '+(info.claims?.unknown||0)+' sin identificar'+
     ((info.voice_v2?.by_voice||[]).length?' · '+info.voice_v2.by_voice.map(x=>x.candidate+': '+x.matched+' reconocidos, '+x.awaiting_continuity+' pendientes').join(' · '):'');
  }
  const local=window.debateVoice?.diagnostics?.();
  if(local)updateLocalVoiceInfo(local);
  const voice=$('#voiceAuto');
  if(voice){
   // Fix sticky OFF state: previously an early preflight with missing refs
   // unchecked this control and marked it initialized. Once all refs arrived,
   // later checks NEVER re-enabled the matcher even though the status was green.
   const shouldEnable=allReady&&!voiceManuallyDisabled.has(selected);
   if(voice.checked!==shouldEnable)voice.checked=shouldEnable;
   voiceInitialized.add(selected);
   if($('#voiceAutoStats'))$('#voiceAutoStats').textContent=shouldEnable?
    '✓ Comparación CAM++ activa. Scribe aporta tramos locales y CAM++ los identifica; las voces ambiguas quedan sin asignar.':
    allReady?'Comparación desactivada manualmente por el operador.':'Comparación en pausa: esperando referencias.';
  }
  const key=$('#routerKey')?.value.trim()||'';
  check('opCheckRouter',routerVerified?'✓ OpenRouter probado':key.startsWith('sk-or-')?'◌ Verifica OpenRouter':'! Introduce OpenRouter',routerVerified);
  if(!voiceWarm&&!voiceLoading)check('opCheckModel','◌ CAM++ pendiente',false);
 }catch(e){
  check('opCheckVoice','! Diagnóstico vocal: '+String(e.message||e).slice(0,85)+' · '+selected.slice(0,8),false);
 }
}
async function warmupVoice(){
 if(voiceWarm||voiceLoading||!window.debateVoice?.warmup)return;
 voiceLoading=true;check('opCheckModel','◌ Cargando CAM++ (28 MB)',false);
 try{await window.debateVoice.warmup();voiceWarm=true;check('opCheckModel','✓ CAM++ precargado',true)}
 catch(e){check('opCheckModel','! CAM++ sin precargar',false);const el=$('#opCheckModel');if(el)el.title=String(e.message||e)}
 finally{voiceLoading=false}
}
async function acquireWake(){
 if(!activeCapture||!navigator.wakeLock?.request||document.visibilityState==='hidden')return;
 try{wakeLock=await navigator.wakeLock.request('screen')}catch{}
}
window.addEventListener('debate-capture-start',()=>{activeCapture=true;acquireWake()});
window.addEventListener('debate-capture-stop',()=>{activeCapture=false;wakeLock?.release?.().catch(()=>{});wakeLock=null});
document.addEventListener('visibilitychange',()=>{if(activeCapture)acquireWake()});
window.addEventListener('beforeunload',e=>{if(activeCapture){e.preventDefault();e.returnValue=''}});

const preset=[{date:'26 NOV · 22:00',name:'Debate a cuatro',id:'f45fc70e-fcb6-4e01-b40b-81143627e030'}];
async function authStatus(){
 try{
  const r=await nativeFetch('/api/operator-auth?action=status',{cache:'no-store'}),j=await r.json();
  const el=$('#opAuth');el.textContent=j.authorized?'✓ Operador autorizado · 30 días':'○ Activación privada pendiente';
  el.style.color=j.authorized?'#8fe8ca':'#ffd29c';
  $('#opHelp').textContent=j.authorized?'La contraseña ya está protegida en Vercel. Solo necesitas OpenRouter y compartir el audio.':'Para operar, abre tu enlace privado de activación. No hay contraseña dentro del JavaScript público.';
  if($('#startCapture'))$('#startCapture').disabled=!j.authorized;
  if($('#opLaunch'))$('#opLaunch').disabled=!j.authorized;
 }catch{$('#opAuth').textContent='Sin respuesta de autenticación'}
}
function init(){
 const admin=$('#adminKey');if(admin){admin.value='operator-session-managed';admin.closest('.field').style.display='none'}
 if(!$('#opRoot'))return;
 const router=$('#routerKey');
 if(router){router.autocomplete='off';router.placeholder='sk-or-v1-…';const outer=router.closest('.field');outer.querySelector('label').textContent='Introduce únicamente OpenRouter';$('#opRouter').appendChild(outer)}
 const source=$('#liveConnectWizard');if(source){source.open=true;$('#opSource').appendChild(source)}
 const test=$('#testKey');if(test){test.textContent='⚡ Comprobar OpenRouter';test.classList.add('button');test.style.marginTop='11px';$('#opRouter').appendChild(test)}
 const start=$('#startCapture');if(start){const bar=start.closest('.toolbar');$('#opAction').appendChild(bar)}
 if($('#chunkSeconds')){$('#chunkSeconds').value='10';$('#chunkSeconds').max='10';$('#chunkSeconds').min='6';}
 if($('#sttModel'))$('#sttModel').value='scribe';
 if($('#concurrency'))$('#concurrency').value='20';
 if($('#autoVerify'))$('#autoVerify').checked=true;
 if($('#voiceAuto')){$('#voiceAuto').checked=false;$('#voiceAutoStats').textContent='Consultando referencias acústicas de los participantes…';}
 
 const id=preset[0].id;
 if(!localStorage.getItem('debate_live_id'))localStorage.setItem('debate_live_id',id);
 if($('#modeLive'))$('#modeLive').click();
 $('#opPresets').innerHTML=preset.map(x=>'<button type="button" class="opPreset '+(x.id===id?'on':'')+'" data-id="'+x.id+'"><small>'+x.date+'</small><strong>'+x.name+'</strong></button>').join('');
 $('#opPresets').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(!b)return;localStorage.setItem('debate_live_id',b.dataset.id);location.reload()});
 $('#opLaunch')?.addEventListener('click',()=>$('#startCapture')?.click());
 $('#opDetails').addEventListener('click',()=>{const enabled=document.body.classList.toggle('opAdvanced');$('#opDetails').textContent=enabled?'Ocultar herramientas avanzadas':'Mostrar herramientas avanzadas'});
 router?.addEventListener('input',()=>{routerVerified=false;const typed=router.value.trim().startsWith('sk-or-');$('#opKeyStatus').textContent=typed?'Clave introducida · pulsa Comprobar OpenRouter':'Clave OpenRouter pendiente';check('opCheckRouter',typed?'◌ Pendiente de comprobación':'! Introduce OpenRouter',false)});
 $('#opCurrent').textContent=preset.find(x=>x.id===id)?.name||'Sesión de prueba';
 const preflightRoot=$('#opCheckVoice')?.parentElement;
 if(preflightRoot&&!$('#opVoiceDiagnostics')){
  const diag=document.createElement('div');diag.id='opVoiceDiagnostics';diag.setAttribute('role','status');
  diag.style.cssText='font-size:12px;color:#a7ded1;padding:9px 0;line-height:1.55;max-width:720px';
  diag.textContent='Esperando diagnóstico de reconocimiento vocal…';
  preflightRoot.appendChild(diag);
  const local=document.createElement('div');
  local.id='opVoiceLocalDiagnostics';local.setAttribute('role','status');
  local.style.cssText='font-size:11px;color:#a7ded1;padding:5px 0;line-height:1.5;max-width:720px;overflow-wrap:anywhere';
  local.textContent='NAVEGADOR · Esperando primer bloque STT enviado a CAM++';
  preflightRoot.appendChild(local);
 }
 $('#voiceAuto')?.addEventListener('change',event=>{
  const sid=localStorage.getItem('debate_live_id')||'';
  if(!event.isTrusted)return;
  if(event.target.checked)voiceManuallyDisabled.delete(sid);
  else voiceManuallyDisabled.add(sid);
 });
 window.addEventListener('debate-voice-diagnostic',event=>updateLocalVoiceInfo(event.detail));
 window.addEventListener('debate-voice-unavailable',event=>{
  const el=$('#opVoiceLocalDiagnostics');
  if(el){el.textContent='! CAM++ no conectado: '+(event.detail?.reason||'modulo no cargado');el.style.color='#ffcc8d'}
 });
 authStatus();preflight();setInterval(preflight,20000);window.addEventListener('livefact-session-changed',()=>{voiceReconciledSignatures.clear();voiceInitialized.clear();preflight().catch(()=>{})});let preloadAttempts=0;const preload=setInterval(()=>{if(window.debateVoice?.warmup){clearInterval(preload);warmupVoice()}else if(++preloadAttempts>100)clearInterval(preload)},500);setInterval(update,2000);update();
}
function update(){
 const capture=$('#captureLabel')?.textContent||'DETENIDO',audio=$('#audioSignalStatus')?.textContent||'';
 const recording=/CAPT|GRAB|ACTIV/i.test(capture)||/AUDIO RECIBIDO/i.test(audio);
 if($('#opRuntime'))$('#opRuntime').textContent=recording?'● Capturando audio':'○ Esperando captura';
 if($('#opBacklog'))$('#opBacklog').textContent='Cola STT: '+($('#sttPending')?.textContent||'0')+' · Verificadores: '+($('#activeCount')?.textContent||'0 / 20');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();