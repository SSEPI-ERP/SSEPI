import { getDb, persistDb, prepareStatement, setDeferPersist } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = await getDb();

async function seedCalculadoras() {
  const stmtCalc = await prepareStatement(db, 'local_calculadoras');
  const stmtCostos = await prepareStatement(db, 'local_calculadora_costos');
  const stmtCalcClientes = await prepareStatement(db, 'local_calculadora_clientes');
  const stmtHoja = await prepareStatement(db, 'local_calculadora_hoja_filas');
  const stmtTab = await prepareStatement(db, 'local_clientes_tabulador');
  const stmtBOM = await prepareStatement(db, 'local_bom_automatizacion');
  const stmtServ = await prepareStatement(db, 'local_servicios_automatizacion');

  // Calculadoras (nombres alineados al módulo / import formulas)
  const calcs = [
    { nombre: 'Laboratorio (electrónica)', departamento: 'taller', tipo: 'electronica', funciones: 'Cotización SP-E: km, traslado, mano de obra, refacciones', activo: true },
    { nombre: 'Automatización', departamento: 'automatizacion', tipo: 'automatizacion', funciones: 'Cotización SP-A: tarifas por servicio, materiales, viáticos', activo: true },
    { nombre: 'Cotización Taller SP-E', departamento: 'taller', tipo: 'laboratorio', funciones: 'Alias legacy taller', activo: true },
    { nombre: 'Cotización Automatización SP-A', departamento: 'automatizacion', tipo: 'proyecto', funciones: 'Alias legacy auto', activo: true },
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
  const costosAll = [
    ...costos,
    { calculadora_id: calcIds['Laboratorio (electrónica)'], concepto: 'Gasolina', costo: 30, unidad: '$/ltr' },
    { calculadora_id: calcIds['Laboratorio (electrónica)'], concepto: 'Técnico', costo: 80, unidad: '$/hr' },
    { calculadora_id: calcIds['Laboratorio (electrónica)'], concepto: 'Gastos fijos', costo: 161.85, unidad: '$/hr' },
    { calculadora_id: calcIds['Laboratorio (electrónica)'], concepto: 'Camioneta', costo: 52.67, unidad: '$/hr' },
    { calculadora_id: calcIds['Automatización'], concepto: 'Ingeniería', costo: 120, unidad: '$/hr' },
    { calculadora_id: calcIds['Automatización'], concepto: 'PLC', costo: 15000, unidad: '$/unidad' },
    { calculadora_id: calcIds['Automatización'], concepto: 'HMI', costo: 6200, unidad: '$/unidad' },
  ].filter((c) => c.calculadora_id);

  for (const c of costosAll) {
    const exists = await stmtCostos.query(
      "json_extract(data, '$.calculadora_id') = ? AND json_extract(data, '$.concepto') = ?",
      [String(c.calculadora_id), c.concepto],
      'id ASC',
      1
    );
    if (exists.length === 0) await stmtCostos.insert(null, { ...c, moneda: 'MXN', activo: true });
  }

  // Filas hoja Excel por calculadora (plantilla mínima)
  const hojaPlantilla = {
    'Laboratorio (electrónica)': [
      { concepto: 'KM ida y vuelta', formula_text: 'km * tarifa_km', valor: 0 },
      { concepto: 'Gasolina viaje', formula_text: 'litros * precio_gasolina', valor: 0 },
      { concepto: 'Mano de obra', formula_text: 'horas * costo_hora', valor: 0 },
      { concepto: 'Refacciones', formula_text: '', valor: 0, solo_valor: true },
      { concepto: 'Total cotización', formula_text: 'suma modulos', valor: 0 },
    ],
    'Automatización': [
      { concepto: 'Tarifa ingeniería', formula_text: 'horas * tarifa', valor: 120 },
      { concepto: 'Materiales', formula_text: 'BOM', valor: 0, solo_valor: true },
      { concepto: 'Viáticos', formula_text: 'km + horas', valor: 0 },
      { concepto: 'Total proyecto', formula_text: 'subtotal + utilidad', valor: 0 },
    ],
  };
  let hojaCount = 0;
  for (const [calcName, filas] of Object.entries(hojaPlantilla)) {
    const calcId = calcIds[calcName];
    if (!calcId) continue;
    const existHoja = await stmtHoja.query("json_extract(data, '$.calculadora_id') = ?", [String(calcId)], 'id ASC', 1);
    if (existHoja.length > 0) continue;
    let orden = 0;
    for (const f of filas) {
      await stmtHoja.insert(null, {
        calculadora_id: calcId,
        fila_orden: orden++,
        concepto: f.concepto,
        formula_text: f.formula_text || '',
        valor: f.valor ?? 0,
        solo_valor: !!f.solo_valor,
      });
      hojaCount++;
    }
  }

  // Cargar clientes tabulador desde data/master/clientes_tabulador.json
  const tabuladorPath = path.join(__dirname, 'data', 'master', 'clientes_tabulador.json');
  let clientesRealesCount = 0;
  if (fs.existsSync(tabuladorPath)) {
    const tabuladorRaw = JSON.parse(fs.readFileSync(tabuladorPath, 'utf-8'));
    const tabuladorRecords = tabuladorRaw.records || [];
    for (const rec of tabuladorRecords) {
      const nombre = rec.nombre_cliente;
      if (!nombre) continue;
      const exists = await stmtTab.query("json_extract(data, '$.nombre_cliente') = ?", [nombre], 'id ASC', 1);
      if (exists.length > 0) {
        // Actualizar si km cambió
        const existing = exists[0];
        const existingKm = existing.km || existing.data?.km || 0;
        if (existingKm !== rec.km) {
          await stmtTab.update(existing.id, { ...existing, ...rec, nombre_cliente: nombre });
        }
        continue;
      }
      await stmtTab.insert(null, {
        nombre_cliente: nombre,
        km: rec.km || 0,
        horas_viaje: rec.horas_viaje || 0,
        litros: rec.litros || 0,
        costo_gasolina: rec.costo_gasolina || 0,
        costo_tecnico: rec.costo_tecnico || 0,
        total: rec.total || 0,
        costo_km: rec.costo_km || 0,
        tarifa_km: rec.tarifa_km || 0,
        utilidad_factor: rec.utilidad_factor || 1.4,
        tipo_servicio: rec.tipo_servicio || 'viajes',
        activo: rec.activo !== false
      });
      clientesRealesCount++;
    }
    console.log(`[Calculadoras] Clientes tabulador desde JSON: ${clientesRealesCount} insertados, ${tabuladorRecords.length} total en catálogo`);

    const calcLabId = calcIds['Laboratorio (electrónica)'] || calcIds['Cotización Taller SP-E'];
    let calcCliCount = 0;
    if (calcLabId) {
      for (const rec of tabuladorRecords) {
        const nom = rec.nombre_cliente;
        if (!nom) continue;
        const exists = await stmtCalcClientes.query(
          "json_extract(data, '$.calculadora_id') = ? AND json_extract(data, '$.cliente_nombre') = ?",
          [String(calcLabId), nom],
          'id ASC',
          1
        );
        if (exists.length > 0) continue;
        await stmtCalcClientes.insert(null, {
          calculadora_id: calcLabId,
          cliente_nombre: nom,
          cliente_email: null,
          datos_json: {
            km: rec.km,
            horas_viaje: rec.horas_viaje,
            rfc: rec.rfc,
            total: rec.total,
            costo_gasolina: rec.costo_gasolina,
          },
        });
        calcCliCount++;
      }
    }
    console.log(`[Calculadoras] calculadora_clientes vinculados: ${calcCliCount}`);
  } else {
    console.warn('[Calculadoras] No se encontró', tabuladorPath);
  }

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

  setDeferPersist(false);
  persistDb();
  console.log(
    '[Calculadoras] Seed completado. Calculadoras:',
    Object.keys(calcIds).length,
    '| Costos:',
    costosAll.length,
    '| Tabulador:',
    clientesRealesCount,
    '| Hoja filas:',
    hojaCount,
    '| BOM:',
    boms.length
  );
}

seedCalculadoras().catch(e => {
  setDeferPersist(false);
  console.error('[Calculadoras] Error en seed:', e);
  process.exit(1);
});
