import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:30};
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export default async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Solo GET'});
 if(!validOperator(req))return res.status(401).json({error:'Operador no autorizado'});
 const id=String(req.query.id||'');
 if(!UUID.test(id))return res.status(400).json({error:'Debate inválido'});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Neon no configurado'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  const [db,people,claims,audio,events]=await Promise.all([
   sql.query('SELECT id,title,identity_enabled,voice_embedding_enabled FROM debates WHERE id=$1 LIMIT 1',[id]),
   sql.query(`SELECT r.name,r.party,r.role,
      count(p.id) FILTER(WHERE p.source_type='public-reference' AND p.quality_status='source-labeled')::int AS references
      FROM debate_roster r LEFT JOIN voice_profiles p ON p.debate_id=r.debate_id AND p.person_name=r.name
      WHERE r.debate_id=$1 GROUP BY r.name,r.party,r.role ORDER BY r.role,r.name`,[id]),
   sql.query(`SELECT count(*)::int AS total,
     count(*) FILTER(WHERE speaker_origin='voice_embedding')::int AS voice_attributed,
     count(*) FILTER(WHERE speaker_origin='unknown')::int AS unknown,
     count(*) FILTER(WHERE speaker_origin='turn_cue')::int AS provisional_turn,
     count(*) FILTER(WHERE speaker_origin='manual')::int AS manual
     FROM claims WHERE debate_id=$1`,[id]),
   sql.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='processed')::int AS processed,
     max(created_at) AS latest FROM audio_segments WHERE debate_id=$1`,[id]),
   sql.query(`SELECT count(*)::int AS total,
     count(*) FILTER(WHERE decision='matched')::int AS matched,
     count(*) FILTER(WHERE decision='unknown')::int AS inconclusive,
     coalesce(sum(0),0)::int AS placeholder,max(created_at) AS latest
     FROM voice_match_events WHERE debate_id=$1 AND method='campplus-v2-span'`,[id])
  ]);
  if(!db.length)return res.status(404).json({error:'Sesión no encontrada'});
  const candidates=people.filter(x=>x.role==='candidate');
  const ready=candidates.filter(x=>x.references>=2);
  return res.status(200).json({
   id,title:db[0].title,
   identity_enabled:db[0].identity_enabled,voice_embedding_enabled:db[0].voice_embedding_enabled,
   total_candidates:candidates.length,ready_candidates:ready.length,
   roster:people.map(x=>({name:x.name,party:x.party,role:x.role,reference_count:x.references})),
   claims:claims[0],audio:audio[0],
   voice_v2:{total:events[0].total,matched:events[0].matched,inconclusive:events[0].inconclusive,latest:events[0].latest},
   metadata_only:true,note:'Referencia etiquetada por su fuente; no se certifica identidad de la persona ni se expone su vector acústico.'
  });
 }catch(e){return res.status(500).json({error:'No se pudo comprobar el motor de identidad',detail:String(e.message||e).slice(0,180)})}
}
