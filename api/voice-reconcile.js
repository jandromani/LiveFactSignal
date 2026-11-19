import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:30};
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export default async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Solo POST'});
 if(!validOperator(req))return res.status(401).json({error:'Operador no autorizado'});
 const origin=String(req.headers.origin||'');
 if(origin){try{const u=new URL(origin);if(u.protocol!=='https:'||u.host!==String(req.headers.host||''))return res.status(403).json({error:'Origen no autorizado'});}catch{return res.status(403).json({error:'Origen inválido'})}}
 const id=String(req.body?.id||'');if(!UUID.test(id))return res.status(400).json({error:'Debate inválido'});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Neon no configurado'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  // Replay previously stored acoustic evidence against claims that arrived after the STT call.
  // A claim is assigned only if every applicable high-confidence span names the SAME person.
  const q=`
   WITH candidates AS (
    SELECT c.id AS claim_id,v.person_name,v.party,v.score,
      c.end_ms-c.start_ms AS phrase_ms,
      LEAST(c.end_ms,v.end_ms)-GREATEST(c.start_ms,v.start_ms) AS overlap_ms
    FROM claims c JOIN voice_match_events v ON v.debate_id=c.debate_id
    WHERE c.debate_id=$1::uuid AND c.source_type='audio_scribe' AND c.speaker_origin='unknown'
      AND c.speaker ILIKE '%(fragmento '||v.seq::integer||')%'
      AND v.method='campplus-v2-span' AND v.decision='matched'
      AND v.person_name IS NOT NULL
      AND v.score>=v.threshold AND v.score-v.second_score>=0.14
      AND c.start_ms<=v.end_ms AND c.end_ms>=v.start_ms AND c.end_ms>c.start_ms
   ), majority AS (
    SELECT claim_id,
      max(person_name) AS person_name,max(party) AS party,max(score) AS voice_score
    FROM candidates
    WHERE overlap_ms::numeric / GREATEST(1,phrase_ms)::numeric>=0.80
    GROUP BY claim_id HAVING count(DISTINCT person_name)=1
   ), applied AS (
    UPDATE claims c SET speaker=m.person_name,party=m.party,speaker_origin='voice_embedding',
      voice_similarity=m.voice_score,speaker_confidence=NULL,
      speaker_model='sherpaw-campplus-zh-en-advanced@5fc23543:span-v2-reconcile'
    FROM majority m WHERE c.id=m.claim_id AND c.debate_id=$1::uuid
       AND c.speaker_origin='unknown' AND c.source_type='audio_scribe'
    RETURNING c.id
   ) SELECT count(*)::integer AS updated FROM applied`;
  const rows=await sql.query(q,[id]);
  return res.status(200).json({ok:true,id,updated:rows[0]?.updated||0,method:'saved-acoustic-span-replay',provisional:true});
 }catch(e){return res.status(500).json({error:'No se pudo reconciliar la atribución de voces',detail:String(e.message||e).slice(0,180)})}
}
