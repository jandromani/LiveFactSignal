import {validOperator} from './operator-auth.js';
export const config={maxDuration:300};
const ROUTES=new Set(['live','scribe','scribe-v2','catalog','voice','voice-auto','supervisor','monitor']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Solo solicitudes autenticadas de operación'});
 if(!validOperator(req))return res.status(401).json({error:'Sesión de operador no autorizada. Utiliza tu enlace privado de activación.'});
 const route=String(req.query.route||'');
 if(!ROUTES.has(route))return res.status(404).json({error:'Endpoint de operador desconocido'});
 if(!process.env.APP_ADMIN_TOKEN)return res.status(503).json({error:'Autorización de servidor no configurada'});
 const query=new URLSearchParams();
 for(const [k,v] of Object.entries(req.query))if(k!=='route'&&/^[a-z_]{1,30}$/i.test(k))query.set(k,String(Array.isArray(v)?v[0]:v).slice(0,800));
 const upstream=new URL('https://debate-monitor-live.vercel.app/api/'+route);
 upstream.search=query.toString();
 const headers={'content-type':'application/json','x-admin-token':process.env.APP_ADMIN_TOKEN};
 const key=String(req.headers['x-openrouter-key']||'').trim();
 if(key&&key.startsWith('sk-or-')&&key.length<400)headers['x-openrouter-key']=key;
 try{
  const response=await fetch(upstream,{method:'POST',headers,body:JSON.stringify(req.body??{}),signal:AbortSignal.timeout(240000),redirect:'error'});
  const body=await response.text();
  res.status(response.status);
  res.setHeader('Content-Type',response.headers.get('content-type')?.includes('json')?'application/json; charset=utf-8':'text/plain; charset=utf-8');
  res.send(body);
 }catch(e){res.status(502).json({error:'La operación no pudo llegar al motor de debate',detail:String(e?.message||'').slice(0,160)})}
}
