/* Shared rules: browser UI, server PDF and regression tests. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SSTSafety = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    const checklist = Object.freeze([
        ['tires', 'Llantas y ruedas', true], ['brakes', 'Frenos de servicio y estacionamiento', true],
        ['lights', 'Luces y señalización', true], ['windows', 'Ventanas y parabrisas', false],
        ['mirrors', 'Espejos', true], ['belts', 'Cinturones de seguridad', true],
        ['extinguisher', 'Extintor: carga y vigencia', true], ['horn', 'Bocina', true],
        ['fluids', 'Niveles de fluidos y fugas', true], ['steering', 'Dirección', true],
        ['reverse', 'Alarma de retroceso', true], ['wipers', 'Limpiaparabrisas', false],
        ['firstaid', 'Botiquín, triángulos y herramientas', false], ['other', 'Otros componentes', false]
    ].map(([id, label, critical]) => Object.freeze({id, label, critical})));
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const plate = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const critical = item => checklist.find(c => c.id === item.id)?.critical || item.critical === true;
    function stats(participants) {
        const total = participants.length;
        const present = participants.filter(p => p.present === true).length;
        return {total, present, absent: total - present, percent: total ? Math.round(present / total * 10000) / 100 : 0};
    }
    function aptitude(payload, defects = []) {
        if (defects.some(d => !d.resolved_at) || payload?.items?.some(i => critical(i) && i.status === 'No conforme')) return 'No apto';
        if (!payload?.items?.length) return 'Sin inspección';
        return payload.items.some(i => i.status === 'No conforme') ? 'Con observaciones' : 'Apto';
    }
    function validate(kind, payload) {
        const need = (value, message) => { if (!String(value || '').trim()) throw new Error(message); };
        if (kind === 'inspection') {
            need(payload.vehicleId, 'Selecciona un vehículo.');
            const items = payload.items || [];
            if (items.length !== checklist.length || new Set(items.map(i => i.id)).size !== checklist.length) throw new Error('Completa todos los componentes sin duplicarlos.');
            for (const c of checklist) {
                const item = items.find(i => i.id === c.id);
                if (!item || !['Conforme', 'No conforme', 'No aplica'].includes(item.status)) throw new Error('Responde cada componente.');
                if (item.status !== 'Conforme') need(item.note, 'Describe la falla o justifica por qué no aplica.');
                if (c.critical && item.status === 'No aplica') throw new Error('Los componentes críticos requieren verificación.');
            }
        } else if (kind === 'talk') {
            for (const key of ['date', 'time', 'topic', 'instructor', 'unit', 'area', 'content']) need(payload[key], 'Completa los datos de la charla, unidad, área y contenido.');
            if (!Number.isInteger(payload.duration) || payload.duration < 5 || payload.duration > 480) throw new Error('La duración debe estar entre 5 y 480 minutos.');
            if (!payload.participants?.length) throw new Error('Selecciona al menos un trabajador convocado.');
            const dnis = new Set();
            for (const p of payload.participants) {
                if (!/^\d{8}$/.test(p.dni) || dnis.has(p.dni)) throw new Error('Cada participante debe tener un DNI válido y único. Corrígelo en Colaboradores.');
                dnis.add(p.dni);
                for (const key of ['id', 'name', 'role', 'area']) need(p[key], 'Completa nombre, cargo y área en Colaboradores.');
                if (typeof p.present !== 'boolean') throw new Error('Registra presentes y ausentes.');
                if (!p.present && (p.signature || p.evidence)) throw new Error('Un ausente no puede tener firma o participación acreditada.');
                if (payload.evidenceRequired && p.present && !p.signature && !p.evidence) throw new Error('Falta evidencia individual de participación.');
            }
        } else throw new Error('Tipo de registro inválido.');
        return payload;
    }
    return Object.freeze({checklist, normalize, plate, critical, stats, aptitude, validate});
});
