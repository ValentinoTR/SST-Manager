// RELIPER reference supplied by the owner. IDs and template version are immutable.
export const reliperTemplate='reliper-light-v1';
export const reliperGroups=['Estado general (vuelta del gallo)','Estado interno','Elementos de seguridad','Estado mecánico'];
export const reliperComponents=[
 ['g01',0,'Faros principales / faros neblineros / luces pirata','yellow','lights'],
 ['g02',0,'Luces direccionales / de estacionamiento / intermitentes','yellow','lights'],
 ['g03',0,'Luces de freno / luces de retroceso','yellow','lights'],
 ['g04',0,'Luz estroboscópica','yellow','lights'],
 ['g05',0,'Espejos','yellow','mirrors'],
 ['g06',0,'Parabrisas y ventanas (sin rajaduras)','yellow','windows'],
 ['g07',0,'Plumillas / lavaparabrisas','yellow','wipers'],
 ['g08',0,'Neumáticos de las mismas características, incluido repuesto (tipo AT / MT, presión y banda de rodamiento)','red','tires'],
 ['g09',0,'Espárragos, tuercas (torque según fabricante), seguro de tuercas o indicadores tipo gota','yellow','tires'],
 ['g10',0,'Cartolas / letreros identificatorios','green','other'],
 ['i01',1,'Cinturones de seguridad','red','belts'],['i02',1,'Alarma de retroceso','red','reverse'],
 ['i03',1,'Seguros de puertas','yellow','other'],['i04',1,'Claxon','red','horn'],
 ['i05',1,'Tarjeta de propiedad, póliza de seguro, SOAT y revisión técnica vigente','red','other'],
 ['i06',1,'Kit básico de herramientas / llave de rueda','green','firstaid'],
 ['i07',1,'Gata (doble peso bruto vehicular) y sus accesorios','green','firstaid'],
 ['i08',1,'Orden y limpieza','green','other'],['i09',1,'Aire acondicionado','yellow','other'],
 ['s01',2,'Tacos / cuñas (02)','green','firstaid'],['s02',2,'Conos de seguridad de 70 cm (03), con cinta reflectiva (8-10 cm)','green','firstaid'],
 ['s03',2,'Eslinga / grilletes','green','other'],['s04',2,'Pico y pala','green','firstaid'],
 ['s05',2,'Cable para pasar corriente','green','firstaid'],['s06',2,'Extintor PQS 6 kg (ABC)','green','extinguisher'],
 ['s07',2,'Botiquín / linterna','green','firstaid'],['s08',2,'Kit antiderrame','green','firstaid'],
 ['s09',2,'Sistema de comunicación (teléfono satelital, radio handy, celular)','green','other'],['s10',2,'Otros elementos de seguridad','green','other'],
 ['m01',3,'Estado de los frenos de servicio','red','brakes'],['m02',3,'Freno de estacionamiento','red','brakes'],
 ['m03',3,'Dirección','red','steering'],['m04',3,'Nivel de aceite del motor','red','fluids'],
 ['m05',3,'Nivel de líquido de frenos','red','fluids'],['m06',3,'Nivel de refrigerante','red','fluids'],
 ['m07',3,'Nivel de aceite hidráulico (hidrolina)','red','fluids'],['m08',3,'Nivel de agua para limpiaparabrisas','green','wipers'],
 ['m09',3,'Otros componentes mecánicos (1)','green','other'],['m10',3,'Otros componentes mecánicos (2)','green','other']
].map(([id,group,label,color,legacy])=>Object.freeze({id,group,label,color,legacy,critical:color==='red'||['tires','lights','mirrors','extinguisher'].includes(legacy)}));
export const reliperFatigue=[
 '¿He dormido lo suficiente (al menos 6 horas) y me encuentro en condiciones de conducir?',
 '¿Me encuentro en buenas condiciones físicas y no tengo ninguna dolencia o enfermedad que me impida conducir en forma segura?',
 '¿Me encuentro libre de los efectos de medicamentos (recetados o no) que produzcan sueño o afecten mi capacidad de conducir de forma segura?',
 '¿Me encuentro emocionalmente en buenas condiciones para poder concentrarme en la conducción segura del vehículo?',
 '¿Soy consciente de la responsabilidad que significa conducir este vehículo, sin poner en riesgo mi integridad, la de mis compañeros ni el patrimonio de la empresa?',
 '¿Tengo bostezos continuamente?', '¿Tengo mucho sueño y me cuesta estar con los ojos abiertos?',
 '¿Tengo los ojos enrojecidos, me cuesta coordinar mis movimientos y reacciono lentamente?',
 '¿Tengo pérdida del ánimo, me cuesta concentrarme o estar atento?',
 '¿Me olvido las cosas que me dicen con frecuencia y tengo sueño?',
 '¿Me molesto con facilidad, estoy irritable y me siento cansado constantemente?'
];
export const reliperRoutes=['Ruta Alta Montaña: Chilligua (progresiva km 127+000)','Ruta Tacna: Camiara (progresiva km 1245+000)','Ruta Arequipa: Fiscal (progresiva km 974+000)'];
export function reliperStop(answers){return Array.isArray(answers)&&answers.some((v,n)=>typeof v==='boolean'&&(n<5?!v:v));}
export function validateReliper(r){
 if(!r||!Array.isArray(r.components)||r.components.length!==reliperComponents.length||new Set(r.components.map(i=>i.id)).size!==reliperComponents.length)throw new Error('Completa los 39 componentes RELIPER sin duplicados.');
 for(const key of ['driver','company','date','time'])if(!String(r[key]||'').trim())throw new Error('Completa conductor, empresa, fecha y hora.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!/^\d{2}:\d{2}$/.test(r.time))throw new Error('Fecha u hora inválida.');
 for(const key of ['mileage','nextMaintenance'])if(typeof r[key]!=='number'||!Number.isFinite(r[key])||r[key]<0||r[key]>99999999)throw new Error('Registra kilometrajes válidos.');
 if(![0,25,50,75,100].includes(r.fuel))throw new Error('Selecciona el nivel de combustible.');
 if(r.fatigue?.length!==11||r.fatigue.some(v=>typeof v!=='boolean'))throw new Error('Responde las 11 preguntas de somnolencia y fatiga.');
 for(const c of reliperComponents){const i=r.components.find(i=>i.id===c.id);if(!i||!['Conforme','No conforme','No aplica'].includes(i.status))throw new Error('Responde cada componente RELIPER.');if(i.status!=='Conforme'&&!String(i.note||'').trim())throw new Error('Describe la falla o justifica No aplica.');if((c.critical||i.critical===true)&&i.status==='No aplica')throw new Error('Los componentes críticos requieren verificación.');}
 if(r.supervisorSignature&&!String(r.supervisor||'').trim())throw new Error('Identifica al supervisor que firma.');
 if(!Array.isArray(r.pauses)||r.pauses.length>6||r.pauses.some(p=>!String(p.route||'').trim()||!/^\d{2}:\d{2}$/.test(p.time||'')||!Number.isInteger(p.minutes)||p.minutes<5||p.minutes>480))throw new Error('Cada pausa registrada necesita ruta, hora y al menos 5 minutos.');
 return r;
}
export function reliperAggregate(r,legacyChecklist){
 return legacyChecklist.map(c=>{
  const children=reliperComponents.filter(x=>x.legacy===c.id).map(x=>({...x,...r.components.find(i=>i.id===x.id),critical:x.critical||r.components.find(i=>i.id===x.id)?.critical===true}));
  const bad=children.filter(i=>i.status==='No conforme'),status=bad.length?'No conforme':children.every(i=>i.status==='No aplica')?'No aplica':'Conforme';
  const detail=children.filter(i=>i.status!=='Conforme').map(i=>i.label+': '+i.note).join('\n');
  return {...c,status,critical:c.critical||bad.some(i=>i.critical),note:detail.length>1500?detail.slice(0,1400)+'\n[Resumen. Consulta el detalle completo en la inspección RELIPER.]':detail,photo:children.find(i=>i.photo)?.photo||null};
 });
}
