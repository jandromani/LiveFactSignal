import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:30};
const MODEL='sherpaw-campplus-zh-en-advanced@5fc23543';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const reply=(r,s,obj)=>r.status(s).setHeader('Cache-Control','private,no-store').setHeader('X-Content-Type-Options','nosniff').json(obj);
function cosine(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==192||b.length!==192)return NaN;
 let dot=0,x=0,y=0;
 for(let i=0;i<192;i++){const u=Number(a[i]),v=Number(b[i]);if(!Number.isFinite(u)||!Number.isFinite(v))return NaN;dot+=u*v;x+=u*u;y+=v*v;}
 return x>1e-8&&y>1e-8?dot/Math.sqrt(x*y):NaN;
}
function sourceOK(raw){
 try{
  const u=new URL(String(raw||''));if(u.protocol!=='https:')return false;
  if(u.username||u.password||u.port||String(raw).length>1200)return false;
  const h=u.hostname.toLowerCase();
  return ['www.rtve.es','rtve.es','ppcantabria.org','www.ppcantabria.org','www.youtube.com','youtube.com','youtu.be','commons.wikimedia.org'].includes(h);
 }catch{return false}
}
export default async function handler(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'Solo POST'});
 if(!validOperator(req))return reply(res,401,{error:'Se requiere sesión autorizada de operador'});
 const origin=String(req.headers.origin||'');
 if(origin){try{const u=new URL(origin);if(u.protocol!=='https:'||u.host!==String(req.headers.host||''))return reply(res,403,{error:'Origen no autorizado'});}catch{return reply(res,403,{error:'Origen inválido'})}}
 const {id,name,embedding,duration_ms,source_url,operator_confirmed}=req.body||{};
 if(!UUID.test(String(id||''))||!['Alberto Núñez Feijóo','Pedro Sánchez'].includes(name))return reply(res,400,{error:'Sesión o candidato inválidos'});
 if(operator_confirmed!==true||!sourceOK(source_url))return reply(res,400,{error:'Confirma la identidad y utiliza una fuente audiovisual pública autorizada (RTVE, PP Cantabria, YouTube o Wikimedia)'});
 if(!Number.isInteger(duration_ms)||duration_ms<8000||duration_ms>15500)return reply(res,400,{error:'Necesitamos de 8 a 15 segundos limpios de una sola voz por muestra'});
 if(!Array.isArray(embedding)||embedding.length!==192||embedding.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1000))return reply(res,400,{error:'Huella CAM++ inválida'});
 if(!process.env.DATABASE_URL)return reply(res,503,{error:'Neon no disponible'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  const people=await sql.query("SELECT r.name,r.role FROM debate_roster r WHERE r.debate_id=$1 AND r.role='candidate' AND r.name=$2 LIMIT 1",[id,name]);
  if(!people.length)return reply(res,422,{error:'Este candidato no pertenece al debate seleccionado'});
  const refs=await sql.query(`SELECT r.person_name,r.embedding,r.quality_status
     FROM voice_reference_library r
     WHERE r.model_id=$1 AND r.person_name IN ('Alberto Núñez Feijóo','Pedro Sánchez')
       AND r.quality_status IN ('source-labeled','operator-reviewed')
     ORDER BY r.created_at LIMIT 80`,[MODEL]);
  const groups=new Map();
  for(const row of refs){
   const sim=cosine(embedding,row.embedding);
   if(!Number.isFinite(sim))continue;
   if(!groups.has(row.person_name))groups.set(row.person_name,[]);
   groups.get(row.person_name).push(sim);
  }
  if((groups.get('Pedro Sánchez')||[]).length<2||(groups.get('Alberto Núñez Feijóo')||[]).length<2)
   return reply(res,409,{error:'Faltan al menos dos referencias iniciales por candidato'});
  const ranked=[...groups].map(([person,scores])=>{
   scores.sort((a,b)=>b-a);
   return {person,avg:(scores[0]+scores[1])/2,min:scores[1],max:scores[0]};
  }).sort((a,b)=>b.avg-a.avg);
  const wanted=ranked.find(x=>x.person===name),other=ranked.find(x=>x.person!==name);
  const gap=wanted.avg-other.avg;
  const details={match:Number(wanted.avg.toFixed(3)),margin:Number(gap.toFixed(3)),closest:Number(wanted.max.toFixed(3)),other:Number(other.avg.toFixed(3))};
  if(ranked[0].person!==name||wanted.avg<.58||wanted.min<.52||gap<.28)
   return reply(res,422,{error:'Muestra descartada: su timbre no coincide suficientemente con las referencias del candidato elegido. Busca un tramo sin intervenciones ni música de fondo.',...details});
  if(wanted.max>=.985)
   return reply(res,409,{error:'Esta huella es prácticamente idéntica a otra ya guardada. Elige un tramo distinto para ampliar la diversidad.',...details});
  // One atomic SQL statement: store source-linked vector and seed all debate sessions
  // where the candidate is a registered participant. Raw audio never leaves the browser.
  const save=await sql.query(`
   WITH added AS (
    INSERT INTO voice_reference_library
      (person_name,model_id,embedding,source_url,source_type,source_license,
       source_segment_start_s,source_segment_end_s,duration_ms,verified_identity,
       verification_method,quality_status,rights_notes)
    VALUES ($1,$2,$3::jsonb,$4,'operator-recorded',NULL,NULL,NULL,$5,false,
      'manual-single-speaker-confirmation+acoustic-cross-check','operator-reviewed',
      'Se guarda solo el vector CAM++: el audio no se almacena. Etiqueta manual provisional.')
    RETURNING id,person_name,model_id,embedding,duration_ms,source_url,quality_status
   ), propagated AS (
    INSERT INTO voice_profiles
      (debate_id,person_name,party,model_id,embedding,duration_ms,
       source_type,source_reference,verified_by,quality_status)
    SELECT r.debate_id,a.person_name,r.party,a.model_id,a.embedding,a.duration_ms,
       'public-reference',a.source_url||'#training='||a.id::text,
       'operator-confirmed+acoustic-check',a.quality_status
    FROM added a JOIN debate_roster r ON r.name=a.person_name AND r.role='candidate'
    ON CONFLICT DO NOTHING
    RETURNING id
   )
   SELECT a.id::text AS reference_id, (SELECT count(*)::integer FROM propagated) AS sessions_updated
   FROM added a`,[name,MODEL,JSON.stringify(embedding),source_url,duration_ms]);
  return reply(res,201,{ok:true,candidate:name,reference_id:save[0].reference_id,
   sessions_updated:save[0].sessions_updated,quality_status:'operator-reviewed',provisional:true,...details,
   message:'Referencia admitida para esta y otras sesiones del candidato, con prueba cruzada frente a la otra voz.'});
 }catch(e){return reply(res,500,{error:'No se pudo registrar la nueva muestra',detail:String(e?.message||e).slice(0,200)})}
}