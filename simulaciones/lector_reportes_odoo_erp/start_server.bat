@echo off
cd /d "C:\Users\norbe\Documents\robot_mecanum_esp32_v3\escaner de imagenes"
echo Iniciando servidor local en http://localhost:8000
echo Abre Chrome/Edge y navega a: http://localhost:8000/lector_reportes.html
python -m http.server 8000
pause
