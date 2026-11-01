/* Pure presentation helpers. Storage schemas and technical SST rules stay unchanged. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SSTWorkspace = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    function scopeState(source, area = '') {
        if (!area) return source;
        const matches = value => normalize(value) === normalize(area);
        const workers = (source.workers || []).filter(worker => matches(worker.area));
        const ids = new Set(workers.map(worker => worker.id));
        const scoped = { ...source, workers };
        ['attendance', 'epp', 'insurance', 'training', 'medical'].forEach(key => {
            scoped[key] = (source[key] || []).filter(record => ids.has(record.workerId));
        });
        ['findings', 'inspections', 'incidents', 'iperc'].forEach(key => {
            scoped[key] = (source[key] || []).filter(record => record.area ? matches(record.area) : ids.has(record.workerId));
        });
        // Historical manual totals and corporate plans cannot be attributed to an area.
        scoped.hours = [];
        return scoped;
    }
    function csvCell(value) {
        let text = String(value ?? '');
        if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
        return '"' + text.replaceAll('"', '""') + '"';
    }
    function remapBackupFiles(records, attachments, createId) {
        const ids = new Map(attachments.map(file => [file.id, createId()]));
        const visit = (value, fileMetadata = false) => {
            if (!value || typeof value !== 'object') return value;
            if (Array.isArray(value)) return value.map(item => visit(item, fileMetadata));
            const result = {};
            for (const [key, item] of Object.entries(value)) {
                // File metadata ids and the legacy attachment pointer are the only IDs remapped.
                result[key] = (key === 'attachment' || (key === 'id' && fileMetadata)) && ids.has(item) ? ids.get(item) : visit(item, ['attachment', 'attachments', 'files'].includes(key));
            }
            return result;
        };
        return { state: visit(records), attachments: attachments.map(file => ({ ...file, id: ids.get(file.id) })) };
    }
    function validateBackupRecords(records, defaults) {
        if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('El respaldo no contiene registros válidos.');
        for (const [key, value] of Object.entries(defaults)) {
            if (!Array.isArray(value)) continue;
            const rows = records[key];
            if (!Array.isArray(rows)) throw new Error(`La colección ${key} no es válida.`);
            const ids = new Set();
            for (const row of rows) {
                if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(row.id) || ids.has(row.id)) throw new Error(`La colección ${key} tiene identificadores inválidos o repetidos.`);
                ids.add(row.id);
            }
        }
        const visit = value => {
            if (!value || typeof value !== 'object') return;
            for (const [key, item] of Object.entries(value)) {
                if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('El respaldo contiene una estructura no permitida.');
                if (key === 'id' && (typeof item !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(item))) throw new Error('El respaldo contiene un identificador inválido.');
                visit(item);
            }
        };
        visit(records);
    }
    return { normalize, scopeState, csvCell, remapBackupFiles, validateBackupRecords };
});
