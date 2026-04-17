# Migraciones Requeridas - Calculadora de Costos

## Errores Corregidos

1. **pdf-generator.js**: Se eliminó código duplicado que causaba `Unexpected identifier 'generateOrdenCompra'`
2. **ventas.js**: Se agregó `async` a `_nuevaCotizacion()` para evitar `Unexpected reserved word`

## Migraciones a Ejecutar en Supabase SQL Editor

### 1. Agregar columna `activo` a gastos_fijos

```sql
-- Archivo: agregar-columna-activo-gastos-fijos.sql
ALTER TABLE public.gastos_fijos
ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

ALTER TABLE public.gastos_fijos
ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();

UPDATE public.gastos_fijos SET activo = true WHERE activo IS NULL;
```

### 2. Crear función `upsert_parametro_costo`

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

### 3. Poblar tabla clientes_tabulador

```sql
-- Archivo: poblar-clientes-tabulador.sql
-- Inserta 50+ clientes con KM y horas de viaje
INSERT INTO public.clientes_tabulador (nombre_cliente, km, horas_viaje) VALUES
    ('ANGUIPLAST', 234, 6),
    ('BOLSAS DE LOS ALTOS', 226, 5),
    ('ECOBOLSAS', 216, 5),
    ('BADER TABACHINES', 17.2, 2),
    -- ... (ver archivo completo)
ON CONFLICT (nombre_cliente) DO UPDATE SET
    km = EXCLUDED.km,
    horas_viaje = EXCLUDED.horas_viaje;
```

## Qué Hace Cada Migración

| Migración | Tabla | Propósito |
|-----------|-------|-----------|
| `agregar-columna-activo-gastos-fijos.sql` | `gastos_fijos` | Permite soft delete (desactivar sin borrar) |
| `crear-funcion-upsert-parametros.sql` | `parametros_costos` | Función para actualizar parámetros desde la UI |
| `poblar-clientes-tabulador.sql` | `clientes_tabulador` | Llena la tabla con 50+ clientes y sus viáticos |

## Cómo Verificar

Después de ejecutar las migraciones:

```sql
-- Verificar gastos_fijos
SELECT nombre, monto, activo FROM public.gastos_fijos;

-- Verificar parametros_costos
SELECT clave, valor FROM public.parametros_costos;

-- Verificar clientes_tabulador
SELECT COUNT(*) FROM public.clientes_tabulador;
SELECT * FROM public.clientes_tabulador ORDER BY nombre_cliente;
```

## Uso en el ERP

### En Ventas (Calculadora)

1. Abre Ventas → Nueva cotización
2. Paso 2 (Calculadora) → Clic en **"Ver/Editar Tablas de Costos y Gastos Fijos"**
3. Edita parámetros o gastos fijos
4. Guarda → Los cálculos se actualizan automáticamente

### En Calculadoras (Tablas de Viáticos)

1. Abre módulo Calculadoras
2. Baja hasta la sección **"Tablas de Viáticos por Departamento"**
3. Verás 5 tablas (T1-T5) con todos los clientes y sus costos de viáticos

## Parámetros por Defecto

| Concepto | Valor |
|----------|-------|
| Gasolina | $24.50/L |
| Rendimiento | 9.5 km/L |
| Costo Técnico | $104.16/hr |
| Gastos Fijos Hora | $124.18/hr |
| Camioneta | $39.35/hr |
| Utilidad | 40% |
| Crédito | 3% |
| IVA | 16% |

## Gastos Fijos Mensuales

| Concepto | Monto |
|----------|-------|
| Renta | $24,360 |
| Sueldos Base | $20,000 |
| Luz | $1,500 |
| Agua | $500 |
| Internet | $600 |
| Camioneta | $8,500 |
| **Total** | **$55,920/mes** → **$349.50/hr** (160 hrs/mes)
