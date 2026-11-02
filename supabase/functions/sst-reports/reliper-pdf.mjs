import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {reliperComponents,reliperGroups,reliperFatigue,reliperRoutes,reliperStop} from '../../../reliper.mjs';

// A4 master with the same blocks as the supplied print form. Evidence continues in annexes.
export async function createReliperReport(version,defects=[],getFile=async()=>null){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 pdf.setTitle('RELIPER - Inspección pre uso de vehículos livianos');pdf.setAuthor('SST-Manager / RELIPER');
 const p=version.payload,r=p.reliper,s=567/1000,H=841.89,M=14,blue=rgb(.02,.28,.65),yellow=rgb(1,.9,.13),black=rgb(.08,.08,.08),white=rgb(1,1,1),annex=[];
 const safe=x=>String(x??'').normalize('NFC').replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
 let page=pdf.addPage([595.28,H]);
 const wrap=(text,width,size,f=font)=>{const lines=[];for(const paragraph of safe(text).split('\n')){let line='';for(const raw of paragraph.split(/\s+/)){let parts=[raw];if(f.widthOfTextAtSize(raw,size)>width){parts=[];let part='';for(const ch of raw){if(f.widthOfTextAtSize(part+ch,size)>width){parts.push(part);part='';}part+=ch;}if(part)parts.push(part);}for(const word of parts){if(line&&f.widthOfTextAtSize(line+' '+word,size)>width){lines.push(line);line='';}line+=(line?' ':'')+word;}}lines.push(line);}return lines;};
 const rect=(x,t,w,h,fill)=>page.drawRectangle({x:M+x*s,y:H-M-(t+h)*s,width:w*s,height:h*s,borderColor:black,borderWidth:.45,...(fill?{color:fill}:{})});
 function cell(x,t,w,h,text,{size=11,b=false,fill,center=false,tag,textColor}={}){
  rect(x,t,w,h,fill);const f=b?bold:font,lines=wrap(text,(w-8)*s,size*s,f),max=Math.max(1,Math.floor((h-6)/(size*1.14)));
  let shown=lines;if(lines.length>max){annex.push({label:tag||'Dato ampliado',text:safe(text)});shown=wrap('Ver anexo',(w-8)*s,size*s,f).slice(0,max);}
  shown.forEach((line,i)=>page.drawText(line,{x:M+x*s+(center?(w*s-f.widthOfTextAtSize(line,size*s))/2:4*s),y:H-M-(t+4+size+i*size*1.14)*s,size:size*s,font:f,color:textColor||(fill===blue?white:black)}));
 }
 const color=c=>c==='red'?rgb(.85,.02,.04):c==='yellow'?rgb(.95,.67,0):rgb(.02,.4,.14);
 function dots(x,t,c){const n=c==='red'?3:c==='yellow'?2:1;for(let i=0;i<n;i++)page.drawCircle({x:M+(x+9+i*9)*s,y:H-M-(t+11)*s,size:3*s,color:color(c)});}
 cell(0,0,220,80,'RELIPER',{fill:yellow,b:true,size:39,center:true,textColor:blue});
 cell(220,0,475,80,'INSPECCIÓN PRE USO DE VEHÍCULOS LIVIANOS',{fill:blue,b:true,size:21,center:true});
 [['CÓDIGO',r.formCode],['VERSIÓN',r.formVersion],['FECHA DE\nAPROBACIÓN',r.approvalDate]].forEach(([k,v],i)=>{cell(695,i*80/3,122,80/3,k,{size:i===2?8.5:10,b:true});cell(817,i*80/3,183,80/3,v||'',{size:11,tag:k});});
 const rows=[['CONDUCTOR',r.driver,'EMPRESA',r.company],['FECHA',r.date,'HORA',r.time],['TIPO DE VEHÍCULO',p.vehicle.type,'MARCA',p.vehicle.brand+' '+p.vehicle.model],['PLACA DE VEHÍCULO',p.vehicle.plate,'PRÓX. MANTENIMIENTO (km)',r.nextMaintenance],['KILOMETRAJE INICIAL',r.mileage+' km','NIVEL DE COMBUSTIBLE ACTUAL',r.fuel+' % (E: 0 % / F: 100 %)']];
 rows.forEach((row,i)=>{const t=86+i*22;cell(0,t,190,22,row[0],{b:true,size:10});cell(190,t,300,22,row[1],{tag:row[0]});cell(490,t,180,22,row[2],{b:true,size:9.5});cell(670,t,330,22,row[3],{tag:row[2]});});
 cell(0,202,1000,28,'AUTOEVALUACIÓN: LISTA DE VERIFICACIÓN DE SOMNOLENCIA Y FATIGA DEL CONDUCTOR',{fill:blue,b:true,size:15,center:true});
 for(const side of [0,1]){
  const x=side*510,w=490;cell(x,230,w,32,side?'Síntomas de somnolencia / fatiga antes de la conducción':'Declaración de estado al inicio de la conducción',{fill:blue,b:true,size:11.2});
  let t=262;const heights=side?[32,36,48,36,36,42]:[43,43,51,43,50];
  const indexes=side?[5,6,7,8,9,10]:[0,1,2,3,4];
  indexes.forEach((n,j)=>{const ht=heights[j],v=r.fatigue[n];cell(x,t,34,ht,'');dots(x+1,t+ht/2-11,'red');cell(x+34,t,356,ht,(n+1)+'. '+reliperFatigue[n],{size:11,tag:'Autoevaluación '+(n+1)});cell(x+390,t,100,ht,v===true?'SÍ':v===false?'NO':'',{b:true,size:12,center:true});t+=ht;});
  cell(x,492,w,50,side?'Preguntas 6 a 11: si respondes SÍ a algún síntoma, NO CONDUZCAS y avisa inmediatamente a tu supervisor.':'Preguntas 1 a 5: si respondes NO a alguna pregunta, NO CONDUZCAS y avisa inmediatamente a tu supervisor.',{b:true,size:11.5});
 }
 function componentTable(group,x,t){
  const w=490;cell(x,t,355,30,reliperGroups[group].toUpperCase(),{fill:blue,b:true,size:13});['Bueno','Malo','N/A'].forEach((v,n)=>cell(x+355+n*45,t,45,30,v,{fill:blue,b:true,size:10,center:true}));t+=30;
  for(const c of reliperComponents.filter(c=>c.group===group)){
   const i=r.components.find(i=>i.id===c.id)||{},ht=['g08','g09','i05'].includes(c.id)?40:c.id==='s02'?32:20;
   cell(x,t,35,ht,'');dots(x+1,t+ht/2-11,c.color);cell(x+35,t,320,ht,c.label+(i.critical&&!c.critical?' [SST]':'')+(i.note||i.photo?' *':''),{size:10.7,tag:'Componente '+c.id});
   ['Conforme','No conforme','No aplica'].forEach((v,n)=>cell(x+355+n*45,t,45,ht,i.status===v?'X':'',{b:true,size:12,center:true}));t+=ht;
  }
 }
 componentTable(0,0,550);componentTable(1,510,550);componentTable(2,0,830);componentTable(3,510,830);
 cell(0,1090,1000,22,'PAUSA ACTIVA (MÍNIMO 5 MINUTOS)',{fill:blue,b:true,size:13,center:true});
 [0,1,2].forEach(n=>{const a=(r.pauses||[])[n];cell(0,1112+n*18,490,18,(n+1)+'. '+reliperRoutes[n],{size:9.8});cell(510,1112+n*18,490,18,a?`${a.route} / ${a.time} / ${a.minutes} min`:'Ruta / hora / duración: sin pausa registrada',{size:9.8,tag:'Pausa '+(n+1)});});
 const open=defects.filter(d=>!d.resolved_at),bad=r.components.some(i=>i.status==='No conforme'&&(reliperComponents.find(c=>c.id===i.id)?.critical||i.critical)),stop=reliperStop(r.fatigue),result=open.length||bad||stop?'NO APTO / NO INICIAR CONDUCCIÓN':r.components.some(i=>i.status==='No conforme')?'CON OBSERVACIONES':'CONFORME';
 cell(0,1172,1000,62,'',{size:11});
 const criteria=[['RESULTADO: '+result,black],['Rojo (3 puntos): detener el vehículo y solicitar asistencia. NO OPERAR.',color('red')],['Amarillo (2 puntos): llevar al taller. Verde (1 punto): solución bajo responsabilidad del conductor.',black],['Los controles críticos de SST y las fallas pendientes prevalecen sobre el color del formato.',black]];
 criteria.forEach(([text,c],n)=>page.drawText(safe(text),{x:M+5*s,y:H-M-(1184+n*14)*s,size:10.6*s,font:n?font:bold,color:c}));
 cell(0,1240,330,50,'Firma del conductor'+(r.driverSignature?'':' / pendiente'),{size:10.5});cell(330,1240,330,50,'V° B° supervisor: '+(r.supervisor||'Pendiente'),{size:10.5,tag:'Supervisor'});
 cell(660,1240,340,180,`CENTRAL DE EMERGENCIAS\nCelular: ${r.emergencyMobile||'943 652 972'}\nFijo: ${r.emergencyPhone||'053-309044'}\nRadio: ${r.emergencyRadio||'Canal 1 (palabra clave NIDO)'}`,{size:15,center:true});
 cell(0,1296,330,22,'OBSERVACIONES CONDUCTOR / PASAJERO',{fill:blue,b:true,size:10.3});cell(330,1296,330,22,'OBSERVACIONES SUPERVISOR',{fill:blue,b:true,size:10.3});
 cell(0,1318,330,66,p.notes||'Sin observaciones generales.',{size:11,tag:'Observaciones conductor / pasajero'});cell(330,1318,330,66,r.supervisorNotes||'Sin observaciones.',{size:11,tag:'Observaciones supervisor'});
 cell(0,1390,660,30,'Coordinar la corrección con el supervisor inmediato, SSGG o Mantenimiento. * Detalle y evidencias en anexos. N/A requiere justificación.',{size:9.5});
 async function imageAt(path,x,t,w,h){if(!path)return;const bytes=await getFile(path);if(!bytes)throw new Error('No se pudo recuperar evidencia RELIPER.');const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const img=b[0]===137?await pdf.embedPng(b):await pdf.embedJpg(b),scale=Math.min(w*s/img.width,h*s/img.height);page.drawImage(img,{x:M+x*s,y:H-M-(t+h)*s,width:img.width*scale,height:img.height*scale});}
 await imageAt(r.driverSignature,20,1258,280,28);await imageAt(r.supervisorSignature,350,1258,280,28);
 // Evidence stays readable and complete; no photographs or text are squeezed into the master.
 let y=0;function newAnnex(){page=pdf.addPage([595.28,H]);y=790;page.drawText('RELIPER / ANEXOS DE INSPECCIÓN',{x:35,y,size:14,font:bold,color:blue});y-=30;}
 function paragraph(label,text){const lines=wrap(label+(text?' '+safe(text):''),525,9.5);if(y-lines.length*13<45)newAnnex();for(const line of lines){if(y<45)newAnnex();page.drawText(line,{x:35,y,size:9.5,font});y-=13;}y-=7;}
 newAnnex();paragraph('Registro:',version.document_id+' / revisión '+version.revision+' / formato interno '+p.template);paragraph('Registrado en servidor:',new Date(version.recorded_at).toLocaleString('es-PE',{timeZone:'America/Lima'})+' (Lima) / '+version.actor);paragraph('Motivo:',version.reason);paragraph('Resultado:',result);paragraph('Autoevaluación:',stop?'NO CONDUCIR. Avisar al supervisor. Declaración del conductor, sin diagnóstico médico.':'Sin respuestas de detención en esta declaración.');paragraph('Fallas críticas pendientes al emitir:',String(open.length)+'. Una inspección conforme no cierra fallas anteriores. Consultar siempre el estado actual.');
 paragraph('Firmas:',`Conductor: ${r.driverSignature?'firma trazada adjunta':'pendiente'}. Supervisor: ${r.supervisorSignature?'firma trazada adjunta':'pendiente'}. Son evidencias de apoyo, sin certificación criptográfica.`);
 for(const item of annex)paragraph(item.label+':',item.text);
 for(const c of reliperComponents){const i=r.components.find(i=>i.id===c.id);if(!i?.note&&!i?.photo)continue;paragraph(c.label+':',i.status+(c.critical||i.critical?' [control crítico SST]':'')+(i.note?' / '+i.note:''));if(i.photo){const bytes=await getFile(i.photo);if(!bytes)throw new Error('Fotografía RELIPER no disponible.');const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),img=b[0]===137?await pdf.embedPng(b):await pdf.embedJpg(b),scale=Math.min(525/img.width,230/img.height),height=img.height*scale;if(y-height<45)newAnnex();page.drawImage(img,{x:35,y:y-height,width:img.width*scale,height});y-=height+18;}}
 if(r.pauses?.length)for(const a of r.pauses)paragraph('Pausa registrada:',`${a.route} / ${a.time} / ${a.minutes} minutos`);
 for(const d of open)paragraph('Falla crítica abierta:',d.item_id+' / '+d.note+' / registro '+d.document_id);
 pdf.getPages().forEach((pg,n)=>pg.drawText(`SST-Manager | ${n+1}/${pdf.getPageCount()} | Evidencia privada`,{x:35,y:10,size:6,font,color:rgb(.35,.35,.35)}));
 return pdf.save();
}
