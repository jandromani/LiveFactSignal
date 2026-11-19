(()=>{
'use strict';
const $=s=>document.querySelector(s);
const id=()=>window.LiveFactSignal?.snapshot?.().id||localStorage.getItem('debate_live_id')||'';
let busy=false,enabled=false,used=0,timer=null,lastStatus='',lastId='';
const MAX_CALLS=16,INTERVAL=17000;
const attempts=new Map();
const valid=x=>/^[a-f0-9-]{36}$/i.test(x||'');
function ui(){
 const root=$('#opRoot')||document.querySelector('main')||document.body;
 if($('#roundsLab'))return;
 const p=document.createElement('section');p.id='roundsLab';p.style.cssText='background:#102129;color:#e9f3f4;border:1px solid #4b7370;border-radius:15px;padding:16px;margin:15px 0;font:13px system-ui;line-height:1.5';
 p.innerHTML='<h3 style="margin:0 0 8px;color:#a3edd8">🔎 RONDAS DE EVIDENCIAS II–V</h3><p style="margin:0 0 12px">El análisis inicial sigue en el motor actual. Aquí se reexaminan afirmaciones difíciles: fuentes verificables, hasta 4 rondas extra y presupuesto limitado. La clasificación original nunca se sobrescribe.</p><button type="button" id="roundsToggle" style="border:1px solid #6aa396;border-radius:9px;padding:11px;color:#102129;background:#a3edd8;font-weight:800;cursor:pointer">Iniciar revisión escalonada</button> <span id="roundsState" aria-live="polite">En reposo · 0/'+MAX_CALLS+' llamadas</span><div id="roundsLog" style="font-size:11px;margin-top:9px;color:#c4d4dd"></div>';
 root.prepend(p);
 $('#roundsToggle').onclick=()=>{enabled=!enabled;$('#roundsToggle').textContent=enabled?'Detener revisión escalonada':'Iniciar revisión escalonada';$('#roundsState').textContent=enabled?'Rondas activadas, esperando afirmaciones…':'Rondas detenidas';if(enabled)tick();};
}
function log(t){lastStatus=t;const el=$('#roundsLog');if(el)el.textContent=t;}
async function tick(){
 if(!enabled||busy||used>=MAX_CALLS)return;
 const debate=id();if(!valid(debate))return log('No hay sesión válida.');
 const key=$('#routerKey')?.value?.trim()||'';
 if(!key.startsWith('sk-or-'))return log('Introduce tu clave OpenRouter en el panel de operación.');
 const cookie=await fetch('/api/operator-auth?action=status',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json()).catch(()=>({}));
 if(!cookie.authorized)return log('Activa el acceso privado de operador.');
 busy=true;
 try{
  if(lastId!==debate){lastId=debate;attempts.clear();used=0;}
  const [live,history]=await Promise.all([
   fetch('/api/public?debate='+encodeURIComponent(debate)+'&roundsTick='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null),
   fetch('/api/rounds?debate='+encodeURIComponent(debate),{cache:'no-store'}).then(r=>r.ok?r.json():{rounds:[]})
  ]);
  const entries=live?.claims||[];
  const saved=new Map();
  for(const r of history.rounds||[]){const list=saved.get(r.claim_id)||[];list.push(r);saved.set(r.claim_id,list)}
  const queue=entries.filter(c=>{
   if(!valid(c.id)||c.state==='excluded'||c.state==='queued'||c.state==='verifying')return false;
   const quote=String(c.quote||'');
   if(quote.length<45||quote.length>850)return false;
   const runs=saved.get(c.id)||[];
   if(runs.some(r=>['supported','contradicted','mixed'].includes(r.verdict)&&Number(r.confidence)>=.85))return false;
   if(runs.length>=4||attempts.get(c.id)==='no-evidence')return false;
   return c.state==='needs_review'||c.state==='provisional'&&c.verdict==='falsa';
  });
  queue.sort((a,b)=>(a.state==='provisional'?-1:0)-(b.state==='provisional'?-1:0)||(b.start_ms||0)-(a.start_ms||0));
  const c=queue[0];
  if(!c){log('No hay afirmaciones completas elegibles. '+used+'/'+MAX_CALLS+' llamadas realizadas.');return}
  const resp=await fetch('/api/rounds',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-openrouter-key':key},body:JSON.stringify({debate,claim:c.id})});
  const d=await resp.json().catch(()=>({}));
  if(!resp.ok){log('Error en ronda: '+(d.error||resp.status));attempts.set(c.id,'error');return}
  if(d.status==='evidence_missing'){attempts.set(c.id,'no-evidence');log('Sin texto de fuentes oficiales para «'+c.quote.slice(0,55)+'…». Queda sin resolver y sin gasto de IA.');return}
  used++;$('#roundsState').textContent='Revisión '+used+'/'+MAX_CALLS+' · ronda '+d.round;
  log('Ronda '+d.round+' · '+d.verdict+' · '+Math.round(d.confidence*100)+'% · '+c.quote.slice(0,85));
 }catch(e){log('Revisión: '+String(e.message||e).slice(0,130))}
 finally{busy=false}
}
function start(){ui();if(!timer)timer=setInterval(tick,INTERVAL)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();