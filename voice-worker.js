// DEBATE/SIGNAL · On-device speaker embeddings · Sherpaw CAM++ 0.3.0
// No raw audio, vectors, or biometric data is sent to a third party by this worker.
// ONNX and WASM model files are fetched from pinned public model releases.
import {createExtractor,initSpeakerIdentificationModule} from 'https://cdn.jsdelivr.net/npm/@sherpaw/speaker-identification@0.3.0/dist/index.js';
import {loadVirtualData} from 'https://cdn.jsdelivr.net/npm/@sherpaw/preloader@0.3.0/dist/index.js';
const url='https://huggingface.co/moeru-ai/sherpaw-campplus-zh-en-advanced/resolve/5fc23543ac94200ae77514cf1c40596c5d70f6e8/install/bin/wasm/preload.data';
let loaded=null,extractor=null;
async function initialize(){
 if(loaded)return loaded;
 loaded=(async()=>{
  const m=await initSpeakerIdentificationModule();
  const r=await fetch(url,{cache:'force-cache'});
  if(!r.ok)throw Error('No se pudo cargar CAM++ de Hugging Face: HTTP '+r.status);
  const bytes=new Uint8Array(await r.arrayBuffer());
  loadVirtualData({module:m,virtualData:{'speaker.onnx':bytes}});
  extractor=createExtractor(m,{model:'speaker.onnx',minDurationSeconds:2});
  return m;
 })().catch(e=>{loaded=null;throw e});
 return loaded;
}
onmessage=async event=>{
 const {id,type,samples,sampleRate}=event.data||{};
 try{
  if(type==='warmup'){await initialize();postMessage({id,ok:true,type:'ready',model:'sherpaw-campplus-zh-en-advanced@5fc23543'});return;}
  if(type==='embed'){
   await initialize();
   const pcm=samples instanceof Float32Array?samples:new Float32Array(samples);
   if(pcm.length<sampleRate*2)throw Error('Necesitas al menos 2 segundos de voz limpia');
   const embedding=extractor.extract(pcm,sampleRate);
   if(!embedding||embedding.length!==192)throw Error('El modelo no devolvió 192 dimensiones');
   postMessage({id,ok:true,embedding:Array.from(embedding),duration_ms:Math.round(pcm.length/sampleRate*1000)});
   return;
  }
  postMessage({id,ok:false,error:'Comando desconocido'});
 }catch(e){postMessage({id,ok:false,error:String(e.message||e)});}
};