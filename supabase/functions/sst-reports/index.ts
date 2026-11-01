import { createClient } from '@supabase/supabase-js';
import { createReport, createMailTest } from './pdf.mjs';
import { decryptCredential } from '../_shared/gmail-credentials.mjs';

const env=(key:string)=>Deno.env.get(key)||'';
const origin=env('APP_ORIGIN')||'https://valentinotr.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
async function value(query:PromiseLike<any>){const {data,error}=await query;if(error)throw new Error('Error de almacenamiento o base de datos.');return data;}
const base64=(bytes:Uint8Array)=>{let s='';for(let n=0;n<bytes.length;n+=8192)s+=String.fromCharCode(...bytes.subarray(n,n+8192));return btoa(s);};
async function gmailToken(){
 if(!env('GMAIL_CLIENT_ID')||!env('GMAIL_CLIENT_SECRET'))throw new Error('Falta autorizar Gmail en los secretos del servidor.');
 const connection=await value(db.from('sst_gmail_connection').select('email,iv,ciphertext').eq('singleton',true).maybeSingle());
 const refresh=connection?await decryptCredential(connection,env('GMAIL_CLIENT_SECRET')):env('GMAIL_REFRESH_TOKEN');
 if(!refresh)throw new Error('Falta autorizar Gmail en los secretos del servidor.');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env('GMAIL_CLIENT_ID'),client_secret:env('GMAIL_CLIENT_SECRET'),refresh_token:refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error('La autorización de Gmail requiere revisión.');const data=await r.json();if(!data.access_token)throw new Error('Gmail no devolvió una autorización válida.');return data.access_token;
}
class UncertainSend extends Error{}
async function sendGmail(job:any,pdf:Uint8Array,token:string){
 const safeEmail=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
 if(!safeEmail.test(job.recipient)||job.sender!=='educornejoperea28@gmail.com')throw new Error('Configuración de correo inválida.');
 if(pdf.length>18000000)throw new Error('PDF demasiado grande para Gmail; descárgalo y reduce las fotografías en una corrección.');
 const boundary='sst_'+job.id,encoded=base64(pdf).match(/.{1,76}/g)?.join('\r\n')||'';
 const mail=[`From: SST Control <${job.sender}>`,`To: ${job.recipient}`,`Subject: ${job.test?'SST-Manager - PRUEBA TECNICA DE CORREO':'SST - reporte '+job.document_id+' v'+job.revision}`,`Message-ID: <sst-${job.id}@sst-manager.local>`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(new TextEncoder().encode(job.test?'Prueba técnica de la conexión de correo de SST-Manager. El PDF adjunto no es un registro de inspección ni de charla y no contiene datos de trabajadores.':'Se adjunta el reporte de seguridad registrado en SST-Manager. Incluye resultados conformes y observaciones. Consulte el historial para verificar correcciones posteriores.')),`--${boundary}`,'Content-Type: application/pdf',`Content-Disposition: attachment; filename="SST-${job.document_id}-v${job.revision}.pdf"`,'Content-Transfer-Encoding: base64','',encoded,`--${boundary}--`,''].join('\r\n');
 let r:Response;
 try{r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw:base64(new TextEncoder().encode(mail)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}),signal:AbortSignal.timeout(30000)});}catch{throw new UncertainSend('No se pudo confirmar el envío. Verificar en Gmail antes de reenviar.');}
 if(r.status>=500)throw new UncertainSend('Gmail no confirmó el resultado. Verificar antes de reenviar.');
 if(!r.ok)throw new Error(`Gmail rechazó el envío (HTTP ${r.status}). Revisar autorización o cuota.`);
 try{const data=await r.json();if(!data.id)throw new Error();return data.id;}catch{throw new UncertainSend('Respuesta de envío sin confirmación. Verificar en Gmail.');}
}
async function processJob(job:any){
 let pdfPath=job.pdf_path,providerId:string|null=null;
 try{
  let bytes:Uint8Array;
  if(pdfPath){const blob=await value(db.storage.from('sst-safety').download(pdfPath));bytes=new Uint8Array(await blob.arrayBuffer());}
  else{
   const version=await value(db.from('sst_document_versions').select('*').eq('document_id',job.document_id).eq('revision',job.revision).eq('user_id',job.user_id).single());
   const defects=version.kind==='inspection'?await value(db.from('sst_critical_defects').select('*').eq('user_id',job.user_id).eq('vehicle_id',version.payload.vehicleId)):[];
   bytes=await createReport(version,defects,async(path:string)=>{if(!path.startsWith(job.user_id+'/evidence/'))throw new Error('Ruta de evidencia inválida.');const blob=await value(db.storage.from('sst-safety').download(path));return new Uint8Array(await blob.arrayBuffer());});
   pdfPath=`${job.user_id}/reports/${job.document_id}/v${job.revision}.pdf`;
   await value(db.storage.from('sst-safety').upload(pdfPath,bytes,{contentType:'application/pdf',upsert:true}));
   await value(db.from('sst_report_jobs').update({pdf_path:pdfPath}).eq('id',job.id));
  }
  const token=await gmailToken();providerId=await sendGmail(job,bytes,token);
  await value(db.from('sst_report_jobs').update({status:'sent',pdf_path:pdfPath,sent_at:new Date().toISOString(),provider_id:providerId,error:null}).eq('id',job.id));
  return {id:job.id,status:'sent'};
 }catch(error){
  const uncertain=error instanceof UncertainSend||providerId!==null,status=uncertain?'uncertain':'retry';
  const safeError=uncertain?'Verificar envío en Gmail antes de reenviar.':error instanceof Error?error.message:'No se pudo generar o enviar el reporte.';
  await value(db.from('sst_report_jobs').update({status,pdf_path:pdfPath,error:safeError.slice(0,240),available_at:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(job.attempts,6))).toISOString()}).eq('id',job.id));
  return {id:job.id,status};
 }
}
Deno.serve(async(req:Request)=>{
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return response({error:'Origen no permitido.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return response({error:'Método no permitido.'},405);
 try{
  const bearer=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
  // Scheduler secret is generated/stored inside PostgreSQL and never exposed to clients.
  let owner:string|null=null;
  const scheduler=await value(db.rpc('sst_is_report_worker',{candidate:bearer}));
  // Administrative smoke test: fixed recipient/content; no operational records created.
  if(new URL(req.url).pathname.endsWith('/test')){
   if(!scheduler)return response({error:'Prueba reservada al administrador del servidor.'},403);
   const id=crypto.randomUUID();
   const providerId=await sendGmail({id,sender:'educornejoperea28@gmail.com',recipient:'seguridad@reliper.pe',document_id:'PRUEBA-CONEXION',revision:1,test:true},await createMailTest(),await gmailToken());
   return response({status:'sent',provider_id:providerId,recipient:'seguridad@reliper.pe',test:true});
  }
  if(!scheduler){
   const {data,error}=await db.auth.getUser(bearer);if(error||!data.user)return response({error:'Sesión inválida.'},401);owner=data.user.id;
  }
  const processed=[];for(let i=0;i<2;i++){const jobs=await value(db.rpc('sst_claim_report',{owner_filter:owner}));if(!jobs?.length)break;processed.push(await processJob(jobs[0]));}
  return response({processed});
 }catch{return response({error:'No se pudo procesar la cola. El registro permanece guardado.'},500);}
});
