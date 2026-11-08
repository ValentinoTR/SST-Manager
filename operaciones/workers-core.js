/* Update the shared roster without rebuilding or trimming the existing state. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SSTOperationsWorkers = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function prepare(current, values, id, date) {
    if (!current || !Array.isArray(current.workers)) throw new Error('Actualiza la lista de trabajadores antes de guardar.');
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error('Identificador de trabajador inválido.');
    const data = {};
    for (const key of ['name', 'dni', 'role', 'area']) {
      data[key] = String(values[key] || '').trim();
      if (!data[key] || data[key].length > 200) throw new Error('Completa nombre, DNI, cargo y área (máximo 200 caracteres).');
    }
    if (!/^\d{8}$/.test(data.dni)) throw new Error('El DNI debe tener exactamente 8 dígitos.');
    if (current.workers.some(w => w.id !== id && String(w.dni || '').trim() === data.dni)) throw new Error('Este DNI ya está registrado. Busca y corrige al trabajador existente.');
    if (!['Activo', 'Inactivo'].includes(values.status)) throw new Error('Selecciona el estado del trabajador.');
    const next = JSON.parse(JSON.stringify(current));
    const index = next.workers.findIndex(w => w.id === id);
    const original = index >= 0 ? next.workers[index] : { id, joined: date };
    const worker = { ...original, ...data, status: values.status };
    if (index >= 0) next.workers[index] = worker;
    else next.workers.push(worker);
    return next;
  }
  return Object.freeze({ prepare });
});
