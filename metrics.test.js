/* Pruebas de metrics.js. Ejecutar con:  node --test */

const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("./metrics.js");

const TODAY = "2026-10-05";

/* ---------- Base: utilidades ---------- */

test("normalize quita tildes, mayúsculas y espacios", () => {
    assert.equal(M.normalize("  Ropa UNIFORME Ñandú "), "ropa uniforme nandu");
    assert.equal(M.normalize(null), "");
});

test("matchesKeyword reconoce variantes de escritura", () => {
    assert.ok(M.matchesKeyword("Cascos nuevos", ["casco"]));
    assert.ok(M.matchesKeyword("VIDA LEY", ["vidaley"]));
    assert.ok(M.matchesKeyword("vida-ley", ["vidaley"]));
    assert.ok(M.matchesKeyword("Lentes de seguridad", ["lente"]));
    assert.ok(!M.matchesKeyword("Guantes", ["casco"]));
});

test("daysUntil y expirationState respetan los límites (0, 30, 31 y vencido)", () => {
    assert.equal(M.daysUntil("2026-10-05", TODAY), 0);
    assert.equal(M.daysUntil("2026-10-04", TODAY), -1);
    assert.equal(M.daysUntil("", TODAY), null);
    assert.equal(M.expirationState("2026-10-04", TODAY).status, "expired");
    assert.equal(M.expirationState("2026-10-05", TODAY).status, "due");
    assert.equal(M.expirationState("2026-11-04", TODAY).status, "due");   // 30 días
    assert.equal(M.expirationState("2026-11-05", TODAY).status, "ok");    // 31 días
    assert.equal(M.expirationState("", TODAY).status, "nodate");
});

test("el módulo exporta todas las funciones de cálculo", () => {
    [
        "eppMatrix", "insuranceTable", "trainingStats", "findingsStats",
        "inspectionsStats", "splitObservations", "attendanceByWorker",
        "hoursByYear", "upsertHours", "ensureCollections"
    ].forEach(name => assert.equal(typeof M[name], "function", name));
});

/* ---------- Cambio 2: migración del estado guardado ---------- */

const DEFAULTS = () => ({
    workers: [{ id: "sample" }],
    attendance: [], epp: [], insurance: [], training: [], medical: [],
    findings: [], inspections: [], hours: [],
    goals: { trainingMonthly: 0, trainingYearly: 0 }
});

test("ensureCollections agrega las colecciones nuevas sin tocar los datos viejos", () => {
    const saved = { workers: [{ id: "w1" }], attendance: [{ id: "a1" }], epp: [], insurance: [], training: [], medical: [] };
    const result = M.ensureCollections(saved, DEFAULTS());
    assert.deepEqual(result.workers, [{ id: "w1" }]);
    assert.deepEqual(result.attendance, [{ id: "a1" }]);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.inspections, []);
    assert.deepEqual(result.hours, []);
    assert.deepEqual(result.goals, { trainingMonthly: 0, trainingYearly: 0 });
});

test("ensureCollections conserva metas guardadas y completa las que faltan", () => {
    const saved = Object.assign(DEFAULTS(), { goals: { trainingMonthly: 40 }, workers: [{ id: "w1" }] });
    const result = M.ensureCollections(saved, DEFAULTS());
    assert.equal(result.goals.trainingMonthly, 40);
    assert.equal(result.goals.trainingYearly, 0);
});

test("ensureCollections no comparte referencias entre defaults y resultado", () => {
    const defaults = DEFAULTS();
    const result = M.ensureCollections({ workers: [] }, defaults);
    result.findings.push({ id: "x" });
    assert.equal(defaults.findings.length, 0);
});

test("ensureCollections reemplaza colecciones corruptas y datos no válidos", () => {
    const defaults = DEFAULTS();
    assert.equal(M.ensureCollections(null, defaults), defaults);
    assert.equal(M.ensureCollections([], defaults), defaults);
    assert.equal(M.ensureCollections("texto", defaults), defaults);
    const result = M.ensureCollections({ workers: [{ id: "w1" }], hours: "roto", goals: null }, defaults);
    assert.deepEqual(result.hours, []);
    assert.deepEqual(result.goals, { trainingMonthly: 0, trainingYearly: 0 });
    assert.deepEqual(result.workers, [{ id: "w1" }]);
});

/* ---------- Cambio 5: cuadro EPP ---------- */

const W = (id, name, status = "Activo") => ({ id, name, status });

test("eppMatrix: entregado, por renovar, vencido y pendiente por colaborador", () => {
    const state = {
        workers: [W("w1", "Carlos"), W("w2", "Ana"), W("w3", "Inactivo", "Inactivo")],
        epp: [
            { workerId: "w1", item: "Cascos nuevos", date: "2026-09-01", renewal: "2027-09-01" },
            { workerId: "w1", item: "Lentes de seguridad", date: "2026-09-01", renewal: "2026-10-20" },
            { workerId: "w1", item: "Visera", date: "2026-01-01", renewal: "2026-09-20" },
            { workerId: "w2", item: "Ropa uniforme", date: "2026-08-01", renewal: "" },
            { workerId: "w3", item: "Casco", date: "2026-08-01", renewal: "" }
        ]
    };

    const result = M.eppMatrix(state, TODAY);
    const byName = Object.fromEntries(result.rows.map(r => [r.worker.name, r.cells.map(c => c.status)]));

    assert.deepEqual(result.items.map(i => i.key), ["casco", "lentes", "visera", "ropa"]);
    assert.deepEqual(result.rows.map(r => r.worker.name), ["Ana", "Carlos"]);   // ordenados, sin inactivos
    assert.deepEqual(byName.Carlos, ["ok", "due", "expired", "none"]);
    assert.deepEqual(byName.Ana, ["none", "none", "none", "ok"]);
    assert.deepEqual(result.summary, { delivered: 4, missing: 4, due: 1, expired: 1 });
});

test("eppMatrix: gana la entrega más reciente y no se mezclan colaboradores", () => {
    const state = {
        workers: [W("w1", "Carlos"), W("w2", "Ana")],
        epp: [
            { workerId: "w1", item: "Casco", date: "2025-01-01", renewal: "2025-12-01" },   // vencido, viejo
            { workerId: "w1", item: "Casco", date: "2026-09-01", renewal: "2027-09-01" },   // vigente, nuevo
            { workerId: "w2", item: "Casco", date: "2024-01-01", renewal: "2024-06-01" }
        ]
    };
    const rows = Object.fromEntries(M.eppMatrix(state, TODAY).rows.map(r => [r.worker.name, r.cells[0]]));
    assert.equal(rows.Carlos.status, "ok");
    assert.equal(rows.Carlos.date, "2026-09-01");
    assert.equal(rows.Ana.status, "expired");
});

test("eppMatrix: sin colaboradores ni registros no falla", () => {
    assert.deepEqual(M.eppMatrix({}, TODAY).rows, []);
    const r = M.eppMatrix({ workers: [W("w1", "Ana")] }, TODAY);
    assert.deepEqual(r.summary, { delivered: 0, missing: 4, due: 0, expired: 0 });
});

