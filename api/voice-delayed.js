import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:30};
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const MODEL='sherpaw-campplus-zh-en-advanced@5fc23543';
const METHOD='campplus-delayed-5m';
const DELAY_MS=300000;
function respond(res,code,obj){return res.status(code).setHeader('Cache-Control','private,no-store').setHeader('X-Content-Type-Options','nosniff').json(obj)}
function normalize(v){
 if(!Array.isArray(v)||v.length!==192)return null;
 let sum=0;for(const n of v){if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000)return null;sum+=n*n}
 if(sum<1e-9)return null;const inv=1/Math.sqrt(sum);return v.map(x=>x*inv);
}
function cosine(a,b){let n=0;for(let i=0;i<192;i++)n+=a[i]*b[i];return n}
function centroid(group){
 const v=new Array(192).fill(0);let weight=0;
 for(const m of group){
  const w=Math.min(12000,Math.max(2800,m.end_ms-m.start_ms));
  weight+=w;
  for(let i=0;i<192;i++)v[i]+=m.vector[i]*w;
 }
 return normalize(v.map(x=>x/weight));
}
function clusters(spans){
 // Diarization first: group acoustically similar windows WITHOUT using names.
 // Require both centroid agreement and a minimum pairwise agreement.
 const groups=[];
 for(const s of spans){
  let winner=null,best=-1;
  for(const g of groups){
   const c=centroid(g);
   const score=cosine(s.vector,c);
   const pairMin=Math.min(...g.map(x=>cosine(s.vector,x.vector)));
   if(score>=0.75&&pairMin>=0.68&&score>best){winner=g;best=score}
  }
  if(winner)winner.push(s);
  else groups.push([s]);
 }
 return groups;
}
function identify(cluster,referenceByPerson){
 const voice=centroid(cluster);
 const options=[];
 for(const [person,record] of referenceByPerson){
  const scores=record.vectors.map(v=>cosine(voice,v)).sort((a,b)=>b-a);
  if(scores.length>=3)options.push({person,party:record.party,mean:(scores[0]+scores[1]+scores[2])/3,
   second:scores[1],best:scores[0]});
 }
 options.sort((a,b)=>b.mean-a.mean);
 const a=options[0],b=options[1];
 if(!a||!b)return {matched:false,candidate:null,score:0,runner:0,margin:0};
 const seqs=new Set(cluster.map(x=>x.seq));
 const total=cluster.reduce((sum,x)=>sum+Math.min(12000,x.end_ms-x.start_ms),0);
 const margin=a.mean-b.mean;
 const matched=seqs.size>=2&&total>=14000&&a.mean>=.75&&a.second>=.67&&margin>=.17;
 return {matched,candidate:a.person,party:a.party,score:a.mean,runner:b.mean,margin,
   secondRef:a.second,distinctSeqs:seqs.size,seconds:Math.round(total/1000)};
}
function classify(batch,references){
 const groups=clusters(batch);
 const proposed=[];
 const summaries=[];
 for(let index=0;index<groups.length;index++){
  const g=groups[index],d=identify(g,references);
  summaries.push({group:index+1,segments:g.length,seqs:d.distinctSeqs,seconds:d.seconds,
   proposed:d.candidate,accepted:d.matched,score:+d.score.toFixed(3),
   margin:+d.margin.toFixed(3)});
  const own=references.get(d.candidate);
  for(const x of g){
   const ownMax=own?Math.max(...own.vectors.map(v=>cosine(v,x.vector))):-1;
   let otherMax=-1;
   for(const [person,r] of references)if(person!==d.candidate){
    for(const v of r.vectors)otherMax=Math.max(otherMax,cosine(v,x.vector));
   }
   const within=cosine(x.vector,centroid(g));
   const safe=d.matched&&within>=.72&&ownMax>=.64&&ownMax-otherMax>=.10;
   proposed.push({seq:x.seq,start_ms:x.start_ms,end_ms:x.end_ms,
    person_name:safe?d.candidate:null,party:safe?d.party:null,
    candidate_name:d.candidate,candidate_party:d.party,
    decision:safe?'matched':'unknown',score:+d.score.toFixed(4),
    second_score:+d.runner.toFixed(4),threshold:.75,
    reason:safe?'cluster-confirmed':!d.matched?'cluster-inconclusive':'member-inconclusive'});
  }
 }
 return {proposed,summaries};
}
export default async function handler(req,res){
 if(req.method!=='POST')return respond(res,405,{error:'POST requerido'});
 if(!validOperator(req))return respond(res,401,{error:'Operador no autorizado'});
 const origin=String(req.headers.origin||'');
 if(origin){try{const u=new URL(origin);if(u.protocol!=='https:'||u.host!==req.headers.host)return respond(res,403,{error:'Origen rechazado'})}catch{return respond(res,403,{error:'Origen inválido'})}}
 const {id,spans,commit_keys}=req.body||{};
 if(!UUID.test(String(id||'')))return respond(res,400,{error:'ID de debate inválido'});
 if(!Array.isArray(spans)||spans.length<1||spans.length>90||!Array.isArray(commit_keys)||commit_keys.length<1||commit_keys.length>48)
  return respond(res,400,{error:'Lote de 1–90 tramos y 1–48 tramos maduros requerido'});
 if(!process.env.DATABASE_URL)return respond(res,503,{error:'Neon no configurado'});
 const now=Date.now(),clean=[],seen=new Set();
 for(const input of spans){
  const {seq,start_ms,end_ms,captured_at,embedding}=input||{};
  if(!Number.isSafeInteger(seq)||seq<0||seq>100000||!Number.isSafeInteger(start_ms)
    ||!Number.isSafeInteger(end_ms)||start_ms<0||end_ms<=start_ms
    ||end_ms-start_ms<2800||end_ms-start_ms>16000||!Number.isSafeInteger(captured_at)
    ||captured_at>now+60000||captured_at<now-3600000)
   return respond(res,422,{error:'Metadatos de tramo inválidos'});
  const v=normalize(embedding);
  if(!v)return respond(res,422,{error:'Embedding CAM++ inválido'});
  const key=seq+':'+start_ms+':'+end_ms;
  if(seen.has(key))return respond(res,422,{error:'Intervalos duplicados'});
  seen.add(key);clean.push({seq,start_ms,end_ms,captured_at,vector:v,key});
 }
 const keys=new Set(commit_keys);
 if(keys.size!==commit_keys.length||[...keys].some(x=>!seen.has(x)))return respond(res,422,{error:'Lote de confirmación incoherente'});
 const ready=clean.filter(x=>keys.has(x.key));
 if(ready.some(x=>now-x.captured_at<DELAY_MS-5000))return respond(res,409,{error:'Aún no han transcurrido cinco minutos para todos los tramos'});
 const min=Math.min(...clean.map(x=>x.start_ms)),max=Math.max(...clean.map(x=>x.end_ms));
 if(max-min>650000)return respond(res,422,{error:'Ventana de contexto superior al máximo de 10 minutos'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  const seqs=[...new Set(clean.map(x=>x.seq))];
  const [audio,referenceRows]=await Promise.all([
   sql.query("SELECT seq,start_ms,end_ms,status FROM audio_segments WHERE debate_id=$1 AND seq=ANY($2::int[])",[id,seqs]),
   sql.query("SELECT p.person_name,r.party,p.embedding FROM voice_profiles p JOIN debate_roster r ON r.debate_id=p.debate_id AND r.name=p.person_name WHERE p.debate_id=$1 AND p.model_id=$2 AND p.source_type='public-reference' AND p.quality_status IN ('source-labeled','operator-reviewed') AND r.role='candidate' LIMIT 120",[id,MODEL])
  ]);
  const audios=new Map(audio.map(x=>[x.seq,x]));
  const valid=clean.filter(x=>{
   const a=audios.get(x.seq);
   return a&&a.status==='processed'&&x.start_ms>=Number(a.start_ms)-300&&x.end_ms<=Number(a.end_ms)+300;
  });
  if(ready.some(x=>!valid.includes(x)))return respond(res,409,{error:'Uno o más tramos todavía no están procesados o no coinciden con su tiempo STT'});
  const refByPerson=new Map();
  for(const r of referenceRows){
   const v=normalize(r.embedding);if(!v)continue;
   if(!refByPerson.has(r.person_name))refByPerson.set(r.person_name,{party:r.party,vectors:[]});
   refByPerson.get(r.person_name).vectors.push(v);
  }
  if(refByPerson.size<2)return respond(res,409,{error:'Faltan referencias de candidatos'});
  const {proposed,summaries}=classify(valid.sort((a,b)=>a.start_ms-b.start_ms),refByPerson);
  const mature=proposed.filter(x=>keys.has(x.seq+':'+x.start_ms+':'+x.end_ms));
  if(mature.length!==keys.size)return respond(res,409,{error:'No se han clasificado todos los tramos maduros'});
  const selected=mature.map(x=>({...x,method:METHOD}));
  const rows=await sql.query(`
   WITH src AS (
    SELECT * FROM jsonb_to_recordset($2::jsonb) AS s(
     seq integer,start_ms integer,end_ms integer,person_name text,party text,
     candidate_name text,candidate_party text,decision text,
     score numeric,second_score numeric,threshold numeric,method text)
   ), matches AS (
    INSERT INTO voice_match_events
    (debate_id,seq,start_ms,end_ms,person_name,party,score,second_score,threshold,method,decision,candidate_name,candidate_party)
    SELECT $1::uuid,s.seq,s.start_ms,s.end_ms,s.person_name,s.party,s.score,s.second_score,
      s.threshold,s.method,s.decision,s.candidate_name,s.candidate_party
    FROM src s
    JOIN audio_segments a ON a.debate_id=$1::uuid AND a.seq=s.seq
     AND a.status='processed' AND s.start_ms>=a.start_ms-300 AND s.end_ms<=a.end_ms+300
    ON CONFLICT DO NOTHING
    RETURNING seq,start_ms,end_ms,person_name,party,score,decision
   ), attributed AS (
    UPDATE claims c SET speaker=m.person_name,party=m.party,
     speaker_origin='voice_embedding',speaker_model=$3,voice_similarity=m.score
    FROM matches m
    WHERE m.decision='matched' AND m.person_name IS NOT NULL
     AND c.debate_id=$1::uuid AND c.source_type='audio_scribe'
     AND c.speaker_origin='unknown'
     AND c.speaker ILIKE '%(fragmento '||m.seq::text||')%'
     AND c.start_ms<=m.end_ms AND c.end_ms>=m.start_ms
     AND c.end_ms>c.start_ms
     AND (LEAST(c.end_ms,m.end_ms)-GREATEST(c.start_ms,m.start_ms))::numeric/
          GREATEST(1,c.end_ms-c.start_ms)::numeric>=0.80
    RETURNING c.id
   )
   SELECT (SELECT count(*)::int FROM matches) AS saved,
    (SELECT count(*)::int FROM matches WHERE decision='matched') AS recognized,
    (SELECT count(*)::int FROM attributed) AS claims_changed`,
   [id,JSON.stringify(selected),MODEL+':delay-5m']);
  const result=rows[0]||{};
  return respond(res,200,{ok:true,method:METHOD,delay_minutes:5,
   input:clean.length,matured:mature.length,groups:summaries.length,
   saved:result.saved||0,recognized:result.recognized||0,claims_changed:result.claims_changed||0,
   nogueras:summaries.filter(x=>x.proposed==='Míriam Nogueras'),
   summary:summaries.slice(0,15)});
 }catch(err){return respond(res,500,{error:'Falló la segunda pasada CAM++',detail:String(err?.message||err).slice(0,220)})}
}
