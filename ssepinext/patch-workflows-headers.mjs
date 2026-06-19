// patch-workflows-headers.mjs
// Agrega header "Authorization: Bearer" a cada nodo HTTP de los workflows n8n.
// Razón: PostgREST con solo apikey = rol anon, anon solo puede SELECT.
// PATCH/POST requieren Authorization Bearer (service_role).
//
// USO: SUPABASE_SERVICE_KEY=... SUPABASE_ANON_KEY=... node patch-workflows-headers.mjs
// Lee de env vars para no commitear credenciales.

import fs from 'node:fs';
import http from 'node:http';

const SVC = process.env.SUPABASE_SERVICE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!SVC || !ANON) {
    console.error('ERROR: Define SUPABASE_SERVICE_KEY y SUPABASE_ANON_KEY en env');
    process.exit(1);
}

const jar = process.env.N8N_COOKIE_JAR || 'C:/Users/norbe/AppData/Local/Temp/n8n-cookies.txt';
const cookieData = fs.readFileSync(jar, 'utf8')
    .split('\n').filter(l => l.includes('n8n-auth'))
    .map(l => l.split('\t'))
    .map(p => p[5] + '=' + p[6].trim())
    .join('; ');

function call(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : '';
        const r = http.request({
            hostname: 'localhost', port: 5679, path, method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'Cookie': cookieData
            }
        }, res => {
            let buf = '';
            res.on('data', d => buf += d);
            res.on('end', () => resolve({ status: res.statusCode, data: buf }));
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

const ids = [
    { id: '0v5lJwZ8VXLBZ19g', name: '00-event-poller' },
    { id: 'X2mLho1kUkPvIvKR', name: '01-heartbeat' },
    { id: 'hw1BcnwOQ3WouY3X', name: '02-coi-cloud-processor' },
    { id: 'tY0liOlZZWARiWZY', name: '03-cross-module-notifier' },
    { id: 'ent5xT2GHfzAsjXK', name: '04-cerebro-ventas' },
    { id: 'TNHriJqfMbTufe2L', name: '05-pipeline-tracker' },
    { id: 'zXxh63g2bCjr6E7g', name: '06-email-intelligence' },
    { id: '79SOdFtub5e9mPY7', name: '07-smart-audit' },
    { id: 'MIZDLi9gRgBqLQc9', name: '08-daily-digest' },
    { id: '7B3WUYz5nDusRb2O', name: '09-alarmas-dispatcher' },
    { id: 'QSEfjvAaFJycGYLt', name: '10-alarmas-templates-checker' }
];

const SVC_CRED = 'HlITLUOguMja9wG3';
const ANON_CRED = 'GzxyEoh68l466NOF';

for (const { id, name } of ids) {
    const get = await call('GET', `/rest/workflows/${id}`);
    if (get.status !== 200) { console.log(`  ✗ ${name} GET ${get.status}`); continue; }
    const w = JSON.parse(get.data).data;

    let modified = false;
    for (const node of (w.nodes || [])) {
        if (node.type !== 'n8n-nodes-base.httpRequest') continue;
        const cred = node.credentials?.httpHeaderAuth;
        if (!cred) continue;

        const isSvc = cred.id === SVC_CRED;
        const tokenValue = isSvc ? SVC : ANON;

        node.parameters.sendHeaders = true;
        if (!node.parameters.headerParameters) {
            node.parameters.headerParameters = { parameters: [] };
        }
        if (!node.parameters.headerParameters.parameters) {
            node.parameters.headerParameters.parameters = [];
        }
        const hdrs = node.parameters.headerParameters.parameters;
        const filtered = hdrs.filter(h => h.name !== 'Authorization');
        filtered.push({ name: 'Authorization', value: `Bearer ${tokenValue}` });
        node.parameters.headerParameters.parameters = filtered;
        modified = true;
    }

    if (modified) {
        w.versionId = undefined;
        w.checksum = undefined;
        w.pinData = undefined;
        const patch = await call('PATCH', `/rest/workflows/${id}`, w);
        if (patch.status === 200) {
            console.log(`  ✓ ${name} (${id})`);
        } else {
            console.log(`  ✗ ${name} → ${patch.status} ${patch.data.substring(0, 200)}`);
        }
    } else {
        console.log(`  - ${name} (sin nodos HTTP con credencial)`);
    }
}
