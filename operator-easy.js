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
  return nativeFetch(to.pathname+to.search,{...opts,method:'POST',headers,credentials:'same-origin'});
 }catch{return nativeFetch(input,opts)}
};
// The value is deliberately NOT the admin secret; the server-side proxy injects that
// secret only after validating a signed HttpOnly session cookie.
sessionStorage.setItem('debate_admin','operator-session-managed');
const $=s=>document.querySelector(s);
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
 if($('#chunkSeconds'))$('#chunkSeconds').value='12';
 if($('#sttModel'))$('#sttModel').value='scribe';
 if($('#concurrency'))$('#concurrency').value='20';
 if($('#autoVerify'))$('#autoVerify').checked=true;
 const id=localStorage.getItem('debate_live_id')||preset[0].id;
 if(!localStorage.getItem('debate_live_id'))localStorage.setItem('debate_live_id',id);
 if($('#modeLive'))$('#modeLive').click();
 $('#opPresets').innerHTML=preset.map(x=>'<button type="button" class="opPreset '+(x.id===id?'on':'')+'" data-id="'+x.id+'"><small>'+x.date+'</small><strong>'+x.name+'</strong></button>').join('');
 $('#opPresets').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(!b)return;localStorage.setItem('debate_live_id',b.dataset.id);location.reload()});
 $('#opLaunch')?.addEventListener('click',()=>$('#startCapture')?.click());
 $('#opDetails').addEventListener('click',()=>{const enabled=document.body.classList.toggle('opAdvanced');$('#opDetails').textContent=enabled?'Ocultar herramientas avanzadas':'Mostrar herramientas avanzadas'});
 router?.addEventListener('input',()=>{$('#opKeyStatus').textContent=router.value.trim().startsWith('sk-or-')?'✓ OpenRouter introducida · lista para procesar':'Clave OpenRouter pendiente'});
 $('#opCurrent').textContent=preset.find(x=>x.id===id)?.name||'Sesión de prueba';
 authStatus();setInterval(update,2000);update();
}
function update(){
 const capture=$('#captureLabel')?.textContent||'DETENIDO',audio=$('#audioSignalStatus')?.textContent||'';
 const recording=/CAPT|GRAB|ACTIV/i.test(capture)||/AUDIO RECIBIDO/i.test(audio);
 if($('#opRuntime'))$('#opRuntime').textContent=recording?'● Capturando audio':'○ Esperando captura';
 if($('#opBacklog'))$('#opBacklog').textContent='Cola STT: '+($('#sttPending')?.textContent||'0')+' · Verificadores: '+($('#activeCount')?.textContent||'0 / 20');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();