/* ---------- Cambio 6: vencimientos SCTR / Vida Ley ---------- */

test("insuranceTable: SCTR y Vida Ley por colaborador con su estado", () => {
    const state = {
        workers: [W("w1", "Carlos"), W("w2", "Ana"), W("w3", "Baja", "Inactivo")],
        insurance: [
            { workerId: "w1", type: "SCTR", end: "2026-10-25" },              // 20 días: por vencer
            { workerId: "w1", type: "VIDA LEY", end: "2027-01-01" },          // vigente
            { workerId: "w2", type: "sctr salud y pensión", end: "2026-09-01" }, // vencido
            { workerId: "w3", type: "SCTR", end: "2030-01-01" }
        ]
    };

    const result = M.insuranceTable(state, TODAY);
    const byName = Object.fromEntries(result.rows.map(r => [r.worker.name, r.cells]));

    assert.deepEqual(result.items.map(i => i.label), ["SCTR", "Vida Ley"]);
    assert.deepEqual(result.rows.map(r => r.worker.name), ["Ana", "Carlos"]);
    assert.equal(byName.Carlos[0].status, "due");
    assert.equal(byName.Carlos[0].days, 20);
    assert.equal(byName.Carlos[1].status, "ok");
    assert.equal(byName.Ana[0].status, "expired");
    assert.equal(byName.Ana[0].days, -34);
    assert.equal(byName.Ana[1].status, "none");
    assert.deepEqual(result.summary, { ok: 1, due: 1, expired: 1, none: 1 });
});

test("insuranceTable: gana la vigencia más lejana y reconoce variantes de Vida Ley", () => {
    const state = {
        workers: [W("w1", "Carlos")],
        insurance: [
            { workerId: "w1", type: "Vida Ley", end: "2025-01-01" },
            { workerId: "w1", type: "vidaley", end: "2027-06-30" },
            { workerId: "w1", type: "EPS", end: "2030-01-01" }               // otro seguro: se ignora
        ]
    };
    const cells = M.insuranceTable(state, TODAY).rows[0].cells;
    assert.equal(cells[1].end, "2027-06-30");
    assert.equal(cells[1].status, "ok");
    assert.equal(cells[0].status, "none");
});

test("insuranceTable: sin datos no falla", () => {
    const result = M.insuranceTable({}, TODAY);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.summary, { ok: 0, due: 0, expired: 0, none: 0 });
});

/* ---------- Cambio 7: capacitaciones, meta vs realizadas ---------- */

const TRAININGS = () => ([
    { workerId: "w1", topic: "Charla de 5 minutos", date: "2026-10-01", status: "Completada" },
    { workerId: "w2", topic: "Charla de 5 minutos", date: "2026-10-01", status: "Completada" },
    { workerId: "w1", topic: " charla de 5 MINUTOS ", date: "2026-10-01", status: "Completada" },   // duplicado de w1
    { workerId: "w1", topic: "Uso de EPP", date: "2026-10-08", status: "Completada" },
    { workerId: "w1", topic: "Trabajo en altura", date: "2026-10-15", status: "Pendiente" },
    { workerId: "w1", topic: "Orden y limpieza", date: "2026-09-24", status: "Completada" },
    { workerId: "w1", topic: "Charla antigua", date: "2025-12-30", status: "Completada" }
]);

test("trainingStats cuenta charlas únicas (fecha + tema), no registros", () => {
    const state = { training: TRAININGS(), goals: { trainingMonthly: 4, trainingYearly: 50 } };
    const r = M.trainingStats(state, "2026-10");
    assert.equal(r.monthDone, 2);          // 7 registros, pero solo 2 charlas completadas en octubre
    assert.equal(r.monthPending, 1);
    assert.equal(r.monthGoal, 4);
    assert.equal(r.monthPct, 50);
    assert.equal(r.yearDone, 3);           // octubre (2) + septiembre (1); 2025 no cuenta
    assert.equal(r.yearPct, 6);
    assert.equal(r.year, "2026");
});

test("trainingStats lista las charlas del mes con sus asistentes, la más reciente primero", () => {
    const r = M.trainingStats({ training: TRAININGS() }, "2026-10");
    assert.deepEqual(r.sessions, [
        { date: "2026-10-08", topic: "Uso de EPP", attendees: 1 },
        { date: "2026-10-01", topic: "Charla de 5 minutos", attendees: 2 }   // w1 repetido cuenta una vez
    ]);
});

test("trainingStats: sin meta el porcentaje es null; mes sin charlas da ceros", () => {
    const r = M.trainingStats({ training: TRAININGS() }, "2026-10");
    assert.equal(r.monthGoal, 0);
    assert.equal(r.monthPct, null);
    assert.equal(r.yearPct, null);
    const empty = M.trainingStats({ training: TRAININGS(), goals: { trainingMonthly: 40 } }, "2026-03");
    assert.equal(empty.monthDone, 0);
    assert.equal(empty.monthPct, 0);
    assert.deepEqual(empty.sessions, []);
    assert.equal(M.trainingStats({}, "2026-10").monthDone, 0);
});

test("trainingStats: una charla con algún asistente completado cuenta como realizada", () => {
    const state = { training: [
        { workerId: "w1", topic: "Charla", date: "2026-10-02", status: "Pendiente" },
        { workerId: "w2", topic: "Charla", date: "2026-10-02", status: "Completada" }
    ] };
    const r = M.trainingStats(state, "2026-10");
    assert.equal(r.monthDone, 1);
    assert.equal(r.monthPending, 0);
    assert.equal(r.sessions[0].attendees, 1);
});

/* ---------- Cambio 8: HPH, HPI y mejoras continuas ---------- */

const FINDINGS = () => ([
    { id: "f1", type: "HPH", date: "2026-10-02", status: "Cerrado" },
    { id: "f2", type: "HPH", date: "2026-10-10", status: "Abierto" },
    { id: "f3", type: "HPH", date: "2026-09-20", status: "Abierto" },     // pendiente de un mes anterior
    { id: "f4", type: "HPI", date: "2026-10-05", status: "Cerrado" },
    { id: "f5", type: "MEJORA", date: "2026-10-07", status: "Abierto" },
    { id: "f6", type: "MEJORA", date: "2026-10-09", status: "Cerrado" },
    { id: "f7", type: "MEJORA", date: "2026-10-20", status: "Cerrado" }
]);

test("findingsStats: observados, levantados y pendientes del mes por tipo", () => {
    const r = M.findingsStats({ findings: FINDINGS() }, "2026-10");
    assert.deepEqual(r.map(x => x.type), ["HPH", "HPI", "MEJORA"]);
    assert.equal(r[2].label, "Mejora continua");
    assert.deepEqual([r[0].observed, r[0].closed, r[0].open, r[0].pct], [2, 1, 1, 50]);
    assert.deepEqual([r[1].observed, r[1].closed, r[1].open, r[1].pct], [1, 1, 0, 100]);
    assert.deepEqual([r[2].observed, r[2].closed, r[2].open, r[2].pct], [3, 2, 1, 67]);
});

