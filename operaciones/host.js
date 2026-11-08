/* Host for the two existing safety modules. No legacy module is bootstrapped. */
'use strict';
const STORAGE_KEY = 'reliper_operations_v1';
const initialState = { workers: [] };
let state = { workers: [] };
const pageData = {};
let operationsPage = 'vehiculos', toastTimer;
const operationsDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function showToast(message) {
  const toast = document.getElementById('operations-toast');
  toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
}
function renderAll() {
  const count = state.workers.filter(w => w.status !== 'Inactivo').length;
  document.getElementById('operations-personnel').textContent = window.SSTCloud?.isSignedIn() ? `${count} trabajador${count === 1 ? '' : 'es'} disponible${count === 1 ? '' : 's'}` : 'Acceso privado';
  if (document.getElementById('operations-personnel-dialog').open) renderOperationsPersonnel();
}
function openPage(name) {
  if (!['vehiculos', 'charlas'].includes(name)) return;
  operationsPage = name;
  document.querySelectorAll('.page').forEach(page => { page.hidden = page.id !== 'page-' + name; });
  document.querySelectorAll('.nav-item').forEach(nav => {
    const active = nav.dataset.page === name;
    nav.classList.toggle('active', active); nav.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.getElementById('pageTitle').textContent = pageData[name].title;
  document.getElementById('pageSubtitle').textContent = pageData[name].subtitle;
  document.title = `${pageData[name].title} | RELIPER Operaciones`;
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
async function operationsCanEdit() {
  const owner = window.SSTCloud?.getUser()?.id;
  if (!owner) throw new Error('Inicia sesión para consultar el personal.');
  const { data, error } = await window.SSTCloud.getClient().from('sst_module_roles').select('role').eq('user_id', owner).maybeSingle();
  if (window.SSTCloud?.getUser()?.id !== owner) throw new Error('La sesión cambió. Vuelve a abrir la lista.');
  if (error) throw new Error('No se pudo comprobar tu permiso. Reintenta la conexión.');
  return ['editor', 'admin'].includes(data?.role || 'editor');
}
async function openWorkerModal(workerId = null) {
  if (!(await operationsCanEdit())) throw new Error('Tu permiso solo permite consultar al personal.');
  const owner = window.SSTCloud.getUser().id;
  const worker = workerId ? state.workers.find(w => w.id === workerId) : null;
  if (workerId && !worker) throw new Error('El trabajador ya no está en esta lista. Actualiza los datos.');
  const id = worker?.id || crypto.randomUUID();
  let baseline = JSON.stringify(state);
  const dialog = document.getElementById('operations-worker');
  const field = (label, name, value, extra = '') => `<label>${label}<input name="${name}" value="${escapeHtml(value)}" required maxlength="${name === 'dni' ? 8 : 200}" ${extra}></label>`;
  dialog.innerHTML = `<form><div class="safety-dialog-heading"><h2 id="operations-worker-title">${worker ? 'Corregir trabajador' : 'Agregar trabajador nuevo'}</h2><button class="btn btn-light" type="button" data-worker-close>Cerrar</button></div><div class="safety-dialog-body"><p class="safety-notice">Registra al personal de esta web. Sus datos y charlas se guardan separados de SST-Manager. Las correcciones conservan su historial.</p><div class="safety-grid">${field('Nombres y apellidos', 'name', worker?.name || '')}${field('DNI', 'dni', worker?.dni || '', 'inputmode="numeric" pattern="[0-9]{8}" minlength="8"')}${field('Cargo', 'role', worker?.role || '')}${field('Área', 'area', worker?.area || '')}<label>Estado<select name="status"><option ${worker?.status !== 'Inactivo' ? 'selected' : ''}>Activo</option><option ${worker?.status === 'Inactivo' ? 'selected' : ''}>Inactivo</option></select></label></div><p class="safety-muted">El estado inactivo excluye al trabajador de nuevas convocatorias. Su historial anterior se conserva.</p></div><div class="safety-dialog-footer"><p id="operations-worker-status" class="safety-status" role="status" aria-live="polite"></p><button type="submit" class="btn btn-primary">Guardar trabajador</button></div></form>`;
  const form = dialog.querySelector('form'), close = dialog.querySelector('[data-worker-close]');
  close.onclick = () => dialog.close();
  form.onsubmit = async event => {
    event.preventDefault(); if (dialog.dataset.saving === 'true') return;
    const button = form.querySelector('[type=submit]'), status = form.querySelector('[role=status]');
    button.disabled = close.disabled = true; dialog.dataset.saving = 'true'; form.setAttribute('aria-busy', 'true');
    try {
      if (window.SSTCloud.getUser()?.id !== owner) throw new Error('La sesión cambió. Abre el formulario con la cuenta actual.');
      if (JSON.stringify(state) !== baseline) throw new Error('El personal cambió mientras editabas. Conserva tus datos y vuelve a abrir el formulario con la lista actual.');
      const next = SSTOperationsWorkers.prepare(state, Object.fromEntries(new FormData(form)), id, operationsDate());
      // Stage through the same recoverable, conditional sync used by SST-Manager.
      window.SSTCloud.persistLocalState(next); state = next; baseline = JSON.stringify(state); renderAll();
      status.textContent = 'Guardando trabajador…'; await window.SSTCloud.syncNow(state);
      if (window.SSTCloud.getUser()?.id !== owner) return;
      dialog.close(); showToast('Trabajador guardado. Ya está disponible en las charlas.');
    } catch (error) { status.textContent = error.message + ' Los datos se conservan; revisa el estado de sincronización antes de continuar.'; }
    finally { button.disabled = close.disabled = false; dialog.dataset.saving = 'false'; form.setAttribute('aria-busy', 'false'); }
  };
  dialog.dataset.saving = 'false'; dialog.showModal();
}
async function openOperationsPersonnel() {
  const allowed = await operationsCanEdit(), dialog = document.getElementById('operations-personnel-dialog');
  dialog.dataset.editable = String(allowed);
  dialog.innerHTML = `<div class="safety-dialog-heading"><h2 id="operations-personnel-title">Personal de las charlas</h2><button type="button" class="btn btn-light" id="operations-personnel-close">Cerrar</button></div><div class="safety-dialog-body"><p>Personal de Seguridad operacional. Puedes buscar por nombre, DNI, cargo o área.</p><label class="personnel-search">Buscar personal<input type="search" id="operations-worker-search" placeholder="Nombre, DNI, cargo o área"></label><div id="operations-personnel-list"></div><button type="button" class="btn btn-light" id="operations-personnel-more">Ver todos</button></div>`;
  dialog.dataset.expanded = 'false';
  document.getElementById('operations-personnel-close').onclick = () => dialog.close();
  document.getElementById('operations-worker-search').oninput = renderOperationsPersonnel;
  document.getElementById('operations-personnel-more').onclick = () => { dialog.dataset.expanded = dialog.dataset.expanded === 'true' ? 'false' : 'true'; renderOperationsPersonnel(); };
  dialog.showModal(); renderOperationsPersonnel();
}
function renderOperationsPersonnel() {
  const dialog = document.getElementById('operations-personnel-dialog'), list = document.getElementById('operations-personnel-list');
  if (!list) return;
  const query = SSTSafety.normalize(document.getElementById('operations-worker-search').value);
  const rows = state.workers.filter(w => SSTSafety.normalize([w.name, w.dni, w.role, w.area].join(' ')).includes(query));
  const visible = dialog.dataset.expanded === 'true' ? rows : rows.slice(0, 5);
  list.innerHTML = `<p class="safety-muted" role="status">${visible.length} de ${rows.length} trabajadores</p>` + (visible.map(w => `<article class="personnel-row"><div><strong>${escapeHtml(w.name)}</strong><p>${escapeHtml(w.dni)} · ${escapeHtml(w.role)} · ${escapeHtml(w.area)}</p><small>${escapeHtml(w.status || 'Activo')}</small></div>${dialog.dataset.editable === 'true' ? `<button class="btn btn-light" type="button" data-operations-worker="${escapeHtml(w.id)}">Corregir</button>` : ''}</article>`).join('') || '<p class="safety-empty">No hay personal que coincida con la búsqueda.</p>');
  const more = document.getElementById('operations-personnel-more');
  more.hidden = rows.length <= 5; more.textContent = dialog.dataset.expanded === 'true' ? 'Mostrar solo 5' : `Ver todos (${rows.length})`;
  list.querySelectorAll('[data-operations-worker]').forEach(button => { button.onclick = () => openWorkerModal(button.dataset.operationsWorker).catch(error => showToast(error.message)); });
}
document.querySelector('#operations-worker').addEventListener('cancel', event => { if (event.target.dataset.saving === 'true') event.preventDefault(); });
window.addEventListener('hashchange', () => openPage(location.hash === '#charlas' ? 'charlas' : 'vehiculos'));
window.addEventListener('sst:session', () => {
  document.getElementById('operations-worker').close();
  document.getElementById('operations-personnel-dialog').close();
  renderAll();
});
window.addEventListener('sst:state', () => renderAll());
document.getElementById('operations-date').textContent = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
const themeButton = document.getElementById('operations-theme');
function updateOperationsTheme() { const dark = document.documentElement.dataset.theme === 'dark'; themeButton.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro'); themeButton.setAttribute('aria-pressed', String(dark)); }
themeButton.onclick = () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('reliper_ops_theme', theme); } catch {} updateOperationsTheme(); };
updateOperationsTheme();
