const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../operaciones/workers-core.js');

const values = { name: 'Ana Pérez', dni: '00123456', role: 'Operadora', area: 'Taller', status: 'Activo' };
test('Preparar un trabajador conserva campos existentes sin mutar el estado anterior', () => {
  const original = { workers: [], medical: [{ id: 'm1', attachment: 'f1' }], insurance: [{ id: 's1' }], futureModule: { enabled: true }, goals: { trainingMonthly: 4 } };
  const next = W.prepare(original, values, 'worker-new', '2026-11-07');
  assert.equal(next.workers[0].id, 'worker-new'); assert.equal(next.workers[0].dni, '00123456');
  for (const key of ['medical', 'insurance', 'futureModule', 'goals']) assert.deepEqual(next[key], original[key]);
  assert.equal(original.workers.length, 0);
});

const Client = require('../operaciones/client-scope.js');
test('El navegador usa una sesión propia y el servidor mantiene las mismas protecciones', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  let options;
  const auth = {signOut() {}};
  const context = vm.createContext({supabase:{createClient(url,key,opts){options=opts;return{auth};}}});
  vm.runInContext(fs.readFileSync(require.resolve('../operaciones/client-scope.js'),'utf8'),context);
  context.supabase.createClient('https://example.test','public',{auth:{persistSession:true}});
  assert.equal(options.auth.storageKey,'reliper_operations_auth_v1');
  assert.equal(options.auth.persistSession,true);
  const original = fs.readFileSync(require.resolve('../supabase/functions/sst-reports/index.ts'),'utf8');
  const expected = original.replaceAll('sst_','ops_').replaceAll('sst-safety','ops-safety').replaceAll('sst-reports','ops-reports').replaceAll('ops_gmail_connection','sst_gmail_connection').replace("from './pdf.mjs'","from '../sst-reports/pdf.mjs'");
  const generated = fs.readFileSync(require.resolve('../supabase/functions/ops-reports/index.ts'),'utf8').replace(/^\/\/ Generated[^\n]*\n/,'');
  assert.equal(generated,expected,'separación del servidor sin cambiar autenticación, reintentos ni Gmail');
});
test('La entrada independiente usa exclusivamente tablas, funciones y evidencias ops', async () => {
  const calls = [], builder = {select() { return this; },eq(...args) {calls.push(['eq',...args]); return this;},then(resolve) {resolve({data:[]});}};
  const raw = {from: name => {calls.push(['table',name]);return builder;},rpc:(...args)=>calls.push(['rpc',...args]),auth:{async signOut(options){calls.push(['logout',options]);}, getSession(){return this===raw.auth;}},storage:{from:name=>calls.push(['bucket',name])},functions:{invoke:(...args)=>calls.push(['function',...args])}};
  const client = Client.scope(raw);
  for (const suffix of ['app_state','module_roles','vehicles','documents','document_versions','critical_defects','module_audit','mail_settings','report_jobs','vehicle_status']) await client.from('sst_'+suffix).select('*');
  for (const suffix of ['can_edit','save_document','resolve_defect','reliper_ready']) client.rpc('sst_'+suffix,{});
  client.storage.from('sst-safety'); client.functions.invoke('sst-reports',{body:{}});
  await client.from('sst_module_audit').select('*').eq('entity','sst_vehicles');
  assert.ok(calls.filter(c=>c[0]==='table').every(c=>c[1].startsWith('ops_')));
  assert.ok(calls.filter(c=>c[0]==='rpc').every(c=>c[1].startsWith('ops_')));
  assert.ok(calls.some(c=>c[0]==='bucket'&&c[1]==='ops-safety'));
  assert.ok(calls.some(c=>c[0]==='function'&&c[1]==='ops-reports'));
  assert.ok(calls.some(c=>c[0]==='eq'&&c[2]==='ops_vehicles'));
  assert.throws(()=>client.from('sst_gmail_connection'),/Recurso/);
  assert.throws(()=>client.storage.from('sst-attachments'),/evidencias/);
  assert.throws(()=>client.rpc('sst_claim_report',{}),/Recurso/);
  assert.throws(()=>client.functions.invoke('sst-gmail-setup'),/Función/);
  assert.equal(client.auth.getSession(),true);
  await client.auth.signOut({scope:'global'});
  assert.deepEqual(calls.at(-1),['logout',{scope:'local'}]);
});
test('Corregir el personal conserva su ID, fecha y demás campos existentes', () => {
  const original = { workers: [{ id: 'w1', ...values, joined: '2024-01-01', license: 'A-II', emergencyPhone: '999000111' }], findings: [{ id: 'h1' }] };
  const next = W.prepare(original, { ...values, name: 'Ana Pérez Corregida', status: 'Inactivo' }, 'w1', '2026-11-07');
  assert.equal(next.workers.length, 1); assert.equal(next.workers[0].joined, '2024-01-01');
  assert.equal(next.workers[0].license, 'A-II'); assert.equal(next.workers[0].emergencyPhone, '999000111');
  assert.equal(original.workers[0].name, values.name); assert.equal(next.workers[0].status, 'Inactivo');
});
test('No duplica DNI, admite la corrección propia y rechaza datos incompletos', () => {
  const state = { workers: [{ id: 'w1', ...values }] };
  assert.throws(() => W.prepare(state, values, 'w2', '2026-11-07'), /DNI ya está registrado/);
  assert.doesNotThrow(() => W.prepare(state, values, 'w1', '2026-11-07'));
  assert.throws(() => W.prepare(state, { ...values, dni: '123' }, 'w1'), /8 dígitos/);
  assert.throws(() => W.prepare(state, { ...values, area: ' ' }, 'w1'), /Completa/);
  assert.throws(() => W.prepare(state, { ...values, status: 'otro' }, 'w1'), /estado/);
  assert.throws(() => W.prepare(state, values, '<id>'), /Identificador/);
});
