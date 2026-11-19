import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:30};
const ROOT='f3c2fd9b-5fa1-4818-a407-453f5cac4a34';
const ret=(res,code,data)=>res.status(code).setHeader('Cache-Control','no-store').setHeader('X-Content-Type-Options','nosniff').json(data);
async function ensure(sql){
 await sql.query(`CREATE TABLE IF NOT EXISTS debate_reset_state (
 root_id uuid PRIMARY KEY REFERENCES debates(id),
 current_id uuid NOT NULL REFERENCES debates(id),
 reset_count integer NOT NULL DEFAULT 0,
 changed_at timestamptz NOT NULL DEFAULT now()
 )`);
}
export default async function handler(req,res){
 if(!process.env.DATABASE_URL)return ret(res,503,{error:'Neon no configurado'});
 if(!['GET','POST'].includes(req.method))return ret(res,405,{error:'Método no admitido'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  if(req.method==='GET'){
   const rows=await sql.query('SELECT current_id,reset_count,changed_at FROM debate_reset_state WHERE root_id=$1',[ROOT]).catch(e=>{
    if(/does not exist|relation/i.test(String(e.message)))return [];throw e;
   });
   return ret(res,200,{root_id:ROOT,current_id:rows[0]?.current_id||ROOT,reset_count:rows[0]?.reset_count||0,changed_at:rows[0]?.changed_at||null,non_destructive:true});
  }
  if(!validOperator(req))return ret(res,401,{error:'Acceso de operador requerido'});
  const origin=String(req.headers.origin||'');
  if(origin&&!['https://debate-monitor-live.vercel.app','https://debate-monitor-live-jandromanis-projects.vercel.app'].includes(origin)&&!/^https:\/\/debate-monitor-live-[a-z0-9]+-jandromanis-projects\.vercel\.app$/.test(origin))return ret(res,403,{error:'Origen no autorizado'});
  if(req.body?.action!=='new-run'||req.body?.root_id!==ROOT||req.body?.confirm!=='CREAR_SESION_NUEVA')return ret(res,400,{error:'Confirma la creación de una captura nueva'});
  await ensure(sql);
  const rows=await sql.query(`
   WITH new_debate AS (
    INSERT INTO debates (youtube_id,title,event_date,mode,status,clip_start_ms,clip_end_ms,source_type,source_url,source_description,identity_enabled,verification_enabled,voice_embedding_enabled)
    SELECT d.youtube_id, d.title || ' · Nueva captura',d.event_date,'live','ready',0,NULL,'live',d.source_url,
           'Nueva sesión independiente; los datos de la captura anterior permanecen archivados',true,true,true
    FROM debates d WHERE d.id=$1
    RETURNING id
   ), calendar_copy AS (
    INSERT INTO debate_calendar (debate_id,slug,scheduled_at,timezone,format,organizer,moderator,headcount,confirmation,topics,official_sources,watch_url,watch_platform,display_order,notes,video_youtube_id,stream_verified_at)
    SELECT n.id,c.slug||'-run-'||substring(replace(n.id::text,'-','') from 1 for 10),c.scheduled_at,c.timezone,c.format,c.organizer,c.moderator,c.headcount,c.confirmation,c.topics,c.official_sources,c.watch_url,c.watch_platform,c.display_order-1,'Nueva sesión de análisis independiente; el original permanece archivado',c.video_youtube_id,c.stream_verified_at
    FROM debate_calendar c CROSS JOIN new_debate n WHERE c.debate_id=$1
    RETURNING debate_id
   ), roster_copy AS (
    INSERT INTO debate_roster (debate_id,name,party,role,aliases,confirmed)
    SELECT n.id,r.name,r.party,r.role,r.aliases,r.confirmed
    FROM debate_roster r CROSS JOIN new_debate n WHERE r.debate_id=$1
    RETURNING id
   ), voice_reference_copy AS (
    INSERT INTO voice_profiles (debate_id,person_name,party,model_id,embedding,duration_ms,source_type,source_reference,verified_by,quality_status)
    SELECT n.id,v.person_name,r.party,v.model_id,v.embedding,v.duration_ms,
           'public-reference',v.source_url||'#t='||coalesce(v.source_segment_start_s::text,'0'),
           'public-source-metadata',v.quality_status
    FROM voice_reference_library v
    CROSS JOIN new_debate n
    JOIN debate_roster r ON r.debate_id=$1 AND r.name=v.person_name
    WHERE v.quality_status='source-labeled'
    RETURNING id
   ), pointer AS (
    INSERT INTO debate_reset_state (root_id,current_id,reset_count,changed_at)
    SELECT $1::uuid,id,1,now() FROM new_debate WHERE TRUE
    ON CONFLICT (root_id) DO UPDATE SET current_id=EXCLUDED.current_id,reset_count=debate_reset_state.reset_count+1,changed_at=now()
    RETURNING current_id,reset_count
   )
   SELECT p.current_id,p.reset_count,(SELECT count(*) FROM roster_copy)::integer AS copied_people,
          (SELECT count(*) FROM calendar_copy)::integer AS copied_events,
          (SELECT count(*) FROM voice_reference_copy)::integer AS copied_voices
   FROM pointer p`,[ROOT]);
  if(!rows.length)return ret(res,404,{error:'Debate original no encontrado'});
  if(rows[0].copied_events!==1)return ret(res,500,{error:'No se ha encontrado el calendario original'});
  return ret(res,201,{ok:true,root_id:ROOT,current_id:rows[0].current_id,reset_count:rows[0].reset_count,copied_people:rows[0].copied_people,copied_voices:rows[0].copied_voices,previous_preserved:true,identity_automatic:true,message:'Nueva captura sin afirmaciones; referencias etiquetadas restauradas. No se han copiado huellas aprendidas durante debates.'});
 }catch(e){return ret(res,500,{error:'No se pudo crear la nueva captura',detail:String(e?.message||'').slice(0,230)})}
}