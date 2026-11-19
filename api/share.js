import {neon} from '@neondatabase/serverless';
export const config={maxDuration:30};
const origin='https://debate-monitor-live.vercel.app';
const uuid=x=>/^[0-9a-f-]{36}$/i.test(String(x||''));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).end();
 let debate=String(req.query.debate||''),claim=String(req.query.claim||''),speaker=String(req.query.person||'').slice(0,80);
 let title='DEBATE / SIGNAL · El debate bajo la lupa',description='Observatorio electoral en directo. Afirmaciones, fuentes y contexto. Conclusiones automatizadas provisionales.';
 if(process.env.DATABASE_URL){
  try{
   const sql=neon(process.env.DATABASE_URL);
   if(uuid(claim)){
    const rows=await sql.query("SELECT c.quote,c.speaker,c.debate_id,d.title FROM claims c JOIN debates d ON d.id=c.debate_id LEFT JOIN debate_calendar cal ON cal.debate_id=d.id WHERE c.id=$1 AND c.state<>'excluded' AND (cal.debate_id IS NOT NULL OR d.id='5cd33d45-32a0-4116-a9ed-92b8312757c2'::uuid) LIMIT 1",[claim]);
    if(rows.length){debate=rows[0].debate_id;title='Afirmación de '+rows[0].speaker+' | DEBATE / SIGNAL';description=String(rows[0].quote).slice(0,240)}
   }else if(uuid(debate)){
    const r=await sql.query("SELECT d.title FROM debates d JOIN debate_calendar c ON c.debate_id=d.id WHERE d.id=$1",[debate]);
    if(r.length){title=(speaker?speaker+' · ':'')+r[0].title+' | DEBATE / SIGNAL';description='Explora las afirmaciones, fuentes y temas detectados en este debate.'}
   }
  }catch{}
 }
 const viewer=new URL('/observatorio.html',origin);
 if(uuid(debate))viewer.searchParams.set('debate',debate);
 if(speaker)viewer.searchParams.set('person',speaker);
 if(uuid(claim))viewer.hash='claim='+encodeURIComponent(claim);
 const canonical=new URL('/api/share',origin);
 if(uuid(claim))canonical.searchParams.set('claim',claim);
 else{if(uuid(debate))canonical.searchParams.set('debate',debate);if(speaker)canonical.searchParams.set('person',speaker)}
 const image=new URL('/api/og',origin);
 if(uuid(claim))image.searchParams.set('claim',claim);
 else{if(uuid(debate))image.searchParams.set('debate',debate);if(speaker)image.searchParams.set('person',speaker)}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=45');res.setHeader('Referrer-Policy','no-referrer');
 res.status(200).send('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta property="og:type" content="article"><meta property="og:site_name" content="DEBATE / SIGNAL"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'"><meta property="og:image" content="'+esc(image.href)+'"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="'+esc(canonical.href)+'"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+esc(title)+'"><meta name="twitter:description" content="'+esc(description)+'"><meta name="twitter:image" content="'+esc(image.href)+'"><meta http-equiv="refresh" content="0;url='+esc(viewer.href)+'"><link rel="canonical" href="'+esc(canonical.href)+'"><meta name="robots" content="index,follow"></head><body><p><a href="'+esc(viewer.href)+'">Ver ficha en DEBATE / SIGNAL</a></p><script>location.replace('+JSON.stringify(viewer.href).replace(/</g,'\\u003c')+')</script></body></html>');
}