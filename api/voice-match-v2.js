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
 if(!first||!second)return {decision:'insufficient_references',score:0,second_score:0,threshold:0.78};
 const threshold=durationMs<4500?.80:.74,marginReq=durationMs<4500?.17:.14;
 const gap=first.score-second.score;
 const matched=first.score>=threshold&&first.minimum>=threshold-.09&&gap>=marginReq;
 return {decision:matched?'matched':'unknown',name:matched?first.name:null,party:matched?first.party:null,
  score:Math.round(first.score*10000)/10000,second_score:Math.round(second.score*10000)/10000,
  margin:Math.round(gap*10000)/10000,threshold,margin_required:marginReq,samples:first.samples};
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
   sql.query("SELECT v.person_name,r.party,v.embedding FROM voice_profiles v JOIN debate_roster r ON r.debate_id=v.debate_id AND r.name=v.person_name WHERE v.debate_id=$1 AND v.model_id=$2 AND v.source_type='public-reference' AND v.quality_status='source-labeled' AND r.role='candidate' LIMIT 120",[id,MODEL])
  ]);
  const audio=seg[0];
  if(!audio||audio.status!=='processed')return answer(res,409,{error:'El fragmento todavía no se ha guardado'});
  const segStart=Number(audio.start_ms),segEnd=Number(audio.end_ms);
  if(start_ms<segStart-300||end_ms>segEnd+300)return answer(res,422,{error:'La huella vocal no pertenece al fragmento declarado'});
  const d=decide(embedding,refs,duration);
  if(d.decision==='insufficient_references')return answer(res,409,{error:'Faltan al menos dos referencias por candidato',references:refs.length});
  // Event insertion and claim attribution are in the same SQL statement.
  // Only claims from the exact Scribe fragment with >=80% temporal overlap are eligible.
  // Manually labeled and previously matched claims are never overwritten.
  const query=`
   WITH recorded AS (
    INSERT INTO voice_match_events
     (debate_id,seq,start_ms,end_ms,person_name,party,score,second_score,threshold,method,decision)
    VALUES ($1::uuid,$2::integer,$3::integer,$4::integer,$5,$6,$7::numeric,$8::numeric,$9::numeric,$10,$11)
    ON CONFLICT DO NOTHING RETURNING id
   ), tagged AS (
    UPDATE claims c SET speaker=$5,party=$6,speaker_origin='voice_embedding',
      voice_similarity=$7::numeric,speaker_confidence=NULL,speaker_model=$12
    WHERE c.debate_id=$1::uuid AND EXISTS (SELECT 1 FROM recorded)
      AND $13::boolean
      AND c.source_type='audio_scribe' AND c.speaker_origin='unknown'
      AND c.speaker ILIKE '%(fragmento '||$2::integer||')%'
      AND c.start_ms <= $4::integer AND c.end_ms >= $3::integer
      AND c.end_ms>c.start_ms
      AND (LEAST(c.end_ms,$4::integer)-GREATEST(c.start_ms,$3::integer))::numeric/
          GREATEST(1,c.end_ms-c.start_ms)::numeric >= 0.80
    RETURNING c.id
   )
   SELECT (SELECT count(*)::integer FROM recorded) AS inserted,
          (SELECT count(*)::integer FROM tagged) AS changed`;
  const rows=await sql.query(query,[id,seq,start_ms,end_ms,d.name,d.party,d.score,d.second_score,d.threshold,METHOD,d.decision,MODEL+':span-v2',d.decision==='matched']);
  return answer(res,200,{matched:d.decision==='matched',status:d.decision,name:d.name,score:d.score,second_score:d.second_score,
   gap:d.margin,threshold:d.threshold,margin_required:d.margin_required,changed:rows[0]?.changed||0,
   duplicate:rows[0]?.inserted===0,seq,start_ms,end_ms,provisional:true,
   note:'Similitud acústica, nunca probabilidad de certeza. Solo se etiqueta una afirmación incluida en el tramo vocal.'});
 }catch(err){return answer(res,500,{error:'Identificación acústica no completada',detail:String(err.message||err).slice(0,200)})}
}