test("findingsStats: los pendientes de meses anteriores van en openAllTime, no en el mes", () => {
    const r = M.findingsStats({ findings: FINDINGS() }, "2026-10");
    assert.equal(r[0].openAllTime, 2);     // f2 (octubre) + f3 (septiembre)
    assert.equal(r[1].openAllTime, 0);
    assert.equal(r[2].openAllTime, 1);
    const sept = M.findingsStats({ findings: FINDINGS() }, "2026-09");
    assert.deepEqual([sept[0].observed, sept[0].closed, sept[0].open], [1, 0, 1]);
});

test("findingsStats: mes sin hallazgos o sin datos da ceros y porcentaje null", () => {
    const r = M.findingsStats({ findings: FINDINGS() }, "2026-03");
    r.forEach(x => assert.deepEqual([x.observed, x.closed, x.open, x.pct], [0, 0, 0, null]));
    assert.equal(M.findingsStats({}, "2026-10").length, 3);
});

/* ---------- Cambio 9: inspecciones y sus observaciones ---------- */

const obs = (...statuses) => statuses.map((status, i) => ({ id: "o" + i, text: "obs " + i, status }));

const INSPECTIONS = () => ([
    { id: "i1", date: "2026-10-03", area: "Oficina", inspector: "Cliente", observations: obs("Cerrada", "Cerrada", "Cerrada", "Abierta") },
    { id: "i2", date: "2026-10-10", area: "Taller", observations: obs("Abierta", "Abierta") },
    { id: "i3", date: "2026-10-20", area: "Almacén", observations: [] },
    { id: "i4", date: "2026-09-12", area: "Planta", observations: obs("Cerrada", "Cerrada", "Cerrada", "Abierta", "Abierta") }
]);

test("inspectionsStats: avance por inspección y totales del mes", () => {
    const r = M.inspectionsStats({ inspections: INSPECTIONS() }, "2026-10");
    assert.deepEqual(r.list.map(i => i.area), ["Almacén", "Taller", "Oficina"]);   // más reciente primero
    const byArea = Object.fromEntries(r.list.map(i => [i.area, i]));
    assert.deepEqual([byArea.Oficina.total, byArea.Oficina.closed, byArea.Oficina.open, byArea.Oficina.pct], [4, 3, 1, 75]);
    assert.deepEqual([byArea.Taller.total, byArea.Taller.closed, byArea.Taller.open, byArea.Taller.pct], [2, 0, 2, 0]);
    assert.deepEqual([byArea["Almacén"].total, byArea["Almacén"].pct], [0, null]);   // sin observaciones: no es 0% ni 100%
    assert.deepEqual(r.totals, { inspections: 3, observations: 6, closed: 3, open: 3 });
});

test("inspectionsStats: las abiertas de otros meses cuentan en openAllTime", () => {
    const r = M.inspectionsStats({ inspections: INSPECTIONS() }, "2026-10");
    assert.equal(r.openAllTime, 5);                     // 1 + 2 + 0 + 2
    const empty = M.inspectionsStats({ inspections: INSPECTIONS() }, "2026-03");
    assert.deepEqual(empty.list, []);
    assert.deepEqual(empty.totals, { inspections: 0, observations: 0, closed: 0, open: 0 });
    assert.equal(M.inspectionsStats({}, "2026-10").openAllTime, 0);
});

test("inspectionProgress tolera inspecciones sin lista de observaciones", () => {
    const p = M.inspectionProgress({ id: "x", date: "2026-10-01", area: "Zona" });
    assert.deepEqual([p.total, p.closed, p.open, p.pct], [0, 0, 0, null]);
});

test("splitObservations: una por línea, sin viñetas ni líneas vacías", () => {
    const text = "Orden y limpieza\n- Cables sueltos\r\n   \n• Extintor vencido\n\n* Botiquín incompleto  ";
    assert.deepEqual(M.splitObservations(text), [
        "Orden y limpieza", "Cables sueltos", "Extintor vencido", "Botiquín incompleto"
    ]);
    assert.deepEqual(M.splitObservations(""), []);
    assert.deepEqual(M.splitObservations("  \n \n"), []);
    assert.deepEqual(M.splitObservations(null), []);
});

/* ---------- Cambio 10: asistencia por colaborador ---------- */

test("attendanceByWorker usa el mismo criterio que la página Asistencia", () => {
    const state = {
        workers: [W("w1", "Carlos"), W("w2", "Ana"), W("w3", "Baja", "Inactivo")],
        attendance: [
            { workerId: "w1", date: "2026-10-01", status: "Asistencia" },
            { workerId: "w1", date: "2026-10-02", status: "Inasistencia" },
            { workerId: "w1", date: "2026-10-03", status: "Tardanza" },
            { workerId: "w1", date: "2026-10-04", status: "Descanso" },     // no cuenta como día de trabajo
            { workerId: "w1", date: "2026-09-30", status: "Asistencia" },   // otro mes
            { workerId: "w3", date: "2026-10-01", status: "Asistencia" }    // inactivo
        ]
    };

    const rows = M.attendanceByWorker(state, "2026-10");
    assert.deepEqual(rows.map(r => r.worker.name), ["Ana", "Carlos"]);

    const carlos = rows[1];
    assert.deepEqual(
        [carlos.days, carlos.attendance, carlos.absences, carlos.late, carlos.pct],
        [3, 1, 1, 1, 67]                    // (asistencias + tardanzas) / días de trabajo
    );
    assert.deepEqual([rows[0].days, rows[0].pct], [0, null]);   // sin registros: null, no 0%
});

test("attendanceByWorker: mes sin registros y estado vacío no fallan", () => {
    const state = { workers: [W("w1", "Ana")], attendance: [{ workerId: "w1", date: "2026-10-01", status: "Asistencia" }] };
    assert.equal(M.attendanceByWorker(state, "2026-03")[0].pct, null);
    assert.deepEqual(M.attendanceByWorker({}, "2026-10"), []);
    assert.equal(M.attendanceByWorker(state, "2026-10")[0].pct, 100);
});

/* ---------- Cambio 11: horas trabajadas por mes ---------- */

const HOURS = () => ([
    { id: "h1", month: "2026-09", hours: 12500 },
    { id: "h2", month: "2026-10", hours: 13000 },
    { id: "h3", month: "2025-12", hours: 999 },
    { id: "h4", month: "2026-09", hours: 12600 }      // corrección del mismo mes: gana la última
]);

test("hoursByYear devuelve los 12 meses, con null donde no hay registro", () => {
    const r = M.hoursByYear({ hours: HOURS() }, "2026");
    assert.equal(r.months.length, 12);
    assert.deepEqual(r.months.map(m => m.label).slice(0, 3), ["Ene", "Feb", "Mar"]);
    assert.equal(r.months[0].month, "2026-01");
    assert.equal(r.months[8].hours, 12600);
    assert.equal(r.months[9].hours, 13000);
    assert.equal(r.months[0].hours, null);
    assert.equal(r.months[0].registered, false);
    assert.equal(r.total, 25600);
    assert.equal(r.registeredMonths, 2);
    assert.equal(M.hoursByYear({ hours: HOURS() }, "2025").months[11].hours, 999);
});

