import {neon} from '@neondatabase/serverless';
export const config={maxDuration:30};
const valid=x=>/^[0-9a-f-]{36}$/i.test(String(x||''));
const stop=new Set('entre sobre bajo desde hasta por para con que los las una unos unas del al este esta estos estas ellos ellas como quien donde porque pero fueron serán tiene tienen sido fue eran está estar son hay no sí les sus ese esa esto año años gobierno partido país países españa datos cifras euro euros millones miles todos todas tanto también debe pueden pueden'.split(' '));
function tokens(s){return new Set(String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').split(' ').filter(x=>x.length>3&&!stop.has(x)).slice(0,100))}
function numerics(s){return new Set((String(s||'').match(/(?:\d+[.,]?)+/g)||[]).map(x=>x.replace(',','.')))}
function similarity(a,b){
 const A=tokens(a),B=tokens(b);if(A.size<3||B.size<3)return 0;
 const common=[...A].filter(x=>B.has(x)).length;
 if(common<3)return 0;
 const jac=common/(A.size+B.size-common);
 const aNum=numerics(a),bNum=numerics(b);
 const numericPenalty=aNum.size&&bNum.size&&![...aNum].some(x=>bNum.has(x))?.55:1;
 return jac*numericPenalty;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=60');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Solo lectura'});
 const claim=String(req.query.claim||'');
 if(!valid(claim))return res.status(400).json({error:'ID de afirmación inválido'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  const orig=await sql.query("SELECT c.id,c.debate_id,c.normalized,c.quote FROM claims c JOIN debates d ON d.id=c.debate_id LEFT JOIN debate_calendar b ON b.debate_id=d.id WHERE c.id=$1 AND c.state<>'excluded' AND (b.debate_id IS NOT NULL OR d.id='5cd33d45-32a0-4116-a9ed-92b8312757c2'::uuid) LIMIT 1",[claim]);
  if(!orig.length)return res.status(404).json({error:'Afirmación no publicada'});
  const history=await sql.query("SELECT c.id,c.debate_id,c.normalized,c.quote,c.speaker,c.verdict,c.state,d.title AS debate_title,d.event_date FROM claims c JOIN debates d ON d.id=c.debate_id LEFT JOIN debate_calendar b ON b.debate_id=d.id WHERE c.debate_id<>$1 AND c.state<>'excluded' AND (b.debate_id IS NOT NULL OR d.id='5cd33d45-32a0-4116-a9ed-92b8312757c2'::uuid) ORDER BY d.event_date DESC,c.created_at DESC LIMIT 1500",[orig[0].debate_id]);
  const matches=history.map(h=>({...h,score:similarity(orig[0].normalized||orig[0].quote,h.normalized||h.quote)})).filter(x=>x.score>=.43).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>({id:x.id,debate_id:x.debate_id,debate_title:x.debate_title,quote:String(x.quote||'').slice(0,400),speaker:x.speaker,topic_similarity:Number(x.score.toFixed(3)),date:x.event_date,verdict:x.state==='provisional'?x.verdict:null,provisional:true}));
  return res.status(200).json({claim_id:claim,matches,method:'overlap-léxico-y-control-de-cifras',note:'Coincidencias textuales aproximadas: NO demuestran que dos afirmaciones sean equivalentes ni que su veredicto sea transferible.'});
 }catch(e){return res.status(500).json({error:'No se pudo consultar el historial'})}
}