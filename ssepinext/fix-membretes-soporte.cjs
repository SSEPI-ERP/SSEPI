const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'panel', 'js', 'core', 'membretes_base64.js');
const content = fs.readFileSync(file, 'utf8');

// Extract electronicos value
const match = content.match(/electronicos:\s*"([^"]+)"/);
if (!match) {
    console.error('No se encontró electronicos en membretes_base64.js');
    process.exit(1);
}
const electronicosVal = match[1];

// Check if soporte already exists
if (content.includes('soporte:')) {
    console.log('soporte ya existe en membretes_base64.js');
    process.exit(0);
}

// Insert soporte before the closing };
const newContent = content.replace(
    /};\s*$/,
    `    soporte: "data:image/jpeg;base64,${electronicosVal}",\n};`
);

fs.writeFileSync(file, newContent, 'utf8');
console.log('soporte agregado a membretes_base64.js (copiado de electronicos)');
