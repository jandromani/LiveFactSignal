// Debate Signal V0.8: source-agnostic browser tab audio capture assistant
(()=>{'use strict';
const $=s=>document.querySelector(s);
const defaultRtve='https://www.rtve.es/play/videos/directo/la-1/';
let selected='rtve',context=null,analyser=null,silencer=null,ticker=null,everHeard=false,samples=null;
function feedback(msg,ok){const el=$('#audioSignalStatus');if(el){el.textContent=msg;el.style.color=ok?'#75ead0':'#f1c987';}}
function choose(mode){
 selected=mode;$('#signalRTVE').className='button '+(mode==='rtve'?'primary':'ghost');
 $('#signalYouTube').className='button '+(mode==='youtube'?'primary':'ghost');
 const url=$('#signalUrl');
 if(mode==='rtve'){url.value=defaultRtve;feedback('RTVE PLAY SELECCIONADO',false);}
 else{const current=$('#youtubeUrl')?.value||'';url.value=/^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)/.test(current)?current:'';url.placeholder='Pega el enlace directo de YouTube';feedback('YOUTUBE SELECCIONADO',false);}
}
function link(){
 const url=$('#signalUrl').value.trim();
 try{
  const u=new URL(url),ok=u.protocol==='https:'&&(selected==='rtve'?u.hostname.endsWith('rtve.es'):(u.hostname==='www.youtube.com'||u.hostname==='youtube.com'||u.hostname==='youtu.be'||u.hostname==='m.youtube.com'));
  if(!ok)throw Error('Dominio no reconocido para '+selected);
  return u.href;
 }catch(e){throw Error('Introduce una dirección https:// válida de '+(selected==='rtve'?'RTVE Play':'YouTube'))}
}
function openSignal(){
 try{
  const url=link();
  const source=$('#youtubeUrl');if(source)source.value=url;
  window.open(url,'_blank','noopener,noreferrer');
  feedback('SEÑAL ABIERTA · PENDIENTE DE CAPTURA',false);
  $('#audioSignalHelp').textContent='Vuelve a esta pestaña, pulsa Capturar y selecciona la pestaña donde está la señal.';
  if(selected==='youtube'){
   const debate=localStorage.getItem('debate_live_id')||'',admin=$('#adminKey')?.value.trim()||sessionStorage.getItem('debate_admin')||'';
   if(debate&&admin)fetch('/api/catalog?action=stream',{method:'POST',headers:{'x-admin-token':admin,'Content-Type':'application/json'},body:JSON.stringify({id:debate,url})}).catch(()=>{});
  }
 }catch(e){feedback(e.message,false)}
}
function clearMeter(){
 if(ticker)clearInterval(ticker);ticker=null;
 try{context?.close?.()}catch{}
 context=null;analyser=null;silencer=null;samples=null;
 const bar=$('#audioSignalLevel');if(bar)bar.style.width='0%';
}
async function onStart(e){
 clearMeter();everHeard=false;
 const stream=e.detail?.stream;
 if(!stream?.getAudioTracks?.().length){feedback('NO SE HA COMPARTIDO AUDIO',false);return;}
 try{
  context=new (window.AudioContext||window.webkitAudioContext)();
  const source=context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  analyser=context.createAnalyser();analyser.fftSize=1024;
  silencer=context.createGain();silencer.gain.value=0;
  source.connect(analyser);analyser.connect(silencer);silencer.connect(context.destination);
  await context.resume();
  samples=new Uint8Array(analyser.fftSize);
  feedback('CAPTURA CONECTADA · ESCUCHANDO',true);
  const started=Date.now();
  ticker=setInterval(()=>{
   if(!analyser)return;
   analyser.getByteTimeDomainData(samples);
   let power=0;for(let i=0;i<samples.length;i++){const v=(samples[i]-128)/128;power+=v*v;}
   const rms=Math.sqrt(power/samples.length),percent=Math.min(100,Math.max(0,Math.round(rms*450)));
   $('#audioSignalLevel').style.width=percent+'%';
   if(rms>.006){everHeard=true;feedback('● AUDIO RECIBIDO',true);$('#audioSignalHelp').textContent='La señal llega al navegador. Los fragmentos se enviarán a transcripción cuando termine cada intervalo.';}
   else if(!everHeard&&Date.now()-started>8000){feedback('SIN SONIDO DETECTADO',false);$('#audioSignalHelp').textContent='Comprueba que el directo se reproduce y que activaste «Compartir audio de la pestaña».';}
  },330);
 }catch(err){feedback('CAPTURA ACTIVA · MEDIDOR NO DISPONIBLE',false);$('#audioSignalHelp').textContent='Audio compartido, pero no se pudo medir su nivel: '+String(err.message||err);}
}
function onStop(){clearMeter();feedback('CAPTURA DETENIDA',false);$('#audioSignalHelp').textContent='Puedes volver a conectar otra pestaña o reanudar la captura con la misma emisión.';}
$('#signalRTVE')?.addEventListener('click',()=>choose('rtve'));
$('#signalYouTube')?.addEventListener('click',()=>choose('youtube'));
$('#openSignal')?.addEventListener('click',openSignal);
$('#connectSignal')?.addEventListener('click',()=>$('#startCapture')?.click());
window.addEventListener('debate-capture-start',onStart);
window.addEventListener('debate-capture-stop',onStop);
setTimeout(()=>{const url=$('#youtubeUrl')?.value||'';if(url.includes('rtve.es')){$('#signalUrl').value=url;choose('rtve')}},800);
})();