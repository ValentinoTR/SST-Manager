import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('../supabase/functions/sst-reports/index.ts',import.meta.url),'utf8');
function runtime({secrets={},fetcher=async()=>new Response('{}'),rpc=async()=>({data:false}),auth=async()=>({data:{user:null},error:true})}={}){
 const context=vm.createContext({Response,Request,URL,URLSearchParams,TextEncoder,Uint8Array,AbortSignal,btoa,fetch:fetcher,Deno:{env:{get:key=>secrets[key]},serve:handler=>context.handler=handler},createClient:()=>({rpc,auth:{getUser:auth}})});
 const source=original.replace(/^import .*;\r?\n/gm,'');vm.runInContext(stripTypeScriptTypes(source)+'\nglobalThis.testAPI={sendGmail,gmailToken,UncertainSend};',context);return context;
}
const job={id:'one',recipient:'seguridad@reliper.pe',sender:'educornejoperea28@gmail.com',document_id:'doc',revision:1};
test('Envío Gmail incluye PDF adjunto, destinatario y remitente configurados',async()=>{
 let raw;const ctx=runtime({fetcher:async(url,opts)=>{assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.equal(opts.headers.Authorization,'Bearer secret-test');raw=JSON.parse(opts.body).raw;return new Response('{"id":"accepted"}');}});
 assert.equal(await ctx.testAPI.sendGmail(job,new Uint8Array([37,80,68,70]),'secret-test'),'accepted');
 const decoded=Buffer.from(raw,'base64url').toString();assert.match(decoded,/To: seguridad@reliper.pe/);assert.match(decoded,/From: SST Control <educornejoperea28@gmail.com>/);assert.match(decoded,/Content-Type: application\/pdf/);assert.doesNotMatch(decoded,/secret-test/);
});
test('Timeout al enviar queda incierto para evitar correos duplicados',async()=>{const ctx=runtime({fetcher:async()=>{throw new Error('network');}});await assert.rejects(ctx.testAPI.sendGmail(job,new Uint8Array([1]),'token'),error=>error instanceof ctx.testAPI.UncertainSend);});
test('Respuesta 500 de Gmail es incierta; rechazo 429 admite reintento',async()=>{
 let ctx=runtime({fetcher:async()=>new Response('{}',{status:500})});await assert.rejects(ctx.testAPI.sendGmail(job,new Uint8Array([1]),'token'),error=>error instanceof ctx.testAPI.UncertainSend);
 ctx=runtime({fetcher:async()=>new Response('{}',{status:429})});await assert.rejects(ctx.testAPI.sendGmail(job,new Uint8Array([1]),'token'),error=>!(error instanceof ctx.testAPI.UncertainSend));
});
test('Sin secretos no se intenta enviar desde Gmail',async()=>{let calls=0;const ctx=runtime({fetcher:async()=>{calls++;}});await assert.rejects(ctx.testAPI.gmailToken(),/Falta autorizar Gmail/);assert.equal(calls,0);});
test('Cabeceras no permiten inyección ni cambio del remitente autorizado',async()=>{const ctx=runtime();await assert.rejects(ctx.testAPI.sendGmail({...job,recipient:'test@example.test\r\nBcc: attacker@example.test'},new Uint8Array([1]),'token'),/inválida/);});
test('La función rechaza solicitudes anónimas y orígenes no autorizados',async()=>{const ctx=runtime();assert.equal((await ctx.handler(new Request('https://example.test',{method:'POST'}))).status,401);assert.equal((await ctx.handler(new Request('https://example.test',{method:'POST',headers:{Origin:'https://other.test'}}))).status,403);});
test('Ni usuarios autenticados ni anónimos pueden invocar la prueba administrativa',async()=>{
 let requests=0;const ctx=runtime({fetcher:async()=>{requests++;},auth:async()=>({data:{user:{id:'owner-one'}}})});
 assert.equal((await ctx.handler(new Request('https://example.test/test',{method:'POST',headers:{Authorization:'Bearer valid-user'}}))).status,403);assert.equal(requests,0);
});
test('JWT válido procesa solo la cola del propietario; secreto interno procesa cola general',async()=>{
 let owner;const ctx=runtime({rpc:async(name,args)=>{if(name==='sst_is_report_worker')return{data:args.candidate==='private-cron'};owner=args.owner_filter;return{data:[]};},auth:async()=>({data:{user:{id:'owner-one'}}})});
 assert.equal((await ctx.handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer valid-user'}}))).status,200);assert.equal(owner,'owner-one');
 await ctx.handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer private-cron'}}));assert.equal(owner,null);
});
