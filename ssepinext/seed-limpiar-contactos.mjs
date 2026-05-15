import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedContactos() {
  const stmtContactos = await prepareStatement(db, 'local_contactos');

  // Contar cuántos hay ahora
  const countStmt = db.prepare('SELECT COUNT(*) as c FROM local_contactos');
  countStmt.step();
  const currentCount = countStmt.getAsObject().c || 0;
  countStmt.free();
  console.log('[Contactos] Registros actuales en local_contactos:', currentCount);

  // Si ya hay contactos (seed de imágenes ya corrió), no hacer nada.
  // Si está vacía, NO insertar contactos inventados — esperar a seed-contactos-imagenes.
  if (currentCount >= 1) {
    console.log('[Contactos] Seed limpiar-contactos omitido (contactos reales ya existen).');
    return;
  }

  console.log('[Contactos] Tabla vacía. No se insertan contactos inventados — usar seed-contactos-imagenes para datos reales.');
  persistDb();
}

seedContactos().catch(err => {
  console.error('[Contactos] Error:', err);
  process.exit(1);
});
