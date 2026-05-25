/** Servidor temporal mínimo SSEPI */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: 'ssepi-temp' }));

// Static files
app.use('/panel', express.static(path.join(__dirname, '..', 'panel')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Fallback to index
app.get('/', (req, res) => res.redirect('/panel/login.html'));

const PORT = 3333;
app.listen(PORT, () => console.log(`SSEPI TEMP en http://localhost:${PORT}`));
