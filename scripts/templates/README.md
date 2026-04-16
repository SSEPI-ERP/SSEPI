# 📁 Plantillas CSV para Importación SSEPI

## 🚀 Cómo Importar Datos

1. **Descargar la plantilla** del módulo que necesitas
2. **Llenar los datos** manteniendo los encabezados (primera fila)
3. **Ir a Configuración** → Sección "Importar/Exportar Datos"
4. **Seleccionar módulo** del dropdown
5. **Clic en "Importar CSV"** y seleccionar tu archivo
6. **Verificar en Bitácora** que la importación fue exitosa

## 📋 Plantillas Disponibles

| Módulo | Archivo | Columnas Principales |
|--------|---------|---------------------|
| Contactos | `contactos_template.csv` | nombre, empresa, email, teléfono |
| Inventario | `inventario_template.csv` | sku, nombre, categoria, stock, costo, precio_venta |
| BOM Automatización | `bom_automatizacion_template.csv` | item, numero_parte, descripcion, categoria, proveedor, precio_unitario |
| Servicios Automatización | `servicios_automatizacion_template.csv` | nombre, descripcion, area, costo_planta, costo_oficina |
| Gastos de Viaje | `gastos_viaje_template.csv` | cliente_id, concepto, monto, fecha, tipo |
| Fórmulas de Costos | `formulas_costos_template.csv` | calculadora_id, area, cliente, concepto, valor |

## 📝 Formato de Datos

- **ID**: Dejar vacío para autogenerar UUID
- **Fechas**: `YYYY-MM-DD` o `YYYY-MM-DD HH:MM:SS`
- **Moneda**: Usar punto decimal (ej: `100.00` no `100,00`)
- **Booleanos**: `true` / `false`
- **Codificación**: UTF-8

## ⚠️ Importante

- **No modificar los encabezados** de la primera fila
- **Primera fila después de encabezados** = primer registro a importar
- **SKU debe ser único** en inventario
- **Emails deben ser válidos** para contactos

## 🔍 Auditoría

Todas las importaciones se registran en:
- **Bitácora** en Configuración → Importar/Exportar
- **Notificaciones** a admins y Norberto
- **Tabla `audit_logs`** en Supabase
