import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {createReport,createMailTest} from '../supabase/functions/sst-reports/pdf.mjs';
import C from '../safety-core.js';
const version={document_id:'30000000-0000-4000-8000-000000000001',revision:1,actor:'inspector@example.test',reason:'Registro de prueba',recorded_at:'2026-10-31T12:00:00Z'};
test('PDF técnico de correo es independiente de los registros SST',async()=>{
 const bytes=await createMailTest(),pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);assert.match(pdf.getTitle(),/Prueba técnica/);await mkdir('tmp/pdfs',{recursive:true});await writeFile('tmp/pdfs/correo-tecnico.pdf',bytes);
});
test('PDF de inspección con fotografía, texto extenso y falla crítica',async()=>{
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'));
 const bytes=await createReport({...version,kind:'inspection',payload:{vehicle:{plate:'ABC123',type:'Camioneta',brand:'Marca',model:'Modelo'},items:C.checklist.map((c,n)=>({...c,status:n===1?'No conforme':'Conforme',note:n===1?'Frenos sin presión. Reparar y verificar antes de operar. '.repeat(8):'',photo:n===1?'test/photo':null})),notes:'Observación de seguridad. '.repeat(40)}},[{item_id:'brakes',note:'Frenos sin presión',document_id:version.document_id,resolved_at:null}],async()=>png);
 const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>=2);assert.equal(pdf.getTitle(),'Inspección de vehículos');await mkdir('tmp/pdfs',{recursive:true});await writeFile('tmp/pdfs/inspeccion-qa.pdf',bytes);
});
test('PDF de charla conserva 20 convocados, 18 presentes, firmas y ausentes',async()=>{
 const bytes=await createReport({...version,kind:'talk',payload:{date:'2026-10-31',time:'07:00',topic:'Bloqueo de energías y prevención de accidentes',duration:5,instructor:'Expositor de prueba',unit:'Unidad minera de prueba',area:'Mantenimiento',content:'Verificar aislamiento de energías y aplicar PETS. '.repeat(15),participants:Array.from({length:20},(_,n)=>({id:String(n),name:'Trabajador de prueba '+(n+1),dni:String(10000000+n),role:'Técnico de mantenimiento',area:'Taller',present:n<18,evidence:n<18?'Evaluación individual de comprensión, referencia EV-'+n:''}))}});
 const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>=3);await mkdir('tmp/pdfs',{recursive:true});await writeFile('tmp/pdfs/charla-qa.pdf',bytes);
});
