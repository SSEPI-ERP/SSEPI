# Temas de COI pendientes por desarrollar

Lista de pendientes detectados en la app para planear siguientes iteraciones.

## 1) Menús marcados como "Próximamente" (pendientes directos)

- `Catálogos > Conceptos de póliza`
- `Reportes > Libro mayor`
- `Procesos > Cierre mensual`
- `Procesos > Cierre anual`
- `Configuración > Parámetros`
- `Configuración > Usuarios`
- `Ayuda > Ayuda en línea`

## 2) Módulo Bancos interno (nuevo) - siguientes mejoras

- Relacionar automáticamente cada banco con cuenta contable al capturar pólizas.
- Validar CLABE a 18 dígitos y formato por banco.
- Conciliación bancaria (estado de cuenta vs movimientos contables).
- Importación de movimientos bancarios (CSV/Excel).
- Reportes por banco: saldos, entradas/salidas, antigüedad.

## 3) Reportes contables y operación

- Libro mayor con filtros por cuenta/subcuenta y exportación.
- Auxiliar de cuentas con exportación detallada por RFC/UUID.
- Comparativos de periodos (mensual/anual) en tablas y gráficos.
- Cierre contable con validaciones (pólizas sin cuadrar, periodos bloqueados, etc.).

## 4) Timbrado e integración fiscal

- Panel de estado por proveedor fiscal (Facturama/Finkok/otros).
- Reintentos y bitácora de errores de timbrado por CFDI.
- Validaciones preventivas (moneda, RFC, claves SAT) antes de timbrar.
- Monitor de documentos timbrados/no contabilizados.

## 5) Catálogos y seguridad

- Gestión de usuarios con roles y permisos por módulo.
- Parámetros de empresa centralizados (rutas, folios, certificados).
- Auditoría extendida de cambios en catálogos clave.

## Apoyo requerido de negocio (lo que me puedes pasar)

- Capturas reales de pantallas Aspel para cada flujo pendiente.
- Reglas de negocio por proceso (ej. cierre mensual/anual).
- Formatos de reportes esperados (columnas, filtros, totales).
- Ejemplos de archivos bancarios (CSV/XLSX) para importar.
