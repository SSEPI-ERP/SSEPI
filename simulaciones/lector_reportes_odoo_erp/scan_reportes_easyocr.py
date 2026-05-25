import os
import json
import re
from pathlib import Path
from PIL import Image
import pytesseract

BASE = Path("C:/Users/norbe/Documents/robot_mecanum_esp32_v3/escaner de imagenes")
REPORTES = BASE / "reportes"
OUTPUT_JSON = BASE / "datos_reportes_ocr.json"
TESSDATA = Path("C:/tessdata")

# Configurar Tesseract
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# Extensiones de imagen
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".gif"}

def get_image_files(folder: Path):
    files = []
    for f in folder.iterdir():
        if f.is_file() and f.suffix.lower() in IMG_EXTS:
            files.append(f)
    files.sort()
    return files

TESSDATA_CFG = '--tessdata-dir C:/tessdata'

def ocr_image(img_path: Path):
    """OCR con Tesseract usando image_to_data DICT (rapido y con coordenadas)."""
    try:
        img = Image.open(img_path)
        data = pytesseract.image_to_data(
            img,
            lang='spa+eng',
            config=f'--psm 6 --oem 3 {TESSDATA_CFG}',
            output_type=pytesseract.Output.DICT
        )
        if not data or not data.get('text'):
            return ""
        n = len(data['text'])
        words = []
        for i in range(n):
            txt = str(data['text'][i]).strip()
            if txt and int(data['conf'][i]) > 30:
                words.append({
                    'text': txt,
                    'left': int(data['left'][i]),
                    'top': int(data['top'][i]),
                    'width': int(data['width'][i]),
                    'height': int(data['height'][i]),
                    'line_num': int(data['line_num'][i])
                })
        if not words:
            return ""
        MIN_GAP = 80
        all_lines = []
        # Agrupar por line_num de Tesseract
        from itertools import groupby
        words.sort(key=lambda w: w['line_num'])
        for line_num, group in groupby(words, key=lambda w: w['line_num']):
            seg_words = list(group)
            seg_words.sort(key=lambda w: w['left'])
            segments = []
            current = [seg_words[0]]
            for i in range(1, len(seg_words)):
                prev = current[-1]
                gap = seg_words[i]['left'] - (prev['left'] + prev['width'])
                if gap > MIN_GAP:
                    segments.append(current)
                    current = [seg_words[i]]
                else:
                    current.append(seg_words[i])
            segments.append(current)
            for seg in segments:
                txt = ' '.join(w['text'] for w in seg).strip()
                if txt:
                    all_lines.append(txt)
        return '\n'.join(all_lines)
    except Exception as e:
        print(f"    OCR error en {img_path}: {e}")
        return ""


# UI words para filtrar
UI_WORDS = {
    'reportes','reporte','ordenes','ordenes de servicio','servicio','field service','mantenimiento','reparacion',
    'inicio','home','dashboard','buscar','search','guardar','save','editar','edit','crear','create','eliminar','delete',
    'acciones','actions','filtros','filters','vista','view','lista','list','kanban','formulario','form','ajustes','settings',
    'perfil','profile','usuario','user','cerrar','close','cancelar','cancel','enviar','send','actualizar','update',
    'imprimir','print','compartir','share','odoo','menu','navegacion','navigation','aplicaciones','apps',
    'conversaciones','conversations','actividades','activities','contactos','contacts','reporte tecnico','technical report',
    'datos generales','general data','historial','history','log','movimiento de inventario','inventory move',
    'encargado','vendedor','numero de orden','numero','tipo de orden','tipo','referencia de reparacion','referencia',
    'fecha de ingreso','fecha','orden de reparacion','bajo garantia','garantia','materiales usados','materiales',
    'diagnostico','solucion aplicada','solucion','notas','observaciones','descripcion','detalle',
    'whatsapp','actividad','archivos','cliente','adjuntar archivos','material','stock','ninguno',
    'confirmado','nuevo','cancelado','entregado','en diagnostico','diagnosticado','pendiente','esperando repuesto',
    'en reparacion','reparado'
}

def is_ui_text(line):
    lo = line.lower().strip()
    if len(lo) < 3:
        return True
    return lo in UI_WORDS

