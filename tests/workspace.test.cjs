const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../workspace-core.js');
test('Área filtra registros relacionados sin cambiar el estado ni atribuir horas manuales', () => {
    const state = { workers: [{ id: 'a', area: 'Operación' }, { id: 'b', area: 'Taller' }], attendance: [{ workerId: 'a' }, { workerId: 'b' }], findings: [{ area: 'OPERACION' }, { area: 'Taller' }], incidents: [{ workerId: 'a' }], hours: [{ total: 100 }], goals: { trainingMonthly: 5 } };
    const copy = JSON.stringify(state), scoped = W.scopeState(state, 'operacion');
    assert.equal(scoped.workers.length, 1); assert.equal(scoped.attendance.length, 1); assert.equal(scoped.findings.length, 1);
    assert.equal(scoped.incidents.length, 1); assert.deepEqual(scoped.hours, []); assert.equal(scoped.goals.trainingMonthly, 5);
    assert.equal(JSON.stringify(state), copy); assert.equal(W.scopeState(state), state);
});
test('CSV neutraliza fórmulas y conserva comillas, saltos y DNI', () => {
    assert.equal(W.csvCell('00123456'), '"00123456"');
    assert.equal(W.csvCell(' =HYPERLINK("x")'), '"\' =HYPERLINK(""x"")"');
    assert.equal(W.csvCell('a\nb'), '"a\nb"');
});
test('Restauración copia archivos con IDs nuevos sin reemplazar ids de registros', () => {
    const original = { workers: [{ id: 'old', name: 'Ana' }], medical: [{ id: 'r', workerId: 'old', attachment: 'old', files: [{ id: 'old', name: 'evidencia.pdf' }] }] };
    const next = W.remapBackupFiles(original, [{ id: 'old', name: 'evidencia.pdf' }], () => 'new');
    assert.equal(next.state.medical[0].id, 'r'); assert.equal(next.state.workers[0].id, 'old');
    assert.equal(next.state.medical[0].workerId, 'old');
    assert.equal(next.state.medical[0].attachment, 'new'); assert.equal(next.state.medical[0].files[0].id, 'new');
    assert.equal(original.medical[0].files[0].id, 'old');
});
test('Respaldo rechaza IDs inyectados, duplicados y claves que alteran prototipos', () => {
    const defaults={workers:[],medical:[]};
    assert.doesNotThrow(()=>W.validateBackupRecords({workers:[{id:'w-1',name:'Ana'}],medical:[]},defaults));
    assert.throws(()=>W.validateBackupRecords({workers:[{id:'w" onclick="alert(1)'}],medical:[]},defaults),/identificadores/);
    assert.throws(()=>W.validateBackupRecords({workers:[{id:'same'},{id:'same'}],medical:[]},defaults),/repetidos/);
    assert.throws(()=>W.validateBackupRecords(JSON.parse('{"workers":[],"medical":[],"__proto__":{"admin":true}}'),defaults),/estructura/);
    assert.equal({}.admin,undefined);
});
