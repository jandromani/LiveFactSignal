// DEBATE / SIGNAL · LIVE CATALOG: source-verified events and acoustic readiness.
(function(){
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selected=()=>localStorage.getItem('debate_live_id')||'';
const token=()=>$('#adminKey')?.value.trim()||sessionStorage.getItem('debate_admin')||'';
let list=[],busy=false;
const fmt=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
async function api(action,body){
 const opts={method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','x-admin-token':token()}:{},body:body?JSON.stringify(body):undefined};
 const r=await fetch('/api/catalog?action='+encodeURIComponent(action),opts);
 const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.error||'HTTP '+r.status);return x;
}
function safeUrl(v){
 try{const u=new URL(v);return u.protocol==='https:'?u.href:'#';}catch{return '#'}
}
function renderCard(e){
 const active=e.debate_id===selected(),date=fmt.format(new Date(e.scheduled_at)),candidate=e.roster.filter(p=>p.role!=='moderator');
 const activeNames=new Set((e.profiles||[]).filter(p=>Number(p.samples)>0).map(p=>p.person_name));
 const available=new Set((e.library||[]).map(p=>p.person_name));
 const count=candidate.filter(p=>activeNames.has(p.name)).length;
 const ready=candidate.map(p=>{
  const state=activeNames.has(p.name)?'<span class="ok">◉</span>':available.has(p.name)?'<span class="pending">◈</span>':'<span class="pending">○</span>';
  return '<span class="agenda-person">'+state+' '+esc(p.name)+' · '+esc(p.party)+'</span>';
 }).join('');
 const status=e.confirmation==='confirmed'?'CONFIRMADO POR RTVE':'ANUNCIADO · DETALLES PENDIENTES';
 const topics=(e.topics||[]).slice(0,5).map(esc).join(' · ');
 const data=e.confirmation!=='confirmed'?'Horario anunciado, sujeto a cambios de organización.':'Hora de emisión confirmada.';
 const links=(e.official_sources||[]).slice(0,2).map((u,i)=>'<a class="agenda-source" target="_blank" rel="noopener noreferrer" href="'+esc(safeUrl(u))+'">Fuente '+(i+1)+'</a>').join(' · ');
 const stream=e.video_youtube_id?'https://www.youtube.com/watch?v='+e.video_youtube_id:(e.watch_url||'https://www.rtve.es/play/videos/directo/la-1/');
 return '<article class="agenda-card '+(active?'selected':'')+'" data-id="'+esc(e.debate_id)+'">'+
 '<div class="agenda-date">'+esc(date.toUpperCase())+' · '+esc(e.format.toUpperCase())+'</div>'+
 '<div class="agenda-title">'+esc(e.title)+'</div>'+
 '<div class="agenda-status">'+esc(status)+'</div>'+
 '<div class="agenda-details">'+(e.moderator?'Modera: '+esc(e.moderator)+' · ':'')+esc(e.organizer)+'<div class="agenda-note">'+esc(data)+'</div></div>'+
 '<div class="agenda-people">'+ready+'</div>'+
 '<div class="agenda-details">Huellas disponibles: <strong>'+count+'/'+candidate.length+'</strong> · '+candidate.filter(p=>!activeNames.has(p.name)&&available.has(p.name)).length+' externas por importar</div>'+
 (topics?'<div class="agenda-note">'+topics+'</div>':'')+
 '<div class="agenda-actions">'+
 '<button class="button primary" data-action="select" data-id="'+esc(e.debate_id)+'">'+(active?'✓ Sesión seleccionada':'▶ Seleccionar debate')+'</button>'+
 '<a class="button ghost" target="_blank" rel="noopener noreferrer" href="'+esc(safeUrl(stream))+'">↗ Ver RTVE</a>'+
 '</div>'+
 '<details class="agenda-stream"><summary>Conectar la URL de YouTube cuando se publique</summary>'+
 '<input placeholder="https://www.youtube.com/live/..." data-stream-input="'+esc(e.debate_id)+'">'+
 '<button class="button ghost" data-action="stream" data-id="'+esc(e.debate_id)+'" style="margin-top:7px">Guardar señal YouTube</button>'+
 '</details>'+
 '<div class="agenda-note">'+links+'</div></article>';
}
function render(){
 const p=$('#agendaCards');if(!p)return;
 p.innerHTML=list.length?list.map(renderCard).join(''):'<div class="agenda-loading">No se han encontrado debates programados.</div>';
 const cur=list.find(e=>e.debate_id===selected());
 $('#agendaHint').textContent=cur?'Sesión activa: '+cur.title:'Selecciona una tarjeta y después comparte el audio de RTVE.';
}
async function refresh(){
 try{const r=await api('list');list=(r.events||[]).filter(x=>!String(x.slug||'').includes('-run-'));render();}
 catch(e){$('#agendaCards').innerHTML='<div class="agenda-loading">No se puede cargar la agenda: '+esc(e.message)+'</div>'}
}
async function choose(id){
 const d=list.find(e=>e.debate_id===id);if(!d||busy)return;
 busy=true;$('#agendaHint').textContent='Seleccionando '+d.title+'…';
 try{
  localStorage.setItem('debate_live_id',id);
  if(token()){
   try{const r=await api('prepare',{id});if(r.imported_from_open_sources||r.imported_from_previous_debates)$('#agendaHint').textContent='Referencias importadas: '+(r.imported_from_open_sources+r.imported_from_previous_debates);}catch(e){console.warn('Preparación vocal:',e.message);}
  }
  const url=new URL(location.href);url.searchParams.set('debate',d.slug);url.hash='studio';
  location.assign(url.toString());
 }catch(e){busy=false;$('#agendaHint').textContent=e.message}
}
async function connectStream(id,element){
 if(!token())return alert('Introduce la clave del operador para guardar un enlace de YouTube.');
 const val=element?.value.trim();if(!val)return alert('Pega primero una dirección YouTube válida del debate.');
 try{
  const r=await api('stream',{id,url:val});
  await refresh();
  alert('Dirección de YouTube guardada en esta sesión. Comprueba que corresponde al directo oficial antes de empezar.');
 }catch(e){alert(e.message)}
}
$('#agendaCards').addEventListener('click',e=>{
 const b=e.target.closest('button[data-action]');if(!b)return;
 if(b.dataset.action==='select')choose(b.dataset.id);
 if(b.dataset.action==='stream')connectStream(b.dataset.id,document.querySelector('[data-stream-input="'+b.dataset.id+'"]'));
});
$('#refreshAgenda').onclick=refresh;
window.addEventListener('storage',e=>{if(e.key==='debate_live_id')render()});
window.DebateAgenda={refresh,choose};
refresh();
})();
