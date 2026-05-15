import http from 'http';

function request(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: 'localhost', port: 3333, path, headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Test 1: GET clientes_tabulador sin filtros
const r1 = await request('/proxy/rest/v1/clientes_tabulador?select=*&order=nombre_cliente.asc');
console.log('TEST 1 - GET sin filtros:');
console.log('  Length:', Array.isArray(r1) ? r1.length : 'N/A');
if (Array.isArray(r1) && r1.length > 0) {
  console.log('  First:', JSON.stringify(r1[0]));
}

// Test 2: GET con eq activo=true
const r2 = await request('/proxy/rest/v1/clientes_tabulador?select=nombre_cliente,km,horas_viaje,activo&activo=eq.true&order=nombre_cliente.asc');
console.log('\nTEST 2 - GET eq activo=true:');
console.log('  Length:', Array.isArray(r2) ? r2.length : 'N/A');
if (Array.isArray(r2) && r2.length > 0) {
  console.log('  First:', JSON.stringify(r2[0]));
}

// Test 3: GET contactos (que sí funciona según usuario)
const r3 = await request('/proxy/rest/v1/contactos?select=*&limit=5');
console.log('\nTEST 3 - GET contactos:');
console.log('  Length:', Array.isArray(r3) ? r3.length : 'N/A');
