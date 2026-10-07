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
    return new Date()
        .toISOString()
        .slice(0, 10);
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

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
    );

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


function attachmentField(label) {

    return {
        name: "attachment",
        label: `📎 ${label} (opcional)`,
        type: "file",
        accept: "image/*,.pdf",
        full: true
    };

}


function attachmentButton(record, label = "Archivo") {

    if (!record.attachment) {
        return "";
    }

    return `
        <button
            class="btn btn-light btn-small"
            data-action="open-file"
            data-file="${escapeHtml(record.attachment.id)}"
            title="${escapeHtml(record.attachment.name)}"
        >
            📎 ${escapeHtml(label)}
        </button>
    `;

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


    fields.forEach(field => {

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

        const formData =
            Object.fromEntries(
                new FormData(
                    modalForm
                ).entries()
            );


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

            attachmentField("Certificado")


        ],

        async onSubmit(data) {

            const record =
                await withAttachment(data);

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

                                ${attachmentButton(record, "Certificado")}

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


    renderAlerts();

    renderBoard();

}


/* =========================================================
   ALERTAS
   ========================================================= */

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

            attachmentField("Foto del hallazgo")


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

            const photo =
                await withAttachment({ attachment: data.attachment });

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

                    return `

                        <li class="obs-item ${closed ? "closed" : ""}">

                            <span class="obs-text">
                                ${escapeHtml(item.text)}
                            </span>

                            <div class="obs-side">

                                <span class="badge ${closed ? "badge-green" : "badge-yellow"}">
                                    ${escapeHtml(item.status)}
                                </span>

                                ${closed
                                    ? `<small>${formatDate(item.closedDate)}</small>`
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

                        ${attachmentButton(inspection, "Foto")}

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
    { key: "incidentes",     label: "Incidentes" }
];


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
                ["Capacitación", "Fecha", "Entidad / instructor", "Estado", "Certificado"],
                profile.training.map(item => [
                    `<strong>${escapeHtml(item.topic)}</strong>`,
                    formatDate(item.date),
                    escapeHtml(item.provider || "—"),
                    trainingStatusHtml(item),
                    attachmentButton(item, "Certificado") || "—"
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
                <button
                    class="btn btn-primary"
                    data-action="edit-worker"
                    data-id="${worker.id}"
                >
                    Editar datos
                </button>
            </div>

        </div>

        <dl class="profile-data">
            <div><dt>DNI</dt><dd>${escapeHtml(worker.dni)}</dd></div>
            <div><dt>Cargo</dt><dd>${escapeHtml(worker.role)}</dd></div>
            <div><dt>Área</dt><dd>${escapeHtml(worker.area)}</dd></div>
            <div><dt>Fecha de ingreso</dt><dd>${formatDate(worker.joined)}</dd></div>
            <div><dt>Teléfono</dt><dd>${escapeHtml(worker.phone || "—")}</dd></div>
        </dl>

        <div class="profile-chips">
            ${chips.length
                ? chips.join("")
                : '<span class="badge badge-green">✓ Sin alertas pendientes</span>'}
        </div>

    `;

    const counts = {
        epp: profile.epp.length,
        seguros: profile.insurance.length,
        capacitaciones: profile.training.length,
        emo: profile.medical.length,
        asistencia: profile.attendance.length,
        incidentes: profile.incidents.length
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
                name: "date",
                label: "Fecha",
                type: "date",
                required: true
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
                name: "severity",
                label: "Severidad",
                type: "select",
                required: true,
                options: SSTMetrics.INCIDENT_SEVERITIES
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
                name: "correctiveAction",
                label: "Acción correctiva",
                type: "textarea",
                full: true,
                placeholder: "Qué se hará para que no se repita..."
            },

            {
                name: "responsible",
                label: "Responsable de la acción",
                full: true
            },

            attachmentField("Foto / evidencia")

        ],

        async onSubmit(data) {

            modalSubmit.disabled = true;

            const { attachment: file, ...rest } = data;

            const meta = await storeAttachment(file);

            const closedDate =
                rest.status === "Cerrado"
                    ? (incident?.closedDate || today())
                    : "";

            if (incident) {

                if (meta) {

                    dropAttachments([incident.attachment?.id]);

                    incident.attachment = meta;

                }

                Object.assign(incident, rest, { closedDate });

            } else {

                state.incidents.push({
                    id: createId(),
                    ...rest,
                    closedDate,
                    ...(meta ? { attachment: meta } : {})
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
                    </td>

                    <td>
                        <div class="actions">

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
                severity: 2
            },

        fields: [

            {
                name: "area",
                label: "Área / proceso",
                required: true,
                full: true,
                placeholder: "Ej. Taller de mantenimiento"
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
                name: "control",
                label: "Medida de control",
                type: "textarea",
                required: true,
                full: true,
                placeholder: "Qué se hace o se hará para controlar el riesgo..."
            },

            {
                name: "responsible",
                label: "Responsable",
                full: true
            }

        ],

        onSubmit(data) {

            const values = {
                ...data,
                probability: Number(data.probability),
                severity: Number(data.severity)
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


function renderIperc() {

    const tbody = document.getElementById("ipercTbody");

    const stats = document.getElementById("ipercStats");

    const summary = SSTMetrics.ipercStats(state);

    stats.innerHTML = `
        ${statBox(summary.total, "Riesgos evaluados")}
        ${statBox("🟢 " + summary.low, "Bajo", "good")}
        ${statBox("🟡 " + summary.medium, "Medio")}
        ${statBox("🔴 " + summary.high, "Alto", summary.high ? "warn" : "")}
    `;

    const records =
        state.iperc
            .map(item => ({
                item,
                level: SSTMetrics.riskLevel(item.probability, item.severity)
            }))
            .sort((a, b) =>
                b.level.score - a.level.score ||
                String(a.item.area).localeCompare(String(b.item.area), "es")
            );

    if (records.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="9">
                    Aún no hay riesgos registrados en la matriz IPERC.
                </td>
            </tr>
        `;

        return;

    }

    tbody.innerHTML =
        records.map(({ item, level }) => `

            <tr>

                <td>${escapeHtml(item.area)}</td>

                <td><strong>${escapeHtml(item.hazard)}</strong></td>

                <td>${escapeHtml(item.risk)}</td>

                <td class="center">${escapeHtml(item.probability)}</td>

                <td class="center">${escapeHtml(item.severity)}</td>

                <td>
                    <span class="badge badge-risk ${level.className}">
                        ${level.icon} ${level.label}
                    </span>
                    <small class="cell-sub">${level.score} pts</small>
                </td>

                <td>${escapeHtml(item.control)}</td>

                <td>${escapeHtml(item.responsible || "—")}</td>

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

    dropAttachments([removed?.attachment?.id]);

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
                                .map(item => item.attachment?.id)
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

                const closing =
                    observation.status !== "Cerrada";

                observation.status =
                    closing ? "Cerrada" : "Abierta";

                observation.closedDate =
                    closing ? today() : "";

                saveState();

                showToast(
                    closing
                        ? "Observación cerrada."
                        : "Observación reabierta."
                );

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


            case "open-file":

                openAttachment(button.dataset.file);

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

                openIncidentModal(id);

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
            "Estado"
        ],

        ...state.workers.map(
            worker => [

                worker.name,
                worker.dni,
                worker.role,
                worker.area,
                worker.phone,
                worker.joined,
                worker.status

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

    renderProfile();

    renderReportControls();

    renderDashboard();

}


/* =========================================================
   INICIAR SISTEMA
   ========================================================= */

renderAll();