test("hoursByYear: sin datos todo es cero y un mes con 0 horas cuenta como registrado", () => {
    const empty = M.hoursByYear({}, "2026");
    assert.deepEqual([empty.total, empty.registeredMonths], [0, 0]);
    const zero = M.hoursByYear({ hours: [{ month: "2026-02", hours: 0 }] }, "2026");
    assert.deepEqual([zero.months[1].registered, zero.months[1].hours, zero.registeredMonths], [true, 0, 1]);
});

test("upsertHours agrega un mes nuevo o corrige uno existente sin mutar la lista original", () => {
    const original = [{ id: "h1", month: "2026-09", hours: 12500 }];
    const added = M.upsertHours(original, "2026-10", "13000", "h2");
    assert.deepEqual(added, [{ id: "h1", month: "2026-09", hours: 12500 }, { id: "h2", month: "2026-10", hours: 13000 }]);
    const fixed = M.upsertHours(original, "2026-09", 12600.5, "ignorado");
    assert.deepEqual(fixed, [{ id: "h1", month: "2026-09", hours: 12600.5 }]);
    assert.equal(original[0].hours, 12500);
    assert.equal(original.length, 1);
    assert.deepEqual(M.upsertHours(undefined, "2026-01", 10, "h9"), [{ id: "h9", month: "2026-01", hours: 10 }]);
});

test("upsertHours rechaza horas o mes inválidos y acepta cero", () => {
    ["", "abc", -5, null, undefined, NaN, Infinity].forEach(bad =>
        assert.equal(M.upsertHours([], "2026-10", bad, "x"), null, String(bad)));
    assert.equal(M.upsertHours([], "", 100, "x"), null);
    assert.equal(M.upsertHours([], "2026-10", 0, "x")[0].hours, 0);
});

/* ---------- Plan Power BI, Cambio 1: cálculos del tablero ---------- */

test("thresholdTone: verde, amarillo, naranja, rojo y sin datos en cada límite", () => {
    assert.equal(M.thresholdTone(100), "good");
    assert.equal(M.thresholdTone(117.4), "good");
    assert.equal(M.thresholdTone(95), "good");
    assert.equal(M.thresholdTone(94.9), "warn");
    assert.equal(M.thresholdTone(85), "warn");
    assert.equal(M.thresholdTone(84.9), "orange");
    assert.equal(M.thresholdTone(70), "orange");
    assert.equal(M.thresholdTone(69.9), "bad");
    assert.equal(M.thresholdTone(0), "bad");
    assert.equal(M.thresholdTone(null), "none");
    assert.equal(M.thresholdTone(undefined), "none");
    assert.equal(M.thresholdTone(NaN), "none");
});

test("ratio: un decimal, null sin base y permite pasar de 100", () => {
    assert.equal(M.ratio(1, 3), 33.3);
    assert.equal(M.ratio(2, 3), 66.7);
    assert.equal(M.ratio(0, 5), 0);
    assert.equal(M.ratio(5, 0), null);
    assert.equal(M.ratio(47, 40), 117.5);
});

test("gaugeGeometry: 0 %, 50 %, 100 %, más de 100 y sin datos", () => {
    const half = M.gaugeGeometry(50);
    assert.equal(half.fraction, 0.5);
    assert.equal(half.track, "M 20 100 A 80 80 0 0 1 180 100");
    assert.equal(half.fill, "M 20 100 A 80 80 0 0 1 100 20");        // termina arriba, al centro

    const full = M.gaugeGeometry(100);
    assert.equal(full.fill, full.track);

    const over = M.gaugeGeometry(117.4);                            // se llena al tope, no se sale
    assert.equal(over.fraction, 1);
    assert.equal(over.fill, full.track);

    assert.equal(M.gaugeGeometry(0).fill, "");
    assert.equal(M.gaugeGeometry(null).fill, "");
    assert.equal(M.gaugeGeometry(-20).fraction, 0);
    assert.equal(M.gaugeGeometry(25, 50, 60, 60).track, "M 10 60 A 50 50 0 0 1 110 60");
});

const BOARD_STATE = () => ({
    workers: [W("w1", "Ana"), W("w2", "Beto")],
    epp: [
        { workerId: "w1", item: "Casco", date: "2026-08-01", renewal: "2027-01-01" },
        { workerId: "w1", item: "Lentes", date: "2026-08-01", renewal: "2027-01-01" }
    ],
    insurance: [
        { workerId: "w1", type: "SCTR", start: "2026-01-01", end: "2027-01-01" },
        { workerId: "w2", type: "SCTR", start: "2025-01-01", end: "2026-09-01" }      // vencido
    ],
    attendance: [
        { workerId: "w1", date: "2026-10-01", status: "Asistencia" },
        { workerId: "w1", date: "2026-10-02", status: "Inasistencia" },
        { workerId: "w2", date: "2026-10-01", status: "Tardanza" },
        { workerId: "w2", date: "2026-10-02", status: "Asistencia" }
    ],
    training: [
        { workerId: "w1", topic: "Charla", date: "2026-10-01", status: "Completada" },
        { workerId: "w1", topic: "Charla 2", date: "2026-10-02", status: "Completada" }
    ],
    goals: { trainingMonthly: 4, trainingYearly: 50 },
    findings: [
        { type: "HPH", date: "2026-10-02", area: "Taller", description: "Cable", status: "Cerrado" },
        { type: "HPH", date: "2026-10-03", area: "taller", description: "Piso", status: "Abierto" },
        { type: "MEJORA", date: "2026-10-04", area: "Planta", description: "Señal", status: "Cerrado" }
    ],
    inspections: [
        { id: "i1", date: "2026-10-03", area: "Oficina", observations: obs("Cerrada", "Abierta", "Abierta") }
    ],
    hours: [{ month: "2026-09", hours: 12500 }, { month: "2026-10", hours: 13000 }]
});

test("kpiGauges: tres grupos con el porcentaje y color de cada indicador", () => {
    const groups = M.kpiGauges(BOARD_STATE(), "2026-10", TODAY);
    assert.deepEqual(groups.map(g => g.key), ["reactive", "proactive", "management"]);
    const by = Object.fromEntries(groups.flatMap(g => g.items).map(i => [i.key, i]));

    assert.equal(by.hph.pct, 50);              // 1 de 2 levantados
    assert.equal(by.hph.tone, "bad");
    assert.equal(by.hph.detail, "1 de 2 del mes");
    assert.equal(by.hpi.pct, null);            // sin HPI este mes
    assert.equal(by.hpi.tone, "none");
    assert.equal(by.hpi.detail, "Sin datos");
    assert.equal(by.training.pct, 50);         // 2 charlas de meta 4
    assert.equal(by.inspections.pct, 33.3);    // 1 de 3 observaciones
    assert.equal(by.attendance.pct, 75);       // (1 asistencia + 1 tardanza + 1 asistencia) / 4 días
    assert.equal(by.epp.pct, 25);              // 2 entregas de 2 colab x 4 equipos = 8
    assert.equal(by.insurance.pct, 25);        // 1 vigente de 4 (SCTR + Vida Ley x 2)
    assert.equal(by.improvements.pct, 100);
    assert.equal(by.improvements.tone, "good");
});

