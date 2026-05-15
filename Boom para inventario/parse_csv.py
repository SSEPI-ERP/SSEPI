import json, os
import pandas as pd

csv_path = r'C:\Users\norbe\Documents\robot_mecanum_esp32_v3\Boom para inventario\BOM_SSEPI(BOM) (1).csv'

df = pd.read_csv(csv_path, sep=';', encoding='cp1252', quotechar='"', header=1, dtype=str, keep_default_na=False)

# Fix encoding artifacts
for col in df.columns:
    df[col] = df[col].str.replace('´', "'", regex=False)  # acute accent
    df[col] = df[col].str.replace('“', '"', regex=False)   # left double quote
    df[col] = df[col].str.replace('”', '"', regex=False)   # right double quote
    df[col] = df[col].str.replace('‘', "'", regex=False)   # left single quote
    df[col] = df[col].str.replace('’', "'", regex=False)   # right single quote
    df[col] = df[col].str.replace('–', '-', regex=False)   # en dash
    df[col] = df[col].str.replace('—', '-', regex=False)   # em dash

# Remove empty rows
df = df[df.iloc[:, 0].astype(str).str.strip() != ''].reset_index(drop=True)
mask = ~((df.iloc[:, 1].astype(str).str.strip() == '') & (df.iloc[:, 2].astype(str).str.strip() == '') & (df.iloc[:, 4].astype(str).str.strip() == ''))
df = df[mask].reset_index(drop=True)

print(f'Rows after cleaning: {len(df)}')

items = []
for i, row in df.iterrows():
    item_num = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ''
    part_number = str(row.iloc[1]).strip() if len(row) > 1 and pd.notna(row.iloc[1]) else ''
    desc_raw = str(row.iloc[2]).strip() if len(row) > 2 and pd.notna(row.iloc[2]) else ''
    description = desc_raw.replace('\n', ' ').replace('\r', ' ').replace('  ', ' ')
    has_image = 'imagen' in str(row.iloc[3]).lower() if len(row) > 3 else False
    category = str(row.iloc[4]).strip() if len(row) > 4 and pd.notna(row.iloc[4]) else ''
    status = str(row.iloc[5]).strip() if len(row) > 5 and pd.notna(row.iloc[5]) else ''

    suppliers = []
    for base in [6, 10, 14, 18]:
        if len(row) <= base:
            continue
        name = str(row.iloc[base]).strip() if pd.notna(row.iloc[base]) else ''
        price = str(row.iloc[base + 1]).strip() if len(row) > base + 1 and pd.notna(row.iloc[base + 1]) else ''
        delivery = str(row.iloc[base + 2]).strip() if len(row) > base + 2 and pd.notna(row.iloc[base + 2]) else ''
        link = str(row.iloc[base + 3]).strip() if len(row) > base + 3 and pd.notna(row.iloc[base + 3]) else ''
        if name or price or link:
            suppliers.append({'name': name, 'price': price, 'delivery': delivery, 'link': link})

    items.append({
        'item': item_num,
        'partNumber': part_number,
        'description': description,
        'hasImage': has_image,
        'category': category,
        'status': status,
        'suppliers': suppliers
    })

print(f'Total items: {len(items)}')
for i in range(min(5, len(items))):
    it = items[i]
    pn = it['partNumber'][:30]
    cat = it['category'][:25]
    desc = it['description'][:50]
    print(f'  #{it["item"]}: pn=[{pn}], cat=[{cat}], desc=[{desc}...]')

# DOP items
for it in items:
    if 'DOP' in it['partNumber']:
        print(f'  DOP: #{it["item"]}, pn=[{it["partNumber"]}], cat=[{it["category"]}]')

# Last 3
for it in items[-3:]:
    print(f'  LAST: #{it["item"]}, pn=[{it["partNumber"][:30]}], cat=[{it["category"][:20]}]')

out_path = r'C:\Users\norbe\Documents\robot_mecanum_esp32_v3\Boom para inventario\bom_data.js'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('const BOM_DATA = ')
    json.dump(items, f, ensure_ascii=False, indent=1)
    f.write(';\n')

size = os.path.getsize(out_path)
print(f'\nFile size: {size / 1024:.0f} KB')
print('Done!')