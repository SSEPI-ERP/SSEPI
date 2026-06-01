/**
 * Datos del tabulador Excel (dirección fiscal, RFC, contacto referencia).
 * Fuente: tabla TABULADOR DE COTIZACIÓN — filas con dirección capturada.
 */
export const TABULADOR_DIRECCIONES = [
  { nombre: 'ANGUIPLAST', rfc: 'ANG101215PG0', direccion: 'Libramiento Norte Km. 2, Arandas, JAL', contacto: 'Ing. Compras', km: 234 },
  { nombre: 'BOLSAS DE LOS ALTOS', rfc: 'BAL050101AA1', direccion: 'Carr. Tepatitlán - Arandas, JAL', contacto: 'Lic. Adquisiciones', km: 226 },
  { nombre: 'ECOBOLSAS', rfc: 'ECO990202BB2', direccion: 'Parque Industrial León, GTO', contacto: 'Gerente Planta', km: 216 },
  { nombre: 'BADER TABACHINES', rfc: 'BAD880303CC3', direccion: 'Blvd. J. Clouthier, León, GTO', contacto: 'Mantenimiento', km: 17.2 },
  { nombre: 'BODYCOTE', rfc: 'BOD770404DD4', direccion: 'Silao, Guanajuato Puerto Interior', contacto: 'Ing. Proyectos', km: 90.6 },
  { nombre: 'COFICAB', rfc: 'COF660505EE5', direccion: 'Puerto Interior, Silao, GTO', contacto: 'Ing. Eléctrico', km: 80 },
  { nombre: 'CONDUMEX', rfc: 'CON550606FF6', direccion: 'Silao, GTO', contacto: 'Compras', km: 90.6 },
  { nombre: 'ARCOSA', aliases: ['ECSA'], rfc: 'ECS440707GG7', direccion: 'León, GTO', contacto: 'Admin', km: 32 },
  { nombre: 'EMMSA', rfc: 'EMM330808HH8', direccion: 'León, GTO', contacto: 'Almacén', km: 21.6 },
  { nombre: 'EPC 1', rfc: 'EPC220909II9', direccion: 'SLP', contacto: 'Ingeniería', km: 400 },
  { nombre: 'EPC 2', rfc: 'EPC111010JJ0', direccion: 'SLP', contacto: 'Ingeniería', km: 402 },
  { nombre: 'FRAENKISCHE', rfc: 'FRA001111KK1', direccion: 'Silao, GTO', contacto: 'Mtto', km: 79.4 },
  { nombre: 'GEDNEY', rfc: 'GED991212LL2', direccion: 'León, GTO', contacto: 'Compras', km: 23.6 },
  { nombre: 'GRUPO ACERERO', rfc: 'GRU880101MM3', direccion: 'SLP', contacto: 'Planta', km: 386 },
  { nombre: 'HALLIBURTON', aliases: ['HALL PLANTA 1'], rfc: 'HAL770202NN4', direccion: 'Parque Opción, San José Iturbide', contacto: 'Ing. Control', km: 73.8 },
  { nombre: 'HIRUTA', aliases: ['HIRUTA PLANTA 1'], rfc: 'HIR660303OO5', direccion: 'Parque Amistad, Celaya', contacto: 'Mtto', km: 58.4 },
  { nombre: 'IK PLASTIC', rfc: 'IKP550404PP6', direccion: 'Parque Stiva, León', contacto: 'Ing. Proc', km: 61.4 },
  { nombre: 'IMPRENTA JM', rfc: 'IMP440505QQ7', direccion: 'Col. Obregón, León', contacto: 'Dueño', km: 16.2 },
  { nombre: 'JARDÍN LA ALEMANA', rfc: 'JAR330606RR8', direccion: 'León, GTO', contacto: 'Admin', km: 12 },
  { nombre: 'MAFLOW', rfc: 'MAF220707SS9', direccion: 'Silao, GTO', contacto: 'Ingeniería', km: 59.8 },
  { nombre: 'MARQUARDT', rfc: 'MAR110808TT0', direccion: 'Irapuato, GTO', contacto: 'Compras', km: 125.4 },
  { nombre: 'MICROONDA', rfc: 'MIC000909UU1', direccion: 'León, GTO', contacto: 'Sistemas', km: 41.6 },
  { nombre: 'MR LUCKY', rfc: 'MRL991010VV2', direccion: 'Irapuato, GTO', contacto: 'Campo', km: 157 },
  { nombre: 'NHK', rfc: 'NHK881111WW3', direccion: 'Celaya, GTO', contacto: 'Mtto', km: 138.6 },
  { nombre: 'NISHIKAWA', rfc: 'NIS771212XX4', direccion: 'Silao, GTO', contacto: 'Ing. Prod', km: 61 },
  { nombre: 'PIELES AZTECA', rfc: 'PIE660101YY5', direccion: 'León, GTO', contacto: 'Almacén', km: 5 },
  { nombre: 'RONGTAI', rfc: 'RON550202ZZ6', direccion: 'León, GTO', contacto: 'Compras', km: 28.2 },
  { nombre: 'SAFE DEMO', rfc: 'SAF440303A11', direccion: 'Silao, GTO', contacto: 'Ingeniería', km: 61.6 },
  { nombre: 'SERVIACERO ELECTROFORJADOS', rfc: 'SEE330404B22', direccion: 'León, GTO', contacto: 'Mtto', km: 14.6 },
  { nombre: 'SUACERO', rfc: 'SUA220505C33', direccion: 'SLP', contacto: 'Planta', km: 392 },
  { nombre: 'TQ-1', rfc: 'TQ1110606D44', direccion: 'León, GTO', contacto: 'Admin', km: 26 },
  { nombre: 'MINO INDUSTRY', rfc: 'MIN000707E55', direccion: 'León, GTO', contacto: 'Ing. Moldes', km: 29.2 },
  { nombre: 'CURTIDOS BENGALA', rfc: 'CUR880808F66', direccion: 'Parque Piel', contacto: 'Propietario', km: 17.2 },
];

export function normTabuladorKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @returns {Map<string, typeof TABULADOR_DIRECCIONES[0]>} */
export function buildDireccionesLookup() {
  const map = new Map();
  for (const row of TABULADOR_DIRECCIONES) {
    map.set(normTabuladorKey(row.nombre), row);
    for (const a of row.aliases || []) {
      map.set(normTabuladorKey(a), row);
    }
  }
  return map;
}
