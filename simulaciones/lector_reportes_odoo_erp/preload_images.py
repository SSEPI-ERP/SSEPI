import os
import base64
import json
from pathlib import Path

BASE = Path("C:/Users/norbe/Documents/robot_mecanum_esp32_v3/escaner de imagenes")
REPORTES = BASE / "reportes"
SRC_HTML = BASE / "lector_reportes.html"
OUT_HTML = BASE / "lector_reportes_preload.html"

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".gif"}


def image_to_base64(img_path):
    """Convierte una imagen a string base64 con su MIME type."""
    ext = img_path.suffix.lower().replace(".", "")
    if ext == "jpg":
        ext = "jpeg"
    mime = f"image/{ext}" if ext != "webp" else "image/webp"
    with open(img_path, "rb") as f:
        data = f.read()
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


def build_preloaded_folders():
    folders = []
    for d in sorted(REPORTES.iterdir()):
        if d.is_dir():
            images = []
            for f in sorted(d.iterdir()):
                if f.is_file() and f.suffix.lower() in IMG_EXTS:
                    images.append(f)
            if images:
                # Tomar solo la primera imagen como preview, base64
                preview_b64 = image_to_base64(images[0])
                # Tomar hasta 5 imagenes para el OCR (solo paths, no base64 para no sobrecargar)
                img_paths = [str(f.relative_to(BASE)).replace("\\", "/") for f in images[:5]]
                folders.append(
                    {
                        "name": d.name,
                        "preview_b64": preview_b64,
                        "images": img_paths,
                    }
                )
    return folders


def patch_html(folders):
    with open(SRC_HTML, "r", encoding="utf-8") as f:
        html = f.read()

    # Reemplazar el bloque PRELOADED_FOLDERS por uno con base64
    start_marker = "/* === PRELOADED_FOLDERS_START === */"
    end_marker = "/* === PRELOADED_FOLDERS_END === */"

    json_data = json.dumps(folders, ensure_ascii=False, indent=2)
    injection = f"{start_marker}\nconst PRELOADED_FOLDERS = {json_data};\n{end_marker}"

    if start_marker in html and end_marker in html:
        import re

        pattern = re.compile(re.escape(start_marker) + ".*?" + re.escape(end_marker), re.DOTALL)
        html = pattern.sub(injection, html)
    else:
        html = html.replace("<script>", "<script>\n" + injection)

    # Modificar renderPreviews para usar PRELOADED_FOLDERS si existe
    # Buscar la funcion renderPreviews y modificarla
    old_render = """function renderPreviews(){
  var box=document.getElementById('previews');
  var grid=document.getElementById('previewGrid');
  var count=document.getElementById('fileCount');
  if(!folders.length){box.style.display='none';return;}
  box.style.display='flex';
  grid.innerHTML=folders.map(function(f,i){
    return '<div class="preview-wrap" title="'+f.name.replace(/"/g,'&quot;')+'">'+
      '<img src="'+URL.createObjectURL(f.previewFile)+'" alt="Vista previa '+(i+1)+'">'+
      '<span class="pi">'+(i+1)+'</span>'+
      '<span class="pf">'+f.name.replace(/</g,'&lt;')+'</span>'+
      '<button class="pb" onclick="removeFolder('+i+')" title="Quitar"><i class="ti ti-x"></i></button>'+
    '</div>';
  }).join('');"""

    new_render = """function renderPreviews(){
  var box=document.getElementById('previews');
  var grid=document.getElementById('previewGrid');
  var count=document.getElementById('fileCount');
  if(!folders.length){box.style.display='none';return;}
  box.style.display='flex';
  grid.innerHTML=folders.map(function(f,i){
    var src = f.preview_b64 ? f.preview_b64 : URL.createObjectURL(f.previewFile);
    return '<div class="preview-wrap" title="'+f.name.replace(/"/g,'&quot;')+'">'+
      '<img src="'+src+'" alt="Vista previa '+(i+1)+'">'+
      '<span class="pi">'+(i+1)+'</span>'+
      '<span class="pf">'+f.name.replace(/</g,'&lt;')+'</span>'+
      '<button class="pb" onclick="removeFolder('+i+')" title="Quitar"><i class="ti ti-x"></i></button>'+
    '</div>';
  }).join('');"""

    html = html.replace(old_render, new_render)

    # Modificar onload para auto-cargar PRELOADED_FOLDERS
    if "window.addEventListener('load'" not in html and "window.onload" not in html:
        html = html.replace(
            "/* ===== ESTADO ===== */",
            "/* ===== AUTOLOAD PRELOADED ===== */\nwindow.addEventListener('load', function(){\n  if(typeof PRELOADED_FOLDERS !== 'undefined' && PRELOADED_FOLDERS.length){\n    folders = PRELOADED_FOLDERS;\n    renderPreviews();\n    document.getElementById('btnScan').disabled = false;\n  }\n});\n/* ===== ESTADO ===== */"
        )

    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Generado: {OUT_HTML}")
    print(f"Total carpetas: {len(folders)}")
    total_size = len(html.encode("utf-8"))
    print(f"Tamaño HTML: {total_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    print("Leyendo carpetas y codificando imagenes a base64...")
    folders = build_preloaded_folders()
    patch_html(folders)
