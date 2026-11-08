/* Empty, local-only fixture. No request to Supabase or email providers. */
window.SSTCloud = (() => {
  const vehicles = [], documents = [], settings = [];
  const user = { id: '10000000-0000-4000-8000-000000000001', email: 'prueba@example.test' };
  const list = table => table === 'sst_vehicles' ? vehicles : table === 'sst_documents' ? documents.filter((d,n) => documents.findIndex(x => x.id === d.id) === n) : table === 'sst_document_versions' ? documents : table === 'sst_mail_settings' ? settings : [];
  return {
    start() {
      document.body.classList.remove('cloud-locked'); state.workers = []; renderAll();
      document.querySelector('.utility-bar').insertAdjacentHTML('afterend', '<p class="safety-notice" role="status">VISTA DE PRUEBA · Empieza vacía. Puedes probar los formularios; los datos se borran al recargar y no se envían correos.</p>');
      window.dispatchEvent(new CustomEvent('sst:session', { detail: { signedIn: true } }));
    },
    isSignedIn: () => true, getUser: () => user,
    persistLocalState() {}, async syncNow() {},
    getSyncState: () => ({ status: 'synced', pending: false, conflict: false }),
    getClient() { return {
      functions: { invoke: async () => ({ data: { processed: [] } }) },
      async rpc(name, args) {
        if (name === 'sst_reliper_ready') return { data: true };
        if (name !== 'sst_save_document') return { data: null };
        const payload = structuredClone(args.body);
        window.SSTSafety.validate(args.doc_kind, payload);
        if (payload.reliper) {
          const R = await import('../reliper.mjs'); R.validateReliper(payload.reliper);
          payload.items = R.reliperAggregate(payload.reliper, window.SSTSafety.checklist);
        }
        if (args.doc_kind === 'inspection') payload.vehicle = vehicles.find(v => v.id === payload.vehicleId);
        const now = new Date().toISOString();
        const doc = { id: args.doc_id, document_id: args.doc_id, kind: args.doc_kind, payload, revision: args.expected_revision + 1, created_at: now, recorded_at: now, actor: user.email, reason: args.change_reason };
        documents.unshift(doc); return { data: doc };
      },
      from(table) {
        let mode = 'read', input; const filters = [];
        const rows = () => list(table).filter(row => filters.every(([key, value]) => row[key] === value));
        const finish = () => {
          if (mode === 'insert' || mode === 'upsert') {
            const items = Array.isArray(input) ? input : [input];
            if (table === 'sst_vehicles' && items.some(v => vehicles.some(x => x.plate === v.plate))) return { error: { code: '23505' } };
            const created = items.map(v => ({ revision: 1, user_id: user.id, ...v })); list(table).push(...created); mode = 'read'; return { data: created };
          }
          if (mode === 'update') { const matches = rows(); matches.forEach(row => Object.assign(row, input, { revision: row.revision + 1 })); mode = 'read'; return { data: matches }; }
          return { data: rows() };
        };
        const query = {
          select() { return query; }, limit() { return query; }, order() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
          insert(value) { mode = 'insert'; input = value; return query; }, update(value) { mode = 'update'; input = value; return query; }, upsert(value) { mode = 'upsert'; input = value; return query; },
          range() { return Promise.resolve(finish()); }, maybeSingle() { return Promise.resolve({ data: table === 'sst_module_roles' ? { role: 'admin' } : rows()[0] || null }); },
          then(resolve) { resolve(finish()); }
        }; return query;
      }
    }; }
  };
})();
