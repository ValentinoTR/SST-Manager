/* =========================================================
   SST CONTROL
   Sistema básico de gestión de personal y SST
   ========================================================= */


/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const STORAGE_KEY = "sst_control_v2";


function createId() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 8)
    );
}


function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}


function currentMonth() {
    return today().slice(0, 7);
}


/* =========================================================
   DATOS INICIALES
   ========================================================= */

const initialState = {

    workers: [

        {
            id: createId(),
            dni: "45871236",
            name: "Carlos Mendoza",
            role: "Operario",
            area: "Operaciones",
            phone: "999 111 222",
            joined: "2026-01-10",
            status: "Activo"
        },

        {
            id: createId(),
            dni: "71234568",
            name: "Luis Ramírez",
            role: "Técnico",
            area: "Mantenimiento",
            phone: "999 222 333",
            joined: "2026-01-15",
            status: "Activo"
        },

        {
            id: createId(),
            dni: "63542178",
            name: "José Torres",
            role: "Operario",
            area: "Operaciones",
            phone: "999 333 444",
            joined: "2026-02-01",
            status: "Activo"
        },

        {
            id: createId(),
            dni: "48579632",
            name: "Miguel Flores",
            role: "Supervisor",
            area: "Producción",
            phone: "999 444 555",
            joined: "2026-02-05",
            status: "Activo"
        },

        {
            id: createId(),
            dni: "70894563",
            name: "Andrés Vega",
            role: "Operario",
            area: "Producción",
            phone: "999 555 666",
            joined: "2026-02-12",
            status: "Activo"
        },

        {
            id: createId(),
            dni: "60214587",
            name: "Pedro Salazar",
            role: "Técnico",
            area: "Mantenimiento",
            phone: "999 666 777",
            joined: "2026-03-01",
            status: "Activo"
        },

        {
            id: createId(),
            dni: "74125896",
            name: "Juan Rojas",
            role: "Ayudante",
            area: "Operaciones",
            phone: "999 777 888",
            joined: "2026-03-08",
            status: "Activo"
        }

    ],

    attendance: [],

    epp: [],

    insurance: [],

    training: [],

    medical: [],

    findings: [],

    inspections: [],

    incidents: [],

    iperc: [],
    program: [],
    hours: [],

    goals: {
        trainingMonthly: 0,
        trainingYearly: 0
    }

};


/* =========================================================
   GUARDADO
   ========================================================= */

function loadState() {

    try {

        const saved =
            localStorage.getItem(STORAGE_KEY);

        if (saved) {
            return SSTMetrics.ensureCollections(
                JSON.parse(saved),
                initialState
            );
        }

    } catch (error) {

        console.error(
            "No se pudo cargar la información.",
            error
        );

    }

    return initialState;

}


let state = loadState();


function saveState() {

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        alert("No se pudo guardar el cambio en este navegador. No cierres la página: descarga un respaldo desde Respaldos para conservar la información. Revisa el espacio disponible y los permisos de almacenamiento.");
        throw error;
    }

    renderAll();

}


/* =========================================================
   ELEMENTOS DEL DOM
   ========================================================= */

const modalBackdrop =
    document.getElementById("modalBackdrop");

const modalForm =
    document.getElementById("modalForm");

const modalFields =
    document.getElementById("modalFields");

const modalTitle =
    document.getElementById("modalTitle");

const modalSubmit =
    document.getElementById("modalSubmit");

const toast =
    document.getElementById("toast");


let currentSubmitFunction = null;

// Definición de campos del modal abierto (para leer archivos
// múltiples y casillas de verificación al guardar).
let currentFields = [];


/* =========================================================
   UTILIDADES
   ========================================================= */

function escapeHtml(value = "") {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function formatDate(date) {

    if (!date) {
        return "—";
    }

    const [year, month, day] =
        date.split("-");

    return `${day}/${month}/${year}`;

}


function getWorker(id) {

    return state.workers.find(
        worker => worker.id === id
    );

}


function workerName(id) {

    const worker = getWorker(id);

    return worker
        ? worker.name
        : "Colaborador eliminado";

}


function initials(name) {

    return name
        .split(" ")
        .slice(0, 2)
        .map(word => word.charAt(0))
        .join("")
        .toUpperCase();

}


function showToast(message) {

    toast.textContent = message;

    toast.classList.add("show");

    setTimeout(() => {

        toast.classList.remove("show");

    }, 2300);

}


/* =========================================================
   ARCHIVOS ADJUNTOS
   Los archivos (certificados, constancias, fotos) se guardan
   en IndexedDB para no llenar el límite de localStorage; el
   registro solo conserva nombre, tipo y tamaño.
   ========================================================= */

const FILES_DB_NAME = "sst_control_files";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

let filesDbPromise = null;


function filesDb() {

    if (!filesDbPromise) {

        filesDbPromise =
            new Promise((resolve, reject) => {

                const request =
                    indexedDB.open(FILES_DB_NAME, 1);

                request.onupgradeneeded = () => {
                    request.result.createObjectStore("files");
                };

                request.onsuccess = () => resolve(request.result);

                request.onerror = () => reject(request.error);

            });

        filesDbPromise.catch(() => {
            filesDbPromise = null;
        });

    }

    return filesDbPromise;

}


async function filesTransaction(mode, work) {

    const db = await filesDb();

    return new Promise((resolve, reject) => {

        const tx = db.transaction("files", mode);

        const request = work(tx.objectStore("files"));

        tx.oncomplete = () => resolve(request ? request.result : undefined);

        tx.onerror = () => reject(tx.error);

        tx.onabort = () => reject(tx.error);

    });

}


// Devuelve { id, name, type, size } o null si no hay archivo.
async function storeAttachment(file) {

    if (!(file instanceof File) || file.size === 0) {
        return null;
    }

    if (file.size > MAX_FILE_BYTES) {

        showToast("El archivo supera los 10 MB y no se adjuntó.");

        return null;

    }

    try {

        const id = createId();

        await filesTransaction(
            "readwrite",
            store => store.put(file, id)
        );

        return {
            id,
            name: file.name,
            type: file.type,
            size: file.size
        };

    } catch (error) {

        console.error("No se pudo guardar el archivo.", error);

        showToast("No se pudo guardar el archivo adjunto.");

        return null;

    }

}


// Separa el archivo del resto de los datos del formulario.
async function withAttachment(data) {

    const { attachment: file, ...rest } = data;

    const meta = await storeAttachment(file);

    return meta ? { ...rest, attachment: meta } : rest;

}


async function dropAttachments(ids) {

    const list = ids.filter(Boolean);

    if (list.length === 0) {
        return;
    }

    try {

        await filesTransaction(
            "readwrite",
            store => {
                list.forEach(id => store.delete(id));
            }
        );

    } catch (error) {

        console.error("No se pudieron borrar los archivos.", error);

    }

}


async function openAttachment(id) {

    try {

        const blob =
            await filesTransaction(
                "readonly",
                store => store.get(id)
            );

        if (!blob) {

            showToast("El archivo ya no está disponible en este navegador.");

            return;

        }

        const url = URL.createObjectURL(blob);

        window.open(url, "_blank");

        setTimeout(() => URL.revokeObjectURL(url), 60000);

    } catch (error) {

        console.error("No se pudo abrir el archivo.", error);

        showToast("No se pudo abrir el archivo.");

    }

}


function attachmentField(label, multiple = false) {

    return {
        name: "attachment",
        label: multiple
            ? `📎 ${label} (opcional, puedes elegir varios)`
            : `📎 ${label} (opcional)`,
        type: "file",
        accept: "image/*,.pdf",
        full: true,
        multiple
    };
}


// Guarda uno o varios archivos y devuelve la lista de metadatos.
async function storeAttachments(files) {

    const list =
        (Array.isArray(files) ? files : [files])
            .filter(file => file instanceof File && file.size > 0);

    const stored = [];

    for (const file of list) {
        const meta = await storeAttachment(file);
        if (meta) {
            stored.push(meta);
        }
    }

    return stored;
}


// Igual que withAttachment, pero admite varios archivos:
// los guarda en "attachments".
async function withAttachments(data) {

    const { attachment: files, ...rest } = data;

    const stored =
        await storeAttachments(files);

    return stored.length
        ? { ...rest, attachments: stored }
        : rest;
}


// Pasa el archivo antiguo (attachment) a la lista nueva.
function normalizeFiles(target) {

    target.attachments =
        SSTMetrics.recordFiles(target);

    delete target.attachment;

    return target.attachments;
}



function attachmentButton(record, label = "Archivo") {

    const files =
        SSTMetrics.recordFiles(record);

    return files.map((file, index) => `
        <button
            type="button"
            class="btn btn-light btn-small"
            data-action="open-file"
            data-file="${escapeHtml(file.id)}"
            title="${escapeHtml(file.name)}"
        >
            📎 ${escapeHtml(files.length > 1 ? `${label} ${index + 1}` : label)}
        </button>
    `).join("");
}


/* ---------- Gestor de evidencias (ver, agregar, quitar) ---------- */

// ctx = { collection, id, obs?, month? }
function resolveEvidenceTarget(ctx) {

    const record =
        (state[ctx.collection] || [])
            .find(item => item.id === ctx.id);

    if (!record) {
        return null;
    }

    if (ctx.obs) {
        return (record.observations || [])
            .find(item => item.id === ctx.obs) || null;
    }

    if (ctx.month) {
        return record.executions?.[ctx.month] || null;
    }

    return record;
}

function evidenceData(ctx) {

    return `
        data-collection="${escapeHtml(ctx.collection)}"
        data-id="${escapeHtml(ctx.id)}"
        data-obs="${escapeHtml(ctx.obs || "")}"
        data-month="${escapeHtml(ctx.month || "")}"
    `;
}

function evidenceCtxFrom(button) {

    return {
        collection: button.dataset.collection,
        id: button.dataset.id,
        obs: button.dataset.obs || "",
        month: button.dataset.month || ""
    };
}

function evidenceButton(ctx, count, label = "Evidencias") {

    return `
        <button
            type="button"
            class="btn btn-light btn-small"
            data-action="manage-evidence"
            data-title="${escapeHtml(label)}"
            ${evidenceData(ctx)}
            title="Ver o agregar evidencias"
        >
            📎 ${count ? `${escapeHtml(label)} (${count})` : `+ ${escapeHtml(label)}`}
        </button>
    `;
}

function evidenceListHtml(target, ctx) {

    const files =
        SSTMetrics.recordFiles(target);

    if (files.length === 0) {
        return `<div class="evidence-empty">Aún no hay evidencias adjuntas.</div>`;
    }

    return `
        <ul class="evidence-list">
            ${files.map(file => `
                <li>
                    <span class="evidence-name" title="${escapeHtml(file.name)}">
                        ${file.type && file.type.startsWith("image/") ? "🖼" : "📄"}
                        ${escapeHtml(file.name)}
                        <small>${Math.max(1, Math.round((file.size || 0) / 1024))} KB</small>
                    </span>
                    <span class="actions">
                        <button
                            type="button"
                            class="btn btn-light btn-small"
                            data-action="open-file"
                            data-file="${escapeHtml(file.id)}"
                        >
                            Abrir
                        </button>
                        <button
                            type="button"
                            class="btn btn-danger btn-small"
                            data-action="remove-evidence"
                            data-file="${escapeHtml(file.id)}"
                            ${evidenceData(ctx)}
                        >
                            Quitar
                        </button>
                    </span>
                </li>
            `).join("")}
        </ul>
    `;
}

// Se llama después de quitar una evidencia para refrescar el modal abierto
let evidenceReopen = null;

function openEvidenceModal(ctx, title = "Evidencias") {

    const target =
        resolveEvidenceTarget(ctx);

    if (!target) {
        showToast("El registro ya no existe.");
        return;
    }

    openModal({
        title,
        submitText: "Guardar evidencias",
        fields: [
            {
                type: "html",
                html: evidenceListHtml(target, ctx)
            },
            attachmentField("Agregar archivos (fotos o PDF)", true)
        ],
        async onSubmit(data) {

            modalSubmit.disabled = true;

            const stored =
                await storeAttachments(data.attachment);

            const current =
                resolveEvidenceTarget(ctx);

            if (current && stored.length) {
                normalizeFiles(current).push(...stored);
                saveState();
                showToast(`${stored.length} evidencia(s) agregada(s).`);
            }

            closeModal();
        }
    });

    evidenceReopen =
        () => openEvidenceModal(ctx, title);
}

function removeEvidence(ctx, fileId) {

    const target =
        resolveEvidenceTarget(ctx);

    if (!target) {
        return;
    }

    if (!confirm("¿Quitar esta evidencia? El archivo se borrará de este navegador.")) {
        return;
    }

    target.attachments =
        SSTMetrics.recordFiles(target)
            .filter(file => file.id !== fileId);

    delete target.attachment;

    dropAttachments([fileId]);

    saveState();

    showToast("Evidencia quitada.");

    evidenceReopen?.();
}



/* =========================================================
   ESTADOS Y VENCIMIENTOS
   ========================================================= */

function daysUntil(dateString) {

    if (!dateString) {
        return null;
    }

    const end =
        new Date(dateString + "T00:00:00");

    const now =
        new Date(today() + "T00:00:00");

    return Math.ceil(
        (end - now) /
        (1000 * 60 * 60 * 24)
    );

}


function expirationState(dateString) {

    if (!dateString) {

        return {
            text: "Sin fecha",
            className: "badge-gray"
        };

    }

    const days =
        daysUntil(dateString);

    if (days < 0) {

        return {
            text: "Vencido",
            className: "badge-red"
        };

    }

    if (days <= 30) {

        return {
            text: "Por vencer",
            className: "badge-yellow"
        };

    }

    return {
        text: "Vigente",
        className: "badge-green"
    };

}


/* =========================================================
   NAVEGACIÓN
   ========================================================= */

const pageData = {

    dashboard: {
        title: "Dashboard",
        subtitle:
            "Resumen general del personal y cumplimiento SST."
    },

    colaboradores: {
        title: "Colaboradores",
        subtitle:
            "Administración de trabajadores y datos personales."
    },

    asistencia: {
        title: "Asistencia",
        subtitle:
            "Control de asistencia e inasistencia del personal."
    },

    epp: {
        title: "Equipos de Protección Personal",
        subtitle:
            "Entrega y control de EPP por colaborador."
    },

    seguros: {
        title: "Seguros",
        subtitle:
            "Control de seguros y pólizas vigentes."
    },

    capacitaciones: {
        title: "Capacitaciones",
        subtitle:
            "Cursos, entrenamientos y formación SST."
    },

    examenes: {
        title: "Exámenes médicos",
        subtitle:
            "Control de exámenes médicos ocupacionales."
    },

    hallazgos: {
        title: "Hallazgos",
        subtitle:
            "HPH, HPI y mejoras continuas observadas y levantadas."
    },

    inspecciones: {
        title: "Inspecciones",
        subtitle:
            "Inspecciones realizadas y estado de sus observaciones."
    },

    incidentes: {
        title: "Incidentes y accidentes",
        subtitle:
            "Registro, seguimiento y cierre de incidentes y accidentes laborales."
    },

    iperc: {
        title: "IPERC",
        subtitle:
            "Identificación de peligros, evaluación de riesgos y medidas de control."
    },

    programa: {
        title: "Programa anual SST",
        subtitle:
            "Actividades programadas, ejecutadas y porcentaje de cumplimiento."
    },
    reportes: {
        title: "Reportes",
        subtitle:
            "Genera el reporte SST y descárgalo en PDF o Excel."
    },

    ficha: {
        title: "Ficha del colaborador",
        subtitle:
            "Datos del trabajador y todo su historial SST."
    }

};


function openPage(pageName) {

    document
        .querySelectorAll(".page")
        .forEach(page => {

            page.classList.remove("active");

        });


    document
        .querySelector(
            `#page-${pageName}`
        )
        ?.classList
        .add("active");


    document
        .querySelectorAll(".nav-item")
        .forEach(button => {

            button.classList.remove("active");

            if (
                button.dataset.page ===
                (
                    pageName === "ficha"
                        ? "colaboradores"
                        : pageName
                )
            ) {

                button.classList.add(
                    "active"
                );

            }

        });


    const data =
        pageData[pageName];


    if (data) {

        document.getElementById(
            "pageTitle"
        ).textContent =
            data.title;

        document.getElementById(
            "pageSubtitle"
        ).textContent =
            data.subtitle;

    }

}


document
    .querySelectorAll(".nav-item")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                openPage(
                    button.dataset.page
                );

            }
        );

    });


/* =========================================================
   MODAL GENÉRICO
   ========================================================= */

function openModal({
    title,
    fields,
    values = {},
    submitText = "Guardar",
    onSubmit
}) {

    modalTitle.textContent =
        title;

    modalSubmit.textContent =
        submitText;

    modalSubmit.disabled =
        false;

    modalFields.innerHTML = "";

    currentFields = fields;

    evidenceReopen = null;


    fields.forEach(field => {

        if (field.type === "section") {
            const section =
                document.createElement("div");
            section.className = "form-section full";
            section.innerHTML =
                `<h4>${escapeHtml(field.label)}</h4>` +
                (field.hint ? `<small>${escapeHtml(field.hint)}</small>` : "");
            modalFields.appendChild(section);
            return;
        }

        if (field.type === "html") {
            const block =
                document.createElement("div");
            block.className =
                "form-group form-html" + (field.full === false ? "" : " full");
            block.innerHTML = field.html || "";
            modalFields.appendChild(block);
            return;
        }

        if (field.type === "checkboxes") {
            const group =
                document.createElement("div");
            group.className = "form-group full";
            const selected =
                (Array.isArray(values[field.name]) ? values[field.name] : [])
                    .map(String);
            group.innerHTML = `
                <label>${escapeHtml(field.label)}</label>
                <div class="check-grid">
                    ${field.options.map(option => {
                        const value = typeof option === "object" ? option.value : option;
                        const text = typeof option === "object" ? option.label : option;
                        return `
                            <label class="check-item">
                                <input
                                    type="checkbox"
                                    name="${escapeHtml(field.name)}"
                                    value="${escapeHtml(value)}"
                                    ${selected.includes(String(value)) ? "checked" : ""}
                                >
                                <span>${escapeHtml(text)}</span>
                            </label>
                        `;
                    }).join("")}
                </div>
            `;
            modalFields.appendChild(group);
            return;
        }


        const group =
            document.createElement("div");

        group.className =
            "form-group" +
            (
                field.full
                    ? " full"
                    : ""
            );


        const label =
            document.createElement("label");

        label.textContent =
            field.label;

        group.appendChild(label);


        let input;


        if (
            field.type === "select"
        ) {

            input =
                document.createElement(
                    "select"
                );


            field.options.forEach(option => {

                const item =
                    document.createElement(
                        "option"
                    );

                if (
                    typeof option ===
                    "object"
                ) {

                    item.value =
                        option.value;

                    item.textContent =
                        option.label;

                } else {

                    item.value =
                        option;

                    item.textContent =
                        option;

                }


                if (
                    String(
                        values[field.name] ?? ""
                    ) ===
                    String(item.value)
                ) {

                    item.selected = true;

                }


                input.appendChild(item);

            });

        } else if (
            field.type === "textarea"
        ) {

            input =
                document.createElement(
                    "textarea"
                );

            input.value =
                values[field.name] ?? "";

        } else {

            input =
                document.createElement(
                    "input"
                );

            input.type =
                field.type || "text";

            if (input.type !== "file") {

                input.value =
                    values[field.name] ?? "";

            }

        }


        input.name =
            field.name;


        if (field.required) {
            input.required = true;
        }


        if (field.placeholder) {

            input.placeholder =
                field.placeholder;

        }


        if (field.min) {

            input.min =
                field.min;

        }


        if (field.step) {

            input.step =
                field.step;

        }


        if (field.max) {

            input.max =
                field.max;

        }


        if (field.accept) {
            input.accept =
                field.accept;
        }

        if (field.multiple) {
            input.multiple = true;
        }



        group.appendChild(input);

        modalFields.appendChild(group);

    });


    currentSubmitFunction =
        onSubmit;


    modalBackdrop
        .classList
        .add("show");

}


function closeModal() {

    modalBackdrop
        .classList
        .remove("show");

    modalForm.reset();

    currentSubmitFunction =
        null;

    currentFields = [];

    evidenceReopen = null;

}



document
    .getElementById("modalClose")
    .addEventListener(
        "click",
        closeModal
    );


document
    .getElementById("modalCancel")
    .addEventListener(
        "click",
        closeModal
    );


