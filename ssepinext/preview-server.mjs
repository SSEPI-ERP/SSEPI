/**
 * Servidor mínimo para vista previa Laboratorio (formato carpeta 05).
 * Puerto 3334 por defecto.
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PREVIEW_PORT) || 3334;
const app = express();

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/datos_preview_erp.json', (_req, res) => {
  const p = path.join(__dirname, 'datos_preview_erp.json');
  if (!fs.existsSync(p)) {
    return res.status(404).json({ error: 'Ejecuta: node generar-datos-preview-formato.mjs' });
  }
  res.sendFile(path.resolve(p));
});

app.get('/prueba-formato-laboratorio.html', (_req, res) => {
  const p = path.join(__dirname, 'prueba-formato-laboratorio.html');
  if (!fs.existsSync(p)) {
    return res.status(404).send('<p>Ejecuta abrir-preview-lab.bat</p>');
  }
  res.sendFile(path.resolve(p));
});

// Legacy preview (oscuro)
app.get('/preview-lab-import.html', (_req, res) => {
  const p = path.join(__dirname, 'preview-lab-import.html');
  if (!fs.existsSync(p)) {
    return res.status(404).send('<p>Ejecuta: node generar-preview-lab.mjs</p>');
  }
  res.sendFile(path.resolve(p));
});

app.get('/', (_req, res) => res.redirect('/prueba-formato-laboratorio.html'));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[preview-server] http://localhost:${PORT}/prueba-formato-laboratorio.html`);
  console.log('[preview-server] Ctrl+C para cerrar');
});
