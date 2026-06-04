/**
 * Re-OCR de todas las capturas: recorte superior (título) + imagen completa.
 * Mejora lectura del nombre grande en fichas Odoo.
 * Uso: node reocr_mejorado.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const NM = path.join(ROOT, 'no usar', 'node_modules');
const Tesseract = require(path.join(NM, 'tesseract.js'));
const Jimp = require(path.join(NM, 'jimp'));

const IMG_DIR = path.join(ROOT, 'SistemaContactos', 'CapturasOdoo');
const OCR_OUT = path.join(ROOT, 'ocr_results.json');

async function preprocess(inputPath, outputPath, cropTopRatio) {
  const image = await Jimp.read(inputPath);
  const h = image.getHeight();
  const w = image.getWidth();
  if (cropTopRatio && cropTopRatio < 1) {
    image.crop(0, 0, w, Math.max(80, Math.floor(h * cropTopRatio)));
  }
  image.contrast(0.35);
  image.brightness(0.08);
  image.normalize();
  image.scale(2);
  await image.writeAsync(outputPath);
}

async function ocrFile(filePath, lang) {
  const ret = await Tesseract.recognize(filePath, lang, {
    logger: () => {},
  });
  return (ret.data.text || '').trim();
}

async function main() {
  const files = fs.readdirSync(IMG_DIR)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b));

  const tmpDir = path.join(IMG_DIR, '_tmp_reocr');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const src = path.join(IMG_DIR, f);
    const topPath = path.join(tmpDir, `top_${i}.png`);
    const fullPath = path.join(tmpDir, `full_${i}.png`);
    process.stdout.write(`[${i + 1}/${files.length}] ${f} ... `);
    try {
      await preprocess(src, topPath, 0.42);
      await preprocess(src, fullPath, null);
      const [topText, fullText] = await Promise.all([
        ocrFile(topPath, 'spa+eng'),
        ocrFile(fullPath, 'spa+eng'),
      ]);
      const text = `[TITULO]\n${topText}\n[DETALLE]\n${fullText}`;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
      const skip = /persona|empresa|correo|nuevo|enviar|^\[titulo\]|^\[detalle\]/i;
      let name = '';
      for (const l of lines) {
        if (skip.test(l) || l.includes('@') || /^\+?\d/.test(l)) continue;
        if (l.length >= 3 && l.length <= 90) {
          name = l;
          break;
        }
      }
      results.push({ file: f, name: name || f, text, match: { client: null, score: 0 } });
      console.log(`OK "${(name || '').substring(0, 40)}"`);
    } catch (e) {
      console.log(`ERROR ${e.message}`);
      results.push({ file: f, name: 'ERROR', text: '', match: { client: null, score: 0 } });
    }
  }

  fs.writeFileSync(OCR_OUT, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nGuardado ${OCR_OUT} (${results.length} registros)`);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