def clean_line(l):
    return re.sub(r'^[-\s]+|[-\s]+$', '', l).strip()

def value_after(line, patterns):
    lower = line.lower()
    for p in patterns:
        idx = lower.find(p)
        if idx != -1:
            # 1) intentar con dos puntos
            if ':' in line:
                parts = line.split(':')
                if len(parts) > 1:
                    v = ':'.join(parts[1:]).strip()
                    if v and len(v) > 1:
                        return v
            # 2) sin dos puntos: tomar texto despues del patron
            after = line[idx + len(p):].strip()
            after = re.sub(r'^[\s:\-–—)]+', '', after)
            if after and len(after) > 1:
                return after
    return ''

def parse_report_text(text):
    raw = text.replace('\r\n', '\n').replace('\r', '\n')
    lines = [clean_line(l) for l in raw.split('\n')]
    lines = [l for l in lines if len(l) > 1 and not is_ui_text(l)]
    full = '\n'.join(lines)
    if not lines:
        return {
            'referencia_reparacion':'','estado_actual':'','numero_orden':'','tipo_orden':'',
            'cliente':'','cliente_rfc':'','equipo':'','componente':'','bajo_garantia':'',
            'fecha_ingreso':'','fecha':'','encargado':'','vendedor':'',
            'materiales':'','notas':'','diagnostico':'','solucion':'','historial_actividad':''
        }

    D = {
        'referencia_reparacion':'','estado_actual':'','numero_orden':'','tipo_orden':'',
        'cliente':'','cliente_rfc':'','equipo':'','componente':'','bajo_garantia':'',
        'fecha_ingreso':'','fecha':'','encargado':'','vendedor':'',
        'materiales':'','notas':'','diagnostico':'','solucion':'','historial_actividad':''
    }

    # Referencia
    ref_match = re.search(r'\b(?:SP|RP|SR|RE|WO|OR)[ \t\-#]*\d{3,6}\b', full, re.I)
    if ref_match:
        D['referencia_reparacion'] = ref_match.group(0).strip().upper()
    else:
        ref_match = re.search(r'(?:referencia|ref|reparacion|orden)[ \t#:.]*([A-Z]{1,3}[ \t\-]?\d{3,6})', full, re.I)
        if ref_match:
            D['referencia_reparacion'] = re.sub(r'\s+', '-', ref_match.group(1).strip().upper())

    # Estado
    for i, l in enumerate(lines):
        lo = l.lower()
        # Solo tomar lineas que empiezan con Estado o lo contienen como label claro
        if re.search(r'^estado\s*(actual)?\b|^status\b|^state\b', lo) or re.search(r'\bestado actual\b|\bestado\s*:', lo):
            v = value_after(l, ['estado', 'status', 'state'])
            if not v and i+1 < len(lines):
                nxt = lines[i+1]
                # la siguiente linea no debe ser otra label
                if not re.search(r'^(encargado|vendedor|cliente|fecha|tipo|orden|diagnostico|solucion|notas|materiales|referencia)', nxt, re.I):
                    v = nxt
            if v:
                v = re.sub(r'^actual\s*', '', v, flags=re.I).strip()
                # Rechazar si parece fecha o es muy corto o contiene palabras de otras secciones
                if len(v) < 50 and len(v) > 2 and not re.search(r'\b\d{1,2}\s+[a-z]{3,}\s+\d{4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b', v, re.I):
                    if not re.search(r'alarma|potencia|fase|fuente|tarjeta|circuito|memoria|prueba|daño', v, re.I):
                        D['estado_actual'] = v
                        break
    if not D['estado_actual']:
        estados = ['reparado','en reparacion','confirmado','nuevo','cancelado','entregado','en diagnostico','diagnosticado','pendiente','esperando repuesto']
        for e in estados:
            if e in full.lower():
                D['estado_actual'] = e.title()
                break

    # Numero de orden
    no_match = re.search(r'(?:orden|order|reporte|ticket|folio)[ \t#:.]*([A-Z0-9\-]{3,20})', full, re.I)
    if no_match:
        val = no_match.group(1).strip()
        # Rechazar artefactos OCR comunes
        if re.search(r'[A-Z0-9]', val) and not re.match(r'^(numb|number|rumber|orden|reporte|ticket|folio)$', val, re.I):
            D['numero_orden'] = val
    else:
        no_match = re.search(r'\b(?:SO|WO|RO|TO|OR)[ \t\-#]*\d{3,10}\b', full, re.I)
        if no_match:
            D['numero_orden'] = no_match.group(0).strip()

    # Fecha ingreso
    fe_ingreso = re.search(r'(?:fecha de ingreso|ingreso|fecha entrada)[ \t:]*([\d]{1,2}\s+[a-z]{3,}\s+[\d]{4}[\s,]+\d{1,2}:\d{2}\s*[ap]\.?m\.?)', full, re.I)
    if fe_ingreso:
        D['fecha_ingreso'] = fe_ingreso.group(1).strip()
    else:
        fe_ingreso = re.search(r'(?:fecha de ingreso|ingreso)[ \t:]*([\d]{1,2}[\/\-][\d]{1,2}[\/\-][\d]{2,4}[^\n]{0,20})', full, re.I)
        if fe_ingreso:
            D['fecha_ingreso'] = fe_ingreso.group(1).strip()

    # Fecha generica
    fe_match = re.search(r'\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b', full)
    if fe_match:
        D['fecha'] = fe_match.group(0)

    # Tipo
    for i, l in enumerate(lines):
        if re.search(r'\btipo\s*(de\s*orden)?\b|\btype\s*(of\s*order)?\b', l, re.I):
            v = value_after(l, ['tipo', 'type'])
            if not v and i+1 < len(lines):
                nxt = lines[i+1]
                if len(nxt) < 60 and not is_ui_text(nxt) and not re.search(r'^(encargado|vendedor|cliente|fecha|estado|orden|diagnostico|solucion|notas|materiales)', nxt, re.I):
                    v = nxt
            if v and len(v) > 2 and len(v) < 60:
                D['tipo_orden'] = v
                break

    # Cliente y RFC
    for i, l in enumerate(lines):
        lo = l.lower()
        if re.search(r'\bcliente\b|\bcustomer\b|\bnombre del cliente\b', lo) and not re.search(r'referencia\s*del\s*cliente|cliente\s*ref', lo):
            v = value_after(l, ['cliente', 'customer'])
            next_line = lines[i+1] if i+1 < len(lines) else ''
            if not v and next_line and not next_line[0].isdigit() and len(next_line) < 90 and not is_ui_text(next_line) and not re.search(r'^(encargado|vendedor|fecha|estado|tipo|orden|diagnostico|solucion|notas|materiales|whatsapp|actividad|archivos)', next_line, re.I):
                v = next_line
            if v and not is_ui_text(v) and len(v) > 2:
                rfc_match = re.search(r'\b([A-Z&Ñ]{3,4}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[A-Z\d]{2,3})\b', v, re.I)
                if rfc_match:
                    D['cliente_rfc'] = rfc_match.group(1).upper()
                    v = v.replace(rfc_match.group(0), '').replace('(', '').replace(')', '').strip()
                if v and len(v) > 2:
                    D['cliente'] = v
                break
    if not D['cliente_rfc']:
        rfc_global = re.search(r'\bRFC[ \t:]*([A-Z&Ñ]{3,4}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[A-Z\d]{2,3})\b', full, re.I)
        if rfc_global:
            D['cliente_rfc'] = rfc_global.group(1).upper()
    if not D['cliente']:
        for l in lines:
            if re.search(r'orden|reporte|fecha|tipo|equipo|componente|materiales|referencia|estado|encargado|vendedor', l, re.I):
                continue
            words = [w for w in l.split() if len(w) > 2]
            if len(words) >= 2 and not is_ui_text(l) and not l[0].isdigit() and not re.search(r'^(encargado|vendedor|whatsapp|actividad|archivos)', l, re.I):
                D['cliente'] = l
                break

    # Equipo / Componente
    for i, l in enumerate(lines):
        lo = l.lower()
        if re.search(r'equipo|dispositivo|device|maquina|articulo|producto', lo):
            v = value_after(l, ['equipo', 'dispositivo', 'maquina', 'articulo', 'producto'])
            next_line = lines[i+1] if i+1 < len(lines) else ''
            if not v and next_line and len(next_line) < 80 and not is_ui_text(next_line) and not re.search(r'^(encargado|vendedor|cliente|fecha|estado|tipo|orden|diagnostico|solucion|notas|materiales)', next_line, re.I):
                v = next_line
            if v and not is_ui_text(v):
                D['equipo'] = v
        if re.search(r'componente|parte|pieza|refaccion|repuesto|spare part', lo):
            v = value_after(l, ['componente', 'parte', 'pieza', 'refaccion', 'repuesto'])
            next_line = lines[i+1] if i+1 < len(lines) else ''
            if not v and next_line and len(next_line) < 80 and not is_ui_text(next_line) and not re.search(r'^(encargado|vendedor|cliente|fecha|estado|tipo|orden|diagnostico|solucion|notas|materiales)', next_line, re.I):
                v = next_line
            if v and not is_ui_text(v):
                D['componente'] = v

    # Garantia
    for i, l in enumerate(lines):
        lo = l.lower()
        if re.search(r'garantia|warranty', lo):
            if re.search(r'\bs[ií]\b', l, re.I) or re.search(r'marcado|checked|true|yes', l, re.I):
                D['bajo_garantia'] = 'Si'
                break
            if re.search(r'\bno\b', l, re.I) or re.search(r'false|unchecked', l, re.I):
                D['bajo_garantia'] = 'No'
                break
            # Mirar siguiente linea para checkbox separado
            if i+1 < len(lines):
                nxt = lines[i+1].lower()
                if 'si' in nxt or 'yes' in nxt or 'marcado' in nxt or 'checked' in nxt:
                    D['bajo_garantia'] = 'Si'
                    break
                if 'no' in nxt or 'false' in nxt or 'unchecked' in nxt:
                    D['bajo_garantia'] = 'No'
                    break
    if not D['bajo_garantia'] and re.search(r'bajo garantia|en garantia|garantia activa', full, re.I):
        D['bajo_garantia'] = 'Si'

    # Encargado
    for i, l in enumerate(lines):
        if re.search(r'encargado|responsable|tecnico|asignado a|assigned to', l, re.I):
            v = value_after(l, ['encargado', 'responsable', 'tecnico', 'asignado'])
            next_line = lines[i+1] if i+1 < len(lines) else ''
            if not v and next_line and len(next_line) < 60 and not is_ui_text(next_line) and not re.search(r'^(vendedor|cliente|fecha|estado|tipo|orden|diagnostico|solucion|notas|materiales)', next_line, re.I):
                v = next_line
            if v and not is_ui_text(v) and len(v) > 2:
                D['encargado'] = v
                break

    # Vendedor
    for i, l in enumerate(lines):
        if re.search(r'vendedor|vendedora|seller|salesperson|comercial', l, re.I):
            v = value_after(l, ['vendedor', 'vendedora', 'seller', 'comercial'])
            next_line = lines[i+1] if i+1 < len(lines) else ''
            if not v and next_line and len(next_line) < 60 and not is_ui_text(next_line) and not re.search(r'^(encargado|cliente|fecha|estado|tipo|orden|diagnostico|solucion|notas|materiales)', next_line, re.I):
                v = next_line
            if v and not is_ui_text(v) and len(v) > 2:
                D['vendedor'] = v
                break

    # Materiales
    mat_section = False
    for i, l in enumerate(lines):
        lo = l.lower()
        if re.search(r'materiales[\susados]*|repuestos|piezas[\susadas]*|consumibles|spare parts|parts used', lo):
            mat_section = True
            v = value_after(l, ['materiales', 'repuestos', 'piezas', 'consumibles', 'parts'])
            if v:
                D['materiales'] = v
                mat_section = False
                break
        if mat_section and i+1 < len(lines):
            nxt = lines[i+1]
            if nxt and len(nxt) < 120 and not is_ui_text(nxt):
                D['materiales'] = (D['materiales'] + ', ' if D['materiales'] else '') + nxt
            if i > 0 and re.search(r'notas|diagnostico|solucion|observaciones', lines[i+2] if i+2 < len(lines) else '', re.I):
                mat_section = False

    # Diagnostico / Solucion / Notas
    for i, l in enumerate(lines):
        lo = l.lower()
        if re.search(r'\bdiagnostico\b|\bdiagnosis\b|\bfalla\b|\bproblema\b|\breporte tecnico\b|\btechnical report\b', lo):
            vd = value_after(l, ['diagnostico', 'diagnosis', 'falla', 'reporte tecnico'])
            buf = []
            if vd: buf.append(vd)
            k = i + 1
            while k < len(lines) and len(buf) < 8:
                nl = lines[k]
                if re.search(r'\bsolucion\b|\bsolucion aplicada\b|\bmateriales\b|\bnotas\b|\bencargado\b|\bvendedor\b|\bestado\b|\bhistorial\b|\bfecha de ingreso\b', nl, re.I):
                    break
                if is_ui_text(nl):
                    break
                if len(nl) > 180:
                    break
                buf.append(nl)
                k += 1
            if buf:
                D['diagnostico'] = '. '.join(buf)
        if re.search(r'\bsolucion aplicada\b|\bsolucion\b|\breparacion realizada\b|\brepair\b|\bfix\b', lo):
            vs = value_after(l, ['solucion aplicada', 'solucion', 'reparacion realizada', 'repair'])
            buf = []
            if vs: buf.append(vs)
            k = i + 1
            while k < len(lines) and len(buf) < 8:
                nl = lines[k]
                if re.search(r'\bdiagnostico\b|\bmateriales\b|\bnotas\b|\bencargado\b|\bvendedor\b|\bestado\b|\bhistorial\b|\bfecha de ingreso\b', nl, re.I):
                    break
                if is_ui_text(nl):
                    break
                if len(nl) > 180:
                    break
                buf.append(nl)
                k += 1
            if buf:
                D['solucion'] = '. '.join(buf)
        if re.search(r'\bnotas?\b|\bnotes?\b|\bdescripcion\b|\bdescription\b|\bdetalle\b|\bobservaciones\b', lo):
            vn = value_after(l, ['notas', 'notes', 'descripcion', 'observaciones'])
            buf = []
            if vn: buf.append(vn)
            k = i + 1
            while k < len(lines) and len(buf) < 8:
                nl = lines[k]
                if re.search(r'\bdiagnostico\b|\bsolucion\b|\bmateriales\b|\bencargado\b|\bvendedor\b|\bestado\b|\bhistorial\b|\bfecha de ingreso\b', nl, re.I):
                    break
                if is_ui_text(nl):
                    break
                if len(nl) > 180:
                    break
                buf.append(nl)
                k += 1
            if buf:
                D['notas'] = '. '.join(buf)

    # Historial
    hist_buf = []
    hist_regex = re.compile(r'\b(\d{1,2}\s+[a-z]{3,}\s+\d{4}[\s,]+\d{1,2}:\d{2}\s*[ap]\.?m\.?)\s*[-—)]*\s*(.+)', re.I)
    for m in hist_regex.finditer(full):
        entry = m.group(2).strip()
        entry = re.sub(r'^\s*[-—)]*\s*', '', entry)
        if len(entry) > 5 and len(entry) < 200:
            hist_buf.append(m.group(1) + ' — ' + entry)
    for l in lines:
        if re.search(r'\b\d{1,2}\s+[a-z]{3,}\s+\d{4}[\s,]+\d{1,2}:\d{2}\s*[ap]\.?m\.?', l, re.I):
            if l not in hist_buf and len(l) < 220:
                norm = re.sub(r'^\s*•\s*', '', l).strip()
                if len(norm) > 10:
                    hist_buf.append(norm)
    if hist_buf:
        D['historial_actividad'] = '\n'.join(hist_buf)

    # Limpiar valores largos
    limite = 250
    for k in ['referencia_reparacion','estado_actual','numero_orden','tipo_orden','cliente','cliente_rfc','equipo','componente','bajo_garantia','fecha_ingreso','fecha','encargado','vendedor','materiales']:
        if D[k] and len(D[k]) > limite:
            D[k] = D[k][:limite] + '...'

    return D

