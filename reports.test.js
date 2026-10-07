/* Pruebas de reports.js. Ejecutar con:  node --test */

const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("./reports.js");

const TODAY = "2026-10-05";

const state = {
    workers: [
        { id: "a", name: "Ana", dni: "1", role: "Operaria", area: "Taller", joined: "2026-01-01", status: "Activo" },
        { id: "b", name: "Beto", dni: "2", role: "Técnico", area: "Oficina", joined: "2026-01-01", status: "Activo" }
    ],
    epp: [
        { workerId: "a", item: "Casco", quantity: "1", date: "2026-10-02", renewal: "2027-10-02" },
        { workerId: "b", item: "Lentes", quantity: "1", date: "2026-09-02", renewal: "" }
    ],
    insurance: [
        { workerId: "a", type: "SCTR", provider: "X", start: "2026-01-01", end: "2026-12-31" },
        { workerId: "b", type: "SCTR", provider: "X", start: "2025-01-01", end: "2025-12-31" }
    ],
    training: [
        { workerId: "a", topic: "Altura", date: "2026-10-03", status: "Completada" },
        { workerId: "a", topic: "Fuego", date: "2025-03-03", status: "Completada" }
    ],
    medical: [{ workerId: "a", type: "Periódico", date: "2026-10-01", result: "Apto", expiry: "2027-10-01" }],
    attendance: [
        { workerId: "a", date: "2026-10-01", status: "Asistencia" },
        { workerId: "a", date: "2026-10-02", status: "Inasistencia" }
    ],
    incidents: [
        { workerId: "a", type: "Accidente", date: "2026-10-04", area: "Taller", severity: "Grave", description: "Caída", status: "Pendiente" },
        { workerId: "", type: "Incidente", date: "2026-09-04", area: "Oficina", severity: "Leve", description: "Cable", status: "Cerrado" }
    ],
    findings: [
        { type: "HPH", date: "2026-10-01", area: "Taller", description: "Derrame", status: "Abierto" },
        { type: "HPI", date: "2026-09-01", area: "Oficina", description: "Orden", status: "Cerrado" }
    ],
    inspections: [
        { date: "2026-10-01", area: "Taller", observations: [{ status: "Cerrada" }, { status: "Abierta" }] }
    ],
    iperc: [
        { area: "Taller", hazard: "Piso", risk: "Caída", probability: 3, severity: 3, control: "Señalizar" },
        { area: "Oficina", hazard: "Cable", risk: "Tropiezo", probability: 1, severity: 1, control: "Canaleta" }
    ]
};

const section = (report, key) => report.sections.find(item => item.key === key);
const value = (report, label) => report.summary.find(item => item.label === label).value;

test("reporte mensual solo incluye lo ocurrido en el mes", () => {
    const report = R.buildReport(state, { type: "mensual", month: "2026-10" }, TODAY);
    assert.equal(report.scopeLabel, "Mensual · Octubre 2026");
    assert.equal(section(report, "epp").rows.length, 1);
    assert.equal(section(report, "capacitaciones").rows.length, 1);
    assert.equal(section(report, "incidentes").rows.length, 1);
    assert.equal(value(report, "Accidentes"), 1);
    assert.equal(value(report, "Incidentes"), 0);
    assert.equal(value(report, "Hallazgos abiertos"), 1);
    assert.equal(value(report, "Riesgos IPERC altos"), 1);
    assert.equal(value(report, "% de asistencia"), "50%");
});

test("reporte anual incluye todo el año y deja fuera otros años", () => {
    const report = R.buildReport(state, { type: "anual", year: "2026" }, TODAY);
    assert.equal(section(report, "capacitaciones").rows.length, 1);   // la de 2025 queda fuera
    assert.equal(section(report, "incidentes").rows.length, 2);
    assert.equal(section(report, "epp").rows.length, 2);
});

test("reporte por trabajador filtra por persona y omite secciones por área", () => {
    const report = R.buildReport(state, { type: "trabajador", workerId: "a" }, TODAY);
    assert.equal(report.scopeLabel, "Trabajador · Ana");
    assert.equal(section(report, "capacitaciones").rows.length, 2);   // todo el historial
    assert.equal(section(report, "incidentes").rows.length, 1);
    assert.equal(section(report, "hallazgos"), undefined);
    assert.equal(section(report, "iperc"), undefined);
    assert.equal(value(report, "Colaboradores activos"), 1);
});

