# Calculadora de Costos - Tablas Editables

## Descripción

La calculadora de costos en el módulo de Ventas ahora permite **ver y editar** las tablas de costos directamente desde la interfaz, con cambios que se reflejan en tiempo real en todos los módulos (Ventas, Taller, Motores, Automatización).

## Migraciones Requeridas

Antes de usar la funcionalidad, ejecuta estas migraciones en Supabase SQL Editor:

### 1. Agregar columna `activo` a gastos_fijos

```sql
-- Archivo: agregar-columna-activo-gastos-fijos.sql
ALTER TABLE public.gastos_fijos
ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

ALTER TABLE public.gastos_fijos
ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();

UPDATE public.gastos_fijos SET activo = true WHERE activo IS NULL;
```

### 2. Crear función upsert_parametro_costo

```sql
-- Archivo: crear-funcion-upsert-parametros.sql
CREATE OR REPLACE FUNCTION upsert_parametro_costo(p_clave TEXT, p_valor NUMERIC)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.parametros_costos (clave, valor, descripcion)
    VALUES (p_clave, p_valor, 'Actualizado desde calculadora')
    ON CONFLICT (clave)
    DO UPDATE SET valor = EXCLUDED.valor, descripcion = 'Actualizado: ' || NOW();
END;
$$ LANGUAGE plpgsql;
```

## Uso

### Abrir Editor de Costos

1. En el módulo de **Ventas**, abre cualquier cotización
2. En la calculadora (Paso 2), haz clic en **"Ver/Editar Tablas de Costos y Gastos Fijos"**

### Secciones del Editor

#### 1. Parámetros de Costos

| Parámetro | Descripción | Valor por defecto |
|-----------|-------------|-------------------|
| Gasolina ($/L) | Precio por litro de gasolina | $24.50 |
| Rendimiento (km/L) | Kilómetros por litro del vehículo | 9.5 |
| Costo Técnico ($/hr) | Costo por hora de técnico | $104.16 |
| Camioneta ($/hr) | Costo de operación de camioneta | $39.35 |
| Utilidad (%) | Porcentaje de utilidad | 40% |
| Crédito (%) | Costo de crédito | 3% |
| IVA (%) | Impuesto al valor agregado | 16% |

#### 2. Gastos Fijos Mensuales

Lista de gastos fijos que se ratean por hora (base 160 hrs/mes):

- Renta: $24,360/mes
- Sueldos Base: $20,000/mes
- Luz: $1,500/mes
- Agua: $500/mes
- Internet: $600/mes
- Camioneta: $8,500/mes

**Total:** $55,920/mes → **$349.50/hr** (rateo)

Puedes:
- Agregar nuevos gastos con "Agregar Gasto"
- Editar montos y conceptos directamente en la tabla
- Desactivar gastos con el checkbox "Activo" (soft delete)

#### 3. Clientes Tabulador

Muestra los clientes con sus kilómetros y horas de viaje para viáticos.

**Nota:** Para editar clientes, ve al módulo de Contactos.

## Flujo de Actualización

1. **Editar parámetros** → Los inputs se actualizan en la UI
2. **Guardar cambios** → Se escriben en `parametros_costos` y `gastos_fijos`
3. **Recálculo automático** → `CostosEngine` se actualiza con nuevos valores
4. **Propagación** → Todos los módulos usan los nuevos costos automáticamente

## Tablas Involucradas

### `parametros_costos`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID | Primary key |
| clave | TEXT | Identificador único (gasolina, rendimiento, etc.) |
| valor | NUMERIC(10,2) | Valor del parámetro |
| descripcion | TEXT | Descripción del parámetro |

### `gastos_fijos`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID | Primary key |
| nombre | TEXT | Concepto del gasto |
| monto | NUMERIC(10,2) | Monto mensual |
| activo | BOOLEAN | true = activo, false = eliminado |
| actualizado_en | TIMESTAMPTZ | Fecha de última modificación |

### `clientes_tabulador`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| nombre_cliente | TEXT | Nombre del cliente |
| km | NUMERIC | Kilómetros de distancia |
| horas_viaje | NUMERIC | Horas estimadas de viaje |

## Fórmulas de Cálculo

### Costo de Gasolina
```
litros = km / rendimiento
costo_gasolina = litros * precio_gasolina
```

### Costo de Traslado
```
costo_traslado = horas_viaje * costo_tecnico
```

### Gastos Fijos (por hora)
```
total_gastos_mensuales = suma(gastos_fijos.monto)
gastos_fijos_hora = total_gastos_mensuales / 160
```

### Precio Final
```
gas_plus_ventas = costo_gasolina + costo_traslado
mano_obra = horas_taller * costo_tecnico
gastos_fijos = horas_taller * gastos_fijos_hora
camioneta = horas_viaje * camioneta_hora

gastos_generales = gas_plus_ventas + mano_obra + gastos_fijos + refacciones + camioneta
precio_con_utilidad = gastos_generales * (1 + utilidad/100)
precio_antes_iva = precio_con_utilidad * (1 + credito/100)
iva = precio_antes_iva * (iva/100)
total_con_iva = precio_antes_iva + iva
```

## Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `js/modules/ventas.js` | Funciones de carga/guardado de costos, editor modal |
| `js/core/costos-engine.js` | `loadFromDatabase()` para cargar config desde BD |
| `css/main.css` | Estilos para tablas dinámicas y modal grande |
| `scripts/migrations/*.sql` | Migraciones para columnas y funciones |

## Notas Importantes

1. **Permisos:** Solo administradores pueden editar costos
2. **Soft Delete:** Los gastos fijos se desactivan (no eliminan) para preservar histórico
3. **Rateo:** Gastos fijos se ratean sobre 160 horas mensuales
4. **Persistencia:** Cambios se guardan en BD y persisten entre sesiones
5. **Propagación:** Cambios afectan a TODOS los módulos inmediatamente
