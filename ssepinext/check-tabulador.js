const fs = require('fs');
const path = require('path');
const initSqlJs = require('./node_modules/sql.js');

const dbPath = path.join(__dirname, 'data', 'ssepi-local.db');
if (!fs.existsSync(dbPath)) {
    console.log('DB NO EXISTE');
    process.exit(1);
}

initSqlJs().then(SQL => {
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);
    const r = db.exec('SELECT nombre, km, horas_viaje FROM local_clientes_tabulador ORDER BY nombre');
    console.log(JSON.stringify(r, null, 2));
});
