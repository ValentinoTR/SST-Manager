/* =========================================================
   SST CONTROL - REPORTES
   Funciones puras (sin DOM) para armar el reporte SST y
   convertirlo a HTML imprimible (PDF) o a un .xlsx real.
   En el navegador quedan disponibles como window.SSTReports.
   ========================================================= */

(function (root, factory) {

    if (typeof module === "object" && module.exports) {
        module.exports = factory(require("./metrics.js"));
    } else {
        root.SSTReports = factory(root.SSTMetrics);
    }

})(typeof self !== "undefined" ? self : this, function (M) {

    const REPORT_TYPES = [
        { value: "mensual",    label: "Mensual" },
        { value: "anual",      label: "Anual" },
        { value: "trabajador", label: "Por trabajador" },
        { value: "area",       label: "Por área" }
    ];

    const MONTH_NAMES = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];


    /* ---------------------------------------------------------
       UTILIDADES
       --------------------------------------------------------- */

    function fmtDate(date) {

        if (!date) {
            return "—";
        }

        const [year, month, day] = String(date).split("-");

        return `${day}/${month}/${year}`;
    }

    function sameArea(a, b) {
        return M.normalize(a) === M.normalize(b);
    }

    function monthTitle(month) {

        const [year, number] = String(month).split("-");

        return `${MONTH_NAMES[Number(number) - 1] || number} ${year}`;
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }


    /* ---------------------------------------------------------
       ARMADO DEL REPORTE
       options: { type, month, year, workerId, area,
                  dateFrom?, dateTo?, filterArea?, filterWorkerId? }
       --------------------------------------------------------- */

    function buildReport(state, options, todayString) {

        const dateFrom = options.dateFrom || "";
        const dateTo = options.dateTo || "";
        if ((dateFrom && !M.validAttendanceDate(dateFrom)) ||
            (dateTo && !M.validAttendanceDate(dateTo))) {
            throw new RangeError("Selecciona fechas de inicio y fin válidas.");
        }
        if (dateFrom && dateTo && dateFrom > dateTo) {
            throw new RangeError("La fecha de inicio no puede ser posterior a la fecha de fin.");
        }

        const type = options.type || "mensual";
        const workers = state.workers || [];
        const byId = new Map(workers.map(worker => [worker.id, worker]));
        const nameOf = id => (byId.get(id) ? byId.get(id).name : "—");

        let scopeLabel;
        let inPeriod = () => true;
        let scopeWorkers;
        let includeIncident;
        let includeByArea = () => true;

        if (type === "mensual") {

            const month = options.month || todayString.slice(0, 7);
            scopeLabel = `Mensual · ${monthTitle(month)}`;
            inPeriod = date => String(date || "").startsWith(month);
            scopeWorkers = workers;
            includeIncident = () => true;

        } else if (type === "anual") {

            const year = options.year || todayString.slice(0, 4);
            scopeLabel = `Anual · ${year}`;
            inPeriod = date => String(date || "").startsWith(year);
            scopeWorkers = workers;
            includeIncident = () => true;

        } else if (type === "trabajador") {

            const worker = byId.get(options.workerId);
            scopeLabel = `Trabajador · ${worker ? worker.name : "—"}`;
            scopeWorkers = worker ? [worker] : [];
            includeIncident = incident => incident.workerId === options.workerId;
            includeByArea = null; // hallazgos, inspecciones e IPERC no son por persona

        } else {

            const area = options.area || "";
            scopeLabel = `Área · ${area || "—"}`;
            scopeWorkers = workers.filter(worker => sameArea(worker.area, area));
            includeIncident = incident =>
                sameArea(incident.area, area) ||
                scopeWorkers.some(worker => worker.id === incident.workerId);
            includeByArea = item => sameArea(item.area, area);
        }

        // Los filtros adicionales intersectan el alcance original, sin modificar el estado.
        const filterArea = String(options.filterArea || "").trim();
        const filterWorkerId = options.filterWorkerId;
        const hasWorkerFilter = filterWorkerId !== undefined && filterWorkerId !== null && filterWorkerId !== "";
        if (filterArea) {
            scopeWorkers = scopeWorkers.filter(worker => sameArea(worker.area, filterArea));
            scopeLabel += ` · Área: ${filterArea}`;
        }
        if (hasWorkerFilter) {
            scopeWorkers = scopeWorkers.filter(worker => worker.id === filterWorkerId);
            scopeLabel += ` · Colaborador: ${nameOf(filterWorkerId)}`;
        }
        const periodMatches = inPeriod;
        inPeriod = date => M.validAttendanceDate(date) && periodMatches(date) &&
            (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
        if (dateFrom || dateTo) {
            scopeLabel += ` · ${dateFrom ? fmtDate(dateFrom) : "Inicio del historial"} a ${dateTo ? fmtDate(dateTo) : "Fin del historial"}`;
        }
        const incidentMatches = includeIncident;
        includeIncident = item => incidentMatches(item) &&
            (!filterArea || sameArea(item.area, filterArea) || scopeWorkers.some(worker => worker.id === item.workerId)) &&
            (!hasWorkerFilter || item.workerId === filterWorkerId);
        if (hasWorkerFilter) {
            includeByArea = null;
        } else if (includeByArea && filterArea) {
            const areaMatches = includeByArea;
            includeByArea = item => areaMatches(item) && sameArea(item.area, filterArea);
        }

        const ids = new Set(scopeWorkers.map(worker => worker.id));
        const mine = (list, field) =>
            (state[list] || [])
                .filter(item => ids.has(item.workerId) && inPeriod(item[field]))
                .sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || "")));

        const epp = mine("epp", "date");
        const training = mine("training", "date");
        const medical = mine("medical", "date");
        const insurance = (state.insurance || []).filter(item => ids.has(item.workerId));
        const attendance = M.registeredAttendance(state.attendance || []).filter(item =>
            ids.has(item.workerId) && inPeriod(item.date));

        const incidents = (state.incidents || [])
            .filter(item => includeIncident(item) && inPeriod(item.date))
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));

        const findings = includeByArea
            ? (state.findings || []).filter(item => includeByArea(item) && inPeriod(item.date))
            : [];
        const inspections = includeByArea
            ? (state.inspections || []).filter(item => includeByArea(item) && inPeriod(item.date))
            : [];
        const iperc = includeByArea
            ? (state.iperc || []).filter(includeByArea)
            : [];

        const exp = (date) => M.expirationState(date, todayString).text;

        /* ---- secciones ---- */

        const sections = [];

        sections.push({
            key: "colaboradores",
            title: "Colaboradores",
            columns: ["Nombre", "DNI", "Cargo", "Área", "Ingreso", "Estado"],
            rows: scopeWorkers.map(worker => [
                worker.name, worker.dni, worker.role, worker.area,
                fmtDate(worker.joined), worker.status
            ])
        });

        sections.push({
            key: "epp",
            title: "EPP entregados",
            columns: ["Colaborador", "Equipo", "Cantidad", "Talla", "Entrega", "Renovación", "Estado"],
            rows: epp.map(item => [
                nameOf(item.workerId), item.item, item.quantity, item.size || "—",
                fmtDate(item.date), fmtDate(item.renewal), exp(item.renewal)
            ])
        });

        sections.push({
            key: "seguros",
            title: "Seguros",
            note: "Estado a la fecha del reporte.",
            columns: ["Colaborador", "Seguro", "Aseguradora", "Póliza", "Inicio", "Vencimiento", "Estado"],
            rows: insurance.map(item => [
                nameOf(item.workerId), item.type, item.provider, item.policy || "—",
                fmtDate(item.start), fmtDate(item.end), exp(item.end)
            ])
        });

        sections.push({
            key: "capacitaciones",
            title: "Capacitaciones",
            note: "Registros individuales de capacitación; los totales realizados, aprobados y desaprobados cuentan registros por colaborador. No incluyen el módulo de charlas diarias ni acreditan por sí solos una capacitación formal.",
            columns: ["Colaborador", "Capacitación", "Fecha", "Entidad / instructor", "Nota", "Estado"],
            rows: training.map(item => [
                nameOf(item.workerId), item.topic, fmtDate(item.date),
                item.provider || "—",
                item.grade === undefined || item.grade === "" ? "—" : item.grade,
                item.status
            ])
        });

        sections.push({
            key: "emo",
            title: "Exámenes médicos (EMO)",
            columns: ["Colaborador", "Tipo", "Fecha", "Resultado", "Vencimiento", "Estado"],
            rows: medical.map(item => [
                nameOf(item.workerId), item.type, fmtDate(item.date), item.result,
                fmtDate(item.expiry), exp(item.expiry)
            ])
        });

        const attendanceRows = scopeWorkers
            .map(worker => {
                const records = attendance.filter(item => item.workerId === worker.id);
                return {
                    worker,
                    summary: M.attendanceSummary(records),
                    hours: M.workedHours(records)
                };
            })
            .filter(row => row.summary.days > 0 || row.summary.absences > 0);

        sections.push({
            key: "asistencia",
            title: "Asistencia",
            columns: ["Colaborador", "Días registrados", "Asistencias", "Inasistencias", "Tardanzas", "% asistencia", "Horas hombre"],
            rows: attendanceRows.map(({ worker, summary, hours }) => [
                worker.name, summary.days, summary.attendance, summary.absences, summary.late,
                summary.pct === null ? "—" : summary.pct + "%", hours
            ])
        });

        let attendanceMonths;

        if (type === "mensual") {
            attendanceMonths = [options.month || todayString.slice(0, 7)];
        } else if (type === "anual") {
            const year = options.year || todayString.slice(0, 4);
            attendanceMonths = MONTH_NAMES.map((_, index) =>
                `${year}-${String(index + 1).padStart(2, "0")}`);
        } else {
            attendanceMonths = [...new Set(attendance.map(item => item.date.slice(0, 7)))].sort();
        }

        sections.push({
            key: "horas_hombre",
            title: "Horas hombre trabajadas",
            note: "Días trabajados suma las jornadas de todos los trabajadores. Cada asistencia o tardanza equivale a 10 horas; inasistencias y descansos suman 0 horas.",
            columns: ["Mes", "Días trabajados", "Horas hombre"],
            rows: attendanceMonths.map(month => {
                const hours = M.workedHours(attendance.filter(item => item.date.startsWith(month + "-")));
                return [monthTitle(month), hours / 10, hours];
            })
        });

        sections.push({
            key: "incidentes",
            title: "Incidentes y accidentes",
            columns: ["Fecha", "Evento", "Tipo", "Trabajador", "Área", "Severidad", "Descripción",
                "Acción correctiva", "Responsable", "Estado"],
            rows: incidents.map(item => [
                fmtDate(item.date), M.eventTitle(item), item.type, item.workerId ? nameOf(item.workerId) : "—",
                item.area || "—", item.severity, item.description,
                item.correctiveAction || "—", item.responsible || "—", item.status
            ])
        });

        if (includeByArea) {

            sections.push({
                key: "hallazgos",
                title: "Hallazgos",
                columns: ["Fecha", "Tipo", "Área / lugar", "Descripción", "Estado", "Cierre"],
                rows: findings.map(item => [
                    fmtDate(item.date), item.type, item.area, item.description,
                    item.status, fmtDate(item.closedDate)
                ])
            });

            sections.push({
                key: "inspecciones",
                title: "Inspecciones",
                columns: ["Fecha", "Área / tipo", "Inspector", "Observaciones", "Cerradas"],
                rows: inspections.map(item => {
                    const progress = M.inspectionProgress(item);
                    return [
                        fmtDate(item.date), item.area, item.inspector || "—",
                        progress.total, `${progress.closed}/${progress.total}`
                    ];
                })
            });

            sections.push({
                key: "iperc",
                title: "IPERC · Matriz de riesgos",
                note: "Matriz vigente a la fecha del reporte.",
                columns: ["Área", "Peligro", "Riesgo", "Probabilidad", "Severidad", "Nivel",
                    "Medida de control", "Responsable"],
                rows: iperc
                    .slice()
                    .sort((a, b) =>
                        M.riskLevel(b.probability, b.severity).score -
                        M.riskLevel(a.probability, a.severity).score)
                    .map(item => [
                        item.area || "—", item.hazard, item.risk, item.probability, item.severity,
                        M.riskLevel(item.probability, item.severity).label,
                        item.control || "—", item.responsible || "—"
                    ])
            });
        }

        /* ---- resumen ---- */

        const globalAttendance = M.attendanceSummary(attendance);
        const countBy = (list, test) => list.filter(test).length;

        const summary = [
            { label: "Colaboradores activos", value: countBy(scopeWorkers, w => w.status === "Activo") },
            { label: "Entregas de EPP", value: epp.length },
            {
                label: "Seguros vigentes",
                value: countBy(insurance, item => ["ok", "due"].includes(M.expirationState(item.end, todayString).status))
            },
            {
                label: "Seguros vencidos",
                value: countBy(insurance, item => M.expirationState(item.end, todayString).status === "expired")
            },
            { label: "Capacitaciones realizadas", value: countBy(training, item => M.isTrainingDone(item.status)) },
            { label: "Capacitaciones aprobadas", value: countBy(training, item => item.status === "Aprobado") },
            { label: "Capacitaciones desaprobadas", value: countBy(training, item => item.status === "Desaprobado") },
            { label: "EMO con resultado apto", value: countBy(medical, item => item.result === "Apto") },
            {
                label: "% de asistencia",
                value: globalAttendance.pct === null ? "—" : globalAttendance.pct + "%"
            },
            { label: "Horas hombre trabajadas", value: M.workedHours(attendance) },
            { label: "Incidentes", value: countBy(incidents, item => item.type === "Incidente") },
            { label: "Accidentes", value: countBy(incidents, item => item.type === "Accidente") },
            { label: "Incidentes/accidentes pendientes", value: countBy(incidents, item => item.status !== "Cerrado") }
        ];

        if (includeByArea) {
            summary.push(
                { label: "Hallazgos abiertos", value: countBy(findings, item => item.status !== "Cerrado") },
                {
                    label: "Riesgos IPERC altos",
                    value: countBy(iperc, item => M.riskLevel(item.probability, item.severity).key === "high")
                }
            );
        }

        return {
            title: "Reporte SST",
            scopeLabel,
            generated: fmtDate(todayString),
            notes: [
                "Fuente: registros guardados en SST-Manager. Los filtros de fechas se aplican a los eventos; colaboradores, seguros e IPERC muestran el estado registrado a la fecha de generación.",
                "Reporte de gestión con datos personales. Su contenido y evidencias requieren revisión del responsable; este resumen no acredita cumplimiento legal ni reemplaza los registros exigibles."
            ],
            summary,
            sections
        };
    }


    /* ---------------------------------------------------------
       HTML IMPRIMIBLE (para guardar como PDF)
       --------------------------------------------------------- */

    function toHtml(report) {

        const kpis = report.summary
            .map(item => `
                <div class="kpi">
                    <strong>${escapeHtml(item.value)}</strong>
                    <span>${escapeHtml(item.label)}</span>
                </div>`)
            .join("");

        const sections = report.sections
            .map(section => {

                const head = section.columns
                    .map(column => `<th scope="col">${escapeHtml(column)}</th>`)
                    .join("");

                const body = section.rows.length
                    ? section.rows
                        .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
                        .join("")
                    : `<tr><td class="empty" colspan="${section.columns.length}">Sin registros.</td></tr>`;

                return `
                    <section>
                        <h2>${escapeHtml(section.title)}
                            <small>${section.rows.length} registro(s)</small></h2>
                        ${section.note ? `<p class="note">${escapeHtml(section.note)}</p>` : ""}
                        <div class="table-scroll"><table aria-label="${escapeHtml(section.title)}">
                            <thead><tr>${head}</tr></thead>
                            <tbody>${body}</tbody>
                        </table></div>
                    </section>`;
            })
            .join("");

        return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(report.title)} - ${escapeHtml(report.scopeLabel)}</title>
