/* Resource boundary for this entry point. Original SST-Manager is untouched. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SSTOperationsClient = api;
    if (root.supabase?.createClient) {
      const createClient = root.supabase.createClient.bind(root.supabase);
      root.supabase = { ...root.supabase, createClient: (url, key, options = {}) => api.scope(createClient(url, key, { ...options, auth: { ...options.auth, storageKey: 'reliper_operations_auth_v1' } })) };
    }
  }
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const tables = new Set(['app_state','module_roles','vehicles','documents','document_versions','critical_defects','module_audit','mail_settings','report_jobs','vehicle_status']);
  const calls = new Set(['can_edit','save_document','resolve_defect','reliper_ready']);
  function resource(name, allowed) {
    const suffix = typeof name === 'string' && name.startsWith('sst_') ? name.slice(4) : '';
    if (!allowed.has(suffix)) throw new Error('Recurso no disponible en Seguridad operacional.');
    return 'ops_' + suffix;
  }
  function scope(client) {
    function query(builder) {
      return new Proxy(builder, { get(target, key) {
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        return (...args) => {
          if (key === 'eq' && args[0] === 'entity' && ['sst_vehicles','sst_mail_settings'].includes(args[1])) args[1] = args[1].replace('sst_', 'ops_');
          const next = value.apply(target, args);
          return next === target || (next && typeof next.select === 'function') ? query(next) : next;
        };
      } });
    }
    return Object.freeze({
      from: name => query(client.from(resource(name, tables))),
      rpc: (name, args) => client.rpc(resource(name, calls), args),
      auth: new Proxy(client.auth, { get(target, key) {
        if (key === 'signOut') return options => target.signOut({ ...options, scope: 'local' });
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } }),
      storage: { from(name) {
        if (name !== 'sst-safety') throw new Error('Esta página solo gestiona evidencias de inspecciones y charlas.');
        return client.storage.from('ops-safety');
      } },
      functions: { invoke(name, options) {
        if (name !== 'sst-reports') throw new Error('Función no disponible en Seguridad operacional.');
        return client.functions.invoke('ops-reports', options);
      } }
    });
  }
  return Object.freeze({ scope });
});
