import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import C from '../safety-core.js';

const user='10000000-0000-4000-8000-000000000001';
const vehicle='20000000-0000-4000-8000-000000000001';
const inspection=()=>({vehicleId:vehicle,items:C.checklist.map(c=>({...c,status:'Conforme',note:'',photo:null}))});
const migration=await readFile(new URL('../supabase/migrations/20261101203143_safety_critical_applicability.sql',import.meta.url),'utf8');

test('Controles IPERC adicionales: no aplica exige retirar la condición crítica o verificar el componente',()=>{
 const p=inspection(),item=p.items.find(i=>i.id==='windows');
 item.status='No aplica';item.note='Justificación de prueba';
 assert.doesNotThrow(()=>C.validate('inspection',p));
 item.critical=true;
 assert.throws(()=>C.validate('inspection',p),/críticos requieren verificación/);
 item.status='No conforme';
 assert.doesNotThrow(()=>C.validate('inspection',p));
 assert.equal(C.aptitude(p),'No apto');
 item.status='Conforme';
 assert.doesNotThrow(()=>C.validate('inspection',p));
 assert.equal(C.aptitude(p),'Apto');
});

test('PostgreSQL: validación adicional preserva filas y versiones antiguas y rechaza escrituras que omitan el frontend',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create schema storage;
   create table auth.users(id uuid primary key);insert into auth.users values('${user}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select '{"email":"prueba@example.test"}'::jsonb$$;
   grant usage on schema auth,storage,public to authenticated,anon,service_role;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
   create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
   grant select,insert,update,delete on storage.objects to authenticated;
   create table public.sst_app_state(user_id uuid,payload jsonb);`);
  await db.exec(await readFile(new URL('../supabase-modules.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase-safety-history.sql',import.meta.url),'utf8'));
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',false);set role authenticated;`);
  await db.query('insert into public.sst_vehicles(id,plate,type,brand,model) values($1,$2,$3,$4,$5)',[vehicle,'ABC123','Camioneta','Marca','Modelo']);
  const oldId='30000000-0000-4000-8000-000000000001',newId='30000000-0000-4000-8000-000000000002';
  const save=(id,p,revision=0)=>db.query('select * from public.sst_save_document($1,$2,$3,$4,$5)',[id,'inspection',JSON.stringify(p),revision,revision?'Corrección verificada':'Registro inicial']);
  const old=inspection();Object.assign(old.items.find(i=>i.id==='windows'),{critical:true,status:'No aplica',note:'Registro previo a la corrección de validación'});
  await save(oldId,old);
  const before=(await db.query('select payload from public.sst_document_versions where document_id=$1',[oldId])).rows[0].payload;
  await db.exec('reset role');await db.exec(migration);
  const privilege=(await db.query("select has_function_privilege('authenticated','sst_private.validate_critical_applicability()','execute') as allowed, prosecdef from pg_proc where oid='sst_private.validate_critical_applicability()'::regprocedure")).rows[0];
  assert.equal(privilege.allowed,false);assert.equal(privilege.prosecdef,false);
  await db.exec('set role authenticated');
  assert.deepEqual((await db.query('select payload from public.sst_document_versions where document_id=$1',[oldId])).rows[0].payload,before);
  assert.deepEqual((await db.query('select payload from public.sst_documents where id=$1',[oldId])).rows[0].payload,before);
  await assert.rejects(save(newId,old),/críticos adicionales requieren verificación/);
  const forged=structuredClone(old);forged.items.find(i=>i.id==='windows').critical='true';
  await assert.rejects(save(newId,forged),/Indicador crítico inválido/);
  await assert.rejects(save(oldId,old,1),/críticos adicionales requieren verificación/);
  assert.equal((await db.query('select revision from public.sst_documents where id=$1',[oldId])).rows[0].revision,1);
  assert.equal((await db.query('select count(*)::int as n from public.sst_report_jobs')).rows[0].n,1,'failed saves do not enqueue duplicate reports');
  const verified=structuredClone(old);verified.items.find(i=>i.id==='windows').status='Conforme';await save(oldId,verified,1);
  const bad=inspection();Object.assign(bad.items.find(i=>i.id==='windows'),{critical:true,status:'No conforme',note:'Condición crítica según IPERC'});await save(newId,bad);
  await save(newId,inspection(),1);
  assert.equal((await db.query('select aptitude from public.sst_vehicle_status where id=$1',[vehicle])).rows[0].aptitude,'No apto','a healthy correction does not close the previous critical episode');
  assert.equal((await db.query('select count(*)::int as n from public.sst_critical_defects where resolved_at is null')).rows[0].n,1);
  const ordinary=inspection();Object.assign(ordinary.items.find(i=>i.id==='windows'),{status:'No aplica',note:'Justificación de control no crítico'});await save('30000000-0000-4000-8000-000000000003',ordinary);
  assert.deepEqual((await db.query('select payload from public.sst_document_versions where document_id=$1 and revision=1',[oldId])).rows[0].payload,before);
 } finally {await db.close();}
});
