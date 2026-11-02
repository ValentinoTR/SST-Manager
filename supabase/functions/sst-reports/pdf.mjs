import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {createReliperReport} from './reliper-pdf.mjs';

const labels={tires:'Llantas y ruedas',brakes:'Frenos',lights:'Luces',windows:'Ventanas',mirrors:'Espejos',belts:'Cinturones',extinguisher:'Extintor',horn:'Bocina',fluids:'Fluidos y fugas',steering:'Dirección',reverse:'Alarma de retroceso',wipers:'Limpiaparabrisas',firstaid:'Botiquín y herramientas',other:'Otros'};
const criticalIds=['tires','brakes','lights','mirrors','belts','extinguisher','horn','fluids','steering','reverse'];
const clean=value=>String(value??'').normalize('NFC').replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
export async function createMailTest(){
 const doc=await PDFDocument.create(),page=doc.addPage(),font=await doc.embedFont(StandardFonts.Helvetica);
 doc.setTitle('SST-Manager - Prueba técnica de envío');
 const lines=['SST-MANAGER / PRUEBA TECNICA DE ENVIO','Este PDF verifica la conexión del servidor con Gmail.',
  'Remitente: educornejoperea28@gmail.com','Destinatario: seguridad@reliper.pe',
  'No corresponde a una inspección ni a una charla de seguridad.',
  'No contiene datos de trabajadores ni modifica los registros del sistema.',
  'Emitido: '+new Date().toLocaleString('es-PE',{timeZone:'America/Lima'})+' (Lima)'];
 lines.forEach((line,i)=>page.drawText(clean(line),{x:45,y:780-i*29,size:i?11:15,font}));
 return doc.save();
}
export async function createReport(version,defects=[],getFile=async()=>null){
 if(version.kind==='inspection'&&version.payload.template==='reliper-light-v1')return createReliperReport(version,defects,getFile);
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 doc.setTitle(version.kind==='inspection'?'Inspección de vehículos':'Charla de seguridad');doc.setAuthor('SST Control - Reliper');
 let page,y;const width=507;
 function newPage(){page=doc.addPage([595.28,841.89]);y=777;page.drawRectangle({x:0,y:797,width:595.28,height:45,color:rgb(.06,.18,.18)});page.drawText('SST CONTROL / RELIPER',{x:44,y:814,size:12,font:bold,color:rgb(1,1,1)});}
 function space(n){if(y-n<57)newPage();}
 function text(value,size=10,strong=false){
  const f=strong?bold:font;
  for(const paragraph of clean(value).split('\n')){
   let line='';for(const word of paragraph.split(/\s+/)){
    // Split unbroken identifiers and long evidence references as well as normal words.
    for(const part of word.match(/.{1,65}/g)||['']){
     const next=line?line+' '+part:part;
     if(f.widthOfTextAtSize(next,size)>width&&line){space(size+6);page.drawText(line,{x:44,y,size,font:f,color:rgb(.08,.16,.18)});y-=size+6;line=part;}else line=next;
    }
   }
   space(size+6);page.drawText(line,{x:44,y,size,font:f,color:rgb(.08,.16,.18)});y-=size+6;
  }
 }
 async function image(path,label,maxHeight=210){
  if(!path)return;const bytes=await getFile(path);if(!bytes)throw new Error('No se pudo recuperar evidencia para el PDF.');
  text(label,10,true);
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let img;
  if(b[0]===137&&b[1]===80)img=await doc.embedPng(b);else if(b[0]===255&&b[1]===216)img=await doc.embedJpg(b);
  else{text('Evidencia conservada en el archivo privado: '+path,8);return;}
  const scale=Math.min(1,width/img.width,maxHeight/img.height),w=img.width*scale,ht=img.height*scale;space(ht+15);page.drawImage(img,{x:44,y:y-ht,width:w,height:ht});y-=ht+15;
 }
 newPage();const p=version.payload;
 text(version.kind==='inspection'?'INSPECCIÓN DE VEHÍCULOS':'CHARLA DIARIA DE SEGURIDAD',18,true);
 text(`Registro: ${version.document_id} / Versión ${version.revision}`,9);
 text(`Registrado: ${new Date(version.recorded_at).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Lima)`);
 text(`Responsable: ${version.actor}`);text(`Motivo de versión: ${version.reason}`);y-=9;
 if(version.kind==='inspection'){
  text(`Placa: ${p.vehicle.plate} | ${p.vehicle.type} | ${p.vehicle.brand} ${p.vehicle.model}`,12,true);
  const critical=p.items.some(i=>i.status==='No conforme'&&(criticalIds.includes(i.id)||i.critical));
  const open=defects.filter(d=>!d.resolved_at);
  text(`Resultado de esta versión: ${critical?'NO APTO':p.items.some(i=>i.status==='No conforme')?'CON OBSERVACIONES':'CONFORME'}`,12,true);
  text(`Fallas críticas pendientes al emitir este reporte: ${open.length}. ${open.length?'VEHÍCULO NO APTO.':'Verificar inspección más reciente y condiciones actuales.'}`,11,true);
  text('Una versión conforme no cierra fallas anteriores. Este PDF refleja la información a la fecha de emisión.');y-=6;
  for(const i of p.items){space(56);text(`${labels[i.id]||i.id}${criticalIds.includes(i.id)||i.critical?' [CRÍTICO]':''}: ${i.status}`,11,true);if(i.note)text('Observación: '+i.note);if(i.photo)await image(i.photo,'Fotografía: '+(labels[i.id]||i.id));y-=7;}
  if(open.length){text('FALLAS CRÍTICAS ABIERTAS',12,true);for(const d of open)text(`${labels[d.item_id]||d.item_id}: ${d.note} (registro ${d.document_id})`);}
  text('Observaciones generales: '+(p.notes||'Sin observaciones.'));
 }else{
  text(p.topic,15,true);text(`${p.date} / ${p.time} (Lima) | ${p.duration} minutos`);text('Expositor: '+p.instructor);text(`Unidad: ${p.unit} / Área: ${p.area} / Turno: ${p.shift||'-'}`);text('Contenido, riesgos y medidas: '+p.content);y-=8;
  const total=p.participants.length,present=p.participants.filter(x=>x.present).length,percent=total?Math.round(present/total*10000)/100:0;
  text(`${present} presentes / ${total-present} ausentes / ${percent} % de asistencia`,13,true);
  text('La asistencia por sí sola no acredita participación. Esta reunión no sustituye cursos, evaluaciones ni constancias del Anexo 6.',9);y-=8;
  for(const [n,person] of p.participants.entries()){
   space(100);text(`${n+1}. ${person.name} / DNI ${person.dni}`,11,true);text(`Cargo: ${person.role} / Área: ${person.area}`);text(person.present?'PRESENTE':'AUSENTE',11,true);
   text('Evidencia individual: '+(person.evidence|| (person.signature?'Firma trazada adjunta.':'Sin evidencia individual.')));
   if(person.signature)await image(person.signature,'Firma trazada (sin certificación criptográfica)',65);y-=10;
  }
  if(p.attachment)text('Material / acta disponible en el archivo privado: '+p.attachment,8);
 }
 y-=8;text('Referencia: D. S. 024-2016-EM, modificatorias 023-2017-EM y 034-2023-EM. Charlas: arts. 71-76. Equipos: arts. 374-375. Aplicar IPERC, PETS y estándares de la unidad.',8);
 const pages=doc.getPages();pages.forEach((pg,i)=>pg.drawText(`SST Control | ${i+1} / ${pages.length} | Evidencia privada`,{x:44,y:30,size:8,font,color:rgb(.4,.45,.45)}));
 return doc.save();
}
