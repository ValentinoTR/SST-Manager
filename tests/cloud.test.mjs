import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../cloud.js', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const seed = name => ({ workers: [{ id: 'worker-1', name }], attendance: [], goals: { trainingMonthly: 0 } });
const owner = id => ({ user: { id, email: `${id}@example.test` } });
const stamp = '2026-11-01T00:00:00.000Z';
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function drain() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function backend(rows = {}) {
    return { rows: new Map(Object.entries(rows).map(([id, payload]) => [id, { payload: copy(payload), updated_at: stamp }])), writes: [], reads: [], uploads: [], removals: [], active: 0, maxActive: 0, holdWrite: null, holdRead: null, failWrite: false };
}
function runtime(db, id = 'a', storage = new Map()) {
    const elements = new Map(), events = new Map(), timers = new Map(); let nextTimer = 1, authCallback, session = id ? owner(id) : null;
    const node = () => {
        const listeners = new Map(), values = new Set();
        const element = { hidden: false, disabled: false, value: '', textContent: '', listeners, classList: { add: x => values.add(x), remove: x => values.delete(x), contains: x => values.has(x), toggle(x, yes) { if (yes) values.add(x); else values.delete(x); } }, setAttribute() {}, addEventListener(type, fn) { listeners.set(type, fn); }, prepend(...nodes) { nodes.forEach(n => { if (n.id) elements.set(n.id, n); }); }, insertAdjacentHTML() {}, click() {}, reset() {} };
        return element;
    };
    const get = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
    // query existing nodes, without inventing the utility status before it is created.
    ['cloudGate','cloudLogin','cloudMessage','cloudSubmit','cloudReconnect','cloudPassword','cloudEmail'].forEach(get);
    const utility = node(), body = node();
    const query = table => {
        assert.equal(table, 'sst_app_state'); let mode = 'read', body, filters = {};
        const chain = { select() { return chain; }, eq(key, value) { filters[key] = value; return chain; }, insert(value) { mode = 'insert'; body = copy(value); return chain; }, update(value) { mode = 'update'; body = copy(value); return chain; }, async maybeSingle() {
            const uid = filters.user_id || body?.user_id;
            if (mode === 'read') { const hold = db.holdRead; db.holdRead = null; if (hold) await hold.promise; db.reads.push(uid); return { data: uid === session?.user.id ? copy(db.rows.get(uid) || null) : null, error: null }; }
            db.active++; db.maxActive = Math.max(db.maxActive, db.active); db.writes.push({ mode, uid, body, filters: { ...filters } });
            try {
                const hold = db.holdWrite; db.holdWrite = null; if (hold) await hold.promise;
                if (db.failWrite) return { data: null, error: { code: 'network' } };
                if (uid !== session?.user.id) return { data: null, error: { code: '42501' } };
                const current = db.rows.get(uid);
                if (mode === 'insert' && current) return { data: null, error: { code: '23505' } };
                if (mode === 'update' && (!current || current.updated_at !== filters.updated_at)) return { data: null, error: null };
                const saved = { payload: copy(body.payload), updated_at: body.updated_at }; db.rows.set(uid, saved); return { data: copy(saved), error: null };
            } finally { db.active--; }
        } };
        return chain;
    };
    const client = { from: query, auth: { onAuthStateChange(fn) { authCallback = fn; return { data: { subscription: { unsubscribe() {} } } }; }, async getSession() { return { data: { session }, error: null }; }, async signOut() { session = null; authCallback('SIGNED_OUT', null); return { error: null }; } }, storage: { from(bucket) { assert.equal(bucket, 'sst-attachments'); return { async upload(path, file, opts) { db.uploads.push({ path, file, opts }); return { error: null }; }, async download(path) { return { data: new Blob([path]), error: null }; }, async remove(paths) { db.removals.push(paths); return { error: null }; } }; } } };
    const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    const document = { body, hidden: false, getElementById: id => elements.get(id) || null, createElement: node, querySelector: selector => selector === '.utility-actions' ? utility : null, querySelectorAll: () => [], addEventListener(type, fn) { events.set(type, fn); } };
    const window = { SST_SUPABASE_CONFIG: { url: 'https://example.test', publishableKey: 'public' }, supabase: { createClient: () => client }, addEventListener(type, fn) { events.set(type, fn); }, dispatchEvent() {} };
    const ctx = vm.createContext({ window, document, localStorage, console, Blob, URL, Date, confirm: () => false, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }, setTimeout(fn, delay) { const n = nextTimer++; timers.set(n, { fn, delay }); return n; }, clearTimeout(n) { timers.delete(n); }, STORAGE_KEY: 'sst_control_v2', initialState: { workers: [], attendance: [], goals: { trainingMonthly: 0 } }, state: seed('unowned'), SSTMetrics: { ensureCollections(saved, defaults) { return { ...copy(defaults), ...copy(saved) }; } }, renderAll() {}, refreshCurrentReport() {} });
    vm.runInContext(source, ctx);
    return { api: window.SSTCloud, ctx, storage, elements, body, async start() { await window.SSTCloud.start(); await drain(); }, readState: () => copy(vm.runInContext('state', ctx)), auth(event, id) { session = id ? owner(id) : null; authCallback(event, session); }, async timers(delay) { const current = [...timers.entries()].filter(([, item]) => item.delay === delay); for (const [n, item] of current) { timers.delete(n); item.fn(); } await drain(); } };
}

