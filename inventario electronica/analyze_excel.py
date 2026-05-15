import pandas as pd
import numpy as np

file = 'inventario electronica ssepi (2).xlsx'
df = pd.read_excel(file, header=None)

# La fila 1 (index 1) parece ser el header real
print('=== ESTRUCTURA REAL ===')
headers = df.iloc[1].tolist()
print('Headers de fila 1:')
for i, h in enumerate(headers):
    print(f'  Col {i}: {h}')

# Crear dataframe con datos reales desde fila 3 (index 3)
data = df.iloc[3:].copy()
data.columns = headers

# Limpiar: eliminar filas vacias
data = data.dropna(subset=[data.columns[0], data.columns[3]], how='all')

print(f'\nTotal filas de datos: {len(data)}')

print('\n=== PRIMERAS 10 FILAS ===')
print(data.head(10).to_string())

# Resumen por columnas clave
print('\n=== ESTADISTICAS ===')

# Descripciones unicas
desc_col = [c for c in data.columns if 'DESCRIPCION' in str(c).upper()][0]
print(f'\nProductos unicos: {data[desc_col].nunique()}')

# Ubicaciones
ubic_col = [c for c in data.columns if 'UBICACION' in str(c).upper()][0]
print(f'Ubicaciones: {sorted([x for x in data[ubic_col].unique() if pd.notna(x)])}')

# Encapsulados
encap_col = [c for c in data.columns if 'ENCAPSULADO' in str(c).upper()][0]
encaps = [x for x in data[encap_col].value_counts().head(10).index if pd.notna(x)]
print(f'Top encapsulados: {encaps}')

# Costo y totales
costo_col = [c for c in data.columns if 'COSTO UNITARIO' in str(c).upper()][0]
total_col = [c for c in data.columns if 'TOTAL LINEA' in str(c).upper()][0]

print(f'\nCosto unitario promedio: ${data[costo_col].mean():.2f} MXN')
print(f'Costo unitario max: ${data[costo_col].max():.2f} MXN')
print(f'Valor total inventario: ${data[total_col].sum():.2f} MXN')

# Existencias totales
exist_col = [c for c in data.columns if 'EXISTENCIA' in str(c).upper()][0]
print(f'Total piezas: {data[exist_col].sum()}')
