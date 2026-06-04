const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

const IMG_DIR = __dirname;

// Base de datos SSEPI (33 clientes)
const DB_CLIENTS = [
  { name: "ANGUIPLAST", address: "Libramiento Norte Km. 2, Arandas, JAL", rfc: "ANG101215PG0", contact: "Ing. Compras" },
  { name: "BOLSAS DE LOS ALTOS", address: "Carr. Tepatitlán - Arandas, JAL", rfc: "BAL050101AA1", contact: "Lic. Adquisiciones" },
  { name: "ECOBOLSAS", address: "Parque Industrial León, GTO", rfc: "ECO990202BB2", contact: "Gerente Planta" },
  { name: "BADER TABACHINES", address: "Blvd. J. Clouthier, León, GTO", rfc: "BAD880303CC3", contact: "Mantenimiento" },
  { name: "BODYCOTE", address: "Silao, Guanajuato Puerto Interior", rfc: "BOD770404DD4", contact: "Ing. Proyectos" },
  { name: "COFICAB", address: "Puerto Interior, Silao, GTO", rfc: "COF660505EE5", contact: "Ing. Eléctrico" },
  { name: "CONDUMEX", address: "Silao, GTO", rfc: "CON550606FF6", contact: "Compras" },
  { name: "ECSA", address: "León, GTO", rfc: "ECS440707GG7", contact: "Admin" },
  { name: "EMMSA", address: "León, GTO", rfc: "EMM330808HH8", contact: "Almacén" },
  { name: "EPC 1", address: "SLP", rfc: "EPC220909II9", contact: "Ingeniería" },
  { name: "EPC 2", address: "SLP", rfc: "EPC111010JJ0", contact: "Ingeniería" },
  { name: "FRAENKISCHE", address: "Silao, GTO", rfc: "FRA001111KK1", contact: "Mtto" },
  { name: "GEDNEY", address: "León, GTO", rfc: "GED991212LL2", contact: "Compras" },
  { name: "GRUPO ACERERO", address: "SLP", rfc: "GRU880101MM3", contact: "Planta" },
  { name: "HALL PLANTA 1", address: "Parque Opción, San José Iturbide", rfc: "HAL770202NN4", contact: "Ing. Control" },
  { name: "HIRUTA PLANTA 1", address: "Parque Amistad, Celaya", rfc: "HIR660303OO5", contact: "Mtto" },
  { name: "IK PLASTIC", address: "Parque Stiva, León", rfc: "IKP550404PP6", contact: "Ing. Proc" },
  { name: "IMPRENTA JM", address: "Col. Obregón, León", rfc: "IMP440505QQ7", contact: "Dueño" },
  { name: "JARDÍN LA ALEMANA", address: "León, GTO", rfc: "JAR330606RR8", contact: "Admin" },
  { name: "MAFLOW", address: "Silao, GTO", rfc: "MAF220707SS9", contact: "Ingeniería" },
  { name: "MARQUARDT", address: "Irapuato, GTO", rfc: "MAR110808TT0", contact: "Compras" },
  { name: "MICROONDA", address: "León, GTO", rfc: "MIC000909UU1", contact: "Sistemas" },
  { name: "MR LUCKY", address: "Irapuato, GTO", rfc: "MRL991010VV2", contact: "Campo" },
  { name: "NHK", address: "Celaya, GTO", rfc: "NHK881111WW3", contact: "Mtto" },
  { name: "NISHIKAWA", address: "Silao, GTO", rfc: "NIS771212XX4", contact: "Ing. Prod" },
  { name: "PIELES AZTECA", address: "León, GTO", rfc: "PIE660101YY5", contact: "Almacén" },
  { name: "RONGTAI", address: "León, GTO", rfc: "RON550202ZZ6", contact: "Compras" },
  { name: "SAFE DEMO", address: "Silao, GTO", rfc: "SAF440303A11", contact: "Ingeniería" },
  { name: "SERVIACERO ELECTROFORJADOS", address: "León, GTO", rfc: "SEE330404B22", contact: "Mtto" },
  { name: "SUACERO", address: "SLP", rfc: "SUA220505C33", contact: "Planta" },
  { name: "TQ-1", address: "León, GTO", rfc: "TQ1110606D44", contact: "Admin" },
  { name: "MINO INDUSTRY", address: "León, GTO", rfc: "MIN000707E55", contact: "Ing. Moldes" },
  { name: "CURTIDOS BENGALA", address: "Parque Piel", rfc: "CUR880808F66", contact: "Propietario" }
];