test('Dos dispositivos no sobrescriben el JSON simultáneo; conservan recuperación por UID', async () => {
    const db = backend({ a: seed('Original') }), first = runtime(db), second = runtime(db);
    await first.start(); await second.start();
    await first.api.syncNow(seed('Cambio del dispositivo 1'));
    await assert.rejects(second.api.syncNow(seed('Cambio del dispositivo 2')), /otro dispositivo/);
    assert.equal(db.rows.get('a').payload.workers[0].name, 'Cambio del dispositivo 1');
    assert.equal(second.api.getSyncState().conflict, true);
    assert.equal(JSON.parse(second.storage.get('sst_control_v2:cloud:a')).payload.workers[0].name, 'Cambio del dispositivo 2');
    const reopened = runtime(db, 'a', second.storage); await reopened.start();
    assert.equal(reopened.api.getSyncState().conflict, true); assert.equal(reopened.readState().workers[0].name, 'Cambio del dispositivo 2');
    await assert.rejects(reopened.api.loadRemoteState(), /Conserva/);
    await reopened.api.loadRemoteState({ preservePending: true });
    assert.equal(reopened.readState().workers[0].name, 'Cambio del dispositivo 1');
    const recovery = [...second.storage.entries()].find(([key]) => key.includes(':recovery:'));
    assert.equal(JSON.parse(recovery[1]).payload.workers[0].name, 'Cambio del dispositivo 2');
});

test('syncNow y autoguardado usan una única cola y versiones sucesivas', async () => {
    const db = backend({ a: seed('Original') }), app = runtime(db); await app.start();
    const hold = deferred(); db.holdWrite = hold;
    app.api.queueStateSync(seed('Primero')); await app.timers(500);
    const second = app.api.syncNow(seed('Segundo')); await drain(); assert.equal(db.writes.length, 1);
    hold.resolve(); await second;
    assert.equal(db.maxActive, 1); assert.equal(db.rows.get('a').payload.workers[0].name, 'Segundo');
    assert.notEqual(db.writes[1].filters.updated_at, stamp); assert.equal(app.api.getSyncState().pending, false);
});

test('Cambio de cuenta cancela la cola antigua y nunca copia datos del usuario anterior', async () => {
    const db = backend({ a: seed('Cuenta A'), b: seed('Cuenta B') }), app = runtime(db); await app.start();
    app.api.queueStateSync(seed('Pendiente A')); app.auth('SIGNED_IN', 'b'); await app.timers(0); await app.timers(500);
    assert.equal(app.api.getUser().id, 'b'); assert.equal(app.readState().workers[0].name, 'Cuenta B'); assert.equal(db.writes.length, 0);
    assert.equal(JSON.parse(app.storage.get('sst_control_v2:cloud:a')).payload.workers[0].name, 'Pendiente A');
    assert.equal(db.rows.get('b').payload.workers[0].name, 'Cuenta B');
});

test('Escritura antigua en curso y respuestas tardías no cambian la vista de otra cuenta', async () => {
    const db = backend({ a: seed('Cuenta A'), b: seed('Cuenta B') }), app = runtime(db); await app.start();
    const hold = deferred(); db.holdWrite = hold;
    const oldWrite = app.api.syncNow(seed('Cambio A')); await drain();
    app.auth('SIGNED_IN', 'b'); await app.timers(0); hold.resolve(); await assert.rejects(oldWrite, /sesión cambió/);
    assert.equal(app.api.getUser().id, 'b'); assert.equal(app.readState().workers[0].name, 'Cuenta B'); assert.equal(db.rows.get('b').payload.workers[0].name, 'Cuenta B');
});

