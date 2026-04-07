================================================================================
  SSEPI COI - Instalador (otra PC o primera instalacion)
================================================================================

UBICACION EN EL EQUIPO
----------------------
  Copia TODA la carpeta "mi-coi" donde quieras, por ejemplo:
    C:\Programas\SSEPI-COI
    C:\Users\TuUsuario\Documentos\SSEPI-COI

  No muevas solo algunos archivos: debe quedar main.py, frontend, backend,
  requirements.txt, instalador\, etc.

PASOS RAPIDOS
-------------
  1) Doble clic en:  instalador\SETUP_SSEPI_COI.bat

  2) Opcion [3] si no tienes Python: descarga el instalador de python.org
     Marca: "Add python.exe to PATH"
     Cierra y vuelve a abrir el menu del instalador.

  3) Opcion [1]: crea .venv e instala todas las librerias (customtkinter,
     Pillow, reportlab, etc.)

  4) Opcion [6] opcional: genera app.ico si tienes logo.png

  5) Opcion [5]: acceso directo en el Escritorio

  6) Abre el programa con:  SSEPI COI.vbs  (en la raiz de mi-coi)

DESCARGAS
---------
  Python oficial:  https://www.python.org/downloads/windows/
  (Opcion 4 del menu usa winget en Windows 10/11 si esta disponible)

MOTOR BRIDGE (ERP en linea)
----------------------------
  Para sincronizar con el ERP: en mi-coi ejecuta
    python -m bridge.bridge_server
  o usa Iniciar_bridge_oculto.vbs
  Configura .env con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ver bridge\README.md)

================================================================================
