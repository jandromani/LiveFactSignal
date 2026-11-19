import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:30};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const columns=['timestamp','speaker','party','quote','normalized','topic','state','verdict','rationale','sources','confidence','speaker_origin','start_ms','end_ms','created_at','completed_at'];
function cell(value){
 const s=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
 // Disarm spreadsheet formulas when CSV files are opened in Excel/Sheets.
 const safe=/^[\s]*[=+\-@]/.test(s)?"'"+s:s;
 return '"'+safe.replace(/"/g,'""')+'"';
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store,max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Solo GET'});
 if(!validOperator(req))return res.status(401).json({error:'Necesitas la sesión privada de operador para exportar la información'});
 const id=String(req.query.debate||'');
 if(!UUID.test(id))return res.status(400).json({error:'ID de sesión inválido'});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'No hay conexión a Neon'});
 const fmt=req.query.format==='csv'?'csv':'json';
 try{
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql.query('SELECT id,title,event_date,mode,status,source_type,source_url,created_at,updated_at FROM debates WHERE id=$1',[id]);
  if(!rows.length)return res.status(404).json({error:'La sesión no existe'});
  const debate=rows[0];
  const [roster,segments,claims,turns,matches,rounds]=await Promise.all([
   sql.query('SELECT name,party,role,confirmed FROM debate_roster WHERE debate_id=$1 ORDER BY role,name',[id]),
   sql.query('SELECT seq,start_ms,end_ms,transcript,status,stt_model,claim_count,latency_ms,cost_usd,speaker,party,created_at FROM audio_segments WHERE debate_id=$1 ORDER BY seq,id LIMIT 2500',[id]),
   sql.query('SELECT id,start_ms,end_ms,speaker,party,quote,normalized,topic,priority,state,verdict,rationale,sources,confidence,model,latency_ms,attempts,created_at,started_at,completed_at,speaker_origin,speaker_confidence,checkability_status,voice_similarity FROM claims WHERE debate_id=$1 ORDER BY start_ms,created_at LIMIT 7000',[id]),
   sql.query('SELECT start_ms,end_ms,event_type,person_name,party,cue,confidence,created_at FROM speaker_events WHERE debate_id=$1 ORDER BY start_ms LIMIT 4000',[id]),
   sql.query('SELECT seq,start_ms,end_ms,person_name,party,score,second_score,threshold,method,decision,created_at FROM voice_match_events WHERE debate_id=$1 ORDER BY seq,start_ms LIMIT 4500',[id]),
   sql.query('SELECT claim_id,round,verdict,confidence,rationale,citations,model,created_at FROM evidence_rounds WHERE debate_id=$1 ORDER BY created_at,round LIMIT 10000',[id]).catch(()=>[])
  ]);
  const date=new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
  const slug=String(debate.title||'debate').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,50).replace(/-$/,'');
  const filename='livefactsignal-'+slug+'-'+date+'.'+fmt;
  res.setHeader('Content-Disposition','attachment; filename="'+filename+'"');
  if(fmt==='csv'){
   const data=[columns.join(',')];
   for(const claim of claims){
    const obj={timestamp:claim.start_ms,speaker:claim.speaker,party:claim.party,quote:claim.quote,normalized:claim.normalized,topic:claim.topic,state:claim.state,verdict:claim.state==='provisional'?claim.verdict:'',rationale:claim.rationale,sources:claim.sources,confidence:claim.confidence,speaker_origin:claim.speaker_origin,start_ms:claim.start_ms,end_ms:claim.end_ms,created_at:claim.created_at,completed_at:claim.completed_at};
    data.push(columns.map(c=>cell(obj[c])).join(','));
   }
   res.setHeader('Content-Type','text/csv; charset=utf-8');
   return res.status(200).send('\ufeff'+data.join('\r\n')+'\r\n');
  }
  const data={
   schema:'LiveFactSignal.session-export.v1',exported_at:new Date().toISOString(),
   notice:'Se exportan transcripciones, etiquetas de atribución y evaluaciones automatizadas, no grabaciones originales ni huellas biométricas. Los dictámenes IA son provisionales.',
   debate,roster,stats:{audio_segments:segments.length,claims:claims.length,turn_cues:turns.length,voice_matches:matches.length,review_rounds:rounds.length,provisional_claims:claims.filter(c=>c.state==='provisional').length},audio_segments:segments,claims,speaker_events:turns,voice_match_events:matches,evidence_rounds:rounds
  };
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(200).send(JSON.stringify(data,null,2));
 }catch(err){return res.status(500).json({error:'Error al preparar el archivo exportable',detail:String(err?.message||'').slice(0,180)})}
}
