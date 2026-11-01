import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {encryptCredential,decryptCredential,digest,randomToken} from '../supabase/functions/_shared/gmail-credentials.mjs';
test('Credenciales cifradas: recuperación, manipulación y clave incorrecta',async()=>{
 const row=await encryptCredential('refresh-test-private','server-key');
 assert.equal(await decryptCredential(row,'server-key'),'refresh-test-private');
 assert.doesNotMatch(JSON.stringify(row),/refresh-test-private/);
 await assert.rejects(decryptCredential(row,'other-key'));
 await assert.rejects(decryptCredential({...row,ciphertext:'AAAA'+row.ciphertext.slice(4)},'server-key'));
 assert.match(randomToken(),/^[A-Za-z0-9_-]{43}$/);
});
test('OAuth: ticket de un uso, cookie segura, PKCE y callback ajeno rechazado',async()=>{
 let consumed=false,filters=[];
 const query={update(){filters=[];return this;},eq(k,v){filters.push([k,v]);return this;},gt(){return this;},select(){return this;},async maybeSingle(){
  if(filters.some(([k])=>k==='ticket_hash')){if(consumed)return {data:null};consumed=true;return {data:{id:'one'}};}return {data:null};
 }};
 const ctx=vm.createContext({Response,Request,URL,URLSearchParams,AbortSignal,digest,randomToken,encryptCredential,
 createRemoteJWKSet:()=>null,jwtVerify:()=>{throw Error('unreachable');},createClient:()=>({from:()=>query}),
 Deno:{env:{get:k=>({SUPABASE_URL:'https://project.supabase.co',GMAIL_CLIENT_ID:'client',GMAIL_CLIENT_SECRET:'secret'})[k]},serve:h=>ctx.handler=h}});
 const source=(await readFile(new URL('../supabase/functions/sst-gmail-setup/index.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function setup','async function setup');
 vm.runInContext(stripTypeScriptTypes(source),ctx);
 assert.equal((await ctx.handler(new Request('https://project.supabase.co/start?ticket=bad'))).status,403);
 const start=new Request('https://project.supabase.co/start?ticket='+randomToken());
 const result=await ctx.handler(start);assert.equal(result.status,302);
 assert.match(result.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 const redirect=new URL(result.headers.get('location'));assert.equal(redirect.origin,'https://accounts.google.com');assert.equal(redirect.searchParams.get('code_challenge_method'),'S256');assert.equal(redirect.searchParams.get('login_hint'),'educornejoperea28@gmail.com');
 assert.equal((await ctx.handler(start)).status,403);
 assert.equal((await ctx.handler(new Request('https://project.supabase.co/callback?state=unknown&code=code',{headers:{cookie:'sst_gmail_setup=other'}}))).status,403);
});
test('Tablas OAuth inaccesibles a usuarios y accesibles solo a service_role',async()=>{
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(await readFile(new URL('../supabase/migrations/20261101014348_gmail_direct_connection.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['sst_gmail_connection','sst_gmail_setup_sessions'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');assert.equal((await db.query('select * from public.sst_gmail_connection')).rows.length,0);await db.close();
});
test('Callback verifica identidad, cifra token y nunca lo devuelve al navegador',async()=>{
 for(const email of ['educornejoperea28@gmail.com','other@example.test']){
  let saved=null,completed=null;
  const ctx=vm.createContext({Response,Request,URL,URLSearchParams,AbortSignal,digest,randomToken,encryptCredential,
   createRemoteJWKSet:()=>null,jwtVerify:async(token,key,options)=>{assert.equal(options.audience,'client');assert.deepEqual(Array.from(options.algorithms),['RS256']);return {payload:{nonce:'nonce',email,email_verified:true}};},
   fetch:async()=>new Response(JSON.stringify({id_token:'signed-test',refresh_token:'private-refresh',scope:'https://www.googleapis.com/auth/gmail.send'})),
   createClient:()=>({from:table=>{const q={update(value){completed=value.status;return q;},eq(){return q;},gt(){return q;},select(){return q;},async maybeSingle(){return {data:{id:'session',nonce:'nonce',pkce_verifier:'verifier'}};},async upsert(value){saved=value;return {data:null};},then(resolve){resolve({data:null});}};return q;}}),
   Deno:{env:{get:k=>({SUPABASE_URL:'https://project.supabase.co',GMAIL_CLIENT_ID:'client',GMAIL_CLIENT_SECRET:'secret'})[k]},serve:h=>ctx.handler=h}});
  const source=(await readFile(new URL('../supabase/functions/sst-gmail-setup/index.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function setup','async function setup');
  vm.runInContext(stripTypeScriptTypes(source),ctx);
  const result=await ctx.handler(new Request('https://project.supabase.co/callback?state=state&code=code',{headers:{cookie:'sst_gmail_setup=cookie'}}));
  assert.doesNotMatch(await result.text(),/private-refresh|signed-test/);
  if(email.startsWith('other')){assert.equal(result.status,400);assert.equal(saved,null);assert.equal(completed,'failed');}
  else{assert.equal(result.status,200);assert.equal(await decryptCredential(saved,'secret'),'private-refresh');assert.equal(completed,'completed');}
 }
});
