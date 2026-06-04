/**
 * Re-OCR solo capturas sin nombre legible en OCR actual.
 * Recorte superior para el título grande. Uso: node reocr_selectivo.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const NM = path.join(ROOT, 'no usar', 'node_modules');
const Tesseract = require(path.join(NM, 'tesseract.js'));
const Jimp = require(path.join(NM, 'jimp'));

const IMG_DIR = path.join(ROOT, 'SistemaContactos', 'CapturasOdoo');
const OCR_OUT = path.join(ROOT, 'ocr_results.json');

function isBadName(name) {
  if (!name || name.length < 2) return true;
  const lo = name.toLowerCase();
  if (/persona|empresa|nuevo|nombre.*empresa|ombre de la|correo|telefono|puesto|^\[|[$©\[\]\\|{}]/.test(lo)) return true;
  const alnum = (name.match(/[A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]/g) || []).length;
  return alnum / name.length < 0.5;
}

async function ocrTop(src, tmpPath) {
  const image = await Jimp.read(src);
  const h = image.getHeight();
  image.crop(0, 0, image.getWidth(), Math.max(100, Math.floor(h * 0.45)));
  image.contrast(0.4);
  image.brightness(0.1);
  image.scale(1.5);
  await image.writeAsync(tmpPath);
  const ret = await Tesseract.recognize(tmpPath, 'spa+eng', { logger: () => {} });
  return (ret.data.text || '').trim();
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(OCR_OUT, 'utf8'));
  const byFile = Object.fromEntries(existing.map(r => [r.file, r]));
  const files = fs.readdirSync(IMG_DIR).filter(f => f.endsWith('.png')).sort();
  const pending = files.filter(f => {
    const r = byFile[f];
    if (!r) return true;
    return isBadName(r.name) || isBadName((r.text || '').split('\n').find(l => l.length > 3 && l.length < 60));
  });

  console.log(`Re-OCR selectivo: ${pending.length} de ${files.length} capturas`);
  const tmpDir = path.join(IMG_DIR, '_tmp_sel');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  for (let i = 0; i < pending.length; i++) {
    const f = pending[i];
    const tmp = path.join(tmpDir, `t_${i}.png`);
    process.stdout.write(`[${i + 1}/${pending.length}] ${f} `);
    try {
      const top = await ocrTop(path.join(IMG_DIR, f), tmp);
      const prev = byFile[f] || { file: f, match: { client: null, score: 0 } };
      const text = `[TITULO]\n${top}\n[DETALLE]\n${prev.text || ''}`;
      let name = '';
      for (const l of top.split('\n').map(x => x.trim()).filter(Boolean)) {
        if (isBadName(l) || l.includes('@') || /^\+?\d/.test(l)) continue;
        if (l.length >= 3 && l.length <= 80) {
          name = l;
          break;
        }
      }
      byFile[f] = { ...prev, file: f, name: name || prev.name, text };
      console.log(`-> "${(name || '').slice(0, 40)}"`);
    } catch (e) {
      console.log(`ERROR ${e.message}`);
    }
  }

  const out = files.map(f => byFile[f]).filter(Boolean);
  fs.writeFileSync(OCR_OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Guardado ${OCR_OUT}`);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
