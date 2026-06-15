import https from 'node:https';
const TOKEN = process.env.TOKEN;
const PROJ = 'knzmdwjmrhcoytmebdwa';

async function query(sql) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJ}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

console.log('=== Tablas n8n_* ===');
const r1 = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'n8n%' ORDER BY table_name");
console.log('STATUS:', r1.status);
for (const row of r1.data || []) console.log('  • ' + row.table_name);

console.log('\n=== Triggers n8n_* ===');
const r2 = await query("SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name LIKE 'n8n%' ORDER BY trigger_name");
console.log('STATUS:', r2.status);
if (!r2.data || r2.data.length === 0) console.log('  (sin triggers)');
for (const row of r2.data || []) console.log('  • ' + row.trigger_name + ' on ' + row.event_object_table);

console.log('\n=== Realtime publication incluye n8n_* ===');
const r3 = await query("SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename LIKE 'n8n%' ORDER BY tablename");
console.log('STATUS:', r3.status);
for (const row of r3.data || []) console.log('  • ' + row.schemaname + '.' + row.tablename);