modalBackdrop.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            modalBackdrop
        ) {

            closeModal();

        }

    }
);


modalForm.addEventListener(
    "submit",
    event => {

        event.preventDefault();

        const rawData =
            new FormData(
                modalForm
            );

        const formData =
            Object.fromEntries(
                rawData.entries()
            );

        currentFields
            .filter(field =>
                field.name &&
                (field.multiple || field.type === "checkboxes"))
            .forEach(field => {
                formData[field.name] =
                    rawData
                        .getAll(field.name)
                        .filter(value =>
                            !(value instanceof File) || value.size > 0);
            });



        if (
            currentSubmitFunction
        ) {

            currentSubmitFunction(
                formData
            );

        }

    }
);


/* =========================================================
   OPCIONES DE COLABORADORES
   ========================================================= */

function workerOptions() {

    return state.workers
        .filter(
            worker =>
                worker.status ===
                "Activo"
        )
        .sort(
            (a, b) =>
                a.name.localeCompare(
                    b.name
                )
        )
        .map(
            worker => ({
                value: worker.id,
                label:
                    `${worker.name} - ${worker.area}`
            })
        );

}


/* =========================================================
   COLABORADORES
   ========================================================= */

function openWorkerModal(workerId = null) {

    const worker =
        workerId
            ? getWorker(workerId)
            : null;


    openModal({

        title:
            worker
                ? "Editar colaborador"
                : "Nuevo colaborador",

        submitText:
            worker
                ? "Guardar cambios"
                : "Registrar colaborador",

        values:
            worker || {
                joined: today(),
                status: "Activo"
            },

        fields: [
            {
                type: "section",
                label: "Datos laborales"
            },
            {
                name: "name",
                label: "Nombre completo",
                required: true,
                full: true,
                placeholder:
                    "Ej. Carlos Mendoza"
            },

            {
                name: "dni",
                label: "DNI / documento",
                required: true
            },

            {
                name: "role",
                label: "Cargo",
                required: true
            },

            {
                name: "area",
                label: "Área",
                required: true
            },

            {
                name: "phone",
                label: "Teléfono"
            },

            {
                name: "joined",
                label: "Fecha de ingreso",
                type: "date",
                required: true
            },

            {
                name: "status",
                label: "Estado",
                type: "select",
                options: [
                    "Activo",
                    "Inactivo"
                ]
            },
            {
                name: "contractType",
                label: "Tipo de contrato",
                type: "select",
                options: [
                    { value: "", label: "— Sin especificar —" },
                    "Plazo indeterminado",
                    "Plazo fijo",
                    "Por obra o servicio",
                    "Locación de servicios",
                    "Prácticas",
                    "Otro"
                ]
            },
            {
                name: "shift",
                label: "Turno / régimen",
                placeholder: "Ej. Día, noche, 14x7"
            },
            {
                name: "supervisor",
                label: "Jefe inmediato",
                full: true
            },
            {
                type: "section",
                label: "Datos personales"
            },
            {
                name: "birthDate",
                label: "Fecha de nacimiento",
                type: "date"
            },
            {
                name: "bloodType",
                label: "Grupo sanguíneo",
                type: "select",
                options: [
                    { value: "", label: "— Sin especificar —" },
                    "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"
                ]
            },
            {
                name: "email",
                label: "Correo",
                type: "email"
            },
            {
                name: "address",
                label: "Dirección"
            },
            {
                type: "section",
                label: "Licencia de conducir",
                hint: "Solo si conduce vehículos o equipos."
            },
            {
                name: "license",
                label: "Licencia / categoría",
                placeholder: "Ej. A-I, A-IIb"
            },
            {
                name: "licenseExpiry",
                label: "Vencimiento de la licencia",
                type: "date"
            },
            {
                type: "section",
                label: "Contacto de emergencia"
            },
            {
                name: "emergencyName",
                label: "Nombre",
                full: true
            },
            {
                name: "emergencyPhone",
                label: "Teléfono"
            },
            {
                name: "emergencyRelation",
                label: "Parentesco",
                placeholder: "Ej. Esposa, padre, hermano"
            }
        ],
        onSubmit(data) {
            if (worker) {

                Object.assign(
                    worker,
                    data
                );

                showToast(
                    "Colaborador actualizado."
                );

            } else {

                state.workers.push({

                    id: createId(),

                    ...data

                });

                showToast(
                    "Nuevo colaborador registrado."
                );

            }


            saveState();

            closeModal();

        }

    });

}


function renderWorkers() {

    const tbody =
        document.getElementById(
            "workersTbody"
        );

    const search =
        (
            document.getElementById(
                "workerSearch"
            )?.value || ""
        )
        .toLowerCase()
        .trim();


    const workers =
        state.workers.filter(worker => {

            return (
                worker.name
                    .toLowerCase()
                    .includes(search) ||

                worker.dni
                    .toLowerCase()
                    .includes(search) ||

                worker.role
                    .toLowerCase()
                    .includes(search) ||

                worker.area
                    .toLowerCase()
                    .includes(search)
            );

        });


    if (
        workers.length === 0
    ) {

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    No se encontraron colaboradores.
                </td>
            </tr>
        `;

        return;

    }


    tbody.innerHTML =
        workers
            .map(worker => `

                <tr>

                    <td>

                        <div class="worker-cell">

                            <div class="avatar">
                                ${initials(worker.name)}
                            </div>

                            <div>
                                <button
                                    class="worker-link"
                                    data-action="view-worker"
                                    data-id="${worker.id}"
                                    title="Ver ficha completa"
                                >
                                    ${escapeHtml(worker.name)}
                                </button>

                                <small>
                                    ${escapeHtml(worker.phone || "Sin teléfono")}
                                </small>
                            </div>

                        </div>

                    </td>

                    <td>
                        ${escapeHtml(worker.dni)}
                    </td>

                    <td>
                        ${escapeHtml(worker.role)}
                    </td>

                    <td>
                        ${escapeHtml(worker.area)}
                    </td>

                    <td>
                        ${formatDate(worker.joined)}
                    </td>

                    <td>

                        <span
                            class="badge ${
                                worker.status === "Activo"
                                    ? "badge-green"
                                    : "badge-gray"
                            }"
                        >
                            ${worker.status}
                        </span>

                    </td>

                    <td>

                        <div class="actions">

                            <button
                                class="btn btn-primary btn-small"
                                data-action="view-worker"
                                data-id="${worker.id}"
                            >
                                Ficha
                            </button>

                            <button
                                class="btn btn-light btn-small"
                                data-action="edit-worker"
                                data-id="${worker.id}"
                            >
                                Editar
                            </button>

                            <button
                                class="btn btn-warning btn-small"
                                data-action="toggle-worker"
                                data-id="${worker.id}"
                            >
                                ${
                                    worker.status === "Activo"
                                        ? "Desactivar"
                                        : "Activar"
                                }
                            </button>

                            <button
                                class="btn btn-danger btn-small"
                                data-action="delete-worker"
                                data-id="${worker.id}"
                            >
                                Eliminar
                            </button>

                        </div>

                    </td>

                </tr>

            `)
            .join("");

}


/* =========================================================
   ASISTENCIA
   ========================================================= */

function openAttendanceModal(
    workerId = ""
) {

    if (
        state.workers.length === 0
    ) {

        showToast(
            "Primero registra un colaborador."
        );

        return;

    }


    openModal({

        title:
            "Registrar asistencia",

        values: {
            workerId,
            date: today(),
            status: "Asistencia"
        },

        fields: [

            {
                name: "workerId",
                label: "Colaborador",
                type: "select",
                required: true,
                full: true,
                options: workerOptions()
            },

            {
                name: "date",
                label: "Fecha",
                type: "date",
                required: true
            },

            {
                name: "status",
                label: "Estado",
                type: "select",
                required: true,
                options: [
                    "Asistencia",
                    "Inasistencia",
                    "Tardanza",
                    "Descanso"
                ]
            },

            {
                name: "note",
                label: "Observación",
                type: "textarea",
                full: true,
                placeholder:
                    "Observación opcional..."
            }

        ],

        onSubmit(data) {

            state.attendance.push({

                id: createId(),

                ...data

            });


            saveState();

            closeModal();

            showToast(
                "Asistencia registrada."
            );

        }

    });

}


function renderAttendance() {

    const tbody =
        document.getElementById(
            "attendanceTbody"
        );

    const month =
        document.getElementById(
            "attendanceMonth"
        ).value;


    const activeWorkers =
        state.workers.filter(
            worker =>
                worker.status ===
                "Activo"
        );


    tbody.innerHTML =
        activeWorkers
            .map(worker => {

                const records =
                    state.attendance.filter(
                        record =>
                            record.workerId ===
                                worker.id &&
                            record.date
                                .startsWith(month)
                    );


                const workRecords =
                    records.filter(
                        record =>
                            record.status !==
                            "Descanso"
                    );


                const attendance =
                    records.filter(
                        record =>
                            record.status ===
                            "Asistencia"
                    ).length;


                const absences =
                    records.filter(
                        record =>
                            record.status ===
                            "Inasistencia"
                    ).length;


                const late =
                    records.filter(
                        record =>
                            record.status ===
                            "Tardanza"
                    ).length;


                const present =
                    attendance + late;


                const percentage =
                    workRecords.length
                        ? Math.round(
                            present /
                            workRecords.length *
                            100
                        )
                        : 0;


                let badgeClass =
                    "badge-gray";


                if (
                    workRecords.length
                ) {

                    if (
                        percentage >= 95
                    ) {

                        badgeClass =
                            "badge-green";

                    } else if (
                        percentage >= 85
                    ) {

                        badgeClass =
                            "badge-yellow";

                    } else {

                        badgeClass =
                            "badge-red";

                    }

                }


                return `

                    <tr>

                        <td>

                            <div class="worker-cell">

                                <div class="avatar">
                                    ${initials(worker.name)}
                                </div>

                                <strong>
                                    ${escapeHtml(worker.name)}
                                </strong>

                            </div>

                        </td>

                        <td>
                            ${workRecords.length}
                        </td>

                        <td>
                            ${attendance}
                        </td>

                        <td>
                            ${absences}
                        </td>

                        <td>
                            ${late}
                        </td>

                        <td>

                            <span
                                class="badge ${badgeClass}"
                            >
                                ${
                                    workRecords.length
                                        ? `${percentage}%`
                                        : "Sin registros"
                                }
                            </span>

                        </td>

                        <td>

                            <button
                                class="btn btn-light btn-small"
                                data-action="attendance-worker"
                                data-id="${worker.id}"
                            >
                                + Registrar
                            </button>

                        </td>

                    </tr>

                `;

            })
            .join("");

}


/* =========================================================
   EPP
   ========================================================= */

function openEppModal(workerId = "") {

    if (
        workerOptions().length === 0
    ) {

        showToast(
            "No hay colaboradores activos."
        );

        return;

    }


    openModal({

        title:
            "Registrar entrega de EPP",

        values: {
            workerId,
            date: today()
        },

        fields: [

            {
                name: "workerId",
                label: "Colaborador",
                type: "select",
                required: true,
                full: true,
                options: workerOptions()
            },

            {
                name: "item",
                label: "Equipo entregado",
                required: true,
                placeholder:
                    "Casco, guantes, lentes..."
            },

            {
                name: "quantity",
                label: "Cantidad",
                type: "number",
                required: true
            },

            {
                name: "size",
                label: "Talla"
            },

            {
                name: "date",
                label: "Fecha de entrega",
                type: "date",
                required: true
            },

            {
                name: "renewal",
                label: "Próxima renovación",
                type: "date"
            },

            {
                name: "note",
                label: "Observaciones",
                type: "textarea",
                full: true
            },

            attachmentField("Constancia de entrega")


        ],

        async onSubmit(data) {

            state.epp.push({
                id: createId(),
                ...(await withAttachment(data))
            });


            saveState();

            closeModal();

            showToast(
                "Entrega de EPP registrada."
            );

        }

    });

}


function renderEpp() {

    const tbody =
        document.getElementById(
            "eppTbody"
        );


    const records =
        [...state.epp]
            .sort(
                (a, b) =>
                    b.date.localeCompare(
                        a.date
                    )
            );


    if (
        records.length === 0
    ) {

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    Aún no existen entregas de EPP.
                </td>
            </tr>
        `;

        return;

    }


    tbody.innerHTML =
        records
            .map(record => {

                const status =
                    expirationState(
                        record.renewal
                    );


                return `

                    <tr>

                        <td>
                            ${escapeHtml(
                                workerName(
                                    record.workerId
                                )
                            )}
                        </td>

                        <td>
                            <strong>
                                ${escapeHtml(record.item)}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(record.quantity)}
                        </td>

                        <td>
                            ${escapeHtml(record.size || "—")}
                        </td>

                        <td>
                            ${formatDate(record.date)}
                        </td>

                        <td>
                            ${formatDate(record.renewal)}
                        </td>

                        <td>

                            <span
                                class="badge ${status.className}"
                            >
                                ${status.text}
                            </span>

                        </td>

                        <td>

                            <div class="actions">

                                ${attachmentButton(record, "Constancia")}

                                <button

                                    class="btn btn-danger btn-small"

                                    data-action="delete-epp"

                                    data-id="${record.id}"

                                >

                                    Eliminar

                                </button>

                            </div>

                        </td>

                    </tr>

                `;

            })
            .join("");

}


/* =========================================================
   SEGUROS
   ========================================================= */

function openInsuranceModal(workerId = "") {

    if (
        workerOptions().length === 0
    ) {

        showToast(
            "No hay colaboradores activos."
        );

        return;

    }


    openModal({

        title:
            "Registrar seguro",

        values: {
            workerId,
            start: today()
        },

        fields: [

            {
                name: "workerId",
                label: "Colaborador",
                type: "select",
                required: true,
                full: true,
                options: workerOptions()
            },

            {
                name: "type",
                label: "Tipo de seguro",
                required: true,
                placeholder:
                    "SCTR, Vida Ley, EPS..."
            },

            {
                name: "provider",
                label: "Aseguradora",
                required: true
            },

            {
                name: "policy",
                label: "Número de póliza"
            },

            {
                name: "start",
                label: "Fecha de inicio",
                type: "date",
                required: true
            },

            {
                name: "end",
                label: "Fecha de vencimiento",
                type: "date",
                required: true
            },

            attachmentField("Póliza o constancia")


        ],

        async onSubmit(data) {

            state.insurance.push({
                id: createId(),
                ...(await withAttachment(data))
            });


            saveState();

            closeModal();

            showToast(
                "Seguro registrado."
            );

        }

    });

}


