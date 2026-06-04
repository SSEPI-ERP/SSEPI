/**
 * OCR solo de capturas que faltan en ocr_results.json
 * Uso: node ocr_pendientes.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const NM = path.join(ROOT, 'no usar', 'node_modules');
const Tesseract = require(path.join(NM, 'tesseract.js'));
const Jimp = require(path.join(NM, 'jimp'));

const IMG_DIR = path.join(ROOT, 'SistemaContactos', 'CapturasOdoo');
const OCR_OUT = path.join(ROOT, 'ocr_results.json');

function extractNameFromOCR(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  const uiWords = ['persona', 'empresa', 'correo', 'direccion', 'puesto', 'nombre de la', 'contactos', 'clientes'];
  for (const l of lines) {
    const lo = l.toLowerCase();
    if (uiWords.some(u => lo.includes(u)) && l.length < 45) continue;
    if (l.includes('@') || /^\+?\d/.test(l)) continue;
    if (l.length >= 4 && l.length <= 80) return l;
  }
  return lines[0] || '';
}

async function preprocessImage(inputPath, outputPath) {
  const image = await Jimp.read(inputPath);
  const cropHeight = Math.floor(image.getHeight() * 0.38);
  image.crop(0, 0, image.getWidth(), cropHeight);
  image.contrast(0.4);
  image.brightness(0.05);
  image.scale(1.5);
  await image.writeAsync(outputPath);
}

async function main() {
  let existing = [];
  if (fs.existsSync(OCR_OUT)) {
    existing = JSON.parse(fs.readFileSync(OCR_OUT, 'utf8'));
  }
  const done = new Set(existing.map(r => r.file));

  const files = fs.readdirSync(IMG_DIR)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b));

  const pending = files.filter(f => !done.has(f));
  console.log(`Total PNG: ${files.length} | Ya OCR: ${done.size} | Pendientes: ${pending.length}`);

  if (!pending.length) {
    console.log('Nada pendiente.');
    return;
  }

  const tmpDir = path.join(IMG_DIR, '_tmp_ocr');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const newResults = [];
  for (let i = 0; i < pending.length; i++) {
    const f = pending[i];
    console.log(`[${i + 1}/${pending.length}] ${f}`);
    try {
      const tmpPath = path.join(tmpDir, `tmp_${i}.png`);
      await preprocessImage(path.join(IMG_DIR, f), tmpPath);
      const ret = await Tesseract.recognize(tmpPath, 'spa+eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            process.stdout.write(`\r  OCR ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      const text = ret.data.text;
      const name = extractNameFromOCR(text);
      newResults.push({ file: f, name, text, match: { client: null, score: 0 } });
      console.log(`\n  -> "${name.substring(0, 50)}" (${text.length} chars)`);
    } catch (e) {
      console.log(`\n  ERROR: ${e.message}`);
      newResults.push({ file: f, name: 'ERROR', text: '', match: { client: null, score: 0 } });
    }
  }

  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });

  const byFile = {};
  for (const r of existing) byFile[r.file] = r;
  for (const r of newResults) byFile[r.file] = r;

  const merged = files.map(f => byFile[f]).filter(Boolean);
  fs.writeFileSync(OCR_OUT, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`\nListo: ${merged.length} registros en ${OCR_OUT}`);
  console.log('Regenerando comparador...');
  require('child_process').execSync('python build_comparador.py', { cwd: ROOT, stdio: 'inherit' });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
