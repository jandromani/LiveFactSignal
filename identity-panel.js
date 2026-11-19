(function(){
'use strict';
const $=s=>document.querySelector(s),safe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let lastSession='',bootstrapped='',polling=false,roster=[];
const token=()=>$('#adminKey')?.value?.trim()||sessionStorage.getItem('debate_admin')||'';
const session=()=>localStorage.getItem('debate_live_id')||'';
async function endpoint(action,data){
 const id=session();if(!id)return null;
 const method=data?'POST':'GET',url='/api/supervisor?action='+encodeURIComponent(action)+(data?'':'&id='+encodeURIComponent(id));
 const r=await fetch(url,{method,headers:data?{'Content-Type':'application/json','x-admin-token':token()}:{},body:data?JSON.stringify({id,...data}):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j;
}
function time(t){const s=Math.floor(Number(t||0)/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(x=>String(x).padStart(2,'0')).join(':');}
function render(x){
 roster=x.roster||[];const stats=x.stats||{},handoffs=(x.events||[]).filter(e=>e.event_type==='handoff'||e.event_type==='manual');
 $('#candidateCount').textContent=roster.length+' personas';
 $('#speakerRoster').innerHTML=roster.length?roster.map(p=>'<span class="pill" style="display:inline-block;margin:4px 4px 4px 0">'+safe(p.name)+' · '+safe(p.role==='moderator'?'Moderador/a':p.party)+'</span>').join(''):'Registro vacío. Añade nombres manualmente o utiliza el debate de RTVE 2019 para precargar sus participantes.';
 const ev=handoffs[0];$('#lastSpeaker').textContent=ev?time(ev.end_ms)+' · Turno anunciado para '+ev.person_name+' ('+ev.party+'). Atribución posterior provisional.':'Esperando a que un presentador anuncie el turno de un candidato.';
 $('#identityMetrics').textContent=(stats.inferred||0)+' atribuciones provisionales · '+(stats.excluded||0)+' intervenciones descartadas (conservadas en auditoría) · '+(stats.queued||0)+' pendientes.';
 const select=$('#speaker'),old=select.value;
 if(roster.length){const candidates=roster.filter(p=>p.role!=='moderator');select.innerHTML='<option value="">Sin identificar</option>'+candidates.map(p=>'<option value="'+safe(p.name+'|'+p.party)+'">'+safe(p.name+' · '+p.party)+'</option>').join('');select.value=candidates.some(p=>p.name+'|'+p.party===old)?old:'';}
}
async function poll(){
 if(polling)return;const id=session();if(!id)return;
 polling=true;
 try{
 if(id!==lastSession){lastSession=id;bootstrapped='';}
 if(id!==bootstrapped&&token()){
  await endpoint('bootstrap',{});bootstrapped=id;
 }
 const result=await endpoint('identity');if(result)render(result);
 }catch(e){$('#identityMetrics').textContent='Supervisor: '+e.message;}
 finally{polling=false;}
}
async function add(){
 const name=$('#identityName').value.trim(),party=$('#identityParty').value.trim(),aliases=$('#identityAliases').value.split(',').map(x=>x.trim()).filter(Boolean);
 if(!session())return alert('Crea una sesión primero.');
 if(!name)return alert('Escribe el nombre del participante.');
 try{await endpoint('add',{name,party:party||'—',aliases,role:party?'candidate':'moderator'});$('#identityName').value='';$('#identityAliases').value='';await poll()}catch(e){alert(e.message)}
}
async function assign(){
 if(!session())return alert('Crea una sesión primero.');
 const value=$('#speaker').value;if(!value)return alert('Selecciona primero un participante en «Hablante actual».');
 const [name,party]=value.split('|');
 const n=Number($('#captureStart').value)||0,clock=$('#clockLabel')?.textContent||'';
 const p=clock.split(':').map(Number);
 const sec=p.length===3&&p.every(Number.isFinite)?p[0]*3600+p[1]*60+p[2]:n;
 try{await endpoint('handoff',{name,party,at_ms:sec*1000});await poll()}catch(e){alert(e.message)}
}
async function reconcile(){
 if(!session())return alert('Crea una sesión primero.');
 try{const r=await endpoint('reconcile',{});$('#identityMetrics').textContent='Reanálisis: '+r.processed_segments+' segmentos, '+r.turn_cues+' turnos, '+r.excluded+' descartadas, '+r.assigned+' atribuidas';await poll()}catch(e){alert(e.message)}
}
$('#identityAdd').onclick=add;$('#identityAssign').onclick=assign;$('#identityRescan').onclick=reconcile;
setInterval(poll,5500);poll();
})();