function renderInsurance() {

    const tbody =
        document.getElementById(
            "insuranceTbody"
        );


    if (
        state.insurance.length === 0
    ) {

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    Aún no existen seguros registrados.
                </td>
            </tr>
        `;

        return;

    }


    tbody.innerHTML =
        [...state.insurance]
            .sort(
                (a, b) =>
                    a.end.localeCompare(
                        b.end
                    )
            )
            .map(record => {

                const status =
                    expirationState(
                        record.end
                    );


                return `

                    <tr>

                        <td>
                            ${escapeHtml(
                                workerName(
                                    record.workerId
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHtml(record.type)}
                        </td>

                        <td>
                            ${escapeHtml(record.provider)}
                        </td>

                        <td>
                            ${escapeHtml(record.policy || "—")}
                        </td>

                        <td>
                            ${formatDate(record.start)}
                        </td>

                        <td>
                            ${formatDate(record.end)}
                        </td>

                        <td>

                            <span
                                class="badge ${status.className}"
                            >
                                ${status.text}
                            </span>

                        </td>

                        <td>

                            <div class="actions">

                                ${attachmentButton(record, "Póliza")}

                                <button

                                    class="btn btn-danger btn-small"

                                    data-action="delete-insurance"

                                    data-id="${record.id}"

                                >

                                    Eliminar

                                </button>

                            </div>

                        </td>

                    </tr>

                `;

            })
            .join("");

}


/* =========================================================
   CAPACITACIONES
   ========================================================= */

function openTrainingModal(workerId = "") {

    if (
        workerOptions().length === 0
    ) {

        showToast(
            "No hay colaboradores activos."
        );

        return;

    }


    openModal({

        title:
            "Registrar capacitación",

        values: {
            workerId,
            date: today(),
            status: "Completada"
        },

        fields: [

            {
                name: "workerId",
                label: "Colaborador",
                type: "select",
                required: true,
                full: true,
                options: workerOptions()
            },

            {
                name: "topic",
                label: "Capacitación",
                required: true
            },

            {
                name: "date",
                label: "Fecha",
                type: "date",
                required: true
            },

            {
                name: "provider",
                label: "Entidad / instructor"
            },

            {
                name: "grade",
                label: "Nota (0 a 20) · desde 15 aprueba",
                type: "number",
                min: "0",
                max: "20",
                step: "0.5",
                placeholder: "Ej. 16"
            },

            {
                name: "status",
                label: "Estado (si pones nota, se calcula solo)",
                type: "select",
                options: [
                    "Programada",
                    "Completada",
                    "Pendiente"
                ]
            },

            attachmentField("Evidencias: certificado, lista de asistencia o fotos", true)
        ],
        async onSubmit(data) {
            modalSubmit.disabled = true;
            const record =
                await withAttachments(data);

            const result =
                SSTMetrics.trainingResult(record.grade);

            if (result) {

                record.grade = Number(record.grade);

                record.status = result;

            } else {

                delete record.grade;

            }

            state.training.push({
                id: createId(),
                ...record
            });


            saveState();

            closeModal();

            showToast(
                "Capacitación registrada."
            );

        }

    });

}


const TRAINING_BADGES = {
    Aprobado:    "badge-green",
    Desaprobado: "badge-red",
    Completada:  "badge-green",
    Pendiente:   "badge-red"
};


function trainingStatusHtml(record) {

    const hasGrade =
        record.grade !== undefined &&
        record.grade !== "" &&
        record.grade !== null;

    return `
        <span class="badge ${TRAINING_BADGES[record.status] || "badge-yellow"}">
            ${escapeHtml(record.status)}
        </span>
        ${hasGrade
            ? `<small class="cell-sub">Nota: ${escapeHtml(record.grade)}</small>`
            : ""}
    `;

}


function renderTraining() {

    const tbody =
        document.getElementById(
            "trainingTbody"
        );


    if (
        state.training.length === 0
    ) {

        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    No existen capacitaciones registradas.
                </td>
            </tr>
        `;

        return;

    }


    tbody.innerHTML =
        [...state.training]
            .sort(
                (a, b) =>
                    b.date.localeCompare(
                        a.date
                    )
            )
            .map(record => {

                return `

                    <tr>

                        <td>
                            ${escapeHtml(
                                workerName(
                                    record.workerId
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHtml(record.topic)}
                        </td>

                        <td>
                            ${formatDate(record.date)}
                        </td>

                        <td>
                            ${escapeHtml(record.provider || "—")}
                        </td>

                        <td>

                            ${trainingStatusHtml(record)}

                        </td>

                        <td>

                            <div class="actions">

                                ${evidenceButton(
                                    { collection: "training", id: record.id },
                                    SSTMetrics.recordFiles(record).length
                                )}
                                <button
                                    class="btn btn-danger btn-small"
                                    data-action="delete-training"

                                    data-id="${record.id}"

                                >

                                    Eliminar

                                </button>

                            </div>

                        </td>

                    </tr>

                `;

            })
            .join("");

}


/* =========================================================
   EXÁMENES MÉDICOS
   ========================================================= */

function openMedicalModal(workerId = "") {

    if (
        workerOptions().length === 0
    ) {

        showToast(
            "No hay colaboradores activos."
        );

        return;

    }


    openModal({

        title:
            "Registrar examen médico",

        values: {
            workerId,
            date: today(),
            result: "Apto"
        },

        fields: [

            {
                name: "workerId",
                label: "Colaborador",
                type: "select",
                required: true,
                full: true,
                options: workerOptions()
            },

            {
                name: "type",
                label: "Tipo de examen",
                type: "select",
                required: true,
                options: [
                    "Preocupacional",
                    "Periódico",
                    "Retiro",
                    "Otro"
                ]
            },

            {
                name: "date",
                label: "Fecha",
                type: "date",
                required: true
            },

            {
                name: "result",
                label: "Resultado",
                type: "select",
                required: true,
                options: [
                    "Apto",
                    "Apto con restricciones",
                    "No apto",
                    "Pendiente"
                ]
            },

            {
                name: "expiry",
                label: "Fecha de vencimiento",
                type: "date"
            },

            attachmentField("Certificado del examen")


        ],

        async onSubmit(data) {

            state.medical.push({
                id: createId(),
                ...(await withAttachment(data))
            });


            saveState();

            closeModal();

            showToast(
                "Examen médico registrado."
            );

        }

    });

}


function renderMedical() {

    const tbody =
        document.getElementById(
            "medicalTbody"
        );


    if (
        state.medical.length === 0
    ) {

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    No existen exámenes médicos registrados.
                </td>
            </tr>
        `;

        return;

    }


    tbody.innerHTML =
        [...state.medical]
            .sort(
                (a, b) =>
                    b.date.localeCompare(
                        a.date
                    )
            )
            .map(record => {

                const expiry =
                    expirationState(
                        record.expiry
                    );


                let resultClass =
                    "badge-green";


                if (
                    record.result ===
                    "Apto con restricciones"
                ) {

                    resultClass =
                        "badge-yellow";

                }


                if (
                    record.result ===
                    "No apto"
                ) {

                    resultClass =
                        "badge-red";

                }


                if (
                    record.result ===
                    "Pendiente"
                ) {

                    resultClass =
                        "badge-gray";

                }


                return `

                    <tr>

                        <td>
                            ${escapeHtml(
                                workerName(
                                    record.workerId
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHtml(record.type)}
                        </td>

                        <td>
                            ${formatDate(record.date)}
                        </td>

                        <td>

                            <span
                                class="badge ${resultClass}"
                            >
                                ${escapeHtml(record.result)}
                            </span>

                        </td>

                        <td>
                            ${formatDate(record.expiry)}
                        </td>

                        <td>

                            <span
                                class="badge ${expiry.className}"
                            >
                                ${expiry.text}
                            </span>

                        </td>

                        <td>

                            <div class="actions">

                                ${attachmentButton(record, "Certificado")}

                                <button

                                    class="btn btn-danger btn-small"

                                    data-action="delete-medical"

                                    data-id="${record.id}"

                                >

                                    Eliminar

                                </button>

                            </div>

                        </td>

                    </tr>

                `;

            })
            .join("");

}


/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {

    const activeWorkers =
        state.workers.filter(
            worker =>
                worker.status ===
                "Activo"
        );


    document.getElementById(
        "metricWorkers"
    ).textContent =
        activeWorkers.length;


    /* ASISTENCIA */

    const month =
        currentMonth();


    const attendanceRecords =
        state.attendance.filter(
            record =>
                record.date.startsWith(month) &&
                record.status !== "Descanso"
        );


    const presents =
        attendanceRecords.filter(
            record =>
                record.status ===
                    "Asistencia" ||
                record.status ===
                    "Tardanza"
        ).length;


    const attendancePercentage =
        attendanceRecords.length
            ? Math.round(
                presents /
                attendanceRecords.length *
                100
            )
            : 0;


    document.getElementById(
        "metricAttendance"
    ).textContent =
        `${attendancePercentage}%`;


    /* EPP */

    const eppDue =
        state.epp.filter(record => {

            const days =
                daysUntil(
                    record.renewal
                );

            return (
                days !== null &&
                days >= 0 &&
                days <= 30
            );

        }).length;


    document.getElementById(
        "metricEpp"
    ).textContent =
        eppDue;


    /* SEGUROS */

    const insuranceDue =
        state.insurance.filter(
            record => {

                const days =
                    daysUntil(
                        record.end
                    );

                return (
                    days !== null &&
                    days >= 0 &&
                    days <= 30
                );

            }
        ).length;


    document.getElementById(
        "metricInsurance"
    ).textContent =
        insuranceDue;


    renderUrgent();

    renderProgramMetric();

    renderAlerts();

    renderBoard();

}


/* =========================================================
   ALERTAS
   ========================================================= */

/* ---------- Atención inmediata ---------- */

const URGENT_LEVELS = {
    critical: { label: "Crítico", className: "critical" },
    high:     { label: "Alto",    className: "high" },
    medium:   { label: "Medio",   className: "medium" }
};

const URGENT_VISIBLE = 8;

let urgentExpanded = false;

function renderUrgent() {

    const list = document.getElementById("urgentList");
    const counts = document.getElementById("urgentCounts");

    if (!list || !counts) {
        return;
    }

    const data =
        SSTMetrics.urgentItems(state, today());

    counts.innerHTML = `
        <span class="urgent-count critical">${data.counts.critical} crítico(s)</span>
        <span class="urgent-count high">${data.counts.high} alto(s)</span>
        <span class="urgent-count medium">${data.counts.medium} medio(s)</span>
    `;

    if (data.total === 0) {
        list.innerHTML = `
            <div class="no-alerts">
                ✓ No hay nada urgente en este momento.
            </div>
        `;
        return;
    }

    const visible =
        urgentExpanded ? data.items : data.items.slice(0, URGENT_VISIBLE);

    list.innerHTML = `
        ${visible.map(item => `
            <button
                type="button"
                class="urgent-item ${URGENT_LEVELS[item.level].className}"
                data-action="go-page"
                data-page="${item.page}"
                title="Ir a ${escapeHtml(item.category)}"
            >
                <span class="urgent-icon">${item.icon}</span>
                <span class="urgent-text">
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${escapeHtml(item.category)} · ${escapeHtml(item.detail)}</small>
                </span>
                <span class="urgent-level">${URGENT_LEVELS[item.level].label}</span>
            </button>
        `).join("")}
        ${data.total > URGENT_VISIBLE
            ? `
                <button type="button" class="btn btn-light btn-small urgent-more" data-action="toggle-urgent">
                    ${urgentExpanded ? "Ver menos" : `Ver todos (${data.total})`}
                </button>
            `
            : ""}
    `;
}

function renderProgramMetric() {

    const value = document.getElementById("metricProgram");
    const sub = document.getElementById("metricProgramSub");

    if (!value || !sub) {
        return;
    }

    const data =
        SSTMetrics.programStats(state, today().slice(0, 4), today());

    value.textContent =
        data.toDate.pct === null ? "—" : `${data.toDate.pct}%`;

    sub.textContent =
        data.programmed
            ? `${data.overdue.length} atrasada(s) · avance anual ${data.annualPct}%`
            : "Sin actividades programadas";
}


function renderAlerts() {

    const container =
        document.getElementById(
            "alertsList"
        );


    const alerts = [];


    state.epp.forEach(record => {

        const days =
            daysUntil(
                record.renewal
            );


        if (
            days !== null &&
            days <= 30
        ) {

            alerts.push({

                icon: "⛑",

                title:
                    `EPP - ${workerName(record.workerId)}`,

                text:
                    days < 0
                        ? `${record.item} está vencido.`
                        : `${record.item} vence en ${days} día(s).`

            });

        }

    });


    state.insurance.forEach(
        record => {

            const days =
                daysUntil(
                    record.end
                );


            if (
                days !== null &&
                days <= 30
            ) {

                alerts.push({

                    icon: "🛡",

                    title:
                        `Seguro - ${workerName(record.workerId)}`,

                    text:
                        days < 0
                            ? `${record.type} está vencido.`
                            : `${record.type} vence en ${days} día(s).`

                });

            }

        }
    );


    state.medical.forEach(
        record => {

            const days =
                daysUntil(
                    record.expiry
                );


            if (
                days !== null &&
                days <= 30
            ) {

                alerts.push({

                    icon: "❤",

                    title:
                        `Examen médico - ${workerName(record.workerId)}`,

                    text:
                        days < 0
                            ? "El examen está vencido."
                            : `El examen vence en ${days} día(s).`

                });

            }

        }
    );


    if (
        alerts.length === 0
    ) {

        container.innerHTML = `

            <div class="no-alerts">

                ✓ No hay alertas críticas
                en este momento.

            </div>

        `;

        return;

    }


    container.innerHTML =
        alerts
            .slice(0, 8)
            .map(alert => `

                <div class="alert-item">

                    <div class="alert-symbol">
                        ${alert.icon}
                    </div>

                    <div>

                        <strong>
                            ${escapeHtml(alert.title)}
                        </strong>

                        <p>
                            ${escapeHtml(alert.text)}
                        </p>

                    </div>

                </div>

            `)
            .join("");

}


/* =========================================================
   TABLERO MENSUAL SST
   (los cálculos viven en metrics.js)
   ========================================================= */

const boardMonthInput =
    document.getElementById("dashboardMonth");

boardMonthInput.value =
    currentMonth();

boardMonthInput.addEventListener(
    "change",
    renderBoard
);


function boardMonth() {

    return boardMonthInput.value || currentMonth();

}


const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"
];


function renderBoardFilters() {

    const [year, number] =
        boardMonth().split("-");

    const years =
        SSTMetrics.availableYears(state, today());

    if (!years.includes(year)) {
        years.push(year);
        years.sort();
    }

    const option = (action, id, label, selected) => `
        <button
            type="button"
            class="filter-option${selected ? " selected" : ""}"
            data-action="${action}"
            data-id="${id}"
            aria-pressed="${selected}"
        >
            <span class="filter-box"></span>
            ${label}
        </button>
    `;

    document.getElementById("filterYears").innerHTML =
        years
            .map(item => option("filter-year", item, item, item === year))
            .join("");

    document.getElementById("filterMonths").innerHTML =
        MONTH_NAMES
            .map((name, index) => {

                const mm = String(index + 1).padStart(2, "0");

                return option("filter-month", mm, name, mm === number);

            })
            .join("");

}


function setBoardPeriod(year, number) {

    boardMonthInput.value = `${year}-${number}`;

    renderBoard();

}


function monthTitle(month) {

    const [year, number] =
        month.split("-");

    return `${SSTMetrics.MONTH_LABELS[Number(number) - 1]} ${year}`;

}


function shortDate(date) {

    if (!date) {
        return "—";
    }

    const [year, month, day] =
        date.split("-");

    return `${day}/${month}/${year.slice(2)}`;

}


function formatNumber(value) {

    return Number(value || 0).toLocaleString("es-PE");

}


function setBoard(id, html) {

    document.getElementById(id).innerHTML = html;

}


function emptyBoard(text) {

    return `<div class="board-empty">${text}</div>`;

}


function statBox(value, label, tone = "") {

    return `
        <div class="stat ${tone}">
            <strong>${value}</strong>
            <span>${label}</span>
        </div>
    `;

}


function progressBar(pct, mini = false) {

    const width =
        Math.max(0, Math.min(100, pct || 0));

    const tone =
        pct >= 100
            ? "good"
            : pct >= 60
                ? ""
                : "warn";

    return `
        <div class="progress${mini ? " mini" : ""}">
            <div
                class="progress-fill ${tone}"
                style="width:${width}%"
            ></div>
        </div>
    `;

}


function boardWorkerCell(worker) {

    return `
        <div class="worker-cell">
            <div class="avatar">
                ${initials(worker.name)}
            </div>
            <strong>
                ${escapeHtml(worker.name)}
            </strong>
        </div>
    `;

}


/* ---------- EPP por colaborador ---------- */

const EPP_MARKS = {
    ok:      { css: "mark-ok",      icon: "✓" },
    due:     { css: "mark-due",     icon: "⚠" },
    expired: { css: "mark-expired", icon: "⚠" },
    none:    { css: "mark-none",    icon: "—" }
};


function eppCellHtml(cell) {

    const mark = EPP_MARKS[cell.status];

    let note = "pendiente";

    if (cell.status === "ok") {
        note = shortDate(cell.date);
    }

    if (cell.status === "due") {
        note = `renueva ${shortDate(cell.renewal)}`;
    }

    if (cell.status === "expired") {
        note = `venció ${shortDate(cell.renewal)}`;
    }

    const title =
        cell.status === "none"
            ? "Sin entrega registrada"
            : `Entregado: ${formatDate(cell.date)}` +
              (cell.renewal
                  ? ` · Renovación: ${formatDate(cell.renewal)}`
                  : "");

    return `
        <span
            class="mark ${mark.css}"
            title="${escapeHtml(title)}"
        >
            ${mark.icon}
            <small>${note}</small>
        </span>
    `;

}


function renderBoardEpp() {

    const data =
        SSTMetrics.eppMatrix(state, today());

    if (data.rows.length === 0) {

        setBoard(
            "boardEppBody",
            emptyBoard("No hay colaboradores activos.")
        );

        return;
    }

    const total =
        data.rows.length * data.items.length;

    const summary = data.summary;

    const rows =
        data.rows.map(row => {

            const missing =
                row.cells.filter(
                    cell => cell.status === "none"
                ).length;

            return `
                <tr>
                    <td>${boardWorkerCell(row.worker)}</td>

                    ${row.cells.map(cell => `
                        <td class="center">
                            ${eppCellHtml(cell)}
                        </td>
                    `).join("")}

                    <td class="center">
                        <span class="badge ${missing ? "badge-gray" : "badge-green"}">
                            ${missing ? `Faltan ${missing}` : "Completo"}
                        </span>
                    </td>
                </tr>
            `;

        }).join("");

    setBoard("boardEppBody", `

        <div class="board-stats">
            ${statBox(`${summary.delivered}/${total}`, "Entregas registradas")}
            ${statBox(summary.missing, "Pendientes de entregar", summary.missing ? "warn" : "good")}
            ${statBox(summary.due, "Por renovar (30 días)", summary.due ? "warn" : "good")}
            ${statBox(summary.expired, "Vencidos", summary.expired ? "bad" : "good")}
        </div>

        <div class="table-wrap">
            <table class="board-table">
                <thead>
                    <tr>
                        <th>Colaborador</th>
                        ${data.items.map(item => `
                            <th class="center">${item.label}</th>
                        `).join("")}
                        <th class="center">Estado</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>

        <div class="board-legend">
            <span><span class="mark mark-ok">✓</span> Entregado</span>
            <span><span class="mark mark-due">⚠</span> Por renovar</span>
            <span><span class="mark mark-expired">⚠</span> Vencido</span>
            <span><span class="mark mark-none">—</span> Sin entrega</span>
        </div>

    `);

}


/* ---------- Vencimiento de SCTR y Vida Ley ---------- */

const INSURANCE_BADGES = {
    ok:      "badge-green",
    due:     "badge-yellow",
    expired: "badge-red",
    nodate:  "badge-gray",
    none:    "badge-gray"
};


function insuranceCellHtml(cell) {

    if (cell.status === "none") {

        return `<span class="badge badge-gray">Sin registro</span>`;

    }

    let note = "";

    if (cell.status === "expired") {
        note = `venció hace ${Math.abs(cell.days)} día(s)`;
    }

    if (cell.status === "due") {
        note =
            cell.days === 0
                ? "vence hoy"
                : `vence en ${cell.days} día(s)`;
    }

    if (cell.status === "ok") {
        note = `vigente · ${cell.days} días`;
    }

    return `
        <span class="badge ${INSURANCE_BADGES[cell.status]}">
            ${formatDate(cell.end)}
        </span>
        <small>${note}</small>
    `;

}


function renderBoardInsurance() {

    const data =
        SSTMetrics.insuranceTable(state, today());

    if (data.rows.length === 0) {

        setBoard(
            "boardInsuranceBody",
            emptyBoard("No hay colaboradores activos.")
        );

        return;
    }

    const summary = data.summary;

    const rows =
        data.rows.map(row => `

            <tr>
                <td>${boardWorkerCell(row.worker)}</td>

                ${row.cells.map(cell => `
                    <td class="center">
                        ${insuranceCellHtml(cell)}
                    </td>
                `).join("")}
            </tr>

        `).join("");

    setBoard("boardInsuranceBody", `

        <div class="board-stats">
            ${statBox(summary.ok, "Vigentes", "good")}
            ${statBox(summary.due, "Por vencer (30 días)", summary.due ? "warn" : "good")}
            ${statBox(summary.expired, "Vencidos", summary.expired ? "bad" : "good")}
            ${statBox(summary.none, "Sin registro", summary.none ? "warn" : "good")}
        </div>

        <div class="table-wrap">
            <table class="board-table">
                <thead>
                    <tr>
                        <th>Colaborador</th>
                        ${data.items.map(item => `
                            <th class="center">${item.label}</th>
                        `).join("")}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>

    `);

}


/* ---------- Capacitaciones: charlas realizadas vs meta ---------- */

function goalBlock(title, done, goal, pct) {

    if (!goal) {

        return `
            <div class="goal-row">
                <div class="goal-head">
                    <span>${title}</span>
                    <strong>${done}</strong>
                </div>
                <p class="goal-note">
                    Sin meta definida. Usa el botón «Definir meta».
                </p>
            </div>
        `;

    }

    return `
        <div class="goal-row">
            <div class="goal-head">
                <span>${title}</span>
                <strong>${done} / ${goal}</strong>
            </div>
            ${progressBar(pct)}
            <p class="goal-note">
                ${pct}% de la meta · faltan ${Math.max(goal - done, 0)}
            </p>
        </div>
    `;

}


function renderBoardTraining() {

    const month =
        boardMonth();

    const data =
        SSTMetrics.trainingStats(state, month);

    const pending =
        data.monthPending
            ? `
                <div class="goal-row">
                    <p class="goal-note">
                        ${data.monthPending} charla(s) programada(s) o pendiente(s) este mes.
                    </p>
                </div>
            `
            : "";

    const sessions =
        data.sessions.length
            ? `
                <div class="session-list">
                    ${data.sessions.slice(0, 6).map(session => `
                        <div class="session-item">
                            <span>${escapeHtml(session.topic)}</span>
                            <small>
                                ${session.attendees} asistente(s) · ${shortDate(session.date)}
                            </small>
                        </div>
                    `).join("")}
                </div>
            `
            : emptyBoard("No hay charlas completadas en este mes.");

    setBoard("boardTrainingBody", `

        ${goalBlock(`Charlas de ${monthTitle(month)}`, data.monthDone, data.monthGoal, data.monthPct)}

        ${goalBlock(`Charlas del año ${data.year}`, data.yearDone, data.yearGoal, data.yearPct)}

        ${pending}

        ${sessions}

    `);

}


function openGoalsModal() {

    openModal({

        title:
            "Meta de capacitaciones",

        submitText:
            "Guardar meta",

        values: {
            trainingMonthly:
                state.goals.trainingMonthly || "",
            trainingYearly:
                state.goals.trainingYearly || ""
        },

        fields: [

            {
                name: "trainingMonthly",
                label: "Charlas por mes (meta)",
                type: "number",
                min: "0",
                placeholder: "Ej. 40"
            },

            {
                name: "trainingYearly",
                label: "Charlas por año (meta)",
                type: "number",
                min: "0",
                placeholder: "Ej. 50"
            }

        ],

        onSubmit(data) {

            state.goals = {

                trainingMonthly:
                    Math.max(0, Math.floor(Number(data.trainingMonthly)) || 0),

                trainingYearly:
                    Math.max(0, Math.floor(Number(data.trainingYearly)) || 0)

            };

            saveState();

            closeModal();

            showToast(
                "Meta de capacitaciones guardada."
            );

        }

    });

}


/* ---------- HPH, HPI y mejoras continuas ---------- */

const FINDING_BADGES = {
    HPH:    "badge-red",
    HPI:    "badge-yellow",
    MEJORA: "badge-blue"
};


function findingLabel(type) {

    const found =
        SSTMetrics.FINDING_TYPES.find(
            item => item.value === type
        );

    return found ? found.label : type;

}


function openFindingModal() {

    openModal({

        title:
            "Registrar hallazgo",

        submitText:
            "Registrar",

        values: {
            type: "HPH",
            date: today(),
            status: "Abierto"
        },

        fields: [

            {
                name: "type",
                label: "Tipo",
                type: "select",
                required: true,
                options: SSTMetrics.FINDING_TYPES
            },

            {
                name: "date",
                label: "Fecha en que se observó",
                type: "date",
                required: true
            },

            {
                name: "area",
                label: "Área / lugar",
                required: true,
                full: true,
                placeholder: "Ej. Oficina, almacén, taller..."
            },

            {
                name: "description",
                label: "Descripción",
                type: "textarea",
                required: true,
                full: true,
                placeholder: "Qué se observó..."
            },

            {
                name: "status",
                label: "Estado",
                type: "select",
                options: [
                    "Abierto",
                    "Cerrado"
                ]
            },

            attachmentField("Foto del hallazgo")


        ],

        async onSubmit(data) {

            state.findings.push({

                id: createId(),

                ...(await withAttachment(data)),

                closedDate:
                    data.status === "Cerrado"
                        ? today()
                        : ""

            });

            saveState();

            closeModal();

            showToast(
                "Hallazgo registrado."
            );

        }

    });

}


function renderFindings() {

    const tbody =
        document.getElementById("findingsTbody");

    const records =
        [...state.findings].sort(
            (a, b) => b.date.localeCompare(a.date)
        );

    if (records.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    Aún no hay hallazgos registrados.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        records.map(record => {

            const closed =
                record.status === "Cerrado";

            return `

                <tr>

                    <td>${formatDate(record.date)}</td>

                    <td>
                        <span class="badge ${FINDING_BADGES[record.type] || "badge-gray"}">
                            ${escapeHtml(findingLabel(record.type))}
                        </span>
                    </td>

                    <td>${escapeHtml(record.area)}</td>

                    <td>${escapeHtml(record.description)}</td>

                    <td>
                        <span class="badge ${closed ? "badge-green" : "badge-yellow"}">
                            ${escapeHtml(record.status)}
                        </span>
                    </td>

                    <td>${formatDate(record.closedDate)}</td>

                    <td>
                        <div class="actions">

                            ${attachmentButton(record, "Foto")}

                            <button
                                class="btn ${closed ? "btn-warning" : "btn-light"} btn-small"
                                data-action="toggle-finding"
                                data-id="${record.id}"
                            >
                                ${closed ? "Reabrir" : "Cerrar"}
                            </button>

                            <button
                                class="btn btn-danger btn-small"
                                data-action="delete-finding"
                                data-id="${record.id}"
                            >
                                Eliminar
                            </button>

                        </div>
                    </td>

                </tr>

            `;

        }).join("");

}


function renderBoardFindings() {

    const month =
        boardMonth();

    const stats =
        SSTMetrics.findingsStats(state, month);

    const total =
        stats.reduce((sum, item) => ({
            observed: sum.observed + item.observed,
            closed: sum.closed + item.closed,
            open: sum.open + item.open
        }), { observed: 0, closed: 0, open: 0 });

    const rows =
        stats.map(item => `

            <tr>
                <td>
                    <span class="badge ${FINDING_BADGES[item.type] || "badge-gray"}">
                        ${escapeHtml(item.label)}
                    </span>
                </td>
                <td class="center">${item.observed}</td>
                <td class="center">${item.closed}</td>
                <td class="center">${item.open}</td>
                <td>
                    ${progressBar(item.pct || 0, true)}
                    <small>${item.pct === null ? "Sin hallazgos" : item.pct + "% levantado"}</small>
                </td>
            </tr>

        `).join("");

    const accumulated =
        stats
            .map(item => `${escapeHtml(item.label)}: ${item.openAllTime}`)
            .join(" · ");

    setBoard("boardFindingsBody", `

        <div class="table-wrap">
            <table class="board-table">
                <thead>
                    <tr>
                        <th>Tipo (${monthTitle(month)})</th>
                        <th class="center">Observados</th>
                        <th class="center">Levantados</th>
                        <th class="center">Pendientes</th>
                        <th>Avance</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr>
                        <td>Total</td>
                        <td class="center">${total.observed}</td>
                        <td class="center">${total.closed}</td>
                        <td class="center">${total.open}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <div class="board-legend">
            <span>Abiertos acumulados de todos los meses → ${accumulated}</span>
        </div>

    `);

}


/* ---------- Inspecciones y observaciones ---------- */

function openInspectionModal() {

    openModal({

        title:
            "Registrar inspección",

        submitText:
            "Registrar inspección",

        values: {
            date: today()
        },

        fields: [

            {
                name: "date",
                label: "Fecha de la inspección",
                type: "date",
                required: true
            },

            {
                name: "inspector",
                label: "Inspector / entidad",
                placeholder: "Quién realizó la inspección"
            },

            {
                name: "area",
                label: "Área o tipo de inspección",
                required: true,
                full: true,
                placeholder: "Ej. Oficina, taller, inspección del cliente..."
            },

            {
                name: "observations",
                label: "Observaciones (una por línea)",
                type: "textarea",
                required: true,
                full: true,
                placeholder:
                    "Orden y limpieza en la oficina\nCables sueltos en el taller\nExtintor sin señalización"
            },

            attachmentField("Fotos o documentos de la inspección", true)
        ],
        async onSubmit(data) {
            const observations =
                SSTMetrics
                    .splitObservations(data.observations)
                    .map(text => ({
                        id: createId(),
                        text,
                        status: "Abierta",
                        closedDate: ""
                    }));

            if (observations.length === 0) {

                showToast(
                    "Escribe al menos una observación."
                );

                return;
            }

            modalSubmit.disabled = true;
            const photo =
                await withAttachments({ attachment: data.attachment });

            state.inspections.push({
                id: createId(),
                ...photo,

                date: data.date,

                area: data.area,

                inspector: data.inspector || "",

                observations

            });

            saveState();

            closeModal();

            showToast(
                `Inspección registrada con ${observations.length} observación(es).`
            );

        }

    });

}


function openCloseObservationModal(inspection, observation) {

    openModal({
        title: "Cerrar observación",
        submitText: "Cerrar observación",
        values: {
            closedDate: today(),
            closeNote: observation.closeNote || ""
        },
        fields: [
            {
                type: "html",
                html: `
                    <div class="evidence-context">
                        <small>${escapeHtml(inspection.area)} · ${formatDate(inspection.date)}</small>
                        <strong>${escapeHtml(observation.text)}</strong>
                    </div>
                `
            },
            {
                name: "closedDate",
                label: "Fecha de levantamiento",
                type: "date",
                required: true
            },
            {
                name: "closeNote",
                label: "Acción realizada (opcional)",
                type: "textarea",
                full: true,
                placeholder: "Ej. Se señalizó el extintor y se ordenó el cableado"
            },
            attachmentField("Evidencia del levantamiento (fotos o PDF)", true)
        ],
        async onSubmit(data) {

            modalSubmit.disabled = true;

            const stored =
                await storeAttachments(data.attachment);

            observation.status = "Cerrada";
            observation.closedDate = data.closedDate || today();
            observation.closeNote = String(data.closeNote || "").trim();

            if (stored.length) {
                normalizeFiles(observation).push(...stored);
            }

            saveState();
            closeModal();
            showToast(
                stored.length
                    ? `Observación cerrada con ${stored.length} evidencia(s).`
                    : "Observación cerrada."
            );
        }
    });
}


function renderInspections() {

    const container =
        document.getElementById("inspectionsList");

    const inspections =
        [...state.inspections].sort(
            (a, b) => b.date.localeCompare(a.date)
        );

    if (inspections.length === 0) {

        container.innerHTML =
            emptyBoard("Aún no hay inspecciones registradas.");

        return;
    }

    container.innerHTML =
        inspections.map(inspection => {

            const progress =
                SSTMetrics.inspectionProgress(inspection);

            const meta =
                [
                    formatDate(inspection.date),
                    inspection.inspector
                        ? escapeHtml(inspection.inspector)
                        : "",
                    `${progress.total} observación(es)`
                ]
                .filter(Boolean)
                .join(" · ");

            const items =
                (inspection.observations || []).map(item => {

                    const closed =
                        item.status === "Cerrada";

                    const obsFiles =
                        SSTMetrics.recordFiles(item).length;
                    return `
                        <li class="obs-item ${closed ? "closed" : ""}">
                            <span class="obs-text">
                                ${escapeHtml(item.text)}
                                ${closed && item.closeNote
                                    ? `<small class="obs-note">✔ ${escapeHtml(item.closeNote)}</small>`
                                    : ""}
                            </span>

                            <div class="obs-side">

                                <span class="badge ${closed ? "badge-green" : "badge-yellow"}">
                                    ${escapeHtml(item.status)}
                                </span>

                                ${closed
                                    ? `<small>${formatDate(item.closedDate)}</small>`
                                    : ""}
                                ${closed || obsFiles
                                    ? evidenceButton(
                                        { collection: "inspections", id: inspection.id, obs: item.id },
                                        obsFiles,
                                        "Levantamiento"
                                    )
                                    : ""}

                                <button
                                    class="btn ${closed ? "btn-warning" : "btn-light"} btn-small"
                                    data-action="toggle-observation"
                                    data-id="${inspection.id}"
                                    data-obs="${item.id}"
                                >
                                    ${closed ? "Reabrir" : "Cerrar"}
                                </button>

                            </div>

                        </li>

                    `;

                }).join("");

            return `

                <article class="inspection-card">

                    <div class="inspection-card-head">

                        <div class="inspection-meta">
                            <h4>${escapeHtml(inspection.area)}</h4>
                            <small>${meta}</small>
                        </div>

                        <div class="inspection-progress">
                            ${progressBar(progress.pct || 0)}
                            <span>
                                ${progress.total
                                    ? `${progress.closed}/${progress.total} cerradas`
                                    : "Sin observaciones"}
                            </span>
                        </div>

                        ${evidenceButton(
                            { collection: "inspections", id: inspection.id },
                            SSTMetrics.recordFiles(inspection).length,
                            "Fotos"
                        )}

                        <button

                            class="btn btn-danger btn-small"

                            data-action="delete-inspection"
                            data-id="${inspection.id}"
                        >
                            Eliminar
                        </button>

                    </div>

                    <ul class="obs-list">${items}</ul>

                </article>

            `;

        }).join("");

}


function renderBoardInspections() {

    const month =
        boardMonth();

    const data =
        SSTMetrics.inspectionsStats(state, month);

    const totals = data.totals;

    const rows =
        data.list.length
            ? data.list.map(item => `

                <div class="insp-row">
                    <div class="insp-head">
                        <strong>${escapeHtml(item.area)}</strong>
                        <small>
                            ${shortDate(item.date)} ·
                            ${item.total
                                ? `${item.closed}/${item.total} cerradas (${item.pct}%)`
                                : "sin observaciones"}
                        </small>
                    </div>
                    ${progressBar(item.pct || 0)}
                </div>

            `).join("")
            : emptyBoard(`No hay inspecciones en ${monthTitle(month)}.`);

    setBoard("boardInspectionsBody", `

        <div class="board-stats">
            ${statBox(totals.inspections, "Inspecciones del mes")}
            ${statBox(totals.observations, "Observaciones")}
            ${statBox(totals.closed, "Cerradas", "good")}
            ${statBox(totals.open, "Abiertas", totals.open ? "warn" : "good")}
        </div>

        ${rows}

        <div class="board-legend">
            <span>Observaciones abiertas acumuladas de todos los meses → ${data.openAllTime}</span>
        </div>

    `);

}


/* ---------- Asistencia e inasistencia por colaborador ---------- */

function attendanceBarsHtml(rows) {

    return `

        <div
            class="pbar-chart"
            role="img"
            aria-label="Porcentaje de asistencia por colaborador"
        >

            ${rows.map(row => {

                const tone =
                    SSTMetrics.thresholdTone(row.pct);

                const height =
                    row.pct === null
                        ? 0
                        : Math.min(row.pct, 100);

                return `
                    <div class="pbar-item" title="${escapeHtml(row.worker.name)}">
                        <span class="pbar-value">
                            ${row.pct === null ? "—" : row.pct + "%"}
                        </span>
                        <div class="pbar-track">
                            <div
                                class="pbar-fill tone-${tone}"
                                style="height:${height}%"
                            ></div>
                        </div>
                        <span class="pbar-name">
                            ${escapeHtml(row.worker.name)}
                        </span>
                    </div>
                `;

            }).join("")}

        </div>

    `;

}


function attendanceBadge(pct) {

    if (pct === null) {

        return `<span class="badge badge-gray">Sin registros</span>`;

    }

    const css =
        pct >= 95
            ? "badge-green"
            : pct >= 85
                ? "badge-yellow"
                : "badge-red";

    return `<span class="badge ${css}">${pct}%</span>`;

}


function renderBoardAttendance() {

    const rows =
        SSTMetrics.attendanceByWorker(state, boardMonth());

    if (rows.length === 0) {

        setBoard(
            "boardAttendanceBody",
            emptyBoard("No hay colaboradores activos.")
        );

        return;
    }

    const total =
        rows.reduce((sum, row) => ({
            days: sum.days + row.days,
            attendance: sum.attendance + row.attendance,
            absences: sum.absences + row.absences,
            late: sum.late + row.late
        }), { days: 0, attendance: 0, absences: 0, late: 0 });

    const totalPct =
        total.days
            ? Math.round(
                (total.attendance + total.late) /
                total.days * 100
            )
            : null;

    setBoard("boardAttendanceBody", `

        ${attendanceBarsHtml(rows)}

        <div class="table-wrap">
            <table class="board-table">
                <thead>
                    <tr>
                        <th>Colaborador</th>
                        <th class="center">Días registrados</th>
                        <th class="center">Asistencias</th>
                        <th class="center">Inasistencias</th>
                        <th class="center">Tardanzas</th>
                        <th class="center">% asistencia</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${boardWorkerCell(row.worker)}</td>
                            <td class="center">${row.days}</td>
                            <td class="center">${row.attendance}</td>
                            <td class="center">${row.absences}</td>
                            <td class="center">${row.late}</td>
                            <td class="center">${attendanceBadge(row.pct)}</td>
                        </tr>
                    `).join("")}
                </tbody>
                <tfoot>
                    <tr>
                        <td>Total del equipo</td>
                        <td class="center">${total.days}</td>
                        <td class="center">${total.attendance}</td>
                        <td class="center">${total.absences}</td>
                        <td class="center">${total.late}</td>
                        <td class="center">${attendanceBadge(totalPct)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>

    `);

}


/* ---------- Horas trabajadas por mes ---------- */

function openHoursModal() {

    const month =
        boardMonth();

    const current =
        (state.hours || []).find(
            entry => entry.month === month
        );

    openModal({

        title:
            "Horas trabajadas del mes",

        submitText:
            "Guardar horas",

        values: {
            month,
            hours: current ? current.hours : ""
        },

        fields: [

            {
                name: "month",
                label: "Mes",
                type: "month",
                required: true
            },

            {
                name: "hours",
                label: "Total de horas trabajadas",
                type: "number",
                required: true,
                min: "0",
                step: "any",
                placeholder: "Ej. 12500"
            }

        ],

        onSubmit(data) {

            const updated =
                SSTMetrics.upsertHours(
                    state.hours,
                    data.month,
                    data.hours,
                    createId()
                );

            if (!updated) {

                showToast(
                    "Ingresa un número de horas válido."
                );

                return;
            }

            state.hours = updated;

            saveState();

            closeModal();

            showToast(
                `Horas de ${monthTitle(data.month)} guardadas.`
            );

        }

    });

}


function renderBoardHours() {

    const month =
        boardMonth();

    const year =
        month.slice(0, 4);

    const data =
        SSTMetrics.hoursByYear(state, year);

    const max =
        Math.max(
            ...data.months.map(item => item.hours || 0),
            1
        );

    const average =
        data.registeredMonths
            ? formatNumber(
                Math.round(data.total / data.registeredMonths)
            )
            : "—";

    const bars =
        data.months.map(item => {

            const height =
                item.registered
                    ? Math.max(4, Math.round(item.hours / max * 100))
                    : 0;

            const title =
                item.registered
                    ? `${item.label} ${year}: ${formatNumber(item.hours)} horas`
                    : `${item.label} ${year}: sin registro`;

            return `

                <div
                    class="vbar-item ${item.month === month ? "selected" : ""}"
                    title="${title}"
                >
                    <strong class="vbar-value">
                        ${item.registered ? formatNumber(item.hours) : ""}
                    </strong>

                    <div class="vbar-track">
                        <div
                            class="vbar-fill ${item.registered ? "" : "empty"}"
                            style="height:${height}%"
                        ></div>
                    </div>

                    <span class="vbar-label">${item.label}</span>
                </div>

            `;

        }).join("");

    setBoard("boardHoursBody", `

        <div class="board-stats">
            ${statBox(formatNumber(data.total), `Horas acumuladas ${year}`)}
            ${statBox(`${data.registeredMonths}/12`, "Meses registrados")}
            ${statBox(average, "Promedio por mes")}
        </div>

        <div class="board-body">

            <div class="hours-scroll">
                <div class="vertical-chart hours-chart">
                    ${bars}
                </div>
            </div>

            ${data.registeredMonths === 0
                ? `<p class="goal-note">Aún no registras horas en ${year}. Usa «+ Registrar horas».</p>`
                : ""}

        </div>

    `);

}


/* ---------- Fichas grandes de número ---------- */

function renderBoardTiles() {

    const tiles =
        SSTMetrics.kpiTiles(state, boardMonth());

    setBoard("boardTiles", `

        <div class="tile-grid">

            ${tiles.map(tile => `
                <div class="tile${tile.key === "pending" && tile.value > 0 ? " warn" : ""}">
                    <span class="tile-label">${escapeHtml(tile.label)}</span>
                    <strong
                        class="tile-value"
                        style="--chars:${formatNumber(tile.value).length}"
                    >${formatNumber(tile.value)}</strong>
                    <small>${escapeHtml(tile.sub)}</small>
                </div>
            `).join("")}

        </div>

    `);

}


/* ---------- Medidores en franjas (reactivos / proactivos / gestión) ---------- */

function gaugeCardHtml(item) {

    const geometry =
        SSTMetrics.gaugeGeometry(item.pct);

    const value =
        item.pct === null
            ? "—"
            : `${item.pct.toFixed(1)} %`;

    return `

        <div class="gauge-card tone-${item.tone}">

            <div class="gauge-title">
                ${escapeHtml(item.label)}
            </div>

            <div class="gauge-body">

                <svg
                    class="gauge-svg"
                    viewBox="0 0 200 108"
                    role="img"
                    aria-label="${escapeHtml(item.label)}: ${value}"
                >
                    <path class="gauge-track" d="${geometry.track}"></path>
                    ${geometry.fill
                        ? `<path class="gauge-fill" d="${geometry.fill}"></path>`
                        : ""}
                </svg>

                <div class="gauge-value">${value}</div>

            </div>

            <div class="gauge-scale">
                <span>0 %</span>
                <span>100 %</span>
            </div>

            <div class="gauge-detail">
                ${escapeHtml(item.detail)}
            </div>

        </div>

    `;

}


function renderBoardGauges() {

    const groups =
        SSTMetrics.kpiGauges(state, boardMonth(), today());

    setBoard("boardGauges",
        groups.map(group => `

            <div class="gauge-group group-${group.key}">

                <div class="band band-${group.key}">
                    ${escapeHtml(group.title)}
                </div>

                <div class="gauge-row">
                    ${group.items.map(gaugeCardHtml).join("")}
                </div>

            </div>

        `).join("")
    );

}


/* ---------- Pendientes por área (barras horizontales) ---------- */

function renderBoardAreas() {

    const rows =
        SSTMetrics.pendingByArea(state, today());

    if (rows.length === 0) {

        setBoard(
            "boardAreasBody",
            emptyBoard("No hay pendientes abiertos.")
        );

        return;
    }

    const max =
        Math.max(...rows.map(row => row.count));

    const total =
        rows.reduce((sum, row) => sum + row.count, 0);

    setBoard("boardAreasBody", `

        <div class="board-body hbar-list">

            ${rows.slice(0, 8).map(row => `
                <div class="hbar-row">
                    <span class="hbar-label" title="${escapeHtml(row.area)}">
                        ${escapeHtml(row.area)}
                    </span>
                    <div class="hbar-track">
                        <div
                            class="hbar-fill"
                            style="width:${Math.round(row.count / max * 100)}%"
                        ></div>
                    </div>
                    <strong class="hbar-count">${row.count}</strong>
                </div>
            `).join("")}

        </div>

        <div class="board-legend">
            <span>${total} pendiente(s) en ${rows.length} área(s)</span>
        </div>

    `);

}


/* ---------- Acciones pendientes (tabla con scroll) ---------- */

const ACTION_BADGES = {
    "HPH":             "badge-red",
    "HPI":             "badge-yellow",
    "Mejora continua": "badge-blue",
    "Inspección":      "badge-gray",
    "Incidente":       "badge-yellow",
    "Accidente":       "badge-red"
};


function renderBoardActions() {

    const items =
        SSTMetrics.pendingActions(state, today());

    if (items.length === 0) {

        setBoard(
            "boardActionsBody",
            emptyBoard("No hay acciones pendientes.")
        );

        return;
    }

    setBoard("boardActionsBody", `

        <div class="table-scroll">
            <table class="board-table">
                <thead>
                    <tr>
                        <th>Origen</th>
                        <th>Descripción</th>
                        <th>Área</th>
                        <th>Fecha</th>
                        <th class="center">Abierta</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td>
                                <span class="badge ${ACTION_BADGES[item.source] || "badge-gray"}">
                                    ${escapeHtml(item.source)}
                                </span>
                            </td>
                            <td>${escapeHtml(item.text)}</td>
                            <td>${escapeHtml(item.area || "—")}</td>
                            <td>${formatDate(item.date)}</td>
                            <td class="center${item.daysOpen >= 30 ? " cell-late" : ""}">
                                ${item.daysOpen} d
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>

        <div class="board-legend">
            <span>${items.length} acción(es) pendiente(s)</span>
        </div>

    `);

}


/* ---------- Render general del tablero ---------- */

function renderBoard() {

    renderBoardFilters();

    renderBoardTiles();

    renderBoardGauges();

    renderBoardEpp();

    renderBoardInsurance();

    renderBoardTraining();

    renderBoardFindings();

    renderBoardInspections();

    renderBoardAttendance();

    renderBoardHours();

    renderBoardAreas();

    renderBoardActions();

}


/* =========================================================
   FICHA DEL COLABORADOR
   ========================================================= */

let profileWorkerId = null;

let profileTab = "epp";


const PROFILE_TABS = [
    { key: "epp",            label: "EPP" },
    { key: "seguros",        label: "Seguros" },
    { key: "capacitaciones", label: "Capacitaciones" },
    { key: "emo",            label: "EMO" },
    { key: "asistencia",     label: "Asistencia" },
    { key: "incidentes",     label: "Incidentes" },
    { key: "area",           label: "Inspecciones y hallazgos" },
    { key: "riesgos",        label: "Riesgos IPERC" },
    { key: "documentos",     label: "Documentos" }
];

const COMPLIANCE_BADGES = {
    ok:      { className: "badge-green",  text: "Cumple" },
    due:     { className: "badge-yellow", text: "Atención" },
    expired: { className: "badge-red",    text: "Vencido" },
    missing: { className: "badge-red",    text: "Falta" },
    fail:    { className: "badge-red",    text: "No apto" }
};

// Cambia fechas AAAA-MM-DD de un texto al formato de la app
function datesInText(text) {
    return escapeHtml(text).replace(
        /\d{4}-\d{2}-\d{2}/g,
        date => formatDate(date)
    );
}

function complianceHtml(compliance) {

    if (!compliance) {
        return "";
    }

    return `
        <div class="compliance-box">
            <div class="compliance-head">
                <div>
                    <h4>Cumplimiento SST del trabajador</h4>
                    <small>${compliance.compliant} de ${compliance.total} requisitos vigentes</small>
                </div>
                <strong class="compliance-pct ${compliance.tone}">
                    ${compliance.pct === null ? "—" : compliance.pct + "%"}
                </strong>
            </div>
            ${progressBar(compliance.pct || 0)}
            <ul class="compliance-list">
                ${compliance.checks.map(check => {
                    const badge = COMPLIANCE_BADGES[check.status] || COMPLIANCE_BADGES.missing;
                    return `
                        <li>
                            <span class="badge ${badge.className}">${badge.text}</span>
                            <strong>${escapeHtml(check.label)}</strong>
                            <small>${datesInText(check.detail)}</small>
                        </li>
                    `;
                }).join("")}
            </ul>
        </div>
    `;
}


function openProfile(workerId, tab = "epp") {

    if (!getWorker(workerId)) {
        return;
    }

    profileWorkerId = workerId;

    profileTab = tab;

    renderProfile();

    openPage("ficha");

}


function profileTable(columns, rows, emptyText) {

    if (rows.length === 0) {
        return emptyBoard(emptyText);
    }

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        ${columns.map(column => `<th>${column}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            ${row.map(cell => `<td>${cell}</td>`).join("")}
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

}


function statusBadge(status) {

    return `
        <span class="badge ${status.className}">
            ${status.text}
        </span>
    `;

}


function profileTabContent(profile) {

    const addButton = (kind, label) =>
        profile.worker.status === "Activo"
            ? `
                <button
                    class="btn btn-primary btn-small"
                    data-action="profile-add"
                    data-kind="${kind}"
                >
                    + ${label}
                </button>
            `
            : "";

    const toolbar = (kind, label, hint) => `
        <div class="profile-toolbar">
            <span>${hint}</span>
            ${addButton(kind, label)}
        </div>
    `;

    if (profileTab === "epp") {

        return toolbar("epp", "Registrar EPP", `${profile.epp.length} entrega(s) de EPP`) +
            profileTable(
                ["Equipo", "Cantidad", "Talla", "Entrega", "Renovación", "Estado", "Constancia"],
                profile.epp.map(item => [
                    `<strong>${escapeHtml(item.item)}</strong>`,
                    escapeHtml(item.quantity),
                    escapeHtml(item.size || "—"),
                    formatDate(item.date),
                    formatDate(item.renewal),
                    statusBadge(expirationState(item.renewal)),
                    attachmentButton(item, "Constancia") || "—"
                ]),
                "Este colaborador aún no tiene EPP entregado."
            );
    }

    if (profileTab === "seguros") {

        return toolbar("insurance", "Registrar seguro", `${profile.insurance.length} seguro(s)`) +
            profileTable(
                ["Seguro", "Aseguradora", "Póliza", "Inicio", "Vencimiento", "Estado", "Archivo"],
                profile.insurance.map(item => [
                    `<strong>${escapeHtml(item.type)}</strong>`,
                    escapeHtml(item.provider),
                    escapeHtml(item.policy || "—"),
                    formatDate(item.start),
                    formatDate(item.end),
                    statusBadge(expirationState(item.end)),
                    attachmentButton(item, "Póliza") || "—"
                ]),
                "Este colaborador aún no tiene seguros registrados."
            );
    }

    if (profileTab === "capacitaciones") {

        return toolbar("training", "Registrar capacitación", `${profile.training.length} capacitación(es)`) +
            profileTable(
                ["Capacitación", "Fecha", "Entidad / instructor", "Estado", "Evidencias"],
                profile.training.map(item => [
                    `<strong>${escapeHtml(item.topic)}</strong>`,
                    formatDate(item.date),
                    escapeHtml(item.provider || "—"),
                    trainingStatusHtml(item),
                    evidenceButton(
                        { collection: "training", id: item.id },
                        SSTMetrics.recordFiles(item).length
                    )
                ]),
                "Este colaborador aún no tiene capacitaciones registradas."
            );
    }

    if (profileTab === "emo") {

        return toolbar("medical", "Registrar examen", `${profile.medical.length} examen(es) médico(s)`) +
            profileTable(
                ["Tipo", "Fecha", "Resultado", "Vencimiento", "Estado", "Certificado"],
                profile.medical.map(item => [
                    `<strong>${escapeHtml(item.type)}</strong>`,
                    formatDate(item.date),
                    escapeHtml(item.result),
                    formatDate(item.expiry),
                    statusBadge(expirationState(item.expiry)),
                    attachmentButton(item, "Certificado") || "—"
                ]),
                "Este colaborador aún no tiene exámenes médicos registrados."
            );
    }

    if (profileTab === "asistencia") {

        const summary = profile.attendanceSummary;

        return `
            <div class="board-stats">
                ${statBox(summary.days, "Días registrados")}
                ${statBox(summary.attendance, "Asistencias", "good")}
                ${statBox(summary.absences, "Inasistencias", summary.absences ? "warn" : "")}
                ${statBox(summary.late, "Tardanzas")}
                ${statBox(summary.pct === null ? "—" : summary.pct + "%", "Asistencia")}
            </div>
        ` + toolbar("attendance", "Registrar asistencia", `${profile.attendance.length} registro(s)`) +
            profileTable(
                ["Fecha", "Estado", "Observación"],
                profile.attendance.map(item => [
                    formatDate(item.date),
                    escapeHtml(item.status),
                    escapeHtml(item.note || "—")
                ]),
                "Este colaborador aún no tiene asistencia registrada."
            );
    }

    if (profileTab === "area") {
        const rows = [
            ...profile.area.inspections.flatMap(inspection =>
                (inspection.observations || []).map(item => ({
                    date: inspection.date,
                    source: "Inspección",
                    text: item.text,
                    closed: item.status === "Cerrada",
                    status: item.status
                }))),
            ...profile.area.findings.map(item => ({
                date: item.date,
                source: findingLabel(item.type),
                text: item.description,
                closed: item.status === "Cerrado",
                status: item.status
            }))
        ].sort((a, b) =>
            Number(a.closed) - Number(b.closed) ||
            String(b.date || "").localeCompare(String(a.date || "")));
        const open = rows.filter(item => !item.closed).length;
        return `
            <div class="profile-toolbar">
                <span>Área <strong>${escapeHtml(profile.worker.area)}</strong> · ${open} abierta(s) de ${rows.length}</span>
            </div>
        ` + profileTable(
            ["Fecha", "Origen", "Observación / hallazgo", "Estado"],
            rows.map(item => [
                formatDate(item.date),
                escapeHtml(item.source),
                escapeHtml(item.text),
                `<span class="badge ${item.closed ? "badge-green" : "badge-yellow"}">${escapeHtml(item.status)}</span>`
            ]),
            "No hay inspecciones ni hallazgos registrados en su área."
        );
    }

    if (profileTab === "riesgos") {
        return `
            <div class="profile-toolbar">
                <span>Riesgos de su área (${escapeHtml(profile.worker.area)}) o puesto (${escapeHtml(profile.worker.role)})</span>
            </div>
        ` + profileTable(
            ["Peligro", "Riesgo", "Nivel", "Medidas de control"],
            profile.area.risks
                .map(item => ({ item, level: SSTMetrics.riskLevel(item.probability, item.severity) }))
                .sort((a, b) => b.level.score - a.level.score)
                .map(({ item, level }) => [
                    `<strong>${escapeHtml(item.hazard)}</strong>`,
                    escapeHtml(item.risk),
                    `<span class="badge badge-risk ${level.className}">${level.icon} ${level.label}</span>`,
                    escapeHtml(item.control || "—")
                ]),
            "No hay riesgos IPERC registrados para su área o puesto."
        );
    }

    if (profileTab === "documentos") {
        return `
            <div class="profile-toolbar">
                <span>${profile.documents.reduce((sum, doc) => sum + doc.files.length, 0)} archivo(s) adjuntos a sus registros</span>
            </div>
        ` + profileTable(
            ["Módulo", "Registro", "Fecha", "Archivos"],
            profile.documents.map(doc => [
                escapeHtml(doc.module),
                `<strong>${escapeHtml(doc.title || "—")}</strong>`,
                formatDate(doc.date),
                `<div class="actions">${doc.files.map(file => `
                    <button
                        type="button"
                        class="btn btn-light btn-small"
                        data-action="open-file"
                        data-file="${escapeHtml(file.id)}"
                        title="${escapeHtml(file.name)}"
                    >
                        📎 ${escapeHtml(file.name.length > 24 ? file.name.slice(0, 22) + "…" : file.name)}
                    </button>
                `).join("")}</div>`
            ]),
            "Este colaborador aún no tiene documentos adjuntos."
        );
    }

    return toolbar("incident", "Registrar incidente", `${profile.incidents.length} incidente(s) o accidente(s)`) +
        profileTable(
            ["Fecha", "Tipo", "Severidad", "Descripción", "Estado", "Evidencia"],
            profile.incidents.map(item => [
                formatDate(item.date),
                `<span class="badge ${INCIDENT_BADGES[item.type] || "badge-gray"}">${escapeHtml(item.type)}</span>`,
                `<span class="badge ${SEVERITY_BADGES[item.severity] || "badge-gray"}">${escapeHtml(item.severity)}</span>`,
                eventCellHtml(item),
                `<span class="badge ${item.status === "Cerrado" ? "badge-green" : "badge-yellow"}">${escapeHtml(item.status)}</span>`,
                attachmentButton(item, "Foto") || "—"
            ]),
            "Este colaborador no tiene incidentes ni accidentes registrados."
        );

}


// Años cumplidos a una fecha (null si no hay fecha válida)
function ageFrom(birthDate) {

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate || ""))) {
        return null;
    }

    const [year, month, day] = birthDate.split("-").map(Number);
    const [ty, tm, td] = today().split("-").map(Number);

    let age = ty - year;

    if (tm < month || (tm === month && td < day)) {
        age -= 1;
    }

    return age >= 0 ? age : null;
}

function profileDataHtml(worker) {

    const value = text => escapeHtml(text || "—");
    const age = ageFrom(worker.birthDate);

    const groups = [
        {
            title: "Datos laborales",
            items: [
                ["DNI", value(worker.dni)],
                ["Cargo", value(worker.role)],
                ["Área", value(worker.area)],
                ["Fecha de ingreso", formatDate(worker.joined)],
                ["Tipo de contrato", value(worker.contractType)],
                ["Turno / régimen", value(worker.shift)],
                ["Jefe inmediato", value(worker.supervisor)]
            ]
        },
        {
            title: "Datos personales",
            items: [
                ["Fecha de nacimiento", worker.birthDate
                    ? `${formatDate(worker.birthDate)}${age !== null ? ` (${age} años)` : ""}`
                    : "—"],
                ["Grupo sanguíneo", value(worker.bloodType)],
                ["Teléfono", value(worker.phone)],
                ["Correo", value(worker.email)],
                ["Dirección", value(worker.address)],
                ["Licencia de conducir", worker.license
                    ? `${escapeHtml(worker.license)}${worker.licenseExpiry
                        ? ` · vence ${formatDate(worker.licenseExpiry)} ${statusBadge(expirationState(worker.licenseExpiry))}`
                        : ""}`
                    : "—"]
            ]
        },
        {
            title: "Contacto de emergencia",
            items: [
                ["Nombre", value(worker.emergencyName)],
                ["Teléfono", value(worker.emergencyPhone)],
                ["Parentesco", value(worker.emergencyRelation)]
            ]
        }
    ];

    return groups.map(group => `
        <div class="profile-group">
            <h4>${group.title}</h4>
            <dl class="profile-data">
                ${group.items.map(([label, html]) =>
                    `<div><dt>${label}</dt><dd>${html}</dd></div>`
                ).join("")}
            </dl>
        </div>
    `).join("");
}


function renderProfile() {

    const header = document.getElementById("profileHeader");
    const tabs = document.getElementById("profileTabs");
    const body = document.getElementById("profileBody");

    const profile =
        profileWorkerId
            ? SSTMetrics.workerProfile(state, profileWorkerId, today())
            : null;

    if (!profile) {

        header.innerHTML =
            emptyBoard("Elige un colaborador en la lista para ver su ficha.");

        tabs.innerHTML = "";

        body.innerHTML = "";

        return;

    }

    const worker = profile.worker;

    profile.compliance =
        SSTMetrics.workerCompliance(state, worker.id, today());
    profile.area =
        SSTMetrics.workerAreaRecords(state, worker);
    profile.documents =
        SSTMetrics.workerDocuments(state, worker.id);

    const chips = [
        profile.alerts.epp
            ? `<span class="badge badge-yellow">⛑ ${profile.alerts.epp} EPP por renovar o vencido</span>`
            : "",
        profile.alerts.insurance
            ? `<span class="badge badge-yellow">🛡 ${profile.alerts.insurance} seguro(s) por vencer o vencido(s)</span>`
            : "",
        profile.alerts.medical
            ? `<span class="badge badge-yellow">❤ ${profile.alerts.medical} examen(es) por vencer o vencido(s)</span>`
            : "",
        profile.alerts.incidents
            ? `<span class="badge badge-red">🚨 ${profile.alerts.incidents} incidente(s) pendiente(s)</span>`
            : ""
    ].filter(Boolean);

    header.innerHTML = `

        <div class="profile-head">

            <div class="avatar profile-avatar">
                ${initials(worker.name)}
            </div>

            <div class="profile-id">
                <h3>${escapeHtml(worker.name)}</h3>
                <span class="badge ${worker.status === "Activo" ? "badge-green" : "badge-gray"}">
                    ${escapeHtml(worker.status)}
                </span>
            </div>

            <div class="actions">
                <button class="btn btn-light" data-action="back-workers">
                    ← Colaboradores
                </button>
                <button class="btn btn-light" data-action="print-profile">
                    🖨 Imprimir / PDF
                </button>
                <button
                    class="btn btn-primary"
                    data-action="edit-worker"
                    data-id="${worker.id}"
                >
                    Editar datos
                </button>
            </div>

        </div>

        ${profileDataHtml(worker)}

        <div class="profile-chips">
            ${chips.length
                ? chips.join("")
                : '<span class="badge badge-green">✓ Sin alertas pendientes</span>'}
        </div>

        ${complianceHtml(profile.compliance)}

    `;

    const counts = {
        epp: profile.epp.length,
        seguros: profile.insurance.length,
        capacitaciones: profile.training.length,
        emo: profile.medical.length,
        asistencia: profile.attendance.length,
        incidentes: profile.incidents.length,
        area: profile.area.inspections.reduce(
            (sum, item) => sum + (item.observations || []).length, 0) +
            profile.area.findings.length,
        riesgos: profile.area.risks.length,
        documentos: profile.documents.length
    };

    tabs.innerHTML =
        PROFILE_TABS.map(tab => `
            <button
                class="tab${tab.key === profileTab ? " active" : ""}"
                data-action="profile-tab"
                data-tab="${tab.key}"
            >
                ${tab.label}
                <span class="tab-count">${counts[tab.key]}</span>
            </button>
        `).join("");

    body.innerHTML = profileTabContent(profile);

}


/* ---------- Ficha imprimible (el navegador permite guardarla en PDF) ---------- */

function printWorkerProfile() {

    const profile =
        profileWorkerId
            ? SSTMetrics.workerProfile(state, profileWorkerId, today())
            : null;

    if (!profile) {
        return;
    }

    const worker = profile.worker;
    const compliance = SSTMetrics.workerCompliance(state, worker.id, today());
    const value = text => escapeHtml(text || "—");

    const table = (title, columns, rows) => `
        <h2>${title}</h2>
        ${rows.length
            ? `<table>
                <thead><tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr></thead>
                <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
            </table>`
            : `<p class="empty">Sin registros.</p>`}
    `;

    const data = (label, html) => `<div><dt>${label}</dt><dd>${html}</dd></div>`;

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Ficha SST - ${escapeHtml(worker.name)}</title>
<style>
    body { font-family: Arial, sans-serif; color: #17212b; margin: 24px; font-size: 12px; }
    h1 { font-size: 20px; margin: 0; }
    h2 { font-size: 13px; text-transform: uppercase; color: #0f5c75; border-bottom: 2px solid #0f5c75; padding-bottom: 3px; margin: 18px 0 6px; }
    .sub { color: #6b7887; margin: 2px 0 10px; }
    dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; margin: 0; }
    dt { font-size: 9px; text-transform: uppercase; color: #6b7887; font-weight: bold; }
    dd { margin: 1px 0 0; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #dce5eb; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #e7f4f8; font-size: 10px; text-transform: uppercase; }
    .empty { color: #6b7887; font-style: italic; }
    .pct { font-size: 18px; font-weight: bold; }
    .firma { display: flex; gap: 40px; margin-top: 50px; }
    .firma div { flex: 1; border-top: 1px solid #17212b; text-align: center; padding-top: 4px; }
    @media print { body { margin: 10mm; } }
</style></head><body>
    <h1>Ficha SST del colaborador</h1>
    <p class="sub">${escapeHtml(worker.name)} · emitida el ${formatDate(today())}</p>

    <h2>Datos laborales</h2>
    <dl>
        ${data("Nombre", value(worker.name))}
        ${data("DNI", value(worker.dni))}
        ${data("Estado", value(worker.status))}
        ${data("Cargo", value(worker.role))}
        ${data("Área", value(worker.area))}
        ${data("Fecha de ingreso", formatDate(worker.joined))}
        ${data("Tipo de contrato", value(worker.contractType))}
        ${data("Turno / régimen", value(worker.shift))}
        ${data("Jefe inmediato", value(worker.supervisor))}
    </dl>

    <h2>Datos personales y emergencia</h2>
    <dl>
        ${data("Fecha de nacimiento", worker.birthDate ? formatDate(worker.birthDate) : "—")}
        ${data("Grupo sanguíneo", value(worker.bloodType))}
        ${data("Teléfono", value(worker.phone))}
        ${data("Correo", value(worker.email))}
        ${data("Dirección", value(worker.address))}
        ${data("Licencia", worker.license
            ? `${escapeHtml(worker.license)}${worker.licenseExpiry ? " (vence " + formatDate(worker.licenseExpiry) + ")" : ""}`
            : "—")}
        ${data("Contacto de emergencia", value(worker.emergencyName))}
        ${data("Teléfono de emergencia", value(worker.emergencyPhone))}
        ${data("Parentesco", value(worker.emergencyRelation))}
    </dl>

    <h2>Cumplimiento SST · <span class="pct">${compliance.pct === null ? "—" : compliance.pct + "%"}</span></h2>
    ${table("", ["Requisito", "Estado", "Detalle"], compliance.checks.map(check => [
        escapeHtml(check.label),
        (COMPLIANCE_BADGES[check.status] || COMPLIANCE_BADGES.missing).text,
        datesInText(check.detail)
    ]))}

    ${table("EPP entregado", ["Equipo", "Cant.", "Talla", "Entrega", "Renovación"], profile.epp.map(item => [
        value(item.item), value(item.quantity), value(item.size), formatDate(item.date), formatDate(item.renewal)
    ]))}

    ${table("Seguros", ["Seguro", "Aseguradora", "Póliza", "Inicio", "Vencimiento"], profile.insurance.map(item => [
        value(item.type), value(item.provider), value(item.policy), formatDate(item.start), formatDate(item.end)
    ]))}

    ${table("Capacitaciones", ["Tema", "Fecha", "Entidad / instructor", "Estado", "Nota"], profile.training.map(item => [
        value(item.topic), formatDate(item.date), value(item.provider), value(item.status),
        item.grade !== undefined && item.grade !== "" ? escapeHtml(item.grade) : "—"
    ]))}

    ${table("Exámenes médicos", ["Tipo", "Fecha", "Resultado", "Vencimiento"], profile.medical.map(item => [
        value(item.type), formatDate(item.date), value(item.result), formatDate(item.expiry)
    ]))}

    ${table("Incidentes y accidentes", ["Fecha", "Tipo", "Severidad", "Evento", "Estado"], profile.incidents.map(item => [
        formatDate(item.date), value(item.type), value(item.severity), escapeHtml(SSTMetrics.eventTitle(item)), value(item.status)
    ]))}

    <div class="firma">
        <div>Firma del colaborador</div>
        <div>Firma del responsable SST</div>
    </div>

    <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
</body></html>`;

    const win = window.open("", "_blank");

    if (!win) {
        showToast("Permite las ventanas emergentes para imprimir la ficha.");
        return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
}


function addFromProfile(kind) {

    const id = profileWorkerId;

    if (!id) {
        return;
    }

    ({
        epp: () => openEppModal(id),
        insurance: () => openInsuranceModal(id),
        training: () => openTrainingModal(id),
        medical: () => openMedicalModal(id),
        attendance: () => openAttendanceModal(id),
        incident: () => openIncidentModal(null, id)
    })[kind]?.();

}


/* =========================================================
   INCIDENTES Y ACCIDENTES
   ========================================================= */

const INCIDENT_BADGES = {
    Incidente: "badge-yellow",
    Accidente: "badge-red"
};


const SEVERITY_BADGES = {
    Leve:     "badge-green",
    Moderado: "badge-yellow",
    Grave:    "badge-red",
    Fatal:    "badge-red"
};


function openIncidentModal(incidentId = null, workerId = "") {

    const incident =
        incidentId
            ? state.incidents.find(item => item.id === incidentId)
            : null;

    openModal({

        title:
            incident
                ? "Editar incidente / accidente"
                : "Registrar incidente / accidente",

        submitText:
            incident
                ? "Guardar cambios"
                : "Registrar",

        values:
            incident || {
                type: "Incidente",
                date: today(),
                workerId,
                severity: "Leve",
                status: "Pendiente"
            },

        fields: [
            { type: "section", label: "Datos del evento" },
            {
                name: "name",
                label: "Nombre del evento",
                required: true,
                full: true,
                placeholder: "Ej. Volcadura de vehículo, corte en la mano..."
            },
            {
                name: "type",
                label: "Tipo",
                type: "select",
                required: true,
                options: SSTMetrics.INCIDENT_TYPES
            },
            {
                name: "severity",
                label: "Severidad",
                type: "select",
                required: true,
                options: SSTMetrics.INCIDENT_SEVERITIES
            },
            {
                name: "date",
                label: "Fecha",
                type: "date",
                required: true
            },
            {
                name: "time",
                label: "Hora",
                type: "time"
            },
            {
                name: "workerId",
                label: "Trabajador involucrado",
                type: "select",
                options: [
                    { value: "", label: "— Ninguno / no aplica —" },
                    ...workerOptions()
                ]
            },
            {
                name: "area",
                label: "Área",
                required: true,
                placeholder: "Ej. Almacén, taller..."
            },
            {
                name: "location",
                label: "Lugar exacto",
                full: true,
                placeholder: "Ej. Rampa de carga N° 2, junto al montacargas"
            },
            {
                name: "status",
                label: "Estado",
                type: "select",
                options: ["Pendiente", "Cerrado"]
            },
            {
                name: "description",
                label: "Descripción",
                type: "textarea",
                required: true,
                full: true,
                placeholder: "Qué ocurrió, cómo y dónde..."
            },
            {
                name: "witnesses",
                label: "Testigos (nombre y cargo)",
                type: "textarea",
                full: true
            },

            { type: "section", label: "Lesión", hint: "Completa esta parte si hubo lesionados (accidente)." },
            {
                name: "injuryType",
                label: "Tipo de lesión",
                type: "select",
                options: [
                    { value: "", label: "— Sin lesión / no aplica —" },
                    ...SSTMetrics.INJURY_TYPES
                ]
            },
            {
                name: "bodyPart",
                label: "Parte del cuerpo afectada",
                placeholder: "Ej. Mano derecha"
            },
            {
                name: "lostDays",
                label: "Días de descanso médico",
                type: "number",
                min: "0",
                step: "1"
            },
            {
                name: "notificationDate",
                label: "Fecha de notificación / reporte",
                type: "date"
            },

            { type: "section", label: "Investigación", hint: "Causas del evento según el análisis realizado." },
            {
                name: "investigator",
                label: "Investigador / equipo"
            },
            {
                name: "investigationDate",
                label: "Fecha de investigación",
                type: "date"
            },
            {
                name: "immediateActs",
                label: "Causas inmediatas: actos subestándar",
                type: "textarea",
                placeholder: "Ej. Operar sin autorización, no usar EPP..."
            },
            {
                name: "immediateConditions",
                label: "Causas inmediatas: condiciones subestándar",
                type: "textarea",
                placeholder: "Ej. Piso resbaloso, guarda de máquina retirada..."
            },
            {
                name: "basicPersonal",
                label: "Causas básicas: factores personales",
                type: "textarea",
                placeholder: "Ej. Falta de conocimiento, fatiga..."
            },
            {
                name: "basicJob",
                label: "Causas básicas: factores del trabajo",
                type: "textarea",
                placeholder: "Ej. Procedimiento inexistente, mantenimiento deficiente..."
            },
            {
                name: "rootAnalysis",
                label: "Análisis de causa raíz (5 porqués / árbol de causas)",
                type: "textarea",
                full: true,
                placeholder: "1. ¿Por qué...? 2. ¿Por qué...?"
            },

            { type: "section", label: "Acción inmediata", hint: "El plan de acción con varias acciones se gestiona desde el botón “Investigación”." },
            {
                name: "correctiveAction",
                label: "Acción correctiva inmediata",
                type: "textarea",
                full: true,
                placeholder: "Qué se hizo o se hará de inmediato..."
            },
            {
                name: "responsible",
                label: "Responsable de la acción",
                full: true
            },
            attachmentField(incident ? "Agregar fotos / evidencias" : "Fotos / evidencias", true)
        ],
        async onSubmit(data) {
            const { attachment: files, ...rest } = data;
            if (
                rest.status === "Cerrado" &&
                incident?.status !== "Cerrado" &&
                !confirmCloseIncident(incident)
            ) {
                return;
            }
            modalSubmit.disabled = true;
            const stored = await storeAttachments(files);
            const closedDate =
                rest.status === "Cerrado"
                    ? (incident?.closedDate || today())
                    : "";
            if (incident) {
                Object.assign(incident, rest, { closedDate });
                if (stored.length) {
                    normalizeFiles(incident).push(...stored);
                }
            } else {
                state.incidents.push({
                    id: createId(),
                    ...rest,
                    closedDate,
                    actions: [],
                    ...(stored.length ? { attachments: stored } : {})
                });
            }


            saveState();

            closeModal();

            showToast(
                incident
                    ? "Registro actualizado."
                    : "Incidente registrado."
            );

        }

    });

}


/* ---------- Investigación y plan de acción ---------- */

const ACTION_STATUS_BADGES = {
    Pendiente: "badge-yellow",
    Cumplida: "badge-green"
};

// Pide confirmación si se cierra con acciones del plan sin cumplir
function confirmCloseIncident(incident) {

    if (!incident) {
        return true;
    }

    const open =
        SSTMetrics.investigationStatus(incident, today()).actions.open;

    return open === 0 || confirm(
        `Este evento tiene ${open} acción(es) del plan sin cumplir. ¿Cerrarlo de todas formas?`
    );
}

function investigationCellHtml(record) {

    const info =
        SSTMetrics.investigationStatus(record, today());

    const parts = [`Investigación ${info.pct ?? 0}%`];

    if (info.actions.total) {
        parts.push(`${info.actions.done}/${info.actions.total} acciones`);
    }

    return `
        <small class="cell-sub ${info.actions.overdue ? "text-danger" : ""}">
            ${parts.join(" · ")}
            ${info.actions.overdue ? ` · ⚠ ${info.actions.overdue} vencida(s)` : ""}
        </small>
    `;
}

function openIncidentDetail(incidentId) {

    const incident =
        state.incidents.find(item => item.id === incidentId);

    if (!incident) {
        return;
    }

    const info =
        SSTMetrics.investigationStatus(incident, today());

    const text = value =>
        String(value ?? "").trim()
            ? escapeHtml(value).replace(/\n/g, "<br>")
            : `<span class="muted-text">Sin registrar</span>`;

    const block = (title, value) => `
        <div class="inv-block">
            <dt>${title}</dt>
            <dd>${text(value)}</dd>
        </div>
    `;

    const actions =
        (Array.isArray(incident.actions) ? incident.actions : [])
            .slice()
            .sort((a, b) =>
                Number(a.status === "Cumplida") - Number(b.status === "Cumplida") ||
                String(a.due || "9999").localeCompare(String(b.due || "9999")));

    const actionsHtml =
        actions.length
            ? `
                <ul class="inv-actions">
                    ${actions.map(action => {
                        const done = action.status === "Cumplida";
                        const overdue = !done && action.due && action.due < today();
                        return `
                            <li class="${done ? "done" : ""} ${overdue ? "overdue" : ""}">
                                <div>
                                    <strong>${escapeHtml(action.text)}</strong>
                                    <small>
                                        ${escapeHtml(action.responsible || "Sin responsable")}
                                        · ${action.due ? "límite " + formatDate(action.due) : "sin fecha límite"}
                                        ${done && action.doneDate ? " · cumplida el " + formatDate(action.doneDate) : ""}
                                        ${overdue ? " · ⚠ vencida" : ""}
                                    </small>
                                </div>
                                <div class="actions">
                                    <span class="badge ${ACTION_STATUS_BADGES[action.status] || "badge-gray"}">
                                        ${escapeHtml(action.status || "Pendiente")}
                                    </span>
                                    <button
                                        type="button"
                                        class="btn ${done ? "btn-warning" : "btn-light"} btn-small"
                                        data-action="incident-action-toggle"
                                        data-id="${incident.id}"
                                        data-action-id="${action.id}"
                                    >
                                        ${done ? "Reabrir" : "Cumplida"}
                                    </button>
                                    <button
                                        type="button"
                                        class="btn btn-danger btn-small"
                                        data-action="incident-action-delete"
                                        data-id="${incident.id}"
                                        data-action-id="${action.id}"
                                    >
                                        ×
                                    </button>
                                </div>
                            </li>
                        `;
                    }).join("")}
                </ul>
            `
            : `<div class="evidence-empty">Aún no hay acciones en el plan.</div>`;

    openModal({
        title: "Investigación del evento",
        submitText: "Listo",
        fields: [
            {
                type: "html",
                html: `
                    <div class="inv-head">
                        <div>
                            <small>
                                ${escapeHtml(incident.type)} · ${formatDate(incident.date)}${incident.time ? " " + escapeHtml(incident.time) : ""}
                                · ${escapeHtml(incident.severity || "")} · ${escapeHtml(incident.status)}
                            </small>
                            <strong>${escapeHtml(SSTMetrics.eventTitle(incident))}</strong>
                            <small>
                                ${incident.workerId ? escapeHtml(workerName(incident.workerId)) + " · " : ""}
                                ${escapeHtml(incident.area || "")}${incident.location ? " · " + escapeHtml(incident.location) : ""}
                            </small>
                        </div>
                        <button
                            type="button"
                            class="btn btn-light btn-small"
                            data-action="edit-incident"
                            data-id="${incident.id}"
                        >
                            ✎ Editar investigación
                        </button>
                    </div>
                    <div class="inv-progress">
                        <span>Investigación completa al <strong>${info.pct ?? 0}%</strong> (${info.done} de ${info.total})</span>
                        ${progressBar(info.pct || 0)}
                        ${info.missing.length
                            ? `<small>Falta: ${info.missing.map(escapeHtml).join(", ")}</small>`
                            : `<small class="text-good">✓ Investigación completa</small>`}
                    </div>
                `
            },
            { type: "section", label: "Descripción" },
            {
                type: "html",
                html: `
                    <dl class="inv-grid">
                        ${block("Qué ocurrió", incident.description)}
                        ${block("Testigos", incident.witnesses)}
                        ${incident.type === "Accidente" || incident.injuryType
                            ? block("Lesión", [incident.injuryType, incident.bodyPart].filter(Boolean).join(" · ")) +
                              block("Días de descanso médico", incident.lostDays) +
                              block("Fecha de notificación", incident.notificationDate ? formatDate(incident.notificationDate) : "")
                            : ""}
                    </dl>
                `
            },
            { type: "section", label: "Causas" },
            {
                type: "html",
                html: `
                    <dl class="inv-grid">
                        ${block("Actos subestándar", incident.immediateActs)}
                        ${block("Condiciones subestándar", incident.immediateConditions)}
                        ${block("Factores personales", incident.basicPersonal)}
                        ${block("Factores del trabajo", incident.basicJob)}
                    </dl>
                    <dl class="inv-grid single">
                        ${block("Análisis de causa raíz", incident.rootAnalysis)}
                        ${block("Investigador / fecha", [incident.investigator, incident.investigationDate ? formatDate(incident.investigationDate) : ""].filter(Boolean).join(" · "))}
                    </dl>
                `
            },
            {
                type: "section",
                label: `Plan de acción (${info.actions.done}/${info.actions.total} cumplidas)`
            },
            {
                type: "html",
                html: `
                    ${incident.correctiveAction
                        ? `<div class="evidence-context"><small>Acción inmediata${incident.responsible ? " · " + escapeHtml(incident.responsible) : ""}</small><span>${escapeHtml(incident.correctiveAction)}</span></div>`
                        : ""}
                    ${actionsHtml}
                    <div>
                        <button
                            type="button"
                            class="btn btn-primary btn-small"
                            data-action="incident-add-action"
                            data-id="${incident.id}"
                        >
                            + Agregar acción
                        </button>
                    </div>
                `
            },
            { type: "section", label: "Evidencias" },
            {
                type: "html",
                html: evidenceListHtml(incident, { collection: "incidents", id: incident.id })
            },
            attachmentField("Agregar fotos o documentos", true)
        ],
        async onSubmit(data) {

            modalSubmit.disabled = true;

            const stored =
                await storeAttachments(data.attachment);

            if (stored.length) {
                normalizeFiles(incident).push(...stored);
                saveState();
                showToast(`${stored.length} evidencia(s) agregada(s).`);
            }

            closeModal();
        }
    });

    evidenceReopen =
        () => openIncidentDetail(incidentId);
}

function openIncidentActionModal(incidentId) {

    const incident =
        state.incidents.find(item => item.id === incidentId);

    if (!incident) {
        return;
    }

    openModal({
        title: "Agregar acción al plan",
        submitText: "Agregar acción",
        values: {},
        fields: [
            {
                name: "text",
                label: "Acción",
                type: "textarea",
                required: true,
                full: true,
                placeholder: "Ej. Instalar guarda en la sierra circular"
            },
            {
                name: "responsible",
                label: "Responsable"
            },
            {
                name: "due",
                label: "Fecha límite",
                type: "date"
            }
        ],
        onSubmit(data) {

            incident.actions =
                Array.isArray(incident.actions) ? incident.actions : [];

            incident.actions.push({
                id: createId(),
                text: String(data.text || "").trim(),
                responsible: String(data.responsible || "").trim(),
                due: data.due || "",
                status: "Pendiente",
                doneDate: ""
            });

            saveState();
            showToast("Acción agregada al plan.");
            openIncidentDetail(incidentId);
        }
    });
}

function toggleIncidentAction(incidentId, actionId) {

    const incident =
        state.incidents.find(item => item.id === incidentId);

    const action =
        incident?.actions?.find(item => item.id === actionId);

    if (!action) {
        return;
    }

    const done = action.status !== "Cumplida";

    action.status = done ? "Cumplida" : "Pendiente";
    action.doneDate = done ? today() : "";

    saveState();
    openIncidentDetail(incidentId);
}

function deleteIncidentAction(incidentId, actionId) {

    const incident =
        state.incidents.find(item => item.id === incidentId);

    if (!incident || !confirm("¿Eliminar esta acción del plan?")) {
        return;
    }

    incident.actions =
        (incident.actions || []).filter(item => item.id !== actionId);

    saveState();
    openIncidentDetail(incidentId);
}


function eventCellHtml(record) {

    const name = String(record.name || "").trim();

    return name
        ? `<strong>${escapeHtml(name)}</strong><span class="cell-desc">${escapeHtml(record.description)}</span>`
        : escapeHtml(record.description);

}


function renderIncidents() {

    const tbody = document.getElementById("incidentsTbody");

    const stats = document.getElementById("incidentsStats");

    const records =
        [...state.incidents].sort(
            (a, b) => b.date.localeCompare(a.date)
        );

    const count = test => records.filter(test).length;

    stats.innerHTML = `
        ${statBox(records.length, "Registrados")}
        ${statBox(count(item => item.type === "Accidente"), "Accidentes", count(item => item.type === "Accidente") ? "warn" : "")}
        ${statBox(count(item => item.type === "Incidente"), "Incidentes")}
        ${statBox(count(item => item.status !== "Cerrado"), "Pendientes", count(item => item.status !== "Cerrado") ? "warn" : "good")}
    `;

    if (records.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="9">
                    Aún no hay incidentes ni accidentes registrados.
                </td>
            </tr>
        `;

        return;

    }

    tbody.innerHTML =
        records.map(record => {

            const closed = record.status === "Cerrado";

            return `

                <tr>

                    <td>${formatDate(record.date)}</td>

                    <td>
                        <span class="badge ${INCIDENT_BADGES[record.type] || "badge-gray"}">
                            ${escapeHtml(record.type)}
                        </span>
                    </td>

                    <td>
                        ${record.workerId
                            ? `<button class="worker-link" data-action="view-worker" data-id="${record.workerId}">
                                    ${escapeHtml(workerName(record.workerId))}
                               </button>`
                            : "—"}
                    </td>

                    <td>${escapeHtml(record.area)}</td>

                    <td>
                        <span class="badge ${SEVERITY_BADGES[record.severity] || "badge-gray"}">
                            ${escapeHtml(record.severity)}
                        </span>
                    </td>

                    <td>${eventCellHtml(record)}</td>

                    <td>
                        ${escapeHtml(record.correctiveAction || "—")}
                        ${record.responsible
                            ? `<small class="cell-sub">Resp.: ${escapeHtml(record.responsible)}</small>`
                            : ""}
                    </td>

                    <td>
                        <span class="badge ${closed ? "badge-green" : "badge-yellow"}">
                            ${escapeHtml(record.status)}
                        </span>
                        ${closed
                            ? `<small class="cell-sub">${formatDate(record.closedDate)}</small>`
                            : ""}
                        ${investigationCellHtml(record)}
                    </td>
                    <td>
                        <div class="actions">
                            <button
                                class="btn btn-primary btn-small"
                                data-action="incident-detail"
                                data-id="${record.id}"
                            >
                                Investigación
                            </button>
                            ${attachmentButton(record, "Foto")}
                            <button
                                class="btn btn-light btn-small"
                                data-action="edit-incident"
                                data-id="${record.id}"
                            >
                                Editar
                            </button>

                            <button
                                class="btn ${closed ? "btn-warning" : "btn-light"} btn-small"
                                data-action="toggle-incident"
                                data-id="${record.id}"
                            >
                                ${closed ? "Reabrir" : "Cerrar"}
                            </button>

                            <button
                                class="btn btn-danger btn-small"
                                data-action="delete-incident"
                                data-id="${record.id}"
                            >
                                Eliminar
                            </button>

                        </div>
                    </td>

                </tr>

            `;

        }).join("");

}


/* =========================================================
   RELOJ DEL ÚLTIMO EVENTO
   Cualquier incidente o accidente reinicia el contador.
   ========================================================= */

function renderEventClock() {

    const stats =
        SSTMetrics.lastEventStats(state, today());

    const clock = document.getElementById("eventClock");

    const days = stats.days;

    clock.classList.toggle("danger", days !== null && days <= 7);

    clock.classList.toggle("warn", days !== null && days > 7 && days <= 30);

    document.getElementById("eventDays").textContent =
        days === null ? "—" : days;

    document.getElementById("eventDaysLabel").textContent =
        days === 1
            ? "día del último evento"
            : "días del último evento";

    document.getElementById("eventLastName").textContent =
        stats.last ? stats.last.title : "Sin eventos registrados";

    document.getElementById("eventLastDate").textContent =
        stats.last
            ? formatDate(stats.last.date)
            : "Registra el primero en Incidentes";

    renderEventDetail(stats);

}


function renderEventDetail(stats = SSTMetrics.lastEventStats(state, today())) {

    const detail = document.getElementById("eventDetail");

    if (!stats.last) {

        detail.innerHTML = `
            ${emptyBoard("Aún no hay eventos registrados.")}
            <div class="modal-actions">
                <button class="btn btn-primary" data-action="new-event">
                    + Registrar evento
                </button>
            </div>
        `;

        return;

    }

    const last = stats.last;

    const field = (label, value) => `
        <div>
            <dt>${label}</dt>
            <dd>${value || "—"}</dd>
        </div>
    `;

    detail.innerHTML = `

        <div class="event-detail-days">
            <strong>${stats.days}</strong>
            <span>${stats.days === 1 ? "día" : "días"} desde el último evento</span>
        </div>

        <div class="event-card">

            <span class="badge ${INCIDENT_BADGES[last.type] || "badge-gray"}">
                ${escapeHtml(last.type)}
            </span>

            <h3>${escapeHtml(last.title)}</h3>

            <p>${escapeHtml(last.description || "")}</p>

            <dl>
                ${field("Fecha", formatDate(last.date))}
                ${field("Severidad", escapeHtml(last.severity))}
                ${field("Trabajador", last.workerId ? escapeHtml(workerName(last.workerId)) : "")}
                ${field("Área", escapeHtml(last.area))}
                ${field("Acción correctiva", escapeHtml(last.correctiveAction))}
                ${field("Estado", escapeHtml(last.status))}
            </dl>

            ${last.attachment
                ? `<div class="actions" style="margin-top:10px">${attachmentButton(last, "Evidencia")}</div>`
                : ""}

        </div>

        <h4>Historial de eventos (${stats.total})</h4>

        <ul class="event-history">
            ${stats.events.map(item => `
                <li class="${item === last ? "is-last" : ""}">
                    <span>${formatDate(item.date)}</span>
                    <span>${escapeHtml(item.title)}</span>
                    <span class="badge ${INCIDENT_BADGES[item.type] || "badge-gray"}">
                        ${escapeHtml(item.type)}
                    </span>
                    ${item.gapBefore !== null
                        ? `<small>${item.gapBefore} d sin eventos antes</small>`
                        : ""}
                </li>
            `).join("")}
        </ul>

        <div class="modal-actions">
            <button class="btn btn-light" data-action="go-incidents">
                Ver todos los eventos
            </button>
            <button class="btn btn-primary" data-action="new-event">
                + Registrar evento
            </button>
        </div>

    `;

}


function openEventDialog() {

    renderEventDetail();

    document.getElementById("eventBackdrop").classList.add("show");

}


function closeEventDialog() {

    document.getElementById("eventBackdrop").classList.remove("show");

}


document
    .getElementById("eventBackdrop")
    .addEventListener("click", event => {

        if (event.target.id === "eventBackdrop") {
            closeEventDialog();
        }

    });


document.addEventListener("keydown", event => {

    if (event.key === "Escape") {
        closeEventDialog();
    }

});


/* =========================================================
   IPERC · MATRIZ DE RIESGOS
   ========================================================= */

function openIpercModal(ipercId = null) {

    const risk =
        ipercId
            ? state.iperc.find(item => item.id === ipercId)
            : null;

    openModal({

        title:
            risk
                ? "Editar riesgo"
                : "Registrar peligro / riesgo",

        submitText:
            risk
                ? "Guardar cambios"
                : "Registrar",

        values:
            risk || {
                probability: 2,
                severity: 2,
                routine: "Rutinaria",
                residualProbability: "",
                residualSeverity: ""
            },
        fields: [
            { type: "section", label: "Identificación del peligro" },
            {
                name: "area",
                label: "Área / proceso",
                required: true,
                placeholder: "Ej. Taller de mantenimiento"
            },
            {
                name: "activity",
                label: "Actividad / tarea",
                placeholder: "Ej. Corte de planchas"
            },
            {
                name: "position",
                label: "Puesto de trabajo",
                placeholder: "Ej. Soldador"
            },
            {
                name: "routine",
                label: "Tipo de actividad",
                type: "select",
                options: ["Rutinaria", "No rutinaria", "Emergencia"]
            },
            {
                name: "hazard",
                label: "Peligro",
                required: true,
                placeholder: "Ej. Piso resbaloso"
            },
            {
                name: "risk",
                label: "Riesgo",
                required: true,
                placeholder: "Ej. Caída al mismo nivel"
            },
            {
                name: "existingControls",
                label: "Controles existentes",
                type: "textarea",
                full: true,
                placeholder: "Lo que ya existe hoy antes de nuevas medidas"
            },

            { type: "section", label: "Evaluación del riesgo inicial" },
            {
                name: "probability",
                label: "Probabilidad",
                type: "select",
                required: true,
                options: SSTMetrics.RISK_PROBABILITY
            },
            {
                name: "severity",
                label: "Severidad",
                type: "select",
                required: true,
                options: SSTMetrics.RISK_SEVERITY
            },

            {
                type: "section",
                label: "Medidas de control (jerarquía)",
                hint: "Llena al menos una. Empieza por la más eficaz: eliminación."
            },
            ...SSTMetrics.CONTROL_HIERARCHY.map(level => ({
                name: level.key,
                label: level.label,
                type: "textarea",
                full: true
            })),
            {
                name: "control",
                label: "Resumen de la medida de control (opcional, se arma solo si lo dejas vacío)",
                type: "textarea",
                full: true
            },
            {
                name: "responsible",
                label: "Responsable"
            },
            {
                name: "dueDate",
                label: "Plazo de implementación",
                type: "date"
            },

            {
                type: "section",
                label: "Riesgo residual",
                hint: "Cómo queda el riesgo con las medidas aplicadas."
            },
            {
                name: "residualProbability",
                label: "Probabilidad residual",
                type: "select",
                options: [
                    { value: "", label: "— Sin evaluar —" },
                    ...SSTMetrics.RISK_PROBABILITY
                ]
            },
            {
                name: "residualSeverity",
                label: "Severidad residual",
                type: "select",
                options: [
                    { value: "", label: "— Sin evaluar —" },
                    ...SSTMetrics.RISK_SEVERITY
                ]
            }
        ],
        onSubmit(data) {
            const hierarchy =
                SSTMetrics.CONTROL_HIERARCHY
                    .filter(level => String(data[level.key] || "").trim())
                    .map(level => `${level.label}: ${String(data[level.key]).trim()}`);
            const control =
                String(data.control || "").trim() ||
                hierarchy.join(" · ");
            if (!control) {
                showToast("Escribe al menos una medida de control.");
                return;
            }
            const residualOk =
                Boolean(data.residualProbability) === Boolean(data.residualSeverity);
            if (!residualOk) {
                showToast("Para el riesgo residual elige probabilidad y severidad.");
                return;
            }
            const values = {
                ...data,
                control,
                probability: Number(data.probability),
                severity: Number(data.severity),
                residualProbability: data.residualProbability ? Number(data.residualProbability) : "",
                residualSeverity: data.residualSeverity ? Number(data.residualSeverity) : ""
            };


            if (risk) {

                Object.assign(risk, values);

            } else {

                state.iperc.push({
                    id: createId(),
                    ...values
                });

            }

            saveState();

            closeModal();

            showToast(
                risk
                    ? "Riesgo actualizado."
                    : "Riesgo registrado."
            );

        }

    });

}


function riskBadgeHtml(level, probability, severity) {

    return `
        <span class="badge badge-risk ${level.className}">
            ${level.icon} ${level.label}
        </span>
        <small class="cell-sub">P${escapeHtml(probability)} × S${escapeHtml(severity)} = ${level.score} pts</small>
    `;
}

function controlsCellHtml(item) {

    const list =
        SSTMetrics.CONTROL_HIERARCHY
            .filter(level => String(item[level.key] || "").trim());

    if (list.length === 0) {
        return escapeHtml(item.control || "—");
    }

    return `
        <ul class="control-list">
            ${list.map(level => `
                <li><b>${escapeHtml(level.label)}:</b> ${escapeHtml(item[level.key])}</li>
            `).join("")}
        </ul>
        ${item.existingControls
            ? `<small class="cell-sub">Existentes: ${escapeHtml(item.existingControls)}</small>`
            : ""}
    `;
}


function renderIperc() {

    const tbody = document.getElementById("ipercTbody");

    const stats = document.getElementById("ipercStats");

    const summary = SSTMetrics.ipercStats(state);

    const residual = SSTMetrics.ipercResidualStats(state);
    stats.innerHTML = `
        ${statBox(summary.total, "Riesgos evaluados")}
        ${statBox("🔴 " + summary.high + " → " + residual.current.high, "Altos: inicial → actual", residual.current.high ? "warn" : "good")}
        ${statBox("🟡 " + summary.medium + " → " + residual.current.medium, "Medios: inicial → actual")}
        ${statBox("🟢 " + summary.low + " → " + residual.current.low, "Bajos: inicial → actual", "good")}
        ${statBox(residual.significant, "Riesgos significativos", residual.significant ? "warn" : "")}
        ${statBox(residual.pending, "Sin residual evaluado", residual.pending ? "warn" : "good")}
    `;

    const records =
        state.iperc
            .map(item => ({
                item,
                info: SSTMetrics.residualRisk(item)
            }))
            .sort((a, b) =>
                b.info.current.score - a.info.current.score ||
                b.info.initial.score - a.info.initial.score ||
                String(a.item.area).localeCompare(String(b.item.area), "es")
            );

    if (records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    Aún no hay riesgos registrados en la matriz IPERC.
                </td>
            </tr>
        `;

        return;

    }

    tbody.innerHTML =
        records.map(({ item, info }) => `
            <tr>
                <td>
                    ${escapeHtml(item.area)}
                    ${item.activity ? `<small class="cell-sub">${escapeHtml(item.activity)}</small>` : ""}
                    ${item.position || item.routine
                        ? `<small class="cell-sub">${[item.position, item.routine].filter(Boolean).map(escapeHtml).join(" · ")}</small>`
                        : ""}
                </td>
                <td><strong>${escapeHtml(item.hazard)}</strong></td>
                <td>
                    ${escapeHtml(item.risk)}
                    ${info.significant ? `<small class="cell-sub text-danger">Significativo</small>` : ""}
                </td>
                <td>${riskBadgeHtml(info.initial, item.probability, item.severity)}</td>
                <td>${controlsCellHtml(item)}</td>
                <td>
                    ${info.residual
                        ? riskBadgeHtml(info.residual, item.residualProbability, item.residualSeverity) +
                          (info.reduction > 0
                            ? `<small class="cell-sub text-good">▼ ${info.reduction} pts</small>`
                            : info.reduction === 0
                                ? `<small class="cell-sub">Sin reducción</small>`
                                : "")
                        : `<span class="badge badge-gray">Sin evaluar</span>`}
                </td>
                <td>
                    ${escapeHtml(item.responsible || "—")}
                    ${item.dueDate ? `<small class="cell-sub">Plazo: ${formatDate(item.dueDate)}</small>` : ""}
                </td>

                <td>
                    <div class="actions">

                        <button
                            class="btn btn-light btn-small"
                            data-action="edit-iperc"
                            data-id="${item.id}"
                        >
                            Editar
                        </button>

                        <button
                            class="btn btn-danger btn-small"
                            data-action="delete-iperc"
                            data-id="${item.id}"
                        >
                            Eliminar
                        </button>

                    </div>
                </td>

            </tr>

        `).join("");

}


/* =========================================================
   REPORTES SST
   ========================================================= */

/* =========================================================
   PROGRAMA ANUAL SST
   (los cálculos viven en metrics.js → programStats)
   ========================================================= */

const MONTH_FULL_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"
];

let programYear = today().slice(0, 4);

const programYearSelect =
    document.getElementById("programYear");

programYearSelect.addEventListener("change", () => {
    programYear = programYearSelect.value;
    renderProgram();
});

function programYears() {

    const current = Number(today().slice(0, 4));
    const years = new Set([String(current), String(current + 1), programYear]);

    state.program.forEach(item => {
        if (/^\d{4}$/.test(String(item.year))) {
            years.add(String(item.year));
        }
    });

    return [...years].sort();
}

function renderProgram() {

    programYearSelect.innerHTML =
        programYears()
            .map(year => `<option value="${year}" ${year === programYear ? "selected" : ""}>${year}</option>`)
            .join("");

    const data =
        SSTMetrics.programStats(state, programYear, today());

    const pctText = value =>
        value === null ? "—" : `${value}%`;

    document.getElementById("programStats").innerHTML = `
        ${statBox(pctText(data.toDate.pct), "Cumplimiento a la fecha", data.tone === "bad" ? "warn" : data.tone === "good" ? "good" : "")}
        ${statBox(pctText(data.annualPct), `Avance anual ${data.year}`)}
        ${statBox(data.activities, "Actividades")}
        ${statBox(data.programmed, "Programadas (P)")}
        ${statBox(data.executed, "Ejecutadas (E)", "good")}
        ${statBox(data.overdue.length, "Atrasadas", data.overdue.length ? "warn" : "good")}
    `;

    document.getElementById("programSummary").innerHTML =
        data.programmed
            ? `
                <div class="program-summary">
                    <div class="program-bar">
                        <span>Cumplimiento a la fecha: ${data.toDate.executed} de ${data.toDate.programmed} actividades que ya correspondían</span>
                        ${progressBar(data.toDate.pct || 0)}
                    </div>
                    <div class="program-types">
                        ${data.byType.map(item => `
                            <span class="badge ${item.pct === null ? "badge-gray" : item.pct >= 90 ? "badge-green" : item.pct >= 70 ? "badge-yellow" : "badge-red"}">
                                ${escapeHtml(item.type)}: ${item.executed}/${item.programmed}
                            </span>
                        `).join("")}
                    </div>
                </div>
            `
            : "";

    document.getElementById("programThead").innerHTML = `
        <tr>
            <th>Actividad</th>
            ${SSTMetrics.MONTH_LABELS.map(label => `<th class="center">${label}</th>`).join("")}
            <th class="center">%</th>
            <th>Acciones</th>
        </tr>
    `;

    const tbody = document.getElementById("programTbody");
    const tfoot = document.getElementById("programTfoot");

    if (data.rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="15">
                    Aún no hay actividades en el programa ${escapeHtml(programYear)}.
                    Usa “+ Actividad” para agregar la primera.
                </td>
            </tr>
        `;
        tfoot.innerHTML = "";
        return;
    }

    const cellText = {
        done: "E",
        planned: "P",
        current: "P",
        overdue: "P",
        extra: "E",
        none: ""
    };

    tbody.innerHTML =
        data.rows.map(row => {

            const activity = row.activity;

            return `
                <tr>
                    <td class="program-name">
                        <strong>${escapeHtml(activity.activity)}</strong>
                        <small class="cell-sub">
                            ${escapeHtml(activity.type || "Otro")}
                            ${activity.area ? " · " + escapeHtml(activity.area) : ""}
                            ${activity.responsible ? " · " + escapeHtml(activity.responsible) : ""}
                        </small>
                    </td>
                    ${row.cells.map((cell, index) => {
                        const files = cell.execution ? SSTMetrics.recordFiles(cell.execution).length : 0;
                        const title = cell.status === "none"
                            ? `${MONTH_FULL_NAMES[index]}: no programado`
                            : cell.execution
                                ? `${MONTH_FULL_NAMES[index]}: ejecutada el ${formatDate(cell.execution.date)}${files ? ` · ${files} evidencia(s)` : ""}`
                                : `${MONTH_FULL_NAMES[index]}: programada — clic para registrar la ejecución`;
                        return `
                            <td class="center">
                                <button
                                    type="button"
                                    class="prog-cell ${cell.status}"
                                    data-action="program-cell"
                                    data-id="${activity.id}"
                                    data-month="${cell.month}"
                                    title="${escapeHtml(title)}"
                                >
                                    ${cellText[cell.status] || ""}${files ? "<i>📎</i>" : ""}
                                </button>
                            </td>
                        `;
                    }).join("")}
                    <td class="center">
                        <strong>${row.pct === null ? "—" : row.pct + "%"}</strong>
                    </td>
                    <td>
                        <div class="actions">
                            <button class="btn btn-light btn-small" data-action="edit-program" data-id="${activity.id}">
                                Editar
                            </button>
                            <button class="btn btn-danger btn-small" data-action="delete-program" data-id="${activity.id}">
                                Eliminar
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

    tfoot.innerHTML = `
        <tr>
            <td><strong>Cumplimiento del mes</strong></td>
            ${data.byMonth.map((item, index) => {
                // Meses que aún no llegan: se muestran sin color
                const future =
                    programYear > today().slice(0, 4) ||
                    (programYear === today().slice(0, 4) && index + 1 > Number(today().slice(5, 7)));
                const pending = future && item.executed < item.programmed;
                return `
                    <td class="center">
                        <small class="month-pct ${item.pct === null || pending ? "" : SSTMetrics.complianceTone(item.pct)}">
                            ${item.pct === null ? "—" : pending ? `${item.executed}/${item.programmed}` : item.pct + "%"}
                        </small>
                    </td>
                `;
            }).join("")}
            <td class="center"><strong>${data.annualPct === null ? "—" : data.annualPct + "%"}</strong></td>
            <td></td>
        </tr>
    `;
}

function openProgramModal(activityId = null) {

    const activity =
        activityId
            ? state.program.find(item => item.id === activityId)
            : null;

    openModal({
        title:
            activity
                ? "Editar actividad del programa"
                : "Nueva actividad del programa",
        submitText:
            activity
                ? "Guardar cambios"
                : "Agregar al programa",
        values:
            activity
                ? { ...activity, months: SSTMetrics.programMonths(activity) }
                : { year: programYear, type: "Capacitación", months: [] },
        fields: [
            {
                name: "activity",
                label: "Actividad",
                required: true,
                full: true,
                placeholder: "Ej. Capacitación en trabajos en altura"
            },
            {
                name: "type",
                label: "Tipo",
                type: "select",
                required: true,
                options: SSTMetrics.PROGRAM_TYPES
            },
            {
                name: "year",
                label: "Año",
                type: "number",
                min: "2000",
                max: "2100",
                step: "1",
                required: true
            },
            {
                name: "area",
                label: "Área / alcance",
                placeholder: "Ej. Toda la empresa, taller..."
            },
            {
                name: "responsible",
                label: "Responsable"
            },
            {
                name: "goal",
                label: "Meta / indicador (opcional)",
                full: true,
                placeholder: "Ej. 100% del personal operativo capacitado"
            },
            {
                name: "months",
                label: "Meses programados",
                type: "checkboxes",
                options: SSTMetrics.MONTH_KEYS.map((key, index) => ({
                    value: key,
                    label: SSTMetrics.MONTH_LABELS[index]
                }))
            }
        ],
        onSubmit(data) {

            const months =
                [...new Set((data.months || []).map(String))].sort();

            if (months.length === 0) {
                showToast("Marca al menos un mes programado.");
                return;
            }

            const values = {
                activity: String(data.activity || "").trim(),
                type: data.type,
                year: String(data.year),
                area: String(data.area || "").trim(),
                responsible: String(data.responsible || "").trim(),
                goal: String(data.goal || "").trim(),
                months
            };

            if (activity) {

                const executions = activity.executions || {};
                const lost = Object.keys(executions).filter(key => !months.includes(key));

                if (lost.length) {
                    const names = lost.map(key => MONTH_FULL_NAMES[Number(key) - 1]).join(", ");
                    if (!confirm(`Quitaste meses que ya tienen ejecución registrada (${names}). Se borrarán esas ejecuciones y sus evidencias. ¿Continuar?`)) {
                        return;
                    }
                    lost.forEach(key => {
                        dropAttachments(SSTMetrics.fileIdsOf(executions[key]));
                        delete executions[key];
                    });
                }

                Object.assign(activity, values, { executions });

            } else {
                state.program.push({
                    id: createId(),
                    ...values,
                    executions: {}
                });
            }

            programYear = values.year;
            saveState();
            closeModal();
            showToast(activity ? "Actividad actualizada." : "Actividad agregada al programa.");
        }
    });
}

function programCellClick(activityId, month) {

    const activity =
        state.program.find(item => item.id === activityId);

    if (!activity) {
        return;
    }

    const planned =
        SSTMetrics.programMonths(activity).includes(month);

    if (!planned && !activity.executions?.[month]) {
        showToast("Ese mes no está programado. Usa “Editar” para programarlo.");
        return;
    }

    openProgramExecutionModal(activityId, month);
}

function openProgramExecutionModal(activityId, month) {

    const activity =
        state.program.find(item => item.id === activityId);

    if (!activity) {
        return;
    }

    const execution =
        activity.executions?.[month] || null;

    const ctx = { collection: "program", id: activity.id, month };

    openModal({
        title:
            execution
                ? "Ejecución registrada"
                : "Registrar ejecución",
        submitText:
            execution
                ? "Guardar cambios"
                : "Marcar como ejecutada",
        values: {
            date: execution?.date || today(),
            note: execution?.note || ""
        },
        fields: [
            {
                type: "html",
                html: `
                    <div class="evidence-context">
                        <small>${escapeHtml(activity.type || "")} · ${MONTH_FULL_NAMES[Number(month) - 1]} ${escapeHtml(activity.year)}</small>
                        <strong>${escapeHtml(activity.activity)}</strong>
                        ${activity.goal ? `<small>Meta: ${escapeHtml(activity.goal)}</small>` : ""}
                    </div>
                `
            },
            {
                name: "date",
                label: "Fecha de ejecución",
                type: "date",
                required: true
            },
            {
                name: "note",
                label: "Observación (opcional)",
                placeholder: "Ej. 12 participantes, dictado por..."
            },
            ...(execution
                ? [
                    { type: "section", label: "Evidencias" },
                    { type: "html", html: evidenceListHtml(execution, ctx) }
                ]
                : []),
            attachmentField("Evidencia: lista de asistencia, fotos, informe", true),
            ...(execution
                ? [{
                    type: "html",
                    html: `
                        <button
                            type="button"
                            class="btn btn-warning btn-small"
                            data-action="program-unmark"
                            data-id="${activity.id}"
                            data-month="${month}"
                        >
                            Desmarcar ejecución
                        </button>
                    `
                }]
                : [])
        ],
        async onSubmit(data) {

            modalSubmit.disabled = true;

            const stored =
                await storeAttachments(data.attachment);

            activity.executions =
                activity.executions || {};

            const target =
                activity.executions[month] || {};

            target.date = data.date || today();
            target.note = String(data.note || "").trim();

            if (stored.length) {
                normalizeFiles(target).push(...stored);
            }

            activity.executions[month] = target;

            saveState();
            closeModal();
            showToast(
                execution
                    ? "Ejecución actualizada."
                    : "Actividad marcada como ejecutada."
            );
        }
    });

    evidenceReopen =
        () => openProgramExecutionModal(activityId, month);
}

function unmarkProgramExecution(activityId, month) {

    const activity =
        state.program.find(item => item.id === activityId);

    const execution =
        activity?.executions?.[month];

    if (!execution) {
        return;
    }

    const files =
        SSTMetrics.fileIdsOf(execution);

    if (!confirm(
        files.length
            ? `¿Desmarcar la ejecución? Se borrarán ${files.length} evidencia(s).`
            : "¿Desmarcar la ejecución de este mes?"
    )) {
        return;
    }

    dropAttachments(files);
    delete activity.executions[month];

    saveState();
    closeModal();
    showToast("Ejecución desmarcada.");
}


let reportType = "mensual";

let currentReport = null;


function distinctAreas() {

    const seen = new Map();

    [
        ...state.workers,
        ...state.incidents,
        ...state.findings,
        ...state.inspections,
        ...state.iperc
    ].forEach(item => {

        const area = String(item.area || "").trim();

        const key = SSTMetrics.normalize(area);

        if (area && !seen.has(key)) {
            seen.set(key, area);
        }

    });

    return [...seen.values()].sort((a, b) => a.localeCompare(b, "es"));

}


function fillSelect(id, options) {

    const select = document.getElementById(id);

    const previous = select.value;

    select.innerHTML =
        options
            .map(option => `
                <option value="${escapeHtml(option.value)}">
                    ${escapeHtml(option.label)}
                </option>
            `)
            .join("");

    if (options.some(option => option.value === previous)) {
        select.value = previous;
    }

}


function renderReportControls() {

    fillSelect(
        "reportYear",
        SSTMetrics.availableYears(state, today())
            .map(year => ({ value: year, label: year }))
    );

    if (!document.getElementById("reportYear").value) {
        document.getElementById("reportYear").value = today().slice(0, 4);
    }

    fillSelect(
        "reportWorker",
        [...state.workers]
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
            .map(worker => ({
                value: worker.id,
                label: `${worker.name} - ${worker.area}`
            }))
    );

    fillSelect(
        "reportArea",
        distinctAreas().map(area => ({ value: area, label: area }))
    );

    document
        .querySelectorAll("#reportTypes .segment")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.type === reportType
            );

        });

    document
        .querySelectorAll("[data-param]")
        .forEach(group => {

            group.hidden = group.dataset.param !== reportType;

        });

}


function generateReport() {

    const options = {
        type: reportType,
        month: document.getElementById("reportMonth").value,
        year: document.getElementById("reportYear").value,
        workerId: document.getElementById("reportWorker").value,
        area: document.getElementById("reportArea").value
    };

    if (reportType === "mensual" && !options.month) {

        showToast("Elige el mes del reporte.");

        return;

    }

    if (reportType === "trabajador" && !options.workerId) {

        showToast("Primero registra un colaborador.");

        return;

    }

    if (reportType === "area" && !options.area) {

        showToast("Aún no hay áreas registradas.");

        return;

    }

    currentReport =
        SSTReports.buildReport(state, options, today());

    document.getElementById("reportTitle").textContent =
        currentReport.scopeLabel;

    document.getElementById("reportPreview").srcdoc =
        SSTReports.toHtml(currentReport);

    document.getElementById("reportResult").hidden = false;

    document
        .getElementById("reportResult")
        .scrollIntoView({ behavior: "smooth", block: "start" });

}


function downloadFile(blob, name) {

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = name;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

}


function exportReportPdf() {

    if (!currentReport) {
        return;
    }

    const frame = document.getElementById("reportPreview");

    frame.contentWindow.focus();

    frame.contentWindow.print();

}


function exportReportExcel() {

    if (!currentReport) {
        return;
    }

    downloadFile(
        new Blob(
            [SSTReports.toXlsx(currentReport)],
            {
                type:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
        ),
        SSTReports.fileName(currentReport, "xlsx")
    );

    showToast("Archivo Excel generado.");

}


document
    .getElementById("reportMonth")
    .value = currentMonth();


document
    .getElementById("btnGenerateReport")
    .addEventListener("click", generateReport);


document
    .getElementById("btnReportPdf")
    .addEventListener("click", exportReportPdf);


document
    .getElementById("btnReportExcel")
    .addEventListener("click", exportReportExcel);


/* =========================================================
   ELIMINAR REGISTROS
   ========================================================= */

function removeRecord(
    collection,
    id,
    message
) {

    const removed =
        state[collection].find(
            item =>
                item.id === id
        );

    dropAttachments(SSTMetrics.fileIdsOf(removed));

    state[collection] =
        state[collection].filter(
            item =>
                item.id !== id
        );


    saveState();

    showToast(message);

}


/* =========================================================
   ACCIONES GENERALES
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                "[data-action]"
            );


        if (!button) {
            return;
        }


        const action =
            button.dataset.action;

        const id =
            button.dataset.id;


        switch (action) {

            case "new-worker":

                openWorkerModal();

                break;


            case "new-attendance":

                openAttendanceModal();

                break;


            case "new-epp":

                openEppModal();

                break;


            case "new-insurance":

                openInsuranceModal();

                break;


            case "edit-worker":

                openWorkerModal(id);

                break;


            case "toggle-worker": {

                const worker =
                    getWorker(id);


                if (!worker) {
                    return;
                }


                worker.status =
                    worker.status ===
                    "Activo"
                        ? "Inactivo"
                        : "Activo";


                saveState();

                showToast(
                    `Colaborador ${
                        worker.status.toLowerCase()
                    }.`
                );

                break;
            }


            case "delete-worker": {

                const worker =
                    getWorker(id);


                if (!worker) {
                    return;
                }


                const confirmed =
                    confirm(
                        `¿Eliminar definitivamente a ${worker.name}?`
                    );


                if (!confirmed) {
                    return;
                }


                dropAttachments(
                    ["epp", "insurance", "training", "medical"]
                        .flatMap(collection =>
                            state[collection]
                                .filter(item => item.workerId === id)
                                .flatMap(item => SSTMetrics.fileIdsOf(item))
                        )
                );


                if (profileWorkerId === id) {

                    profileWorkerId = null;

                    openPage("colaboradores");

                }


                state.workers =
                    state.workers.filter(
                        item =>
                            item.id !== id
                    );


                state.attendance =
                    state.attendance.filter(
                        item =>
                            item.workerId !== id
                    );


                state.epp =
                    state.epp.filter(
                        item =>
                            item.workerId !== id
                    );


                state.insurance =
                    state.insurance.filter(
                        item =>
                            item.workerId !== id
                    );


                state.training =
                    state.training.filter(
                        item =>
                            item.workerId !== id
                    );


                state.medical =
                    state.medical.filter(
                        item =>
                            item.workerId !== id
                    );


                saveState();

                showToast(
                    "Colaborador eliminado."
                );

                break;
            }


            case "new-training":

                openTrainingModal();

                break;


            case "set-goals":

                openGoalsModal();

                break;


            case "new-finding":

                openFindingModal();

                break;


            case "toggle-finding": {

                const finding =
                    state.findings.find(
                        item => item.id === id
                    );

                if (!finding) {
                    return;
                }

                const closing =
                    finding.status !== "Cerrado";

                finding.status =
                    closing ? "Cerrado" : "Abierto";

                finding.closedDate =
                    closing ? today() : "";

                saveState();

                showToast(
                    closing
                        ? "Hallazgo cerrado."
                        : "Hallazgo reabierto."
                );

                break;
            }


            case "delete-finding":

                removeRecord(
                    "findings",
                    id,
                    "Hallazgo eliminado."
                );

                break;


            case "new-inspection":

                openInspectionModal();

                break;


            case "toggle-observation": {

                const inspection =
                    state.inspections.find(
                        item => item.id === id
                    );

                const observation =
                    inspection?.observations.find(
                        item => item.id === button.dataset.obs
                    );

                if (!observation) {
                    return;
                }

                if (observation.status !== "Cerrada") {
                    openCloseObservationModal(inspection, observation);
                    break;
                }
                if (!confirm("¿Reabrir esta observación? Las evidencias de levantamiento se conservan.")) {
                    break;
                }
                observation.status = "Abierta";
                observation.closedDate = "";
                saveState();
                showToast("Observación reabierta.");
                break;
            }


            case "delete-inspection": {

                const confirmed =
                    confirm(
                        "¿Eliminar esta inspección y todas sus observaciones?"
                    );

                if (!confirmed) {
                    return;
                }

                removeRecord(
                    "inspections",
                    id,
                    "Inspección eliminada."
                );

                break;
            }


            case "view-worker":

                openProfile(id);

                break;


            case "back-workers":

                openPage("colaboradores");

                break;


            case "profile-tab":

                profileTab = button.dataset.tab;

                renderProfile();

                break;


            case "profile-add":
                addFromProfile(button.dataset.kind);
                break;

            case "print-profile":
                printWorkerProfile();
                break;


            case "open-file":
                openAttachment(button.dataset.file);
                break;

            case "manage-evidence":
                openEvidenceModal(
                    evidenceCtxFrom(button),
                    button.dataset.title || "Evidencias"
                );
                break;

            case "remove-evidence":
                removeEvidence(
                    evidenceCtxFrom(button),
                    button.dataset.file
                );
                break;



            case "new-incident":

                openIncidentModal();

                break;


            case "show-last-event":

                openEventDialog();

                break;


            case "close-event-dialog":

                closeEventDialog();

                break;


            case "go-incidents":

                closeEventDialog();

                openPage("incidentes");

                break;


            case "new-event":

                closeEventDialog();

                openPage("incidentes");

                openIncidentModal();

                break;


            case "edit-incident":
                closeModal();
                openIncidentModal(id);
                break;

            case "incident-detail":
                openIncidentDetail(id);
                break;

            case "incident-add-action":
                openIncidentActionModal(id);
                break;

            case "incident-action-toggle":
                toggleIncidentAction(id, button.dataset.actionId);
                break;

            case "incident-action-delete":
                deleteIncidentAction(id, button.dataset.actionId);
                break;


            case "toggle-incident": {

                const incident =
                    state.incidents.find(
                        item => item.id === id
                    );

                if (!incident) {
                    return;
                }

                const closing =
                    incident.status !== "Cerrado";
                if (closing && !confirmCloseIncident(incident)) {
                    return;
                }
                incident.status =
                    closing ? "Cerrado" : "Pendiente";

                incident.closedDate =
                    closing ? today() : "";

                saveState();

                showToast(
                    closing
                        ? "Registro cerrado."
                        : "Registro reabierto."
                );

                break;
            }


            case "delete-incident":

                if (
                    confirm("¿Eliminar este registro de incidente/accidente?")
                ) {

                    removeRecord(
                        "incidents",
                        id,
                        "Registro eliminado."
                    );

                }

                break;


            case "new-iperc":

                openIpercModal();

                break;


            case "edit-iperc":

                openIpercModal(id);

                break;


            case "delete-iperc":

                if (
                    confirm("¿Eliminar este riesgo de la matriz IPERC?")
                ) {

                    removeRecord(
                        "iperc",
                        id,
                        "Riesgo eliminado."
                    );

                }

                break;


            case "go-page":
                openPage(button.dataset.page);
                window.scrollTo({ top: 0, behavior: "smooth" });
                break;

            case "toggle-urgent":
                urgentExpanded = !urgentExpanded;
                renderUrgent();
                break;

            case "new-program":
                openProgramModal();
                break;

            case "edit-program":
                openProgramModal(id);
                break;

            case "delete-program":
                if (confirm("¿Eliminar esta actividad del programa con sus ejecuciones y evidencias?")) {
                    removeRecord(
                        "program",
                        id,
                        "Actividad eliminada."
                    );
                }
                break;

            case "program-cell":
                programCellClick(id, button.dataset.month);
                break;

            case "program-unmark":
                unmarkProgramExecution(id, button.dataset.month);
                break;

            case "report-type":

                reportType = button.dataset.type;

                renderReportControls();

                break;


            case "new-hours":

                openHoursModal();

                break;


            case "filter-year":

                setBoardPeriod(id, boardMonth().slice(5, 7));

                break;


            case "filter-month":

                setBoardPeriod(boardMonth().slice(0, 4), id);

                break;


            case "attendance-worker":

                openAttendanceModal(id);

                break;


            case "delete-epp":

                removeRecord(
                    "epp",
                    id,
                    "Registro EPP eliminado."
                );

                break;


            case "delete-insurance":

                removeRecord(
                    "insurance",
                    id,
                    "Seguro eliminado."
                );

                break;


            case "delete-training":

                removeRecord(
                    "training",
                    id,
                    "Capacitación eliminada."
                );

                break;


            case "delete-medical":

                removeRecord(
                    "medical",
                    id,
                    "Examen eliminado."
                );

                break;

        }

    }
);


/* =========================================================
   BOTONES PRINCIPALES
   ========================================================= */

document
    .getElementById(
        "btnTopNewWorker"
    )
    .addEventListener(
        "click",
        () => openWorkerModal()
    );


document
    .getElementById(
        "btnNewWorker"
    )
    .addEventListener(
        "click",
        () => openWorkerModal()
    );


document
    .getElementById(
        "btnNewAttendance"
    )
    .addEventListener(
        "click",
        () => openAttendanceModal()
    );


document
    .getElementById(
        "btnNewEpp"
    )
    .addEventListener(
        "click",
        () => openEppModal()
    );


document
    .getElementById(
        "btnNewInsurance"
    )
    .addEventListener(
        "click",
        () => openInsuranceModal()
    );


document
    .getElementById(
        "btnNewTraining"
    )
    .addEventListener(
        "click",
        () => openTrainingModal()
    );


document
    .getElementById(
        "btnNewMedical"
    )
    .addEventListener(
        "click",
        () => openMedicalModal()
    );


/* =========================================================
   BÚSQUEDA
   ========================================================= */

document
    .getElementById(
        "workerSearch"
    )
    .addEventListener(
        "input",
        renderWorkers
    );


/* =========================================================
   MES DE ASISTENCIA
   ========================================================= */

const attendanceMonthInput =
    document.getElementById(
        "attendanceMonth"
    );


attendanceMonthInput.value =
    currentMonth();


attendanceMonthInput.addEventListener(
    "change",
    renderAttendance
);


/* =========================================================
   EXPORTAR COLABORADORES A CSV
   ========================================================= */

document
    .getElementById(
        "btnExportWorkers"
    )
    .addEventListener(
        "click",
        exportWorkersCSV
    );


function exportWorkersCSV() {

    if (
        state.workers.length === 0
    ) {

        showToast(
            "No hay colaboradores para exportar."
        );

        return;

    }


    const rows = [

        [
            "Nombre",
            "DNI",
            "Cargo",
            "Área",
            "Teléfono",
            "Fecha de ingreso",
            "Estado",
            "Tipo de contrato",
            "Turno / régimen",
            "Jefe inmediato",
            "Fecha de nacimiento",
            "Grupo sanguíneo",
            "Correo",
            "Dirección",
            "Licencia",
            "Vencimiento licencia",
            "Contacto de emergencia",
            "Teléfono de emergencia",
            "Parentesco"
        ],
        ...state.workers.map(
            worker => [
                worker.name,
                worker.dni,
                worker.role,
                worker.area,
                worker.phone,
                worker.joined,
                worker.status,
                worker.contractType,
                worker.shift,
                worker.supervisor,
                worker.birthDate,
                worker.bloodType,
                worker.email,
                worker.address,
                worker.license,
                worker.licenseExpiry,
                worker.emergencyName,
                worker.emergencyPhone,
                worker.emergencyRelation
            ]
        )

    ];


    const csv =
        rows
            .map(
                row =>
                    row
                        .map(
                            value =>
                                `"${String(
                                    value ?? ""
                                )
                                .replaceAll(
                                    '"',
                                    '""'
                                )}"`
                        )
                        .join(",")
            )
            .join("\n");


    const blob =
        new Blob(
            [
                "\uFEFF" +
                csv
            ],
            {
                type:
                    "text/csv;charset=utf-8"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    link.href = url;

    link.download =
        "colaboradores_sst.csv";


    document.body.appendChild(
        link
    );


    link.click();

    link.remove();


    URL.revokeObjectURL(
        url
    );


    showToast(
        "Archivo CSV generado."
    );

}


/* =========================================================
   RENDER GENERAL
   ========================================================= */

function renderAll() {

    renderWorkers();

    renderAttendance();

    renderEpp();

    renderInsurance();

    renderTraining();

    renderMedical();

    renderFindings();

    renderInspections();

    renderIncidents();

    renderEventClock();

    renderIperc();
    renderProgram();
    renderProfile();

    renderReportControls();

    renderDashboard();

}


/* =========================================================
   INICIAR SISTEMA
   ========================================================= */

renderAll();
