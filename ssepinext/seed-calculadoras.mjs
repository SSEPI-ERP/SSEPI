import { getDb, persistDb, prepareStatement } from './db.mjs';
import fs from 'fs';
import path from 'path';

const db = await getDb();

async function seedCalculadoras() {
  const stmtCalc = await prepareStatement(db, 'local_calculadoras');
  const stmtCostos = await prepareStatement(db, 'local_calculadora_costos');
  const stmtTab = await prepareStatement(db, 'local_clientes_tabulador');
  const stmtBOM = await prepareStatement(db, 'local_bom_automatizacion');
  const stmtServ = await prepareStatement(db, 'local_servicios_automatizacion');

  // Calculadoras
  const calcs = [
    { nombre: 'Cotización Taller SP-E', departamento: 'taller', tipo: 'laboratorio', descripcion: 'Cálculo de costos para reparaciones electrónicas' },
    { nombre: 'Cotización Automatización SP-A', departamento: 'automatizacion', tipo: 'proyecto', descripcion: 'Cálculo de proyectos de automatización' }
  ];
  const calcIds = {};
  for (const c of calcs) {
    const existing = await stmtCalc.query("json_extract(data, '$.nombre') = ?", [c.nombre], 'id ASC', 1);
    if (existing.length > 0) {
      calcIds[c.nombre] = existing[0].id;
      continue;
    }
    const inserted = await stmtCalc.insert(null, c);
    calcIds[c.nombre] = inserted.id;
  }

  // Costos por calculadora
  const costos = [
    { calculadora_id: calcIds['Cotización Taller SP-E'], concepto: 'Gasolina', costo: 30, unidad: '$/ltr' },
    { calculadora_id: calcIds['Cotización Taller SP-E'], concepto: 'Técnico', costo: 80, unidad: '$/hr' },
    { calculadora_id: calcIds['Cotización Taller SP-E'], concepto: 'Gastos fijos', costo: 161.85, unidad: '$/hr' },
    { calculadora_id: calcIds['Cotización Taller SP-E'], concepto: 'Camioneta', costo: 52.67, unidad: '$/hr' },
    { calculadora_id: calcIds['Cotización Automatización SP-A'], concepto: 'Ingeniería', costo: 120, unidad: '$/hr' },
    { calculadora_id: calcIds['Cotización Automatización SP-A'], concepto: 'PLC', costo: 15000, unidad: '$/unidad' },
    { calculadora_id: calcIds['Cotización Automatización SP-A'], concepto: 'HMI', costo: 6200, unidad: '$/unidad' }
  ];
  for (const c of costos) {
    const exists = await stmtCostos.query(
      "json_extract(data, '$.calculadora_id') = ? AND json_extract(data, '$.concepto') = ?",
      [String(c.calculadora_id), c.concepto],
      'id ASC', 1
    );
    if (exists.length === 0) await stmtCostos.insert(null, c);
  }

  // Leer clientes reales desde imágenes en E:\SSEPI\clintes
  const SRC_DIR = 'E:\\SSEPI\\clintes';
  const imageFiles = fs.readdirSync(SRC_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.svg', '.webp', '.gif'].includes(ext);
  });

  function cleanName(filename) {
    let name = filename.replace(/\.[^/.]+$/, '');
    name = name.replace(/\s*\(\d+\)\s*$/, '');
    return name.trim().toUpperCase();
  }

  // Mapa de km/horas SOLO para clientes reales confirmados
  const kmMap = {
    'BOLSAS DE LOS ALTOS': { km: 113, horas: 2.0 },
    'ECOBOLSAS': { km: 108, horas: 1.8 },
    'BODYCOTE': { km: 45.3, horas: 1.2 },
    'COFICAB': { km: 40, horas: 1.0 },
    'CONDUMEX': { km: 45.3, horas: 1.2 },
    'ECSA': { km: 16, horas: 0.5 },
    'EMMSA': { km: 10.8, horas: 0.4 },
    'EPC 2': { km: 201, horas: 3.0 },
    'FRAENKISCHE': { km: 0, horas: 0 },
    'HIRUTA': { km: 29.2, horas: 0.8 },
    'HIRUTA MÉXICO': { km: 29.2, horas: 0.8 },
    'HIRUTA MEXICO': { km: 29.2, horas: 0.8 },
    'IK PLASTIC': { km: 30.7, horas: 0.9 },
    'MARQUARDT': { km: 62.7, horas: 1.5 },
    'MARQUARDT MEXICO': { km: 62.7, horas: 1.5 },
    'MARQUARDT MÉXICO': { km: 62.7, horas: 1.5 },
  };

  // Normalizar claves del mapa para búsqueda flexible
  function findKm(name) {
    const upper = name.toUpperCase();
    if (kmMap[upper]) return kmMap[upper];
    // Buscar coincidencia parcial
    for (const [key, val] of Object.entries(kmMap)) {
      if (upper.includes(key) || key.includes(upper)) return val;
    }
    return { km: 0, horas: 0 };
  }

  let clientesRealesCount = 0;
  for (const file of imageFiles) {
    const rawName = cleanName(file);
    if (!rawName) continue;
    const isCompany = /S\.?\s*A\.?|S\.?\s*DE\s*R\.?L|C\.?\s*V|GRUPO|INDUSTRIAL|CORP|INSTITUTO/i.test(rawName);
    if (!isCompany) continue; // Solo empresas van al tabulador (viáticos)

    const exists = await stmtTab.query("json_extract(data, '$.nombre_cliente') = ?", [rawName], 'id ASC', 1);
    if (exists.length > 0) continue;

    const { km, horas } = findKm(rawName);
    const c = {
      nombre_cliente: rawName,
      km,
      horas_viaje: horas,
      activo: true,
      tipo_servicio: 'industrial'
    };
    await stmtTab.insert(null, c);
    clientesRealesCount++;
  }
  console.log(`[Calculadoras] Clientes tabulador reales insertados: ${clientesRealesCount}`);

  // BOM automatización
  const boms = [
    { item: 'PLC Siemens S7-1200', part_number: '6ES7214-1AG40-0XB0', descripcion: 'CPU 1214C AC/DC/Rly', cantidad: 1, unidad: 'pza', costo_unitario: 8500, categoria: 'PLC' },
    { item: 'HMI KTP700', part_number: '6AV2123-2GB03-0AX0', descripcion: 'Pantalla táctil 7"', cantidad: 1, unidad: 'pza', costo_unitario: 6200, categoria: 'HMI' },
    { item: 'Servomotor 1kW', part_number: '1FK7063-5AF71-1KH0', descripcion: 'Servomotor síncrono 1kW', cantidad: 1, unidad: 'pza', costo_unitario: 12500, categoria: 'Servomotor' },
    { item: 'Variador V20 3HP', part_number: '6SL3210-5BE17-5UV0', descripcion: 'Variador de frecuencia 3HP', cantidad: 1, unidad: 'pza', costo_unitario: 4800, categoria: 'Variador' }
  ];
  for (const b of boms) {
    const exists = await stmtBOM.query("json_extract(data, '$.part_number') = ?", [b.part_number], 'id ASC', 1);
    if (exists.length === 0) await stmtBOM.insert(null, b);
  }

  // Servicios automatización
  const servicios = [
    { nombre: 'Programación PLC', categoria: 'ingenieria', precio: 120, unidad: 'hr', descripcion: 'Programación y puesta en marcha de PLC' },
    { nombre: 'Diseño de tablero', categoria: 'diseño', precio: 150, unidad: 'hr', descripcion: 'Diseño eléctrico y mecánico de tableros' },
    { nombre: 'Instalación campo', categoria: 'instalacion', precio: 180, unidad: 'hr', descripcion: 'Instalación y commissioning en planta' },
    { nombre: 'Capacitación operadores', categoria: 'capacitacion', precio: 2500, unidad: 'sesión', descripcion: 'Capacitación grupal de operadores' }
  ];
  for (const s of servicios) {
    const exists = await stmtServ.query("json_extract(data, '$.nombre') = ?", [s.nombre], 'id ASC', 1);
    if (exists.length === 0) await stmtServ.insert(null, s);
  }

  persistDb();
  console.log('[Calculadoras] Seed completado. Calculadoras:', Object.keys(calcIds).length, 'Costos:', costos.length, 'Clientes tabulador reales:', clientesRealesCount, 'BOM:', boms.length, 'Servicios:', servicios.length);
}

seedCalculadoras().catch(e => {
  console.error('[Calculadoras] Error en seed:', e);
  process.exit(1);
});
