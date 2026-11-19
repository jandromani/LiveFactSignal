// DEBATE/SIGNAL · Automatic speaker enrollment from moderator handoffs
(()=>{
 const $=s=>document.querySelector(s),pending=[];
 let busy=false,profiles=0,lastCheck=0,attached=false;
 const session=()=>localStorage.getItem('debate_live_id')||'';
 const admin=()=>$('#adminKey')?.value.trim()||sessionStorage.getItem('debate_admin')||'';
 function note(s,error=false){
  const v=$('#voiceAutoStats');if(v){v.textContent=s;v.style.color=error?'#eaa0a0':'#a4e9dd'}
  const log=$('#log');if(log){const e=document.createElement('div');e.textContent='◉ AUTO-VOICE  '+s;log.prepend(e);while(log.children.length>32)log.lastElementChild.remove();}
 }
 async function post(action,payload){
  const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json','x-admin-token':admin()},body:JSON.stringify({id:session(),...payload})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j;
 }
 async function update(){
  if(!session())return;
  const r=await fetch('/api/voice-auto?action=status&id='+encodeURIComponent(session()));if(!r.ok)return;
  const d=await r.json();profiles=(d.ready||[]).reduce((n,x)=>n+Number(x.profiles||0),0);lastCheck=Date.now();
  if(!busy){const v=$('#voiceAutoStats');if(v)v.textContent='Autocalibración: '+(d.ready?.length||0)+' candidatos reconocibles · '+(d.learning?.filter(x=>!Number(x.promoted)).length||0)+' aprendiendo · '+profiles+' huellas.';}
 }
 function mergedSpans(spans){
  const result=[];for(const s of (Array.isArray(spans)?spans:[]).filter(x=>x.speaker_key&&x.speaker_key!=='desconocido').sort((a,b)=>Number(a.start_rel_ms)-Number(b.start_rel_ms))){
   const a=Number(s.start_rel_ms),b=Number(s.end_rel_ms);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)continue;
   const prev=result.at(-1);
   if(prev&&prev.speaker_key===s.speaker_key&&a-prev.end_rel_ms<=900){prev.end_rel_ms=Math.max(prev.end_rel_ms,b);prev.end_ms=Math.max(prev.end_ms,Number(s.end_ms))}
   else result.push({speaker_key:s.speaker_key,start_rel_ms:a,end_rel_ms:b,start_ms:Number(s.start_ms),end_ms:Number(s.end_ms)});
  }
  return result.map(x=>({...x,duration_ms:x.end_rel_ms-x.start_rel_ms})).filter(x=>x.duration_ms>=3000);
 }
 async function consume(){
  if(busy)return;busy=true;
  try{
   while(pending.length){
    const item=pending.shift();
    if(item.id!==session()||!admin()||!$('#voiceAuto')?.checked)continue;
    try{
     const sdk=window.debateVoice;if(!sdk?.embed)throw Error('Modelo CAM++ no preparado');
     const emb=await sdk.embed(item.blob,item.span);
     let seed={status:'not_applicable'};
     if(item.speaker_count===1&&emb.duration_ms>=6500){
      seed=await post('voice-auto?action=seed',{embedding:emb.embedding,start_ms:item.span.start_ms,end_ms:item.span.end_ms,seq:item.seq,duration_ms:emb.duration_ms,speaker_count:item.speaker_count});
     }
     if(seed.status==='learning'){note('Aprendiendo '+seed.person+' ('+seed.samples+'/2 ejemplos acústicos).');continue;}
     if(seed.status==='activated'){
      note('Perfil autónomo activado: '+seed.person+' ('+seed.consistent+' muestras compatibles).');
      await sdk.refresh?.();await update();continue;
     }
     if(seed.status==='voice_conflict'){note('Voz incompatible tras el anuncio; descartada por seguridad.',true);continue;}
     if(Date.now()-lastCheck>12000)await update();
     if(profiles){
      const m=await post('voice?action=match',{embedding:emb.embedding,start_ms:item.span.start_ms,end_ms:item.span.end_ms,seq:item.seq});
      if(m.matched){
       note('Identificación acústica: '+m.name+' · similitud '+m.score.toFixed(3)+' · '+m.changed+' afirmaciones.');
       await sdk.refresh?.();window.dispatchEvent(new CustomEvent('debate-voice-result',{detail:m}));
      }
     }
    }catch(e){note('Error de huellas: '+e.message,true)}
   }
  }finally{busy=false;update().catch(()=>{})}
 }
 function hook(blob,result,start_ms,end_ms,seq,id){
  if(!$('#voiceAuto')?.checked||id!==session()||!admin())return;
  let spans=mergedSpans(result.voice_spans);
  if(!spans.length&&Number(result.speaker_count)===1)spans=[{speaker_key:'única',start_rel_ms:0,end_rel_ms:end_ms-start_ms,start_ms,end_ms,duration_ms:end_ms-start_ms}];
  for(const span of spans){if(pending.length>=16){note('Demasiados fragmentos pendientes: se omite una huella.',true);break;}pending.push({blob,span,seq,id,speaker_count:Number(result.speaker_count)||0})}
  consume().catch(e=>note(e.message,true));
 }
 function attach(){
  if(attached||!window.debateVoice?.embed)return false;
  window.debateVoice.processChunk=hook;window.debateVoice.autoRefresh=update;attached=true;
  note('Modo automático listo. Inicia la captura: el sistema aprende las voces sin preparación manual.');
  update().catch(()=>{});return true;
 }
 if(!attach()){const timer=setInterval(()=>{if(attach())clearInterval(timer)},250);setTimeout(()=>clearInterval(timer),16000)}
 setInterval(()=>{if(!busy)update().catch(()=>{})},17000);
})();