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
  // Nota: en localhost HSTS no aplica en la práctica, pero se deja para producción/proxy.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  // Clickjacking
  'X-Frame-Options': 'DENY',
  // Reemplaza X-Frame-Options en navegadores modernos
  'Content-Security-Policy': [
    "default-src 'self'",
    // Se mantiene unsafe-inline por scripts inline existentes; evitar unsafe-eval.
    "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline'",
    "style-src 'self' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https://images.unsplash.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://api.ipify.org",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests'
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Hardening extra
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  // Aislación de origen para mitigar ataques de cross-origin
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Evita leaks a otros sitios; requiere HTTPS en producción para ser efectivo al 100%
  'Cross-Origin-Embedder-Policy': 'credentialless'
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
