import json
from pathlib import Path

BASE = Path("C:/Users/norbe/Documents/robot_mecanum_esp32_v3/escaner de imagenes")
JSON_FILE = BASE / "datos_reportes_ocr.json"
HTML_SRC = BASE / "lector_reportes.html"
HTML_OUT = BASE / "lector_reportes_con_datos.html"

with open(JSON_FILE, "r", encoding="utf-8") as f:
    records = json.load(f)

with open(HTML_SRC, "r", encoding="utf-8") as f:
    html = f.read()

# Inyectar PRELOADED_DATA
start_marker = "/* === PRELOADED_DATA_START === */"
end_marker = "/* === PRELOADED_DATA_END === */"
json_data = json.dumps(records, ensure_ascii=False, indent=2)
injection = f"{start_marker}\nconst PRELOADED_DATA = {json_data};\n{end_marker}"

if start_marker in html and end_marker in html:
    import re
    pattern = re.compile(re.escape(start_marker) + ".*?" + re.escape(end_marker), re.DOTALL)
    html = pattern.sub(injection, html)
else:
    html = html.replace("<script>", "<script>\n" + injection, 1)

# Asegurar que onload cargue PRELOADED_DATA
autoload_snippet = """
/* === AUTOLOAD PRELOADED DATA === */
window.addEventListener('load', function(){
  if(typeof PRELOADED_DATA !== 'undefined' && PRELOADED_DATA.length){
    extractedData = PRELOADED_DATA;
    files = PRELOADED_DATA.map(function(d,i){ return {name: d.referencia_reparacion || ('Orden '+(i+1)), index: i}; });
    if(typeof renderTable === 'function') renderTable();
    if(typeof renderCardsPage === 'function') renderCardsPage();
    var count = document.getElementById('fileCount');
    if(count) count.textContent = PRELOADED_DATA.length + ' ordenes cargadas';
    var previewBox = document.getElementById('previews');
    if(previewBox) previewBox.style.display = 'none';
  }
});
/* === END AUTOLOAD === */
"""

# Buscar donde insertar el autoload (antes del cierre de </body> o al final del <script> principal)
if "/* === AUTOLOAD PRELOADED DATA === */" not in html:
    if "</body>" in html:
        html = html.replace("</body>", autoload_snippet + "\n</body>")
    else:
        html = html + "\n<script>" + autoload_snippet + "</script>"

with open(HTML_OUT, "w", encoding="utf-8") as f:
    f.write(html)

total_size = len(html.encode("utf-8"))
print(f"Generado: {HTML_OUT}")
print(f"Registros embebidos: {len(records)}")
print(f"Tamaño HTML: {total_size / 1024 / 1024:.1f} MB")
