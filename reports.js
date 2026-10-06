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
       options: { type, month, year, workerId, area }
       --------------------------------------------------------- */

    function buildReport(state, options, todayString) {

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

        const ids = new Set(scopeWorkers.map(worker => worker.id));
        const mine = (list, field) =>
            (state[list] || [])
                .filter(item => ids.has(item.workerId) && inPeriod(item[field]))
                .sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || "")));

        const epp = mine("epp", "date");
        const training = mine("training", "date");
        const medical = mine("medical", "date");
        const insurance = (state.insurance || []).filter(item => ids.has(item.workerId));
        const attendance = (state.attendance || []).filter(item =>
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
            columns: ["Colaborador", "Capacitación", "Fecha", "Entidad / instructor", "Estado"],
            rows: training.map(item => [
                nameOf(item.workerId), item.topic, fmtDate(item.date),
                item.provider || "—", item.status
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
            .map(worker => ({
                worker,
                summary: M.attendanceSummary(
                    attendance.filter(item => item.workerId === worker.id))
            }))
            .filter(row => row.summary.days > 0 || row.summary.absences > 0);

        sections.push({
            key: "asistencia",
            title: "Asistencia",
            columns: ["Colaborador", "Días registrados", "Asistencias", "Inasistencias", "Tardanzas", "% asistencia"],
            rows: attendanceRows.map(({ worker, summary }) => [
                worker.name, summary.days, summary.attendance, summary.absences, summary.late,
                summary.pct === null ? "—" : summary.pct + "%"
            ])
        });

        sections.push({
            key: "incidentes",
            title: "Incidentes y accidentes",
            columns: ["Fecha", "Tipo", "Trabajador", "Área", "Severidad", "Descripción",
                "Acción correctiva", "Responsable", "Estado"],
            rows: incidents.map(item => [
                fmtDate(item.date), item.type, item.workerId ? nameOf(item.workerId) : "—",
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
                value: countBy(insurance, item => M.expirationState(item.end, todayString).status !== "expired")
            },
            {
                label: "Seguros vencidos",
                value: countBy(insurance, item => M.expirationState(item.end, todayString).status === "expired")
            },
            { label: "Capacitaciones completadas", value: countBy(training, item => item.status === "Completada") },
            { label: "EMO con resultado apto", value: countBy(medical, item => item.result === "Apto") },
            {
                label: "% de asistencia",
                value: globalAttendance.pct === null ? "—" : globalAttendance.pct + "%"
            },
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
                    .map(column => `<th>${escapeHtml(column)}</th>`)
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
                        <table>
                            <thead><tr>${head}</tr></thead>
                            <tbody>${body}</tbody>
                        </table>
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
    body { font-family: Arial, Helvetica, sans-serif; color: #17212b; margin: 24px; font-size: 12px; }
    header { border-bottom: 3px solid #0f5c75; padding-bottom: 10px; margin-bottom: 16px; }
    header h1 { font-size: 22px; color: #0f5c75; }
    header p { color: #6b7887; margin-top: 4px; }
    .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .kpi { border: 1px solid #dce5eb; border-radius: 8px; padding: 8px 12px; min-width: 130px; }
    .kpi strong { display: block; font-size: 20px; color: #0f5c75; }
    .kpi span { font-size: 10px; color: #6b7887; }
    section { margin-bottom: 18px; page-break-inside: avoid; }
    h2 { font-size: 14px; margin-bottom: 6px; color: #093f52; }
    h2 small { font-weight: normal; color: #6b7887; margin-left: 6px; }
    .note { color: #6b7887; font-size: 10px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #0f5c75; color: #fff; text-align: left; padding: 5px 6px; font-size: 10px; }
    td { border-bottom: 1px solid #dce5eb; padding: 5px 6px; vertical-align: top; }
    tr:nth-child(even) td { background: #f2f6f9; }
    .empty { color: #6b7887; text-align: center; font-style: italic; }
    @media print { body { margin: 10mm; } }
</style>
</head>
<body>
    <header>
        <h1>${escapeHtml(report.title)}</h1>
        <p>${escapeHtml(report.scopeLabel)} · Generado el ${escapeHtml(report.generated)}</p>
    </header>
    <div class="kpis">${kpis}</div>
    ${sections}
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

    function sheetXml(rows, widths) {

        const cols = widths
            .map((width, index) =>
                `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
            .join("");

        const body = rows
            .map((row, rowIndex) =>
                `<row r="${rowIndex + 1}">${row.cells
                    .map((value, colIndex) => cellXml(value, rowIndex, colIndex, row.style))
                    .join("")}</row>`)
            .join("");

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
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

        sheets.push({
            name: sheetName("Resumen", used),
            xml: sheetXml(summaryRows, [38, 14])
        });

        report.sections.forEach(section => {

            const rows = [
                { style: 1, cells: section.columns },
                ...section.rows.map(cells => ({ style: 0, cells }))
            ];

            sheets.push({
                name: sheetName(section.title, used),
                xml: sheetXml(rows, widthsFor(rows, section.columns.length))
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
                    .join("")}</sheets></workbook>`
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
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF0F5C75"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F5C75"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
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
