import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:300};
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const rounds=['','', 'Comprobar literalmente sujeto, periodo, unidad y cifra; citar pasajes precisos.', 'Buscar omisiones, ambigüedades y diferencias de definiciones; intentar refutar la conclusión anterior.', 'Comparar fuentes independientes y valorar si la información aplica al momento de la afirmación.', 'Auditoría final escéptica: ¿existen pruebas directas suficientes o debe quedar sin resolver?'];
const min=(s,n=500)=>String(s||'').slice(0,n);
const trusted=['ine.es','boe.es','bde.es','europa.eu','eurostat.ec.europa.eu','ec.europa.eu','oecd.org','imf.org','worldbank.org','seg-social.es','hacienda.gob.es','congreso.es','senado.es','ai-ref.es','airef.es','funcas.es','datos.gob.es'];
function allowed(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&trusted.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))?u:null}catch{return null}}
function clean(html){return min(String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' '),4800)}
async function evidence(s){const u=allowed(s.url);if(!u)return null;try{const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(6000),headers:{accept:'text/html, text/plain'}});const type=r.headers.get('content-type')||'';if(!r.ok||!/text\/(html|plain)/i.test(type))return null;const body=await r.text();return {url:u.href,title:min(s.title,130),text:clean(body)}}catch{return null}}
async function ensure(sql){await sql.query(`CREATE TABLE IF NOT EXISTS evidence_rounds (
 claim_id uuid NOT NULL, debate_id uuid NOT NULL, round smallint NOT NULL,
 verdict text NOT NULL, confidence numeric NOT NULL DEFAULT 0, rationale text NOT NULL,
 citations jsonb NOT NULL DEFAULT '[]'::jsonb, model text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(claim_id,round)
)`)}
function result(res,code,data){res.setHeader('Cache-Control','no-store');return res.status(code).json(data)}
export default async function handler(req,res){
 if(!process.env.DATABASE_URL)return result(res,503,{error:'Base de datos no configurada'});
 if(!['GET','POST'].includes(req.method))return result(res,405,{error:'Método no admitido'});
 const id=String(req.method==='GET'?req.query.debate:req.body?.debate||'');
 if(!UUID.test(id))return result(res,400,{error:'Debate inválido'});
 if(req.method==='POST'&&!validOperator(req))return result(res,401,{error:'Se necesita sesión de operador'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  if(req.method==='GET'){
   try{const rows=await sql.query('SELECT claim_id,round,verdict,confidence,rationale,citations,created_at FROM evidence_rounds WHERE debate_id=$1 ORDER BY created_at DESC LIMIT 500',[id]);return result(res,200,{rounds:rows})}
   catch(e){if(/evidence_rounds|does not exist/i.test(String(e.message)))return result(res,200,{rounds:[]});throw e}
  }
  const key=String(req.headers['x-openrouter-key']||process.env.OPENROUTER_API_KEY||'').trim();
  if(!/^sk-or-[a-z0-9_-]{15,}$/i.test(key))return result(res,400,{error:'Necesitas tu clave de OpenRouter en consola'});
  const cid=String(req.body?.claim||'');if(!UUID.test(cid))return result(res,400,{error:'Afirmación inválida'});
  await ensure(sql);
  const rows=await sql.query('SELECT id,debate_id,start_ms,end_ms,speaker,quote,normalized,topic,state,verdict,rationale,sources FROM claims WHERE id=$1 AND debate_id=$2 LIMIT 1',[cid,id]);
  if(!rows.length)return result(res,404,{error:'Afirmación no encontrada'});
  const c=rows[0];if(c.state==='excluded')return result(res,422,{error:'Afirmación descartada'});
  const windowStart=Math.max(0,Number(c.start_ms||0)-45000),windowEnd=Number(c.end_ms||c.start_ms||0)+45000;
  const nearby=await sql.query('SELECT seq,start_ms,end_ms,transcript,speaker FROM audio_segments WHERE debate_id=$1 AND end_ms >= $2 AND start_ms <= $3 ORDER BY start_ms LIMIT 12',[id,windowStart,windowEnd]).catch(()=>[]);
  const context=nearby.map(x=>min(x.transcript,850)).filter(Boolean).join(' ');

  const previous=await sql.query('SELECT round,verdict,confidence,rationale,citations FROM evidence_rounds WHERE claim_id=$1 ORDER BY round',[cid]);
  const n=previous.length?Number(previous[previous.length-1].round)+1:2;
  if(n>5)return result(res,409,{error:'Agotadas las rondas (II–V)',rounds:previous});
  const raw=Array.isArray(c.sources)?c.sources:[];
  const sources=(await Promise.all(raw.slice(0,5).map(evidence))).filter(Boolean);
  const usable=[...new Set(sources.map(x=>new URL(x.url).hostname))];
  if(!sources.length)return result(res,200,{status:'evidence_missing',round:n,explanation:'No se han podido leer fuentes oficiales fiables. No se consume OpenRouter ni se inventa un resultado.'});
  const model=process.env.OPENROUTER_ROUND_MODEL||'openai/gpt-4.1-mini';
  const prompt={quote:c.quote,normalized:c.normalized,context_transcript:min(context,4500),subject:c.speaker,topic:c.topic,original_ai:{verdict:c.verdict,rationale:c.rationale},previous_rounds:previous.map(x=>({round:x.round,verdict:x.verdict,rationale:min(x.rationale,500)})),instruction:rounds[n],sources:sources.map(x=>({url:x.url,text:x.text}))};
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':'https://debate-monitor-live.vercel.app','X-Title':'DEBATE SIGNAL rounds'},body:JSON.stringify({model,temperature:0.1,max_tokens:950,response_format:{type:'json_object'},messages:[{role:'system',content:'Fact-checking conservador de una afirmación política. Solo utiliza el TEXTO de fuentes provisto. Usa context_transcript para reconstruir el significado de la frase sin atribuir palabras de otros hablantes. Si no hay sujeto, periodo o unidad claros, insufficient. No asumas que la cita transcrita esté completa ni que el sujeto esté identificado correctamente. No inventes hechos, URLs ni citas. Responde JSON válido con verdict: supported|contradicted|mixed|insufficient; confidence 0..1; rationale español máximo 550 caracteres; citations array de URLs proporcionadas que contengan evidencia DIRECTA. Si no hay prueba suficiente o falta contexto, verdict insufficient.'},{role:'user',content:JSON.stringify(prompt)}]})});
  const responseData=await response.json().catch(()=>({}));if(!response.ok) return result(res,502,{error:'OpenRouter respondió '+response.status,detail:min(responseData.error?.message,180)});
  const message=String(responseData.choices?.[0]?.message?.content||'').replace(/^```(?:json)?|\s*```$/g,'').trim();let answer;try{answer=JSON.parse(message)}catch{return result(res,502,{error:'La respuesta de IA no era JSON válido'})}
  const verdict=['supported','contradicted','mixed','insufficient'].includes(answer.verdict)?answer.verdict:'insufficient';
  let confidence=Math.max(0,Math.min(1,Number(answer.confidence)||0));
  const urls=new Set(sources.map(x=>x.url));
  const citations=(Array.isArray(answer.citations)?answer.citations:[]).filter(x=>typeof x==='string'&&urls.has(x)).slice(0,5);
  const independent=new Set(citations.map(x=>new URL(x).hostname)).size;
  const finalVerdict=(independent>=2&&confidence>=0.85)?verdict:'insufficient';
  if(finalVerdict==='insufficient')confidence=Math.min(confidence,0.79);
  const rationale=min(answer.rationale,600);
  const write=await sql.query('INSERT INTO evidence_rounds (claim_id,debate_id,round,verdict,confidence,rationale,citations,model) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT (claim_id,round) DO NOTHING RETURNING round',[cid,id,n,finalVerdict,confidence,rationale,JSON.stringify(citations),model]);
  if(!write.length)return result(res,409,{error:'La ronda se ha procesado en paralelo; recarga el estado'});
  return result(res,200,{round:n,verdict:finalVerdict,confidence,rationale,citations,evidence_sources:sources.length,independent_domains:usable.length,provisional:true,next_round:finalVerdict==='insufficient'&&n<5?n+1:null});
 }catch(e){return result(res,500,{error:'No se completó la evaluación de evidencias',detail:min(e.message,180)})}
}