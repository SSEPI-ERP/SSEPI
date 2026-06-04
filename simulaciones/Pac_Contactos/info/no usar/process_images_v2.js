const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const Jimp = require('jimp');

const IMG_DIR = __dirname;

// Base de datos SSEPI (33 clientes)
const DB_CLIENTS = [
  { num: 1, name: "ANGUIPLAST", c1: 234, c2: 24.63, c3: 665.05, c4: 6, c5: 750, c6: 1415.05, address: "Libramiento Norte Km. 2, Arandas, JAL", rfc: "ANG101215PG0", contact: "Ing. Compras" },
  { num: 2, name: "BOLSAS DE LOS ALTOS", c1: 226, c2: 23.79, c3: 642.32, c4: 5, c5: 625, c6: 1267.32, address: "Carr. Tepatitlán - Arandas, JAL", rfc: "BAL050101AA1", contact: "Lic. Adquisiciones" },
  { num: 3, name: "ECOBOLSAS", c1: 216, c2: 22.74, c3: 613.89, c4: 5, c5: 625, c6: 1238.89, address: "Parque Industrial León, GTO", rfc: "ECO990202BB2", contact: "Gerente Planta" },
  { num: 4, name: "BADER TABACHINES", c1: 17.2, c2: 1.81, c3: 48.88, c4: 2, c5: 250, c6: 298.88, address: "Blvd. J. Clouthier, León, GTO", rfc: "BAD880303CC3", contact: "Mantenimiento" },
  { num: 5, name: "BODYCOTE", c1: 90.6, c2: 9.54, c3: 257.49, c4: 3, c5: 375, c6: 632.49, address: "Silao, Guanajuato Puerto Interior", rfc: "BOD770404DD4", contact: "Ing. Proyectos" },
  { num: 6, name: "COFICAB", c1: 80, c2: 8.42, c3: 227.37, c4: 3, c5: 375, c6: 602.37, address: "Puerto Interior, Silao, GTO", rfc: "COF660505EE5", contact: "Ing. Eléctrico" },
  { num: 7, name: "CONDUMEX", c1: 90.6, c2: 9.54, c3: 257.49, c4: 3, c5: 375, c6: 632.49, address: "Silao, GTO", rfc: "CON550606FF6", contact: "Compras" },
  { num: 8, name: "ECSA", c1: 32, c2: 3.37, c3: 90.95, c4: 2, c5: 250, c6: 340.95, address: "León, GTO", rfc: "ECS440707GG7", contact: "Admin" },
  { num: 9, name: "EMMSA", c1: 21.6, c2: 2.27, c3: 61.39, c4: 2, c5: 250, c6: 311.39, address: "León, GTO", rfc: "EMM330808HH8", contact: "Almacén" },
  { num: 10, name: "EPC 1", c1: 400, c2: 42.11, c3: 1136.84, c4: 7, c5: 875, c6: 2011.84, address: "SLP", rfc: "EPC220909II9", contact: "Ingeniería" },
  { num: 11, name: "EPC 2", c1: 402, c2: 42.32, c3: 1142.53, c4: 8, c5: 1000, c6: 2142.53, address: "SLP", rfc: "EPC111010JJ0", contact: "Ingeniería" },
  { num: 12, name: "FRAENKISCHE", c1: 79.4, c2: 8.36, c3: 225.66, c4: 3, c5: 375, c6: 600.66, address: "Silao, GTO", rfc: "FRA001111KK1", contact: "Mtto" },
  { num: 13, name: "GEDNEY", c1: 23.6, c2: 2.48, c3: 67.07, c4: 3, c5: 375, c6: 442.07, address: "León, GTO", rfc: "GED991212LL2", contact: "Compras" },
  { num: 14, name: "GRUPO ACERERO", c1: 386, c2: 40.63, c3: 1097.05, c4: 7, c5: 875, c6: 1972.05, address: "SLP", rfc: "GRU880101MM3", contact: "Planta" },
  { num: 15, name: "HALL PLANTA 1", c1: 73.8, c2: 7.77, c3: 209.75, c4: 3, c5: 375, c6: 584.75, address: "Parque Opción, San José Iturbide", rfc: "HAL770202NN4", contact: "Ing. Control" },
  { num: 16, name: "HIRUTA PLANTA 1", c1: 58.4, c2: 6.15, c3: 165.98, c4: 3, c5: 375, c6: 540.98, address: "Parque Amistad, Celaya", rfc: "HIR660303OO5", contact: "Mtto" },
  { num: 17, name: "IK PLASTIC", c1: 61.4, c2: 6.46, c3: 174.51, c4: 3, c5: 375, c6: 549.51, address: "Parque Stiva, León", rfc: "IKP550404PP6", contact: "Ing. Proc" },
  { num: 18, name: "IMPRENTA JM", c1: 16.2, c2: 1.71, c3: 46.04, c4: 2, c5: 250, c6: 296.04, address: "Col. Obregón, León", rfc: "IMP440505QQ7", contact: "Dueño" },
  { num: 19, name: "JARDÍN LA ALEMANA", c1: 12, c2: 1.26, c3: 34.11, c4: 2, c5: 250, c6: 284.11, address: "León, GTO", rfc: "JAR330606RR8", contact: "Admin" },
  { num: 20, name: "MAFLOW", c1: 59.8, c2: 6.29, c3: 169.96, c4: 3, c5: 375, c6: 544.96, address: "Silao, GTO", rfc: "MAF220707SS9", contact: "Ingeniería" },
  { num: 21, name: "MARQUARDT", c1: 125.4, c2: 13.2, c3: 356.4, c4: 4, c5: 500, c6: 856.4, address: "Irapuato, GTO", rfc: "MAR110808TT0", contact: "Compras" },
  { num: 22, name: "MICROONDA", c1: 41.6, c2: 4.38, c3: 118.23, c4: 3, c5: 375, c6: 493.23, address: "León, GTO", rfc: "MIC000909UU1", contact: "Sistemas" },
  { num: 23, name: "MR LUCKY", c1: 157, c2: 16.53, c3: 446.21, c4: 4, c5: 500, c6: 946.21, address: "Irapuato, GTO", rfc: "MRL991010VV2", contact: "Campo" },
  { num: 24, name: "NHK", c1: 138.6, c2: 14.59, c3: 393.92, c4: 4, c5: 500, c6: 893.92, address: "Celaya, GTO", rfc: "NHK881111WW3", contact: "Mtto" },
  { num: 25, name: "NISHIKAWA", c1: 61, c2: 6.42, c3: 173.37, c4: 3, c5: 375, c6: 548.37, address: "Silao, GTO", rfc: "NIS771212XX4", contact: "Ing. Prod" },
  { num: 26, name: "PIELES AZTECA", c1: 5, c2: 0.53, c3: 14.21, c4: 1, c5: 125, c6: 139.21, address: "León, GTO", rfc: "PIE660101YY5", contact: "Almacén" },
  { num: 27, name: "RONGTAI", c1: 28.2, c2: 2.97, c3: 80.15, c4: 3, c5: 375, c6: 455.15, address: "León, GTO", rfc: "RON550202ZZ6", contact: "Compras" },
  { num: 28, name: "SAFE DEMO", c1: 61.6, c2: 6.48, c3: 175.07, c4: 3, c5: 375, c6: 550.07, address: "Silao, GTO", rfc: "SAF440303A11", contact: "Ingeniería" },
  { num: 29, name: "SERVIACERO ELECTROFORJADOS", c1: 14.6, c2: 1.54, c3: 41.49, c4: 2, c5: 250, c6: 291.49, address: "León, GTO", rfc: "SEE330404B22", contact: "Mtto" },
  { num: 30, name: "SUACERO", c1: 392, c2: 41.26, c3: 1114.11, c4: 8, c5: 1000, c6: 2114.11, address: "SLP", rfc: "SUA220505C33", contact: "Planta" },
  { num: 31, name: "TQ-1", c1: 26, c2: 2.74, c3: 73.89, c4: 2, c5: 250, c6: 323.89, address: "León, GTO", rfc: "TQ1110606D44", contact: "Admin" },
  { num: 32, name: "MINO INDUSTRY", c1: 29.2, c2: 3.07, c3: 82.99, c4: 2, c5: 250, c6: 332.99, address: "León, GTO", rfc: "MIN000707E55", contact: "Ing. Moldes" },
  { num: 33, name: "CURTIDOS BENGALA", c1: 17.2, c2: 1.81, c3: 44.36, c4: 2, c5: 250, c6: 298.88, address: "Parque Piel", rfc: "CUR880808F66", contact: "Propietario" }
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

  // Palabras UI de Odoo y textos comunes
  const uiWords = ['contactos','clientes','ventas','compras','configuracion','dashboard','buscar','guardar','editar','crear','eliminar','acciones','filtros','agrupar','favoritos','vista','lista','kanban','formulario','ajustes','perfil','usuario','cerrar','cancelar','enviar','actualizar','importar','exportar','imprimir','compartir','agregar contacto','correo electronico','telefono','direccion','calle','ciudad','estado','pais','mexico','nombre de la empresa','puesto de trabajo','sitio web','idioma','etiquetas','propiedad','contabilidad','asignacion de socio','notas','propiedad 1','persona','empresa','correo','electronico','rfc no aplica','ventas y compras','asignacion de','agregar','rfc','sitio','idioma','etiquetas','propiedad','telef','celular','whatsapp','facebook','linkedin','instagram','twitter','youtube','skype','zoom','teams','google','microsoft','apple','amazon','paypal','mercado','libre','ebay','aliexpress','alibaba','shein','temuco','wish','shopify','woocommerce','wordpress','drupal','joomla','magento','prestashop','opencart','zencart','oscommerce','virtuemart','prestashop','moodle','canvas','blackboard','brightspace','d2l','schoology','edmodo','classdojo','remind','seesaw','flipgrid','padlet','nearpod','peardeck','edpuzzle','quizlet','kahoot','quizizz','blooket','gimkit','mentimeter','sli.do','polleverywhere','surveymonkey','typeform','google forms','jotform','wufoo','formstack','123formbuilder','cognito','machform','formdesk','formsite','formassembly','zoho forms','salesforce','hubspot','mailchimp','constant contact','convertkit','aweber','getresponse','activecampaign','campaign monitor','sendinblue','sendgrid','mailgun','postmark','amazon ses','twilio','nexmo','plivo','messagebird','textmagic','eztexting','simpletexting','slicktext','textedly','attentive','postscript','klaviyo','braze',' Iterable','customer.io','drip','convertflow','unbounce','instapage','leadpages','clickfunnels','optimizepress','thrive','elementor','divi','avada','astra','oceanwp','generatepress','neve','kadence','blocksy','colormag','newspaper','schema','genesis','thesis','framework','underscores','bones','sage','bedrock','roots','timber','trellis','flywheel','wp engine','siteground','bluehost','hostgator','dreamhost','inmotion','a2 hosting','greengeeks','cloudways','kinsta','pagely','pressable','pressidium','rocket','nitropack','wp rocket','w3 total cache','wp super cache','autoptimize','shortpixel','imagify','smush','ewww','optimole','tinypng','kraken','imagekit','cloudinary','imgix','fastly','cloudflare','stackpath','keycdn','bunny','cdn77','maxcdn','google cloud','aws','azure','digitalocean','linode','vultr','hetzner','ovh','scaleway','upcloud','packet','equinix','rackspace','softlayer','ibm cloud','oracle cloud','alibaba cloud','tencent cloud','baidu cloud','huawei cloud','jd cloud','ucloud','qingcloud','kingsoft cloud','chinatelecom','chinaunicom','chinamobile'];

  // Nombres personales comunes a filtrar (contactos, no empresas)
  const personNames = ['christian','ramirez','jaziel','lopez','brenda','isela','martinez','morales','eduardo','amezcua','maurico','santiago','aaron','garcia','alma','salcido','elio','cesar','javier','cruz','castro','ivan','gutierrez','laura','elena','ramirez','perez','lulu','palacios','gustavo','nasser','gonzalez','blanca','vanesa','maria','delucia','pedro','pacio','repromeon','uriel','padilla'];

  // Estrategia 1: buscar linea con mayor similitud a cualquier cliente de la BD
  let bestLine = '', bestScore = -1;
  for (const l of lines) {
    const lo = l.toLowerCase();
    if (l.includes('@')) continue;
    if (uiWords.some(u => lo.includes(u))) continue;
    if (personNames.some(n => lo.includes(n))) continue;
    if (/^\d{2,}\b/.test(l)) continue; // empieza con numeros (como "47 Aaron")
    if (l.length < 3 || l.length > 90) continue;
    for (const c of DB_CLIENTS) {
      const sc = similarity(l, c.name);
      if (sc > bestScore) { bestScore = sc; bestLine = l; }
    }
  }
  if (bestScore >= 50) return bestLine;

  // Estrategia 2: buscar linea que parezca nombre de empresa (muchas mayusculas, largo razonable)
  for (const l of lines) {
    const lo = l.toLowerCase();
    if (uiWords.some(u => lo.includes(u))) continue;
    if (personNames.some(n => lo.includes(n))) continue;
    if (l.includes('@')) continue;
    if (/^\d{2,}\b/.test(l)) continue;
    if (/^\+?\d/.test(l) && l.length < 20) continue;
    if (l.length < 4 || l.length > 80) continue;
    // Debe tener al menos 40% de mayusculas
    const upperCount = (l.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
    if (upperCount / l.length < 0.3) continue;
    if (/[A-ZÁÉÍÓÚÑ]{2,}/.test(l)) return l;
  }

  // Estrategia 3: primera linea no-UI con longitud razonable
  for (const l of lines) {
    const lo = l.toLowerCase();
    if (uiWords.some(u => lo.includes(u))) continue;
    if (personNames.some(n => lo.includes(n))) continue;
    if (l.length > 3 && l.length < 80 && !l.includes('@') && !/^\d/.test(l)) return l;
  }
  return lines[0] || '';
}

function highlightDiffs(ocr, real) {
  const o = normalizeText(ocr), r = normalizeText(real);
  if (!o || !r) return '-';
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

async function preprocessImage(inputPath, outputPath) {
  const image = await Jimp.read(inputPath);
  const cropHeight = Math.floor(image.getHeight() * 0.38);
  image.crop(0, 0, image.getWidth(), cropHeight);
  // No invertimos: Tesseract spa+eng maneja texto blanco sobre oscuro bastante bien
  // Aumentamos contraste y escala para mejorar OCR
  image.contrast(0.4);
  image.brightness(0.05);
  // Escalar 1.5x para mejor reconocimiento de fuentes pequenas
  image.scale(1.5);
  await image.writeAsync(outputPath);
  return outputPath;
}

async function main() {
  const files = fs.readdirSync(IMG_DIR)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b));

  console.log(`Found ${files.length} PNG images`);

  const results = [];
  const tmpDir = path.join(IMG_DIR, '_tmp_ocr');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`Processing ${i + 1}/${files.length}: ${f}`);
    try {
      const tmpPath = path.join(tmpDir, `tmp_${i}.png`);
      await preprocessImage(path.join(IMG_DIR, f), tmpPath);

      const ret = await Tesseract.recognize(tmpPath, 'spa+eng', {
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

  // Cleanup tmp
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // Save JSON
  fs.writeFileSync(path.join(IMG_DIR, 'ocr_results.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('\nSaved: ocr_results.json');

  // Generate HTML
  const rows = results.map((r, i) => {
    const sc = r.match.score;
    const barColor = sc >= 90 ? '#1D9E75' : sc >= 70 ? '#ff9800' : '#C42B2B';
    const diffHtml = r.match.client ? highlightDiffs(r.name, r.match.client.name) : '-';
    return `          <tr>
            <td>${i + 1}</td>
            <td><img src="${r.file}" class="t-img" alt="${r.file}"></td>
            <td class="ocr-name">${r.name}</td>
            <td><span class="badge" style="background:${barColor};color:#fff">${sc}%</span></td>
            <td style="font-weight:600">${r.match.client ? r.match.client.name : '-'}</td>
            <td class="diff-cell">${diffHtml}</td>
            <td>${r.match.client ? r.match.client.rfc : '-'}</td>
            <td>${r.match.client ? r.match.client.contact : '-'}</td>
            <td>${r.match.client ? r.match.client.address : '-'}</td>
          </tr>`;
  }).join('\n');

  const dbRows = DB_CLIENTS.map(c => `        <tr><td>${c.num}</td><td>${c.name}</td><td class="num">${c.c1}</td><td class="num">${c.c2}</td><td class="num">${c.c3}</td><td class="num">${c.c4}</td><td class="num">${c.c5}</td><td class="num">${c.c6}</td><td>${c.address}</td><td>${c.rfc}</td><td>${c.contact}</td></tr>`).join('\n');

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
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; vertical-align: middle; }
  th { background: #f8f9fa; font-weight: 600; color: #555; position: sticky; top: 0; }
  tr:hover td { background: #f8f9fa; }
  .t-img { width: 80px; height: 60px; border-radius: 4px; object-fit: cover; cursor: pointer; border: 1px solid #ddd; }
  .badge { display: inline-block; min-width: 40px; text-align: center; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .match-high { color: #1D9E75; }
  .match-med { color: #ff9800; }
  .match-low { color: #C42B2B; }
  .section { margin-bottom: 30px; }
  .ocr-name { font-weight: 600; color: #333; max-width: 200px; word-break: break-word; }
  .diff-cell { font-family: monospace; font-size: 11px; max-width: 280px; word-break: break-all; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .db-table th { white-space: nowrap; }
  .db-table td { white-space: nowrap; }
</style>
</head>
<body>

<h2>Comparacion Clientes OCR (Imagenes) vs Base de Datos SSEPI</h2>

<div class="summary">
  <strong>Total imagenes procesadas:</strong> ${results.length} |
  <strong>Clientes BD SSEPI:</strong> ${DB_CLIENTS.length} |
  <span class="match-high">Verde ≥90%</span> |
  <span class="match-med">Naranja 70–89%</span> |
  <span class="match-low">Rojo <70%</span>
</div>

<div class="section">
  <h2>Tabla comparativa completa (OCR con preprocesamiento: recorte superior + inversión + contraste)</h2>
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
  <h2>Lista de clientes BD SSEPI (${DB_CLIENTS.length}) — Datos completos del sistema V11</h2>
  <div class="table-wrap">
    <table class="db-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Cliente</th>
          <th class="num">Cant</th>
          <th class="num">Tasa</th>
          <th class="num">Parcial</th>
          <th class="num">Uds</th>
          <th class="num">Fijo</th>
          <th class="num">Total</th>
          <th>Direccion</th>
          <th>RFC</th>
          <th>Contacto</th>
        </tr>
      </thead>
      <tbody>
${dbRows}
      </tbody>
    </table>
  </div>
</div>

</body>
</html>`;

  fs.writeFileSync(path.join(IMG_DIR, 'comparacion_clientes.html'), html, 'utf8');
  console.log('Done! Output: comparacion_clientes.html');
}

main().catch(e => console.error(e));
