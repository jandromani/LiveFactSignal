import {createPublicKey,verify as cryptoVerify} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
export const config={maxDuration:30};
const MODEL='sherpaw-campplus-zh-en-advanced@5fc23543';
const PERSONS=new Set(['Maribel Vaquero','Oskar Matute','Gabriel Rufián','Emilio Delgado','Míriam Nogueras','Ester Muñoz','Patxi López','Pepa Millán','Ada Colau','Alberto Núñez Feijóo','Pedro Sánchez','Santiago Abascal']);
const AUD='https://debate-monitor-live.vercel.app/api/voice-import-action';
const respond=(res,status,value)=>res.status(status).setHeader('Cache-Control','private,no-store').json(value);
const parse=s=>JSON.parse(Buffer.from(s,'base64url').toString('utf8'));
function similarity(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==192||b.length!==192)return -1;
 let dot=0,aa=0,bb=0;
 for(let i=0;i<192;i++){let x=+a[i],y=+b[i];if(!Number.isFinite(x)||!Number.isFinite(y))return -1;dot+=x*y;aa+=x*x;bb+=y*y}
 return aa>0&&bb>0?dot/Math.sqrt(aa*bb):-1;
}
async function authenticate(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
 if(token.length<200||token.length>8000)throw Error('No OIDC token');
 const p=token.split('.');if(p.length!==3)throw Error('Invalid OIDC format');
 const head=parse(p[0]),claims=parse(p[1]),now=Math.floor(Date.now()/1000);
 if(head.alg!=='RS256'||typeof head.kid!=='string')throw Error('Signature algorithm');
 if(claims.iss!=='https://token.actions.githubusercontent.com'||claims.aud!==AUD)throw Error('Issuer/audience');
 if(claims.repository!=='jandromani/LiveFactSignal'||String(claims.repository_id)!=='1464023668')throw Error('Repository');
 if(claims.ref!=='refs/heads/master'||claims.workflow_ref!=='jandromani/LiveFactSignal/.github/workflows/voiceprints-batch.yml@refs/heads/master')throw Error('Workflow');
 if(!['push','workflow_dispatch'].includes(claims.event_name))throw Error('Event');
 if(!Number.isFinite(claims.exp)||!Number.isFinite(claims.iat)||claims.exp<now||claims.iat>now+30||claims.exp-claims.iat>600)throw Error('Expired');
 const r=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('GitHub public keys inaccessible');
 const keys=(await r.json()).keys||[];
 const jwk=keys.find(x=>x.kid===head.kid&&x.kty==='RSA');
 if(!jwk)throw Error('Untrusted signing key');
 const pub=createPublicKey({key:jwk,format:'jwk'});
 if(!cryptoVerify('RSA-SHA256',Buffer.from(p[0]+'.'+p[1]),pub,Buffer.from(p[2],'base64url')))throw Error('Invalid signature');
 return claims;
}
export default async function handler(req,res){
 if(req.method!=='POST')return respond(res,405,{error:'POST required'});
 try{await authenticate(req)}catch(e){return respond(res,401,{error:'GitHub OIDC rejected',detail:String(e.message||e).slice(0,95)})}
 if(!process.env.DATABASE_URL)return respond(res,503,{error:'Neon not configured'});
 const b=req.body||{},name=String(b.person_name||''),v=b.embedding;
 if(!PERSONS.has(name)||b.model_id!==MODEL||!Array.isArray(v)||v.length!==192||v.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>10))return respond(res,400,{error:'Invalid person/model/embedding'});
 const start=Number(b.start_s),end=Number(b.end_s),duration=Number(b.duration_ms),rms=Number(b.rms),clip=Number(b.clipping);
 if(!Number.isInteger(duration)||duration<8000||duration>15000||!Number.isFinite(start)||end-start<8||end-start>15||start<0||end>18000)return respond(res,422,{error:'Invalid sample duration'});
 if(!Number.isFinite(rms)||rms<.004||rms>.85||!Number.isFinite(clip)||clip<0||clip>.01)return respond(res,422,{error:'Audio quality failed'});
 let u;try{u=new URL(b.source_url);if(u.protocol!=='https:')throw Error('Scheme')}catch{return respond(res,400,{error:'Invalid source URL'})}
 const hosts=new Set(['static.congreso.es','app.congreso.es','video4.europapress.net','www.europapress.tv','upload.wikimedia.org','commons.wikimedia.org']);
 if(!hosts.has(u.hostname)||String(b.source_url).length>1500)return respond(res,403,{error:'Source domain not authorized'});
 if(b.publisher_speaker_confirmed!==true||!String(b.publisher_label||'').trim())return respond(res,422,{error:'Official source must explicitly attribute the speaker'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const refs=await sql.query("SELECT person_name,embedding,source_url,source_segment_start_s FROM voice_reference_library WHERE person_name=ANY($1::text[]) AND model_id=$2 AND quality_status IN ('source-labeled','operator-reviewed') LIMIT 200",[[...PERSONS],MODEL]);
  const own=refs.filter(x=>x.person_name===name).map(x=>({score:similarity(v,x.embedding),start:+x.source_segment_start_s,url:x.source_url})).sort((a,b)=>b.score-a.score);
  const other=Math.max(-1,...refs.filter(x=>x.person_name!==name).map(x=>similarity(v,x.embedding)));
  if(own.length<2)return respond(res,409,{error:'No seed references'});
  if(own[0].score<.57||own[0].score-other<.22)return respond(res,422,{error:'Acoustic validation failed',own:+own[0].score.toFixed(3),other:+other.toFixed(3)});
  if(own[0].score>.993||own.some(x=>x.url===u.href&&Math.abs(x.start-start)<11))return respond(res,409,{error:'Duplicate/nearby reference'});
  const total=await sql.query("SELECT count(*)::int n FROM voice_reference_library WHERE person_name=$1 AND model_id=$2 AND quality_status IN ('source-labeled','operator-reviewed')",[name,MODEL]);
  if(total[0].n>=10)return respond(res,409,{error:'Target already met',count:total[0].n});
  const rows=await sql.query(`
  WITH inserted AS (
   INSERT INTO voice_reference_library
    (person_name,model_id,embedding,source_url,source_type,source_segment_start_s,source_segment_end_s,duration_ms,verified_identity,verification_method,quality_status,rights_notes)
   VALUES ($1,$2,$3::jsonb,$4,'official-video',$5::numeric,$6::numeric,$7::integer,false,'publisher-intervention-label+cross-speaker-CAM++','source-labeled',$8)
   ON CONFLICT DO NOTHING
   RETURNING id,person_name,model_id,embedding,source_url,source_segment_start_s,duration_ms
  ), propagated AS (
   INSERT INTO voice_profiles (debate_id,person_name,party,model_id,embedding,duration_ms,source_type,source_reference,verified_by,quality_status)
   SELECT r.debate_id,v.person_name,r.party,v.model_id,v.embedding,v.duration_ms,
    'public-reference',v.source_url||'#t='||v.source_segment_start_s::text,
    'official-source+acoustic-check','source-labeled'
   FROM inserted v JOIN debate_roster r ON r.name=v.person_name AND r.role='candidate'
   ON CONFLICT DO NOTHING RETURNING id
  )
  SELECT (SELECT count(*)::int FROM inserted) AS added,(SELECT count(*)::int FROM propagated) AS copied`,
  [name,MODEL,JSON.stringify(v),u.href,start,end,duration,
   'Speaker source: '+String(b.publisher_label).slice(0,160)+'; sha256='+String(b.audio_sha256||'').slice(0,64)]);
  return respond(res,200,{ok:true,added:rows[0]?.added||0,copied_sessions:rows[0]?.copied||0,person_name:name,score:+own[0].score.toFixed(3),margin:+(own[0].score-other).toFixed(3)});
 }catch(e){return respond(res,500,{error:'Neon voice import failed',detail:String(e.message||e).slice(0,180)})}
}
