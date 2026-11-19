import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:30};
const ROOT='f3c2fd9b-5fa1-4818-a407-453f5cac4a34';
const UUID=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const response=(res,status,obj)=>res.status(status).setHeader('Cache-Control','no-store').setHeader('X-Content-Type-Options','nosniff').json(obj);
export default async function handler(req,res){
 if(req.method!=='POST')return response(res,405,{error:'Solo POST'});
 if(!validOperator(req))return response(res,401,{error:'Acceso privado de operador requerido'});
 const origin=String(req.headers.origin||'');
 const host=String(req.headers.host||'');
 if(origin){
  try{const u=new URL(origin);if(u.protocol!=='https:'||u.host!==host)return response(res,403,{error:'Origen no autorizado'});}
  catch{return response(res,403,{error:'Origen inválido'})}
 }
 const id=String(req.body?.id||'');
 if(!UUID.test(id))return response(res,400,{error:'ID de sesión inválido'});
 if(!process.env.DATABASE_URL)return response(res,503,{error:'Neon no configurado'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  // Legitimate roster membership controls the import. No party inferred from speech.
  // The database triggers handle new sessions automatically; this is an idempotent repair.
  const matches=await sql.query("SELECT id,title,event_date,source_type FROM debates WHERE id=$1 LIMIT 1",[id]);
  if(!matches.length)return response(res,404,{error:'Sesión no encontrada'});
  const d=matches[0];
  const rows=await sql.query(`
   WITH candidate_roster AS (
    SELECT r.name,r.party FROM debate_roster r
    WHERE r.debate_id=$1::uuid AND r.role='candidate'
   ), seeded AS (
    INSERT INTO voice_profiles (debate_id,person_name,party,model_id,embedding,duration_ms,source_type,source_reference,verified_by,quality_status)
    SELECT $1::uuid,v.person_name,r.party,v.model_id,v.embedding,v.duration_ms,
           'public-reference',v.source_url||'#t='||coalesce(v.source_segment_start_s::text,'0'),
           'public-source-metadata',v.quality_status
    FROM candidate_roster r JOIN voice_reference_library v ON v.person_name=r.name
    WHERE v.quality_status='source-labeled'
    ON CONFLICT DO NOTHING RETURNING person_name
   )
   SELECT count(*)::integer AS added_voices FROM seeded`,[id]);
  const counts=await sql.query(`
    SELECT r.name AS person_name,
       count(vp.id) FILTER (WHERE vp.source_type='public-reference' AND vp.quality_status='source-labeled')::integer AS samples
    FROM debate_roster r LEFT JOIN voice_profiles vp ON vp.debate_id=r.debate_id AND vp.person_name=r.name
    WHERE r.debate_id=$1::uuid AND r.role='candidate'
    GROUP BY r.name ORDER BY r.name`,[id]);
  return response(res,200,{ok:true,id,added_voices:rows[0]?.added_voices||0,
    profiles:counts,total_candidates:counts.length,ready_candidates:counts.filter(x=>x.samples>=2).length,
    automatic_learning:false,
    notice:'Solo se importan referencias de candidatos registrados y etiquetadas por la fuente. No se importan huellas aprendidas durante el debate.'});
 }catch(e){return response(res,500,{error:'No se pudieron sincronizar las referencias acústicas',detail:String(e.message||e).slice(0,200)})}
}