test("kpiGauges: sin datos ni meta no falla y marca sin datos", () => {
    const groups = M.kpiGauges({}, "2026-10", TODAY);
    groups.flatMap(g => g.items).forEach(item => {
        assert.equal(item.pct, null, item.key);
        assert.equal(item.tone, "none", item.key);
    });
    const training = groups[1].items[0];
    assert.equal(training.detail, "Define tu meta");
});

test("kpiGauges: charlas por encima de la meta pasan de 100 %", () => {
    const state = BOARD_STATE();
    state.goals.trainingMonthly = 1;
    const training = M.kpiGauges(state, "2026-10", TODAY)[1].items[0];
    assert.equal(training.pct, 200);
    assert.equal(training.tone, "good");
});

test("kpiTiles: números de las fichas", () => {
    const tiles = Object.fromEntries(M.kpiTiles(BOARD_STATE(), "2026-10").map(t => [t.key, t]));
    assert.equal(tiles.workers.value, 2);
    assert.equal(tiles.hours.value, 25500);
    assert.equal(tiles.hours.sub, "2/12 meses registrados");
    assert.equal(tiles.training.value, 2);
    assert.equal(tiles.training.sub, "Meta: 4");
    assert.equal(tiles.findings.value, 2);
    assert.equal(tiles.findings.sub, "de 3 observados");
    assert.equal(tiles.inspections.value, 1);
    assert.equal(tiles.inspections.sub, "3 observaciones");
    assert.equal(tiles.pending.value, 3);       // 2 observaciones abiertas + 1 hallazgo abierto
    assert.equal(M.kpiTiles({}, "2026-10")[2].sub, "Sin meta definida");
});

test("pendingActions: solo lo abierto, lo más antiguo primero, con días abiertos", () => {
    const state = BOARD_STATE();
    state.findings.push({ type: "HPI", date: "2026-09-20", area: "Almacén", description: "Antiguo", status: "Abierto" });

    const list = M.pendingActions(state, TODAY);
    assert.equal(list.length, 4);                       // 2 observaciones + 2 hallazgos abiertos; lo cerrado no aparece
    assert.equal(list[0].text, "Antiguo");              // el más viejo primero
    assert.equal(list[0].source, "HPI");
    assert.equal(list[0].daysOpen, 15);
    assert.deepEqual(list.map(i => i.date), ["2026-09-20", "2026-10-03", "2026-10-03", "2026-10-03"]);
    assert.ok(list.every(i => i.text !== "Cable" && i.text !== "Señal"));   // cerrados fuera
    assert.equal(list.filter(i => i.source === "Inspección").length, 2);
    assert.equal(M.pendingActions(state, TODAY, 2).length, 2);
    assert.deepEqual(M.pendingActions({}, TODAY), []);
});

test("pendingActions: una fecha futura no da días negativos", () => {
    const state = { findings: [{ type: "HPI", date: "2026-12-01", area: "A", description: "x", status: "Abierto" }] };
    assert.equal(M.pendingActions(state, TODAY)[0].daysOpen, 0);
});

test("pendingByArea agrupa sin importar mayúsculas y ordena por cantidad", () => {
    const rows = M.pendingByArea(BOARD_STATE(), TODAY);
    assert.deepEqual(rows, [{ area: "Oficina", count: 2 }, { area: "taller", count: 1 }]);
    const merged = M.pendingByArea({ findings: [
        { type: "HPH", date: "2026-10-01", area: "Taller", description: "a", status: "Abierto" },
        { type: "HPH", date: "2026-10-02", area: " TALLER ", description: "b", status: "Abierto" }
    ] }, TODAY);
    assert.deepEqual(merged, [{ area: "Taller", count: 2 }]);       // mayúsculas y espacios no separan áreas
    const state = { findings: [{ type: "HPH", date: "2026-10-01", area: "", description: "x", status: "Abierto" }] };
    assert.deepEqual(M.pendingByArea(state, TODAY), [{ area: "Sin área", count: 1 }]);
    assert.deepEqual(M.pendingByArea({}, TODAY), []);
});

test("availableYears junta los años con datos y siempre incluye el actual", () => {
    assert.deepEqual(M.availableYears({}, TODAY), ["2026"]);
    const state = {
        attendance: [{ date: "2024-05-01" }],
        hours: [{ month: "2025-12", hours: 1 }],
        findings: [{ date: "2026-01-01" }, { date: "" }, { date: "basura" }]
    };
    assert.deepEqual(M.availableYears(state, TODAY), ["2024", "2025", "2026"]);
    assert.deepEqual(M.availableYears({ epp: [{ date: "2027-03-01" }] }, TODAY), ["2026", "2027"]);
});


/* ---------- IPERC, incidentes y ficha del trabajador ---------- */

test("riskLevel clasifica Bajo / Medio / Alto según probabilidad x severidad", () => {
    assert.equal(M.riskLevel(1, 1).key, "low");
    assert.equal(M.riskLevel(1, 2).key, "low");
    assert.equal(M.riskLevel(1, 3).key, "medium");   // 3 pts
    assert.equal(M.riskLevel(2, 2).key, "medium");   // 4 pts
    assert.equal(M.riskLevel(2, 3).key, "high");     // 6 pts
    assert.equal(M.riskLevel(3, 3).key, "high");     // 9 pts
    assert.equal(M.riskLevel(3, 3).label, "Alto");
    assert.equal(M.riskLevel("2", "3").score, 6);    // los formularios entregan texto
    assert.equal(M.riskLevel(undefined, 2).key, "none");
});

test("ipercStats cuenta los riesgos por nivel", () => {
    const state = {
        iperc: [
            { probability: 1, severity: 1 },
            { probability: 2, severity: 2 },
            { probability: 3, severity: 3 },
            { probability: 3, severity: 2 }
        ]
    };
    assert.deepEqual(M.ipercStats(state), { low: 1, medium: 1, high: 2, total: 4 });
    assert.deepEqual(M.ipercStats({}), { low: 0, medium: 0, high: 0, total: 0 });
});

test("attendanceSummary ignora los descansos y cuenta tardanzas como asistidas", () => {
    const summary = M.attendanceSummary([
        { status: "Asistencia" },
        { status: "Tardanza" },
        { status: "Inasistencia" },
        { status: "Descanso" }
    ]);
    assert.deepEqual(summary, { days: 3, attendance: 1, absences: 1, late: 1, pct: 67 });
    assert.equal(M.attendanceSummary([]).pct, null);
});

