import https from 'node:https';
const TOKEN = process.env.TOKEN;
const PROJ = 'knzmdwjmrhcoytmebdwa';
async function query(sql) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com', path: '/v1/projects/' + PROJ + '/database/query', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => { let body=''; res.on('data',d=>body+=d); res.on('end',()=>{ try{resolve({status:res.statusCode,data:JSON.parse(body)})}catch(e){resolve({status:res.statusCode,data:body})}}); });
    req.on('error', reject); req.end(payload);
  });
}

// Modificar policies para aceptar service_role explícitamente
const sql = `
  -- n8n_event_queue
  DROP POLICY IF EXISTS n8n_event_queue_service_all ON public.n8n_event_queue;
  DROP POLICY IF EXISTS n8n_event_queue_read ON public.n8n_event_queue;
  CREATE POLICY n8n_event_queue_service_all ON public.n8n_event_queue
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  CREATE POLICY n8n_event_queue_read ON public.n8n_event_queue
    FOR SELECT TO anon, authenticated USING (true);

  -- n8n_insights
  DROP POLICY IF EXISTS n8n_insights_read ON public.n8n_insights;
  DROP POLICY IF EXISTS n8n_insights_service_insert ON public.n8n_insights;
  DROP POLICY IF EXISTS n8n_insights_admin_update ON public.n8n_insights;
  CREATE POLICY n8n_insights_read ON public.n8n_insights
    FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY n8n_insights_service_all ON public.n8n_insights
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  CREATE POLICY n8n_insights_admin_update ON public.n8n_insights
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

  -- n8n_heartbeat
  DROP POLICY IF EXISTS n8n_heartbeat_read ON public.n8n_heartbeat;
  DROP POLICY IF EXISTS n8n_heartbeat_service_insert ON public.n8n_heartbeat;
  CREATE POLICY n8n_heartbeat_read ON public.n8n_heartbeat
    FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY n8n_heartbeat_service_all ON public.n8n_heartbeat
    FOR ALL TO service_role USING (true) WITH CHECK (true);
`;
const r = await query(sql);
console.log('Update policies:', r.status, JSON.stringify(r.data).substring(0, 200));

// Verify
const v = await query("SELECT polname, polcmd, polroles::regrole[]::text AS roles FROM pg_policy WHERE polrelid IN ('public.n8n_event_queue'::regclass, 'public.n8n_insights'::regclass, 'public.n8n_heartbeat'::regclass) ORDER BY polrelid::text, polname");
console.log('\nPolicies actualizadas:');
for (const row of v.data || []) console.log('  • ' + row.polname + ' cmd=' + row.polcmd + ' roles=' + row.roles);
