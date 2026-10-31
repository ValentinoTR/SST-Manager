/* Only served by the explicit local /__test__ fixture, never by index.html. */
window.SSTCloud={
 start(){
  document.body.classList.remove('cloud-locked');
  state.workers=Array.from({length:20},(_,n)=>({id:String(n),name:'Trabajador de prueba '+(n+1),dni:String(10000000+n),role:'Operador',area:'Mantenimiento',status:'Activo'}));renderAll();
  window.dispatchEvent(new CustomEvent('sst:session',{detail:{signedIn:true}}));
 },isSignedIn:()=>true,getUser:()=>({id:'10000000-0000-4000-8000-000000000001',email:'prueba@example.test'}),
 getClient(){return{from(table){const q={select(){return q;},order(){return q;},range(){return Promise.resolve({data:table==='sst_vehicles'?[{id:'20000000-0000-4000-8000-000000000001',plate:'ABC123',type:'Camioneta',brand:'Marca',model:'Modelo',revision:1}]:[]});},eq(){return q;},maybeSingle(){return Promise.resolve({data:table==='sst_module_roles'?{role:'admin'}:null});}};return q;}};}
};