test("workerProfile reúne solo los registros del trabajador y sus alertas", () => {
    const state = {
        workers: [
            { id: "a", name: "Ana" },
            { id: "b", name: "Beto" }
        ],
        epp: [
            { id: "1", workerId: "a", date: "2026-01-01", renewal: "2026-09-01" },
            { id: "2", workerId: "a", date: "2026-03-01", renewal: "2027-03-01" },
            { id: "3", workerId: "b", date: "2026-03-01", renewal: "2026-09-01" }
        ],
        insurance: [{ id: "4", workerId: "a", start: "2026-01-01", end: "2026-10-20" }],
        training: [],
        medical: [{ id: "5", workerId: "a", date: "2025-01-01", expiry: "2026-01-01" }],
        attendance: [{ workerId: "a", date: "2026-10-01", status: "Asistencia" }],
        incidents: [
            { id: "6", workerId: "a", date: "2026-05-01", status: "Pendiente" },
            { id: "7", workerId: "a", date: "2026-06-01", status: "Cerrado" },
            { id: "8", workerId: "b", date: "2026-06-01", status: "Pendiente" }
        ]
    };

    const profile = M.workerProfile(state, "a", TODAY);

    assert.equal(profile.worker.name, "Ana");
    assert.deepEqual(profile.epp.map(item => item.id), ["2", "1"]);   // más reciente primero
    assert.equal(profile.incidents.length, 2);
    assert.deepEqual(profile.alerts, { epp: 1, insurance: 1, medical: 1, incidents: 1 });
    assert.equal(profile.attendanceSummary.pct, 100);
    assert.equal(M.workerProfile(state, "zzz", TODAY), null);
});

test("pendingActions incluye incidentes abiertos y omite los cerrados", () => {
    const state = {
        incidents: [
            { type: "Accidente", status: "Pendiente", description: "Caída", correctiveAction: "Cambiar escalera", area: "Taller", date: "2026-10-01" },
            { type: "Incidente", status: "Cerrado", description: "Casi caída", area: "Taller", date: "2026-10-01" }
        ]
    };
    const items = M.pendingActions(state, TODAY);
    assert.equal(items.length, 1);
    assert.equal(items[0].source, "Accidente");
    assert.equal(items[0].text, "Cambiar escalera");
    assert.equal(items[0].daysOpen, 4);
});


/* ---------- Capacitaciones con nota ---------- */

test("trainingResult: desde 15 aprueba y hasta 14 desaprueba", () => {
    assert.equal(M.trainingResult(20), "Aprobado");
    assert.equal(M.trainingResult("15"), "Aprobado");
    assert.equal(M.trainingResult(14.5), "Desaprobado");
    assert.equal(M.trainingResult(14), "Desaprobado");
    assert.equal(M.trainingResult(0), "Desaprobado");
    assert.equal(M.trainingResult(""), null);          // sin nota
    assert.equal(M.trainingResult(undefined), null);
    assert.equal(M.trainingResult(21), null);          // fuera de la escala 0-20
    assert.equal(M.trainingResult(-1), null);
    assert.equal(M.trainingResult("abc"), null);
});

test("las charlas con alumnos aprobados o desaprobados cuentan como realizadas", () => {
    const state = {
        goals: { trainingMonthly: 2, trainingYearly: 0 },
        training: [
            { workerId: "w1", topic: "Uso de EPP", date: "2026-10-01", status: "Aprobado", grade: 17 },
            { workerId: "w2", topic: "Uso de EPP", date: "2026-10-01", status: "Desaprobado", grade: 12 },
            { workerId: "w1", topic: "Altura", date: "2026-10-02", status: "Programada" }
        ]
    };
    const stats = M.trainingStats(state, "2026-10");
    assert.equal(stats.monthDone, 1);   // "Uso de EPP" es una sola charla; "Altura" aún no se da
    assert.ok(M.isTrainingDone("Aprobado") && M.isTrainingDone("Desaprobado") && M.isTrainingDone("Completada"));
    assert.ok(!M.isTrainingDone("Programada") && !M.isTrainingDone("Pendiente"));
});


/* ---------- Reloj del último evento ---------- */

test("lastEventStats cuenta los días desde el último incidente o accidente", () => {
    const state = {
        incidents: [
            { id: "a1", type: "Accidente", name: "Volcadura vehicular", date: "2026-08-28" },
            { id: "a2", type: "Incidente", name: "Corte en la uña", date: "2026-06-01" }
        ]
    };
    const stats = M.lastEventStats(state, "2026-10-15");
    assert.equal(stats.days, 48);                      // 28/08 → 15/10
    assert.equal(stats.last.title, "Volcadura vehicular");
    assert.equal(stats.total, 2);
    assert.deepEqual(stats.events.map(item => item.title), ["Volcadura vehicular", "Corte en la uña"]);
    assert.equal(stats.events[0].gapBefore, 88);       // días sin eventos antes del último
    assert.equal(stats.events[1].gapBefore, null);     // el más antiguo no tiene anterior
});

test("un evento nuevo reinicia el contador y conserva el anterior en el historial", () => {
    const state = {
        incidents: [
            { id: "a1", type: "Accidente", name: "Volcadura vehicular", date: "2026-08-28" },
            { id: "a2", type: "Incidente", name: "Golpe en el dedo", date: "2026-10-15" }
        ]
    };
    const stats = M.lastEventStats(state, "2026-10-15");
    assert.equal(stats.days, 0);
    assert.equal(stats.last.title, "Golpe en el dedo");
    assert.equal(stats.events[1].title, "Volcadura vehicular");
});

test("lastEventStats sin eventos, con fechas futuras o sin nombre", () => {
    assert.deepEqual(
        { days: M.lastEventStats({}, TODAY).days, last: M.lastEventStats({}, TODAY).last },
        { days: null, last: null }
    );

    const future = M.lastEventStats(
        { incidents: [{ id: "x", type: "Incidente", name: "Futuro", date: "2026-12-01" }] },
        TODAY
    );
    assert.equal(future.last, null);                   // no reinicia el contador

    const unnamed = M.lastEventStats(
        { incidents: [{ id: "y", type: "Accidente", description: "Se cayó una caja", date: "2026-10-01" }] },
        TODAY
    );
    assert.equal(unnamed.last.title, "Se cayó una caja");   // registros anteriores sin nombre
    assert.equal(M.eventTitle({ type: "Accidente" }), "Accidente");
});

test("el mismo día gana el evento registrado después", () => {
    const stats = M.lastEventStats({
        incidents: [
            { id: "k1", type: "Incidente", name: "Primero", date: "2026-10-01" },
            { id: "k2", type: "Incidente", name: "Segundo", date: "2026-10-01" }
        ]
    }, TODAY);
    assert.equal(stats.last.title, "Segundo");
});


/* =========================================================
   NUEVOS MÓDULOS: evidencias, ficha, programa anual,
   investigación, riesgo residual y atención inmediata
   ========================================================= */

/* ---------- Evidencias ---------- */

test("recordFiles une el archivo antiguo y la lista nueva sin duplicar", () => {
    const record = {
        attachment: { id: "a", name: "viejo.pdf" },
        attachments: [{ id: "a", name: "viejo.pdf" }, { id: "b", name: "foto.png" }, null, { name: "sin id" }]
    };
    assert.deepEqual(M.recordFiles(record).map(file => file.id), ["a", "b"]);
    assert.deepEqual(M.recordFiles({}), []);
    assert.deepEqual(M.recordFiles(null), []);
});

