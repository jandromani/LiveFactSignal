/* Keep the live capture console mounted while viewing public graphics.
 * No navigations, no secrets, no interference with STT/capture streams. */
(()=>{
'use strict';
const $=s=>document.querySelector(s);
const ids={demo:'8ee348bb-acac-4934-8358-e183d0a57712',today:'f45fc70e-fcb6-4e01-b40b-81143627e030'};
let currentView=null;
function selectedDebate(){return ids.today;}
function pageUrl(view){
 const id=encodeURIComponent(selectedDebate());
 return view==='overlay'?'/overlay.html?debate='+id:'/observatorio.html?debate='+id;
}
function updateExternal(){
 const publicUrl=pageUrl('observatorio'),overlayUrl=pageUrl('overlay');
 const obs=$('#lfOpenObserver'),obsView=$('#lfViewerExternal'),obsButtons=document.querySelectorAll('a[href^="/observatorio.html"]');
 if(obs)obs.href=publicUrl;
 const ov=$('#lfOpenOverlay');if(ov)ov.href=overlayUrl;
 // Keep the public spectator data on the official debate when the private demo is selected.
 for(const link of obsButtons)if(!link.closest('#lfMonitorViewer')&&link.id!=='lfStreamVisual'&&!new URL(link.href,location.href).searchParams.has('emit'))link.href=publicUrl;
 const other=document.querySelectorAll('a[href^="/overlay.html"]');
 for(const link of other)if(!link.closest('#lfMonitorViewer'))link.href=overlayUrl;
 if(obsView&&currentView)obsView.href=pageUrl(currentView);
}
function liveStatus(){
 const snap=window.LiveFactSignal?.snapshot?.();
 const capturing=!!snap?.capturing;
 const led=$('#lfDockLed'),label=$('#lfDockText');
 if(led)led.classList.toggle('on',capturing);
 if(label)label.textContent=capturing?'● AUDIO EN DIRECTO · el motor sigue capturando':'○ Consola preparada · captura detenida';
 return capturing;
}
function openViewer(view){
 if(view!=='observatorio'&&view!=='overlay')return;
 currentView=view;
 updateExternal();
 const panel=$('#lfMonitorViewer'),frame=$('#lfMonitorFrame');
 if(!panel||!frame)return;
 $('#lfViewerTitle').textContent=view==='observatorio'?'Observatorio · candidatos, afirmaciones y fuentes':'Modo realización · gráficos OBS';
 const id=window.LiveFactSignal?.snapshot?.().id||localStorage.getItem('debate_live_id');
 $('#lfViewerExternal').href=pageUrl(view);
 panel.hidden=false;
 frame.src=pageUrl(view);
 const note=$('#lfViewerFootNote');
 if(note)note.textContent=id===ids.demo?'Estás en una DEMO privada: el visor público presenta la sesión oficial, no los datos de ensayo.':'Motor y verificadores activos: puedes navegar aquí sin cerrar la pestaña que está capturando.';
 panel.scrollIntoView?.({behavior:'smooth',block:'start'});
 liveStatus();
}
function closeViewer(){
 const panel=$('#lfMonitorViewer'),frame=$('#lfMonitorFrame');
 if(panel)panel.hidden=true;
 if(frame)frame.src='about:blank';
 currentView=null;
 liveStatus();
}
function handleClick(event){
 const a=event.target.closest?.('a[href]');if(!a)return;
 const destination=new URL(a.href,location.href);
 // Opening a linked public screen in the same tab would destroy the MediaStream.
 if(destination.origin===location.origin&&/^\/(observatorio|overlay|prueba|replay)\.html$/.test(destination.pathname)){
  a.target='_blank';a.rel='noopener noreferrer';
 }
}
function init(){
 const observer=$('#lfPeekObserver'),overlay=$('#lfPeekOverlay'),close=$('#lfCloseViewer');
 if(!observer||!overlay||!close)return;
 observer.addEventListener('click',()=>openViewer('observatorio'));
 overlay.addEventListener('click',()=>openViewer('overlay'));
 close.addEventListener('click',closeViewer);
 document.addEventListener('click',handleClick,true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&currentView)closeViewer()});
 window.addEventListener('livefact-session-changed',()=>{
  updateExternal();
  if(currentView){$('#lfMonitorFrame').src=pageUrl(currentView)}
  liveStatus();
 });
 window.addEventListener('debate-capture-start',liveStatus);
 window.addEventListener('debate-capture-stop',liveStatus);
 updateExternal();liveStatus();
 setInterval(liveStatus,1800);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();