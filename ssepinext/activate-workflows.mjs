import fs from 'node:fs';
import http from 'node:http';

const jar = 'C:/Users/norbe/AppData/Local/Temp/n8n-cookies.txt';
const cookieData = fs.readFileSync(jar, 'utf8')
    .split('\n').filter(l => l.includes('n8n-auth'))
    .map(l => l.split('\t'))
    .map(p => p[5] + '=' + p[6].trim())
    .join('; ');

console.log('Cookie len:', cookieData.length);

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
    'hw1BcnwOQ3WouY3X', 'tY0liOlZZWARiWZY', 'ent5xT2GHfzAsjXK',
    'TNHriJqfMbTufe2L', 'zXxh63g2bCjr6E7g', '79SOdFtub5e9mPY7',
    '7B3WUYz5nDusRb2O', 'QSEfjvAaFJycGYLt'
];

for (const id of ids) {
    const get = await call('GET', '/rest/workflows/' + id);
    if (get.status !== 200) { console.log('  ✗ ' + id + ' GET ' + get.status); continue; }
    const w = JSON.parse(get.data);
    w.active = true;
    delete w.versionId; delete w.checksum; delete w.pinData;
    const patch = await call('PATCH', '/rest/workflows/' + id, w);
    if (patch.status === 200 && JSON.parse(patch.data).active === true) {
        console.log('  ✓ ' + id);
    } else {
        console.log('  ✗ ' + id + ' → ' + patch.status + ' ' + patch.data.substring(0, 200));
    }
}
