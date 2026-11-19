(()=>{
'use strict';
const ROOT='f3c2fd9b-5fa1-4818-a407-453f5cac4a34';
const $=s=>document.querySelector(s);
let busy=false,lastMode='download-reset';
function note(msg,bad=false){const el=$('#resetMessage');if(el){el.textContent=msg;el.style.color=bad?'#ffb6ae':'#c3e8d8'}}
function current(){return window.LiveFactSignal?.snapshot?.().id||localStorage.getItem('debate_live_id')||ROOT}
function download(blob,filename){
 const link=document.createElement('a'),url=URL.createObjectURL(blob);
 link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function archive(){
 const response=await fetch('/api/export?debate='+encodeURIComponent(current())+'&format=json',{credentials:'same-origin',cache:'no-store'});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'No se pudo generar el archivo (HTTP '+response.status+')')}
 const blob=await response.blob();
 if(blob.size<100||!String(blob.type).includes('json'))throw Error('La exportación no parece un JSON válido.');
 const data=JSON.parse(await blob.text());
 if(!data?.debate?.id||data.debate.id!==current()||!Array.isArray(data.claims)||!Array.isArray(data.audio_segments))throw Error('Respaldo incompleto o de otro debate.');
 const name='LiveFactSignal-ARCHIVO-'+data.debate.id.slice(0,8)+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 download(blob,name);
 note('✓ Descarga solicitada: '+name+' · '+data.claims.length+' afirmaciones. Los datos originales permanecen en Neon.');
 return {name,claims:data.claims.length};
}
async function stopAndDrain(){
 const api=window.LiveFactSignal;
 if(api?.snapshot?.().capturing){api.stopCapture?.();note('Captura detenida. Finalizando fragmentos pendientes…');}
 await new Promise(r=>setTimeout(r,800));
 const deadline=Date.now()+65000;
 while(api?.snapshot?.().pending||api?.snapshot?.().verifying){
  if(Date.now()>deadline)throw Error('Todavía se procesan fragmentos. Inténtalo de nuevo cuando terminen: no he reiniciado nada.');
  await new Promise(r=>setTimeout(r,900));
 }
}
async function reset(){
 if(busy)return;busy=true;updateButtons(true);
 try{
  if(!confirm('¿CREAR UNA SESIÓN LIMPIA? La captura anterior seguirá archivada en Neon. No se borrará ningún dato.'))return;
  await stopAndDrain();
  if(lastMode==='download-reset'){
   const f=await archive();
   if(!confirm('Se ha iniciado la descarga de '+f.name+'. ¿Has comprobado que tu navegador ha guardado el archivo? Pulsa Cancelar si quieres verificarlo antes de reiniciar.'))return;
  }
  note('Creando nueva sesión de captura independiente…');
  const r=await fetch('/api/reset',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'new-run',root_id:ROOT,confirm:'CREAR_SESION_NUEVA'})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok||!j.current_id)throw Error(j.error||'No se pudo crear la nueva sesión');
  const oldSession=current();
  localStorage.setItem('lfs_current_live',j.current_id);
  localStorage.setItem('debate_live_id',j.current_id);
  localStorage.setItem('lfs_previous_live',oldSession);
  note('✓ Nueva captura '+j.current_id.slice(0,8)+' creada. Recargando consola.');
  location.reload();
 }catch(e){note(String(e.message||e),true)}
 finally{busy=false;updateButtons(false)}
}
function updateButtons(disabled){for(const b of document.querySelectorAll('[data-reset-action]'))b.disabled=disabled}
function modal(show){const m=$('#resetModal');m.hidden=!show; if(show){note('La sesión anterior permanecerá en Neon. Una sesión nueva no reutilizará los resultados ni las huellas de voz.');m.scrollIntoView({behavior:'smooth',block:'center'});}}
function init(){
 const root=$('#opRoot')||document.querySelector('main')||document.body;
 if(!root||$('#resetPanel'))return;
 const style=document.createElement('style');style.textContent=`
 #resetPanel{background:linear-gradient(130deg,#172a34,#233c40);color:#effcfa;border:1px solid #5a8884;border-radius:16px;padding:18px;margin:16px 0;box-shadow:0 12px 30px #0002;font:13px system-ui}
 #resetPanel h3{font-size:18px;margin:0 0 7px}#resetPanel p{line-height:1.5;margin:0 0 13px;color:#b7d8d5}
 #resetPanel button{padding:11px 13px;background:#f0fdf8;border:1px solid #73baa4;color:#112a29;border-radius:9px;font-weight:750;cursor:pointer;margin:3px}#resetPanel button:hover{background:#b7f3e0}
 #resetPanel button.reset-danger{background:#fae0d3;border-color:#ef9b85;color:#50261e}#resetPanel button:disabled{opacity:.45;cursor:progress}
 #resetModal{border-top:1px solid #496e71;margin-top:13px;padding-top:14px}#resetModal[hidden]{display:none}
 #resetModal small{display:block;line-height:1.6;color:#a9d1cb;margin-top:8px}#resetMessage{padding:9px 0;font-weight:600;min-height:24px}`;
 document.head.appendChild(style);
 const card=document.createElement('section');card.id='resetPanel';
 card.innerHTML=`<h3>↻ CAPTURA LIMPIA / ARCHIVAR SESIÓN</h3>
 <p>¿Se han mezclado voces o dos vídeos? Crea otra sesión sin perder los datos anteriores. La exportación incluye transcripciones, afirmaciones y enlaces, <b>no grabaciones originales</b>.</p>
 <button type="button" id="resetOpen" class="reset-danger">↻ Archivar y empezar de cero</button>
 <button type="button" data-reset-action="download">↓ Descargar sesión JSON</button>
 <div id="resetModal" hidden><p><b>Elige cómo continuar:</b></p>
 <label style="display:block;margin:7px 0"><input type="radio" name="resetChoice" value="download-reset" checked> <b>Descargar JSON y crear nueva sesión</b> (recomendado)</label>
 <label style="display:block;margin:7px 0"><input type="radio" name="resetChoice" value="reset-only"> Crear nueva sesión sin descargar (la antigua queda en Neon)</label>
 <small>Se detendrá la captura actual, se esperará a vaciar su cola y se guardará la nueva sesión con identificador distinto. No se eliminará ninguna fila antigua.</small>
 <div id="resetMessage" role="status"></div>
 <button type="button" data-reset-action="confirm" class="reset-danger">✓ Confirmar nueva captura</button>
 <button type="button" data-reset-action="cancel">Cancelar</button>
 </div>`;
 root.prepend(card);
 $('#resetOpen').onclick=()=>modal(!$('#resetModal').hidden);
 for(const el of document.querySelectorAll('input[name="resetChoice"]'))el.addEventListener('change',e=>{lastMode=e.target.value});
 $('[data-reset-action="download"]').onclick=async()=>{if(busy)return;busy=true;updateButtons(true);try{await archive()}catch(e){modal(true);note(String(e.message||e),true)}finally{busy=false;updateButtons(false)}};
 $('[data-reset-action="confirm"]').onclick=reset;
 $('[data-reset-action="cancel"]').onclick=()=>modal(false);
 fetch('/api/reset',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(s=>{if(!s?.current_id)return;const now=current();if(now===ROOT&&s.current_id!==ROOT&&!window.LiveFactSignal?.snapshot?.().capturing){localStorage.setItem('lfs_current_live',s.current_id);localStorage.setItem('debate_live_id',s.current_id);location.reload()}}).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();