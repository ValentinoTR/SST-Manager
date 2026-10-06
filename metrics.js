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

            if (record.status === "Completada") {
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
        (state.hours || []).forEach(item => add(item.month));

        return [...years].sort();
    }


    return {
        EPP_CATALOG,
        INSURANCE_CATALOG,
        FINDING_TYPES,
        MONTH_LABELS,
        normalize,
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
