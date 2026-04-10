/**
 * Analiza el export Odoo "Contacto (res.partner).xlsx" en excel/ o ruta pasada por argv.
 * Uso: node scripts/analyze-contactos-excel.js [ruta.xlsx]
 */
const path = require('path');
const XLSX = require('xlsx');

const file = process.argv[2] || path.join(__dirname, '..', 'excel', 'Contacto (res.partner).xlsx');
const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

const byEmail = new Map();
const byTel = new Map();
const byName = new Map();

for (const r of rows) {
  const n = norm(r['Nombre completo']);
  const e = norm(r['Correo electrónico']);
  const t = digits(r['Teléfono']);
  if (n) byName.set(n, (byName.get(n) || 0) + 1);
  if (e) {
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e).push(r['Nombre completo']);
  }
  if (t.length >= 8) {
    if (!byTel.has(t)) byTel.set(t, []);
    byTel.get(t).push(r['Nombre completo']);
  }
}

console.log('Archivo:', file);
console.log('Filas:', rows.length);
console.log('\n--- Mismo correo, distintos "Nombre completo" (no son la misma persona / buzón compartido) ---');
for (const [em, names] of byEmail) {
  const uniq = [...new Set(names.map((x) => String(x).trim()))];
  if (uniq.length > 1) console.log(em, '=>', uniq);
}

console.log('\n--- Mismo teléfono, distintos nombres (centralita / varios contactos) ---');
for (const [tel, names] of byTel) {
  const uniq = [...new Set(names.map((x) => String(x).trim()))];
  if (uniq.length > 1) console.log(tel, '=>', uniq.slice(0, 5), uniq.length > 5 ? `… (+${uniq.length - 5})` : '');
}

console.log('\n--- Nombre completo repetido exacto (posible duplicado real en Odoo) ---');
for (const [name, c] of byName) {
  if (c > 1) console.log(c, name);
}
