import { getDb, persistDb, prepareStatement } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC_DIR = 'E:\\SSEPI\\clintes';
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'clientes');
const TABULADOR_PATH = path.join(__dirname, 'data', 'master', 'clientes_tabulador.json');

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.svg', '.webp', '.gif'];

// ================================================================
// UTILIDADES
// ================================================================
function cleanName(filename) {
  let name = filename.replace(/\.[^/.]+$/, '');
  name = name.replace(/\s*\(\d+\)\s*$/, '');
  return name.trim();
}

function safeName(str) {
  return str.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function normalizeKey(str) {
  return str
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bS\.?A\.?(\s*DE\s*C\.?V\.?)?\b/gi, '')
    .replace(/\bS\.?\s*DE\s*R\.?L\.?(\s*DE\s*C\.?V\.?)?\b/gi, '')
    .replace(/\bMEXICO\b/gi, '')
    .replace(/\bPLANTA\s*\d+\b/gi, '')
    .replace(/\bINDUSTRIAL\s*PIPES\b/gi, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function isCompany(name) {
  const upper = name.toUpperCase();
  const companyTerms = ['S.A.', 'S.A DE C.V', 'S.A. DE C.V.', 'S DE RL', 'S. DE R.L.', 'S. A. DE C.V.', 'S.A.DE C.V.', 'S.A. DE C.V', 'S.A', 'S.A.', 'S.A. DE C.V. PLANTA'];
  return companyTerms.some(term => upper.includes(term)) ||
    upper.includes('GRUPO') ||
    upper.includes('INSTITUTO') ||
    upper.includes('CORP') ||
    upper.includes('INDUSTRIAL') ||
    upper.includes('MEXICO') ||
    upper.includes('MÉXICO');
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
}

// ================================================================
// MAPEOS MANUALES: variantes de nombre → nombre canónico
// ================================================================
const NAME_ALIASES = {
  'HIRUTA': 'Hiruta México, S.A. de C.V.',
  'HIRUTA MEXICO': 'Hiruta México, S.A. de C.V.',
  'HALL ALUMINIUM': 'Hall Planta 1 Mexico',
  'HALL': 'Hall Planta 1 Mexico',
  'FRAENKISCHE': 'Fränkische Mexico S.A. de C.V.',
  'FRAENKISCHE INDUSTRIAL PIPES MEXICO': 'Fränkische Mexico S.A. de C.V.',
  'COFICAB': 'Coficab Mexico S.A. de C.V.',
  'MARQUARDT': 'Marquardt Mexico S.A. de C.V.',
  'MARQUARDT MEXICO': 'Marquardt Mexico S.A. de C.V.',
  'MARQ': 'Marquardt Mexico S.A. de C.V.',
  'IK PLASTIC': 'IK Plastic Mexico S.A. de C.V.',
  'IK PLASTIC COMPOUND MEXICO': 'IK Plastic Mexico S.A. de C.V.',
  'NHK': 'NHK Mexico S.A. de C.V.',
  'RONGTAI': 'Rongtai Mexico S.A. de C.V.',
  'NISHIKAWA': 'Nishikawa Mexico S.A. de C.V.',
  'MAFLOW': 'Maflow Mexico S.A. de C.V.',
  'MICROONDA': 'Microonda S.A. de C.V.',
  'MR LUCKY': 'Mr Lucky Mexico S.A. de C.V.',
  'SAFE DEMO': 'Safe Demo Mexico S.A. de C.V.',
  'ELECTROFORJADOS': 'Electroforjados S.A. de C.V.',
  'SERVIACERO ELECTROFORJADOS': 'Electroforjados S.A. de C.V.',
  'SUACERO': 'Suacero S.A. de C.V.',
  'TQ-1': 'TQ-1 Mexico S.A. de C.V.',
  'MINO INDUSTRY': 'Mino Industry Mexico S.A. de C.V.',
  'BOLSAS DE LOS ALTOS': 'Bolsas de los Altos S.A. de C.V.',
  'ECOBOLSAS': 'Ecobolsas del Bajio S.A. de C.V.',
  'BADER': 'Bader Tabachines S.A. de C.V.',
  'BADER TABACHINES': 'Bader Tabachines S.A. de C.V.',
  'BODYCOTE': 'Bodycote Mexico S.A. de C.V.',
  'CONDUMEX': 'Condumex S.A. de C.V.',
  'ECSA': 'ECSA S.A. de C.V.',
  'EMMSA': 'EMMSA S.A. de C.V.',
  'EPC 1': 'EPC Industrial Planta 1',
  'EPC 2': 'EPC Industrial Planta 2',
  'GEDNEY': 'GEDNEY Mexico S.A. de C.V.',
  'GRUPO ACERERO': 'Grupo Acerero S.A. de C.V.',
  'IMPRENTA JM': 'Imprenta JM S.A. de C.V.',
  'JARDIN LA ALEMANA': 'Jardin La Alemana S.A. de C.V.',
  'PIELES AZTECA': 'Pieles Azteca S.A. de C.V.',
  'ANGUIPLAST': 'Anguipalst S.A. de C.V.',
  'ANGUI PALST': 'Anguipalst S.A. de C.V.',
  'FANTASIAS MIGUEL': 'Fantasias Miguel S.A. de C.V.',
  'HORMAS PALACIOS': 'Hormas Palacios, S.A. de C.V.',
  'DOMUM': 'Domum S.A. de C.V.',
  'COMPONENTES DE LEON': 'Componentes de Leon S.A. de C.V.',
  'DMT CORTES UNIVERSALES': 'DMT Cortes Universales S.A. de C.V.',
  'ESTACION DE SERVICIO LAS HUERTAS': 'Estacion de Servicio Las Huertas S.A. de C.V.',
  'HT6 INGENIERIA S DE RL DE CV': 'HT6 Ingenieria S. de R.L. de C.V.',
  'HT6': 'HT6 Ingenieria S. de R.L. de C.V.',
  'DON PULCRO': 'Don Pulcro S.A. de C.V.',
  'CENTRO DE INVESTIGACION EN COMPUTACO APLICADO': 'Centro de Investigacion en Computo Aplicado, S.A. de C.V.',
  'HEBILLAS Y HERRAJES ROBOR': 'Hebillas y Herrajes Robor S.A. de C.V.',
  'GRANOS Y SERVICIOS INTEGRALES': 'Granos y Servicios Integrales, S.A. de C.V.',
  'FAMO ALIMENTOS': 'Famo Alimentos, S.A. de C.V.',
  'DICENTRAL': 'DI-Central Mexico S.A. de C.V.',
  'DI-CENTRAL': 'DI-Central Mexico S.A. de C.V.',
  'HIELO REGIA': 'Hielo Regia S.A. de C.V.',
  'ICEMAN': 'Iceman S.A. de C.V.',
  'INDUSTRIAS FIVAX': 'Industrias Fivax S.A. de C.V.',
  'EUROELECTRICA': 'Euroelectrica S.A. de C.V.',
  'AUTOMATISCHE TECHNIK MEXICO': 'Automatische Technik Mexico S.A. de C.V.',
  'EBAY': 'eBay Mexico S. de R.L. de C.V.',
  'HOME DEPOT MEXICO': 'Home Depot Mexico S.A. de C.V.',
  'DISTRIBUIDORA LIVERPOOL': 'Distribuidora Liverpool S.A. de C.V.',
  'INSTITUTO MEXICANO DEL SEGURO SOCIAL': 'IMSS',
  'EIKI': 'EIKI Mexico S.A. de C.V.',
  'BECERRA': 'Becerra y Asociados S.A. de C.V.',
  'BIG BEN UNIFORMES': 'Big Ben Uniformes S.A. de C.V.',
  'ARCOSA': 'Arcosa Mexico S.A. de C.V.',
  'AG ELECTRONICA': 'AG Electronica S.A. de C.V.',
  'A Y B EUROSERVICIOS': 'A y B Euroservicios S.A. de C.V.',
  'GRUPO AMIGOS DE SAN ANGEL': 'Grupo Amigos de San Angel S.A. de C.V.',
  'GRUPO COMERCIAL CZO CARNAVALLIA': 'Grupo Comercial CZO Carnavallia S.A. de C.V.',
  'GRUPO ZAHONERO': 'Grupo Zahonero S.A. de C.V.',
  'HOSPEDAJE POTOSINO INMOBILIARIA': 'Hospedaje Potosino Inmobiliaria S.A. de C.V.',
  'LA MANERA DE ESTAR SEGURO SEGMA': 'La Manera de Estar Seguro SEG-MA S.A. de C.V.',
  'DEMO TECHNIC': 'Demo Technic, S. de R.L. de C.V.',
  'DEMO TECHNIC LEON': 'Demo Technic, S. de R.L. de C.V. Planta Leon',
};

function resolveCanonicalName(rawName) {
  const upper = rawName.toUpperCase().trim();
  if (NAME_ALIASES[upper]) return NAME_ALIASES[upper];
  // Si no hay alias, usar el nombre original pero limpio
  return toTitleCase(rawName.trim());
}

// ================================================================
// MAIN
// ================================================================
async function main() {
  const db = await getDb();
  const stmtContactos = await prepareStatement(db, 'local_contactos');
  const stmtTab = await prepareStatement(db, 'local_clientes_tabulador');

  // [1] LIMPIAR tablas
  console.log('[Contactos Unificado] Limpiando tablas...');
  db.exec('DELETE FROM local_contactos');
  db.exec('DELETE FROM local_clientes_tabulador');

  // [2] Leer imagenes
  if (!fs.existsSync(SRC_DIR)) {
    console.error('[Contactos Unificado] No existe carpeta:', SRC_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(SRC_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return IMG_EXTS.includes(ext);
  });

  // Agrupar por nombre canónico
  const grupos = new Map(); // canonical -> { rawNames: [], files: [] }
  for (const file of files) {
    const raw = cleanName(file);
    if (!raw || raw.toLowerCase() === 'escaner de imagenes') continue;
    const canonical = resolveCanonicalName(raw);
    if (!grupos.has(canonical)) grupos.set(canonical, { rawNames: new Set(), files: [] });
    grupos.get(canonical).rawNames.add(raw);
    grupos.get(canonical).files.push(file);
  }

  console.log(`[Contactos Unificado] ${files.length} imagenes → ${grupos.size} contactos unicos`);

  // [3] Leer tabulador JSON
  let tabuladorMap = new Map();
  if (fs.existsSync(TABULADOR_PATH)) {
    const tabuladorRaw = JSON.parse(fs.readFileSync(TABULADOR_PATH, 'utf8'));
    const records = tabuladorRaw.records || [];
    for (const rec of records) {
      const nombre = rec.nombre_cliente;
      if (!nombre) continue;
      const key = normalizeKey(nombre);
      tabuladorMap.set(key, rec);
    }
    console.log(`[Contactos Unificado] ${records.length} registros en tabulador JSON`);
  } else {
    console.warn('[Contactos Unificado] No se encontro tabulador JSON:', TABULADOR_PATH);
  }

  // [4] Preparar uploads
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  let insertedContactos = 0;
  let insertedTabulador = 0;
  const contactoIds = new Map();

  // Pre-calcular logos (copiar todos de golpe al final)
  const logoPlan = [];

  for (const [canonical, grupo] of grupos) {
    const isEmpresa = isCompany(canonical) || grupo.files.some(f => isCompany(cleanName(f)));
    const categoria = isEmpresa ? 'empresa' : 'persona';
    const tabKey = normalizeKey(canonical);
    const tabData = tabuladorMap.get(tabKey);

    let logoUrl = '';
    if (grupo.files.length > 0) {
      const sizes = grupo.files.map(f => {
        try { return { file: f, size: fs.statSync(path.join(SRC_DIR, f)).size }; } catch { return null; }
      }).filter(Boolean);
      sizes.sort((a, b) => b.size - a.size);
      const bestFile = sizes[0].file;
      const ext = path.extname(bestFile).toLowerCase();
      const destFileName = safeName(canonical) + ext;
      logoUrl = `/uploads/clientes/${destFileName}`;
      logoPlan.push({ src: path.join(SRC_DIR, bestFile), dest: path.join(UPLOADS_DIR, destFileName) });
    }

    let empresa = '';
    if (isEmpresa) empresa = canonical;
    else if (tabData?.empresa) empresa = tabData.empresa;

    const contacto = {
      nombre: canonical.toUpperCase(),
      empresa: empresa.toUpperCase(),
      tipo: 'client',
      categoria,
      email: tabData?.contacto || '',
      telefono: '',
      rfc: tabData?.rfc || '',
      sitio_web: '',
      logo_url: logoUrl,
      avatar: canonical.charAt(0).toUpperCase(),
      color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
      km: tabData?.km || 0,
      horas_viaje: tabData?.horas_viaje || 0,
      direccion: tabData?.direccion || '',
      contacto: tabData?.contacto || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const result = await stmtContactos.insert(null, contacto);
      contactoIds.set(canonical, result.id);
      insertedContactos++;
      if (insertedContactos % 10 === 0) process.stdout.write('.');
    } catch (e) {
      console.warn(`[Contactos] Error insertando ${canonical}:`, e.message);
      continue;
    }

    if (tabData) {
      try {
        await stmtTab.insert(null, {
          contacto_id: contactoIds.get(canonical),
          nombre_cliente: canonical.toUpperCase(),
          km: tabData.km || 0,
          horas_viaje: tabData.horas_viaje || 0,
          litros: tabData.litros || 0,
          costo_gasolina: tabData.costo_gasolina || 0,
          costo_tecnico: tabData.costo_tecnico || 0,
          total: tabData.total || 0,
          costo_km: tabData.costo_km || 0,
          tarifa_km: tabData.tarifa_km || 0,
          utilidad_factor: tabData.utilidad_factor || 1.4,
          tipo_servicio: tabData.tipo_servicio || 'viajes',
          activo: tabData.activo !== false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        insertedTabulador++;
      } catch (e) {
        console.warn(`[Tabulador] Error insertando ${canonical}:`, e.message);
      }
    }
  }

  // Copiar logos al final
  console.log('\n[Contactos] Copiando logos...');
  for (const plan of logoPlan) {
    try { fs.copyFileSync(plan.src, plan.dest); } catch (e) { /* ignore */ }
  }

  persistDb();
  console.log('\n========================================');
  console.log('  RESUMEN CONTACTOS UNIFICADOS');
  console.log('========================================');
  console.log(`Contactos unicos insertados : ${insertedContactos}`);
  console.log(`Con datos de tabulador      : ${insertedTabulador}`);
  console.log(`Imagenes procesadas         : ${files.length}`);
  console.log('========================================\n');
}

main().catch(err => {
  console.error('[Contactos Unificado] Error fatal:', err);
  process.exit(1);
});
