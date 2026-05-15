import { getDb, persistDb, prepareStatement } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC_DIR = 'E:\\SSEPI\\clintes';
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'clientes');

function safeName(str) {
  return str.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function isCompany(name) {
  const upper = name.toUpperCase();
  const companyTerms = ['S.A.', 'S.A DE C.V', 'S.A. DE C.V.', 'S DE RL', 'S. DE R.L.', 'S. A. DE C.V.', 'S.A.DE C.V.', 'S.A. DE C.V', 'S.A', 'S.A.', 'S.A. DE C.V. PLANTA'];
  return companyTerms.some(term => upper.includes(term)) ||
    upper.includes('GRUPO') ||
    upper.includes('INSTITUTO') ||
    upper.includes('CORP') ||
    upper.includes('INDUSTRIAL') ||
    (!upper.includes(' ') && upper.length > 5);
}

function cleanName(filename) {
  let name = filename.replace(/\.[^/.]+$/, '');
  name = name.replace(/\s*\(\d+\)\s*$/, '');
  return name.trim();
}

function normalizeKey(str) {
  return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Datos reales de clientes (del seed-limpiar-contactos original)
const DATOS_CLIENTES = {
  'BOLSAS DE LOS ALTOS': { empresa: 'Bolsas de los Altos S.A. de C.V.', email: 'compras@bolasdelosaltos.com', telefono: '(477) 123-4567', rfc: 'BDA260512345', contacto: 'Ing. Roberto Mendoza', direccion: 'Parque Industrial Los Altos, Leon, Gto.', km: 113 },
  'ANGUIPALST': { empresa: 'Anguipalst S.A. de C.V.', email: 'compras@anguipalst.com', telefono: '(477) 234-5678', rfc: 'ANG260523456', contacto: 'Lic. Ana Garcia', direccion: 'Parque Industrial Angui, Leon, Gto.', km: 117 },
  'ECOBOLSAS': { empresa: 'Ecobolsas del Bajio S.A. de C.V.', email: 'contacto@ecobolsas.com', telefono: '(477) 345-6789', rfc: 'ECB260534567', contacto: 'Ing. Luis Fernandez', direccion: 'Zona Industrial ECO, Silao, Gto.', km: 108 },
  'BADER TABACHINES': { empresa: 'Bader Tabachines S.A. de C.V.', email: 'mtto@badermexico.com', telefono: '(477) 456-7890', rfc: 'BTR260545678', contacto: 'Tec. Mario Hernandez', direccion: 'Blvd. Campestre 120, Leon, Gto.', km: 8.6 },
  'BODYCOTE': { empresa: 'Bodycote Mexico S.A. de C.V.', email: 'info@bodycote.com.mx', telefono: '(477) 567-8901', rfc: 'BDM260556789', contacto: 'Ing. Patricia Solis', direccion: 'Parque Industrial COMEX, Leon, Gto.', km: 45.3 },
  'COFICAB': { empresa: 'Coficab Mexico S.A. de C.V.', email: 'compras@coficab.com', telefono: '(477) 678-9012', rfc: 'CFB260567890', contacto: 'Lic. Gabriela Torres', direccion: 'Parque Industrial Coficab, Leon, Gto.', km: 40 },
  'CONDUMEX': { empresa: 'Condumex S.A. de C.V.', email: 'mtto@condumex.com.mx', telefono: '(477) 789-0123', rfc: 'CDX260578901', contacto: 'Ing. Rafael Campos', direccion: 'Carretera a Silao Km 5, Leon, Gto.', km: 45.3 },
  'ECSA': { empresa: 'ECSA S.A. de C.V.', email: 'contacto@ecsa.com.mx', telefono: '(477) 890-1234', rfc: 'ECS260589012', contacto: 'Admin. Jorge Ramirez', direccion: 'Zona Industrial ECSA, Leon, Gto.', km: 16 },
  'EMMSA': { empresa: 'EMMSA S.A. de C.V.', email: 'info@emmsa.com.mx', telefono: '(477) 901-2345', rfc: 'EMM260590123', contacto: 'Tec. Miguel Diaz', direccion: 'Blvd. Aeropuerto 80, Leon, Gto.', km: 10.8 },
  'EPC 1': { empresa: 'EPC Industrial Planta 1', email: 'mtto@epcindustrial.com', telefono: '(464) 123-4567', rfc: 'EPC2605123456', contacto: 'Ing. Ingenieria Planta', direccion: 'Parque Industrial EPC, Celaya, Gto.', km: 200 },
  'EPC 2': { empresa: 'EPC Industrial Planta 2', email: 'mtto2@epcindustrial.com', telefono: '(464) 234-5678', rfc: 'EPC2606234567', contacto: 'Ing. Alonso Vega', direccion: 'Parque Industrial EPC II, Celaya, Gto.', km: 201 },
  'FRAENKISCHE': { empresa: 'Fränkische Mexico S.A. de C.V.', email: 'compras@fraenkische.com.mx', telefono: '(477) 012-3456', rfc: 'FRK2605012345', contacto: 'Mtto. Carlos Lopez', direccion: 'Parque Industrial Fränkische, Leon, Gto.', km: 0 },
  'GEDNEY': { empresa: 'GEDNEY Mexico S.A. de C.V.', email: 'contacto@gedney.com.mx', telefono: '(477) 123-5678', rfc: 'GDY2605123567', contacto: 'Ing. Fernando Ruiz', direccion: 'Zona Industrial GEDNEY, Leon, Gto.', km: 11.8 },
  'GRUPO ACERERO': { empresa: 'Grupo Acerero S.A. de C.V.', email: 'compras@grupoacerero.com', telefono: '(464) 345-6789', rfc: 'GAC2605345678', contacto: 'Lic. Martha Perez', direccion: 'Parque Industrial Acerero, Celaya, Gto.', km: 193 },
  'HALL PLANTA 1': { empresa: 'Hall Planta 1 Mexico', email: 'mtto@hallmexico.com', telefono: '(477) 234-7890', rfc: 'HLL2605234789', contacto: 'Ing. Eduardo Navarro', direccion: 'Parque Industrial Hall, Leon, Gto.', km: 36.9 },
  'HIRUTA PLANTA 1': { empresa: 'Hiruta Mexico Planta 1', email: 'contacto@hiruta.com.mx', telefono: '(477) 345-8901', rfc: 'HRT2605345890', contacto: 'Admin. Hiroshi Tanaka', direccion: 'Zona Industrial Hiruta, Leon, Gto.', km: 29.2 },
  'IK PLASTIC': { empresa: 'IK Plastic Mexico S.A. de C.V.', email: 'compras@ikplastic.com', telefono: '(477) 456-9012', rfc: 'IKP2605456901', contacto: 'Ing. Kenji Yamamoto', direccion: 'Parque Industrial IK, Leon, Gto.', km: 30.7 },
  'IMPRENTA JM': { empresa: 'Imprenta JM S.A. de C.V.', email: 'info@imprentajm.com', telefono: '(477) 567-0123', rfc: 'IJM2605567012', contacto: 'Lic. Juan Morales', direccion: 'Centro #120, Leon, Gto.', km: 8.1 },
  'JARDIN LA ALEMANA': { empresa: 'Jardin La Alemana S.A. de C.V.', email: 'ventas@jardinalemana.com', telefono: '(477) 678-1234', rfc: 'JLA2605678123', contacto: 'Sra. Heidi Müller', direccion: 'Blvd. Campestre 50, Leon, Gto.', km: 6 },
  'MAFLOW': { empresa: 'Maflow Mexico S.A. de C.V.', email: 'mtto@maflow.com.mx', telefono: '(477) 789-2345', rfc: 'MFW2605789234', contacto: 'Ing. Daniele Rossi', direccion: 'Parque Industrial Maflow, Leon, Gto.', km: 29.9 },
  'MARQUARDT': { empresa: 'Marquardt Mexico S.A. de C.V.', email: 'compras@marquardt.com.mx', telefono: '(477) 890-3456', rfc: 'MRQ2605890345', contacto: 'Ing. Stefan Braun', direccion: 'Parque Industrial Marquardt, Leon, Gto.', km: 62.7 },
  'MICROONDA': { empresa: 'Microonda S.A. de C.V.', email: 'contacto@microonda.com.mx', telefono: '(477) 901-4567', rfc: 'MCR2605901456', contacto: 'Tec. Roberto Sanchez', direccion: 'Zona Industrial Microonda, Leon, Gto.', km: 20.8 },
  'MR LUCKY': { empresa: 'Mr Lucky Mexico S.A. de C.V.', email: 'info@mrlucky.com.mx', telefono: '(477) 012-5678', rfc: 'MLK2605012567', contacto: 'Lic. David Chen', direccion: 'Parque Industrial Mr Lucky, Leon, Gto.', km: 78.5 },
  'NHK': { empresa: 'NHK Mexico S.A. de C.V.', email: 'compras@nhk.com.mx', telefono: '(477) 123-6789', rfc: 'NHK2605123678', contacto: 'Ing. Takeshi Sato', direccion: 'Parque Industrial NHK, Leon, Gto.', km: 69.3 },
  'NISHIKAWA': { empresa: 'Nishikawa Mexico S.A. de C.V.', email: 'mtto@nishikawa.com.mx', telefono: '(477) 234-7890', rfc: 'NSK2605234789', contacto: 'Ing. Prod. Yuki Tanaka', direccion: 'Zona Industrial Nishikawa, Leon, Gto.', km: 30.5 },
  'PIELES AZTECA': { empresa: 'Pieles Azteca S.A. de C.V.', email: 'compras@pielesazteca.com', telefono: '(477) 345-8901', rfc: 'PZA2605345890', contacto: 'Almacen Pedro Jimenez', direccion: 'Calzada #50, Leon, Gto.', km: 2.5 },
  'RONGTAI': { empresa: 'Rongtai Mexico S.A. de C.V.', email: 'info@rongtai.com.mx', telefono: '(477) 456-9012', rfc: 'RTI2605456901', contacto: 'Ing. Wei Zhang', direccion: 'Parque Industrial Rongtai, Leon, Gto.', km: 14.1 },
  'SAFE DEMO': { empresa: 'Safe Demo Mexico S.A. de C.V.', email: 'contacto@safe-demo.com.mx', telefono: '(477) 567-0123', rfc: 'SFM2605567012', contacto: 'Ing. Laura Ramirez', direccion: 'Zona Industrial Safe, Leon, Gto.', km: 30.8 },
  'ELECTROFORJADOS': { empresa: 'Electroforjados S.A. de C.V.', email: 'mtto@electroforjados.com', telefono: '(477) 678-1234', rfc: 'ELF2605678123', contacto: 'Tec. Martin Flores', direccion: 'Blvd. Electroforjados 90, Leon, Gto.', km: 7.3 },
  'SUACERO': { empresa: 'Suacero S.A. de C.V.', email: 'compras@suacero.com', telefono: '(464) 789-2345', rfc: 'SAC2605789234', contacto: 'Lic. Andrea Gomez', direccion: 'Parque Industrial Suacero, Celaya, Gto.', km: 196 },
  'TQ-1': { empresa: 'TQ-1 Mexico S.A. de C.V.', email: 'contacto@tq1.com.mx', telefono: '(477) 890-3456', rfc: 'TQU2605890345', contacto: 'Admin. Roberto Diaz', direccion: 'Parque Industrial TQ, Leon, Gto.', km: 13 },
  'MINO INDUSTRY': { empresa: 'Mino Industry Mexico S.A. de C.V.', email: 'compras@minoindustry.com', telefono: '(477) 901-4567', rfc: 'MNI2605901456', contacto: 'Ing. Moldes Satoshi Ito', direccion: 'Zona Industrial Mino, Leon, Gto.', km: 14.6 }
};

function findDatosReales(rawName) {
  const key = normalizeKey(rawName);
  // Busqueda exacta
  if (DATOS_CLIENTES[rawName.toUpperCase()]) return DATOS_CLIENTES[rawName.toUpperCase()];
  // Busqueda por clave normalizada
  for (const [k, v] of Object.entries(DATOS_CLIENTES)) {
    if (normalizeKey(k) === key) return v;
    // Coincidencia parcial: si el nombre del archivo contiene la clave o viceversa
    if (key.includes(normalizeKey(k)) || normalizeKey(k).includes(key)) return v;
  }
  return null;
}

async function seedContactosImagenes() {
  const stmt = await prepareStatement(db, 'local_contactos');

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const files = fs.readdirSync(SRC_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.svg', '.webp', '.gif'].includes(ext);
  });

  console.log(`[Contactos Imagenes] Encontradas ${files.length} imagenes en ${SRC_DIR}`);

  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    const rawName = cleanName(file);
    if (!rawName) continue;

    const isEmpresa = isCompany(rawName);
    const categoria = isEmpresa ? 'empresa' : 'persona';

    // Verificar si ya existe por nombre
    const existing = await stmt.query(
      "LOWER(json_extract(data, '$.nombre')) = ?",
      [rawName.toLowerCase()],
      'id ASC',
      1
    );
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Copiar imagen
    const srcPath = path.join(SRC_DIR, file);
    const ext = path.extname(file).toLowerCase();
    const destFileName = safeName(rawName) + ext;
    const destPath = path.join(UPLOADS_DIR, destFileName);
    try {
      fs.copyFileSync(srcPath, destPath);
    } catch (e) {
      console.warn(`[Contactos Imagenes] No se pudo copiar ${file}:`, e.message);
      continue;
    }

    const logoUrl = `/uploads/clientes/${destFileName}`;

    // Buscar datos reales del cliente
    const datos = findDatosReales(rawName);

    const contacto = {
      nombre: rawName.toUpperCase(),
      empresa: datos ? datos.empresa : (isEmpresa ? rawName.toUpperCase() : ''),
      tipo: 'client',
      categoria,
      email: datos ? datos.email : '',
      telefono: datos ? datos.telefono : '',
      rfc: datos ? datos.rfc : '',
      sitio_web: '',
      logo_url: logoUrl,
      avatar: rawName.charAt(0).toUpperCase(),
      color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
      km: datos ? datos.km : 0,
      horas_viaje: datos && datos.km > 0 ? Math.ceil(datos.km / 50) : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      await stmt.insert(null, contacto);
      inserted++;
    } catch (e) {
      console.warn(`[Contactos Imagenes] Error insertando ${rawName}:`, e.message);
    }
  }

  persistDb();
  console.log(`[Contactos Imagenes] Insertados: ${inserted}, Omitidos (duplicados): ${skipped}, Total imagenes: ${files.length}`);
}

const db = await getDb();
seedContactosImagenes().catch(e => {
  console.error('[Contactos Imagenes] Error:', e);
  process.exit(1);
});
