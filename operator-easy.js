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
async function preflight(){
 try{
  const selected=localStorage.getItem('debate_live_id')||'f3c2fd9b-5fa1-4818-a407-453f5cac4a34';
  const [auth,health,profiles]=await Promise.all([
   nativeFetch('/api/operator-auth?action=status',{cache:'no-store'}).then(r=>r.json()),
   nativeFetch('/api/live?action=health',{cache:'no-store'}).then(r=>r.json()),
   nativeFetch('/api/voice?action=list&id='+encodeURIComponent(selected),{cache:'no-store'}).then(r=>r.json())
  ]);
  authReady=auth.authorized===true;
  check('opCheckAuth',authReady?'✓ Operador autorizado':'! Falta activar operador',authReady);
  check('opCheckDb',health.database?'✓ Neon conectado':'! Neon no disponible',Boolean(health.database));
  const n=Array.isArray(profiles.profiles)?profiles.profiles.length:0;
  check('opCheckVoice',n?'✓ '+n+' muestras vocales':'! Voces no disponibles',n>0);
  const key=$('#routerKey')?.value.trim()||'';
  check('opCheckRouter',routerVerified?'✓ OpenRouter probado':key.startsWith('sk-or-')?'◌ Verifica OpenRouter':'! Introduce OpenRouter',routerVerified);
  if(!voiceWarm&&!voiceLoading)check('opCheckModel','◌ CAM++ pendiente',false);
 }catch(e){check('opCheckDb','! Estado no disponible',false)}
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

const preset=[
 {date:'19 NOV · 22:00',name:'Sánchez vs. Feijóo',id:'f3c2fd9b-5fa1-4818-a407-453f5cac4a34'},
 {date:'23 NOV · 22:00',name:'Ocho portavoces',id:'21e5098f-0f04-4571-92a4-9b1d52f4d48c'},
 {date:'26 NOV',name:'Debate a cuatro',id:'f45fc70e-fcb6-4e01-b40b-81143627e030'},
 {date:'LABORATORIO',name:'Prueba sin contaminar datos',id:'8ee348bb-acac-4934-8358-e183d0a57712'}
];
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
 if($('#voiceAuto')){$('#voiceAuto').checked=false;$('#voiceAutoStats').textContent='⚠ Identificación automática en pausa: vuelve a calibrar antes de activarla.';}
 preset[0].id=localStorage.getItem('lfs_current_live')||preset[0].id;
 const id=localStorage.getItem('debate_live_id')||preset[0].id;
 if(!localStorage.getItem('debate_live_id'))localStorage.setItem('debate_live_id',id);
 if($('#modeLive'))$('#modeLive').click();
 $('#opPresets').innerHTML=preset.map(x=>'<button type="button" class="opPreset '+(x.id===id?'on':'')+'" data-id="'+x.id+'"><small>'+x.date+'</small><strong>'+x.name+'</strong></button>').join('');
 $('#opPresets').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(!b)return;localStorage.setItem('debate_live_id',b.dataset.id);location.reload()});
 $('#opLaunch')?.addEventListener('click',()=>$('#startCapture')?.click());
 $('#opDetails').addEventListener('click',()=>{const enabled=document.body.classList.toggle('opAdvanced');$('#opDetails').textContent=enabled?'Ocultar herramientas avanzadas':'Mostrar herramientas avanzadas'});
 router?.addEventListener('input',()=>{routerVerified=false;const typed=router.value.trim().startsWith('sk-or-');$('#opKeyStatus').textContent=typed?'Clave introducida · pulsa Comprobar OpenRouter':'Clave OpenRouter pendiente';check('opCheckRouter',typed?'◌ Pendiente de comprobación':'! Introduce OpenRouter',false)});
 $('#opCurrent').textContent=preset.find(x=>x.id===id)?.name||'Sesión de prueba';
 authStatus();preflight();setInterval(preflight,60000);let preloadAttempts=0;const preload=setInterval(()=>{if(window.debateVoice?.warmup){clearInterval(preload);warmupVoice()}else if(++preloadAttempts>100)clearInterval(preload)},500);setInterval(update,2000);update();
}
function update(){
 const capture=$('#captureLabel')?.textContent||'DETENIDO',audio=$('#audioSignalStatus')?.textContent||'';
 const recording=/CAPT|GRAB|ACTIV/i.test(capture)||/AUDIO RECIBIDO/i.test(audio);
 if($('#opRuntime'))$('#opRuntime').textContent=recording?'● Capturando audio':'○ Esperando captura';
 if($('#opBacklog'))$('#opBacklog').textContent='Cola STT: '+($('#sttPending')?.textContent||'0')+' · Verificadores: '+($('#activeCount')?.textContent||'0 / 20');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();