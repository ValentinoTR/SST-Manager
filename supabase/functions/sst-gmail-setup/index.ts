import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.3';
import { digest, randomToken, encryptCredential } from '../_shared/gmail-credentials.mjs';

const env=(key:string)=>Deno.env.get(key)||'';
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const sender='educornejoperea28@gmail.com';
const callback=env('SUPABASE_URL')+'/functions/v1/sst-gmail-setup/callback';
const cookieName='sst_gmail_setup';
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const plain=(message:string,status=200)=>new Response(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
async function row(query:any){const {data,error}=await query;if(error)throw new Error('storage');return data;}
export async function setup(req:Request){
 if(req.method!=='GET')return plain('Método no permitido.',405);
 if(!env('GMAIL_CLIENT_ID')||!env('GMAIL_CLIENT_SECRET'))return plain('Falta configurar Gmail en el servidor.',503);
 const url=new URL(req.url);
 try{
  if(url.pathname.endsWith('/start')){
   const ticket=url.searchParams.get('ticket')||'';
   if(!/^[A-Za-z0-9_-]{43}$/.test(ticket))return plain('Enlace inválido o vencido.',403);
   const state=randomToken(),cookie=randomToken(),nonce=randomToken(),verifier=randomToken();
   const session=await row(db.from('sst_gmail_setup_sessions').update({status:'authorizing',state,cookie_hash:await digest(cookie),nonce,pkce_verifier:verifier}).eq('ticket_hash',await digest(ticket)).eq('status','prepared').gt('expires_at',new Date().toISOString()).select('id').maybeSingle());
   if(!session)return plain('Enlace inválido, utilizado o vencido.',403);
   const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
   auth.search=new URLSearchParams({client_id:env('GMAIL_CLIENT_ID'),redirect_uri:callback,response_type:'code',scope:'openid email https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent',login_hint:sender,state,nonce,code_challenge:(await digest(verifier)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),code_challenge_method:'S256'}).toString();
   return new Response(null,{status:302,headers:{Location:auth.href,'Set-Cookie':`${cookieName}=${cookie}; Path=/functions/v1/sst-gmail-setup; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  if(!url.pathname.endsWith('/callback'))return plain('No encontrado.',404);
  const state=url.searchParams.get('state')||'',cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  if(!state||!cookie)return plain('La sesión de autorización no es válida. Solicita otro enlace.',403);
  const session=await row(db.from('sst_gmail_setup_sessions').update({status:'exchanging'}).eq('state',state).eq('cookie_hash',await digest(cookie)).eq('status','authorizing').gt('expires_at',new Date().toISOString()).select('id,nonce,pkce_verifier').maybeSingle());
  if(!session)return plain('La sesión venció o ya se utilizó.',403);
  try{
   const code=url.searchParams.get('code');if(!code||url.searchParams.has('error'))throw new Error('denied');
   const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env('GMAIL_CLIENT_ID'),client_secret:env('GMAIL_CLIENT_SECRET'),code,code_verifier:session.pkce_verifier,redirect_uri:callback,grant_type:'authorization_code'}),signal:AbortSignal.timeout(20000)});
   if(!result.ok)throw new Error('exchange');
   const tokens=await result.json();
   const {payload}=await jwtVerify(tokens.id_token,jwks,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env('GMAIL_CLIENT_ID'),algorithms:['RS256']});
   if(payload.nonce!==session.nonce||payload.email!==sender||payload.email_verified!==true||!tokens.refresh_token)throw new Error('identity');
   if(!String(tokens.scope||'').split(' ').includes('https://www.googleapis.com/auth/gmail.send'))throw new Error('scope');
   await row(db.from('sst_gmail_connection').upsert({singleton:true,email:sender,...await encryptCredential(tokens.refresh_token,env('GMAIL_CLIENT_SECRET')),connected_at:new Date().toISOString()}));
   await row(db.from('sst_gmail_setup_sessions').update({status:'completed',pkce_verifier:null,cookie_hash:null,nonce:null}).eq('id',session.id));
   const response=plain('Gmail conectado correctamente a SST-Manager. Los reportes se enviarán desde '+sender+'. Puedes cerrar esta pestaña.');
   response.headers.set('Set-Cookie',`${cookieName}=; Path=/functions/v1/sst-gmail-setup; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return response;
  }catch{
   await row(db.from('sst_gmail_setup_sessions').update({status:'failed',pkce_verifier:null,cookie_hash:null,nonce:null}).eq('id',session.id));
   return plain('No se completó la conexión de Gmail. Verifica la cuenta y solicita un nuevo enlace.',400);
  }
 }catch{return plain('No se pudo completar la configuración. Ninguna credencial se muestra en esta página.',500);}
}
Deno.serve(setup);
