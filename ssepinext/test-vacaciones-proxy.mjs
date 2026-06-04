import http from 'http';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 3333, path }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

const paths = [
  '/proxy/rest/v1/vacaciones_empleados?select=id,nombre&order=orden.asc',
  '/proxy/rest/v1/vacaciones_dias_feriados?select=fecha,nombre&order=fecha.asc',
  '/proxy/rest/v1/vacaciones_balance?select=*&user_id=eq.user-011',
  '/proxy/rest/v1/vacaciones_balance?select=user_id,anio&limit=3',
];

for (const p of paths) {
  const r = await get(p);
  const label = p.split('?')[0].split('/').pop();
  const n = Array.isArray(r.body) ? r.body.length : r.body;
  console.log(label, r.status, n);
}
