# Flujo: Balanza → Timbrar → Catálogo

Documento de diseño del flujo contable y fiscal que el sistema debe soportar.

## Flujo deseado

1. **Balanza**  
   Se genera una balanza para poder facturar. La suma debe ser **0** (cargos = abonos). En ella se llevan adeudos y pagos. Se confirma y se envía al módulo de timbrar.

2. **Módulo de timbrar**  
   Se corrobora la orden (datos de la balanza). Se elige el **cliente**. Solo se necesita:
   - Cliente (receptor)
   - Costo del timbre (y conceptos de la factura: descripción, cantidad, valor unitario, clave producto, unidad; todo escrito por el usuario, sin listas con memoria).

3. **Después del timbrado y la balanza**  
   Se envía a **Catálogo**. Se agrupa la información **a doc del cliente**: se define el tipo de cliente (nacional, extranjero, parte relacionada, etc.) y se organiza por timbres, facturas, gastos y compras.

## Objetivo: “motor” de agrupación

Un motor que, de forma similar a Finkok, vaya llenando y agrupando automáticamente por:

- **Timbres y facturas** (ingresos / ventas)
- **Gastos y compras**

Todo agrupado por cliente y tipo de cliente, integrado con el catálogo de cuentas (por ejemplo 105.01, 105.02, 105.03, 105.04 según el tipo de cliente).

## Estado actual

- **Balanza:** existe generación de balanza (XML y lógica). Falta enlazar “confirmar balanza” → “ir a timbrar con estos datos”.
- **Timbrar:** módulo Factura con cliente + conceptos (descripción, cantidad, valor unit., clave prod., unidad como campos de texto libres). Error 705 tratado con mensaje claro (timbres insuficientes).
- **Catálogo:** catálogo de cuentas con niveles (ej. 105 Clientes y subcuentas 105.01–105.04). Falta agrupar facturas timbradas y movimientos por cliente/tipo y volcarlos al catálogo.

## Próximos pasos (implementación futura)

- Enlazar Balanza confirmada → abrir Módulo SAT/Factura con datos precargados (opcional).
- Campo o pantalla para “costo del timbre” en la factura.
- Tras timbrar: guardar factura timbrada asociada a cliente y tipo de cliente; alimentar catálogo/registros agrupados por cliente (timbres, facturas, gastos, compras).
- Definir en Catálogo (o en Clientes) el “tipo de cliente” (nacional, extranjero, parte relacionada) para asignar automáticamente la subcuenta 105.01, 105.02, etc.

Este documento se actualiza al añadir o cambiar funcionalidad; no se borra configuración existente, solo se actualiza y añade.
