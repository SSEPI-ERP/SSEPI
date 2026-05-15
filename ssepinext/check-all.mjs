import { getDb } from './db.mjs';
import fs from 'fs';
import path from 'path';

const db = await getDb();

// Check clientes_tabulador
try {
  const stmt = db.prepare('SELECT COUNT(*) as total FROM clientes_tabulador');
  stmt.step();
  const count = stmt.getAsObject().total;
  stmt.free();
  console.log('clientes_tabulador count:', count);

  const stmt2 = db.prepare('SELECT id, nombre_cliente, localidad FROM clientes_tabulador LIMIT 5');
  while(stmt2.step()) console.log('ROW:', JSON.stringify(stmt2.getAsObject()));
  stmt2.free();
} catch(e) {
  console.log('Error clientes_tabulador:', e.message);
}

// Check inventario
try {
  const stmt = db.prepare('SELECT COUNT(*) as total FROM local_inventario');
  stmt.step();
  console.log('inventario count:', stmt.getAsObject().total);
  stmt.free();
} catch(e) {
  console.log('Error inventario:', e.message);
}

// List all tables
const stmt3 = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
const tables = [];
while(stmt3.step()) tables.push(stmt3.getAsObject().name);
stmt3.free();
console.log('Tables:', tables.join(', '));

// Search for images
function searchImages(dir, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.includes('node_modules')) {
        searchImages(fullPath, results);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.png','.jpg','.jpeg','.gif','.webp','.svg'].includes(ext)) {
          if (entry.name.toLowerCase().includes('contacto') || entry.name.toLowerCase().includes('cliente') || entry.name.toLowerCase().includes('logo')) {
            results.push(fullPath);
          }
        }
      }
    }
  } catch(e) {}
  return results;
}

const images = searchImages('E:\\SSEPI');
console.log('\\nIMAGES found:', images.length);
images.slice(0, 30).forEach(img => console.log('IMG:', img));
