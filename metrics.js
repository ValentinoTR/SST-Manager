/* =========================================================
   SST CONTROL - CÁLCULOS DEL TABLERO
   Funciones puras (sin DOM) para poder probarlas con Node.
   En el navegador quedan disponibles como window.SSTMetrics.
   ========================================================= */

(function (root, factory) {

    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.SSTMetrics = factory();
    }

})(typeof self !== "undefined" ? self : this, function () {

    /* ---------------------------------------------------------
       CATÁLOGOS (aquí puedes agregar más equipos o seguros)
       Se reconocen por palabra clave dentro del texto que
       ya escribes en los formularios de EPP y Seguros.
       --------------------------------------------------------- */

    const EPP_CATALOG = [
        { key: "casco",  label: "Casco",         keywords: ["casco"] },
        { key: "lentes", label: "Lentes",        keywords: ["lente"] },
        { key: "visera", label: "Visera",        keywords: ["visera"] },
        { key: "ropa",   label: "Ropa uniforme", keywords: ["uniforme", "ropa"] }
    ];

    const INSURANCE_CATALOG = [
        { key: "sctr",    label: "SCTR",     keywords: ["sctr"] },
        { key: "vidaley", label: "Vida Ley", keywords: ["vidaley"] }
    ];

    const FINDING_TYPES = [
        { value: "HPH",    label: "HPH" },
        { value: "HPI",    label: "HPI" },
        { value: "MEJORA", label: "Mejora continua" }
    ];

    const INCIDENT_TYPES = [
        { value: "Incidente", label: "Incidente" },
        { value: "Accidente", label: "Accidente" }
    ];

    const INCIDENT_SEVERITIES = ["Leve", "Moderado", "Grave", "Fatal"];

    // Matriz IPERC 3x3: nivel = probabilidad x severidad
    const RISK_PROBABILITY = [
        { value: 1, label: "1 - Baja" },
        { value: 2, label: "2 - Media" },
        { value: 3, label: "3 - Alta" }
    ];

    const RISK_SEVERITY = [
        { value: 1, label: "1 - Ligeramente dañino" },
        { value: 2, label: "2 - Dañino" },
        { value: 3, label: "3 - Extremadamente dañino" }
    ];

    // Capacitaciones con nota (0 a 20): desde 15 se aprueba
    const TRAINING_PASS_GRADE = 15;

    const TRAINING_DONE_STATUSES = ["Completada", "Aprobado", "Desaprobado"];

    const MONTH_LABELS = [
        "Ene", "Feb", "Mar", "Abr", "May", "Jun",
        "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
    ];


    /* ---------------------------------------------------------
       UTILIDADES
       --------------------------------------------------------- */

    function normalize(value) {
        return String(value == null ? "" : value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function compact(value) {
        return normalize(value).replace(/[^a-z0-9]/g, "");
    }

    function matchesKeyword(text, keywords) {
        const value = compact(text);
        return keywords.some(keyword => value.includes(keyword));
    }

    function inMonth(date, month) {
        if (!month || !date) {
            return false;
        }
        return String(date).startsWith(month);
    }

    function yearOf(month) {
        return String(month || "").slice(0, 4);
    }

    function percent(done, goal) {
        return goal > 0 ? Math.round(done / goal * 100) : null;
    }

    function activeWorkers(state) {
        return (state.workers || [])
            .filter(worker => worker.status === "Activo")
            .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
    }

    function latestBy(records, field) {
        return records
            .slice()
            .sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || "")))[0];
    }

    function utcDay(dateString) {
        const [year, month, day] = String(dateString).split("-").map(Number);
        return Date.UTC(year, month - 1, day);
    }

    function daysUntil(dateString, todayString) {
        if (!dateString) {
            return null;
        }
        return Math.round((utcDay(dateString) - utcDay(todayString)) / 86400000);
    }

    // Mismo criterio que usa la app: vencido < 0, por vencer <= 30 días
    function expirationState(dateString, todayString) {

        if (!dateString) {
            return { status: "nodate", text: "Sin fecha", className: "badge-gray", days: null };
        }

        const days = daysUntil(dateString, todayString);

        if (days < 0) {
            return { status: "expired", text: "Vencido", className: "badge-red", days };
        }

        if (days <= 30) {
            return { status: "due", text: "Por vencer", className: "badge-yellow", days };
        }

        return { status: "ok", text: "Vigente", className: "badge-green", days };
    }


    /* ---------------------------------------------------------
       MIGRACIÓN DEL ESTADO GUARDADO
       Completa las colecciones nuevas sin tocar los datos
       que el usuario ya tiene guardados.
       --------------------------------------------------------- */

    function ensureCollections(saved, defaults) {

        if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
            return defaults;
        }

        const result = Object.assign({}, saved);

        Object.keys(defaults).forEach(key => {

            const base = defaults[key];

            if (Array.isArray(base)) {

                if (!Array.isArray(result[key])) {
                    result[key] = base.slice();
                }

            } else if (base && typeof base === "object") {

                const current =
                    result[key] && typeof result[key] === "object" && !Array.isArray(result[key])
                        ? result[key]
                        : {};

                result[key] = Object.assign({}, base, current);

            } else if (result[key] === undefined) {

                result[key] = base;
            }
        });

        return result;
    }


    /* ---------------------------------------------------------
       CUADRO EPP: colaboradores x equipos
       --------------------------------------------------------- */

    function eppMatrix(state, todayString) {

        const summary = { delivered: 0, missing: 0, due: 0, expired: 0 };

        const rows = activeWorkers(state).map(worker => {

            const cells = EPP_CATALOG.map(item => {

                const records = (state.epp || []).filter(record =>
                    record.workerId === worker.id &&
                    matchesKeyword(record.item, item.keywords)
                );

                if (!records.length) {
                    summary.missing += 1;
                    return { key: item.key, status: "none", date: "", renewal: "" };
                }

                const last = latestBy(records, "date");
                let status = "ok";

                if (last.renewal) {
                    status = expirationState(last.renewal, todayString).status;
                    if (status === "nodate") {
                        status = "ok";
                    }
                }

                summary.delivered += 1;

                if (status === "due") {
                    summary.due += 1;
                }

                if (status === "expired") {
                    summary.expired += 1;
                }

                return {
                    key: item.key,
                    status,
                    date: last.date || "",
                    renewal: last.renewal || ""
                };
            });

            return { worker, cells };
        });

        return {
            items: EPP_CATALOG.map(item => ({ key: item.key, label: item.label })),
            rows,
            summary
        };
    }


    /* ---------------------------------------------------------
       CUADRO SEGUROS: SCTR y Vida Ley por colaborador
       --------------------------------------------------------- */

    function insuranceTable(state, todayString) {

        const summary = { ok: 0, due: 0, expired: 0, none: 0 };

        const rows = activeWorkers(state).map(worker => {

            const cells = INSURANCE_CATALOG.map(item => {

                const records = (state.insurance || []).filter(record =>
                    record.workerId === worker.id &&
                    matchesKeyword(record.type, item.keywords)
                );

                if (!records.length) {
                    summary.none += 1;
                    return { key: item.key, status: "none", end: "", days: null };
                }

                const last = latestBy(records, "end");
                const info = expirationState(last.end, todayString);

                summary[info.status === "nodate" ? "none" : info.status] += 1;

                return {
                    key: item.key,
                    status: info.status,
                    end: last.end || "",
                    days: info.days
                };
            });

            return { worker, cells };
        });

        return {
            items: INSURANCE_CATALOG.map(item => ({ key: item.key, label: item.label })),
            rows,
            summary
        };
    }


    /* ---------------------------------------------------------
       CUADRO CAPACITACIONES: charlas realizadas vs meta
       Una charla con varios asistentes = varios registros,
       por eso se cuentan charlas únicas (fecha + tema).
       --------------------------------------------------------- */

    // Resultado según la nota; null si no hay nota válida
    function trainingResult(grade) {

        if (grade === "" || grade === null || grade === undefined) {
            return null;
        }

        const value = Number(grade);

        if (!Number.isFinite(value) || value < 0 || value > 20) {
            return null;
        }

        return value >= TRAINING_PASS_GRADE ? "Aprobado" : "Desaprobado";
    }

    // Una capacitación ya realizada (aprobada o no) cuenta como charla dada
    function isTrainingDone(status) {
        return TRAINING_DONE_STATUSES.includes(status);
    }

    function groupSessions(records) {

        const map = new Map();

        records.forEach(record => {

            const key = String(record.date || "") + "|" + normalize(record.topic);

            if (!map.has(key)) {
                map.set(key, {
                    date: record.date || "",
                    topic: String(record.topic || "").trim(),
                    done: false,
                    attendees: new Set()
                });
            }

            const session = map.get(key);

            if (isTrainingDone(record.status)) {
                session.done = true;
                session.attendees.add(record.workerId);
            }
        });

        return [...map.values()];
    }

    function trainingStats(state, month) {

        const goals = state.goals || {};
        const monthlyGoal = Number(goals.trainingMonthly) || 0;
        const yearlyGoal = Number(goals.trainingYearly) || 0;
        const year = yearOf(month);

        const sessions = groupSessions(state.training || []);

        const monthSessions = sessions.filter(s => inMonth(s.date, month));
        const yearSessions = sessions.filter(s => year && String(s.date).startsWith(year + "-"));

        const monthDone = monthSessions.filter(s => s.done);
        const yearDone = yearSessions.filter(s => s.done);

        return {
            month,
            year,
            monthDone: monthDone.length,
            monthGoal: monthlyGoal,
            monthPct: percent(monthDone.length, monthlyGoal),
            monthPending: monthSessions.length - monthDone.length,
            yearDone: yearDone.length,
            yearGoal: yearlyGoal,
            yearPct: percent(yearDone.length, yearlyGoal),
            sessions: monthDone
                .map(s => ({ date: s.date, topic: s.topic, attendees: s.attendees.size }))
                .sort((a, b) => b.date.localeCompare(a.date))
        };
    }


    /* ---------------------------------------------------------
       CUADRO HPH / HPI / MEJORAS: observados vs levantados
       --------------------------------------------------------- */

    function findingsStats(state, month) {

        const all = state.findings || [];

        return FINDING_TYPES.map(type => {

            const ofType = all.filter(item => item.type === type.value);
            const observed = ofType.filter(item => inMonth(item.date, month));
            const closed = observed.filter(item => item.status === "Cerrado").length;

            return {
                type: type.value,
                label: type.label,
                observed: observed.length,
                closed,
                open: observed.length - closed,
                pct: percent(closed, observed.length),
                openAllTime: ofType.filter(item => item.status !== "Cerrado").length
            };
        });
    }


    /* ---------------------------------------------------------
       CUADRO INSPECCIONES: observaciones abiertas / cerradas
       --------------------------------------------------------- */

    function inspectionProgress(inspection) {

        const observations = inspection.observations || [];
        const total = observations.length;
        const closed = observations.filter(item => item.status === "Cerrada").length;

        return {
            id: inspection.id,
            area: inspection.area,
            inspector: inspection.inspector || "",
            date: inspection.date,
            total,
            closed,
            open: total - closed,
            pct: percent(closed, total)
        };
    }

    function inspectionsStats(state, month) {

        const all = state.inspections || [];

        const list = all
            .filter(item => inMonth(item.date, month))
            .map(inspectionProgress)
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));

        const totals = list.reduce((sum, item) => ({
            inspections: sum.inspections + 1,
            observations: sum.observations + item.total,
            closed: sum.closed + item.closed,
            open: sum.open + item.open
        }), { inspections: 0, observations: 0, closed: 0, open: 0 });

        const openAllTime = all
            .map(inspectionProgress)
            .reduce((sum, item) => sum + item.open, 0);

        return { list, totals, openAllTime };
    }

    function splitObservations(text) {
        return String(text == null ? "" : text)
            .split(/\r?\n/)
            .map(line => line.replace(/^\s*[-•*]\s+/, "").trim())
            .filter(Boolean);
    }


    /* ---------------------------------------------------------
       CUADRO ASISTENCIA: por colaborador en el mes
       Mismo criterio que la página Asistencia.
       --------------------------------------------------------- */

    function attendanceByWorker(state, month) {

        return activeWorkers(state).map(worker => {

            const records = (state.attendance || []).filter(record =>
                record.workerId === worker.id &&
                inMonth(record.date, month)
            );

            const work = records.filter(record => record.status !== "Descanso");
            const attendance = records.filter(record => record.status === "Asistencia").length;
            const absences = records.filter(record => record.status === "Inasistencia").length;
            const late = records.filter(record => record.status === "Tardanza").length;

            return {
                worker,
                days: work.length,
                attendance,
                absences,
                late,
                pct: work.length ? Math.round((attendance + late) / work.length * 100) : null
            };
        });
    }


    /* ---------------------------------------------------------
       CUADRO HORAS TRABAJADAS POR MES
       --------------------------------------------------------- */

    function hoursByYear(state, year) {

        const byMonth = new Map();

        (state.hours || []).forEach(entry => {
            byMonth.set(entry.month, Number(entry.hours) || 0);
        });

        const months = MONTH_LABELS.map((label, index) => {

            const month = `${year}-${String(index + 1).padStart(2, "0")}`;
            const registered = byMonth.has(month);

            return {
                month,
                label,
                registered,
                hours: registered ? byMonth.get(month) : null
            };
        });

        return {
            months,
            total: months.reduce((sum, item) => sum + (item.hours || 0), 0),
            registeredMonths: months.filter(item => item.registered).length
        };
    }

    // Devuelve una lista nueva; null si las horas no son válidas
    function upsertHours(list, month, hours, newId) {

        const value = Number(hours);

        if (!month || hours === "" || hours == null || !Number.isFinite(value) || value < 0) {
            return null;
        }

        const exists = (list || []).some(entry => entry.month === month);

        if (exists) {
            return list.map(entry =>
                entry.month === month ? Object.assign({}, entry, { hours: value }) : entry
            );
        }

        return (list || []).concat([{ id: newId, month, hours: value }]);
    }


    /* ---------------------------------------------------------
       TABLERO ESTILO POWER BI
       Colores por umbral, medidores, fichas y pendientes
       --------------------------------------------------------- */

    // verde >= 95, amarillo 85-94, naranja 70-84, rojo < 70
    function thresholdTone(pct) {

        if (pct === null || pct === undefined || !Number.isFinite(pct)) {
            return "none";
        }

        if (pct >= 95) {
            return "good";
        }

        if (pct >= 85) {
            return "warn";
        }

        if (pct >= 70) {
            return "orange";
        }

        return "bad";
    }

    // Porcentaje con un decimal; null si no hay con qué comparar
    function ratio(done, total) {
        return total > 0 ? Math.round(done / total * 1000) / 10 : null;
    }

    function round2(value) {
        return Math.round(value * 100) / 100;
    }

    // Semicírculo: el relleno se llena hasta el tope aunque pase de 100 %
    function gaugeGeometry(pct, radius, cx, cy) {

        const r = radius || 80;
        const centerX = cx === undefined ? 100 : cx;
        const centerY = cy === undefined ? 100 : cy;

        const fraction =
            pct === null || pct === undefined || !Number.isFinite(pct)
                ? 0
                : Math.max(0, Math.min(pct, 100)) / 100;

        const point = f => {
            const angle = Math.PI * f;
            return [
                round2(centerX - r * Math.cos(angle)),
                round2(centerY - r * Math.sin(angle))
            ];
        };

        const [startX, startY] = point(0);
        const [endX, endY] = point(1);
        const [fillX, fillY] = point(fraction);

        return {
            fraction,
            track: `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`,
            fill: fraction > 0
                ? `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${fillX} ${fillY}`
                : ""
        };
    }

    // Medidores agrupados en reactivos / proactivos / gestión
    function kpiGauges(state, month, todayString) {

        const findings = {};
        findingsStats(state, month).forEach(item => { findings[item.type] = item; });

        const training = trainingStats(state, month);
        const inspections = inspectionsStats(state, month).totals;
        const attendance = attendanceByWorker(state, month);
        const epp = eppMatrix(state, todayString);
        const insurance = insuranceTable(state, todayString).summary;

        const presents = attendance.reduce((sum, row) => sum + row.attendance + row.late, 0);
        const days = attendance.reduce((sum, row) => sum + row.days, 0);

        const eppTotal = epp.rows.length * epp.items.length;
        const insuranceTotal = insurance.ok + insurance.due + insurance.expired + insurance.none;

        const gauge = (key, label, pct, detail) => ({
            key,
            label,
            pct,
            tone: thresholdTone(pct),
            detail: pct === null && !detail ? "Sin datos" : detail
        });

        const byFinding = (key, label, item) => gauge(
            key, label,
            ratio(item.closed, item.observed),
            item.observed ? `${item.closed} de ${item.observed} del mes` : "Sin datos"
        );

        return [
            {
                key: "reactive",
                title: "Indicadores reactivos",
                items: [
                    byFinding("hph", "HPH levantados", findings.HPH),
                    byFinding("hpi", "HPI levantados", findings.HPI)
                ]
            },
            {
                key: "proactive",
                title: "Indicadores proactivos",
                items: [
                    gauge(
                        "training", "Charlas frente a la meta",
                        training.monthGoal ? ratio(training.monthDone, training.monthGoal) : null,
                        training.monthGoal
                            ? `${training.monthDone} de ${training.monthGoal} charlas`
                            : "Define tu meta"
                    ),
                    gauge(
                        "inspections", "Observaciones cerradas",
                        ratio(inspections.closed, inspections.observations),
                        inspections.observations
                            ? `${inspections.closed} de ${inspections.observations} observaciones`
                            : "Sin datos"
                    ),
                    gauge(
                        "attendance", "Asistencia del equipo",
                        ratio(presents, days),
                        days ? `${presents} de ${days} días` : "Sin datos"
                    )
                ]
            },
            {
                key: "management",
                title: "Indicadores de gestión",
                items: [
                    gauge(
                        "epp", "EPP entregado",
                        ratio(epp.summary.delivered, eppTotal),
                        eppTotal ? `${epp.summary.delivered} de ${eppTotal} entregas` : "Sin datos"
                    ),
                    gauge(
                        "insurance", "Seguros sin vencer",
                        ratio(insurance.ok + insurance.due, insuranceTotal),
                        insuranceTotal
                            ? `${insurance.ok + insurance.due} de ${insuranceTotal} seguros`
                            : "Sin datos"
                    ),
                    byFinding("improvements", "Mejoras implementadas", findings.MEJORA)
                ]
            }
        ];
    }

    // Fichas grandes de número
    function kpiTiles(state, month) {

        const year = yearOf(month);
        const training = trainingStats(state, month);
        const findings = findingsStats(state, month);
        const inspections = inspectionsStats(state, month);
        const hours = hoursByYear(state, year);

        const observed = findings.reduce((sum, item) => sum + item.observed, 0);
        const closed = findings.reduce((sum, item) => sum + item.closed, 0);
        const openFindings = findings.reduce((sum, item) => sum + item.openAllTime, 0);

        return [
            { key: "workers", label: "Colaboradores activos", value: activeWorkers(state).length, sub: "Personal registrado" },
            { key: "hours", label: `Horas acumuladas ${year}`, value: hours.total, sub: `${hours.registeredMonths}/12 meses registrados` },
            {
                key: "training", label: "Charlas del mes", value: training.monthDone,
                sub: training.monthGoal ? `Meta: ${training.monthGoal}` : "Sin meta definida"
            },
            { key: "findings", label: "Hallazgos levantados", value: closed, sub: `de ${observed} observados` },
            { key: "inspections", label: "Inspecciones del mes", value: inspections.totals.inspections, sub: `${inspections.totals.observations} observaciones` },
            {
                key: "pending", label: "Pendientes abiertos",
                value: inspections.openAllTime + openFindings,
                sub: "Observaciones y hallazgos"
            }
        ];
    }

    // Observaciones de inspección y hallazgos que siguen abiertos
    function pendingActions(state, todayString, limit) {

        const items = [];

        (state.findings || [])
            .filter(item => item.status !== "Cerrado")
            .forEach(item => {
                const type = FINDING_TYPES.find(entry => entry.value === item.type);
                items.push({
                    source: type ? type.label : String(item.type || "Hallazgo"),
                    kind: "finding",
                    text: String(item.description || ""),
                    area: String(item.area || "").trim(),
                    date: item.date || ""
                });
            });

        (state.incidents || [])
            .filter(item => item.status !== "Cerrado")
            .forEach(item => {
                items.push({
                    source: String(item.type || "Incidente"),
                    kind: "incident",
                    text: String(item.correctiveAction || item.description || ""),
                    area: String(item.area || "").trim(),
                    date: item.date || ""
                });
            });

        (state.inspections || []).forEach(inspection => {
            (inspection.observations || [])
                .filter(item => item.status !== "Cerrada")
                .forEach(item => {
                    items.push({
                        source: "Inspección",
                        kind: "inspection",
                        text: String(item.text || ""),
                        area: String(inspection.area || "").trim(),
                        date: inspection.date || ""
                    });
                });
        });

        items.forEach(item => {
            item.daysOpen = item.date
                ? Math.max(0, -daysUntil(item.date, todayString))
                : 0;
        });

        items.sort((a, b) =>
            String(a.date).localeCompare(String(b.date)) ||
            a.text.localeCompare(b.text, "es")
        );

        return limit ? items.slice(0, limit) : items;
    }

    // Cuántos pendientes tiene cada área (agrupa sin importar mayúsculas)
    function pendingByArea(state, todayString) {

        const map = new Map();

        pendingActions(state, todayString).forEach(item => {

            const label = item.area || "Sin área";
            const key = compact(label) || "sinarea";

            if (!map.has(key)) {
                map.set(key, { area: label, count: 0 });
            }

            map.get(key).count += 1;
        });

        return [...map.values()].sort((a, b) =>
            b.count - a.count || a.area.localeCompare(b.area, "es")
        );
    }

    // Años para el filtro: los que tienen datos más el año actual
    function availableYears(state, todayString) {

        const years = new Set([String(todayString).slice(0, 4)]);

        const add = value => {
            const year = String(value || "").slice(0, 4);
            if (/^\d{4}$/.test(year)) {
                years.add(year);
            }
        };

        (state.attendance || []).forEach(item => add(item.date));
        (state.epp || []).forEach(item => add(item.date));
        (state.insurance || []).forEach(item => add(item.start));
        (state.training || []).forEach(item => add(item.date));
        (state.findings || []).forEach(item => add(item.date));
        (state.inspections || []).forEach(item => add(item.date));
        (state.incidents || []).forEach(item => add(item.date));
        (state.hours || []).forEach(item => add(item.month));

        return [...years].sort();
    }


    /* ---------------------------------------------------------
       IPERC: nivel de riesgo (Bajo / Medio / Alto)
       --------------------------------------------------------- */

    function riskLevel(probability, severity) {

        const score = Number(probability) * Number(severity);

        if (!Number.isFinite(score) || score < 1) {
            return { key: "none", label: "Sin evaluar", icon: "⚪", className: "badge-gray", score: 0 };
        }

        if (score <= 2) {
            return { key: "low", label: "Bajo", icon: "🟢", className: "badge-green", score };
        }

        if (score <= 4) {
            return { key: "medium", label: "Medio", icon: "🟡", className: "badge-yellow", score };
        }

        return { key: "high", label: "Alto", icon: "🔴", className: "badge-red", score };
    }

    function ipercStats(state) {

        const stats = { low: 0, medium: 0, high: 0, total: 0 };

        (state.iperc || []).forEach(item => {
            const level = riskLevel(item.probability, item.severity);
            if (stats[level.key] !== undefined) {
                stats[level.key] += 1;
            }
            stats.total += 1;
        });

        return stats;
    }


    /* ---------------------------------------------------------
       IPERC: riesgo residual (después de aplicar los controles)
       --------------------------------------------------------- */

    const CONTROL_HIERARCHY = [
        { key: "ctrlElimination",    label: "Eliminación" },
        { key: "ctrlSubstitution",   label: "Sustitución" },
        { key: "ctrlEngineering",    label: "Controles de ingeniería" },
        { key: "ctrlAdministrative", label: "Controles administrativos" },
        { key: "ctrlPpe",            label: "EPP" }
    ];

    function residualRisk(item) {

        const initial = riskLevel(item && item.probability, item && item.severity);

        const evaluated =
            Number(item && item.residualProbability) > 0 &&
            Number(item && item.residualSeverity) > 0;

        const residual = evaluated
            ? riskLevel(item.residualProbability, item.residualSeverity)
            : null;

        return {
            initial,
            residual,
            // El que manda hoy: el residual si ya se evaluó
            current: residual || initial,
            reduction: residual ? initial.score - residual.score : null,
            significant: initial.key === "high" || Boolean(residual && residual.key === "high")
        };
    }

    function ipercResidualStats(state) {

        const stats = {
            low: 0, medium: 0, high: 0, pending: 0, significant: 0, reduced: 0, total: 0,
            // Nivel vigente: residual si ya se evaluó, si no el inicial
            current: { low: 0, medium: 0, high: 0 }
        };

        (state.iperc || []).forEach(item => {

            const info = residualRisk(item);

            stats.total += 1;

            if (stats.current[info.current.key] !== undefined) {
                stats.current[info.current.key] += 1;
            }

            if (!info.residual || info.residual.key === "none") {
                stats.pending += 1;
            } else {
                stats[info.residual.key] += 1;
                if (info.reduction > 0) {
                    stats.reduced += 1;
                }
            }

            if (info.significant) {
                stats.significant += 1;
            }
        });

        return stats;
    }


    /* ---------------------------------------------------------
       ÚLTIMO EVENTO: días transcurridos desde el último
       incidente o accidente (sin distinguir el tipo).
       Los eventos con fecha futura no reinician el contador.
       --------------------------------------------------------- */

    function eventTitle(item) {

        const name = String(item.name || "").trim();

        if (name) {
            return name;
        }

        const description = String(item.description || "").trim();

        if (description) {
            return description.length > 60
                ? description.slice(0, 57) + "…"
                : description;
        }

        return String(item.type || "Evento");
    }

    function lastEventStats(state, todayString) {

        const events = (state.incidents || [])
            .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")))
            .sort((a, b) =>
                String(b.date).localeCompare(String(a.date)) ||
                String(b.id || "").localeCompare(String(a.id || "")))
            .map(item => Object.assign({}, item, {
                title: eventTitle(item),
                daysAgo: Math.max(0, -daysUntil(item.date, todayString))
            }));

        // Días sin eventos que hubo antes de cada evento
        events.forEach((item, index) => {
            const older = events[index + 1];
            item.gapBefore = older
                ? Math.max(0, Math.round((utcDay(item.date) - utcDay(older.date)) / 86400000))
                : null;
        });

        const last = events.find(item => item.date <= todayString) || null;

        return {
            total: events.length,
            last,
            days: last ? last.daysAgo : null,
            events
        };
    }


    /* ---------------------------------------------------------
       ASISTENCIA: resumen de una lista de registros
       Mismo criterio que la página Asistencia.
       --------------------------------------------------------- */

    function attendanceSummary(records) {

        const work = records.filter(record => record.status !== "Descanso");
        const attendance = records.filter(record => record.status === "Asistencia").length;
        const absences = records.filter(record => record.status === "Inasistencia").length;
        const late = records.filter(record => record.status === "Tardanza").length;

        return {
            days: work.length,
            attendance,
            absences,
            late,
            pct: work.length ? Math.round((attendance + late) / work.length * 100) : null
        };
    }


    /* ---------------------------------------------------------
       FICHA DEL TRABAJADOR: todo lo registrado a su nombre
       --------------------------------------------------------- */

    function workerProfile(state, workerId, todayString) {

        const worker = (state.workers || []).find(item => item.id === workerId);

        if (!worker) {
            return null;
        }

        const own = list =>
            (state[list] || [])
                .filter(item => item.workerId === workerId)
                .sort((a, b) =>
                    String(b.date || b.start || "").localeCompare(String(a.date || a.start || "")));

        const attendance = own("attendance");
        const incidents = own("incidents");

        return {
            worker,
            epp: own("epp"),
            insurance: own("insurance"),
            training: own("training"),
            medical: own("medical"),
            attendance,
            attendanceSummary: attendanceSummary(attendance),
            incidents,
            alerts: {
                epp: own("epp").filter(item =>
                    ["expired", "due"].includes(expirationState(item.renewal, todayString).status)).length,
                insurance: own("insurance").filter(item =>
                    ["expired", "due"].includes(expirationState(item.end, todayString).status)).length,
                medical: own("medical").filter(item =>
                    ["expired", "due"].includes(expirationState(item.expiry, todayString).status)).length,
                incidents: incidents.filter(item => item.status !== "Cerrado").length
            }
        };
    }


    /* ---------------------------------------------------------
       FICHA: cumplimiento individual del trabajador
       Estados: ok, due (por vencer), expired, missing, fail.
       Cuentan como cumplidos "ok" y "due" (siguen vigentes).
       --------------------------------------------------------- */

    function complianceTone(pct) {
        if (pct === null) {
            return "";
        }
        return pct >= 90 ? "good" : pct >= 70 ? "warn" : "bad";
    }

    function dateState(date, todayString) {
        const info = expirationState(date, todayString);
        return info.status === "nodate" ? "ok" : info.status;
    }

    function workerCompliance(state, workerId, todayString) {

        const worker = (state.workers || []).find(item => item.id === workerId);

        if (!worker) {
            return null;
        }

        const own = list => (state[list] || []).filter(item => item.workerId === workerId);
        const checks = [];

        // EPP básico del catálogo
        const eppStates = EPP_CATALOG.map(item => {
            const records = own("epp").filter(record => matchesKeyword(record.item, item.keywords));
            if (!records.length) {
                return { label: item.label, status: "missing" };
            }
            const last = latestBy(records, "date");
            return { label: item.label, status: last.renewal ? dateState(last.renewal, todayString) : "ok" };
        });
        const eppOf = status => eppStates.filter(item => item.status === status).map(item => item.label);

        checks.push(
            eppOf("expired").length
                ? { key: "epp", label: "EPP básico", status: "expired", detail: "Vencido: " + eppOf("expired").join(", ") }
                : eppOf("missing").length
                    ? { key: "epp", label: "EPP básico", status: "missing", detail: "Falta: " + eppOf("missing").join(", ") }
                    : eppOf("due").length
                        ? { key: "epp", label: "EPP básico", status: "due", detail: "Por renovar: " + eppOf("due").join(", ") }
                        : { key: "epp", label: "EPP básico", status: "ok", detail: "Completo y vigente" }
        );

        // SCTR y Vida Ley
        INSURANCE_CATALOG.forEach(item => {
            const records = own("insurance").filter(record => matchesKeyword(record.type, item.keywords));
            if (!records.length) {
                checks.push({ key: item.key, label: item.label, status: "missing", detail: "No registrado" });
                return;
            }
            const last = latestBy(records, "end");
            const status = dateState(last.end, todayString);
            checks.push({
                key: item.key,
                label: item.label,
                status,
                detail: last.end ? "Vence " + last.end : "Sin fecha de vencimiento"
            });
        });

        // Examen médico ocupacional (el más reciente)
        const medical = own("medical");
        if (!medical.length) {
            checks.push({ key: "emo", label: "Examen médico (EMO)", status: "missing", detail: "No registrado" });
        } else {
            const last = latestBy(medical, "date");
            const result = normalize(last.result);
            checks.push(
                result.startsWith("no apto")
                    ? { key: "emo", label: "Examen médico (EMO)", status: "fail", detail: "Resultado: No apto" }
                    : {
                        key: "emo",
                        label: "Examen médico (EMO)",
                        status: dateState(last.expiry, todayString),
                        detail: (last.result || "Sin resultado") + (last.expiry ? " · vence " + last.expiry : "")
                    }
            );
        }

        // Capacitaciones de los últimos 12 meses
        const yearAgo = String(Number(String(todayString).slice(0, 4)) - 1) + String(todayString).slice(4);
        const training = own("training").filter(item =>
            isTrainingDone(item.status) && String(item.date || "") > yearAgo && String(item.date || "") <= todayString);
        const failed = training.filter(item => item.status === "Desaprobado").length;

        checks.push(
            !training.length
                ? { key: "training", label: "Capacitaciones", status: "missing", detail: "Ninguna en los últimos 12 meses" }
                : {
                    key: "training",
                    label: "Capacitaciones",
                    status: failed ? "due" : "ok",
                    detail: training.length + " en los últimos 12 meses" + (failed ? " · " + failed + " desaprobada(s)" : "")
                }
        );

        // Licencia de conducir (solo si tiene)
        if (worker.license || worker.licenseExpiry) {
            checks.push({
                key: "license",
                label: "Licencia de conducir",
                status: dateState(worker.licenseExpiry, todayString),
                detail: worker.licenseExpiry ? "Vence " + worker.licenseExpiry : "Sin fecha de vencimiento"
            });
        }

        const compliant = checks.filter(item => item.status === "ok" || item.status === "due").length;
        const pct = percent(compliant, checks.length);

        return {
            checks,
            compliant,
            total: checks.length,
            pct,
            tone: complianceTone(pct)
        };
    }

    // Misma área aunque cambien mayúsculas, tildes o se escriba más largo
    function sameArea(a, b) {
        const x = compact(a);
        const y = compact(b);
        return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
    }

    // Inspecciones, hallazgos y riesgos IPERC del área/puesto del trabajador
    function workerAreaRecords(state, worker) {

        if (!worker) {
            return { inspections: [], findings: [], risks: [] };
        }

        const byDate = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));

        return {
            inspections: (state.inspections || []).filter(item => sameArea(item.area, worker.area)).sort(byDate),
            findings: (state.findings || []).filter(item => sameArea(item.area, worker.area)).sort(byDate),
            risks: (state.iperc || []).filter(item =>
                sameArea(item.area, worker.area) || sameArea(item.position, worker.role))
        };
    }

    // Todas las evidencias de los registros del trabajador
    function workerDocuments(state, workerId) {

        const sources = [
            { list: "epp", module: "EPP", title: item => item.item, date: item => item.date },
            { list: "insurance", module: "Seguro", title: item => item.type, date: item => item.start },
            { list: "training", module: "Capacitación", title: item => item.topic, date: item => item.date },
            { list: "medical", module: "Examen médico", title: item => item.type, date: item => item.date },
            { list: "incidents", module: "Incidente / accidente", title: item => eventTitle(item), date: item => item.date }
        ];

        const docs = [];

        sources.forEach(source => {
            (state[source.list] || [])
                .filter(item => item.workerId === workerId)
                .forEach(item => {
                    const files = recordFiles(item);
                    if (files.length) {
                        docs.push({
                            module: source.module,
                            title: String(source.title(item) || ""),
                            date: source.date(item) || "",
                            files
                        });
                    }
                });
        });

        return docs.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }


    /* ---------------------------------------------------------
       INVESTIGACIÓN DE INCIDENTES Y ACCIDENTES
       Qué tan completa está la investigación y cómo va su
       plan de acción (acciones vencidas = fecha límite pasada
       y sin cumplir).
       --------------------------------------------------------- */

    const INJURY_TYPES = [
        "Contusión / golpe",
        "Corte / herida",
        "Fractura",
        "Esguince / torcedura",
        "Quemadura",
        "Lesión ocular",
        "Amputación",
        "Intoxicación",
        "Otra"
    ];

    function filled(value) {
        return value !== undefined && value !== null && String(value).trim() !== "";
    }

    function investigationStatus(incident, todayString) {

        const item = incident || {};
        const isAccident = item.type === "Accidente";
        const actions = Array.isArray(item.actions) ? item.actions : [];

        const checks = [
            { label: "Hora del evento", ok: filled(item.time) },
            { label: "Lugar exacto", ok: filled(item.location) },
            { label: "Investigador / equipo", ok: filled(item.investigator) },
            { label: "Fecha de investigación", ok: filled(item.investigationDate) },
            { label: "Causas inmediatas", ok: filled(item.immediateActs) || filled(item.immediateConditions) },
            { label: "Causas básicas", ok: filled(item.basicPersonal) || filled(item.basicJob) },
            { label: "Análisis de causa raíz", ok: filled(item.rootAnalysis) },
            { label: "Plan de acción", ok: actions.length > 0 || filled(item.correctiveAction) }
        ];

        if (isAccident) {
            checks.push(
                { label: "Tipo de lesión", ok: filled(item.injuryType) },
                { label: "Parte del cuerpo afectada", ok: filled(item.bodyPart) },
                { label: "Días de descanso médico", ok: filled(item.lostDays) }
            );
        }

        const done = checks.filter(check => check.ok).length;

        const overdueActions = actions.filter(action =>
            action.status !== "Cumplida" &&
            filled(action.due) &&
            String(action.due) < String(todayString));

        return {
            pct: percent(done, checks.length),
            done,
            total: checks.length,
            missing: checks.filter(check => !check.ok).map(check => check.label),
            actions: {
                total: actions.length,
                open: actions.filter(action => action.status !== "Cumplida").length,
                done: actions.filter(action => action.status === "Cumplida").length,
                overdue: overdueActions.length
            },
            overdueActions
        };
    }


    /* ---------------------------------------------------------
       PROGRAMA ANUAL SST
       Cada actividad tiene meses programados (P) y ejecuciones
       por mes (E). Cumplimiento a la fecha = ejecutadas /
       programadas hasta el mes actual (incluido).
       --------------------------------------------------------- */

    const PROGRAM_TYPES = [
        "Capacitación",
        "Inspección",
        "Simulacro",
        "Examen médico",
        "Reunión del comité SST",
        "Auditoría",
        "Monitoreo ocupacional",
        "Otro"
    ];

    const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

    function monthKey(value) {
        const number = Number(value);
        return Number.isInteger(number) && number >= 1 && number <= 12
            ? String(number).padStart(2, "0")
            : null;
    }

    function programMonths(activity) {
        const list = Array.isArray(activity && activity.months) ? activity.months : [];
        return [...new Set(list.map(monthKey).filter(Boolean))].sort();
    }

    function programStats(state, year, todayString) {

        const y = Number(year);
        const ty = Number(String(todayString).slice(0, 4));
        const tm = Number(String(todayString).slice(5, 7));

        // Último mes que ya "corresponde" ejecutar en ese año
        const limit = y < ty ? 12 : y > ty ? 0 : tm;

        // Último mes ya terminado (lo programado hasta ahí y sin ejecutar está atrasado)
        const closedThrough = y < ty ? 12 : y > ty ? 0 : tm - 1;

        const activities = (state.program || [])
            .filter(item => String(item.year) === String(year))
            .sort((a, b) =>
                String(a.type || "").localeCompare(String(b.type || ""), "es") ||
                String(a.activity || "").localeCompare(String(b.activity || ""), "es"));

        const byMonth = MONTH_KEYS.map((key, index) => ({
            month: key, label: MONTH_LABELS[index], programmed: 0, executed: 0, pct: null
        }));

        const typeMap = new Map();
        const overdue = [];
        const totals = { programmed: 0, executed: 0, dueProgrammed: 0, dueExecuted: 0 };

        const rows = activities.map(activity => {

            const months = programMonths(activity);
            const executions = activity.executions && typeof activity.executions === "object"
                ? activity.executions
                : {};

            let planned = 0;
            let done = 0;

            const cells = MONTH_KEYS.map((key, index) => {

                const number = index + 1;
                const isPlanned = months.includes(key);
                const execution = executions[key] || null;

                if (!isPlanned) {
                    return { month: key, status: execution ? "extra" : "none", execution };
                }

                planned += 1;
                byMonth[index].programmed += 1;

                if (execution) {
                    done += 1;
                    byMonth[index].executed += 1;
                }

                if (number <= limit) {
                    totals.dueProgrammed += 1;
                    if (execution) {
                        totals.dueExecuted += 1;
                    }
                }

                let status = "planned";

                if (execution) {
                    status = "done";
                } else if (number <= closedThrough) {
                    status = "overdue";
                    overdue.push({
                        id: activity.id,
                        activity: String(activity.activity || ""),
                        type: String(activity.type || ""),
                        area: String(activity.area || ""),
                        responsible: String(activity.responsible || ""),
                        month: key,
                        label: MONTH_LABELS[index]
                    });
                } else if (y === ty && number === tm) {
                    status = "current";
                }

                return { month: key, status, execution };
            });

            totals.programmed += planned;
            totals.executed += done;

            const type = String(activity.type || "Otro");
            if (!typeMap.has(type)) {
                typeMap.set(type, { type, programmed: 0, executed: 0, pct: null });
            }
            typeMap.get(type).programmed += planned;
            typeMap.get(type).executed += done;

            return {
                activity,
                cells,
                programmed: planned,
                executed: done,
                pct: percent(done, planned)
            };
        });

        byMonth.forEach(item => {
            item.pct = percent(item.executed, item.programmed);
        });

        const byType = [...typeMap.values()].map(item =>
            Object.assign(item, { pct: percent(item.executed, item.programmed) }));

        const toDatePct = percent(totals.dueExecuted, totals.dueProgrammed);

        return {
            year: String(year),
            activities: activities.length,
            programmed: totals.programmed,
            executed: totals.executed,
            annualPct: percent(totals.executed, totals.programmed),
            toDate: {
                programmed: totals.dueProgrammed,
                executed: totals.dueExecuted,
                pct: toDatePct
            },
            tone: complianceTone(toDatePct),
            overdue,
            byMonth,
            byType,
            rows
        };
    }


    /* ---------------------------------------------------------
       ATENCIÓN INMEDIATA (dashboard)
       Junta lo urgente de todos los módulos y lo ordena:
       crítico → alto → medio; dentro de cada nivel, lo más
       atrasado primero. Solo usa el registro más reciente de
       cada EPP/seguro/examen para no alertar por renovados.
       --------------------------------------------------------- */

    const URGENT_RANK = { critical: 0, high: 1, medium: 2 };
    const URGENT_SOON_DAYS = 15;
    const URGENT_OPEN_DAYS = 30;

    function urgentItems(state, todayString) {

        const items = [];
        const workers = new Map(activeWorkers(state).map(worker => [worker.id, worker]));

        const add = item => items.push(Object.assign({ rank: URGENT_RANK[item.level] }, item));

        // Último registro por trabajador + nombre (EPP, seguros) o por trabajador (EMO)
        const latestPer = (list, keyOf, dateField) => {
            const map = new Map();
            (state[list] || [])
                .filter(record => workers.has(record.workerId))
                .forEach(record => {
                    const key = record.workerId + "|" + keyOf(record);
                    const current = map.get(key);
                    if (!current || String(record[dateField] || "") > String(current[dateField] || "")) {
                        map.set(key, record);
                    }
                });
            return [...map.values()];
        };

        const expiring = (list, keyOf, dateField, endField, config) => {
            latestPer(list, keyOf, dateField).forEach(record => {
                const days = daysUntil(record[endField], todayString);
                if (days === null || days > URGENT_SOON_DAYS) {
                    return;
                }
                const name = workers.get(record.workerId).name;
                add({
                    level: days < 0 ? config.expiredLevel : "medium",
                    category: config.category,
                    icon: config.icon,
                    page: config.page,
                    title: `${config.label(record)} · ${name}`,
                    detail: days < 0
                        ? `Vencido hace ${-days} día(s)`
                        : days === 0 ? "Vence hoy" : `Vence en ${days} día(s)`,
                    date: record[endField],
                    weight: -days
                });
            });
        };

        expiring("insurance", record => compact(record.type), "end", "end", {
            expiredLevel: "critical", category: "Seguros", icon: "🛡", page: "seguros",
            label: record => String(record.type || "Seguro")
        });

        expiring("epp", record => compact(record.item), "date", "renewal", {
            expiredLevel: "high", category: "EPP", icon: "⛑", page: "epp",
            label: record => String(record.item || "EPP")
        });

        expiring("medical", () => "emo", "date", "expiry", {
            expiredLevel: "high", category: "Exámenes médicos", icon: "❤", page: "examenes",
            label: () => "Examen médico"
        });

        // Incidentes y accidentes sin cerrar + acciones vencidas del plan
        (state.incidents || []).forEach(incident => {

            const age = incident.date ? Math.max(0, -daysUntil(incident.date, todayString)) : 0;

            if (incident.status !== "Cerrado") {
                add({
                    level: incident.type === "Accidente" ? "critical" : "high",
                    category: "Incidentes",
                    icon: "🚨",
                    page: "incidentes",
                    title: `${incident.type || "Evento"} pendiente: ${eventTitle(incident)}`,
                    detail: `Abierto hace ${age} día(s)` +
                        (investigationStatus(incident, todayString).pct < 100
                            ? ` · investigación al ${investigationStatus(incident, todayString).pct}%`
                            : ""),
                    date: incident.date || "",
                    weight: age
                });
            }

            investigationStatus(incident, todayString).overdueActions.forEach(action => {
                const late = Math.max(0, -daysUntil(action.due, todayString));
                add({
                    level: "high",
                    category: "Plan de acción",
                    icon: "⏰",
                    page: "incidentes",
                    title: `Acción vencida: ${String(action.text || "")}`,
                    detail: `${eventTitle(incident)} · ${action.responsible ? action.responsible + " · " : ""}vencida hace ${late} día(s)`,
                    date: action.due,
                    weight: late
                });
            });
        });

        // IPERC: riesgos que siguen en nivel alto
        (state.iperc || []).forEach(item => {
            const info = residualRisk(item);
            if (info.current.key !== "high") {
                return;
            }
            add({
                level: "high",
                category: "IPERC",
                icon: "☢",
                page: "iperc",
                title: `${info.residual ? "Riesgo residual alto" : "Riesgo alto sin residual evaluado"}: ${String(item.hazard || "")}`,
                detail: [item.area, item.risk, info.current.score + " pts"]
                    .map(value => String(value || "").trim())
                    .filter(Boolean)
                    .join(" · "),
                date: "",
                weight: info.current.score
            });
        });

        // Observaciones de inspección abiertas hace más de 30 días
        (state.inspections || []).forEach(inspection => {
            const age = inspection.date ? Math.max(0, -daysUntil(inspection.date, todayString)) : 0;
            if (age <= URGENT_OPEN_DAYS) {
                return;
            }
            (inspection.observations || [])
                .filter(item => item.status !== "Cerrada")
                .forEach(item => {
                    add({
                        level: "medium",
                        category: "Inspecciones",
                        icon: "🔍",
                        page: "inspecciones",
                        title: `Observación abierta: ${String(item.text || "")}`,
                        detail: `${String(inspection.area || "")} · abierta hace ${age} día(s)`,
                        date: inspection.date,
                        weight: age
                    });
                });
        });

        // Programa anual: actividades atrasadas del año en curso
        programStats(state, String(todayString).slice(0, 4), todayString).overdue.forEach(item => {
            add({
                level: "medium",
                category: "Programa anual",
                icon: "📅",
                page: "programa",
                title: `Actividad atrasada: ${item.activity}`,
                detail: `Programada en ${item.label}${item.responsible ? " · " + item.responsible : ""}`,
                date: "",
                weight: 13 - Number(item.month)
            });
        });

        items.sort((a, b) => a.rank - b.rank || b.weight - a.weight || a.title.localeCompare(b.title, "es"));

        const counts = { critical: 0, high: 0, medium: 0 };
        items.forEach(item => {
            counts[item.level] += 1;
        });

        return { items, counts, total: items.length };
    }


    /* ---------------------------------------------------------
       EVIDENCIAS: un registro puede tener el archivo antiguo
       (attachment) y/o una lista de evidencias (attachments).
       --------------------------------------------------------- */

    function isFileMeta(value) {
        return Boolean(value && typeof value === "object" && value.id);
    }

    function recordFiles(record) {

        if (!record || typeof record !== "object") {
            return [];
        }

        const files = [];

        if (isFileMeta(record.attachment)) {
            files.push(record.attachment);
        }

        (Array.isArray(record.attachments) ? record.attachments : [])
            .filter(isFileMeta)
            .forEach(file => {
                if (!files.some(item => item.id === file.id)) {
                    files.push(file);
                }
            });

        return files;
    }

    // Todos los archivos de un registro, incluidos los anidados
    // (observaciones de inspección, ejecuciones del programa, etc.)
    function fileIdsOf(record) {

        const ids = [];
        const seen = new Set();

        const walk = value => {

            if (!value || typeof value !== "object" || seen.has(value)) {
                return;
            }

            seen.add(value);

            if (Array.isArray(value)) {
                value.forEach(walk);
                return;
            }

            recordFiles(value).forEach(file => {
                if (!ids.includes(file.id)) {
                    ids.push(file.id);
                }
            });

            Object.keys(value)
                .filter(key => key !== "attachment" && key !== "attachments")
                .forEach(key => walk(value[key]));
        };

        walk(record);

        return ids;
    }


    return {
        recordFiles,
        fileIdsOf,
        urgentItems,
        CONTROL_HIERARCHY,
        residualRisk,
        ipercResidualStats,
        INJURY_TYPES,
        investigationStatus,
        PROGRAM_TYPES,
        MONTH_KEYS,
        programMonths,
        programStats,
        workerCompliance,
        complianceTone,
        sameArea,
        workerAreaRecords,
        workerDocuments,
        EPP_CATALOG,
        INSURANCE_CATALOG,
        FINDING_TYPES,
        TRAINING_PASS_GRADE,
        trainingResult,
        isTrainingDone,
        INCIDENT_TYPES,
        INCIDENT_SEVERITIES,
        RISK_PROBABILITY,
        RISK_SEVERITY,
        MONTH_LABELS,
        normalize,
        riskLevel,
        ipercStats,
        attendanceSummary,
        workerProfile,
        eventTitle,
        lastEventStats,
        matchesKeyword,
        daysUntil,
        expirationState,
        ensureCollections,
        eppMatrix,
        insuranceTable,
        trainingStats,
        findingsStats,
        inspectionProgress,
        inspectionsStats,
        splitObservations,
        attendanceByWorker,
        hoursByYear,
        upsertHours,
        thresholdTone,
        ratio,
        gaugeGeometry,
        kpiGauges,
        kpiTiles,
        pendingActions,
        pendingByArea,
        availableYears
    };
});
