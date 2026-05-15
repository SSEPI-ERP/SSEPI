import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedDatosRealistas() {
  const stmtTaller = await prepareStatement(db, 'local_ordenes_taller');
  const stmtMotores = await prepareStatement(db, 'local_ordenes_motores');

  const tallerRows = await stmtTaller.query('', [], 'created_at DESC', 100);
  const motoresRows = await stmtMotores.query('', [], 'created_at DESC', 100);

  // Datos realistas inventados para Taller (Laboratorio de Electrónica)
  const datosTaller = [
    {
      equipo: 'Variador de Frecuencia Delta VFD-E',
      marca: 'Delta',
      modelo: 'VFD055E43A',
      serie: 'DE2025B04512',
      falla_reportada: 'El variador no arranca el motor y muestra código de falla "OC-A" (sobrecorriente en aceleración). El cliente reporta que empezó a fallar después de una tormenta eléctrica. Revisión de IGBT y circuito de disparo.',
      condiciones_fisicas: 'Carcasa con golpe en esquina inferior derecha. Ventilador funcional. Display operativo.',
      notas_internas: 'Revisar módulo IGBT y fuente de 24V. Posible daño por sobretensión. Cotizar repuestos Delta originales.',
      notas_generales: 'Cliente autoriza diagnóstico. Entrega estimada 5 días hábiles.'
    },
    {
      equipo: 'PLC Siemens S7-1200 con HMI KTP700',
      marca: 'Siemens',
      modelo: '6ES7214-1AG40-0XB0 / 6AV2123-2GB03-0AX0',
      serie: 'SI2025C08914',
      falla_reportada: 'El sistema de control de la línea de empaque se detiene aleatoriamente. El HKP muece pantalla de fault "Error de comunicación PROFINET". El cliente indica que ocurre 2-3 veces por turno.',
      condiciones_fisicas: 'Panel limpio. Cableado intacto. LED de RUN intermitente en CPU.',
      notas_internas: 'Revisar switch Ethernet industrial y cables RJ45. Verificar configuración de red PROFINET. Posible pérdida de paquetes por ruido electromagnético.',
      notas_generales: 'Coordinar acceso con turno nocturno. Requiere escáner de red.'
    },
    {
      equipo: 'Fuente de Poder Conmutada 24V/10A',
      marca: 'Mean Well',
      modelo: 'SE-600-24',
      serie: 'MW2025A03211',
      falla_reportada: 'La fuente de poder alimenta un gabinete de control de selladora. El cliente reporta que la salida cae a 18V bajo carga y el LED de OK parpadea. En ocasiones activa el relé de falla de la selladora.',
      condiciones_fisicas: 'Componentes sin daño físico externo. Ventilador con polvo acumulado. Conectores sin corrosión.',
      notas_internas: 'Revisar condensadores electrolíticos de salida y circuito de retroalimentación. Medir ripple en vacío y carga. Considerar reemplazo por modelo DR-120-24 si no es reparable.',
      notas_generales: 'Cliente requiere entrega urgente; línea de sellado parada.'
    }
  ];

  // Datos realistas inventados para Motores
  const datosMotores = [
    {
      motor: 'Motor Eléctrico Trifásico 10 HP',
      marca: 'WEG',
      modelo: 'W22 IE3 10HP 4P 440V',
      serie: 'WEG2025M00123',
      hp: 10,
      rpm: 1755,
      voltaje: '440V / 60Hz',
      falla_reportada: 'El motor arranca pero vibra excesivamente y emite ruido anormal en rodamientos. Temperatura de carcasa elevada (85°C). El cliente reporta que la bomba de agua de enfriamiento pierde presión cuando el motor está en servicio continuo.',
      condiciones_fisicas: 'Carcasa con óxido superficial en base. Terminal box sin tapa. Ventilador trasero con 2 aspas rotas.',
      notas_internas: 'Rebobinar si es necesario. Reemplazar rodamientos 6314-2RS ambos lados. Balancear dinámicamente. Revisar alineación con bomba.',
      notas_generales: 'Garantía de 6 meses en rebobinado. Incluye prueba en banco.'
    },
    {
      motor: 'Motor DC de Imán Permanente 5 HP',
      marca: 'Baldor',
      modelo: 'CDP3330',
      serie: 'BL2025D04567',
      hp: 5,
      rpm: 1750,
      voltaje: '180V DC',
      falla_reportada: 'El motor no alcanza velocidad nominal. El cliente indica que el controlador de velocidad (SCR) muece corriente de armadura inestable y chispa en escobillas. Huele a ozono cerca del conmutador.',
      condiciones_fisicas: 'Escobillas desgastadas al 20%. Conmutador con ranuras carbonizadas. Carcasa limpia.',
      notas_internas: 'Rectificar conmutador. Reemplazar escobillas por E46. Revisar bobinado de excitación. Medir resistencia de armadura y campo.',
      notas_generales: 'Coordinar entrega con taller de mecanizado para rectificado de conmutador.'
    },
    {
      motor: 'Motor Monofásico 3 HP con Capacitor',
      marca: 'Lincoln',
      modelo: 'C6P34DB33',
      serie: 'LK2025E07890',
      hp: 3,
      rpm: 3450,
      voltaje: '220V / 60Hz',
      falla_reportada: 'El motor de la banda transportadora no arranca; solo emite zumbido. Al girar el eje manualmente, arranca débilmente y se sobrecalienta. El capacitor de arranque fue reemplazado hace 3 meses por el cliente sin éxito.',
      condiciones_fisicas: 'Eje con desgaste en chaveta. Ventilador cubierto de grasa. Terminal box conexiones sueltas.',
      notas_internas: 'Revisar bobinado principal y auxiliar. Medir resistencias y verificar cortos entre espiras. Capacitor nuevo podría estar mal especificado ( cliente puso 120µF en vez de 200µF).',
      notas_generales: 'Incluir capacitor correcto en cotización. Entrega estimada 4 días.'
    }
  ];

  for (let i = 0; i < Math.min(tallerRows.length, datosTaller.length); i++) {
    const orden = tallerRows[i];
    const upd = { ...orden, ...datosTaller[i], updated_at: new Date().toISOString() };
    await stmtTaller.update(orden.local_id, upd);
    console.log(`[Realista] Taller ${orden.folio} → ${upd.equipo} — ${upd.marca}`);
  }

  for (let i = 0; i < Math.min(motoresRows.length, datosMotores.length); i++) {
    const orden = motoresRows[i];
    const upd = { ...orden, ...datosMotores[i], updated_at: new Date().toISOString() };
    await stmtMotores.update(orden.local_id, upd);
    console.log(`[Realista] Motores ${orden.folio} → ${upd.motor} — ${upd.marca}`);
  }

  persistDb();
  console.log('[Realista] Órdenes actualizadas con datos realistas.');
}

seedDatosRealistas().catch(err => {
  console.error('[Realista] Error:', err);
  process.exit(1);
});
