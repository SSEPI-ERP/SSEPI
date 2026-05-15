import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}
function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

const monday = getMonday(new Date());
const fechas = Array.from({ length: 6 }, (_, i) => {
  const d = new Date(monday);
  d.setDate(monday.getDate() + i);
  return fmtDate(d);
});

async function seedActividades() {
  const stmtAct = await prepareStatement(db, 'local_actividades_diarias');
  const stmtSub = await prepareStatement(db, 'local_actividades_subtareas');
  const stmtProy = await prepareStatement(db, 'local_proyectos_automatizacion');
  const stmtTaller = await prepareStatement(db, 'local_ordenes_taller');
  const stmtMotores = await prepareStatement(db, 'local_ordenes_motores');

  // Helper: evitar duplicados por fecha+resumen
  async function existeActividad(tabla, fecha, resumen) {
    const rows = await tabla.query(
      "json_extract(data, '$.fecha') = ? AND json_extract(data, '$.resumen') = ?",
      [fecha, resumen], 'id ASC', 1
    );
    return rows.length > 0 ? rows[0].local_id : null;
  }

  // Obtener órdenes/proyectos existentes para vincular actividades
  const proyectos = await stmtProy.query('', [], 'folio ASC', 10);
  const ordenesTaller = await stmtTaller.query('', [], 'folio ASC', 10);
  const ordenesMotores = await stmtMotores.query('', [], 'folio ASC', 10);

  const actividades = [];

  // Actividades genéricas (desarrollo ERP)
  actividades.push(
    {
      fecha: fechas[0], // Lunes
      resumen: 'Diseñar esquema de base de datos para módulo de inventario',
      estado: 'pendiente',
      notas: 'Definir tablas: productos, movimientos, proveedores. Revisar con equipo antes de implementar.',
      creado_por: 'user-005',
      user_id: 'user-005',
      prioridad: 'alta'
    },
    {
      fecha: fechas[1], // Martes
      resumen: 'API de autenticación offline con JWT',
      estado: 'pendiente',
      notas: 'Endpoints: /api/auth/login, /api/auth/session, refresh token. Usar sql.js para verificar credenciales.',
      creado_por: 'user-006',
      user_id: 'user-006',
      prioridad: 'alta'
    },
    {
      fecha: fechas[2], // Miércoles
      resumen: 'Componente de gráficas de ventas mensuales',
      estado: 'en_progreso',
      notas: 'Evaluando Chart.js vs D3. Se prefiere Chart.js por simplicidad. Barras y líneas requeridas.',
      creado_por: 'user-005',
      user_id: 'user-005',
      prioridad: 'media'
    },
    {
      fecha: fechas[3], // Jueves
      resumen: 'Configurar pipeline CI/CD con GitHub Actions',
      estado: 'en_progreso',
      notas: 'Workflow build listo. Falta deploy automático a staging. Configurar secrets.',
      creado_por: 'user-006',
      user_id: 'user-006',
      prioridad: 'baja'
    },
    {
      fecha: fechas[4], // Viernes
      resumen: 'Documentación de API en Swagger/OpenAPI',
      estado: 'completado',
      notas: 'Spec completa en formato YAML. Ejemplos de request/response agregados. Validada con Swagger Editor.',
      creado_por: 'user-005',
      user_id: 'user-005',
      prioridad: 'media',
      completado_en: `${fechas[4]}T18:00:00.000Z`,
      duracion_minutos: 480
    },
    {
      fecha: fechas[5], // Sábado
      resumen: 'Tests de integración E2E para flujo de checkout',
      estado: 'completado',
      notas: 'Cypress instalado. Tests de login y checkout funcionando. Pendiente: test de pago con tarjeta mock.',
      creado_por: 'user-006',
      user_id: 'user-006',
      prioridad: 'media',
      completado_en: `${fechas[5]}T16:30:00.000Z`,
      duracion_minutos: 360
    }
  );

  // Actividades vinculadas a proyectos de Automatización
  if (proyectos.length > 0) {
    const p1 = proyectos[0];
    actividades.push(
      { fecha: fechas[0], resumen: `Diseño arquitectura de control — ${p1.folio}`, estado: 'completado', notas: 'Diseño arquitectura de control para proyecto de automatización.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'alta', departamento: 'automatizacion', orden_origen_id: p1.id, orden_origen_tipo: 'proyectos_automatizacion', completado_en: `${fechas[0]}T18:00:00.000Z`, duracion_minutos: 360 },
      { fecha: fechas[1], resumen: `Diseño tablero BT — ${p1.folio}`, estado: 'completado', notas: 'Diseño de tablero de baja tensión.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'alta', departamento: 'automatizacion', orden_origen_id: p1.id, orden_origen_tipo: 'proyectos_automatizacion', completado_en: `${fechas[1]}T18:00:00.000Z`, duracion_minutos: 480 },
      { fecha: fechas[2], resumen: `Programación PLC — ${p1.folio}`, estado: 'en_progreso', notas: 'Programación del PLC principal.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'media', departamento: 'automatizacion', orden_origen_id: p1.id, orden_origen_tipo: 'proyectos_automatizacion' }
    );
  }
  if (proyectos.length > 1) {
    const p2 = proyectos[1];
    actividades.push(
      { fecha: fechas[0], resumen: `Configuración variadores — ${p2.folio}`, estado: 'completado', notas: 'Configuración de variadores de frecuencia.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'media', departamento: 'automatizacion', orden_origen_id: p2.id, orden_origen_tipo: 'proyectos_automatizacion', completado_en: `${fechas[0]}T16:00:00.000Z`, duracion_minutos: 360 },
      { fecha: fechas[1], resumen: `Integración cámaras de visión — ${p2.folio}`, estado: 'completado', notas: 'Integración de cámaras de visión artificial.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'media', departamento: 'automatizacion', orden_origen_id: p2.id, orden_origen_tipo: 'proyectos_automatizacion', completado_en: `${fechas[1]}T17:00:00.000Z`, duracion_minutos: 480 }
    );
  }
  if (proyectos.length > 2) {
    const p3 = proyectos[2];
    actividades.push(
      { fecha: fechas[3], resumen: `Levantamiento en sitio — ${p3.folio}`, estado: 'pendiente', notas: 'Levantamiento de requerimientos en planta del cliente.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'alta', departamento: 'automatizacion', orden_origen_id: p3.id, orden_origen_tipo: 'proyectos_automatizacion' },
      { fecha: fechas[4], resumen: `Cotización preliminar — ${p3.folio}`, estado: 'pendiente', notas: 'Preparar cotización detallada para cliente.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'alta', departamento: 'automatizacion', orden_origen_id: p3.id, orden_origen_tipo: 'proyectos_automatizacion' }
    );
  }

  // Actividades vinculadas a órdenes de Taller (Electrónica)
  if (ordenesTaller.length > 0) {
    const t1 = ordenesTaller[0];
    actividades.push(
      { fecha: fechas[0], resumen: `Diagnóstico inicial — ${t1.folio}`, estado: 'completado', notas: 'Diagnóstico del equipo electrónico.', creado_por: 'user-003', user_id: 'user-003', prioridad: 'alta', departamento: 'electronicos', orden_origen_id: t1.id, orden_origen_tipo: 'ordenes_taller', completado_en: `${fechas[0]}T14:00:00.000Z`, duracion_minutos: 240 },
      { fecha: fechas[1], resumen: `Reparación tarjeta principal — ${t1.folio}`, estado: 'en_progreso', notas: 'Reparación de tarjeta de control.', creado_por: 'user-003', user_id: 'user-003', prioridad: 'alta', departamento: 'electronicos', orden_origen_id: t1.id, orden_origen_tipo: 'ordenes_taller' }
    );
  }
  if (ordenesTaller.length > 1) {
    const t2 = ordenesTaller[1];
    actividades.push(
      { fecha: fechas[2], resumen: `Cambio de componentes — ${t2.folio}`, estado: 'pendiente', notas: 'Reemplazo de capacitores y resistencias.', creado_por: 'user-003', user_id: 'user-003', prioridad: 'media', departamento: 'electronicos', orden_origen_id: t2.id, orden_origen_tipo: 'ordenes_taller' }
    );
  }

  // Actividades vinculadas a órdenes de Motores
  if (ordenesMotores.length > 0) {
    const m1 = ordenesMotores[0];
    actividades.push(
      { fecha: fechas[0], resumen: `Rebobinado motor — ${m1.folio}`, estado: 'completado', notas: 'Rebobinado de motor trifásico 50HP WEG. Cortocircuito intervuelta reparado.', creado_por: 'user-004', user_id: 'user-004', prioridad: 'alta', departamento: 'motores', orden_origen_id: m1.id, orden_origen_tipo: 'ordenes_motores', completado_en: `${fechas[0]}T15:00:00.000Z`, duracion_minutos: 300 },
      { fecha: fechas[1], resumen: `Prueba de aislamiento — ${m1.folio}`, estado: 'en_progreso', notas: 'Pruebas de resistencia de aislamiento post-rebobinado.', creado_por: 'user-004', user_id: 'user-004', prioridad: 'alta', departamento: 'motores', orden_origen_id: m1.id, orden_origen_tipo: 'ordenes_motores' }
    );
  }
  if (ordenesMotores.length > 1) {
    const m2 = ordenesMotores[1];
    actividades.push(
      { fecha: fechas[3], resumen: `Ajuste de escobillas — ${m2.folio}`, estado: 'pendiente', notas: 'Ajuste y reemplazo de escobillas motor DC Baldor.', creado_por: 'user-004', user_id: 'user-004', prioridad: 'media', departamento: 'motores', orden_origen_id: m2.id, orden_origen_tipo: 'ordenes_motores' }
    );
  }

  // Actividades vinculadas a Soporte en Planta
  if (proyectos.length > 2) {
    const sp1 = proyectos[2];
    actividades.push(
      { fecha: fechas[0], resumen: `Mantenimiento preventivo — ${sp1.folio}`, estado: 'completado', notas: 'Mantenimiento preventivo quincenal línea de tejido. Calibración sensores tensión.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'alta', departamento: 'soporte_planta', orden_origen_id: sp1.id, orden_origen_tipo: 'proyectos_automatizacion', completado_en: `${fechas[0]}T16:00:00.000Z`, duracion_minutos: 480 },
      { fecha: fechas[2], resumen: `Actualización firmware variadores — ${sp1.folio}`, estado: 'completado', notas: 'Update firmware ABB ACS355 y verificación de parámetros.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'media', departamento: 'soporte_planta', orden_origen_id: sp1.id, orden_origen_tipo: 'proyectos_automatizacion', completado_en: `${fechas[2]}T14:00:00.000Z`, duracion_minutos: 180 }
    );
  }
  if (proyectos.length > 3) {
    const sp2 = proyectos[3];
    actividades.push(
      { fecha: fechas[1], resumen: `Diagnóstico emergencia — ${sp2.folio}`, estado: 'completado', notas: 'Diagnóstico en sitio sistema de visión. Cámara Cognex con lente contaminado.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'alta', departamento: 'soporte_planta', orden_origen_id: sp2.id, orden_origen_tipo: 'proyectos_automatizacion', completado_en: `${fechas[1]}T18:00:00.000Z`, duracion_minutos: 360 },
      { fecha: fechas[3], resumen: `Recalibración visión artificial — ${sp2.folio}`, estado: 'pendiente', notas: 'Recalibración de sistema de visión con nuevo patrón de referencia.', creado_por: 'user-005', user_id: 'user-005', prioridad: 'alta', departamento: 'soporte_planta', orden_origen_id: sp2.id, orden_origen_tipo: 'proyectos_automatizacion' }
    );
  }

  const subtareasSeed = [
    // Actividad 0: Diseñar base de datos
    [
      { titulo: 'Modelo ER', descripcion: 'Crear diagrama entidad-relación con todas las tablas del sistema', done: false, orden: 0 },
      { titulo: 'Script SQL', descripcion: 'Generar script DDL para creación de tablas en PostgreSQL', done: false, orden: 1 },
      { titulo: 'Migración inicial', descripcion: 'Preparar migración inicial con datos seed', done: false, orden: 2 }
    ],
    // Actividad 1: API auth
    [
      { titulo: 'POST /login', descripcion: 'Endpoint de autenticación con email y password', done: false, orden: 0 },
      { titulo: 'POST /register', descripcion: 'Registro de usuario con validación de campos', done: false, orden: 1 },
      { titulo: 'Middleware JWT', descripcion: 'Middleware para validar token en rutas protegidas', done: false, orden: 2 },
      { titulo: 'Tests unitarios', descripcion: 'Tests para cada endpoint del módulo auth', done: false, orden: 3 }
    ],
    // Actividad 2: Gráficas
    [
      { titulo: 'Evaluar bibliotecas', descripcion: 'Chart.js vs D3 vs Recharts', done: true, orden: 0 },
      { titulo: 'Componente barra', descripcion: 'Gráfica de barras para comparativas mensuales', done: true, orden: 1 },
      { titulo: 'Componente línea', descripcion: 'Gráfica de línea para tendencias temporales', done: false, orden: 2 },
      { titulo: 'Integración API', descripcion: 'Conectar componentes con endpoints de datos reales', done: false, orden: 3 }
    ],
    // Actividad 3: CI/CD
    [
      { titulo: 'Workflow build', descripcion: 'Configurar job de build con tests automáticos', done: true, orden: 0 },
      { titulo: 'Workflow deploy', descripcion: 'Deploy automático a staging en cada push a develop', done: false, orden: 1 },
      { titulo: 'Variables de entorno', descripcion: 'Configurar secrets y env vars en GitHub', done: false, orden: 2 }
    ],
    // Actividad 4: Documentación API (completada)
    [
      { titulo: 'Espec OpenAPI', descripcion: 'Definir spec completa en formato YAML', done: true, orden: 0 },
      { titulo: 'Ejemplos', descripcion: 'Agregar ejemplos de request/response para cada endpoint', done: true, orden: 1 },
      { titulo: 'Validación', descripcion: 'Validar spec con herramientas online y corregir errores', done: true, orden: 2 }
    ],
    // Actividad 5: Tests E2E (completada)
    [
      { titulo: 'Setup Cypress', descripcion: 'Instalar y configurar Cypress en el proyecto', done: true, orden: 0 },
      { titulo: 'Test login', descripcion: 'Flujo completo de login en E2E', done: true, orden: 1 },
      { titulo: 'Test checkout', descripcion: 'Flujo E2E de carrito hasta confirmación de pago', done: true, orden: 2 }
    ],
    // Actividades vinculadas (proyectos, taller) — sin subtareas
    [], [], [], [], [], [], [], [],
    // Actividad Motor: Rebobinado motor
    [
      { titulo: 'Desarme y limpieza', descripcion: 'Desarmar motor, limpiar estator y rotor', done: true, orden: 0 },
      { titulo: 'Diagnóstico devanado', descripcion: 'Prueba de aislamiento y localizar corto', done: true, orden: 1 },
      { titulo: 'Rebobinado estator', descripcion: 'Insertar nuevo devanado AWG 12 clase H', done: true, orden: 2 },
      { titulo: 'Impregnación y curado', descripcion: 'Barniz epóxico y curado 4h a 120°C', done: true, orden: 3 }
    ],
    // Actividad Motor: Prueba de aislamiento
    [
      { titulo: 'Prueba megger', descripcion: 'Medir resistencia de aislamiento 500V', done: false, orden: 0 },
      { titulo: 'Prueba de vacío', descripcion: 'Aplicar 2.5kV durante 60s', done: false, orden: 1 },
      { titulo: 'Balanceo dinámico', descripcion: 'Balancear rotor en máquina', done: false, orden: 2 }
    ],
    // Actividad Motor: Ajuste de escobillas
    [
      { titulo: 'Inspección conmutador', descripcion: 'Verificar segmentos y ranuras', done: false, orden: 0 },
      { titulo: 'Reemplazo escobillas', descripcion: 'Instalar escobillas E46F3', done: false, orden: 1 },
      { titulo: 'Ajuste presión', descripcion: 'Ajustar presión a 150-200 g/cm²', done: false, orden: 2 }
    ],
    // Actividades Soporte Planta: Mantenimiento preventivo
    [
      { titulo: 'Inspección PLC', descripcion: 'Verificar estado módulos y conexiones', done: true, orden: 0 },
      { titulo: 'Calibración sensores', descripcion: 'Calibrar sensores de tensión 0-50N', done: true, orden: 1 },
      { titulo: 'Limpieza gabinetes', descripcion: 'Limpiar polvo y verificar ventilación', done: true, orden: 2 },
      { titulo: 'Respaldo programa', descripcion: 'Respaldar programa PLC y entregar copia', done: true, orden: 3 }
    ],
    // Actividades Soporte Planta: Update firmware
    [
      { titulo: 'Descargar firmware', descripcion: 'Obtener versión más reciente de ABB', done: true, orden: 0 },
      { titulo: 'Instalación', descripcion: 'Flashear firmware via ToolCable', done: true, orden: 1 },
      { titulo: 'Verificación parámetros', descripcion: 'Validar configuración post-update', done: true, orden: 2 }
    ],
    // Actividades Soporte Planta: Diagnóstico emergencia
    [
      { titulo: 'Inspección cámara', descripcion: 'Verificar lente y conexiones', done: true, orden: 0 },
      { titulo: 'Reemplazo lente', descripcion: 'Instalar lente con anillo de aire', done: true, orden: 1 },
      { titulo: 'Recalibración', descripcion: 'Ajustar patrón de referencia', done: true, orden: 2 }
    ],
    // Actividades Soporte Planta: Recalibración
    [
      { titulo: 'Nuevo patrón', descripcion: 'Definir patrón de referencia actualizado', done: false, orden: 0 },
      { titulo: 'Ajuste threshold', descripcion: 'Configurar tolerancias de rechazo', done: false, orden: 1 },
      { titulo: 'Prueba producción', descripcion: 'Validar a 360 botellas/minuto', done: false, orden: 2 }
    ]
  ];

  const createdIds = [];

  for (let i = 0; i < actividades.length; i++) {
    const a = actividades[i];
    // Asegurar asignado_a para filtro por técnico en Kanban
    if (!a.asignado_a && a.creado_por) a.asignado_a = a.creado_por;
    const existingId = await existeActividad(stmtAct, a.fecha, a.resumen);
    let actId;
    if (!existingId) {
      const result = await stmtAct.insert(null, a);
      actId = result.id;
      console.log(`[Seed] Actividad creada: ${a.resumen.slice(0, 40)}... (ID: ${actId})`);
    } else {
      await stmtAct.update(existingId, a);
      actId = existingId;
      console.log(`[Seed] Actividad reemplazada: ${a.resumen.slice(0, 40)}... (ID: ${actId})`);
    }
    createdIds.push(actId);
  }

  // Insertar subtareas
  for (let i = 0; i < createdIds.length; i++) {
    const actId = createdIds[i];
    const subs = subtareasSeed[i];
    if (!subs || subs.length === 0) continue;
    for (const s of subs) {
      try {
        await stmtSub.insert(null, { ...s, actividad_id: actId });
      } catch (e) {
        console.warn(`[Seed] Error subtarea:`, e.message);
      }
    }
  }

  persistDb();
  const pendientes = actividades.filter(a => a.estado === 'pendiente').length;
  const enProgreso = actividades.filter(a => a.estado === 'en_progreso').length;
  const completadas = actividades.filter(a => a.estado === 'completado').length;
  console.log('[Seed] Actividades y subtareas demo creadas.');
  console.log(`  - Pendiente: ${pendientes} actividades`);
  console.log(`  - En Progreso: ${enProgreso} actividades`);
  console.log(`  - Completado: ${completadas} actividades`);
  console.log(`  - Subtareas totales: ~28`);
  console.log(`  - Vinculadas a proyectos: ${proyectos.length} proyectos`);
  console.log(`  - Vinculadas a taller: ${ordenesTaller.length} órdenes`);
  console.log(`  - Vinculadas a motores: ${ordenesMotores.length} órdenes`);
  console.log(`  - Vinculadas a soporte planta: ${Math.max(0, proyectos.length - 2)} proyectos`);
}

seedActividades().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
