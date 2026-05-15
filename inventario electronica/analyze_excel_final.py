import pandas as pd

file = 'inventario electronica ssepi (2).xlsx'
# El header real esta en la fila 3 del Excel (index 2 en 0-based)
df = pd.read_excel(file, header=2)

# Eliminar filas completamente vacias
df = df.dropna(how='all')

# La primera columna se llama 'CDIGO MARKING' - renombrarla
code_col = df.columns[0]
df = df.rename(columns={code_col: 'CODIGO'})

print('=== COLUMNAS ===')
for c in df.columns:
    print(f'  - {c}')

print(f'\n=== DIMENSIONES ===')
print(f'Filas con datos: {len(df)}')

# Limpiar filas sin codigo
df_clean = df.dropna(subset=['CODIGO', 'DESCRIPCION DEL PRODUCTO'])
print(f'Filas validas (con codigo y descripcion): {len(df_clean)}')

print('\n=== PRIMEROS 15 PRODUCTOS ===')
print(df_clean[['CODIGO', 'DESCRIPCION DEL PRODUCTO', 'EXISTENCIA', 'UBICACION', 'ENCAPSULADO', 'COSTO UNITARIO MXN', 'TOTAL LINEA MXN']].head(15).to_string(index=False))

print('\n=== ESTADISTICAS GENERALES ===')
print(f'Total de piezas en inventario: {df_clean["EXISTENCIA"].sum()}')
print(f'Valor total del inventario: ${df_clean["TOTAL LINEA MXN"].sum():,.2f} MXN')
print(f'Costo unitario promedio: ${df_clean["COSTO UNITARIO MXN"].mean():.2f} MXN')
print(f'Costo unitario maximo: ${df_clean["COSTO UNITARIO MXN"].max():.2f} MXN')
print(f'Costo unitario minimo: ${df_clean["COSTO UNITARIO MXN"].min():.2f} MXN')

print('\n=== PRODUCTOS MAS VALIOSOS (Top 10 por valor total linea) ===')
top_valiosos = df_clean.nlargest(10, 'TOTAL LINEA MXN')[['CODIGO', 'DESCRIPCION DEL PRODUCTO', 'EXISTENCIA', 'COSTO UNITARIO MXN', 'TOTAL LINEA MXN']]
print(top_valiosos.to_string(index=False))

print('\n=== UBICACIONES ===')
ubicaciones = df_clean.groupby('UBICACION').agg({
    'EXISTENCIA': 'sum',
    'TOTAL LINEA MXN': 'sum',
    'CODIGO': 'count'
}).rename(columns={'CODIGO': 'CANT_SKUS'})
ubicaciones = ubicaciones.sort_values('TOTAL LINEA MXN', ascending=False)
print(ubicaciones.to_string())

print('\n=== ENCAPSULADOS MAS COMUNES ===')
encaps = df_clean.groupby('ENCAPSULADO').agg({
    'EXISTENCIA': 'sum',
    'CODIGO': 'count'
}).rename(columns={'CODIGO': 'CANT_LINEAS'}).sort_values('CANT_LINEAS', ascending=False)
print(encaps.head(15).to_string())

print('\n=== RESUMEN POR DESCRIPCION (tipos de componente) ===')
desc_summary = df_clean.groupby('DESCRIPCION DEL PRODUCTO').agg({
    'EXISTENCIA': 'sum',
    'CODIGO': 'count'
}).rename(columns={'CODIGO': 'LINEAS'}).sort_values('LINEAS', ascending=False)
print(desc_summary.head(20).to_string())