test("fileIdsOf encuentra archivos anidados (observaciones y ejecuciones)", () => {
    const inspection = {
        attachments: [{ id: "f1" }],
        observations: [
            { id: "o1", attachments: [{ id: "f2" }, { id: "f3" }] },
            { id: "o2" }
        ]
    };
    const activity = {
        executions: { "01": { date: "2026-01-10", attachments: [{ id: "e1" }] }, "02": { date: "2026-02-10" } }
    };
    assert.deepEqual(M.fileIdsOf(inspection).sort(), ["f1", "f2", "f3"]);
    assert.deepEqual(M.fileIdsOf(activity), ["e1"]);
    assert.deepEqual(M.fileIdsOf({ attachment: { id: "x" } }), ["x"]);
    assert.deepEqual(M.fileIdsOf(undefined), []);
});

/* ---------- Ficha: cumplimiento individual ---------- */

function complianceState(overrides = {}) {
    return Object.assign({
        workers: [{ id: "a", name: "Ana", area: "Taller", role: "Soldador", status: "Activo" }],
        epp: [
            { workerId: "a", item: "Casco", date: "2026-01-01", renewal: "2027-01-01" },
            { workerId: "a", item: "Lentes de seguridad", date: "2026-01-01", renewal: "2027-01-01" },
            { workerId: "a", item: "Visera", date: "2026-01-01" },
            { workerId: "a", item: "Ropa uniforme", date: "2026-01-01", renewal: "2027-01-01" }
        ],
        insurance: [
            { workerId: "a", type: "SCTR", end: "2027-01-01" },
            { workerId: "a", type: "Vida Ley", end: "2027-01-01" }
        ],
        medical: [{ workerId: "a", date: "2026-02-01", result: "Apto", expiry: "2027-02-01" }],
        training: [{ workerId: "a", date: "2026-06-01", status: "Aprobado" }]
    }, overrides);
}

test("workerCompliance da 100% cuando todo está vigente", () => {
    const result = M.workerCompliance(complianceState(), "a", TODAY);
    assert.equal(result.total, 5);   // EPP, SCTR, Vida Ley, EMO, capacitaciones (sin licencia)
    assert.equal(result.pct, 100);
    assert.equal(result.tone, "good");
    assert.ok(result.checks.every(check => check.status === "ok"));
    assert.equal(M.workerCompliance(complianceState(), "zzz", TODAY), null);
});

test("workerCompliance detecta faltantes, vencidos, por vencer y No apto", () => {
    const state = complianceState({
        epp: [{ workerId: "a", item: "Casco", date: "2026-01-01", renewal: "2026-09-01" }],
        insurance: [
            { workerId: "a", type: "SCTR", end: "2026-09-01" },     // registro viejo
            { workerId: "a", type: "SCTR", end: "2026-10-20" }      // renovado: por vencer
        ],
        medical: [{ workerId: "a", date: "2026-02-01", result: "No apto", expiry: "2027-02-01" }],
        training: [{ workerId: "a", date: "2025-01-01", status: "Aprobado" }]   // más de 12 meses
    });
    const byKey = Object.fromEntries(
        M.workerCompliance(state, "a", TODAY).checks.map(check => [check.key, check.status]));
    assert.equal(byKey.epp, "expired");
    assert.equal(byKey.sctr, "due");          // usa el más reciente, no el vencido
    assert.equal(byKey.vidaley, "missing");
    assert.equal(byKey.emo, "fail");
    assert.equal(byKey.training, "missing");
});

test("workerCompliance agrega la licencia solo si el trabajador tiene una", () => {
    const state = complianceState();
    state.workers[0].license = "A-I";
    state.workers[0].licenseExpiry = "2026-09-30";
    const result = M.workerCompliance(state, "a", TODAY);
    assert.equal(result.total, 6);   // ahora también cuenta la licencia
    const license = result.checks.find(check => check.key === "license");
    assert.equal(license.status, "expired");
    assert.equal(result.pct, 83);   // 5 de 6
});

test("workerAreaRecords cruza área sin importar tildes ni mayúsculas, y riesgos por puesto", () => {
    const worker = { id: "a", area: "Almacén", role: "Soldador" };
    const state = {
        inspections: [{ area: "ALMACEN", date: "2026-10-01" }, { area: "Oficina", date: "2026-10-01" }],
        findings: [{ area: "almacén central", date: "2026-09-01" }],
        iperc: [{ area: "Taller", position: "Soldador" }, { area: "Oficina", position: "Secretaria" }]
    };
    const result = M.workerAreaRecords(state, worker);
    assert.equal(result.inspections.length, 1);
    assert.equal(result.findings.length, 1);
    assert.equal(result.risks.length, 1);
    assert.deepEqual(M.workerAreaRecords(state, null), { inspections: [], findings: [], risks: [] });
});

test("workerDocuments reúne solo registros del trabajador que tienen archivos", () => {
    const state = {
        epp: [{ workerId: "a", item: "Casco", date: "2026-01-01", attachment: { id: "1", name: "acta.pdf" } }],
        training: [
            { workerId: "a", topic: "Altura", date: "2026-05-01", attachments: [{ id: "2" }, { id: "3" }] },
            { workerId: "a", topic: "Sin archivo", date: "2026-06-01" },
            { workerId: "b", topic: "Otro", date: "2026-06-01", attachments: [{ id: "4" }] }
        ]
    };
    const docs = M.workerDocuments(state, "a");
    assert.deepEqual(docs.map(doc => doc.module), ["Capacitación", "EPP"]);   // más reciente primero
    assert.equal(docs[0].files.length, 2);
});

/* ---------- Programa anual ---------- */

test("programStats calcula cumplimiento a la fecha, anual y atrasadas", () => {
    const state = {
        program: [
            {
                id: "p1", year: "2026", activity: "Charla", type: "Capacitación",
                months: ["01", "05", "10", "12"],
                executions: { "01": { date: "2026-01-10" } }
            },
            {
                id: "p2", year: "2026", activity: "Simulacro", type: "Simulacro",
                months: ["03"], executions: { "03": { date: "2026-03-15" } }
            },
            { id: "p3", year: "2025", activity: "Otro año", months: ["01"] }
        ]
    };
    const result = M.programStats(state, "2026", TODAY);   // hoy: octubre 2026
    assert.equal(result.activities, 2);
    assert.equal(result.programmed, 5);
    assert.equal(result.executed, 2);
    assert.deepEqual(result.toDate, { programmed: 4, executed: 2, pct: 50 });   // ene, mar, may, oct
    assert.equal(result.annualPct, 40);
    assert.deepEqual(result.overdue.map(item => item.month), ["05"]);   // octubre es el mes en curso
    const cells = result.rows.find(row => row.activity.id === "p1").cells;
    assert.equal(cells[0].status, "done");
    assert.equal(cells[4].status, "overdue");
    assert.equal(cells[9].status, "current");
    assert.equal(cells[11].status, "planned");
    assert.equal(cells[1].status, "none");
    assert.equal(result.byType.find(item => item.type === "Simulacro").pct, 100);
});

test("programStats trata años pasados como cerrados y futuros como sin vencer", () => {
    const state = { program: [{ id: "p", year: "2025", activity: "A", months: ["02", "11"], executions: {} }] };
    const past = M.programStats(state, "2025", TODAY);
    assert.equal(past.toDate.programmed, 2);
    assert.equal(past.overdue.length, 2);    // año cerrado: febrero y noviembre quedaron atrasados
    state.program[0].year = "2027";
    const future = M.programStats(state, "2027", TODAY);
    assert.equal(future.toDate.pct, null);
    assert.equal(future.overdue.length, 0);
    assert.equal(M.programStats({}, "2026", TODAY).annualPct, null);
});