test('SIGNED_OUT limpia la vista y una notificación SIGNED_IN encolada no la revive', async () => {
    const db = backend({ a: seed('Privado') }), app = runtime(db); await app.start();
    app.auth('SIGNED_IN', 'a'); app.auth('SIGNED_OUT', null); await app.timers(0);
    assert.equal(app.api.isSignedIn(), false); assert.equal(app.readState().workers.length, 0); assert.equal(app.storage.has('sst_control_v2'), false); assert.equal(app.elements.get('cloudGate').hidden, false);
});

test('Renovar token no recarga sobre cambios locales y no usa la caché global como seed ajeno', async () => {
    const db = backend({ a: seed('Privado') }), app = runtime(db); await app.start(); app.api.queueStateSync(seed('Pendiente'));
    app.auth('TOKEN_REFRESHED', 'a'); await app.timers(0); assert.equal(app.readState().workers[0].name, 'Privado'); assert.equal(app.api.getSyncState().pending, true);
    const oldStorage = new Map([['sst_control_v2', JSON.stringify(seed('Legacy privado'))]]), newcomer = runtime(backend(), 'b', oldStorage); await newcomer.start();
    assert.equal(newcomer.readState().workers.length, 0); assert.equal(JSON.parse(oldStorage.get('sst_control_v2:legacy')).workers[0].name, 'Legacy privado');
});

test('Reintento tras corte de red conserva cambios y reconoce una respuesta perdida sin duplicar', async () => {
    const db = backend({ a: seed('Original') }), app = runtime(db); await app.start(); db.failWrite = true;
    await assert.rejects(app.api.syncNow(seed('Pendiente'))); assert.equal(app.api.getSyncState().status, 'offline');
    db.failWrite = false; await app.api.retrySync(); assert.equal(db.rows.get('a').payload.workers[0].name, 'Pendiente');
    // Simulate a committed request whose success response was lost, with JSONB key ordering.
    const changed = seed('Respuesta perdida'); db.failWrite = true; await assert.rejects(app.api.syncNow(changed)); db.failWrite = false;
    db.rows.set('a', { payload: { goals: changed.goals, attendance: [], workers: changed.workers }, updated_at: '2027-01-01T00:00:00.000Z' });
    await app.api.retrySync(); assert.equal(app.api.getSyncState().pending, false); assert.equal(app.api.getSyncState().conflict, false);
});

test('Adjuntos se aíslan por UID, rechazan rutas manipuladas y no reemplazan archivos', async () => {
    const db = backend({ a: seed('Cuenta A'), b: seed('Cuenta B') }), app = runtime(db); await app.start();
    assert.equal(app.api.attachmentCacheKey('file-1'), 'sst:a:file-1'); assert.throws(() => app.api.attachmentCacheKey('../b/file'), /inválido/);
    await assert.rejects(app.api.uploadAttachment('file', new Blob([])), /10 MB/);
    await app.api.uploadAttachment('file-1', new Blob(['evidencia'], { type: 'application/pdf' }));
    assert.equal(db.uploads[0].path, 'a/file-1'); assert.equal(db.uploads[0].opts.upsert, false);
    app.auth('SIGNED_IN', 'b'); await app.timers(0); assert.equal(app.api.attachmentCacheKey('file-1'), 'sst:b:file-1'); assert.throws(() => app.api.attachmentCacheKey('file-1', 'a'), /sesión cambió/);
});

test('Eliminar registros conserva evidencia privada ante conflictos y cambio de cuenta', async()=>{
 const original={...seed('Original'),medical:[{id:'record-1',attachment:{id:'file-1',name:'evidencia.pdf'}}]};
 const db=backend({a:original,b:seed('Otra cuenta')}),one=runtime(db),two=runtime(db);await one.start();await two.start();
 await two.api.deleteAttachment(['file-1']);assert.equal(db.removals.length,0);
 await one.api.syncNow({...original,workers:[{id:'worker-1',name:'Actualizado'}]});
 await assert.rejects(two.api.syncNow(seed('Cambio local sin archivo')),/otro dispositivo/);
 assert.equal(db.removals.length,0);assert.equal(db.rows.get('a').payload.medical[0].attachment.id,'file-1');
 assert.deepEqual(JSON.parse(two.storage.get('sst_control_v2:cloud:a')).unlinkedEvidence,['file-1']);
 two.auth('SIGNED_IN','b');await two.timers(0);assert.equal(db.removals.length,0);
});
