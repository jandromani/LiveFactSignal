/* Export persisted debate transcripts and analyses; open official YouTube Live tools without navigating away. */
(()=>{
'use strict';
const $=s=>document.querySelector(s);
const LIVE='f45fc70e-fcb6-4e01-b40b-81143627e030',QA='8ee348bb-acac-4934-8358-e183d0a57712';
let working=false;
function current(){
 const id=window.LiveFactSignal?.snapshot?.().id||localStorage.getItem('debate_live_id')||LIVE;
 return /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)?id:LIVE;
}
function show(message,ok){
 const e=$('#lfExportState');if(!e)return;
 e.textContent=message;
 e.style.color=ok===true?'#a7f1d0':ok===false?'#ffd6ab':'#bfd4d1';
}
async function exportData(format){
 if(working)return;
 working=true;
 const id=current(),fileType=format==='csv'?'csv':'json';
 show('Preparando respaldo de la sesión · '+fileType.toUpperCase()+'…');
 try{
  const auth=await fetch('/api/operator-auth?action=status',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json());
  if(!auth.authorized)throw Error('Necesitas activar tu acceso privado de operador antes de descargar.');
  const response=await fetch('/api/export?debate='+encodeURIComponent(id)+'&format='+encodeURIComponent(fileType),{credentials:'same-origin',cache:'no-store'});
  if(!response.ok){let error={};try{error=await response.json()}catch{}throw Error(error.error||('Descarga no disponible, HTTP '+response.status))}
  const blob=await response.blob();
  const header=response.headers.get('Content-Disposition')||'';
  const match=/filename="([^"]+)"/.exec(header);
  const name=match?match[1]:'LiveFactSignal-'+(id===QA?'demo':'debate')+'-'+new Date().toISOString().slice(0,10)+'.'+fileType;
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  show('✓ Respaldo descargado: '+name+' · '+Math.round(blob.size/1024)+' KB. Los datos también permanecen en Neon.',true);
 }catch(e){show('No se pudo descargar: '+String(e.message||e),false)}
 finally{working=false}
}
function sync(){
 const id=current(),publicId=id===QA?LIVE:id;
 const screen=$('#lfStreamVisual');if(screen)screen.href='/observatorio.html?debate='+encodeURIComponent(publicId)+'&emit=1';
}
function init(){
 $('#lfYouTubeStudio')?.addEventListener('click',()=>{const screen=$('#lfStreamVisual');if(screen)window.open(screen.href,'lfs26_public_broadcast','noopener,noreferrer');show('Sala de directos de YouTube abierta por el enlace. Si la segunda pestaña fue bloqueada, pulsa «Abrir pantalla pública de emisión». Comparte únicamente esa pestaña, sin audio de RTVE.');});
 $('#lfExportJson')?.addEventListener('click',()=>exportData('json'));
 $('#lfExportCsv')?.addEventListener('click',()=>exportData('csv'));
 window.addEventListener('livefact-session-changed',sync);
 sync();setInterval(sync,5000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();