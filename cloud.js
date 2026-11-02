/* Private Supabase session, owner-scoped recovery cache and optimistic JSON sync. */
(() => {
    "use strict";
    const CONFIG = window.SST_SUPABASE_CONFIG, BUCKET = "sst-attachments";
    const OWNER_KEY = `${STORAGE_KEY}:owner`, CACHE_PREFIX = `${STORAGE_KEY}:cloud:`, LEGACY_KEY = `${STORAGE_KEY}:legacy`;
    const clone = value => JSON.parse(JSON.stringify(value));
    const canonical = value => value && typeof value === "object"
        ? (Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))) : value;
    const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    let client = null, context = null, generation = 0, syncTimer = null, started = false, sessionTask = null;
    let syncChain = Promise.resolve(), authVersion = 0;
    let syncState = { status: "signedOut", pending: false, ownerId: null, conflict: false };

    document.body.classList.add("cloud-locked");
    document.body.insertAdjacentHTML("beforeend", `
        <section class="cloud-gate" id="cloudGate" aria-labelledby="cloudTitle">
            <form class="cloud-card" id="cloudLogin">
                <span class="cloud-brand">SST / ESPACIO PRIVADO</span>
                <h1 id="cloudTitle">Inicia sesión</h1>
                <p>Accede a tus registros y adjuntos sincronizados en Supabase.</p>
                <label for="cloudEmail">Correo electrónico</label>
                <input id="cloudEmail" name="email" type="email" autocomplete="username" required>
                <label for="cloudPassword">Contraseña</label>
                <input id="cloudPassword" name="password" type="password" autocomplete="current-password" required>
                <button class="btn btn-primary" id="cloudSubmit" type="submit">Entrar</button>
                <button class="btn btn-light" id="cloudReconnect" type="button" hidden>Reintentar conexión</button>
                <p class="cloud-message" id="cloudMessage" role="status" aria-live="polite"></p>
                <small>La cuenta se administra desde el panel de Supabase. No compartas tu contraseña por chat.</small>
            </form>
        </section>`);
    const gate = document.getElementById("cloudGate"), form = document.getElementById("cloudLogin");
    const message = document.getElementById("cloudMessage"), submit = document.getElementById("cloudSubmit"), reconnect = document.getElementById("cloudReconnect");
    function showMessage(text, error = false) { message.textContent = text; message.classList.toggle("is-error", error); }
    function setStatus(status, text, error = false) {
        syncState = { status, pending: Boolean(context?.pending), ownerId: context?.owner.id || null, conflict: Boolean(context?.conflict) };
        const element = document.getElementById("cloudSyncStatus");
        if (element) { element.textContent = text; element.classList.toggle("is-error", error); element.setAttribute("aria-live", "polite"); }
        const retry = document.getElementById("cloudRetry"), recovery = document.getElementById("cloudRecovery"), remote = document.getElementById("cloudLoadRemote");
        if (retry) retry.hidden = !["offline", "conflict"].includes(status);
        if (recovery) recovery.hidden = !context?.pending;
        if (remote) remote.hidden = !context?.conflict;
        window.dispatchEvent(new CustomEvent("sst:sync", { detail: { ...syncState } }));
    }
    function isCurrent(ctx) { return context === ctx && ctx.generation === generation; }
    function assertCurrent(ctx) { if (!ctx || !isCurrent(ctx) || !ctx.ready) throw new Error("La sesión cambió. Vuelve a abrir el formulario con la cuenta actual."); }
    function saveCache(ctx) {
        localStorage.setItem(CACHE_PREFIX + ctx.owner.id, JSON.stringify({ version: 1, ownerId: ctx.owner.id, payload: ctx.local, basePayload: ctx.base, updatedAt: ctx.updatedAt, pending: ctx.pending, conflict: ctx.conflict, unlinkedEvidence: ctx.unlinkedEvidence || [] }));
        // Compatibility mirror; it is never used as a different account's seed.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx.local));
        localStorage.setItem(OWNER_KEY, ctx.owner.id);
    }
    function readCache(ownerId) {
        const raw = localStorage.getItem(CACHE_PREFIX + ownerId);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (cache.version !== 1 || cache.ownerId !== ownerId || !cache.payload || typeof cache.payload !== "object" || Array.isArray(cache.payload)) throw new Error("La copia local necesita revisión. Descarga un respaldo antes de restablecerla.");
        return cache;
    }
    function clearVisibleState() {
        // Retain owner recovery caches and binary originals; clear only the shared mirror.
        try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(OWNER_KEY); } catch { /* Lock and clear the view even if browser storage is unavailable. */ }
        state = SSTMetrics.ensureCollections(clone(initialState), initialState); renderAll();
        if (typeof refreshCurrentReport === "function") refreshCurrentReport();
        document.querySelectorAll(".modal-backdrop.show").forEach(element => element.classList.remove("show"));
        document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
        const searchResults = document.getElementById('searchResults'); if (searchResults) searchResults.replaceChildren();
        if (typeof currentReportOptions !== 'undefined') currentReportOptions = null;
        if (typeof currentReport !== 'undefined') currentReport = null;
        const preview = document.getElementById('reportPreview'); if (preview) preview.srcdoc = '';
        const reportResult = document.getElementById('reportResult'); if (reportResult) reportResult.hidden = true;
    }
    function showGate(text = "") { document.body.classList.add("cloud-locked"); gate.hidden = false; if (text) showMessage(text, true); }
    function disconnect(text = "") {
        clearTimeout(syncTimer); context = null; sessionTask = null; generation++; showGate(text); clearVisibleState();
        window.dispatchEvent(new CustomEvent("sst:session", { detail: { signedIn: false } }));
        setStatus("signedOut", "Sesión cerrada");
    }
    function prepareUtilityBar() {
        const actions = document.querySelector(".utility-actions");
        if (!actions || document.getElementById("cloudSyncStatus")) return;
        const status = document.createElement("span"); status.id = "cloudSyncStatus"; status.className = "cloud-sync-status"; status.textContent = "Conectando…";
        const button = (id, text, action) => { const node = document.createElement("button"); node.id = id; node.className = "btn btn-light cloud-logout"; node.type = "button"; node.textContent = text; node.addEventListener("click", action); return node; };
        const retry = button("cloudRetry", "Reintentar guardado", () => retrySync().catch(() => {})); retry.hidden = true;
        const recovery = button("cloudRecovery", "Descargar cambios pendientes", downloadPending); recovery.hidden = true;
        const remote = button("cloudLoadRemote", "Revisar versión de la nube", async () => {
            if (!confirm("Hay cambios simultáneos. Se conservará una copia de recuperación local y se cargará la versión de la nube. Puedes descargar primero los cambios pendientes. ¿Continuar?")) return;
            try { await loadRemoteState({ preservePending: true }); } catch { setStatus("offline", "No se pudo cargar la nube · cambios conservados", true); }
        }); remote.hidden = true;
        const logout = button("cloudLogout", "Salir", async () => {
            logout.disabled = true;
            try {
                if (context?.pending) {
                    try { await retrySync(); } catch { /* Recovery cache is retained. */ }
                    if (context?.pending && !confirm("Quedan cambios pendientes para esta cuenta en este navegador, sin confirmar en Supabase. ¿Cerrar sesión de todos modos?")) return;
                }
                const { error } = await client.auth.signOut(); if (error) throw error;
                disconnect("Sesión cerrada.");
            } catch { setStatus("offline", "No se pudo cerrar sesión · reintenta", true); }
            finally { logout.disabled = false; }
        });
        actions.prepend(status, retry, recovery, remote, logout);
    }
    async function remoteState(ctx) {
        const { data, error } = await client.from("sst_app_state").select("payload,updated_at").eq("user_id", ctx.owner.id).maybeSingle();
        if (error) throw error; if (!isCurrent(ctx)) throw new Error("La sesión cambió."); return data;
    }
    async function writeState(ctx, snapshot) {
        assertCurrent(ctx); if (ctx.conflict) throw new Error("Hay cambios simultáneos. Revisa ambas versiones antes de continuar.");
        const expected = ctx.updatedAt;
        // Monotonic within this row, even for consecutive saves in the same millisecond.
        const updatedAt = new Date(Math.max(Date.now(), (Date.parse(expected) || 0) + 1)).toISOString();
        const query = expected === null
            ? client.from("sst_app_state").insert({ user_id: ctx.owner.id, payload: snapshot, updated_at: updatedAt })
            : client.from("sst_app_state").update({ payload: snapshot, updated_at: updatedAt }).eq("user_id", ctx.owner.id).eq("updated_at", expected);
        const { data, error } = await query.select("payload,updated_at").maybeSingle(); assertCurrent(ctx);
        if (error && error.code !== "23505") throw error;
        let saved = data;
        if (!saved) {
            // A previous timeout may have committed; only the exact same payload is acknowledged.
            saved = await remoteState(ctx);
            if (!saved || !equal(saved.payload, snapshot)) {
                ctx.conflict = true; saveCache(ctx); setStatus("conflict", "Cambios simultáneos · revisa la versión de la nube", true);
                throw new Error("El estado cambió en otro dispositivo. Tus cambios locales están conservados.");
            }
        }
        ctx.updatedAt = saved.updated_at; ctx.base = clone(saved.payload);
        if (equal(ctx.local, snapshot)) ctx.pending = false;
        saveCache(ctx);
    }
    function enqueue(ctx) {
        const operation = syncChain.catch(() => {}).then(async () => {
            assertCurrent(ctx); if (!ctx.pending) return;
            const snapshot = clone(ctx.local); setStatus("saving", "Guardando en Supabase…"); await writeState(ctx, snapshot);
            if (isCurrent(ctx)) setStatus(ctx.pending ? "saving" : "synced", ctx.pending ? "Guardando cambios recientes…" : "Sincronizado con Supabase");
        });
        syncChain = operation;
        operation.catch(() => { if (isCurrent(ctx)) setStatus(ctx.conflict ? "conflict" : "offline", ctx.conflict ? "Cambios simultáneos · revisa la versión de la nube" : "Pendiente en este navegador · reintenta la conexión", true); });
        return operation;
    }
    function persistLocalState(nextState) { const ctx = context; assertCurrent(ctx); ctx.local = clone(nextState); ctx.pending = !equal(ctx.local, ctx.base); saveCache(ctx); }
    function queueStateSync(nextState) {
        if (!context?.ready) return;
        persistLocalState(nextState); const ctx = context;
        setStatus(ctx.conflict ? "conflict" : "saving", ctx.conflict ? "Cambios simultáneos · cambios locales conservados" : "Guardado local · sincronizando…", ctx.conflict);
        clearTimeout(syncTimer); if (!ctx.conflict) syncTimer = setTimeout(() => enqueue(ctx).catch(() => {}), 500);
    }
    async function syncNow(nextState = state) { persistLocalState(nextState); clearTimeout(syncTimer); await enqueue(context); }
    async function retrySync() {
        const ctx = context; assertCurrent(ctx); clearTimeout(syncTimer);
        if (ctx.conflict) {
            const remote = await remoteState(ctx);
            if (!remote || !equal(remote.payload, ctx.local)) throw new Error("Compara los cambios pendientes con la versión de la nube.");
            ctx.updatedAt = remote.updated_at; ctx.base = clone(remote.payload); ctx.pending = false; ctx.conflict = false; saveCache(ctx); setStatus("synced", "Sincronizado con Supabase"); return;
        }
        await enqueue(ctx);
    }
    function downloadPending() {
        const ctx = context; assertCurrent(ctx);
        const blob = new Blob([JSON.stringify({ format: "sst-pending-state", version: 1, ownerId: ctx.owner.id, createdAt: new Date().toISOString(), state: ctx.local, baseState: ctx.base, updatedAt: ctx.updatedAt })], { type: "application/json" });
        const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `SST-cambios-pendientes-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function hasLegacyBackup() { try { return Boolean(localStorage.getItem(LEGACY_KEY)); } catch { return false; } }
    async function downloadLegacyBackup() {
        const ctx = context; assertCurrent(ctx);
        const raw = localStorage.getItem(LEGACY_KEY);
        if (!raw) throw new Error("No hay una copia antigua sin propietario en este navegador.");
        if (!confirm("La copia antigua puede contener datos personales de otra cuenta de este navegador. Confirma que te pertenecen o tienes autorización para recuperar sus registros y adjuntos. Esta descarga no modifica la nube. ¿Continuar?")) return false;
        const records = JSON.parse(raw), metadata = new Map();
        const collect = value => { if (!value || typeof value !== "object") return; SSTMetrics.recordFiles(value).forEach(file => metadata.set(file.id, file)); Object.values(value).forEach(collect); };
        collect(records);
        const attachments = [];
        for (const [id, meta] of metadata) {
            assertCurrent(ctx);
            if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error("La copia antigua contiene un identificador de adjunto inválido.");
            // Read only the legacy IDs referenced by this explicit recovery, never all browser files.
            const file = await filesTransaction("readonly", store => store.get(id)); assertCurrent(ctx);
            if (!file) throw new Error("Falta un adjunto de la copia antigua. Los originales se conservan; revisa el respaldo del dispositivo de origen.");
            const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
            assertCurrent(ctx); attachments.push({ id, name: file.name || meta.name || "archivo", type: file.type || meta.type || "", data });
        }
        const blob = new Blob([JSON.stringify({ format: "sst-control-backup", version: 1, createdAt: new Date().toISOString(), scope: "Recuperación explícita de datos antiguos de este navegador; propietario original no identificado.", state: records, attachments })], { type: "application/json" });
        const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `SST-respaldo-antiguo-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
    }
    async function loadRemoteState({ preservePending = false } = {}) {
        const ctx = context; assertCurrent(ctx); clearTimeout(syncTimer); await syncChain.catch(() => {}); assertCurrent(ctx);
        if (ctx.pending && !preservePending) throw new Error("Conserva los cambios pendientes antes de cargar la nube.");
        const expected = ctx.updatedAt;
        const remote = await remoteState(ctx); if (!remote?.payload) throw new Error("No existe un estado remoto disponible.");
        if ((ctx.pending && !preservePending) || ctx.updatedAt !== expected) throw new Error("Hubo cambios durante la consulta. Vuelve a revisar la versión de la nube.");
        if (ctx.pending) localStorage.setItem(`${CACHE_PREFIX}${ctx.owner.id}:recovery:${Date.now()}`, JSON.stringify({ ownerId: ctx.owner.id, payload: ctx.local, basePayload: ctx.base, updatedAt: ctx.updatedAt }));
        ctx.local = SSTMetrics.ensureCollections(clone(remote.payload), initialState); ctx.base = clone(remote.payload); ctx.updatedAt = remote.updated_at; ctx.pending = false; ctx.conflict = false;
        saveCache(ctx); state = clone(ctx.local); renderAll(); if (typeof refreshCurrentReport === "function") refreshCurrentReport();
        window.dispatchEvent(new CustomEvent("sst:state", { detail: { source: "cloud" } })); setStatus("synced", "Versión de Supabase cargada");
    }
    async function connectSession(session) {
        if (!session?.user) { disconnect(); return; }
        if (context?.owner.id === session.user.id && context.ready) { context.owner = session.user; return; }
        if (sessionTask?.ownerId === session.user.id) return sessionTask.promise;
        clearTimeout(syncTimer); generation++;
        const ctx = { owner: session.user, generation, ready: false, local: null, base: null, updatedAt: null, pending: false, conflict: false };
        context = ctx; clearVisibleState(); window.dispatchEvent(new CustomEvent("sst:session", { detail: { signedIn: false } }));
        prepareUtilityBar(); showGate(); showMessage("Cargando tus datos…"); setStatus("loading", "Cargando datos…");
        const promise = (async () => {
            try {
                const cached = readCache(ctx.owner.id), remote = await remoteState(ctx); if (!isCurrent(ctx)) return;
                ctx.unlinkedEvidence = Array.isArray(cached?.unlinkedEvidence) ? cached.unlinkedEvidence : [];
                if (cached?.pending) {
                    ctx.local = SSTMetrics.ensureCollections(clone(cached.payload), initialState); ctx.base = cached.basePayload || clone(initialState); ctx.updatedAt = cached.updatedAt; ctx.pending = true;
                    if (remote && equal(remote.payload, ctx.local)) { ctx.base = clone(remote.payload); ctx.updatedAt = remote.updated_at; ctx.pending = false; }
                    else ctx.conflict = (remote?.updated_at || null) !== ctx.updatedAt;
                } else if (remote?.payload && typeof remote.payload === "object" && !Array.isArray(remote.payload)) {
                    ctx.local = SSTMetrics.ensureCollections(clone(remote.payload), initialState); ctx.base = clone(remote.payload); ctx.updatedAt = remote.updated_at;
                } else {
                    // Legacy recovery is an explicit download/restore action, never an account seed.
                    ctx.local = SSTMetrics.ensureCollections(clone(initialState), initialState); ctx.base = null; ctx.pending = true;
                }
                ctx.ready = true; saveCache(ctx); state = clone(ctx.local); renderAll(); gate.hidden = true; document.body.classList.remove("cloud-locked"); showMessage(""); reconnect.hidden = true;
                window.dispatchEvent(new CustomEvent("sst:session", { detail: { signedIn: true } }));
                if (ctx.conflict) setStatus("conflict", "Cambios pendientes y versión remota distinta · revisa ambas", true);
                else if (ctx.pending) await enqueue(ctx); else setStatus("synced", "Sincronizado con Supabase");
            } catch {
                if (!isCurrent(ctx)) return;
                if (ctx.ready) { setStatus(ctx.conflict ? "conflict" : "offline", ctx.conflict ? "Cambios simultáneos · cambios conservados" : "Cambios pendientes en este navegador", true); return; }
                showGate("No se pudieron cargar tus datos. Comprueba la conexión y vuelve a intentarlo."); reconnect.hidden = false; setStatus("offline", "No se pudieron cargar los datos", true);
            }
        })();
        sessionTask = { ownerId: ctx.owner.id, promise }; await promise;
        if (sessionTask?.promise === promise) sessionTask = null;
    }
    function attachmentCacheKey(id, ownerId = context?.owner.id) {
        if (!context?.ready || context.owner.id !== ownerId) throw new Error("La sesión cambió. Vuelve a abrir el adjunto.");
        if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error("Identificador de adjunto inválido.");
        return `sst:${ownerId}:${id}`;
    }
    function objectPath(id, ctx) { attachmentCacheKey(id, ctx?.owner.id); return `${ctx.owner.id}/${id}`; }
    async function uploadAttachment(id, file) {
        const ctx = context; assertCurrent(ctx);
        if (!file || !Number.isFinite(file.size) || file.size < 1 || file.size > 10485760) throw new Error("El adjunto debe pesar entre 1 byte y 10 MB.");
        const { error } = await client.storage.from(BUCKET).upload(objectPath(id, ctx), file, { contentType: file.type || "application/octet-stream", upsert: false }); assertCurrent(ctx); if (error) throw error;
    }
    async function downloadAttachment(id) {
        const ctx = context; assertCurrent(ctx); const { data, error } = await client.storage.from(BUCKET).download(objectPath(id, ctx)); assertCurrent(ctx); if (error) throw error; return data;
    }
    async function deleteAttachment(ids) {
        const ctx = context; assertCurrent(ctx);
        const logicalIds = [...new Set(ids.filter(Boolean))]; logicalIds.forEach(id => objectPath(id, ctx));
        // Removing a record must not destroy evidence before its conditional JSON save
        // succeeds, or erase an attachment still used by another revision/device.
        // Retain private originals for recovery; physical retention is an admin decision.
        ctx.unlinkedEvidence = [...new Set([...(ctx.unlinkedEvidence || []), ...logicalIds])];
        saveCache(ctx);
    }
    form.addEventListener("submit", async event => {
        event.preventDefault(); submit.disabled = true; showMessage("Conectando…");
        try {
            const { data, error } = await client.auth.signInWithPassword({ email: document.getElementById("cloudEmail").value.trim(), password: document.getElementById("cloudPassword").value }); if (error) throw error;
            await connectSession(data.session); form.reset();
        } catch { showMessage("No se pudo iniciar sesión. Verifica el correo y la contraseña de la cuenta creada en Supabase.", true); }
        finally { document.getElementById("cloudPassword").value = ""; submit.disabled = false; }
    });
    reconnect.addEventListener("click", async () => {
        reconnect.disabled = true;
        try { const { data, error } = await client.auth.getSession(); if (error) throw error; await connectSession(data.session); }
        catch { showMessage("La conexión todavía no está disponible. Tus copias locales se conservan.", true); }
        finally { reconnect.disabled = false; }
    });
    async function refreshIfClean() {
        const ctx = context; if (!ctx?.ready || document.hidden) return;
        if (ctx.pending) { if (!ctx.conflict) await retrySync().catch(() => {}); return; }
        try { const remote = await remoteState(ctx); if (!isCurrent(ctx) || ctx.pending || remote?.updated_at === ctx.updatedAt) return; if (remote) await loadRemoteState(); }
        catch { if (isCurrent(ctx)) setStatus("offline", "No se pudo comprobar la versión de la nube", true); }
    }
    window.addEventListener("online", refreshIfClean); window.addEventListener("focus", refreshIfClean);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshIfClean(); });
    window.addEventListener("beforeunload", event => { if (context?.pending) { event.preventDefault(); event.returnValue = ""; } });
    async function start() {
        if (started) return; started = true;
        if (!CONFIG?.url || !CONFIG?.publishableKey || !window.supabase?.createClient) { showGate("Falta configurar la conexión de Supabase."); return; }
        try {
            const legacy = localStorage.getItem(STORAGE_KEY);
            if (legacy && !localStorage.getItem(OWNER_KEY) && !localStorage.getItem(LEGACY_KEY)) localStorage.setItem(LEGACY_KEY, legacy);
            clearVisibleState(); client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
            // Synchronous callback avoids a deadlock with the SDK's auth refresh lock.
            client.auth.onAuthStateChange((event, session) => {
                const version = ++authVersion;
                if (event === "SIGNED_OUT") disconnect("Sesión cerrada.");
                else if (["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) setTimeout(() => { if (authVersion === version) connectSession(session); }, 0);
            });
            const version = authVersion;
            const { data, error } = await client.auth.getSession(); if (error) throw error;
            if (version === authVersion) await connectSession(data.session);
        } catch { showGate("No se pudo conectar con Supabase. Las copias locales se conservan. Revisa la conexión y el almacenamiento del navegador."); reconnect.hidden = false; }
    }
    window.SSTCloud = Object.freeze({ start, getClient: () => client, getUser: () => context?.ready ? context.owner : null, isSignedIn: () => Boolean(context?.ready), getSyncState: () => ({ ...syncState }), persistLocalState, queueStateSync, syncNow, retrySync, loadRemoteState, downloadPending, hasLegacyBackup, downloadLegacyBackup, attachmentCacheKey, uploadAttachment, downloadAttachment, deleteAttachment });
})();
