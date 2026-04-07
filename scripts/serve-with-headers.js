#!/usr/bin/env node
/**
 * Servidor de desarrollo con cabeceras de seguridad (HSTS, X-Frame-Options, etc.).
 * Uso: node scripts/serve-with-headers.js
 * Sirve la raíz del proyecto en http://localhost:8081
 * En producción, configurar estas cabeceras en el reverse proxy (nginx, Cloudflare, etc.).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;
const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

const server = http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url;
  file = path.join(ROOT, file.split('?')[0]);
  if (!path.resolve(file).startsWith(path.resolve(ROOT))) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(500);
      res.end();
      return;
    }
    const ext = path.extname(file);
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, ...SECURITY_HEADERS });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('SSEPI dev server: http://localhost:' + PORT + ' (security headers enabled)');
});
