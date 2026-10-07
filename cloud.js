/* Private Supabase login, JSON state sync, and private attachment storage. */
(() => {
    "use strict";

    const CONFIG = window.SST_SUPABASE_CONFIG;
    const BUCKET = "sst-attachments";
    let client = null;
    let user = null;
    let syncTimer = null;
    let queuedState = null;
    let syncChain = Promise.resolve();

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
                <p class="cloud-message" id="cloudMessage" role="status" aria-live="polite"></p>
                <small>La cuenta se administra desde el panel de Supabase. No compartas tu contraseña por chat.</small>
            </form>
        </section>`);

    const gate = document.getElementById("cloudGate");
    const form = document.getElementById("cloudLogin");
    const message = document.getElementById("cloudMessage");
    const submit = document.getElementById("cloudSubmit");

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.classList.toggle("is-error", isError);
    }

    function setStatus(text, isError = false) {
        const element = document.getElementById("cloudSyncStatus");
        if (!element) return;
        element.textContent = text;
        element.classList.toggle("is-error", isError);
        element.setAttribute("aria-live", "polite");
    }

    function showGate(text = "") {
        document.body.classList.add("cloud-locked");
        gate.hidden = false;
        if (text) showMessage(text);
    }

    function revealApp() {
        gate.hidden = true;
        document.body.classList.remove("cloud-locked");
    }

    function prepareUtilityBar() {
        const actions = document.querySelector(".utility-actions");
        if (!actions || document.getElementById("cloudSyncStatus")) return;
        const status = document.createElement("span");
        status.id = "cloudSyncStatus";
        status.className = "cloud-sync-status";
        status.textContent = "Conectando…";
        const logout = document.createElement("button");
        logout.id = "cloudLogout";
        logout.className = "btn btn-light cloud-logout";
        logout.type = "button";
        logout.textContent = "Salir";
        logout.addEventListener("click", async () => {
            await client.auth.signOut();
            user = null;
            showGate("Sesión cerrada.");
        });
        actions.prepend(status, logout);
    }

    async function loadOrCreateState() {
        const { data, error } = await client
            .from("sst_app_state")
            .select("payload,updated_at")
            .eq("user_id", user.id)
            .maybeSingle();
        if (error) throw error;

        if (data?.payload && typeof data.payload === "object") {
            state = SSTMetrics.ensureCollections(data.payload, initialState);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            renderAll();
            return;
        }

        // First sign-in on this device: seed the private row from existing local data.
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                state = SSTMetrics.ensureCollections(JSON.parse(stored), initialState);
            } catch {
                state = initialState;
            }
        }
        await writeState(state);
        renderAll();
    }

    async function writeState(nextState) {
        if (!user) return;
        const { error } = await client.from("sst_app_state").upsert({
            user_id: user.id,
            payload: nextState,
            updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
        if (error) throw error;
    }

    async function connectSession(session) {
        if (!session?.user) {
            user = null;
            showGate();
            return;
        }
        user = session.user;
        prepareUtilityBar();
        showMessage("");
        try {
            setStatus("Cargando datos…");
            await loadOrCreateState();
            revealApp();
            setStatus("Sincronizado con Supabase");
        } catch (error) {
            console.error("No se pudieron cargar los datos de Supabase.", error);
            showGate("No se pudieron cargar tus datos. Comprueba la conexión e inténtalo de nuevo.");
            setStatus("Sin conexión", true);
        }
    }

    function queueStateSync(nextState) {
        if (!user) return;
        queuedState = JSON.parse(JSON.stringify(nextState));
        setStatus("Guardando…");
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            const snapshot = queuedState;
            syncChain = syncChain.catch(() => {}).then(() => writeState(snapshot));
            syncChain.then(() => {
                if (snapshot === queuedState || JSON.stringify(snapshot) === JSON.stringify(queuedState)) {
                    setStatus("Sincronizado con Supabase");
                }
            }).catch(error => {
                console.error("No se pudo sincronizar con Supabase.", error);
                setStatus("No sincronizado · revisa la conexión", true);
            });
        }, 500);
    }

    async function syncNow(nextState = state) {
        if (!user) throw new Error("Inicia sesión antes de sincronizar.");
        clearTimeout(syncTimer);
        queuedState = JSON.parse(JSON.stringify(nextState));
        await writeState(queuedState);
        setStatus("Sincronizado con Supabase");
    }

    function objectPath(id) {
        if (!user) throw new Error("Inicia sesión para guardar adjuntos.");
        return `${user.id}/${id}`;
    }

    async function uploadAttachment(id, file) {
        const { error } = await client.storage.from(BUCKET).upload(objectPath(id), file, {
            contentType: file.type || "application/octet-stream",
            upsert: true
        });
        if (error) throw error;
    }

    async function downloadAttachment(id) {
        const { data, error } = await client.storage.from(BUCKET).download(objectPath(id));
        if (error) throw error;
        return data;
    }

    async function deleteAttachment(ids) {
        const paths = ids.filter(Boolean).map(objectPath);
        if (!paths.length) return;
        const { error } = await client.storage.from(BUCKET).remove(paths);
        if (error) throw error;
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        submit.disabled = true;
        showMessage("Conectando…");
        const email = document.getElementById("cloudEmail").value.trim();
        const password = document.getElementById("cloudPassword").value;
        try {
            const { data, error } = await client.auth.signInWithPassword({ email, password });
            if (error) throw error;
            await connectSession(data.session);
            form.reset();
        } catch (error) {
            console.error("No se pudo iniciar sesión.", error);
            showMessage("No se pudo iniciar sesión. Verifica el correo y la contraseña de la cuenta creada en Supabase.", true);
        } finally {
            submit.disabled = false;
        }
    });

    async function start() {
        if (!CONFIG?.url || !CONFIG?.publishableKey || !window.supabase?.createClient) {
            showGate("Falta configurar la conexión de Supabase.");
            return;
        }
        client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        try {
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            await connectSession(data.session);
        } catch (error) {
            console.error("No se pudo iniciar la conexión con Supabase.", error);
            showGate("No se pudo conectar con Supabase. Recarga la página e inténtalo otra vez.");
        }
    }

    window.SSTCloud = Object.freeze({
        start,
        isSignedIn: () => Boolean(user),
        queueStateSync,
        syncNow,
        uploadAttachment,
        downloadAttachment,
        deleteAttachment
    });
})();