function normalizeText(t) {
  return (t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length, d = [];
  if (!m) return n; if (!n) return m;
  for (let i = 0; i <= m; i++) { d[i] = [i]; }
  for (let j = 0; j <= n; j++) { d[0][j] = j; }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

function similarity(a, b) {
  const s = normalizeText(a), t = normalizeText(b);
  if (!s || !t) return 0;
  const dist = levenshtein(s, t);
  const maxLen = Math.max(s.length, t.length);
  return maxLen === 0 ? 100 : Math.round((1 - dist / maxLen) * 100);
}

function findBestMatch(ocrName) {
  let best = null, bestScore = -1;
  for (let i = 0; i < DB_CLIENTS.length; i++) {
    const sc = similarity(ocrName, DB_CLIENTS[i].name);
    if (sc > bestScore) { bestScore = sc; best = DB_CLIENTS[i]; }
  }
  return { client: best, score: bestScore };
}

function extractNameFromOCR(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  const uiWords = ['contactos', 'clientes', 'ventas', 'compras', 'configuracion', 'dashboard', 'buscar', 'guardar', 'editar', 'crear', 'eliminar', 'acciones', 'filtros', 'agrupar', 'favoritos', 'vista', 'lista', 'kanban', 'formulario', 'ajustes', 'perfil', 'usuario', 'cerrar', 'cancelar', 'enviar', 'actualizar', 'importar', 'exportar', 'imprimir', 'compartir', 'agregar contacto', 'correo electronico', 'telefono', 'direccion', 'calle', 'ciudad', 'estado', 'pais', 'mexico', 'nombre de la empresa', 'puesto de trabajo', 'sitio web', 'idioma', 'etiquetas', 'propiedad', 'contabilidad', 'asignacion de socio', 'notas', 'propiedad 1', 'persona', 'empresa', 'correo', 'electronico', 'rfc no aplica'];

  // Estrategia 1: buscar la línea con MAYOR similitud a cualquier cliente de la BD
  let bestLine = '', bestScore = -1;
  for (const l of lines) {
    if (l.includes('@')) continue;
    const lo = l.toLowerCase();
    if (uiWords.some(u => lo.includes(u))) continue;
    if (/^\d{5,}/.test(l)) continue; // códigos postales
    if (l.length < 3 || l.length > 80) continue;
    for (const c of DB_CLIENTS) {
      const sc = similarity(l, c.name);
      if (sc > bestScore) { bestScore = sc; bestLine = l; }
    }
  }
  if (bestScore >= 30) return bestLine;

  // Estrategia 2: buscar línea con mayúsculas que no sea UI
  for (const l of lines) {
    const lo = l.toLowerCase();
    if (uiWords.some(u => lo.includes(u))) continue;
    if (l.includes('@')) continue;
    if (/^\+?\d/.test(l) && l.length < 20) continue;
    if (l.length < 3 || l.length > 60) continue;
    if (/[A-Z]{2,}/.test(l)) return l;
  }

  // Estrategia 3: primera línea no-UI con longitud razonable
  for (const l of lines) {
    const lo = l.toLowerCase();
    if (uiWords.some(u => lo.includes(u))) continue;
    if (l.length > 2 && l.length < 60 && !l.includes('@')) return l;
  }
  return lines[0] || '';
}

function highlightDiffs(ocr, real) {
  const o = normalizeText(ocr), r = normalizeText(real);
  let html = '', ri = 0;
  for (let i = 0; i < o.length; i++) {
    const ch = o[i];
    let found = false;
    for (let j = ri; j < r.length; j++) {
      if (r[j] === ch) { found = true; ri = j + 1; break; }
    }
    if (found) html += `<span style="color:green">${ch}</span>`;
    else html += `<span style="color:red;font-weight:bold">${ch}</span>`;
  }
  return html;
}

async function main() {
  const files = fs.readdirSync(IMG_DIR)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b));

  console.log(`Found ${files.length} PNG images`);

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`Processing ${i + 1}/${files.length}: ${f}`);
    try {
      const ret = await Tesseract.recognize(path.join(IMG_DIR, f), 'spa+eng', {
        logger: m => { if (m.status === 'recognizing text') process.stdout.write(`\r  ${Math.round(m.progress * 100)}%`); }
      });
      const text = ret.data.text;
      const name = extractNameFromOCR(text);
      const match = findBestMatch(name);
      results.push({ file: f, name, text, match });
      console.log(`  -> "${name}" | Best match: ${match.client ? match.client.name : 'NONE'} (${match.score}%)`);
    } catch (e) {
      console.log(`  -> ERROR: ${e.message}`);
      results.push({ file: f, name: 'ERROR', text: '', match: { client: null, score: 0 } });
    }
  }

  // Generar HTML
  const rows = results.map((r, i) => {
    const sc = r.match.score;
    const barColor = sc >= 90 ? '#1D9E75' : sc >= 70 ? '#ff9800' : '#C42B2B';
    const diffHtml = r.match.client ? highlightDiffs(r.name, r.match.client.name) : '-';
    return `          <tr>
            <td>${i + 1}</td>
            <td><img src="${r.file}" class="t-img" alt="${r.file}"></td>
            <td>${r.name}</td>
            <td><span class="badge" style="background:${barColor};color:#fff">${sc}%</span></td>
            <td style="font-weight:600">${r.match.client ? r.match.client.name : '-'}</td>
            <td style="font-family:monospace;font-size:12px">${diffHtml}</td>
            <td>${r.match.client ? r.match.client.rfc : '-'}</td>
            <td>${r.match.client ? r.match.client.contact : '-'}</td>
            <td>${r.match.client ? r.match.client.address : '-'}</td>
          </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comparacion Clientes OCR vs Base de Datos SSEPI</title>
<style>
  body { font-family: 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
  h2 { font-size: 18px; color: #333; margin-bottom: 10px; }
  .summary { background: #fff; border-radius: 8px; padding: 15px 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 13px; }
  .table-wrap { overflow-x: auto; border: 1px solid #ddd; border-radius: 8px; background: #fff; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f8f9fa; font-weight: 600; color: #555; position: sticky; top: 0; }
  tr:hover td { background: #f8f9fa; }
  .t-img { width: 48px; height: 48px; border-radius: 4px; object-fit: cover; }
  .badge { display: inline-block; min-width: 40px; text-align: center; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .match-high { color: #1D9E75; }
  .match-med { color: #ff9800; }
  .match-low { color: #C42B2B; }
  .section { margin-bottom: 30px; }
</style>
</head>
<body>

<h2>Comparacion Clientes OCR (Imagenes) vs Base de Datos SSEPI</h2>

<div class="summary">
  <strong>Total imagenes procesadas:</strong> ${results.length} |
  <strong>Clientes BD SSEPI:</strong> ${DB_CLIENTS.length} |
  <span class="match-high">Verde ≥90%</span> |
  <span class="match-med">Naranja 70-89%</span> |
  <span class="match-low">Rojo <70%</span>
</div>

<div class="section">
  <h2>Tabla comparativa completa</h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Imagen</th>
          <th>Nombre OCR (escaneado)</th>
          <th>Similitud</th>
          <th>Cliente real BD</th>
          <th>Diferencias resaltadas</th>
          <th>RFC real</th>
          <th>Contacto real</th>
          <th>Direccion real</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>
</div>

<div class="section">
  <h2>Lista de clientes BD SSEPI (${DB_CLIENTS.length})</h2>
  <div class="table-wrap">
    <table>
      <thead><tr><th>#</th><th>Nombre</th><th>RFC</th><th>Contacto</th><th>Direccion</th></tr></thead>
      <tbody>
${DB_CLIENTS.map((c, i) => `        <tr><td>${i + 1}</td><td>${c.name}</td><td>${c.rfc}</td><td>${c.contact}</td><td>${c.address}</td></tr>`).join('\n')}
      </tbody>
    </table>
  </div>
</div>

</body>
</html>`;

  fs.writeFileSync(path.join(IMG_DIR, 'comparacion_clientes.html'), html, 'utf8');
  console.log('\nDone! Output: comparacion_clientes.html');
}

main().catch(e => console.error(e));