<style>
    * { box-sizing: border-box; }
    @page { size: A4 landscape; margin: 14mm 12mm 16mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #17212b; margin: 24px; font-size: 11px; line-height: 1.45; }
    header { border-bottom: 3px solid #0642b0; padding-bottom: 12px; margin-bottom: 18px; }
    .brand { margin: 0 0 6px; font-size: 10px; letter-spacing: 1.5px; font-weight: 700; color: #0642b0; }
    header h1 { margin: 0; font-size: 24px; color: #093f52; }
    header p { color: #526170; margin: 6px 0 0; overflow-wrap: anywhere; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(138px, 1fr)); gap: 8px; margin-bottom: 20px; }
    .kpi { border: 1px solid #dce5eb; border-radius: 6px; padding: 9px 12px; break-inside: avoid; }
    .kpi strong { display: block; font-size: 20px; color: #0642b0; }
    .kpi span { font-size: 10px; color: #526170; }
    section { margin-bottom: 22px; }
    h2 { font-size: 14px; margin: 0 0 7px; color: #093f52; break-after: avoid; }
    h2 small { font-weight: normal; color: #526170; margin-left: 6px; white-space: nowrap; }
    .note { color: #526170; font-size: 10px; margin: 4px 0 8px; }
    .table-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { background: #0642b0; color: #fff; text-align: left; padding: 7px; font-size: 10px; vertical-align: top; }
    td { border-bottom: 1px solid #dce5eb; padding: 6px 7px; vertical-align: top; white-space: pre-wrap; }
    th, td { overflow-wrap: anywhere; word-break: normal; }
    tr { break-inside: avoid; }
    tr:nth-child(even) td { background: #f2f6f9; }
    .empty { color: #526170; text-align: center; font-style: italic; }
    footer { border-top: 1px solid #b9cbd5; padding-top: 8px; color: #526170; font-size: 9px; }
    footer p { margin: 4px 0; }
    @media (max-width: 600px) { body { margin: 14px; } .table-scroll table { min-width: 640px; } }
    @media print {
        body { margin: 0; font-size: 9px; }
        .kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        .kpi { padding: 6px 8px; }
        .kpi strong { font-size: 17px; }
        .table-scroll { overflow: visible; }
        .table-scroll table { min-width: 0; table-layout: fixed; }
        th, td { padding: 5px; }
        th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        footer { break-inside: avoid; }
    }
</style>
</head>
<body>
    <header>
        <p class="brand">SST-MANAGER · GESTIÓN DE SEGURIDAD</p>
        <h1>${escapeHtml(report.title)}</h1>
        <p>${escapeHtml(report.scopeLabel)} · Generado el ${escapeHtml(report.generated)}</p>
    </header>
    <main><div class="kpis" aria-label="Resumen de indicadores">${kpis}</div>
    ${sections}</main>
    <footer><strong>SST-Manager · ${escapeHtml(report.scopeLabel)}</strong>
        <p>Generado el ${escapeHtml(report.generated)}. Información para uso autorizado.</p>
        ${(report.notes || []).map(note => `<p>${escapeHtml(note)}</p>`).join("")}
    </footer>
</body>
</html>`;
    }


    /* ---------------------------------------------------------
       EXCEL (.xlsx real, sin librerías)
       Un .xlsx es un .zip de XMLs; aquí se arma uno sin
       compresión (método "stored").
       --------------------------------------------------------- */

    const CRC_TABLE = (() => {

        const table = new Uint32Array(256);

        for (let n = 0; n < 256; n++) {

            let c = n;

            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            }

            table[n] = c >>> 0;
        }

        return table;
    })();

    function crc32(bytes) {

        let crc = 0xFFFFFFFF;

        for (let i = 0; i < bytes.length; i++) {
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }

        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function zipStore(files) {

        const encoder = new TextEncoder();
        const chunks = [];
        const central = [];
        let offset = 0;

        const push = bytes => {
            chunks.push(bytes);
            offset += bytes.length;
        };

        files.forEach(file => {

            const name = encoder.encode(file.name);
            const data = encoder.encode(file.content);
            const crc = crc32(data);

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034B50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true);   // nombres en UTF-8
            local.setUint16(8, 0, true);        // sin compresión
            local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true);
            local.setUint32(22, data.length, true);
            local.setUint16(26, name.length, true);

            const header = new DataView(new ArrayBuffer(46));
            header.setUint32(0, 0x02014B50, true);
            header.setUint16(4, 20, true);
            header.setUint16(6, 20, true);
            header.setUint16(8, 0x0800, true);
            header.setUint32(16, crc, true);
            header.setUint32(20, data.length, true);
            header.setUint32(24, data.length, true);
            header.setUint16(28, name.length, true);
            header.setUint32(42, offset, true);

            central.push(new Uint8Array(header.buffer), name);

            push(new Uint8Array(local.buffer));
            push(name);
            push(data);
        });

        const centralStart = offset;

        central.forEach(push);

        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054B50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, offset - centralStart, true);
        end.setUint32(16, centralStart, true);
        push(new Uint8Array(end.buffer));

        const result = new Uint8Array(offset);
        let position = 0;

        chunks.forEach(chunk => {
            result.set(chunk, position);
            position += chunk.length;
        });

        return result;
    }

    function xmlEscape(value) {
        return String(value == null ? "" : value)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function columnName(index) {

        let name = "";
        let n = index + 1;

        while (n > 0) {
            const rest = (n - 1) % 26;
            name = String.fromCharCode(65 + rest) + name;
            n = Math.floor((n - 1) / 26);
        }

        return name;
    }

    // style: 0 normal, 1 encabezado, 2 título
    function cellXml(value, rowIndex, colIndex, style) {

        const ref = columnName(colIndex) + (rowIndex + 1);
        const s = style ? ` s="${style}"` : "";

        if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}"${s}><v>${value}</v></c>`;
        }

        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }

    function sheetXml(rows, widths, options) {

        const settings = options || {};
        const headerRow = settings.headerRow || 1;
        const lastColumn = columnName(widths.length - 1);
        const dataEnd = settings.dataEnd || rows.length;
        const lastRow = Math.max(1, rows.length);

        const cols = widths
            .map((width, index) =>
                `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
            .join("");

        const body = rows
            .map((row, rowIndex) => {
                const lines = Math.max(1, ...row.cells.map((value, index) =>
                    String(value ?? "").split(/\r?\n/).reduce((sum, line) =>
                        sum + Math.max(1, Math.ceil(line.length / Math.max(8, (widths[index] || 30) - 2))), 0)));
                const height = row.style === 2 ? 28 : row.style === 1 ? Math.max(28, lines * 15) : Math.max(20, lines * 15);
                return `<row r="${rowIndex + 1}" ht="${Math.min(409, height)}" customHeight="1">${row.cells
                    .map((value, colIndex) => cellXml(value, rowIndex, colIndex, row.style))
                    .join("")}</row>`;
            })
            .join("");

        const merges = settings.merges || [];
        const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : "";
        const literalHeader = value => String(value || "").replaceAll("&", "&&").slice(0, 110);
        const header = xmlEscape(`&LSST-Manager&C${literalHeader(settings.title)}&R${literalHeader(settings.generated)}`);

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols><sheetData>${body}</sheetData><autoFilter ref="A${headerRow}:${lastColumn}${dataEnd}"/>${mergeXml}<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.6" bottom="0.6" header="0.25" footer="0.25"/><pageSetup paperSize="9" orientation="${widths.length > 5 ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddHeader>${header}</oddHeader><oddFooter>&amp;LInformación para uso autorizado&amp;CPágina &amp;P de &amp;N&amp;RSST-Manager</oddFooter></headerFooter></worksheet>`;
    }

    function sheetName(title, used) {

        let name = String(title).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Hoja";
        let candidate = name;
        let counter = 2;

        while (used.has(candidate.toLowerCase())) {
            candidate = name.slice(0, 28) + " " + counter++;
        }

        used.add(candidate.toLowerCase());

        return candidate;
    }

    function widthsFor(rows, columns) {

        return Array.from({ length: columns }, (_, index) => {

            const longest = rows.reduce(
                (max, row) => Math.max(max, String(row.cells[index] ?? "").length), 8);

            return Math.min(60, longest + 2);
        });
    }

    function toXlsx(report) {

        const used = new Set();
        const sheets = [];

        const summaryRows = [
            { style: 2, cells: [report.title] },
            { style: 0, cells: [report.scopeLabel] },
            { style: 0, cells: ["Generado el " + report.generated] },
            { style: 0, cells: [""] },
            { style: 1, cells: ["Indicador", "Valor"] },
            ...report.summary.map(item => ({ style: 0, cells: [item.label, item.value] }))
        ];
        const summaryEnd = summaryRows.length;
        const summaryMerges = ["A1:B1", "A2:B2", "A3:B3"];
        (report.notes || []).forEach(note => {
            summaryRows.push({ style: 3, cells: [note] });
            summaryMerges.push(`A${summaryRows.length}:B${summaryRows.length}`);
        });

        sheets.push({
            name: sheetName("Resumen", used),
            headerRow: 5,
            xml: sheetXml(summaryRows, [48, 22], { headerRow: 5, dataEnd: summaryEnd, merges: summaryMerges, title: report.scopeLabel, generated: report.generated })
        });

        report.sections.forEach(section => {

            const rows = [
                { style: 1, cells: section.columns },
                ...section.rows.map(cells => ({ style: 0, cells }))
            ];
            const dataEnd = rows.length;
            const widths = widthsFor(rows, section.columns.length);
            const merges = [];
            if (section.note) {
                rows.push({ style: 3, cells: [section.note] });
                merges.push(`A${rows.length}:${columnName(section.columns.length - 1)}${rows.length}`);
            }

            sheets.push({
                name: sheetName(section.title, used),
                headerRow: 1,
                xml: sheetXml(rows, widths, { dataEnd, merges, title: section.title + " · " + report.scopeLabel, generated: report.generated })
            });
        });

        const files = [
            {
                name: "[Content_Types].xml",
                content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
                    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
                    .join("")}</Types>`
            },
            {
                name: "_rels/.rels",
                content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
            },
            {
                name: "xl/workbook.xml",
                content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
                    .map((sheet, i) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
                    .join("")}</sheets><definedNames>${sheets.map((sheet, i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xmlEscape("'" + sheet.name.replaceAll("'", "''") + "'!$1:$" + sheet.headerRow)}</definedName>`).join("")}</definedNames></workbook>`
            },
            {
                name: "xl/_rels/workbook.xml.rels",
                content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
                    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
                    .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
            },
            {
                name: "xl/styles.xml",
                content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF0642B0"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF526170"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0642B0"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="hair"><color rgb="FFDCE5EB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
            },
            ...sheets.map((sheet, i) => ({
                name: `xl/worksheets/sheet${i + 1}.xml`,
                content: sheet.xml
            }))
        ];

        return zipStore(files);
    }

    function fileName(report, extension) {

        const slug = M.normalize(report.scopeLabel)
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");

        return `reporte_sst_${slug}.${extension}`;
    }


    return {
        REPORT_TYPES,
        buildReport,
        toHtml,
        toXlsx,
        fileName,
        crc32
    };
});
