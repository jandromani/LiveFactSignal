import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:30};

const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const MODEL='sherpaw-campplus-zh-en-advanced@5fc23543';
const METHOD='campplus-v2-span';
function answer(res,code,data){res.setHeader('Cache-Control','private,no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(code).json(data);}
function cosine(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==192||b.length!==192)return NaN;
 let dot=0,na=0,nb=0;
 for(let i=0;i<192;i++){const x=Number(a[i]),y=Number(b[i]);if(!Number.isFinite(x)||!Number.isFinite(y))return NaN;dot+=x*y;na+=x*x;nb+=y*y}
 return na>1e-10&&nb>1e-10?dot/Math.sqrt(na*nb):NaN;
}
function decide(embedding,rows,durationMs){
 const byPerson=new Map();
 for(const row of rows){
  const score=cosine(embedding,Array.isArray(row.embedding)?row.embedding:[]);
  if(!Number.isFinite(score))continue;
  if(!byPerson.has(row.person_name))byPerson.set(row.person_name,{name:row.person_name,party:row.party,scores:[]});
  byPerson.get(row.person_name).scores.push(score);
 }
 const options=[...byPerson.values()].filter(x=>x.scores.length>=2).map(x=>{
  x.scores.sort((a,b)=>b-a);
  return {name:x.name,party:x.party,score:(x.scores[0]+x.scores[1])/2,minimum:x.scores[1],samples:x.scores.length};
 }).sort((a,b)=>b.score-a.score);
 const first=options[0],second=options[1];
 if(!first||!second)return {decision:'insufficient_references',score:0,second_score:0,threshold:0.74};
 const gap=first.score-second.score;
 const strictThreshold=durationMs<4500?.80:.74;
 const strictMargin=durationMs<4500?.17:.14;
 const strong=first.score>=strictThreshold&&first.minimum>=strictThreshold-.09&&gap>=strictMargin;
 // Never infer a person from a single low-scoring acoustic sample.
 // Admit a provisional candidate ONLY when two independent reference vectors agree
 // and the next consecutive STT chunk identifies the same candidate again.
 const candidate=!strong&&durationMs>=6000&&first.score>=.65&&first.minimum>=.58&&gap>=.40;
 return {decision:strong?'matched':candidate?'candidate':'unknown',
  candidate_name:(strong||candidate)?first.name:null,candidate_party:(strong||candidate)?first.party:null,
  score:Math.round(first.score*10000)/10000,second_score:Math.round(second.score*10000)/10000,
  margin:Math.round(gap*10000)/10000,
  threshold:strong?strictThreshold:candidate?.65:strictThreshold,
  strict_threshold:strictThreshold,strict_margin:strictMargin,samples:first.samples};
}
export default async function handler(req,res){
 if(req.method!=='POST')return answer(res,405,{error:'Solo POST'});
 if(!validOperator(req))return answer(res,401,{error:'Sesión de operador no autorizada'});
 const origin=String(req.headers.origin||'');
 if(origin){try{const u=new URL(origin);if(u.protocol!=='https:'||u.host!==String(req.headers.host||''))return answer(res,403,{error:'Origen no autorizado'});}catch{return answer(res,403,{error:'Origen inválido'})}}
 const {id,seq,start_ms,end_ms,embedding}=req.body||{};
 if(!UUID.test(String(id||'')))return answer(res,400,{error:'Debate inválido'});
 if(!Number.isSafeInteger(seq)||seq<0||seq>100000||!Number.isSafeInteger(start_ms)||!Number.isSafeInteger(end_ms)||start_ms<0||end_ms<=start_ms)
  return answer(res,400,{error:'Marca de tiempo o secuencia inválida'});
 const duration=end_ms-start_ms;
 if(duration<2800||duration>16000)return answer(res,400,{error:'Tramo vocal fuera de 2,8–16 s'});
 if(!Array.isArray(embedding)||embedding.length!==192||embedding.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1000))
  return answer(res,400,{error:'Vector acústico CAM++ inválido'});
 if(!process.env.DATABASE_URL)return answer(res,503,{error:'Neon no configurado'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  const [seg,refs]=await Promise.all([
   sql.query("SELECT start_ms,end_ms,status FROM audio_segments WHERE debate_id=$1 AND seq=$2 LIMIT 1",[id,seq]),
   sql.query("SELECT v.person_name,r.party,v.embedding FROM voice_profiles v JOIN debate_roster r ON r.debate_id=v.debate_id AND r.name=v.person_name WHERE v.debate_id=$1 AND v.model_id=$2 AND v.source_type='public-reference' AND v.quality_status IN ('source-labeled','operator-reviewed') AND r.role='candidate' LIMIT 120",[id,MODEL])
  ]);
  const audio=seg[0];
  if(!audio||audio.status!=='processed')return answer(res,409,{error:'El fragmento todavía no se ha guardado'});
  const segStart=Number(audio.start_ms),segEnd=Number(audio.end_ms);
  if(start_ms<segStart-300||end_ms>segEnd+300)return answer(res,422,{error:'La huella vocal no pertenece al fragmento declarado'});
  const d=decide(embedding,refs,duration);
  if(d.decision==='insufficient_references')return answer(res,409,{error:'Faltan al menos dos referencias por candidato',references:refs.length});
  // A weak single window is NOT identified. Two consecutive candidate windows
  // with clear acoustic separation (>=.40) and >=6s each are needed before promotion.
  // The previous candidate can be promoted with the new observation, but no
  // historical unknown without candidate evidence is reclassified.
  const query=`
   WITH previous_candidate AS (
    SELECT v.id,v.seq,v.start_ms,v.end_ms,v.candidate_name,v.candidate_party
    FROM voice_match_events v
    WHERE v.debate_id=$1::uuid AND v.method=$10 AND v.decision='candidate'
      AND v.candidate_name=$5 AND v.candidate_party=$6
      AND v.seq=$2::integer-1
      AND v.score>=0.65 AND v.score-v.second_score>=0.40
      AND v.end_ms BETWEEN $3::integer-14500 AND $3::integer+1000
      AND NOT EXISTS (
       SELECT 1 FROM voice_match_events rival
       WHERE rival.debate_id=$1::uuid AND rival.method=$10 AND rival.decision='matched'
         AND rival.person_name IS DISTINCT FROM $5 AND rival.seq BETWEEN v.seq AND $2::integer
         AND rival.start_ms BETWEEN v.end_ms AND $4::integer
      )
    ORDER BY v.end_ms DESC LIMIT 1
   ), recorded AS (
    INSERT INTO voice_match_events
     (debate_id,seq,start_ms,end_ms,person_name,party,score,second_score,threshold,method,decision,candidate_name,candidate_party)
    SELECT $1::uuid,$2::integer,$3::integer,$4::integer,
     CASE WHEN $12::boolean OR ($13::boolean AND EXISTS(SELECT 1 FROM previous_candidate)) THEN $5 ELSE NULL END,
     CASE WHEN $12::boolean OR ($13::boolean AND EXISTS(SELECT 1 FROM previous_candidate)) THEN $6 ELSE NULL END,
     $7::numeric,$8::numeric,$9::numeric,$10,
     CASE WHEN $12::boolean OR ($13::boolean AND EXISTS(SELECT 1 FROM previous_candidate)) THEN 'matched'
          WHEN $13::boolean THEN 'candidate' ELSE 'unknown' END,
     $5,$6
    ON CONFLICT DO NOTHING
    RETURNING id,seq,start_ms,end_ms,person_name,party,decision,score,threshold
   ), promoted_prior AS (
    UPDATE voice_match_events v
    SET decision='matched',person_name=v.candidate_name,party=v.candidate_party
    FROM previous_candidate prev
    WHERE v.id=prev.id
      AND EXISTS(SELECT 1 FROM recorded r WHERE r.decision='matched')
      AND v.decision='candidate'
    RETURNING v.id,v.seq,v.start_ms,v.end_ms,v.person_name,v.party,v.decision,v.score,v.threshold
   ), assigned AS (
    SELECT seq,start_ms,end_ms,person_name,party,score,threshold FROM recorded
     WHERE decision='matched' AND person_name IS NOT NULL
    UNION ALL
    SELECT seq,start_ms,end_ms,person_name,party,score,threshold FROM promoted_prior
   ), tagged AS (
    UPDATE claims c
    SET speaker=a.person_name,party=a.party,speaker_origin='voice_embedding',
        voice_similarity=a.score::numeric,speaker_confidence=NULL,
        speaker_model=$11
    FROM assigned a
    WHERE c.debate_id=$1::uuid AND c.source_type='audio_scribe'
      AND c.speaker_origin='unknown'
      AND c.speaker ILIKE '%(fragmento '||a.seq::integer||')%'
      AND c.start_ms<=a.end_ms AND c.end_ms>=a.start_ms
      AND c.end_ms>c.start_ms
      AND (LEAST(c.end_ms,a.end_ms)-GREATEST(c.start_ms,a.start_ms))::numeric/
           GREATEST(1,c.end_ms-c.start_ms)::numeric >=0.80
    RETURNING c.id
   )
   SELECT (SELECT count(*)::integer FROM recorded) AS inserted,
          (SELECT count(*)::integer FROM promoted_prior) AS promoted,
          (SELECT count(*)::integer FROM tagged) AS changed,
          (SELECT decision FROM recorded LIMIT 1) AS status`;
  const rows=await sql.query(query,[id,seq,start_ms,end_ms,
   d.candidate_name,d.candidate_party,d.score,d.second_score,d.threshold,
   METHOD,MODEL+':span-v2',d.decision==='matched',d.decision==='candidate']);
  const z=rows[0]||{},status=z.status||'duplicate';
  return answer(res,200,{matched:status==='matched',status,
   name:status==='matched'?d.candidate_name:null,
   score:d.score,second_score:d.second_score,gap:d.margin,
   threshold:d.threshold,strict_threshold:d.strict_threshold,
   changed:z.changed||0,promoted_prior:z.promoted||0,
   duplicate:z.inserted===0,seq,start_ms,end_ms,provisional:true,
   note:status==='candidate'?'Coincidencia acústica aún pendiente de continuidad; no se identifica al hablante.':
   'La atribución es provisional. Las coincidencias moderadas requieren dos fragmentos consecutivos y referencias acústicas diferenciadas.'});
 }catch(err){return answer(res,500,{error:'Identificación acústica no completada',detail:String(err.message||err).slice(0,200)})}
}
