/**
 * Mueve el ítem de menú Inventario justo debajo de Contabilidad en panel y pages/*.html
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targets = [path.join(root, 'panel.html'), ...fs.readdirSync(path.join(root, 'pages')).filter((f) => f.endsWith('.html')).map((f) => path.join(root, 'pages', f))];

function reorderNav(html) {
  const invRe = /^(\s*)<a href="\/pages\/ssepi_productos\.html"[^>]*class="nav-item[^"]*"[^>]*>[\s\S]*?Inventario<\/a>\s*$/m;
  const lines = html.split('\n');
  let invLine = -1;
  let contLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\/pages\/ssepi_productos\.html/.test(lines[i]) && /nav-item/.test(lines[i]) && /Inventario/.test(lines[i])) invLine = i;
    if (/\/pages\/ssepi_contabilidad\.html/.test(lines[i]) && /nav-item/.test(lines[i]) && /Contabilidad/.test(lines[i])) contLine = i;
  }
  if (invLine < 0 || contLine < 0) return { html, changed: false };
  if (invLine === contLine + 1) return { html, changed: false };
  const [invRow] = lines.splice(invLine, 1);
  const newCont = lines.findIndex((l, i) => /\/pages\/ssepi_contabilidad\.html/.test(l) && /nav-item/.test(l) && /Contabilidad/.test(l));
  if (newCont < 0) return { html, changed: false };
  lines.splice(newCont + 1, 0, invRow);
  return { html: lines.join('\n'), changed: true };
}

let n = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const { html, changed } = reorderNav(raw);
  if (changed) {
    fs.writeFileSync(file, html, 'utf8');
    console.log('OK', path.relative(root, file));
    n++;
  }
}
console.log('Archivos actualizados:', n);
