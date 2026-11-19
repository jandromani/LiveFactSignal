import sharp from 'sharp';
import {neon} from '@neondatabase/serverless';
export const config={maxDuration:30};
const uuid=x=>/^[0-9a-f-]{36}$/i.test(String(x||''));
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function lines(s,max=37,count=4){
 const words=String(s||'').replace(/\s+/g,' ').trim().split(' '),out=[];let line='';
 for(const word of words){const test=line?line+' '+word:word;if(test.length>max&&line){out.push(line);line=word}else line=test;if(out.length>=count)break}
 if(line&&out.length<count)out.push(line);return out;
}
async function content(req){
 const claim=String(req.query.claim||''),debate=String(req.query.debate||'');
 if(uuid(claim)&&process.env.DATABASE_URL){
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql.query("SELECT c.quote,c.speaker,c.topic,d.title FROM claims c JOIN debates d ON d.id=c.debate_id LEFT JOIN debate_calendar b ON b.debate_id=d.id WHERE c.id=$1 AND c.state<>'excluded' AND (b.debate_id IS NOT NULL OR d.id='5cd33d45-32a0-4116-a9ed-92b8312757c2'::uuid) LIMIT 1",[claim]);
  if(rows.length)return {quote:rows[0].quote,speaker:rows[0].speaker,debate:rows[0].title,topic:rows[0].topic};
 }
 if(uuid(debate)&&process.env.DATABASE_URL){
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql.query("SELECT d.title FROM debates d JOIN debate_calendar b ON b.debate_id=d.id WHERE d.id=$1 LIMIT 1",[debate]);
  if(rows.length)return {quote:rows[0].title,speaker:String(req.query.person||'').slice(0,70),debate:'OBSERVATORIO EN DIRECTO',topic:'POLÍTICA ESPAÑOLA'};
 }
 return {quote:'El debate, bajo la lupa.',speaker:'',debate:'ANÁLISIS ELECTORAL EN DIRECTO',topic:'EVIDENCIAS · FUENTES · CONTEXTO'};
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).end();
 try{
  const data=await content(req);
  const title=lines(data.quote,38,3),font=title.length===1?61:title.length===2?54:49;
  const text=title.map((t,i)=>'<text x="80" y="'+(270+i*70)+'" font-size="'+font+'" font-weight="800" fill="#f1fbfb">'+escape(t)+'</text>').join('');
  const label=escape(String(data.speaker||'').slice(0,80));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0e3437"/><stop offset=".55" stop-color="#0a1925"/><stop offset="1" stop-color="#142b3e"/></linearGradient><radialGradient id="glow"><stop stop-color="#4bd3b1" stop-opacity=".18"/><stop offset="1" stop-color="#4bd3b1" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="url(#bg)"/><circle cx="1100" cy="100" r="480" fill="url(#glow)"/><g stroke="#75d9ba" stroke-opacity=".10">'+Array.from({length:14},(_,i)=>'<path d="M'+(i*100)+' 0 V630"/>').join('')+'</g><rect x="0" y="0" width="1200" height="11" fill="#79e7c8"/><rect x="76" y="108" width="58" height="58" rx="13" fill="#1c554d" stroke="#70d9b9"/><circle cx="105" cy="137" r="12" fill="#87f3d0"/><text x="154" y="149" font-size="35" font-weight="900" fill="#f0faf9" letter-spacing="4">DEBATE <tspan fill="#84eccb">/ SIGNAL</tspan></text><text x="80" y="208" font-size="19" letter-spacing="4" font-weight="700" fill="#84eccb">OBSERVATORIO ELECTORAL · ANÁLISIS CON FUENTES</text>'+text+'<rect x="80" y="506" width="1040" height="1" fill="#43756e"/><text x="80" y="549" font-size="21" font-weight="750" fill="#9de1d4">'+(label?label:'AFIRMACIONES · CONTEXTO · EVIDENCIAS')+'</text><text x="80" y="585" font-size="18" fill="#a7bbc3">debate-monitor-live.vercel.app</text><text x="1120" y="576" text-anchor="end" font-size="14" fill="#e9ca96">IA PROVISIONAL · NO VERIFICACIÓN EDITORIAL</text></svg>';
  const image=await sharp(Buffer.from(svg)).png({compressionLevel:9}).toBuffer();
  res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=600');res.setHeader('X-Content-Type-Options','nosniff');res.status(200).send(image);
 }catch(e){res.status(500).json({error:'No se pudo generar la tarjeta Open Graph'})}
}