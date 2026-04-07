## Cambios recientes (SSEPI COI)

### 2026-03-26

- **Motor contable (núcleo)**: pólizas con verificación/afectación, saldos por periodo (`saldos_cuenta`) y bloqueo de periodos a nivel motor.
- **CFDI → contabilidad**:
  - Vínculo **UUID → partida** (`cfdi_poliza.uuid` UNIQUE) al contabilizar XML.
  - Tablero CFDI muestra **“En contabilidad”** cuando el UUID ya está ligado a una partida.
- **Reportes**:
  - **Libro mayor** operativo.
  - **Impuestos (IVA/retenciones)** por periodo desde `cfdi_poliza`.
  - **Estado de resultados / Balance** mejorados para preferir `saldos_cuenta` (motor).
- **Fiscal SAT (XML)**:
  - Exportación de **Catálogo / Balanza / Pólizas** y paquete completo.
- **Seguridad**:
  - Gestión de **Usuarios y permisos** por módulo (bloquea pantallas sin permiso).
- **Multiempresa (base)**:
  - Selector de empresa activa y BD separada por empresa (`backend/database/empresas/*.db`).
- **Utilidades**:
  - Exportar a “Excel” ahora genera **CSV** compatible.
  - **Ayuda en línea** muestra documentación local (`docs/`).