test("programMonths normaliza los meses y descarta valores inválidos", () => {
    assert.deepEqual(M.programMonths({ months: ["3", 1, "01", "13", "x"] }), ["01", "03"]);
    assert.deepEqual(M.programMonths({}), []);
});

/* ---------- Investigación de incidentes ---------- */

test("investigationStatus mide la investigación y detecta acciones vencidas", () => {
    const incident = {
        type: "Accidente",
        time: "10:30",
        location: "Taller",
        investigator: "Comité",
        investigationDate: "2026-10-02",
        immediateConditions: "Guarda retirada",
        basicJob: "Sin procedimiento",
        rootAnalysis: "5 porqués...",
        injuryType: "Corte / herida",
        bodyPart: "Mano",
        lostDays: 0,
        actions: [
            { text: "Instalar guarda", due: "2026-10-01", status: "Pendiente" },
            { text: "Capacitar", due: "2026-10-30", status: "Pendiente" },
            { text: "Señalizar", due: "2026-09-01", status: "Cumplida" }
        ]
    };
    const result = M.investigationStatus(incident, TODAY);
    assert.equal(result.total, 11);
    assert.equal(result.pct, 100);            // lostDays = 0 cuenta como dato registrado
    assert.deepEqual(result.actions, { total: 3, open: 2, done: 1, overdue: 1 });
    assert.equal(result.overdueActions[0].text, "Instalar guarda");
});

test("investigationStatus no pide datos de lesión a un incidente y tolera registros antiguos", () => {
    const old = M.investigationStatus({ type: "Incidente", correctiveAction: "Orden" }, TODAY);
    assert.equal(old.total, 8);
    assert.equal(old.done, 1);                // solo el plan de acción (acción inmediata)
    assert.ok(old.missing.includes("Causas inmediatas"));
    assert.ok(!old.missing.includes("Tipo de lesión"));
    assert.equal(M.investigationStatus(undefined, TODAY).actions.total, 0);
});

/* ---------- IPERC: riesgo residual ---------- */

test("residualRisk compara inicial y residual y marca los significativos", () => {
    const controlled = M.residualRisk({ probability: 3, severity: 3, residualProbability: 1, residualSeverity: 2 });
    assert.equal(controlled.initial.key, "high");
    assert.equal(controlled.residual.key, "low");
    assert.equal(controlled.current.key, "low");
    assert.equal(controlled.reduction, 7);
    assert.equal(controlled.significant, true);    // fue alto al inicio

    const pending = M.residualRisk({ probability: 2, severity: 2, residualProbability: "", residualSeverity: "" });
    assert.equal(pending.residual, null);
    assert.equal(pending.current.key, "medium");   // sin residual manda el inicial
    assert.equal(pending.significant, false);
});

test("ipercResidualStats cuenta residuales, pendientes y nivel vigente sin tocar ipercStats", () => {
    const state = {
        iperc: [
            { probability: 3, severity: 3, residualProbability: 1, residualSeverity: 1 },
            { probability: 3, severity: 2 },
            { probability: 1, severity: 1, residualProbability: "1", residualSeverity: "1" }
        ]
    };
    const stats = M.ipercResidualStats(state);
    assert.equal(stats.total, 3);
    assert.equal(stats.pending, 1);
    assert.equal(stats.low, 2);
    assert.equal(stats.reduced, 1);
    assert.equal(stats.significant, 2);
    assert.deepEqual(stats.current, { low: 2, medium: 0, high: 1 });
    // la función original mantiene su forma exacta
    assert.deepEqual(M.ipercStats(state), { low: 1, medium: 0, high: 2, total: 3 });
});

/* ---------- Atención inmediata ---------- */

test("urgentItems ordena crítico → alto → medio e ignora registros ya renovados", () => {
    const state = {
        workers: [
            { id: "a", name: "Ana", status: "Activo" },
            { id: "z", name: "Inactivo", status: "Inactivo" }
        ],
        insurance: [
            { workerId: "a", type: "SCTR", end: "2026-09-01" },
            { workerId: "a", type: "SCTR", end: "2027-09-01" },        // renovado
            { workerId: "a", type: "Vida Ley", end: "2026-09-30" },    // vencido → crítico
            { workerId: "z", type: "SCTR", end: "2026-01-01" }         // trabajador inactivo
        ],
        epp: [{ workerId: "a", item: "Casco", date: "2026-01-01", renewal: "2026-10-10" }],   // vence en 5 días
        incidents: [{
            type: "Accidente", status: "Pendiente", date: "2026-10-01", name: "Caída",
            actions: [{ text: "Baranda", due: "2026-10-02", status: "Pendiente" }]
        }],
        iperc: [
            { hazard: "Ruido", probability: 3, severity: 3 },
            { hazard: "Controlado", probability: 3, severity: 3, residualProbability: 1, residualSeverity: 1 }
        ],
        inspections: [
            { date: "2026-08-01", area: "Taller", observations: [{ text: "Cables", status: "Abierta" }] },
            { date: "2026-09-20", area: "Oficina", observations: [{ text: "Reciente", status: "Abierta" }] }
        ],
        program: [{ id: "p", year: "2026", activity: "Simulacro", months: ["03"] }]
    };
    const result = M.urgentItems(state, TODAY);
    assert.deepEqual(result.counts, { critical: 2, high: 2, medium: 3 });
    assert.deepEqual(result.items.map(item => item.level),
        ["critical", "critical", "high", "high", "medium", "medium", "medium"]);
    assert.ok(!result.items.some(item => item.title.includes("SCTR")));
    assert.ok(!result.items.some(item => item.title.includes("Inactivo")));
    assert.ok(!result.items.some(item => item.title.includes("Controlado")));
    assert.ok(!result.items.some(item => item.title.includes("Reciente")));   // menos de 30 días
    assert.ok(result.items.every(item => item.page));
    assert.deepEqual(M.urgentItems({}, TODAY), { items: [], counts: { critical: 0, high: 0, medium: 0 }, total: 0 });
});

test("urgentItems no marca como urgente lo que vence en más de 15 días", () => {
    const state = {
        workers: [{ id: "a", name: "Ana", status: "Activo" }],
        medical: [{ workerId: "a", date: "2026-01-01", expiry: "2026-10-25" }]   // 20 días
    };
    assert.equal(M.urgentItems(state, TODAY).total, 0);
    state.medical[0].expiry = "2026-10-15";                                       // 10 días
    assert.equal(M.urgentItems(state, TODAY).items[0].level, "medium");
});

test("programStats: en un año ya cerrado diciembre sin ejecutar queda atrasado", () => {
    const state = { program: [{ id: "p", year: "2025", activity: "A", months: ["12"], executions: {} }] };
    const result = M.programStats(state, "2025", TODAY);
    assert.deepEqual(result.overdue.map(item => item.month), ["12"]);
    assert.equal(result.rows[0].cells[11].status, "overdue");
});
