import { getDb, persistDb, prepareStatement } from './db.mjs';
import { registerOfflineUser } from './offline-auth.mjs';
import { loadMasterData } from './data-loader.mjs';

const db = await getDb();

async function seed() {
  console.log('[Seed] Iniciando datos offline con usuarios reales...');

  // ===== 1. Usuarios reales (de producción SSEPI) =====
  // Contraseña provisional común: Ssepi2025!
  const PASSWORD = 'Ssepi2025!';

  const users = [
    { id: '65a2920c-bb4a-4b64-9e31-ccd47545120d', email: 'norbertomoro4@gmail.com',         nombre: 'Admin',                      rol: 'admin',              departamento: 'administracion' },
    { id: 'aaaaaaaa-1111-1111-1111-111111111111', email: 'automatizacion@ssepi.org',         nombre: 'Automatización',            rol: 'admin',              departamento: 'automatizacion' },
    { id: 'aaaaaaaa-2222-2222-2222-222222222222', email: 'administracion@ssepi.org',         nombre: 'Administración',            rol: 'admin',              departamento: 'administracion' },
    { id: 'aaaaaaaa-3333-3333-3333-333333333333', email: 'ventas@ssepi.org',                 nombre: 'Ventas Admin',              rol: 'admin',              departamento: 'ventas' },
    { id: 'aaaaaaaa-4444-4444-4444-444444444444', email: 'electronica@ssepi.org',            nombre: 'Electrónica Admin',         rol: 'admin',              departamento: 'electronica' },
    { id: 'aaaaaaaa-5555-5555-5555-555555555555', email: 'electronica.ssepi@gmail.com',      nombre: 'Electrónica SSEPI',         rol: 'ventas_sin_compras', departamento: 'ventas' },
    { id: 'aaaaaaaa-6666-6666-6666-666666666666', email: 'ivang.ssepi@gmail.com',            nombre: 'Ivan (Automatización)',     rol: 'automatizacion',     departamento: 'automatizacion' },
    { id: 'aaaaaaaa-7777-7777-7777-777777777777', email: 'ventas1@ssepi.org',                nombre: 'Ventas 1',                  rol: 'ventas',             departamento: 'ventas' }
  ];

  const stmtUsers = await prepareStatement(db, 'local_usuarios');
  for (const u of users) {
    const existing = await stmtUsers.query(`json_extract(data, '$.email') = ?`, [u.email], 'id ASC', 1);
    if (existing.length === 0) {
      const record = {
        id: u.id,
        auth_user_id: u.id,
        email: u.email,
        nombre: u.nombre,
        rol: u.rol,
        departamento: u.departamento,
        telefono: null,
        sede: null,
        nivel_riesgo: null,
        activo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await stmtUsers.insert(null, record);
      console.log(`[Seed] Perfil creado: ${u.email} (${u.rol})`);
    } else {
      console.log(`[Seed] Perfil ya existe: ${u.email}`);
    }

    // Auth local
    try {
      await registerOfflineUser(u.email, PASSWORD, u.nombre, u.rol, u.departamento, u.id);
      console.log(`[Seed] Auth creado: ${u.email}`);
    } catch (e) {
      if (e.message.includes('ya existe')) console.log(`[Seed] Auth ya existe: ${u.email}`);
      else console.error(`[Seed] Error auth ${u.email}:`, e.message);
    }
  }

  // ===== 2. Role permissions =====
  const perms = [
    { rol: 'ventas', module: 'ventas', action: 'read' },
    { rol: 'ventas', module: 'ventas', action: 'write' },
    { rol: 'ventas', module: 'inventario', action: 'read' },
    { rol: 'ventas', module: 'contactos', action: 'read' },
    { rol: 'ventas', module: 'contactos', action: 'write' },
    { rol: 'ventas', module: 'vacaciones', action: 'read' },
    { rol: 'ventas', module: 'ordenes_taller', action: 'read' },
    { rol: 'ventas', module: 'ordenes_taller', action: 'write' },
    { rol: 'ventas', module: 'cotizaciones', action: 'read' },
    { rol: 'ventas', module: 'cotizaciones', action: 'write' },
    { rol: 'taller', module: 'ordenes_taller', action: 'read' },
    { rol: 'taller', module: 'ordenes_taller', action: 'write' },
    { rol: 'taller', module: 'inventario', action: 'read' },
    { rol: 'taller', module: 'vacaciones', action: 'read' },
    { rol: 'taller', module: 'calculadoras', action: 'read' },
    { rol: 'motores', module: 'ordenes_motores', action: 'read' },
    { rol: 'motores', module: 'ordenes_motores', action: 'write' },
    { rol: 'motores', module: 'inventario', action: 'read' },
    { rol: 'motores', module: 'vacaciones', action: 'read' },
    { rol: 'motores', module: 'calculadoras', action: 'read' },
    { rol: 'automatizacion', module: 'proyectos_automatizacion', action: 'read' },
    { rol: 'automatizacion', module: 'proyectos_automatizacion', action: 'write' },
    { rol: 'automatizacion', module: 'inventario', action: 'read' },
    { rol: 'automatizacion', module: 'vacaciones', action: 'read' },
    { rol: 'automatizacion', module: 'calculadoras', action: 'read' },
    { rol: 'ventas_sin_compras', module: 'ventas', action: 'read' },
    { rol: 'ventas_sin_compras', module: 'ventas', action: 'write' },
    { rol: 'ventas_sin_compras', module: 'inventario', action: 'read' },
    { rol: 'ventas_sin_compras', module: 'contactos', action: 'read' },
    { rol: 'ventas_sin_compras', module: 'contactos', action: 'write' },
    { rol: 'ventas_sin_compras', module: 'vacaciones', action: 'read' },
    { rol: 'ventas_sin_compras', module: 'ordenes_taller', action: 'read' },
    { rol: 'ventas_sin_compras', module: 'ordenes_motores', action: 'read' },
    { rol: 'ventas_sin_compras', module: 'proyectos_automatizacion', action: 'read' },
    { rol: 'admin', module: '*', action: '*' },
    { rol: 'superadmin', module: '*', action: '*' }
  ];

  const stmtPerms = await prepareStatement(db, 'local_role_permissions');
  for (const p of perms) {
    const existing = await stmtPerms.query(
      `json_extract(data, '$.rol') = ? AND json_extract(data, '$.module') = ? AND json_extract(data, '$.action') = ?`,
      [p.rol, p.module, p.action], 'id ASC', 1
    );
    if (existing.length === 0) {
      await stmtPerms.insert(null, { ...p, created_at: new Date().toISOString() });
      console.log(`[Seed] Permiso: ${p.rol} -> ${p.module}:${p.action}`);
    }
  }

  // ===== 3. Contactos base =====
  const contactos = [
    { id: 'bbbbbbbb-1111-1111-1111-111111111111', nombre: 'Cliente Demo', email: 'demo@cliente.com', telefono: '555-0100', empresa: 'Demo SA', tipo: 'cliente', created_at: new Date().toISOString() },
    { id: 'bbbbbbbb-2222-2222-2222-222222222222', nombre: 'Proveedor Demo', email: 'demo@proveedor.com', telefono: '555-0200', empresa: 'Proveedores Demo', tipo: 'proveedor', created_at: new Date().toISOString() }
  ];

  const stmtContactos = await prepareStatement(db, 'local_contactos');
  for (const c of contactos) {
    const existing = await stmtContactos.query(`json_extract(data, '$.email') = ?`, [c.email], 'id ASC', 1);
    if (existing.length === 0) {
      await stmtContactos.insert(null, c);
      console.log(`[Seed] Contacto: ${c.nombre}`);
    } else {
      console.log(`[Seed] Contacto ya existe: ${c.nombre}`);
    }
  }

  // ===== 4. Inventario base =====
  const inventario = [
    { id: 'cccccccc-1111-1111-1111-111111111111', sku: 'REF-001', nombre: 'Refacción genérica A', descripcion: 'Repuesto uso general', cantidad: 100, precio_costo: 150.00, precio_venta: 250.00, categoria: 'refaccion', ubicacion: 'Almacén principal', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'cccccccc-2222-2222-2222-222222222222', sku: 'MAT-001', nombre: 'Material eléctrico B', descripcion: 'Cable y conectores', cantidad: 50, precio_costo: 80.00, precio_venta: 140.00, categoria: 'material', ubicacion: 'Almacén principal', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ];

  const stmtInv = await prepareStatement(db, 'local_inventario');
  for (const i of inventario) {
    const existing = await stmtInv.query(`json_extract(data, '$.sku') = ?`, [i.sku], 'id ASC', 1);
    if (existing.length === 0) {
      await stmtInv.insert(null, i);
      console.log(`[Seed] Inventario: ${i.nombre}`);
    } else {
      console.log(`[Seed] Inventario ya existe: ${i.nombre}`);
    }
  }

  // ===== 5. Parametros costos (ahora desde data-loader / JSON master) =====
  // Los parametros reales se cargan en el paso 11 via loadMasterData.

  // ===== 6. Users ver costos (todos true por defecto offline) =====
  const stmtVerCostos = await prepareStatement(db, 'local_users_ver_costos');
  for (const u of users) {
    const existing = await stmtVerCostos.query(`json_extract(data, '$.auth_user_id') = ?`, [u.id], 'id ASC', 1);
    if (existing.length === 0) {
      await stmtVerCostos.insert(null, { auth_user_id: u.id, ver_costos: true });
    }
  }

  // ===== 7. Politicas modulos (PDFs y ayuda) =====
  const politicas = [
    { modulo: 'ventas', titulo: 'Manual Ventas', url_pdf: '' },
    { modulo: 'taller', titulo: 'Manual Taller', url_pdf: '' }
  ];
  const stmtPol = await prepareStatement(db, 'local_politicas_modulos');
  for (const p of politicas) {
    const existing = await stmtPol.query(`json_extract(data, '$.modulo') = ?`, [p.modulo], 'id ASC', 1);
    if (existing.length === 0) {
      await stmtPol.insert(null, p);
    }
  }

  // ===== 8. Calculadoras base =====
  const calculadoras = [
    { id: 'dddddddd-1111-1111-1111-111111111111', nombre: 'Cotización Taller', departamento: 'taller', descripcion: 'Cálculo de costos para ordenes de taller', activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'dddddddd-2222-2222-2222-222222222222', nombre: 'Cotización Motores', departamento: 'motores', descripcion: 'Cálculo de costos para rebobinado de motores', activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'dddddddd-3333-3333-3333-333333333333', nombre: 'Cotización Automatización', departamento: 'automatizacion', descripcion: 'Cálculo de costos para proyectos de automatización', activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ];
  const stmtCalc = await prepareStatement(db, 'local_calculadoras');
  for (const c of calculadoras) {
    const existing = await stmtCalc.query(`json_extract(data, '$.id') = ?`, [c.id], 'id ASC', 1);
    if (existing.length === 0) {
      await stmtCalc.insert(null, c);
      console.log(`[Seed] Calculadora: ${c.nombre}`);
    }
  }

  // ===== 9. Clientes tabulador (ahora desde data-loader / JSON master) =====
  // Se cargan en el paso 11 via loadMasterData.

  // ===== 10. Calculadora costos base =====
  const costosCalc = [
    { id: 'ffffffff-1111-1111-1111-111111111111', calculadora_id: 'dddddddd-1111-1111-1111-111111111111', concepto: 'Mano de obra', costo: 450, tipo: 'hora', activo: true },
    { id: 'ffffffff-2222-2222-2222-222222222222', calculadora_id: 'dddddddd-1111-1111-1111-111111111111', concepto: 'Gasolina', costo: 30, tipo: 'km', activo: true }
  ];
  const stmtCostos = await prepareStatement(db, 'local_calculadora_costos');
  for (const c of costosCalc) {
    const existing = await stmtCostos.query(`json_extract(data, '$.id') = ?`, [c.id], 'id ASC', 1);
    if (existing.length === 0) {
      await stmtCostos.insert(null, c);
      console.log(`[Seed] Costo calculadora: ${c.concepto}`);
    }
  }

  // ===== 11. Master data externa (JSON) =====
  await loadMasterData(db);

  persistDb();
  console.log('[Seed] Listo. Usuarios reales + datos base + master data poblados en SQLite local.');
}

seed().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
