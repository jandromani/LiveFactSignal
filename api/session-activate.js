import {neon} from '@neondatabase/serverless';
import {validOperator} from './operator-auth.js';
export const config={maxDuration:30};
const ROOT='f3c2fd9b-5fa1-4818-a407-453f5cac4a34';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export default async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Solo POST'});
 if(!validOperator(req))return res.status(401).json({error:'Acceso de operador requerido'});
 const origin=String(req.headers.origin||'');
 if(origin){try{const u=new URL(origin);if(u.protocol!=='https:'||u.host!==String(req.headers.host||''))return res.status(403).json({error:'Origen no autorizado'});}catch{return res.status(403).json({error:'Origen inválido'})}}
 const id=String(req.body?.id||'');
 if(!UUID.test(id))return res.status(400).json({error:'Sesión inválida'});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Neon no disponible'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  const ok=await sql.query(`SELECT target.id FROM debates target JOIN debates base ON base.id=$1::uuid
   WHERE target.id=$2::uuid AND target.source_type='live'
     AND target.event_date IS NOT DISTINCT FROM base.event_date
     AND target.title LIKE base.title||'%'`,[ROOT,id]);
  if(!ok.length)return res.status(422).json({error:'La sesión no pertenece al cara a cara activo'});
  const rows=await sql.query(`
   INSERT INTO debate_reset_state(root_id,current_id,reset_count,changed_at)
   VALUES($1::uuid,$2::uuid,0,now())
   ON CONFLICT(root_id) DO UPDATE SET current_id=EXCLUDED.current_id,changed_at=now()
   RETURNING current_id,reset_count,changed_at`,[ROOT,id]);
  return res.status(200).json({ok:true,active_id:rows[0].current_id,reset_count:rows[0].reset_count,changed_at:rows[0].changed_at});
 }catch(e){return res.status(500).json({error:'No se pudo activar la sesión pública',detail:String(e.message||e).slice(0,140)})}
}