def merge_parsed_results(parsed_list):
    """Fusiona resultados de multiples imagenes de la misma carpeta."""
    if not parsed_list:
        return {}
    merged = {k: '' for k in parsed_list[0]}
    # Campos de texto que se concatenan
    concat_fields = {'materiales', 'notas', 'diagnostico', 'solucion', 'historial_actividad'}
    # Campos donde tomamos el primero no vacio (o el mas largo para cliente/equipo)
    for k in merged:
        vals = [p.get(k, '') for p in parsed_list]
        vals = [v for v in vals if v]
        if not vals:
            merged[k] = ''
            continue
        if k in concat_fields:
            merged[k] = ' | '.join(dict.fromkeys(vals))
        elif k == 'estado_actual':
            # Preferir estados conocidos
            known = ['Reparado','En reparacion','Confirmado','Nuevo','Cancelado','Entregado','En diagnostico','Diagnosticado','Pendiente','Esperando repuesto']
            found = ''
            for v in vals:
                for e in known:
                    if e.lower() in v.lower():
                        found = e
                        break
                if found:
                    break
            merged[k] = found if found else vals[0]
        elif k in ('cliente', 'equipo'):
            # Tomar el valor mas largo (probablemente el correcto)
            merged[k] = max(vals, key=len)
        else:
            merged[k] = vals[0]
    return merged


