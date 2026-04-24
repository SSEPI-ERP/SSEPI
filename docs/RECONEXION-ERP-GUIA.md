# GUÍA DE RECONEXIÓN - ERP SSEPI

**Fecha:** 2026-04-23  
**Objetivo:** Reconectar todos los módulos del ERP para que el flujo de información sea correcto

---

## 📋 RESUMEN EJECUTIVO

El ERP tiene **5 módulos operativos** que deben fluir así:

```
VENTAS → TALLER/MOTORES/AUTO → COMPRAS → ALMACÉN → FACTURACIÓN → CONTABILIDAD
```

**Problema actual:** La información se guarda pero no hay conexión real entre módulos. Los datos están en JSON, no hay auditoría de inventario, y las notificaciones no son confiables.

**Solución:** 4 tablas nuevas + 3 funciones SQL + actualización de módulos JS

---

## 🔧 PASO 1: EJECUTAR SQL EN SUPABASE

### 1.1 Abrir Supabase Dashboard
1. Ve a https://supabase.com/dashboard
2. Selecciona tu proyecto SSEPI
3. Ve a **SQL Editor** (menú izquierdo)

### 1.2 Ejecutar migración
1. Abre el archivo: `scripts/migrations/reconectar-flujo-erp-2026-04-23.sql`
2. Copia TODO el contenido
3. Pégalo en el SQL Editor de Supabase
4. Haz clic en **Run** (o Ctrl+Enter)

### 1.3 Verificar éxito
Deberías ver mensaje: `Success. No rows returned`

Si hay error, revisa:
- ¿Ya existen las tablas? → El script usa `IF NOT EXISTS`
- ¿Hay dependencias circulares? → El script está ordenado correctamente
- ¿Permisos insuficientes? → Debes ser owner del schema

### 1.4 Tablas creadas
Después de ejecutar, verifica en **Table Editor**:
- ✅ `compras_items` - Items normalizados de compras
- ✅ `reservas_material` - Reservas de inventario por orden
- ✅ `movimientos_inventario` - Auditoría de entradas/salidas
- ✅ `ordenes_costos` - Costos consolidados por orden
- ✅ `costos_por_orden` - Vista para facturación

---

## 🛒 PASO 2: ACTUALIZAR MÓDULO COMPRAS

### 2.1 Qué cambia
- Los items ya no están en JSON `compras.items`
- Ahora hay una tabla `compras_items` con FK a `compras.id`
- Se agrega botón "Recibir" que actualiza inventario automáticamente

### 2.2 Archivos a modificar
- `panel/js/modules/compras.js`

### 2.3 Cambios específicos

#### Al crear compra (línea ~800):
**ANTES:**
```javascript
const nuevaCompra = {
    folio: `PO-${folioTaller}`,
    items: itemsCompra,  // JSON array
    // ...
};
await comprasService.insert(nuevaCompra, csrfToken);
```

**DESPUÉS:**
```javascript
// 1. Insertar compra sin items
const nuevaCompra = {
    folio: `PO-${folioTaller}`,
    items: [],  // Vacío, los items van en otra tabla
    // ...
};
const compraRef = await comprasService.insert(nuevaCompra, csrfToken);

// 2. Insertar items en tabla normalizada
const itemsService = createDataService('compras_items');
for (const item of itemsCompra) {
    await itemsService.insert({
        compra_id: compraRef.id,
        sku: item.sku,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        costo_unitario: item.costo_unitario || 0,
        costo_total: (item.cantidad || 1) * (item.costo_unitario || 0),
        link_proveedor: item.link
    }, csrfToken);
}
```

#### Al recibir compra (NUEVO botón):
```javascript
async function _recibirCompra(compraId) {
    if (!confirm('¿Confirmar recepción de materiales?')) return;

    const csrfToken = sessionStorage.getItem('csrfToken');
    try {
        // Llamar a función SQL
        const { error } = await window.supabase.rpc('recibir_compra', {
            p_compra_id: compraId,
            p_usuario_id: authService.getCurrentUser()?.usuarios_id
        });

        if (error) throw error;

        _showToast('✅ Compra recibida. Inventario actualizado.', 'success');
        await _loadCompras();  // Recargar vista
    } catch (error) {
        console.error(error);
        _showToast('Error al recibir: ' + error.message, 'error');
    }
}
```

---

## 🔧 PASO 3: ACTUALIZAR MÓDULO TALLER/MOTORES

### 3.1 Qué cambia
- Antes de enviar a compras, se **reserva** el material disponible
- Si no hay stock suficiente, se bloquea el envío hasta que llegue
- Al recibir la compra, se actualiza inventario automáticamente

### 3.2 Archivos a modificar
- `panel/js/modules/taller.js`
- `panel/js/modules/motores.js`

### 3.3 Cambios específicos

#### Al enviar a compras (después de diagnóstico):
**ANTES:** (taller.js línea ~1740)
```javascript
const itemsCompra = [
    ...diagnosticoEnlaces.map(e => ({ sku: e.sku, descripcion: e.descripcion, cantidad: e.cantidad })),
    ...diagnosticoInventario.map(i => ({ sku: i.sku, descripcion: i.descripcion, cantidad: i.cantidad }))
];
// Envía directo a compras
const nuevaCompra = { ... };
await comprasService.insert(nuevaCompra, csrfToken);
```

