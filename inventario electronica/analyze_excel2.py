import pandas as pd

file = 'inventario electronica ssepi (2).xlsx'
df = pd.read_excel(file, header=None)

print('=== FILAS 0-5 ===')
for i in range(6):
    print(f'Fila {i}: {df.iloc[i].tolist()}')
    print()
