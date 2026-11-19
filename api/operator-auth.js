import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
export const config={maxDuration:30};
const SECRET=()=>process.env.APP_ADMIN_TOKEN||'';
const lifetime=30*24*3600*1000;
const sign=payload=>crypto.createHmac('sha256',SECRET()).update(payload).digest('base64url');
function parseCookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(s=>{const i=s.indexOf('=');return i<0?[]:[s.slice(0,i).trim(),s.slice(i+1).trim()]}).filter(x=>x.length===2))}
export function validOperator(req){
 try{
  if(!SECRET())return false;
  const value=parseCookies(req).lfs_operator;
  if(!value)return false;
  const parts=value.split('.');if(parts.length!==4||parts[0]!=='v1')return false;
  const payload=parts.slice(0,3).join('.'),expected=sign(payload);
  if(parts[3].length!==expected.length||!crypto.timingSafeEqual(Buffer.from(parts[3]),Buffer.from(expected)))return false;
  const issued=Number(parts[1]);return Number.isFinite(issued)&&issued<Date.now()+300000&&issued>Date.now()-lifetime;
 }catch{return false}
}
function cookie(){const v='v1.'+Date.now()+'.'+crypto.randomBytes(12).toString('hex');return 'lfs_operator='+v+'.'+sign(v)+'; Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax'}
function ret(res,status,body){return res.status(status).setHeader('Cache-Control','no-store').setHeader('X-Content-Type-Options','nosniff').json(body)}
export default async function handler(req,res){
 const action=String(req.query.action||'status');
 if(req.method==='GET'&&action==='status')return ret(res,200,{authorized:validOperator(req),persistent:true,method:'httpOnly-session'});
 if(req.method!=='POST')return ret(res,405,{error:'Operación no disponible'});
 if(action==='logout'){res.setHeader('Set-Cookie','lfs_operator=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax');return ret(res,200,{authorized:false});}
 if(action!=='redeem')return ret(res,404,{error:'Acción desconocida'});
 const ticket=String(req.body?.ticket||'').trim();
 if(!/^[0-9a-f-]{36}$/i.test(ticket))return ret(res,400,{error:'Enlace de activación inválido'});
 if(!SECRET()||!process.env.DATABASE_URL)return ret(res,503,{error:'Autorización no configurada'});
 try{
  const hash=crypto.createHash('sha256').update(ticket).digest('hex');
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql.query("UPDATE operator_invites SET used_at=now() WHERE ticket_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING label",[hash]);
  if(!rows.length)return ret(res,401,{error:'Este enlace ha caducado o ya se utilizó.'});
  res.setHeader('Set-Cookie',cookie());
  return ret(res,200,{authorized:true,expires_in_days:30});
 }catch(e){return ret(res,500,{error:'No ha sido posible activar el acceso'})}
}
