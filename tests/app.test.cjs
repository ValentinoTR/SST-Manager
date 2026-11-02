const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const M=require('../metrics.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function declaration(name){const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);if(!match)throw Error(name);const end=source.indexOf('\n}',match.index)+2;return source.slice(match.index,end);}
test('Eliminar un registro conserva otros registros y solicita guardar sin purgar archivos',()=>{
 const evidence={id:'f-1',name:'evidencia.pdf'},state={epp:[{id:'r-1',attachment:evidence},{id:'r-2'}],insurance:[{id:'s-1'}]},unlinked=[];let saves=0;
 const context=vm.createContext({state,SSTMetrics:M,dropAttachments:ids=>unlinked.push(...ids),saveState:()=>saves++,showToast:()=>{}});
 vm.runInContext(declaration('removeRecord'),context);vm.runInContext('removeRecord("epp","r-1","Eliminado")',context);
 assert.deepEqual(state.epp,[{id:'r-2'}]);assert.equal(state.insurance.length,1);assert.deepEqual(unlinked,['f-1']);assert.equal(saves,1);
});
test('Un adjunto que no se pudo guardar detiene el registro en lugar de perder la evidencia',async()=>{
 class File {constructor(){this.size=20;this.name='prueba.pdf';this.type='application/pdf';}}
 const context=vm.createContext({File,MAX_FILE_BYTES:10485760,createId:()=> 'new-file',console:{error(){}},window:{SSTCloud:{getUser:()=>({id:'a'}),isSignedIn:()=>true,attachmentCacheKey:()=> 'sst:a:new-file',uploadAttachment:async()=>{throw Error('red');}}}});
 vm.runInContext(declaration('storeAttachment'),context);
 await assert.rejects(vm.runInContext('storeAttachment(new File())',context),/El registro no se guardó/);
});
test('Cambiar de cuenta durante un adjunto no permite completar el formulario anterior',async()=>{
 let owner='a',resolve;const held=new Promise(done=>resolve=done);
 const context=vm.createContext({window:{SSTCloud:{getUser:()=>({id:owner})}},storeAttachment:()=>held});
 vm.runInContext(declaration('withAttachment'),context);const pending=vm.runInContext('withAttachment({attachment:{},workerId:"w-1"})',context);
 owner='b';resolve({id:'file-1'});await assert.rejects(pending,/sesión cambió/);
});
test('Las tablas antiguas usan el mismo cálculo seguro de vencimientos que el tablero',()=>{
 const context=vm.createContext({SSTMetrics:M,today:()=> '2026-11-01'});vm.runInContext(declaration('daysUntil')+'\n'+declaration('expirationState'),context);
 assert.equal(vm.runInContext('expirationState("2026-02-31").text',context),'Fecha inválida');
 assert.equal(vm.runInContext('expirationState("2026-10-31").text',context),'Vencido');
});
test('La carga múltiple de evidencias tampoco continúa después de cambiar de cuenta',async()=>{
 class File {constructor(){this.size=20;}}
 let owner='a',resolve;const held=new Promise(done=>resolve=done);
 const context=vm.createContext({File,window:{SSTCloud:{getUser:()=>({id:owner})}},storeAttachment:()=>held});
 vm.runInContext(declaration('storeAttachments'),context);const pending=vm.runInContext('storeAttachments([new File(),new File()])',context);
 owner='b';resolve({id:'file-1'});await assert.rejects(pending,/sesión cambió/);
});
