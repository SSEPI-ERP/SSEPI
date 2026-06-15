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

// Eliminar trigger duplicado en ventas (deja solo 1)
const dropDup = await query("DROP TRIGGER IF EXISTS n8n_ventas_queue ON public.ventas CASCADE; CREATE TRIGGER n8n_ventas_queue AFTER INSERT OR UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.n8n_enqueue_event();");
console.log('Limpieza trigger duplicado:', dropDup.status);

// Re-verificar
const r = await query("SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name LIKE 'n8n%' ORDER BY event_object_table, trigger_name");
console.log('\nTriggers finales:');
for (const row of r.data || []) console.log('  • ' + row.trigger_name + ' on ' + row.event_object_table);
