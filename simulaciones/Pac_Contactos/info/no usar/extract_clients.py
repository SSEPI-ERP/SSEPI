import pandas as pd
import json
import numpy as np

excel_file = 'TABULADOR DE COTIZACIÓN.xlsx'

# Dictionary to hold client data keyed by normalized name
clients_dict = {}

# Process each sheet
excel_data = pd.ExcelFile(excel_file)
sheet_names = excel_data.sheet_names

print(f'Processing {len(sheet_names)} sheets: {sheet_names}')

for sheet_name in sheet_names:
    print(f'\nProcessing sheet: {sheet_name}')
    try:
        df = pd.read_excel(excel_file, sheet_name=sheet_name)
        print(f'  Shape: {df.shape}')
        print(f'  Columns: {list(df.columns)}')

        # Assume first column contains client names
        if len(df.columns) > 0:
            name_col = df.columns[0]
            print(f'  Using column "{name_col}" for client names')

            # Process each row
            for idx, row in df.iterrows():
                # Get client name from first column
                raw_name = row.iloc[0]
                if pd.isna(raw_name):
                    continue

                name = str(raw_name).strip()
                if name == '' or name.lower() in ['empresa', 'unnamed: 0']:
                    continue  # Skip header rows or empty names

                # Normalize name for use as key (remove extra spaces, standardize)
                norm_name = ' '.join(name.split())  # Normalize whitespace

                # Initialize client entry if not seen before
                if norm_name not in clients_dict:
                    clients_dict[norm_name] = {
                        'name': name,  # Keep original name for display
                        'sheet_data': {},  # Store data from each sheet
                        'sheets': set()  # Track which sheets this client appears in
                    }

                # Store data from this sheet
                # We'll store the entire row as a dictionary, excluding the name column
                sheet_data = {}
                for col_idx, col_name in enumerate(df.columns):
                    if col_idx == 0:  # Skip name column
                        continue
                    value = row.iloc[col_idx]
                    # Handle NaN values
                    if pd.isna(value):
                        sheet_data[col_name] = None
                    else:
                        sheet_data[col_name] = value

                clients_dict[norm_name]['sheet_data'][sheet_name] = sheet_data
                # Track that this client appears in this sheet
                clients_dict[norm_name]['sheets'].add(sheet_name)
        else:
            print(f'  Warning: Sheet {sheet_name} has no columns')

    except Exception as e:
        print(f'  Error processing sheet {sheet_name}: {e}')

print(f'\nFound {len(clients_dict)} unique clients')

# Convert to list format similar to DB_CLIENTS
clients_list = []
for norm_name, data in clients_dict.items():
    # Start with basic info
    client = {
        'name': data['name'],
        # We'll add numeric fields and other data below
    }

    # Try to extract standardized fields if possible
    # For now, we'll keep it simple and just preserve the raw data

    # Add a simple numeric ID
    client['num'] = len(clients_list) + 1

    # Add sheets information (convert set to sorted list for JSON)
    client['sheets'] = sorted(list(data['sheets']))

    # Initialize the c1-c6 fields with defaults - we'll try to fill them if possible
    client['c1'] = 0.0
    client['c2'] = 0.0
    client['c3'] = 0.0
    client['c4'] = 0.0
    client['c5'] = 0.0
    client['c6'] = 0.0
    client['address'] = ''
    client['rfc'] = ''
    client['contact'] = ''

    # Try to extract c1, c2, c4 from Hoja1 if available
    if 'Hoja1' in data['sheet_data']:
        hoja1_data = data['sheet_data']['Hoja1']
        try:
            if 'KM  X2' in hoja1_data and hoja1_data['KM  X2'] is not None:
                client['c1'] = float(hoja1_data['KM  X2'])
            if 'LITROS' in hoja1_data and hoja1_data['LITROS'] is not None:
                client['c2'] = float(hoja1_data['LITROS'])
            if 'HRS ' in hoja1_data and hoja1_data['HRS '] is not None:
                client['c4'] = float(hoja1_data['HRS '])
        except (ValueError, TypeError, KeyError):
            pass  # Keep defaults if conversion fails

    # Calculate c5 = c4 * 125
    client['c5'] = client['c4'] * 125

    # For c3 and c6, we'll leave them as 0 for now or try to find better values
    # In a more complete implementation, we would look for these in other sheets
    client['c6'] = client['c3'] + client['c5']  # Will be 0 + c5 = c5 for now

    clients_list.append(client)

# Sort by name for consistent ordering
clients_list.sort(key=lambda x: x['name'])

# Save to JSON file
output_file = 'clients_from_excel.json'
with open(output_file, 'w') as f:
    json.dump(clients_list, f, indent=2)

print(f'\nSaved {len(clients_list)} clients to {output_file}')

# Show first few clients as examples
print('\nFirst 3 clients:')
for i in range(min(3, len(clients_list))):
    print(f'\nClient {i+1}:')
    print(f'  Name: {clients_list[i]["name"]}')
    print(f'  c1: {clients_list[i]["c1"]}')
    print(f'  c2: {clients_list[i]["c2"]}')
    print(f'  c3: {clients_list[i]["c3"]}')
    print(f'  c4: {clients_list[i]["c4"]}')
    print(f'  c5: {clients_list[i]["c5"]}')
    print(f'  c6: {clients_list[i]["c6"]}')