def score_form_likeness(text):
    """Puntuar cuanto parece captura de pantalla de Odoo vs foto de equipo."""
    lower = text.lower()
    form_markers = [
        'orden de reparacion','referencia de reparacion','estado actual','fecha de ingreso',
        'encargado','vendedor','cliente','diagnostico','solucion','notas','materiales',
        'reportada','confirmado','en reparacion','reparado','cancelado','nuevo',
        'bajo garantia','tipo de orden','numero de orden','whatsapp','actividad',
        'adjuntar archivos','movimiento de inventario','cambio de estado'
    ]
    score = sum(1 for m in form_markers if m in lower)
    # Penalizar palabras de nameplate/foto de equipo
    equipment_words = ['ausgang','output','rating','siemens','hz','amp','volt','vdc','vac',
                       'rectifier','regenerating','unit','belastungs','techn','issue','min',
                       'mex','opt','schneider','electric','holdings','japan',' Ltd','inc.']
    penalty = sum(1 for w in equipment_words if w in lower)
    return score - penalty


def scan_folders(max_folders=None):
    if not REPORTES.exists():
        print(f"ERROR: No se encuentra {REPORTES}")
        return []

    subdirs = [d for d in REPORTES.iterdir() if d.is_dir()]
    subdirs.sort(key=lambda x: x.name)

    if max_folders:
        subdirs = subdirs[:max_folders]

    print(f"Escaneando {len(subdirs)} carpetas...")
    records = []

    for idx, folder in enumerate(subdirs, 1):
        images = get_image_files(folder)
        print(f"  [{idx}/{len(subdirs)}] {folder.name}: {len(images)} imagenes")

        per_image_data = []
        per_image_text = []
        for img_path in images:
            text = ocr_image(img_path)
            if text:
                data = parse_report_text(text)
                per_image_data.append(data)
                per_image_text.append(text)

        if not per_image_data:
            data = {k: '' for k in parse_report_text('')}
            data['referencia_reparacion'] = folder.name
            records.append(data)
            continue

        # Elegir la imagen que mas parezca formulario de Odoo
        scores = [score_form_likeness(t) for t in per_image_text]
        best_idx = scores.index(max(scores))
        primary = per_image_data[best_idx]

        # Para campos de texto largo, fusionar de todas las imagenes
        merged = merge_parsed_results(per_image_data)

        # Usar el primario para campos estructurados; fusionar para campos largos
        data = dict(primary)
        for k in ['materiales','notas','diagnostico','solucion','historial_actividad']:
            if merged.get(k):
                data[k] = merged[k]

        if not data.get('referencia_reparacion'):
            data['referencia_reparacion'] = folder.name

        records.append(data)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"\nGuardado: {OUTPUT_JSON}")
    print(f"Total registros: {len(records)}")
    return records

if __name__ == "__main__":
    scan_folders()
