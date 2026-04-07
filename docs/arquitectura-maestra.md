# ARQUITECTURA MAESTRA SSEPI ERP

## Ubicación: D:\SSEPI

## Resumen
ERP SSEPI con arquitectura limpia y modular, Supabase como único backend, seguridad nivel 2027 e interfaz de grado industrial. La carpeta `ssepi/` (Firebase) se usa solo como referencia de flujos y pantallas; no se usa Firebase en la aplicación.

## Estructura de Directorios
D:\SSEPI
├── index.html              # Login
├── panel.html              # Dashboard
├── login.html, 404.html
├── css/
│   ├── main.css            # Global (claro/oscuro, .btn-ssepi)
│   └── modules/            # taller, motores, servicios, ventas, compras, etc.
├── js/
│   ├── core/
│   │   ├── supabase-config.js, auth-service.js, security-middleware.js
│   │   ├── data-service.js, encryption-utils.js, costos-engine.js
│   │   ├── contactos-formulas.js, pdf-generator.js, index-core.js
│   ├── modules/
│   │   ├── taller.js, motores.js, servicios.js, proyectos.js
│   │   ├── ventas.js, compras.js, inventario.js, contactos.js
│   │   ├── facturacion.js, contabilidad.js, analisis.js
├── pages/
│   ├── ssepi_taller.html, ssepi_motores.html, ssepi_servicios.html
│   ├── ssepi_proyectos.html, ssepi_ventas.html, ssepi_compras.html
│   ├── ssepi_productos.html, ssepi_contactos.html
│   ├── ssepi_facturacion.html, ssepi_contabilidad.html, ssepi_analisis.html
├── scripts/
│   ├── init.sql            # Esquema BD, RLS, triggers, auditoría
│   └── migrate.py
└── docs/
    ├── arquitectura-maestra.md
    └── security-architecture.md

ssepi/ = referencia (Firebase); no cargar en app.

## Limpieza
- La aplicación no carga Firebase; solo Supabase (ver .cursorrules).
- Archivos opcionales a evaluar: listado.txt, listado_completo.txt (raíz); scripts/supabase-config.js si duplica js/core/supabase-config.js.