**DESPUÉS:**
```javascript
const itemsCompra = [
    ...diagnosticoEnlaces.map(e => ({ sku: e.sku, descripcion: e.descripcion, cantidad: e.cantidad })),
    ...diagnosticoInventario.map(i => ({ sku: i.sku, descripcion: i.descripcion, cantidad: i.cantidad }))
];

// 1. Intentar reservar material disponible
try {
    const { error } = await window.supabase.rpc('reservar_material', {
        p_orden_id: orderId,
        p_orden_tipo: 'taller',  // o 'motores'
        p_items: JSON.stringify(itemsCompra)
    });
    if (error) throw error;

    _showToast('✅ Material reservado. Stock disponible.', 'success');
} catch (error) {
    // 2. Si no hay stock, avisar pero permitir continuar
    _showToast('⚠️ Stock insuficiente. Se generará compra.', 'warning');
}

// 3. Enviar a compras (igual que antes)
const nuevaCompra = { ... };
await comprasService.insert(nuevaCompra, csrfToken);
```

#### Al terminar reparación (para liberar reservas no usadas):
```javascript
// Después de guardar orden como "Reparado"
const itemsNoUsados = itemsReservados.filter(i => !itemsUsados.some(u => u.sku === i.sku));
for (const item of itemsNoUsados) {
    await window.supabase.rpc('registrar_movimiento_inventario', {
        p_sku: item.sku,
        p_tipo: 'cancelacion_reserva',
        p_cantidad: item.cantidad,
        p_origen: 'taller',
        p_origen_id: orderId,
        p_notas: 'Liberación de reserva no usada'
    });
}
```

---

## 📦 PASO 4: ACTUALIZAR MÓDULO FACTURACIÓN

### 4.1 Qué cambia
- Los costos ya no se calculan en el frontend
- Se usa la vista `costos_por_orden` que suma todo automáticamente
- La factura refleja costos reales, no estimados

### 4.2 Archivos a modificar
- `panel/js/modules/facturacion.js`

### 4.3 Cambios específicos

#### Al cargar costos de orden (línea ~550):
**ANTES:**
```javascript
const calculo = CostosEngine.calcularPrecioFinal({
    km: orden.km,
    horasViaje: orden.horas_viaje,
    horasTaller: orden.horas_taller,
    costoRefacciones: orden.refacciones_costo
});
```

**DESPUÉS:**
```javascript
// Obtener costos reales desde BD
const { data: costos } = await window.supabase
    .from('costos_por_orden')
    .select('*')
    .eq('orden_id', orden.id)
    .single();

if (costos) {
    // Usar costos reales
    mostrarCostos({
        compras: costos.compras_total,
        refacciones: costos.refacciones_total,
        mano_obra: costos.mano_obra_total,
        viaticos: costos.viaticos_total,
        gastos_fijos: costos.gastos_fijos_total,
        total: costos.costo_total
    });
} else {
    // Fallback a cálculo estimado
    const calculo = CostosEngine.calcularPrecioFinal({...});
    mostrarCostos(calculo);
}
```

---

## ✅ PASO 5: VERIFICAR FUNCIONAMIENTO

### 5.1 Flujo completo de prueba

1. **Ventas:** Crear orden de venta → Verificar que se crea `ordenes_taller` con folio SP-E
2. **Taller:** Agregar diagnóstico con refacciones → Verificar que se crea registro en `reservas_material`
3. **Compras:** Ver solicitud → Verificar que items están en `compras_items` (no en JSON)
4. **Almacén:** Click "Recibir" → Verificar que `inventario.cantidad` aumenta y hay registro en `movimientos_inventario`
5. **Taller:** Marcar "Reparado" → Verificar que `ordenes_taller.por_facturar = true`
6. **Facturación:** Ver orden → Verificar que muestra costos reales de `costos_por_orden`
7. **Contabilidad:** Generar factura → Verificar que se encola job en `coi_sync_queue`

### 5.2 Consultas de verificación

```sql
-- Ver reservas activas
SELECT * FROM reservas_material WHERE estado = 'activa';

-- Ver movimientos de inventario recientes
SELECT * FROM movimientos_inventario ORDER BY created_at DESC LIMIT 20;

-- Ver costos por orden
SELECT * FROM costos_por_orden WHERE orden_id = 'UUID_DE_ORDEN';

-- Ver compras con items
SELECT c.folio, COUNT(i.id) as items_count
FROM compras c
LEFT JOIN compras_items i ON i.compra_id = c.id
GROUP BY c.id, c.folio;
```

---

## 🔒 PERMISOS Y RLS

Todas las tablas nuevas tienen RLS habilitado:

| Tabla | Quién puede leer | Quién puede escribir |
|-------|-----------------|---------------------|
| `compras_items` | Todos autenticados | admin, superadmin, compras |
| `reservas_material` | Todos autenticados | admin, superadmin, taller, motores, automatizacion |
| `movimientos_inventario` | Todos autenticados | admin, superadmin, almacen |
| `ordenes_costos` | Todos autenticados | admin, superadmin |

Si un usuario no puede acceder, agregar permiso:
```sql
INSERT INTO public.role_permissions (rol, modulo, permiso)
VALUES ('tu_rol', 'tu_tabla', 'write');
```

---

## 📞 SOPORTE

Si algo falla:

1. **Error de SQL:** Revisar logs en Supabase → Query History
2. **Error de permisos:** Verificar `role_permissions` en BD
3. **Error de frontend:** Abrir consola del navegador (F12) y buscar errores rojos
4. **Datos inconsistentes:** Ejecutar `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50`

---

**Fin de la guía**
