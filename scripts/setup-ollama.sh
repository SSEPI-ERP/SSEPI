#!/bin/bash
# ================================================
# SSEPI — Descargar modelos Ollama para n8n
# ================================================
# Ejecutar DESPUÉS de: docker compose --env-file .env.n8n.local up -d
#
# Uso:  bash scripts/setup-ollama.sh
# ================================================

echo "=== SSEPI Ollama Setup ==="
echo ""
echo "Descargando modelo qwen2.5:3b (~2GB)..."
echo "Este modelo se usa para todos los análisis IA de n8n."
echo ""

docker exec ssepi-ollama ollama pull qwen2.5:3b

echo ""
echo "=== Verificando modelos instalados ==="
docker exec ssepi-ollama ollama list

echo ""
echo "=== Listo ==="
echo "Modelo instalado. Los workflows de n8n ahora usan Ollama local."
echo ""
echo "Para mejor calidad (opcional, ~5GB adicionales):"
echo "  docker exec ssepi-ollama ollama pull qwen2.5:7b"
echo ""
echo "Si instalas 7b, cambia 'qwen2.5:3b' por 'qwen2.5:7b'"
echo "en los workflows de n8n (nodo Ollama → model)."