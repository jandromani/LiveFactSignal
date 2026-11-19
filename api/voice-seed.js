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
  // Only same-date, same-event derivative sessions of the Sánchez–Feijóo debate.
  // Import source-labeled reference voices; never import speculative self-learned debate_auto profiles.
  const r=await sql.query(`
   WITH eligible AS (
    SELECT d.id
    FROM debates d JOIN debates root ON root.id=$1::uuid
    WHERE d.id=$2::uuid
      AND d.event_date=root.event_date
      AND d.source_type='live'
      AND (d.id=root.id OR d.title LIKE root.title || '%')
   ), people AS (
    INSERT INTO debate_roster (debate_id,name,party,role,aliases,confirmed)
    SELECT e.id,r.name,r.party,r.role,r.aliases,r.confirmed
    FROM eligible e CROSS JOIN debate_roster r
    WHERE r.debate_id=$1::uuid
    ON CONFLICT (debate_id,name) DO NOTHING
    RETURNING id
   ), seeded AS (
    INSERT INTO voice_profiles (debate_id,person_name,party,model_id,embedding,duration_ms,source_type,source_reference,verified_by,quality_status)
    SELECT e.id,v.person_name,r.party,v.model_id,v.embedding,v.duration_ms,
           'public-reference',v.source_url || '#t=' || coalesce(v.source_segment_start_s::text,'0'),
           'public-source-metadata',v.quality_status
    FROM eligible e
    JOIN debate_roster r ON r.debate_id=$1::uuid
    JOIN voice_reference_library v ON v.person_name=r.name
    WHERE r.role='candidate' AND v.quality_status='source-labeled'
    ON CONFLICT DO NOTHING
    RETURNING person_name
   )
   SELECT (SELECT count(*) FROM eligible)::int AS eligible,
          (SELECT count(*) FROM people)::int AS copied_people,
          (SELECT count(*) FROM seeded)::int AS copied_voices`,[ROOT,id]);
  const row=r[0];
  if(!row?.eligible)return response(res,422,{error:'La sesión no pertenece a este debate; no se importarán voces incorrectas'});
  const result=await sql.query("SELECT person_name,count(*)::int AS samples FROM voice_profiles WHERE debate_id=$1 AND source_type='public-reference' AND quality_status='source-labeled' GROUP BY person_name ORDER BY person_name",[id]);
  return response(res,200,{ok:true,id,added_voices:row.copied_voices,copied_people:row.copied_people,profiles:result,automatic_learning:false,notice:'Las voces proceden de fuentes etiquetadas, no de una verificación manual de identidad.'});
 }catch(e){return response(res,500,{error:'No se pudieron sincronizar las referencias acústicas',detail:String(e.message||e).slice(0,200)})}
}