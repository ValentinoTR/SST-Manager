import {reliperTemplate,reliperComponents,reliperAggregate} from '../reliper.mjs';
import C from '../safety-core.js';
export function reliperFixture(vehicleId='20000000-0000-4000-8000-000000000001'){
 const reliper={driver:'Conductor de prueba',company:'Empresa de prueba',date:'2026-11-01',time:'07:00',mileage:42500,nextMaintenance:45000,fuel:75,formCode:'',formVersion:'',approvalDate:'',fatigue:[true,true,true,true,true,false,false,false,false,false,false],fatigueStop:false,
  components:reliperComponents.map(c=>({...c,status:'Conforme',note:'',photo:null})),pauses:[],supervisor:'Supervisor de prueba',supervisorNotes:'',driverSignature:null,supervisorSignature:null};
 return {vehicleId,template:reliperTemplate,notes:'Inspección de muestra. No es un registro operativo.',reliper,items:reliperAggregate(reliper,C.checklist),vehicle:{plate:'ABC123',type:'Camioneta',brand:'Marca',model:'Modelo'}};
}
