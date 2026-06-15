import https from 'node:https';
const TOKEN = process.env.SUPABASE_MGMT_TOKEN;
const PROJ = 'knzmdwjmrhcoytmebdwa';

if (!TOKEN) {
    console.error('ERROR: Define SUPABASE_MGMT_TOKEN en env');
    process.exit(1);
}

function q(sql) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ query: sql });
        const r = https.request({
            hostname: 'api.supabase.com',
            path: `/v1/projects/${PROJ}/database/query`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, rs => {
            let b = '';
            rs.on('data', d => b += d);
            rs.on('end', () => {
                try { resolve({ s: rs.statusCode, d: JSON.parse(b) }); }
                catch { resolve({ s: rs.statusCode, d: b }); }
            });
        });
        r.on('error', reject);
        r.end(body);
    });
}

const r = await q("SELECT polname, polcmd, polroles::text, polqual::text FROM pg_policy WHERE polrelid = 'public.n8n_event_queue'::regclass ORDER BY polname");
console.log('Policies en n8n_event_queue:', r.s);
for (const p of r.d || []) console.log('  •', p.polname, '  cmd=' + p.polcmd, '  roles=' + p.polroles);

console.log('\nPolicies en n8n_insights:');
const r2 = await q("SELECT polname, polcmd, polroles::text FROM pg_policy WHERE polrelid = 'public.n8n_insights'::regclass ORDER BY polname");
console.log('  status:', r2.s);
for (const p of r2.d || []) console.log('  •', p.polname, '  cmd=' + p.polcmd, '  roles=' + p.polroles);

console.log('\nPolicies en n8n_heartbeat:');
const r3 = await q("SELECT polname, polcmd, polroles::text FROM pg_policy WHERE polrelid = 'public.n8n_heartbeat'::regclass ORDER BY polname");
console.log('  status:', r3.s);
for (const p of r3.d || []) console.log('  •', p.polname, '  cmd=' + p.polcmd, '  roles=' + p.polroles);
