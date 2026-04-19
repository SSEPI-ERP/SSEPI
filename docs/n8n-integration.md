# SSEPI + n8n — Guía de Integración

## Arquitectura (100% GRATIS — $0/mes)

```
[INSERT/UPDATE en ventas, orden_historial, etc.]
        ↓ (PostgreSQL triggers — GRATIS)
[n8n_event_queue table en Supabase]
        ↓ (n8n poll cada 1 min)
[n8n:5678] → [Ollama local:11434 → qwen2.5:3b]
        ↓
[n8n_insights + notificaciones]
        ↓ (Supabase Realtime)
[Frontend ERP muestra insights + status]
```

**No se necesitan Supabase Database Webhooks** (requieren plan Pro).
**No se necesita Anthropic API** (Ollama corre localmente, sin costo).
**No se necesita Cloudflare Tunnel** (el modelo polling no recibe conexiones externas).

## Requisitos

- Docker Desktop (Windows) con WSL2
- ~4GB disco para modelo Ollama + datos
- ~4GB RAM disponible para Ollama

## Instalación

### 1. Configurar variables

```bash
cp .env.n8n .env.n8n.local
# Editar .env.n8n.local con tus valores reales
```

Generar encryption key (si no la tienes):
```bash
openssl rand -hex 32
```

### 2. Levantar servicios

```bash
docker compose --env-file .env.n8n.local up -d
```

Esto levanta 3 contenedores:
- `ssepi-ollama` — IA local (puerto 11434)
- `ssepi-n8n` — automatización (puerto 5678)
- `ssepi-n8n-db` — base de datos de n8n

### 3. Descargar modelo de IA

```bash
bash scripts/setup-ollama.sh
```

O manualmente:
```bash
docker exec ssepi-ollama ollama pull qwen2.5:3b
```

Esto descarga ~2GB. Solo se hace la primera vez.

Para mejor calidad (opcional, +5GB):
```bash
docker exec ssepi-ollama ollama pull qwen2.5:7b
```

### 4. Configurar credenciales en n8n

Ir a http://localhost:5678 (user: ssepi, pass: la que pusiste en .env.n8n.local)

Crear esta credencial en el editor de n8n:

1. **Supabase Service Role** (tipo: Header Auth)
   - Header name: `apikey`
   - Header value: tu `SUPABASE_SERVICE_ROLE_KEY`
   - Header name: `Authorization`
   - Header value: `Bearer <tu-service-role-key>`

**No se necesita credencial de Anthropic** — Ollama no requiere API key.

### 5. Importar workflows

En el editor n8n: Workflow → Import from File → seleccionar cada JSON en `n8n-workflows/`:

1. `00-event-poller.json` — IMPORTAR PRIMERO (reemplaza webhooks con polling)
2. `01-heartbeat.json` — Activo siempre (status indicator)
3. `02-coi-cloud-processor.json` — Procesador de pólizas COI
4. `08-daily-digest.json` — Resumen diario por email

**Importante**: Después de importar, actualizar los IDs de credenciales en cada nodo que referencia `SUPABASE_SERVICE_ROLE_CRED_ID` con el ID real de la credencial creada en paso 4.

### 6. Ejecutar migraciones SQL

En Supabase Dashboard → SQL Editor, ejecutar en orden:

1. `scripts/migrations/n8n-brain-tables.sql` — Tablas n8n_insights + n8n_heartbeat
2. `scripts/migrations/n8n-event-queue.sql` — Tabla cola + PostgreSQL triggers (reemplaza webhooks)

### 7. Verificar

1. n8n editor: http://localhost:5678 — verificar workflows activos
2. Frontend: debe mostrar "N8N ACTIVO" tras 60s
3. Test Ollama: `curl http://localhost:11434/api/chat -d '{"model":"qwen2.5:3b","messages":[{"role":"user","content":"di hola"}],"stream":false}'`
4. Crear una venta de prueba → verificar que aparece insight en el panel IA

## Workflows

### 00 - Event Poller (Modelo Gratis)
- Cada 1 min lee `n8n_event_queue` (pending)
- Rutea eventos por `source_table` → ejecuta Ollama correspondiente
- Reemplaza workflows 03-07 (webhook-based) con un solo workflow de polling
- Limpia eventos procesados >7 días automáticamente

### 01 - Heartbeat
- Cada 60s elimina registros >24h de `n8n_heartbeat` y escribe nuevo → el frontend muestra "N8N ACTIVO" / "N8N DESCONECTADO"

### 02 - COI Cloud Processor
- Cada 2 min lee `coi_sync_queue` (pending) → construye póliza → inserta en `coi_polizas` + `coi_movimientos`
- En error: marca job como error, Ollama explica la causa, genera insight de warning

### 08 - Daily Digest
- Lunes-viernes 7:00 AM → Ollama genera resumen ejecutivo → envía email al admin

### Workflows legados (03-07) — solo para modelo con webhooks push

- **03 Cross-Module Notifier**: webhook en orden_historial
- **04 Cerebro de Ventas**: webhook en ventas
- **05 Pipeline Tracker**: webhook en ssepi_folio_evento
- **06 Email Intelligence**: webhook en inbound_emails
- **07 Smart Audit**: webhook en audit_logs

## Modelo de IA: Ollama + Qwen2.5

Todos los workflows usan `http://ollama:11434/api/chat` con el modelo `qwen2.5:3b`.

| Modelo | Tamaño | RAM | Calidad | Cuándo usar |
|--------|--------|-----|---------|-------------|
| `qwen2.5:3b` | ~2GB | ~3GB | Buena para JSON estructurado | Por defecto |
| `qwen2.5:7b` | ~5GB | ~6GB | Mejor redacción, español más natural | Si tienes RAM |

Para cambiar modelo: en n8n, editar cada nodo Ollama → cambiar `qwen2.5:3b` por `qwen2.5:7b`.

Para activar GPU (acelera inferencia ~10x):
1. Instalar NVIDIA Container Toolkit en Docker Desktop
2. Agregar `deploy.resources.reservations.devices` al servicio ollama en docker-compose
3. Reiniciar con `docker compose up -d`

## Troubleshooting

| Problema | Solución |
|----------|----------|
| n8n no arranca | `docker compose logs n8n` — verificar .env y puertos |
| Ollama no arranca | `docker compose logs ollama` — verificar RAM disponible |
| Modelo no encontrado | `docker exec ssepi-ollama ollama pull qwen2.5:3b` |
| IA responde lento | Normal en CPU; usar GPU o modelo 3b (no 7b) |
| Heartbeat no aparece | Verificar credenciales Supabase en n8n |
| Eventos no se procesan | Verificar triggers SQL: `SELECT * FROM pg_trigger WHERE tgname LIKE 'n8n_%'` |
| Pólizas no se crean | Verificar `coi_account_mapping` tiene mapeos configurados |
| Frontend muestra "DESCONECTADO" | n8n no está corriendo o heartbeat table no existe |

## Costos

- n8n self-hosted: **gratuito**
- Ollama + Qwen2.5: **gratuito** (corre local, sin API)
- Cloudflare Tunnel: **gratuito** (no se necesita con polling)
- Supabase: **Free plan** — triggers PG son gratis
- **TOTAL: $0/mes**