/* Only served by the explicit local /__test__ fixture, never by index.html. */
window.SSTCloud=(()=>{const documents=[];return{
 start(){
  document.body.classList.remove('cloud-locked');
  state.workers=Array.from({length:20},(_,n)=>({id:String(n),name:'Trabajador de prueba '+(n+1),dni:String(10000000+n),role:'Operador',area:'Mantenimiento',status:'Activo'}));renderAll();
  window.dispatchEvent(new CustomEvent('sst:session',{detail:{signedIn:true}}));
 },isSignedIn:()=>true,getUser:()=>({id:'10000000-0000-4000-8000-000000000001',email:'prueba@example.test'}),
 getClient(){const vehicle={id:'20000000-0000-4000-8000-000000000001',plate:'ABC123',type:'Camioneta',brand:'Marca',model:'Modelo',revision:1};return{
  functions:{invoke:async()=>({data:{processed:[]}})},
  async rpc(name,args){if(name==='sst_reliper_ready')return {data:!new URLSearchParams(location.search).has('legacy')};if(name==='sst_save_document'){
   const payload=structuredClone(args.body);window.SSTSafety.validate(args.doc_kind,payload);if(payload.reliper){const R=await import('../reliper.mjs');R.validateReliper(payload.reliper);payload.items=R.reliperAggregate(payload.reliper,window.SSTSafety.checklist);}payload.vehicle=vehicle;
   const now=new Date().toISOString(),doc={id:args.doc_id,document_id:args.doc_id,kind:args.doc_kind,payload,revision:args.expected_revision+1,created_at:now,recorded_at:now,actor:'prueba@example.test',reason:args.change_reason};documents.unshift(doc);return {data:doc};
  }return {data:null};},
  from(table){const filters=[];const rows=()=>{const data=table==='sst_vehicles'?[vehicle]:table==='sst_documents'?documents.filter((d,n)=>documents.findIndex(x=>x.id===d.id)===n):table==='sst_document_versions'?documents:[];return data.filter(row=>filters.every(([key,value])=>row[key]===value));};const q={select(){return q;},order(){return q;},eq(key,value){filters.push([key,value]);return q;},range(){return Promise.resolve({data:rows()});},maybeSingle(){return Promise.resolve({data:table==='sst_module_roles'?{role:'admin'}:rows()[0]||null});},then(resolve){resolve({data:rows()});}};return q;}
 };}
};})();
