# Plantillas CSV para Importación/Exportación SSEPI

## Instrucciones de uso

### Importar datos
1. Descargar la plantilla CSV correspondiente
2. Llenar los datos manteniendo los encabezados
3. En Configuración > Importar/Exportar, seleccionar el archivo CSV
4. El sistema validará y registrará la acción en la bitácora de auditoría

### Exportar datos
1. En Configuración > Importar/Exportar, hacer clic en "Exportar"
2. El archivo CSV se descargará automáticamente
3. La acción queda registrada en la bitácora de auditoría

## Formato de archivos

- **Codificación**: UTF-8
- **Separador**: Coma (,)
- **Fechas**: YYYY-MM-DD o YYYY-MM-DD HH:MM:SS
- **UUID**: Formato estándar (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) o dejar vacío para autogenerar
- **Booleanos**: true/false o 1/0

## Módulo de Auditoría

Todas las importaciones/exportaciones se registran en la tabla `audit_logs` con:
- Usuario que realizó la acción
- Tipo de acción (import/export)
- Módulo afectado
- Registros procesados
- Errores encontrados
- IP y user agent

Los administradores reciben notificación de estas acciones.
