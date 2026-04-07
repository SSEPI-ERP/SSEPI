@echo off
title SSEPI ERP - POWER ON
echo Iniciando Servidor Local de SSEPI...
start http://localhost:8080
npx http-server -p 8080 -c-1
pause