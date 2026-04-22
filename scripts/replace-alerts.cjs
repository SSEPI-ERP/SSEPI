const fs = require('fs');
const path = require('path');
const files = [
  'js/modules/contactos.js',
  'js/modules/inventario.js',
  'js/modules/facturacion.js',
  'js/modules/contabilidad.js',
  'js/modules/nomina.js',
  'js/modules/proyectos.js',
  'js/modules/calculadoras.js',
  'js/modules/vacaciones.js',
  'js/modules/paginas.js',
  'js/modules/soporte.js',
  'js/modules/actividades.js',
  'js/modules/import-viewer.js',
  'js/modules/configuracion.js',
  'js/modules/analisis.js',
  'js/modules/analisis-ventas.js',
  'js/modules/analisis-taller.js',
  'js/modules/contabilidad-coi.js',
  'js/modules/contabilidad-v2.js',
  'js/modules/analisis-motores.js',
];
files.forEach(f => {
  const fp = path.resolve(f);
  if (!fs.existsSync(fp)) { console.log(f + ': SKIP (not found)'); return; }
  let c = fs.readFileSync(fp, 'utf8');
  // Success
  c = c.replace(/alert\('(✅ [^']+)'\)/g, (m, msg) => "_showToast('" + msg.replace('✅ ','') + "', 'success')");
  // Error
  c = c.replace(/alert\('(Error[^']+)'\)/g, (m, msg) => "_showToast('" + msg + "', 'error')");
  c = c.replace(/alert\('No se pudo ([^']+)'\)/g, (m, msg) => "_showToast('No se pudo " + msg + "', 'error')");
  // Warning
  c = c.replace(/alert\('Seleccione ([^']+)'\)/g, (m, msg) => "_showToast('Seleccione " + msg + "', 'warning')");
  c = c.replace(/alert\('Ingrese ([^']+)'\)/g, (m, msg) => "_showToast('Ingrese " + msg + "', 'warning')");
  c = c.replace(/alert\('Debe ([^']+)'\)/g, (m, msg) => "_showToast('Debe " + msg + "', 'warning')");
  c = c.replace(/alert\('Falta ([^']+)'\)/g, (m, msg) => "_showToast('Falta " + msg + "', 'warning')");
  // Remaining simple string alerts → info
  c = c.replace(/alert\('([^']+)'\)/g, (m, msg) => {
    if (msg.includes('_showToast')) return m;
    return "_showToast('" + msg + "', 'info')";
  });
  // Template literal alerts
  c = c.replace(/alert\(\`([^\`]+)\`\)/g, (m, msg) => "_showToast(`" + msg + "`, 'info')");
  // Concat alerts: alert('xxx: ' + var)
  c = c.replace(/alert\('([^']+)' \+ ([^)]+)\)/g, (m, pre, rest) => "_showToast('" + pre + "' + " + rest + ", 'error')");
  fs.writeFileSync(fp, c, 'utf8');
  const remaining = (c.match(/\balert\(/g) || []).length;
  console.log(f + ': ' + remaining + ' remaining');
});