test("reporte por área filtra trabajadores, incidentes, hallazgos e IPERC del área", () => {
    const report = R.buildReport(state, { type: "area", area: "taller" }, TODAY);
    assert.equal(section(report, "colaboradores").rows.length, 1);
    assert.equal(section(report, "incidentes").rows.length, 1);
    assert.equal(section(report, "hallazgos").rows.length, 1);
    assert.equal(section(report, "inspecciones").rows[0][4], "1/2");
    assert.equal(section(report, "iperc").rows.length, 1);
    assert.equal(section(report, "iperc").rows[0][5], "Alto");
});

test("reporte de capacitaciones muestra la nota y cuenta aprobadas y desaprobadas", () => {
    const graded = JSON.parse(JSON.stringify(state));
    graded.training = [
        { workerId: "a", topic: "Uso de EPP", date: "2026-10-03", provider: "Ing. Perico León", status: "Aprobado", grade: 17 },
        { workerId: "b", topic: "Uso de EPP", date: "2026-10-03", provider: "Ing. Perico León", status: "Desaprobado", grade: 12 },
        { workerId: "a", topic: "Altura", date: "2026-10-04", status: "Programada" }
    ];
    const report = R.buildReport(graded, { type: "mensual", month: "2026-10" }, TODAY);
    const rows = section(report, "capacitaciones").rows;
    assert.ok(rows.some(row => row[4] === 17 && row[5] === "Aprobado"));
    assert.ok(rows.some(row => row[4] === 12 && row[5] === "Desaprobado"));
    assert.equal(value(report, "Capacitaciones realizadas"), 2);
    assert.equal(value(report, "Capacitaciones aprobadas"), 1);
    assert.equal(value(report, "Capacitaciones desaprobadas"), 1);
});

test("seguros: cuenta vigentes y vencidos a la fecha del reporte", () => {
    const report = R.buildReport(state, { type: "anual", year: "2026" }, TODAY);
    assert.equal(value(report, "Seguros vigentes"), 1);
    assert.equal(value(report, "Seguros vencidos"), 1);
});

test("toHtml escapa el contenido y lista cada sección", () => {
    const risky = JSON.parse(JSON.stringify(state));
    risky.incidents[0].description = "<img src=x onerror=alert(1)>";
    const html = R.toHtml(R.buildReport(risky, { type: "anual", year: "2026" }, TODAY));
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("Incidentes y accidentes"));
});

test("crc32 coincide con el valor conocido", () => {
    assert.equal(R.crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
});

test("toXlsx genera un zip válido con una hoja por sección", () => {
    const report = R.buildReport(state, { type: "anual", year: "2026" }, TODAY);
    const bytes = R.toXlsx(report);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // fin del directorio central
    const end = bytes.length - 22;
    assert.equal(view.getUint32(end, true), 0x06054B50);
    const entries = view.getUint16(end + 10, true);
    assert.equal(entries, 5 + report.sections.length + 1);   // 5 partes fijas + hojas (resumen + secciones)

    // cada entrada local tiene un CRC correcto
    const decoder = new TextDecoder();
    let offset = 0;
    const names = [];
    for (let i = 0; i < entries; i++) {
        assert.equal(view.getUint32(offset, true), 0x04034B50);
        const crc = view.getUint32(offset + 14, true);
        const size = view.getUint32(offset + 18, true);
        const nameLength = view.getUint16(offset + 26, true);
        names.push(decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength)));
        const data = bytes.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
        assert.equal(R.crc32(data), crc, names[i]);
        offset += 30 + nameLength + size;
    }
    assert.ok(names.includes("xl/workbook.xml"));
    assert.ok(names.includes("[Content_Types].xml"));
});

test("fileName arma un nombre de archivo seguro", () => {
    const report = R.buildReport(state, { type: "trabajador", workerId: "a" }, TODAY);
    assert.equal(R.fileName(report, "xlsx"), "reporte_sst_trabajador_ana.xlsx");
});
