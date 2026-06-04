import * as dbMod from './db.mjs';
const db = await dbMod.getDb();
const out = db.prepare("SELECT data FROM local_contactos");
const rows = [];
while(out.step()) rows.push(out.getAsObject());
out.free();

const norm = s => (s||'').toString().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const garbage = /^[A-Z]\s|^[)\]}\-_,.;:!?¡¿'"`~\\\/—–]|^[A-Z]{1,2}\s[A-Z]/;

function grupoKey(c) {
    if (!c) return '';
    const tipo = c.tipo_ficha || '';
    if (tipo === 'empresa' || c.categoria === 'empresa') {
        if (c.empresa_tabulador && String(c.empresa_tabulador).trim()) return norm(c.empresa_tabulador);
        const nom = (c.nombre || '').trim();
        if (nom && !garbage.test(nom) && nom.length >= 3) return norm(nom);
        return '';
    }
    if (tipo === 'contacto_empresa') {
        const base = (c.empresa_tabulador || c.empresa || '').trim();
        if (!base) return '';
        const nomEmp = norm(c.nombre);
        const keyEmp = norm(base);
        if (nomEmp && nomEmp === keyEmp) return '';
        return keyEmp;
    }
    return '';
}

const grupos = new Map();
for (const r of rows) {
    const c = JSON.parse(r.data);
    const k = grupoKey(c);
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
}
console.log('Total grupos:', grupos.size);
// Buscar especificamente los grupos con key que contengan 'nombre'
for (const [k, list] of grupos) {
    if (k.includes('nombre') || k.includes('omore') || k.includes('ovo ce') || k.includes('ic i')) {
        const ej = list[0];
        console.log('  key=' + k, '| ej.nombre=', JSON.stringify(ej.nombre), '| tipo_ficha=', ej.tipo_ficha, '| tab=', ej.empresa_tabulador);
    }
}
