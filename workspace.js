/* Progressive enhancements; preserves the existing data schema and modules. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const main = document.querySelector('.main');
const sidebar = document.querySelector('.sidebar');
sidebar.id = 'workspaceNav';
sidebar.setAttribute('aria-label', 'Navegación principal');
const icons = ['<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>','<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>','<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4m8-4v4M8 13l3 3 5-6"/>','<path d="M3 17h18M5 17v-4a7 7 0 0 1 14 0v4M10 6V3h4v3M2 21h20"/>','<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>','<path d="m2 8 10-5 10 5-10 5ZM6 10v7q6 5 12 0v-7M22 8v9"/>','<path d="M20 4C15 0 12 7 12 7S9 0 4 4c-6 5 8 17 8 17S26 9 20 4Z"/>','<path d="m12 3 10 18H2Z M12 9v5m0 3v1"/>','<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>','<path d="M5 20v-8a7 7 0 0 1 14 0v8M3 21h18M12 1v2M2 5l2 2m16 0 2-2M12 9v5m0 2v1"/>','<path d="m12 2 10 18H2ZM12 8v6m0 2v1"/>','<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-13 4h3m3 0h3"/>','<path d="M5 2h10l4 4v16H5ZM14 2v5h5M8 11h8m-8 4h8m-8 4h5"/>'];
const nav = [...document.querySelectorAll('.nav-item')];
nav.forEach((button, i) => {
 button.querySelector('span').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[i]}</svg>`;
 if ([0,1,7,11].includes(i)) { const label=document.createElement('div');label.className='nav-group';label.textContent=({0:'ESPACIO DE TRABAJO',1:'PERSONAL Y BIENESTAR',7:'PREVENCIÓN',11:'PLANIFICACIÓN'})[i];button.before(label); }
});
main.insertAdjacentHTML('afterbegin', `<div class="utility-bar"><div class="utility-navigation"><button class="mobile-menu" id="menuToggle" aria-controls="workspaceNav" aria-expanded="false" aria-label="Abrir menú">☰</button><button class="icon-button sidebar-toggle" id="sidebarToggle" aria-controls="workspaceNav" aria-expanded="true" aria-label="Plegar menú" title="Plegar menú">‹</button><span class="workspace-tag">SST / ESPACIO DE TRABAJO</span></div><div class="utility-actions"><span class="workspace-date" id="workspaceDate"></span><button class="search-launch" id="searchLaunch"><span aria-hidden="true">⌕</span> Buscar <kbd>Ctrl K</kbd></button><button class="icon-button" id="themeToggle" aria-label="Activar modo oscuro" title="Activar modo oscuro">◐</button><button class="btn btn-light" id="backupLaunch">Respaldos</button></div></div>`);
document.querySelectorAll('.nav-item').forEach(button => { button.title=button.textContent.trim(); });
const smallScreen=matchMedia('(max-width:800px)');
function compact(value){document.body.classList.toggle('sidebar-compact',value);$('sidebarToggle').setAttribute('aria-expanded',String(!value));$('sidebarToggle').setAttribute('aria-label',value?'Expandir menú':'Plegar menú');$('sidebarToggle').title=value?'Expandir menú':'Plegar menú';$('sidebarToggle').textContent=value?'›':'‹';try{localStorage.setItem('sst_ui_sidebar',value?'compact':'full');}catch{}}
try{compact(localStorage.getItem('sst_ui_sidebar')==='compact');}catch{}
$('sidebarToggle').onclick=()=>compact(!document.body.classList.contains('sidebar-compact'));
function theme(value){document.documentElement.dataset.theme=value;const dark=value==='dark';$('themeToggle').setAttribute('aria-label',dark?'Activar modo claro':'Activar modo oscuro');$('themeToggle').title=dark?'Activar modo claro':'Activar modo oscuro';$('themeToggle').setAttribute('aria-pressed',String(dark));try{localStorage.setItem('sst_ui_theme',value);}catch{}}
theme(document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
$('themeToggle').onclick=()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('workspaceDate').textContent=new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
const dashboard=$('page-dashboard');
const metrics=dashboard.querySelector('.metric-grid');
dashboard.prepend(metrics);
metrics.insertAdjacentHTML('beforebegin','<div class="overview-intro"><div><span class="eyebrow">PREVENIR ES CUIDAR</span><h2>Tu equipo, más seguro cada día.</h2><p>Identifica lo urgente, sigue el cumplimiento y organiza las acciones de seguridad desde un solo lugar.</p></div><span class="overview-mark" aria-hidden="true">✓</span></div>');
main.insertAdjacentHTML('beforeend','<p class="data-note">SST Control · Registros sincronizados con tu cuenta privada de Supabase. Los adjuntos se guardan en un espacio privado.</p>');
if(!state.workers.length) dashboard.querySelector('.overview-intro').insertAdjacentHTML('afterend','<div class="demo-note">Tu espacio está listo. Agrega tu primer colaborador para comenzar.</div>');
document.body.insertAdjacentHTML('beforeend',`<div class="drawer-overlay" id="drawerOverlay" hidden></div>
<dialog class="workspace-dialog" id="searchDialog" aria-labelledby="searchTitle"><div class="dialog-heading"><h2 id="searchTitle">Encuentra lo que necesitas</h2><button class="dialog-close" data-close="searchDialog" aria-label="Cerrar búsqueda">×</button></div><input class="search-input" id="globalSearch" type="search" placeholder="Módulo, nombre, DNI o área…" aria-label="Buscar módulos y colaboradores"><div class="search-results" id="searchResults" aria-live="polite"></div></dialog>
<dialog class="workspace-dialog" id="backupDialog" aria-labelledby="backupTitle"><div class="dialog-heading"><h2 id="backupTitle">Respalda tu espacio de trabajo</h2><button class="dialog-close" data-close="backupDialog" aria-label="Cerrar respaldos">×</button></div><div class="dialog-content"><p>Descarga los módulos originales y sus adjuntos en un respaldo JSON privado. Vehículos, charlas y sus versiones se conservan por separado en Supabase; este archivo no los restaura. Contiene datos personales: guárdalo en un lugar seguro.</p><div class="backup-actions"><button class="btn btn-primary" id="downloadBackup">Descargar respaldo JSON</button><button class="btn btn-light" id="restoreBackup">Restaurar respaldo</button></div><input type="file" id="backupFile" accept=".json,application/json" hidden><p class="backup-status" id="backupStatus" role="status"></p></div></dialog>`);
function drawer(open){sidebar.classList.toggle('drawer-open',open);$('drawerOverlay').hidden=!open;$('menuToggle').setAttribute('aria-expanded',String(open));sidebar.inert=smallScreen.matches&&!open;if(open)nav[0].focus();}
smallScreen.addEventListener('change',()=>drawer(false));drawer(false);
$('menuToggle').onclick=()=>drawer(!sidebar.classList.contains('drawer-open'));
$('drawerOverlay').onclick=()=>{drawer(false);$('menuToggle').focus();};
const originalOpenPage=openPage;
openPage=function(name){originalOpenPage(name);drawer(false);document.querySelectorAll('.nav-item').forEach(b=>b.setAttribute('aria-current',b.classList.contains('active')?'page':'false'));document.title=`${$('pageTitle').textContent} | SST Control`;window.scrollTo(0,0);};
nav[0].setAttribute('aria-current','page');
const normalize = text => String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function search(){
 const query=normalize($('globalSearch').value.trim());
 const results=[...[...document.querySelectorAll('.menu .nav-item')].map(b=>({label:b.textContent.trim(),detail:'Módulo',action:()=>openPage(b.dataset.page)})),...state.workers.map(w=>({label:w.name,detail:`${w.area||'Sin área'} · ${w.dni||''}`,action:()=>openProfile(w.id)}))].filter(r=>normalize(r.label+' '+r.detail).includes(query)).slice(0,30);
 const box=$('searchResults');box.replaceChildren();
 results.forEach(r=>{const b=document.createElement('button');b.className='search-result';const label=document.createElement('span');label.textContent=r.label;const detail=document.createElement('small');detail.textContent=r.detail;b.append(label,detail);b.onclick=()=>{$('searchDialog').close();r.action();$('mainContent').focus();};box.append(b);});
 if(!results.length)box.textContent='No hay coincidencias. Prueba otro nombre, DNI o módulo.';
}
$('searchLaunch').onclick=()=>{$('searchDialog').showModal();$('globalSearch').value='';search();$('globalSearch').focus();};
$('globalSearch').oninput=search;
$('globalSearch').onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();$('searchResults').querySelector('button')?.focus();}if(e.key==='Enter')$('searchResults').querySelector('button')?.click();};
$('searchResults').onkeydown=e=>{const rows=[...$('searchResults').querySelectorAll('button')];const i=rows.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();rows[(i+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length]?.focus();}};
$('backupLaunch').onclick=()=>$('backupDialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.querySelectorAll('.workspace-dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
// Keyboard support for legacy modals, including focus return and containment.
let previousFocus=null;
document.querySelectorAll('.modal-backdrop').forEach(backdrop=>{
 const modal=backdrop.querySelector('.modal');if(!modal)return;
 modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');const title=modal.querySelector('h2');if(title?.id)modal.setAttribute('aria-labelledby',title.id);
 new MutationObserver(()=>{if(backdrop.classList.contains('show')){previousFocus=document.activeElement;requestAnimationFrame(()=>modal.querySelector('input:not([type="hidden"]),select,button')?.focus());}else if(previousFocus?.isConnected){previousFocus.focus();previousFocus=null;}}).observe(backdrop,{attributes:true,attributeFilter:['class']});
});
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('dialog[open],.modal-backdrop.show')){e.preventDefault();$('searchLaunch').click();}
 if(e.key==='Escape'){if(sidebar.classList.contains('drawer-open')){drawer(false);$('menuToggle').focus();}const shown=document.querySelector('.modal-backdrop.show');shown?.querySelector('.modal-close')?.click();}
 if(e.key==='Tab'){const container=document.querySelector('.modal-backdrop.show .modal')||(sidebar.classList.contains('drawer-open')?sidebar:null);if(!container)return;const items=[...container.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
const toast=$('toast');if(toast){toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');}

// Analytics use source records, never the contents of another module's filtered table.
$('dashboardArea').addEventListener('change',renderDashboard);
metrics.before($('boardFilters'));
document.querySelectorAll('.metric-icon').forEach((icon,index)=>{icon.innerHTML=nav[[1,2,3,4,11][index]]?.querySelector('span').innerHTML||'';icon.setAttribute('aria-hidden','true');});
function barChart(id,rows,empty){
 const box=$(id);if(!box)return;const values=rows.filter(row=>row.value>0);box.replaceChildren();
 if(!values.length){const text=document.createElement('p');text.className='chart-empty';text.textContent=empty;box.append(text);return;}
 const max=Math.max(...values.map(row=>row.value),1);
 values.forEach(row=>{const item=document.createElement('div');item.className='vbar-item';item.title=`${row.label}: ${row.value}`;const value=document.createElement('strong');value.className='vbar-value';value.textContent=row.value;const track=document.createElement('div');track.className='vbar-track';const fill=document.createElement('div');fill.className='vbar-fill';fill.style.height=`${Math.max(2,row.value/max*100)}%`;track.append(fill);const label=document.createElement('span');label.className='vbar-label';label.textContent=row.label;item.append(value,track,label);box.append(item);});
}
function analytics(){
 const source=dashboardState(),month=boardMonth(),registered=SSTMetrics.registeredAttendance(source.attendance).filter(row=>row.date.startsWith(month));
 const demo=dashboard.querySelector('.demo-note');if(demo)demo.hidden=state.workers.length>0;
 const areas=new Map();source.workers.filter(w=>w.status==='Activo').forEach(w=>areas.set(w.area||'Sin área',(areas.get(w.area||'Sin área')||0)+1));
 barChart('areaChart',[...areas].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value).slice(0,8),'Sin colaboradores activos en este alcance.');
 barChart('attendanceChart',[['Asistencias','Asistencia'],['Ausencias','Inasistencia'],['Tardanzas','Tardanza']].map(([label,status])=>({label,value:registered.filter(row=>row.status===status).length})),'No hay días registrados en este periodo.');
 const categories=[['EPP','epp','renewal'],['Seguros','insurance','end'],['Médicos','medical','expiry']].map(([label,collection,field])=>({label,value:source[collection].filter(row=>{const days=SSTMetrics.daysUntil(row[field],today());return days!==null&&days<=30;}).length}));
 barChart('alertsChart',categories,'Sin alertas en el alcance elegido.');
 const table=$('dashboardWorkersTbody');table.replaceChildren();
 source.workers.slice(0,8).forEach(worker=>{const row=document.createElement('tr');const name=document.createElement('td');const button=document.createElement('button');button.className='worker-link';button.dataset.action='view-worker';button.dataset.id=worker.id;button.textContent=worker.name;name.append(button);row.append(name);[worker.role,worker.area,worker.status].forEach(value=>{const cell=document.createElement('td');cell.textContent=value||'—';row.append(cell);});table.append(row);});
 if(!source.workers.length){const row=table.insertRow();const cell=row.insertCell();cell.colSpan=4;cell.textContent='Sin colaboradores en el alcance elegido.';}
 const [year,mm]=month.split('-').map(Number),series=[];
 for(let offset=5;offset>=0;offset--){const date=new Date(year,mm-1-offset,1),key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;const days=SSTMetrics.registeredAttendance(source.attendance).filter(row=>row.date.startsWith(key)&&row.status!=='Descanso');const present=days.filter(row=>['Asistencia','Tardanza'].includes(row.status)).length;series.push({label:new Intl.DateTimeFormat('es-PE',{month:'short'}).format(date),total:days.length,pct:days.length?Math.round(present/days.length*100):null});}
 const trend=$('attendanceTrend');trend.replaceChildren();
 series.forEach(item=>{const column=document.createElement('div');column.className='trend-column';const value=document.createElement('strong');value.textContent=item.pct===null?'—':`${item.pct}%`;const track=document.createElement('div');track.className='trend-track';const fill=document.createElement('div');fill.className='trend-fill';fill.style.height=item.pct===null?'0':`${item.pct}%`;track.append(fill);const label=document.createElement('span');label.textContent=item.label;column.title=`${item.label}: ${item.pct===null?'sin registros':item.pct+'%, '+item.total+' días registrados'}`;column.append(value,track,label);trend.append(column);});
 trend.setAttribute('aria-label',series.map(item=>`${item.label}: ${item.pct===null?'sin registros':item.pct+' por ciento'}`).join('; '));
 const current=series.at(-1).pct,previous=series.at(-2).pct,difference=current===null||previous===null?null:current-previous;
 $('trendChange').textContent=difference===null?'Sin comparación disponible':`${difference>0?'+':''}${difference} puntos frente al mes anterior`;
 $('dashboardScope').textContent=$('dashboardArea').value?'Área seleccionada · Metas y programa anual de alcance general. Horas manuales globales excluidas. EPP, seguros y alertas: estado actual.':'Todas las áreas · Metas y programa anual de alcance general. EPP, seguros y alertas: estado actual.';
}
window.addEventListener('sst:dashboard',analytics);analytics();
// Full backup: keep binary evidence alongside the unchanged records.
const toDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
async function snapshot(){
 const owner=window.SSTCloud?.getUser()?.id;
 if(!owner)throw new Error('Inicia sesión para respaldar tu cuenta.');
 const sameOwner=()=>{if(window.SSTCloud?.getUser()?.id!==owner)throw new Error('La sesión cambió. Vuelve a iniciar el respaldo.');};
 const db=await filesDb();sameOwner();
 const records=JSON.parse(JSON.stringify(state));
 const metadata=new Map();
 const seen=new Set();
 const collect=value=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);SSTMetrics.recordFiles(value).forEach(file=>metadata.set(file.id,file));if(Array.isArray(value))value.forEach(collect);else Object.values(value).forEach(collect);};
 collect(records);
 const ids=new Set(metadata.keys());
 const attachments=[];
 for(const id of ids){sameOwner();const key=window.SSTCloud.attachmentCacheKey?window.SSTCloud.attachmentCacheKey(id,owner):id;let value=await new Promise((resolve,reject)=>{const request=db.transaction('files','readonly').objectStore('files').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});sameOwner();if(!value)value=await window.SSTCloud.downloadAttachment(id);sameOwner();if(!value)throw new Error(`No se pudo recuperar el adjunto ${metadata.get(id)?.name||id} desde la nube.`);const meta=metadata.get(id)||{};const data=await toDataUrl(value);sameOwner();attachments.push({id,name:value.name||meta.name||'archivo',type:value.type||meta.type||'',data});}
 return {format:'sst-control-backup',version:1,ownerId:owner,createdAt:new Date().toISOString(),scope:'Módulos originales; vehículos y charlas se conservan por separado en Supabase.',state:records,attachments};
}
function download(data,suffix=''){const blob=new Blob([JSON.stringify(data)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`SST-respaldo${suffix}-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const status=message=>$('backupStatus').textContent=message;
function busy(value){$('downloadBackup').disabled=value;$('restoreBackup').disabled=value;if($('downloadLegacyBackup'))$('downloadLegacyBackup').disabled=value;}
const legacyButton=document.createElement('button');legacyButton.id='downloadLegacyBackup';legacyButton.type='button';legacyButton.className='btn btn-light';legacyButton.textContent='Recuperar respaldo antiguo de este navegador';legacyButton.hidden=true;
$('restoreBackup').after(legacyButton);
window.addEventListener('sst:session',()=>{legacyButton.hidden=!window.SSTCloud?.isSignedIn()||!window.SSTCloud?.hasLegacyBackup?.();});
legacyButton.onclick=async()=>{busy(true);try{const downloaded=await window.SSTCloud.downloadLegacyBackup();status(downloaded?'Copia antigua descargada. Revisa sus datos y usa Restaurar respaldo si corresponde a esta cuenta.':'Recuperación cancelada.');}catch(error){status('No se pudo recuperar la copia antigua: '+error.message);}finally{busy(false);}};
$('downloadBackup').onclick=async()=>{busy(true);status('Preparando registros y evidencias…');try{download(await snapshot());status('Respaldo generado. Revisa la carpeta de descargas.');}catch(e){status('No se pudo crear el respaldo. '+e.message);}finally{busy(false);}};
$('restoreBackup').onclick=()=>$('backupFile').click();
$('backupFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;busy(true);
 const owner=window.SSTCloud?.getUser()?.id;
 let committedLocally=false;
 const sameOwner=()=>{if(!owner||window.SSTCloud?.getUser()?.id!==owner)throw new Error("La sesión cambió. Inicia sesión antes de restaurar.");};
 try{
  status('Validando respaldo…');if(file.size>250*1024*1024)throw new Error('El respaldo supera 250 MB.');
  let data=JSON.parse(await file.text());sameOwner();
  if(data.format!=='sst-control-backup'||data.version!==1||!data.state||!Array.isArray(data.attachments))throw new Error('Formato de respaldo no compatible.');
  SSTWorkspace.validateBackupRecords(data.state,initialState);
  for(const [key,value] of Object.entries(initialState))if(Array.isArray(value)&&(!Array.isArray(data.state[key])||data.state[key].some(r=>!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string')))throw new Error(`La colección ${key} no es válida.`);
  if(data.state.workers.some(w=>typeof w.name!=='string'))throw new Error('Datos de colaboradores no válidos.');
  const includedFiles=new Set(data.attachments.map(a=>a?.id));
  if(SSTMetrics.fileIdsOf(data.state).some(id=>!includedFiles.has(id)))throw new Error('El respaldo no contiene todos los adjuntos referenciados. Conserva el original y genera un respaldo completo.');
  data={...data,...SSTWorkspace.remapBackupFiles(data.state,data.attachments,createId)};
  const files=[];const ids=new Set();
  for(const a of data.attachments){if(typeof a.id!=='string'||ids.has(a.id)||typeof a.name!=='string'||typeof a.data!=='string'||!/^data:[^,]*;base64,/.test(a.data))throw new Error('Adjunto no válido.');ids.add(a.id);const binary=atob(a.data.slice(a.data.indexOf(',')+1));files.push([a.id,new File([Uint8Array.from(binary,c=>c.charCodeAt(0))],a.name,{type:typeof a.type==='string'?a.type:''})]);}
  const next=SSTMetrics.ensureCollections(data.state,initialState);const serialized=JSON.stringify(next);
  if(!confirm(`¿Restaurar ${next.workers.length} colaboradores y ${files.length} adjuntos? Se reemplazarán los registros actuales. Primero se descargará un respaldo de seguridad.`)){status('Restauración cancelada.');return;}
  download(await snapshot(),'-antes-de-restaurar');
  sameOwner();
  // Finish uploading immutable, remapped evidence before publishing the restored JSON.
  if(window.SSTCloud?.getSyncState?.().pending)throw new Error("Sincroniza los cambios pendientes antes de restaurar.");
  const quotaKey=`${STORAGE_KEY}:restore-preflight:${owner}`;
  try{localStorage.setItem(quotaKey,serialized);}finally{localStorage.removeItem(quotaKey);}
  for(const [id,value] of files){sameOwner();await window.SSTCloud.uploadAttachment(id,value);sameOwner();}
  await filesTransaction('readwrite',store=>{for(const [id,value] of files)store.put(value,window.SSTCloud.attachmentCacheKey?window.SSTCloud.attachmentCacheKey(id,owner):id);});
  sameOwner();
  window.SSTCloud.persistLocalState(next);state=next;committedLocally=true;renderAll();
  await window.SSTCloud.syncNow(next);sameOwner();
  status('Respaldo restaurado correctamente.');showToast('Registros y evidencias restaurados.');
 }catch(error){status(committedLocally?'Restauración conservada en este navegador, pendiente de confirmación en Supabase. No repitas la restauración; revisa la sincronización y descarga los cambios pendientes. '+error.message:'No se reemplazaron los registros actuales. '+error.message);}finally{busy(false);e.target.value='';}
};
})();
