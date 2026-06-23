# Cómo funciona el ERP SSEPI — Funciones, Acciones y Flujo Completo

> Documento maestro de referencia: explica cada función, cada acción de usuario y cómo opera el ERP de extremo a extremo.
> Estado al redactar (2026-06-23): **ERP en producción** — frontend en Vercel, backend Supabase cloud, RLS activo, login funcional, n8n + Ollama 11/11 workflows activos. El proxy local SSEPI-NEXT queda como fallback offline.

---

## 1. Dónde nos quedamos

| Componente | Estado |
|---|---|
| **Frontend (Vercel)** | Producción: `https://ssepi-2pwajonzu-trabajosu47-8170s-projects.vercel.app` — todas las páginas HTTP 200. Build `scripts/vercel-build.js` con `cwd: landing/`. `.vercelignore` excluye `simulaciones/`, `ollama-data/`, `ssepi/`. |
| **Backend (Supabase cloud)** | Datos migrados SQLite→cloud (fases 1-6). `auth.users` + `public.usuarios` con 12 cuentas, `auth_user_id` correcto. Passwords provisionales seteados vía Admin API (rotar en Fase 0.2; política fuerte + `must_change_password` en Fase 0.4). |
| **RLS** | Habilitado en todas las tablas operativas. Políticas: `anon_no_access_*`, `auth_select_all_*`, `auth_insert_*`, `auth_update/delete_*` (solo dueño o admin/superadmin/contabilidad). Políticas legacy permisivas eliminadas. Columna `auth_user_id DEFAULT auth.uid()` añadida. |
| **n8n (cerebro IA)** | 11/11 workflows activos. `n8n_heartbeat` + `n8n_insights` + `n8n_event_queue` + `alarmas` en cloud. Modelo local Ollama `qwen2.5:3b`. Costo $0/mes. |
| **Local / offline** | Proxy SSEPI-NEXT (`localhost:3333`) sigue funcionando como fallback. `.env.local` en dual mode (local/cloud). |
| **Pendientes menores** | Vulnerabilidad `xlsx` (sheetjs) sin fix (solo scripts server-side). `sync-engine.mjs` solo sincroniza 23 tablas (15 locales no suben — ver memoria pendiente). |

Acceso local: `http://localhost:3333/panel/login.html` vía `reiniciar-ssepi.bat`.

---

## 2. Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│  NAVEGADOR (SPA vanilla, sin framework)                      │
│  panel/                                                      │
│   ├─ login.html, panel.html, pages/*.html                   │
│   └─ js/                                                     │
│       ├─ core/      (infra: auth, datos, estado, costos)    │
│       │   └─ ssepi-runtime/ (autoguardado/borradores)        │
│       ├─ modules/   (un archivo por módulo de negocio)       │
│       └─ config/supabase-config.js (switch cloud/local)      │
└─────────────────────────────────────────────────────────────┘
        │ Supabase JS SDK (anon key, persistSession PKCE)
        ▼
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE CLOUD (Postgres + Auth + Realtime + Storage)       │
│   RLS por auth.uid() = auth_user_id                          │
│   Triggers → audit_logs, n8n_event_queue                     │
└─────────────────────────────────────────────────────────────┘
        ▲ polling 1 min            ▲ cola/bridge
        │                          │
┌───────┴──────────┐    ┌──────────┴──────────────┐
│  n8n + Ollama    │    │  COI (contabilidad)     │
│  (cerebro IA)    │    │  bridge local Python    │
│  localhost:5678  │    │  localhost:8765          │
│  localhost:11434 │    └──────────────────────────┘
└──────────────────┘

FALLBACK OFFLINE (si cloud no responde):
┌─────────────────────────────────────────────────────────────┐
│  SSEPI-NEXT proxy local (Express + SQLite)                   │
│  localhost:3333  →  /proxy (PostgREST-compatible)           │
│  Auth local propia, Realtime desactivado                      │
└─────────────────────────────────────────────────────────────┘
```

**Principios clave:**

- **Una SPA vanilla** — sin React/Vue. Cada página carga `supabase-config.js` primero, luego el módulo que corresponde. Sin bundler en producción (Vercel sirve estáticos).
- **`createDataService(tabla)`** es la abstracción de acceso a datos: insert/update/delete/select con CSRF, permisos y auditoría automáticos.
- **`window.SSEPIStateMachine`** es el pipeline unificado de 8 pasos que comparten todos los módulos operativos.
- **`window.CostosEngine`** es el motor financiero; todos los valores se cargan desde `parametros_costos`.
- **`window.folioFormats`** genera folios secuenciales por departamento (SP-E, SP-M, SP-A, SP-S, SP-OC).
- **Visibilidad por rol** se resuelve en `nav-by-role.js` (frontend, síncrono) **y** RLS (backend, autoritativo).
- **Autoguardado offline** vía `ssepi-runtime/` (localStorage + event bus) para que el usuario no pierda capturas.

---

## 3. Flujo comercial (el "cerebro")

El ERP gira alrededor de **Ventas**, que es el paso 1 de todo trabajo:

```
1. VENTAS (Paso 1)  →  Elige cliente + departamento
                         │  _ventasCrearOrdenOperativa() genera la orden con folio:
                         │   Laboratorio → ordenes_taller   (SP-E)
                         │   Motores     → ordenes_motores   (SP-M)
                         │   Automatiz.  → proyectos_automatizacion (SP-A)
                         │   Soporte     → soporte_visitas   (SP-SOP)
                         │   Suministros → compra preliminar  (SP-S)
                         ▼
2. VENTAS (Paso 2)  →  Calculadora de costos (CostosEngine)
                         │  carga km/horas desde clientes_tabulador
                         │  gasolina + traslado + mano obra + gastos fijos + refacciones
                         ▼
3. VENTAS (Paso 3)  →  Margen (% utilidad, % crédito) + vista previa PDF
4. VENTAS (Paso 4)  →  Guarda cotización / envía por correo
                         │  cotización queda vinculada: origen + orden_origen_id
                         ▼
   ORDEN OPERATIVA vive en su módulo (Taller / Motores / Auto / Soporte)
                         │
5. COMPRAS          →  si requiere material, se genera OC (SP-OC / PO-)
                         │  vinculada a la orden, RPC reservar_material
6. EJECUCIÓN        →  reparación / fabricación / desarrollo
                         │  al terminar → estado Reparado/Completado → notifica Ventas
7. FACTURACIÓN      →  timbra CFDI (Finkok), registra factura + ingreso
8. ENTREGA         →  cierra la orden, descuenta inventario (Suministros), COI
```

El **pipeline unificado de 8 pasos** (`state-machine.js`) normaliza los estados nativos de cada tabla a un mismo lenguaje:

| # | id | Etiqueta | Módulo dueño |
|---|---|---|---|
| 1 | recepcion | Recepción | Ventas |
| 2 | diagnostico | Diagnóstico | Taller/Motores/Auto |
| 3 | cotizacion | Cotización | Ventas/Compras |
| 4 | autorizacion | Autorización | Cliente |
| 5 | adquisicion | Adquisición | Compras |
| 6 | ejecucion | Ejecución | Taller/Motores/Auto |
| 7 | facturacion | Facturación | Facturación |
| 8 | entrega | Entrega | Ventas |
| 0 | cancelado | Cancelado | — |

`normalizarEstatusPipeline()` traduce texto crudo de BD ("Entregado", "en reparación", "Pagado"…) al id canónico. `renderTimelineHTML()` dibuja la barra de progreso horizontal. `actualizarEstadoOrden()` inserta eventos en `orden_historial` (con deduplicación de 5 s). `puedeEliminar()` bloquea borrar órdenes avanzadas; `estaEnCuarentena()` congela acciones si `bloqueo_contable=true`.

---

## 4. Roles y visibilidad

Definido en `nav-by-role.js` (mapa `ROLE_MODULES`) y reforzado por RLS en Postgres (`role_permissions`).

| Rol | Módulos visibles | Notas |
|---|---|---|
| **admin / superadmin** | `null` = todo + análisis | Ven costos, editan todo |
| **ventas** | ventas, inventario, contactos, vacaciones, suministros | No ve costos |
| **administracion** | compras, facturas, contabilidad, pagos_nomina, inventario, contactos, vacaciones, suministros | |
| **taller** | ordenes_taller, inventario, vacaciones | |
| **motores** | ordenes_motores, inventario, vacaciones | |
| **automatizacion** | proyectos_automatizacion, suministros, vacaciones, configuracion, actividades_automatizacion | |
| **ventas_sin_compras** | ordenes_taller, inventario, vacaciones, actividades_automatizacion | Lab sin costos |
| **compras** | compras, inventario, vacaciones | |
| **facturacion** | ventas, compras, facturas, vacaciones, suministros | |
| **contabilidad** | `null` = todo (lectura) | RLS limita escritura |

**Modo dual**: el usuario `norbertomoro4@gmail.com` (admin) puede alternar entre modo admin y modo normal (`automatizacion`) con el botón `ssepiDualModeToggle`. En modo normal, oculta costos y se comporta como rol básico.

**Módulos especiales**: `calculadoras`, `configuracion`, `analisis_general`, `pdfs_politicas`, `alarmas` — solo admin/superadmin (`canSeeSpecialModule()`).

**Permisos individuales por usuario** (`user_module_permissions`) tienen prioridad sobre el rol — permiten activar/desactivar módulos puntuales.

---

## 5. Núcleo (`panel/js/core/`) — función por función

### 5.1 supabase-config.js — única fuente de Supabase
Decide a qué backend apuntar según la URL:
- Puerto `3333`/`3443` o `*.trycloudflare.com` → **modo SSEPI-NEXT** (proxy local `/proxy`, auth local propia, Realtime desactivado).
- `localhost`/`127.0.0.1`/`file:` → **local-dev** (Supabase CLI `127.0.0.1:54321`).
- resto → **cloud** (`knzmdwjmrhcoytmebdwa.supabase.co`).

Funciones:
- **`createSsepiFetch(primary, fallback)`** — interceptor: intenta cloud con timeout 5 s; si hay error de red, cae al proxy local.
- **`cloudFetch`** — cloud puro con timeout 20 s.
- En modo SSEPI-NEXT, **reemplaza `window.supabase.auth`** por `offlineAuth` (`signInWithPassword`/`getSession`/`getUser` contra `/api/auth/*`) y desactiva Realtime con canales dummy.

### 5.2 auth-service.js — autenticación y perfiles
Clase `AuthService` (instancia global `window.authService`).
- **`login(email, password)`** — rate limit por IP → `signInWithPassword` → detecta MFA (`mfa.listFactors`) → si hay, devuelve `{requiresMFA:true}`; registra intento en `auth_logs`.
- **`verifyMFA(factorId, code)`** — `mfa.challengeAndVerify`.
- **`logout()`** — `signOut` + limpia sessionStorage/localStorage.
- **`logAuthAttempt(email, success, ip, details)`** — insert en `auth_logs` (hash del email).
- **`getClientIP()`** — vía `api.ipify.org` (fallback `0.0.0.0`).
- **`changePassword(new)`** / **`resetPassword(email)`** / **`requestPasswordResetForUser(email)`** — Supabase Auth.
- **`getCurrentProfile()`** — lee `auth.getUser`, busca fila en `usuarios` → `users` → `profiles` (compatibilidad), arma perfil con `rol`, `departamento`, `ver_costos` (de `users_ver_costos`), cachea en `sessionStorage.ssepi_profile`. En modo local, prioriza `user_metadata` + `usuarios`.
- **`getProfileSync()`** — perfil cacheado (síncrono).
- **`resolveDisplayName(profile, user)`** — nombre de persona para UI (nunca "Laboratorio"/"Ventas"); fallback por email.
- **`applyUserHeader(profile, user)`** — pinta `#userName`, `#userAvatar`, `#welcomeUser`.
- **`updateProfile({nombre, telefono, email})`** — admin edita directo; no-admin inserta en `perfil_cambios_pendientes` (pendiente de aprobación).
- **`listPendingProfileChanges()` / `approveProfileChange(id)` / `rejectProfileChange(id, motivo)`** — flujo de aprobación admin.
- **`hasPermission(module, action)`** — `read` = haber sesión; resto consulta `role_permissions` (con wildcard `*`) considerando modo dual.
- **`getSodViolations()`** — RPC `get_sod_violations_for_current_user` (segregación de duties).
- **`requireAuth(redirect)`** — redirige si no hay sesión.
- **`getUsersByRol(roles)`** — lista usuarios filtrados (local vía `/api/auth/users`, cloud vía `usuarios`), aplica `filterVisibleProfiles`.
- **`_isDualModeUser / _getDualModeBaseRol`** — modo dual (mapa `norbertomoro4@gmail.com→automatizacion`).

### 5.3 data-service.js — capa de datos con auditoría
Clase `DataService(tabla)` + fábrica **`createDataService(tabla)`**.
- **`insert(data, csrf)`** — valida CSRF → `hasPermission(create)` → sanitiza → insert → `logAudit('INSERT')`.
- **`update(id, data, csrf)`** — lee datos previos → `hasPermission(update)` → update → `logAudit('UPDATE', old, new)`.
- **`delete(id, csrf)`** — lee previos → `hasPermission(delete)` → delete → `logAudit('DELETE')`.
- **`select(query, options)`** — filtros con operadores (`gte/lte/gt/lt/neq/ilike/like/in/contains/containedBy/overlaps/is`), arrays→`IN`, null→`IS NULL`, paginación `range` (omitida en offline), `orderBy`, `limit`, `count`.
- **`count(query)`** — `head:true` count exacto.
- **`getById(id)`**.
- **`logAudit(action, recordId, old, new, severity, metadata)`** — insert en `audit_logs` (no bloquea si falla).

### 5.4 state-machine.js — pipeline unificado (expuesto como `window.SSEPIStateMachine`)
- **`PIPELINE_PASOS`** — los 8 pasos (constante).
- **`_cargarMapaDesdeSupabase()`** — al init lee `estado_pipeline_unificado` y llena `window.__ESTADO_MAPA__`.
- **`obtenerPasoUnificado(tabla, estadoNativo)`** — devuelve `{paso, etiqueta}`; fallback a mapa local si no hay Supabase.
- **`derivarEstatusActualDesdeNativo(tabla, item)`** — texto crudo → id canónico del pipeline.
- **`normalizarEstatusPipeline(estatus, tabla, item)`** — con diccionario `ALIAS` (entregado→entrega, reparado→facturacion, etc.).
- **`obtenerEtiquetaPaso(paso)` / `obtenerInfoPaso(estatusId)`**.
- **`renderTimelineHTML(estatusActual, {tabla, item})`** — barra de progreso HTML con 8 nodos.
- **`actualizarEstadoOrden(supabase, tipo, id, evento, desc, csrf, metadata)`** — insert en `orden_historial` con dedupe 5 s y fallback si la FK no existe.
- **`obtenerHistorialUnificado(supabase, tipo, id)`** — lee `orden_historial`.
- **`puedeEliminar(item, tabla)`** — reglas de integridad (cuarentena bloquea todo; etapas iniciales sí se pueden borrar).
- **`estaEnCuarentena(item)` / `badgeCuarentenaHTML()`**.
- **`obtenerEventoCOI(supabase, tablaOrigen, registroId)` / `badgeCOIHTML(evento)`** — estado del evento contable.

### 5.5 costos-engine.js — motor financiero (`window.CostosEngine`)
Todos los parámetros vienen de `parametros_costos` (por departamento).
- **`loadFromDatabase(depto)`** — carga y normaliza parámetros (`gasolina_precio_litro`, `rendimiento_km_litro`, `tiempo_invertido_hr`, `gastos_fijos_hr`, `camioneta_hr`, `mano_obra_hr`, `utilidad_base`, `credito_pct`, `iva`).
- **`setDepartamento(depto)` / `getConfig()` / `applyConfig(partial)`**.
- Fórmulas base: **`calcularLitros(km)`** = `(km*2)/rendimiento`; **`calcularCostoGasolina(km)`**; **`calcularCostoVentas(dias)`**; **`calcularCostoTrasladoTecnico(horas)`**; **`calcularGastosFijos(horas)`**; **`calcularCostoCamioneta(horas)`**; **`calcularGasolinaMasTraslado(km,horas)`**; **`calcularManoObra(horas)`**; **`calcularGastosGenerales(...)`**; **`aplicarUtilidad(gg, factor)`**; **`aplicarCredito(precio)`**; **`calcularIVA(monto)`**; **`calcularTotalConIVA(base)`**.
- **`calcularPrecioFinal({km, horasViaje, horasTaller, costoRefacciones, utilidadFactor})`** — devuelve objeto completo con desglose y total.
- Especializados: **`calcularAutomatizacion(servicios, km, hrsInv, materiales, viaticos)`** (tarifas por servicio: PLC/HMI 650, servomotor 700, etc.; materiales×1.3; crédito 3%; descuento 5%); **`calcularLaboratorio(dias, km, horasInvertido, refacciones, uf)`**; **`calcularMotores(dias, km, becerra, uf)`**; **`calcularSuministros(dias, km, proveedor, uf)`**.
- Rentabilidad real: **`calcularCostoRealLaboratorio/Motores/Automatizacion(data)`**; **`determinarRentabilidad(presupuestado, real)`** → `'rojo'|'verde'`.

### 5.6 folio-formats.js — folios secuenciales (`window.folioFormats`)
- **`getNextFolioAutomatizacion()`** → `SP-A[YY][MM]/[NN]`.
- **`getNextFolioMotores()`** → `SP-M[YY][MM][NNN]`.
- **`getNextFolioLaboratorio()`** → `SP-E[YY][MM][NNN]`.
- **`getNextFolioSuministro(fecha)`** → `SP-S[YYMMDD]-[N]` (por salidas del día en `movimientos_inventario`).
- **`getNextFolioCotizacionSuministro(fecha)`** → `SP-S…` por folios en `cotizaciones` origen suministro.
- **`getNextFolioOrdenCompra()`** → `SP-OC[YY][MM][NN]`.
- **`normalizeFolioLaboratorio(folio)`** — normaliza históricos (`SP0513`→`SP-E0513`), respeta SP-M/SP-A/SP-S.

### 5.7 nav-by-role.js — visibilidad por rol
- **`ROLE_MODULES`** — mapa rol→lista de módulos (`null` = todo).
- **`canSeeSpecialModule(rol, module, profile)`** — calculadoras/config/analisis_general/pdfs_politicas/alarmas.
- **`loadUserModulePermissions()`** — cachea `user_module_permissions` en sessionStorage.
- **`applyNavByRoleFromCache(rol)`** — oculta/muestra ítems del menú, tarjetas y KPIs de forma síncrona.
- **`applyNavByRole(profile)`** — versión async con `hasPermission`.
- **`getEffectiveRol(profile)`** — aplica modo dual.
- **`injectDualModeToggle(profile)`** — botón para alternar admin/normal.
- **`applyBodyFinancialClass(profile)`** — clase `ssepi-sin-financieros` si no ve costos.
- **`hideEmptyCategories()`** — oculta categorías de menú vacías.

### 5.8 index-core.js — dashboard principal
`window.indexCore.init()`:
- **`_checkSupabaseConnection()`** — ping a `audit_logs`.
- **`_startListeners()`** — KPIs: Ventas del mes (o Compras Pendientes si rol ventas), Tareas Taller (pendientes taller+motores), Valor Inventario (no ventas), Compras Pendientes; feed de auditoría.
- **`_loadFeed()`** — últimos 10 `audit_logs` + pendientes de borrador.
- **`_startRealtime()`** — canal `audit_logs` → recarga feed.

### 5.9 Seguridad
- **security-middleware.js**: `applyCSP()` (restrictiva en prod, relajada en localhost), `generateCSRFToken()`/`validateCSRFToken()`, `checkRateLimit()` (60/min), `sanitizeInput/sanitizeObject/escapeHTML`, `requireAuth()`.
- **encryption-utils.js**: la encriptación real (AES-256-GCM pgcrypto) ocurre en BD; aquí solo `EncryptedField/encryptField` marcan campos, `sha256()` (WebCrypto), `calculateRecordHash()` (integridad).
- **security-logger.js**: `registrarEvento(evento, datos, severidad)` con taxonomía y niveles.
- **audit-feed.js**: `initAuditFeed({tables, listId, ...})` — feed Realtime de `audit_logs` por módulo.
- **rate-limit.js**: `verificarRateLimit(accion, id)` vía RPC `check_rate_limit` (login 5/5min, export 10/h, etc.).
- **hidden-profiles.js**: oculta cuentas internas (`HIDDEN_PROFILE_EMAILS`), `filterVisibleProfiles()`, `resolveHiddenUserIds()`.
- **validators.js**: `isEmail/isRFC/isPhone/isPositiveNumber/notEmpty/isSKU/isNotFutureDate`, `validateCliente/validateCotizacion`.

### 5.10 PDF y documentos
- **pdf-generator.js** — jsPDF + autoTable. Genera cotización y reporte desde `data` (no DOM). `_decodePdfText()` (decodifica entidades), `_itemTituloPdf/_itemSpecsPdf` (anti-duplicación), `_clienteFieldsFromData`. Aplica membrete según `departamento`.
- **membretes_base64.js** — `window.MEMBRETES[depto]` logos embebidos base64.

### 5.11 IA / n8n
- **ai-assistant.js** — `AIAssistant` con caché de 100 registros por módulo. `analizarVentas()`, `analizarTallerYMotors()`, `_generarRecomendacionesVentas()`.
- **n8n-status.js** — `check()` lee `n8n_heartbeat`, marca ACTIVO/DESCONECTADO (umbral 120 s), polling 60 s.
- **n8n-insights-panel.js** — panel colapsable de `n8n_insights` filtrado por rol; `_dismissInsight()`, Realtime + fallback polling 30 s.

### 5.12 COI / contabilidad
- **coi-queue.js** — `enqueueCoiJob(job)` insert en `coi_sync_queue` con `idempotency_key`; `_isDuplicateError()` idempotente.
- **coi-sync-engine.js** — disparadores: `notifyVentaIfEligible` (pagada), `notifyCompraIfEligible` (estado≥4), `notifyFacturaIfEligible` (timbrada), `notifyNominaIfEligible` (pagada); bridge configurable en localStorage.

### 5.13 Otros core
- **folio-operativo-service.js** — `buildEvaluacionCotizacion()` (snapshot stock), `syncFolioAfterCotizacionInsert()` (crea folio en `ssepi_folio_operativo` etapa cotización).
- **ventas-costo-desglose.js** — tabla de costos Excel para Automatización; `FILAS_COSTO_AUTO`, `buildDesgloseDesdeFuentes()`, `recalcularDesglose()`, `matchServicioFila()`.
- **deptos-helper.js** — mapea etiquetas wizard ↔ slugs CostosEngine (`ventasToEngine`, `engineToVentas`).
- **horas-jerarquia.js** — árbol de horas plan (servicio→subactividades→hijos): `sumHorasPlanSubactividades`, `validarHorasPlan`, `calcularHorasExtraSub`, `horasParaCotizacionActividad`.
- **contactos-formulas.js** — `KM_DATA` + `getKmPorCliente()`, `calcularCostoRecoleccion/Redondo()`.
- **contactos-grupo-utils.js** — agrupa contactos por empresa: `empresaGrupoKey()`, `isGarbageContactName()`, `contactoDisplayNombre()`.
- **email-service.js** — `window.emailService.send()` → Edge Function `send-email` (Resend).
- **ocr-cleaner.js** — `window.OCRCleaner.cleanText/cleanCliente/cleanEquipo/isOdooUiGarbage` — sanea capturas OCR.
- **user-menu.js** — dropdown admin (config, tema, logout) + modal (nombre, correo, carpeta respaldo File System Access, cambio password).
- **theme-clock.js** — tema claro/oscuro en localStorage + reloj HH:MM:SS.
- **ssepi-toast.js** — `_showToast(msg, tipo)`, `addAlarmToast()` con `playAlarmSound()`.

### 5.14 ssepi-runtime/ — autoguardado y borradores
Sistema modular de borradores offline coordinado por event bus.

- **ssepi-event-bus.js** — `ssepiEmit/ssepiOn` sobre CustomEvent. Eventos: `DRAFT_SAVED`, `DRAFT_RESTORED`, `RESUME_DRAFT`, `PENDING_UPDATED`.
- **json-safe.js** — `safeJsonParse/safeJsonStringify`.
- **module-routes.js** — `pagePathForModule()` mapea módulo→ruta HTML.
- **draft-local-store.js** — `saveLocalDraft/loadLocalDraft/removeLocalDraft` (prefijo `ssepi_draft_v1:`).
- **pending-drafts-registry.js** — `upsertPendingEntry/removePendingEntry/listPendingEntries` (en `ssepi_pending_entries_v1`, máx 40).
- **autosave-debounce.js** — `debounce/throttle`.
- **autosave-coordinator.js** — **`createAutosaveController({module, getRecordKey, collectPayload, getLabel, debounceMs})`**: `schedule()` (debounced) y `flush()`; guarda borrador local + registra pendiente + emite eventos; lock por `module:key`.
- **draft-purge-keys.js** — `purgeDraftRecordKeys()` limpia al persistir OK.
- **pending-activity-view.js** — `renderPendingHtmlList()`, `formatPendingTitle()`.
- **nav-pending-mini.js** — `mountNavPendingMini()` mini-lista en el nav.
- **module-pending-preview.js** — preview por módulo con botones Continuar/Eliminar.
- **lab-order-filter.js** — aísla órdenes importadas del paquete Laboratorio (`isOrdenLaboratorioImportada`, `filterOrdenesOperativas`).
- **cost-visibility.js** — `canSeeFinancials()`, `canSeeCostsInModule()`, `isSuministrosAdmin()`, `applyBodyFinancialClass()`, `formatMoney()`.
- **priority-suppliers-catalog.js / -merge.js** — catálogo proveedores prioritarios (W Electronics, Mouser, DigiKey…) y mezcla con contactos BD.

**Flujo autoguardado**: input → `autosave-coordinator.schedule()` (debounce ~1.4 s) → `saveLocalDraft()` + `upsertPendingEntry()` → `ssepiEmit(DRAFT_SAVED/PENDING_UPDATED)` → nav-mini y preview se repintan. Al guardar en servidor: `purgeDraftRecordKeys()`.

---

## 6. Módulos (`panel/js/modules/`) — función por función

### 6.1 ventas.js — Cerebro comercial (7505 líneas)
IIFE `VentasModule` en `window.ventasModule`. Wizard de 4 pasos + kanban comercial.

**Arranque y datos:**
- **`init()`** — perfil, visibilidad financiera, `CostosEngine.loadFromDatabase('ventas')`, clientes tabulador, bind events, datos iniciales, Realtime, autosave, reanuda borradores; exporta folios a `window.folioFormats`.
- **`_loadInitialData()`** — carga paralelo ventas/cotizaciones/inventario/contactos/proyectos/taller/motores (+ diferido compras/suministros).
- **`_loadVentas/_loadCotizaciones/_loadInventario/_loadContactos/_loadProyectos/_loadTaller/_loadMotores/_loadCompras/_loadSuministrosVentas()`** — `*Service.select()`. `_loadTaller` filtra operativas; `_loadCompras` separa `solicitudesTaller`.

**Creación de órdenes (paso 1):**
- **`_ventasCrearOrdenOperativa(dept, cliente, falla, fecha, prioridad, csrf)`** — crea la orden en la tabla destino según depto (SP-E/SP-M/SP-A/SP-SOP/SP-S), valida auth, evita duplicados por cliente+fecha, recupera por folio si choca, dispara `actualizarEstadoOrden('creacion')`.
- **`_persistirOrdenTrasConfirmacionCliente(cot)`** — update orden a `Confirmado` + `fecha_confirmacion_cliente`.
- **`_crearCompraVinculada(ordenFolio, ordenId, tipo, cliente, csrf)`** — preregistro en `compras` (`estado:0`, `estado_interno:'esperando_diagnostico'`) para Lab/Motores.
- **`_crearFacturaVinculada(cotId, folio, cliente, total, csrf)`** — factura borrador (Suministros).
- **`generarFolioCotizacion()`** → `COT-NNNN` (foliador_control). **`generarFolioPorTipo(depto)`** — SP-E/SP-M/SP-A/SP-S/SP-P.

**Wizard:**
- **`_wizardSiguiente/_wizardAnterior/_renderWizardPaso(paso)`** — navegación; siguiente valida, crea orden, snapshot %, autosave, avanza.
- **`_renderWizardPaso1/3/4()`** — paso 1 (depto, cliente, fecha, prioridad, equipos/servicios/BOM según depto, falla); paso 3 (utilidad/crédito + vista previa PDF o desglose Auto); paso 4 (confirmación).
- **`_attachWizardPaso1()`** — change depto → `CostosEngine.setDepartamento` + `_toggleWizardDeptFields`; change cliente → autofill + KM/horas + banner adeudo.
- **`_toggleWizardDeptFields()`** — muestra BOM/usuarios/servicios según depto.
- **`_loadBomCatalogoVentas/_renderWizardBomLista/_renderWizardBomSeleccionados/_agregarBomItemVentas/_agregarManualSuministroVentas`** — catálogo BOM+inventario.

**Calculadora (paso 2):**
- **`_abrirCalculadora(compraId)`** — abre wizard paso 2 desde solicitud de Taller.
- **`_generarHTMLCalculadora()`** — resumen costos, componentes, bitácora actividades (Auto), logística KM/horas, totales/margen.
- **`_recalcular()`** — recalcula todo vía CostosEngine; Auto → `_syncTotalesWizardDesdeDesglose`.
- **`_agregarComponente/_eliminarComponente/_autoCompletarComponente`** — componentes (autocompleta desde inventario, markup 1.4).
- **`_refreshLogisticaFromInputs()`** — gasolina/traslado en vivo.
- **`_abrirRegistroViaticos/_editarViaticosCliente/_guardarViaticosCliente`** — KM/horas del cliente → `contactos`.
- **`_abrirEditorCostos/_guardarConfiguracionCostos/_agregarGastoFijo/_eliminarGastoFijo`** — editor admin de `parametros_costos`/`gastos_fijos`.
- **`_calcularCostoPorTabulador(empresa, km, horas, refacciones)`** — cálculo alternativo.

**Cotización:**
- **`_generarCotizacion()`** — flujo clásico (no wizard).
- **`_enviarCotizacionCliente()`** — clásico: items, folio COT, insert `cotizaciones` (con `orden_origen_id`+`origen`), correo.
- **`_autorizarCotizacion(id)`** — `autorizada_por_ventas`, orden→Diagnóstico, crea `compras` PO- para Lab/Motores, notifica.
- **`_rechazarCotizacion(id)`**.
- **`_nuevaCotizacion()`** — wizard paso 1 (o reanuda borrador).
- **`_abrirRegistroRapido/_guardarRegistroRapido`** — cotización rápida `estado:'registro'`.
- **`_guardarCotizacionDesdeWizard()`** — núcleo: paso 1 crea orden+compra+cotización borrador; paso 2-3 guarda borrador; paso 4 insert/update `cotizaciones` con `cerebro_registro`/`costo_desglose`/items, sincroniza folio, registra historial, resetea adeudo.
- **`_enviarCotizacionDesdeWizard()`** — guarda + envía correo.

**Vistas y filtros:**
- **`_applyFilters()`** — merge ventas+cotizaciones, filtra canceladas, fechas, vendedor, estado (mapeos registro→…→pagado), búsqueda; render kanban/lista/gráfica/historia/KPIs.
- **`_renderKanban/_renderKanbanCardsAsync/_renderLista/_renderGrafica/_updateKPIs/_renderPipelineCards`** — 10 columnas kanban, badges cuarentena, total solo admin.
- **`_mergeVentasCotizaciones/_estadoKanbanEfectivo/_estadoVentasDisplay/_ordenOperativaPorCotizacion/_cotizacionPorOperativa/_operativaEstaTerminada`** — helpers de unión.
- **`_renderHistoriaComercial/_renderHistoriaTable/_setupHistoriaComercialTabs`** — tabla unificada activas/cerradas.
- **`_bindOperativasVentasPanel/_renderOperativasVentasList`** — panel pestañas operativas con enlaces y botón "Cliente confirmó".

**Detalle / acciones:**
- **`_mostrarHistorial(id, tipo)`** — timeline + eventos `orden_historial` + botones contextuales.
- **`_abrirDetalle(id, tipo)`** — router a módulo externo o historial.
- **`_editarVenta/_eliminarVenta/_reenviarCotizacion`** — editar (wizard/redirect), cancelación lógica (`estado:'cancelado'`), toast.
- **`_insertarEventoHistorial`** — delega a state machine.
- **`_consultarAdeudoCliente(id)`** — banner adeudo (admin: checkbox incluir).
- **`_clienteConfirmo/_clienteCancelo(cotId)`** — confirmación/cancelación cotización.
- **`_clienteConfirmoOperativo/_clienteCanceloOperativo(ordenId, tipo)`** — sobre orden operativa.
- **`_activarGarantia(ordenId, tipo)`** — clona orden `*-G1` `es_garantia:true`.

**Suministros (dentro de Ventas):**
- **`_verPDFSuministro/_descargarPDFSuministro/_generarPDFSuministro`**; **`_confirmarCompraSuministro/_enviarAFacturacionSuministro/_clienteCanceloSuministro`**.

**Bitácora actividades (Auto):** `_exportarBitacoraCSV/_agregarActividadDiaria/_eliminarActividad/_renderTablaActividadesDiarias/_calcularTiempoTotal`.

**PDF:** `_descargarPDFDesdeWizard(preview, embedFrameId)`, `_generarPDF(preview)`, `_generarPDFDesdeHistorial`, `_generarPDFSuministro` — todos vía `pdfGenerator.generateCotizacion/generate` con `departamento`.

**Autosave:** `_initVentasAutosave/_collectVentasDraftPayload/_applyVentasDraft/_flushVentasAutosave/_tryResumeVentasDraft`.

**Realtime:** `_setupRealtime` — ventas/cotizaciones/compras/ordenes_*/orden_historial/notificaciones(para=ventas).

**Acciones de usuario clave:** `#newCotizacionBtn`→`_nuevaCotizacion`; `#wizardNextBtn/PrevBtn/CancelBtn`; `#guardarCotizacionWizardBtn`; `#descargarPDFWizardBtn`/`#vistaPreviaPDFWizardBtn`; `#enviarCotizacionBtn`; `#aplicarFiltrosBtn`; `#chkMostrarCanceladas`; `.chip-filtro`; `#vistaKanban/Lista/Grafica`; `#wizardDepartamentoSelect`→`_toggleWizardDeptFields`; `#wizardClienteSelect`→autofill; `#wizardBomBusqueda`; `button[data-bom-id]`→`_agregarBomItemVentas`; `#compNombre`→`_autoCompletarComponente`; `#inpLogisticaKm/Horas`→`_refreshLogisticaFromInputs`; `.kanban-card`→`_abrirDetalle`; botones editar/eliminar/reenviar en tarjetas.

---

### 6.2 taller.js — Laboratorio de Electrónica (SP-E, 4454 líneas)
IIFE `window.tallerModule`. Pipeline 5 pasos, kanban 9 etapas, importación reportes legacy, OCR cleaner, ws-chatter, autoguardado.

**Arranque:** `init()`; `_loadInitialData` (órdenes/clientes/inventario/compras/tabulador); `_loadOrders` (ordenes_taller orderBy fecha_ingreso, normaliza importadas `_applyLaboratorioImport`, fuerza Reparado/Cancelado históricos, enriquece rentabilidad); `_loadClients/_loadInventory/_loadComprasVinculadas/_loadTabuladorClientes`; `_cargarTecnicos/_cargarEncargadosRecepcion/_cargarVendedores`; `_setupRealtime` (3 canales); `_cargarNotificaciones`; `_populateClientSelect` (optgroups por empresa + tabulador).

**Filtros/vistas:** `_applyFilters`; `_renderKanban/_renderLista/_renderGrafica/_renderGraficaEvolucion`; `_crearCardKanban` (badges rentabilidad/origen/compra/cuarentena); `_updateKPIs`.

**Modal orden:** `_abrirOrden/_editarOrden` (carga, ws-chatter, timeline, widget actividades); `_abrirNuevaOrden` (busca cotizaciones aprobadas o folio SP-E); `_buscarCotizacionesPendientes/_mostrarSelectorCotizaciones/_cargarOrdenDesdeCotizacion`; `_estadoToPaso/_pasoToEstado/_estadoPrioridad`; `_renderTimelineTaller`; `_cargarDatosEnModal`.

**Importación / OCR:** `_erpOrdenToLabRaw/_ensureOrdenClienteCampos/_applyLaboratorioImport` (vía `window.LaboratorioImport`, formato laboratorio-1); `_limpiarTextoOcrOrden` (OCRCleaner sobre 10 campos).

**Ws-chatter (Notas de Campo):** `_initWsChatterUI/_bindWsChatterTabs/_wsAddNote/_loadWsActividad/_renderWsNotesFromOrden` (notas separadas por `---`, parse `[fecha] autor: cuerpo`).

**Pasos:** `_irPaso/_actualizarBotonesPaso/_prevStep/_nextStep/_validarPasoActual/_terminarEtapa(n)`.
1. **Recepción**: cliente, equipo (Tablero/HMI/PLC/Servos/Tarjeta/Sensores/Chillers/Teach Pencil/Otro), marca, modelo, serie, falla, condiciones, encargado, vendedor, garantía, fotos. Guardar → folio SP-E + **preregistro automático PO- en Compras**.
2. **Diagnóstico**: técnico, horas, refacciones por enlace (proveedores priority) / inventario (SKU). `_terminarEtapa(2)` dispara `_enviarListaRefaccionesACompras`.
3. **Esperando Cotización/Confirmación**: `_enviarEstimacionAVentas` (costo estimado, notifica ventas `diagnostico_completado`); `_enviarListaRefaccionesACompras` (crea/actualiza `PO-{folio}`, RPC `reservar_material`, notifica Compras+Ventas, estado Esperando Cotización); `_marcarClienteConfirmado`.
4. **Reparación**: `_renderDiagnosticoEnlaces/_renderDiagnosticoInventario/_renderConsumibles/_renderComponentesInventario/_renderComponentesCompra/_renderComponentesExtras`; `_renderPanelRentabilidad`; `_terminarReparacion` (descuenta stock, estado Reparado, notifica facturación).
5. **Entrega/Facturación**: `_completarEntrega` (foto entrega, estado Entregado, notifica facturación). PDFs aquí.

**Guardado:** `_guardarOrden(silencioso, pasoParaEstado)` — recolecta, sube fotos, asocia listas, calcula CostosEngine, rentabilidad/adeudo, auto-avanza estado; insert (`origen:'panel'`, `formato:'laboratorio-1'`, crea `actividades_diarias`, preregistro Compras) o update; `orden_historial`; actualiza cotización vinculada; adeudo en `clientes_adeudos` + RPC.

**Otros:** `_sinReparacion` (En Espera + sin_reparacion, notifica compras); `_notificarVentasReparado`; `_actualizarCompraVinculada`; `_eliminarOrden`; `_generarFolio`; `_subirFoto/_subirFotos` (bucket `pdfs` o `/api/upload` offline).

**PDFs:** `_openOrdenReportHtml` (HTML imprimible A4); `_generarCotizacionTaller`; `_generarReporteTaller(preview, {sinPortada, partirSecciones})`; `_imprimirOrdenReparacion/_vistaPreviaOrdenReparacion`.

**Imágenes reporte:** `_renderReporteImagenes/_agregarImagenReporte/_eliminarImagenReporte/_initReporteImagenes` (hasta 5, data URL/URL storage).

**Acciones:** `#newOrderBtn`→`_abrirNuevaOrden`; `.ws-step-btn`→`_irPaso`; `#prevStepBtn/#nextStepBtn`; `#saveOrderBtn`→`_guardarOrden`; `#completeOrderBtn`→`_completarEntrega`; `#sinReparacionBtn`; `#generarCompraBtn`→`_enviarListaRefaccionesACompras`; `#btnEnviarEstimacionVentas`; `#btnNotificarVentasReparado`; `#btnClienteConfirmadoTaller`; `#terminarEtapa1..5`; `#terminarReparacionBtn`; `#addEnlaceBtn/#addInventarioBtn/#addConsumibleBtn/#addComponenteExtraBtn`; `#btnLimpiarOcr`; `#btnImprimirOrdenTaller/#btnVistaPreviaOrdenTaller`; `#btnReportePDFTaller/#btnReporteParcialTaller/#btnVistaPreviaReporteTaller/#btnCotizacionPDFTaller`; `#selClient`→precarga KM/horas; `.prio-chip`→proveedor; `#wsAddNoteBtn`; `#exportCSVContainer` (admin).

---

### 6.3 motores.js — Taller de Motores (SP-M, 2998 líneas)
`window.motoresModule`. Similar a taller pero con campos eléctricos (HP, RPM, voltaje, megger, IP, resistencias rU/rV/rW, becerra). Folio `MTR-` interno / `SP-M` PDF.

**Arranque:** `init`; `_loadInitialData` (Promise.all órdenes/clientes/inventario/compras/tabulador); `_loadOrders` (ordenes_motores, rentabilidad legacy); `_loadClients/_loadInventory (refaccion+consumible)/_loadComprasVinculadas (tipo=motor)/_loadTabuladorClientes`; `_cargarTecnicos` (depto Motores)/`_cargarVendedores`; `_setupRealtime` (3 canales); notificaciones.

**Filtros/vistas:** `_applyFilters`; `_renderKanban` (11 etapas)/`_renderLista/_renderGrafica` (barras por estado); `_crearCardKanban`; `_updateKPIs`.

**Modal:** `_abrirOrden` (no `_editarOrden`); `_abrirNuevaOrden` (folio `MTR-`); `_buscarCotizacionesPendientes/_mostrarSelectorCotizaciones/_cargarOrdenDesdeCotizacion`; `_estadoToPaso/_pasoToEstado/_estadoPrioridad`; `_cargarDatosEnModal` (campos motor); ws-chatter.

**Pasos:** `_irPaso/_prevStep/_nextStep/_validarPasoActual/_terminarEtapa`.
- **`_enviarEstimacionAVentas`** — CostosEngine + materiales, estado Esperando Confirmación, notifica ventas.
- **`_generarSolicitudCompra`** — crea `PO-{folio}` en Compras, RPC `reservar_material`, notifica Compras+Ventas, estado Esperando Cotización.
- **`_notificarVentasReparado`** — estado Reparado, notifica ventas.
- **`_terminarReparacion`** — descuenta stock, estado Reparado.
- **`_completarEntrega`** — estado Entregado.
- **`_guardarOrden`** — recolecta, CostosEngine.calcularMotores, rentabilidad/adeudo, insert/update + `orden_historial` + cotización vinculada + adeudo.

**PDFs:** `_generarCotizacionMotores`; `_generarReporteMotores`.

**Acciones:** análogas a taller (`#newOrderBtn`, step-btns, `#prevStepBtn/#nextStepBtn`, `#saveOrderBtn/#completeOrderBtn`, `#btnEnviarEstimacionVentas`, `#generarCompraBtn`, `#btnNotificarVentasReparado`, PDFs).

---

### 6.4 servicios.js — Automatización (SP-A, 4422 líneas)
`window.serviciosModule`. Pipeline 5 pasos (Levantamiento → Ingeniería → Materiales → Desarrollo → Entrega). BOM, garantías `SP-Axxx-G n`, sync Compras/Ventas.

**Arranque:** `init`; `_loadInitialData` (proyectos/bom/inventario/calculadora_costos); `_loadProjects/_loadInventory` (fusiona bom+inventario dedupe SKU); `_setupRealtime` (proyectos/compras/notificaciones para=automatizacion/orden_historial).

**Proyecto:** `_abrirProyecto(id)` (estado→paso `_estadoToPaso`, merge draft, modo consulta si completado); `_abrirNuevoProyecto` (busca cotizaciones aprobadas Auto sin orden_origen_id → `_mostrarSelectorCotizaciones/_cargarProyectoDesdeCotizacion`); `_cargarDatosEnModal` (folio, nombre, cliente, vendedor, requerimiento, `servicios_levantamiento`, actividades, gantt, materiales, épicas, apartados, km/horas, fechas_etapas); `_parseServiciosDesdeProyecto`.

**Pasos:**
1. **Levantamiento** — `_agregarServicioLevantamiento/_eliminarServicioLevantamiento`; servicios del catálogo.
2. **Ingeniería** — `_syncActividadesDesdeServiciosLevantamiento` (importa servicios); `_agregarActividad/_actualizarActividad` (valida horas HJ); sub-actividades jerárquicas `_agregarSubactividad/_agregarSubactividadHija/_eliminarSubactividad/_actualizarSubactividad` (validarHorasPlan); `_iniciarSubactividad/_finSubactividad` (timer, `duracion_minutos`); `_syncSubactividadModulo`; `_subirArchivosSubactividad`; `_sincronizarActividadesModulo` (upsert actividades_diarias+subtareas); `_generarCronograma` (Gantt); `_exportarCronogramaPDF`.
3. **Materiales** — `_renderMateriales/_agregarDesdeInventario/_agregarMaterialManual/_actualizarMaterial/_eliminarMaterial/_guardarMateriales`; `_upsertCompraDesdeAutomatizacion` (crea/actualiza `PO-<folio>`); `_enviarListaMaterialesACompras` (notifica ventas); `_buildLineasCompraAutomatizacion` (materiales+markup 17%+servicios+traslado); `_generarRequerimientoCompra`.
4. **Desarrollo** — `_subirArchivosDesarrollo/_eliminarArchivoDesarrollo`; épicas/tareas/subtareas; widget actividades.
5. **Entrega** — apartados (5 predeterminados), responsables; `_completarEntrega`; `_notificarVentasCompletado` (estado Completado).

**Guardar:** `_guardarProyecto(opts)` — valida cuarentena+nombre+cliente, ensambla payload, `costo_presupuestado/real/adeudo`, rentabilidad, insert/update, state machine, notifica Ventas si Completado, `orden_historial`, adeudo en `clientes_adeudos`+RPC.

**Garantía:** `_activarGarantia` (cuenta iteración, crea `SP-Axxxx-G n`, `es_garantia:true`, copia materiales, notifica ventas).

**Modo consulta:** `_aplicarModoConsultaUI` (banner, deshabilita acciones, botón ver OC).

**PDFs:** `_generarCotizacionAuto` (materiales+actividades tarifa 80/120+gasolina/camioneta); `_generarReporteAuto`; `_exportarCronogramaPDF`.

**Autosave:** `_initServiciosAutosave/_collectServiciosDraftPayload/_scheduleServiciosAutosave/_flushServiciosAutosave/_applyServiciosDraft/_tryResumeServiciosDraft`.

**Ws-chatter:** `_initWsChatterUI/_bindWsChatterTabs/_renderWsNotesFromOrden/_wsAddNote/_loadWsActividad`.

**Acciones:** `newProjectBtn`→`_abrirNuevoProyecto`; `saveProjectBtn`→`_guardarProyecto`; `prevStepBtn/nextStepBtn`; `ws-step-btn`→`_irPaso`; `terminarEtapa1..5`; `btnAgregarServicioLevantamiento`; `syncActividadesDesdeServicios`; `agregarActividad`; `generarCronograma/exportarCronogramaPDF`; `btnCotizacionPDFAuto/btnVistaPreviaCotAuto`; `btnReportePDFAuto/btnVistaPreviaRepAuto`; `agregarDesdeInventario/agregarMaterialManual/guardarMateriales`; `generarRequerimientoCompraBtn`→`_enviarListaMaterialesACompras`; `btnClienteConfirmadoAuto`; `btnActivarGarantiaAuto`; `btnNotificarVentasCompletado`; `paso1_cliente`→`_cargarTabuladorCliente`; `auto-sub-play/auto-sub-stop`→timer subactividad; `desarrolloArchivosInput`→upload.

---

### 6.5 proyectos.js — Soporte de Planta / Visitas (830 líneas)
`window.ProyectosModule`. Folio `SP-ymdNNN`. Incluye **OCR de hoja de orden** (Tesseract).

**Arranque:** `init`; `_loadVisits` (soporte_visitas + proyectos_automatizacion normalizados `_esProyecto`); `_setupRealtime`.

**Vistas:** `_applyFilters/_renderKanban (9 columnas incl. Garantía)/_renderLista/_renderGrafica/_updateKPIs`.

**Visita:** `_nuevaVisita` (folio); `_editarVisita` (si `_esProyecto` redirige a Auto); `_cargarDatosEnModal` (cliente, área, ubicación, equipo, responsable, técnico, depto, horas, objetivo, descripción, pruebas, recomendaciones, actividades); `_guardarVisita` (notifica compras si Esperando Cotización, ventas si Reparado/Completado); `_confirmarVisita` (estado `proyecto`, crea `proyectos_automatizacion` `origen:'soporte'`, folio `AUT-<ts>`); `_cancelarVisita`.

**OCR:** `_rellenarDesdeImagen` (Tesseract spa → `_parsearTextoHojaOrden` mapea etiquetas→campos, marca checkboxes de actividades).

**Acciones:** `newVisitaBtn`→`_nuevaVisita`; `guardarVisitaBtn`→`_guardarVisita`; `confirmarVisitaBtn`→`_confirmarVisita`; `cancelarVisitaEstadoBtn`; `rellenarDesdeImagenBtn`→`_rellenarDesdeImagen`; `fotoHojaOrden`; vistas/filtros.

---

### 6.6 soporte.js — Soporte de Planta con Refacciones (778 líneas)
`window.SoporteModule`. Flujo dos visitas + refacciones `PO-SOP-<folio>`.

**Arranque:** `init`; `_loadVisits` (soporte_visitas + proyectos_auto); `_setupRealtime` (cliente_confirmo→Confirmado, garantia_activada→toast).

**Visita:** `_nuevaVisita` (folio, `refaccionesSoporte=[]`); `_editarVisita/_eliminarVisita` (valida cuarentena/puedeEliminar); `_cargarDatosEnModal`; `_guardarVisita` (notificaciones por cambio estado).

**Refacciones:** `_renderRefaccionesSoporte` (tabla inline editable); `_actualizarRefaccionSoporte/_agregarRefaccionSoporte/_eliminarRefaccionSoporte`; **`_enviarRefaccionesAComprasSoporte`** — insert `compras` folio `PO-SOP-<folio>`, `vinculacion={tipo:'soporte', id, nombre, folio_soporte}`, `estado_interno:'esperando_cotizacion'`, actualiza visita `Esperando Cotización`, notifica compras (`solicitud_cotizacion`) y ventas (`diagnostico_completado`).

**Conversión:** `_confirmarVisita` (crea `proyectos_automatizacion` `origen:'soporte'`, folio `AUT-<ts>`); `_cancelarVisita`.

**Acciones:** `newVisitaBtn`; `guardarVisitaBtn`; `confirmarVisitaBtn`; `cancelarVisitaEstadoBtn`; `addRefaccionSoporteBtn`; `enviarRefaccionesComprasSoporteBtn`→`_enviarRefaccionesAComprasSoporte`; onchange/onclick refacciones; vistas/filtros.

---

### 6.7 compras.js — Órdenes de Compra (SP-OC, 3088 líneas)
`window.comprasModule`. OC 0-5, proveedores priority, recepción RPC, Excel, PDF, vínculo bidireccional.

**Arranque:** `init`; `_loadCompras` (orderBy created_at, normaliza `data/items/vinculacion` JSON, decodifica `&#x2F;`, fuerza estado numérico); `_loadProveedores/_rebuildProveedoresVista` (contactos tipo provider + mergePriority); `_fetchItemsCompraDb` (local: `compra.items` JSON; cloud: `compras_items`); consume URL params `vincTipo/vincId`.

**Detalle:** `_abrirDetalle` (carga items, `_enriquecerItemsDesdeProyecto`, `_recalcularTotalesCompra`, persiste, estatus orden vinculada `_fetchEstatusVinculacionRemota` 3 fallbacks, botón recepción).

**Recepción:** `_recibirCompra` — valida cuarentena, RPC `recibir_compra` (`p_compra_id`, `p_usuario_id`), si OC vinculada a taller notifica admin + `orden_historial` `computa_autorizada`, actualiza inventario.

**Crear:** `_guardarBorrador` (estado 0); `_guardarNuevaOrden` (valida depto+items; si `personalizada` multi-proveedor → `_guardarComprasSegmentadasPorProveedor` (OC por proveedor `PO-A-…`, sync `compras_folios` proyecto); sino insert estado 1 (o 2 si `esperando_cotizacion`), `compras_items`, email, notifica taller, state machine).

**Desde operativas:** `_crearOrdenDesdeSolicitud(id, tipo)` — busca OC vinculada, si no `_autoCrearCompraConfirmadaDesdeOperativa` (estado 3 directa) o `_precargarFormularioCompraVinculada`; `_abrirCotizacionDesdeSolicitud` (editar precios reales); `_enviarAVentas` (suministro: crea cotización, `confirmado_ventas`).

**Items desde vinculación:** `_cargarItemsDesdeVinculacion` (pull refacciones + auto-clasifica `_mapInventarioMatch`: SKU coincide stock → inventario, divide si parcial); `_itemsDesdeVinculacion`.

**Automatización:** `_lineasDesdeProyectoAuto` (materiales costo catálogo `_loadCatalogoPrecios`, markup 17%, actividades tarifa P=80/otro=120, gasolina/camioneta CostosEngine); `_persistirItemsRecalculados`; `_toggleAjuste3pct` (2% admin).

**Excel/PDF:** `_descargarOC` (plantilla `/excel/OC.xlsx`, SheetJS, 16 filas); `_generarPDFCompra` (`pdfGenerator.generateOrdenCompra`, `_resolverClienteContactoPdf` 3 niveles).

**Vistas:** `_renderKanban/_renderLista/_renderGrafica` (estados 0-5); `_renderOperativasComprasList` (tabs taller/motores/auto/solicitudes).

**Estados OC:** 0 Borrador → 1 Solicitud → 2 Cotización → 3 Confirmada → 4 Recibida → 5 Entregada. `estado_interno`: `preregistro`, `esperando_cotizacion`, `cotizado_enviado_ventas`, `confirmada`.

**Acciones:** `#newPurchaseBtn`→`_nuevaOrden`; `#guardarNuevaOrden`; `#guardarBorradorBtn`; `#addItemBtn/#addItemInventarioBtn`; `#vinculacionId` (blur)→`_cargarItemsDesdeVinculacion`; card→`_abrirDetalle`; `#editarOrdenBtn`; Btn "Confirmar Recepción"→`_recibirCompra`; "Descargar OC"→`_descargarOC`; "Ver/Descargar PDF"→`_generarPDFCompra`; "Enviar a Ventas"→`_enviarAVentas`; checkbox 2%→`_toggleAjuste3pct`; panel operativas "Nueva compra vinculada"→`_crearOrdenDesdeSolicitud`; filtros.

---

### 6.8 facturacion.js — CFDI / Finkok (1227 líneas)
`window.facturacionModule`. Visión 360° órdenes listas para facturar.

**Arranque:** `init`; `_loadTaller/_loadMotores` (estados listos: Reparado/Terminado/Entregado/Listo para facturar/Completado); `_loadProyectosFacturacion` (`_proyectoListoParaFacturar`); realtime.

**Costos:** `_calcularCostosOrden(orden, contacto)` — proyectos: subtotal/iva/total almacenados o `costos_por_orden` o CostosEngine; taller/motores: `costos_por_orden` o CostosEngine con componentes.

**Facturar:** `_abrirDetalle`; `_generarFactura(id, tipo)` (folio `F-{timestamp}`, preview CFDI 4.0, emisor SSEPI, receptor cliente/RFC, concepto `84111506` unidad `E48`); **`_timbrarFactura`** — valida cuarentena; SSEPI-NEXT local: POST `/api/facturar/timbrar` (Finkok UUID/XML); insert `facturas` (folio, `orden_taller_id/orden_motor_id/venta_id`, subtotal/iva/total, `uuid_cfdi`, `xml_url`); `enqueueCoiJob` (factura); orden→`Facturado`+`factura_id`; state machine `facturacion`; venta vinculada→`facturado:true, estatus_pago:'Pagado'`; ingreso `ingresos_contabilidad`; notifica ventas.

**Otros:** `_enviarFacturaACoi`; `_verPDF` (stub); `_renderKanban (Pendientes/Emitidas)/_renderLista/_renderGrafica/_updateKPIs`.

**Acciones:** Btn "Facturar"→`_generarFactura`; `#timbrarFacturaBtn`→`_timbrarFactura`; Btn COI→`_enviarFacturaACoi`; card→`_abrirDetalle`; filtros (`desde/hasta/estado/departamento`→area).

---

### 6.9 suministros.js — Suministros (SP-S, 1824 líneas)
`window.suministrosModule`. Catálogo BOM+inventario, carrito, cotización SP-S, pipeline 5 etapas, bandeja admin.

**Arranque:** `init` (perfil, `applyBodyFinancialClass`, carrito localStorage, `_loadData`, autosave, visibilidad costos, `?edit=folio`); `_configurarPermisosSuministrosUI`; `_loadData` (bom+inventario 500 c/u + fallback offline `/api/bom-search`/`/api/inventory-search`, `clientes_tabulador` activos); `_buildCatalogo` (BOM+STOCK/CONSUMIBLE con imágenes).

**Carrito:** `_addToCartDirect/_removeFromCart/_updateCartQty/_vaciarCarrito` (localStorage `ssepi_suministros_carrito`).

**Cotización:** `_recalcularCostos` (CostosEngine.calcularSuministros); `_guardarCotizacion` (folio SP-S, insert `cotizaciones` `origen:suministro` con `cerebro_registro`+componentes, `enqueueCoiJob` cotizacion_suministro).

**Pipeline:** `_avanzarPipelineSiguiente` (cotizacion→pendiente_admin→en_compra→aprobada→entregada; al entregada → `_deducirInventario`); `_renderSuministrosPipeline/_actualizarBtnSiguiente`.
- `_enviarRevisionAdmin` — admin→`_enviarACompras`, sino→`_enviarAAdmin` (estado `pendiente_admin`, notifica admin).
- `_enviarACompras` — OC `CMP-{folio}` estado 0 `esperando_diagnostico`, `compras_items`, notifica compras+ventas, COI, cotización `en_compra`.
- `_aprobarBandejaYEnviarCompras` / `_crearCompraDesdeCotizacion`.

**Vistas/historial:** `_verCotizacion/_editarCotizacion/_eliminarCotizacion/_generarPDF/_imprimirCotizacion`; `_renderAdminBandeja` (pendiente_admin); `_renderCotizaciones` (filtros admin vendedor/comprador/automatización); `_aplicarVisibilidadCostos`.

**Acciones:** Card "+ Agregar"→`_addToCartDirect`; carrito ✖/qty/Vaciar; `#btnGuardarCot`→`_guardarCotizacion`; `#btnSiguientePipeline`→`_avanzarPipelineSiguiente`; `#btnEnviarCompras`→`_enviarRevisionAdmin`; `#btnNuevaOrdenSuministro`→`_iniciarRegistroOrdenSuministro`; bandeja "Aprobar→Compras"→`_aprobarBandejaYEnviarCompras`; historial PDF/Ver/Editar/Eliminar; chips fuente; vistas.

---

### 6.10 contactos.js — Clientes/Proveedores (1487 líneas)
`window.contactosModule`. Kanban+lista, dedupe, timeline, WhatsApp, importación.

**Arranque:** `_loadContactos` (select pageSize 3000, dedupe `_claveDedupeContacto`, enriquece tabulador `_aplicarEnriquecimientoTabulador`, reconstruye grupos `_buildEmpresaGrupos`, rollup `_buildRollupPorEmpresa`).

**Detalle:** `abrirDetalle(id)` (panel lateral, timeline `actividades_contactos`, sección empresa tabulador + adeudo, personas vinculadas); `_cargarTimeline`; `_agregarActividad`; `_enviarWhatsApp` (wa.me + log actividad); `_updateContactData`; `_saveContact`.

**Importación:** `_handleFileImport` (Excel/CSV/PDF; detecta tabulador cotización, export Odoo `_isOdooPartnerSheet`+`_splitOdooNombreCompleto`, o genérico; merge/update PATCH rfc/dirección).

**Vistas:** kanban (avatar, badges tipo_ficha, match_score), lista (empresa_tabulador, rfc), panel lateral. `_renderDatosFaltantes` (fichas sin email/tel/RFC + "Buscar en Google"); `_updateKPIs`.

**Filtros:** tipo (all/client/provider), búsqueda, periodo, empresa. Realtime `contactos_changes`.

**Acciones:** `.filtro-btn`; `.periodo-option`; `#vistaKanban/#vistaLista`; `#searchInput`; `#filtroEmpresa`; `#newContactBtn`→`_abrirModalNuevo`; `#importBtn`; `#saveContactBtn`/`#updateContactBtn`; `#btnWhatsApp`; `.contact-card/tr[data-id]`→`abrirDetalle`; `.btn-buscar-google`; `#exportCSVContainer` (admin).

---

### 6.11 inventario.js — Productos (1080 líneas)
`window.inventarioModule`. Categorías refacción/almacenable/consumible/servicio (`CAT_MAP`), alertas stock, movimientos, importación multi-archivo.

**Arranque:** `_loadProductos` (orderBy sku, normaliza stock); `_filtrarYRenderizar`; `_mainCat` (normaliza a 4 categorías).

**Vistas:** `_crearCard` (stock indicator high/medium/low/empty, costo solo admin); `_renderizarTabla` (admin: costo/precio/valor/links O/DK/M; no-admin: reducida); `_actualizarKPIs` (total, bajo stock, valor total admin, movimientos mes).

**CRUD:** `_guardarProducto` (valida SKU+nombre únicos por categoría, insert/update, movimiento `ajuste` si stock cambió); `_eliminarProducto` (admin); `_registrarMovimiento` (entrada/salida/ajuste).

**Importación:** `_manejarImportacionGeneral` (multi-archivo, detecta categoría por nombre, CSV/XLSX); `_obtenerDatosDeWorkbook` (busca fila encabezados); `_procesarFilas` (upsert por SKU+categoria, movimiento si stock cambió).

**Rol:** `canSeeCosts` (admin), `canEditInventario` (admin), `_applyPerfilVentasUI`/`_applyAdminButtons`.

**Acciones:** `.cat-btn`; `#searchInput`; `#vistaGrid/Lista/Grafica`; `#newProductBtn`→`_abrirModalNuevo` (admin); `#importGeneralBtn/#importExcelBtn/#initDataBtn`; `#saveProductBtn/#updateProductBtn/#deleteProductBtn`; `#increaseStock/#decreaseStock`; `#excelFile`→`_manejarArchivoExcel`; `#processImportBtn`; `#fileInput`→`_manejarArchivoDirecto`; `#exportCSVContainer` (admin).

---

### 6.12 calculadoras.js — Motor de costos (2162 líneas)
`window.calculadorasMod`. Solo-admin. Administra calculadoras, costos, clientes vinculados, tabulador viáticos, hojas Excel, BOM, servicios, simuladores.

**Cargas:** `loadCalculadoras/loadCostos/loadClientes/loadBOM/loadServicios/loadContactos/loadClientesTabulador`; `_matchClienteTabulador`.

**Tablas:** `renderTabuladorViajes` (única) / `renderTabuladorViaticos` (T1-T5); `_obtenerDatosDeWorkbook`/`detectHojaIndices`; `importHojasMultiSheets`; `saveHojaRowFromTr/deleteHojaRowFromTr/appendEmptyHojaRow`; modales CRUD `openModal*/saveModal*/deleteModal*`.

**Simuladores (hojas por departamento):**
- **`runLaboratorioSim`** → `CE.calcularPrecioFinal` (gasolina/traslado/MO/gastosFijos/camioneta/refacciones/gastosGenerales/utilidad/crédito/IVA/total).
- **`runMotoresSim`** → `CE.calcularMotores` (gasolina/ventas/totalGV/becerra/camioneta/gastosSU/utilidad/crédito).
- **`runSuministrosSim`** → `CE.calcularSuministros` (proveedor en vez de becerra).
- **`runAutomatizacionSim`** → `CE.calcularAutomatizacion` (servicios+horas+hrsInv+materiales+viaticos).
- **T1 VIAJES**: km×2, litros, costoGas, costoDani.
- **T2 LABORATORIO**: gasolina+ventas (totalGV), tiempo invertido, gastos fijos, camioneta, gastosGen, utilidad×uf, crédito×1.03.
- **T3 MOTORES**: totalGV+becerra+camioneta=gastosSU, utilidad, crédito.
- **T4 AUTOMATIZACIÓN**: placeholder (importar hoja).
- **T5 SUMINISTROS**: igual que motores con proveedor.

**BOM catálogo:** `renderBOMCatalogo` (grid/tabla paginado, imágenes `BOM_IMAGE_INDEX`, búsqueda+categoría); `updateBOMTotals` (70% planta/30% oficina).

**Otros:** `onCambioDepto` (setDepartamento, recarga tarifas); `onCambioCliente` (propaga km/horas); `procesarImportacion`; `validar`.

**Acciones:** `#btnSeleccionarExcel`; `#excelFileCalculadoras`→`handleFileSelect`; `#btnProcesarImport`→`procesarImportacion`; `#btnValidar`; `#btnCalcLaboratorio/Motores/Automatizacion/Suministros`; inputs tarifas T1-T5→`renderTabuladorViaticos`; `#selDeptoCotizacion`→`onCambioDepto`; `#selClienteCotizacion`→`onCambioCliente`; `#hojaCalcSelect`→`loadHojaFilas`; `#btnHojaNuevaFila`→`appendEmptyHojaRow`; `.hoja-btn-save/del`; modales nuevo/editar/eliminar; `#btnBomVistaGrid/Lista`; `#bomCatalogoBusqueda/Categoria`; `.sum-card/tr[data-bom-id]`→`openModalBOM`.

---

### 6.13 actividades.js — Bitácora (1665 líneas)
`window.actividadesModule` (widget reutilizable). Tabla `actividades_diarias` + `actividades_subtareas` + `actividades_historial`. Claves `ACT-NNN`.

**Arranque:** `init`; `_detectarRol` (rol→depto; automatizacion→automatizacion_soporte); `_loadActividades` (rango semana, resuelve `creado_por`, filtra ocultos); `_loadSubtareas`; `_buildJiraKeyMap`.

**Vistas:** `_renderGridSemanal` (Lun-Sáb); `_renderKanban` (pendiente/en_progreso/completado, drag-drop, progreso subtareas); lista. `_filtrarActividades/_filtrarPorDepartamento`.

**Modal:** `_abrirModalActividad(editId)`; `_abrirModalDesdeWidget(depto, ordenId, ordenTipo)` (pre-lleno desde módulo operativo, `ORDEN_MAP`); `_guardarActividad` (valida, sube archivo PDF/DOC≤5MB Storage o `/api/upload`, insert/update, historial `creacion/archivo_subido/edicion`).

**Detalle:** `_verActividad` (info, resumen, archivos, historial); `_cargarHistorial/_insertarHistorial`; `_updateActividadEstado` (completado→`completado_en`+`duracion_minutos`, historial `estado_cambiado`); `_canMoveCard` (admin siempre, demás solo propias).

**Subtareas:** `_toggleSubtarea/_addSubtarea/_updateSubtareaTitle/_deleteSubtarea/_uploadSubtareaImage` (imágenes Storage `subtareas/`); `_guardarNotas/_guardarHorasPlan` (meta embebido `<!--ssepi-meta:-->`, admin); `_horasExtraActividad` (admin).

**Widget:** `renderWidgetActividades(containerId, ordenId, ordenTipo)` (cuenta pendientes/proc/comp, progreso, 3 últimas, botones Ver/Nueva).

**Rol:** admin (mueve cualquier card, edita notas, subtareas, horas extra, CSV); no-admin (solo propias). Filtro depto: taller→electronicos, motores→motores, automatizacion→ambos.

**Acciones:** `#btnNuevaActividad`→`_abrirModalActividad`; `#guardarActividadBtn`; `#btnVistaSemanal/Kanban`; `#aplicarFiltrosBtn`; `#filtroDepartamento/Tecnico/Estado/Tipo/Buscar`; `#actDepartamento`→recarga órdenes; `.kanban-card` drag→`_updateActividadEstado`, dblclick→sidebar; `.subtarea-check`→toggle; `.btn-add-subtarea/.btn-upload-image/.subtarea-delete` (admin); `.actividad-mini/card`→`_verActividad`; `#exportCSVContainer` (admin).

---

### 6.14 vacaciones.js — Vacaciones (589 líneas)
`window.vacacionesMod`. `vacaciones_solicitudes/balance/dias_feriados/empleados`.

**Arranque:** `loadEmpleadosAndUsers` (une vacaciones_empleados + users, filtra visibles, `empleadosMap`); `loadOcupacionForMonth/Year` (queries solapando rango, mapa fecha→empleados); `loadBalance`; `loadSolicitudes`; `loadFeriados`.

**Calendario:** `renderCalendar` (grid mensual, feriados legal/religioso/suspension_labores, dots vacaciones); `renderYearView`; `ensureBalance(userId, anio)` (inserta `dias_asignados=15` si no existe).

**Solicitar:** `enviarSolicitud` (valida, `countDiasLaborables` excluye sáb/dom/feriados, verifica disponibilidad, insert pendiente, update `dias_solicitados`).

**Admin:** `loadAdminBalances` (tabla editable `dias_asignados`); `loadFeriados`; `renderListaEmpleados`.

**Acciones:** `#btnSolicitar`→`enviarSolicitud`; `#calPrevMonth/NextMonth`; `#calToggleAnual`→`openAnualView`; `.cal-cell`→detalle día; `.btn-guardar-balance` (admin).

---

### 6.15 contabilidad.js / contabilidad-v2.js / contabilidad-coi.js (958/481/365 líneas)
- **contabilidad.js** (`window.contabilidadModule`) — balance ingresos/egresos, nómina, IVA, bancos, cuadernillo PDF Cuenta Pública. `_refreshBalanceView`; `_calculateIVA` (trasladado/acreditable); `_saveNominaPayment` (COI nomina); `_saveBankMovement` (COI bancos); `_generarPDFSeleccionado` (cuadernillo jsPDF). *(Nota: la página usa `contabilidad-coi.js`.)*
- **contabilidad-v2.js** (`window.contabilidadV2Module`) — dashboard moderno: `refreshAll` (ventas/facturas, compras, cobranza, nómina, KPIs inventario); `_syncExternalModuleLinks` (propaga filtros a otros módulos vía query string); `pagarCompra` (egreso bancario).
- **contabilidad-coi.js** — dashboard COI híbrido: `_refreshMotorStatus` (bridge localhost:8765); `loadInbox` (órdenes Reparado por facturar + facturas timbradas + cola COI); `loadSyncLog` (`coi_sync_log`); `_bindCoiPanel` (URL/llave bridge en localStorage); Realtime log/inbox.

---

### 6.16 nomina.js — Nómina standalone (279 líneas)
`window.nominaModule`. `pagos_nomina`.
- `refreshList` (filtros fecha, KPIs count/total/promedio); `_openNomModal/_saveNomModal` (calcula sueldo+extras+bonos−deducciones, insert `pagos_nomina` referencia `NOM-`, `enqueueCoiJob` nomina); `_loadEmpleadosDatalist` (contactos + fallback).

---

### 6.17 configuracion.js — Sistema/Permisos (503 líneas, LEGACY)
La página usa un script inline real (`role_permissions`: rol/module/action). Funciones: `loadCurrentProfile`; `loadUsuarios`/`cambiarRolUsuario`; `loadPermisosPorRol`/`guardarPermisosPorRol` (UPSERT role_permissions); `loadUsuariosParaSwitches`/`loadPermisosPorUsuario`/`guardarPermisosPorUsuario` (`user_module_permissions`); `exportarCSV/importarCSV/parseCSVLine`.

---

### 6.18 alarmas.js (204 líneas)
`window.AlarmasModule`. CRUD `public.alarmas` con Realtime. Estados pendiente/disparada/cancelada; prioridades baja/media/alta/critica. `refresh/renderTable/cambiarEstado/eliminar/openCrear/onSubmit/setupRealtime`.

---

### 6.19 analisis.js + específicos (dashboard ejecutivo)
- **analisis.js** (`AnalisisModule`, solo admin/superadmin/contabilidad) — `_loadInitialData` (9 tablas), `_recalcularTodo`, KPIs: `kpiSaldoCaja`, `valorInventario`, `kpiValorImperio`, `kpiEficiencia`, `kpiProyeccionUtilidad`; gráficas `_renderBalanceChart/_renderGastosDoughnut/_renderRadar/_renderHeatmapCiudades/_renderVip`; `_simularEscenario`; `_initSubAnalisisUI` (carga perezosa sub-análisis); `_exportarPDF` (jsPDF ejecutivo).
- **analisis-ventas.js** — Total/Pagado/Pendiente, doughnut, tabla 50 ventas, PDF admin.
- **analisis-taller.js** — KPIs por estado (Nuevo/Diagnóstico/Reparado/Entregado/Facturado/SinReparacion), doughnut, tabla.
- **analisis-motores.js** — Total/Pendientes/Reparados/Entregados, bar+line por mes.
- **analisis-automatizacion.js** — Total/Pendientes/Progreso/Completados, bar+line.
- **analisis-compras.js** — Total/Pendientes(≤2)/Confirmadas(=3)/Recibidas(≥4), bar+line por `fecha_creacion`.
- **analisis-proyectos.js** — `soporte_visitas`: Total/Pendientes/Convertidas/Completadas.

---

### 6.20 paginas.js / import-viewer.js
- **paginas.js** (`PaginasModule`) — CMS sobre `web_paginas` con CSRF/escapeHTML. `cargarLista/renderLista/nuevaPagina/abrirEditor/guardarPagina/eliminarPagina/vistaPrevia`.
- **import-viewer.js** (`window.importViewerModule`, admin) — `importFiles` (CSV manual / XLSX SheetJS); `saveContactos` (detecta Odoo `_rowFromOdooExport`, dedupe `_claveDedupeContacto`); `saveInventario` (`_mapInventarioRow`, upsert por SKU+categoria).

---

## 7. Cerebro IA — n8n + Ollama

n8n self-hosted (Docker `localhost:5678`) + Ollama `qwen2.5:3b` (`localhost:11434`). Modelo polling GRATIS (sin Supabase Pro ni tunnel): triggers Postgres insertan en `n8n_event_queue`, n8n polla cada 1 min.

**Workflows (`n8n-workflows/`):**
| # | Workflow | Rol |
|---|---|---|
| 00 | event-poller | Polling `n8n_event_queue` |
| 01 | heartbeat | Escribe `n8n_heartbeat` cada X |
| 02 | coi-cloud-processor | Procesa pólizas COI (reemplaza bridge Python) |
| 03 | cross-module-notifier | Notificaciones entre módulos |
| 04 | cerebro-ventas | Insights ventas |
| 05 | pipeline-tracker | Avance del pipeline |
| 06 | email-intelligence | Análisis correos |
| 07 | smart-audit | Auditoría inteligente |
| 08 | daily-digest | Resumen diario |
| 09 | alarmas-dispatcher | Dispara alarmas |
| 10 | alarmas-templates-checker | Valida plantillas |

Cada nodo HTTP usa `Authorization: Bearer` con `service_role` para PostgREST (escritura) y `anon` (lectura). Frontend consulta `n8n_heartbeat` (estado) y `n8n_insights` (sugerencias IA filtradas por rol).

**Costo total: $0/mes** (Supabase Free + Ollama local + n8n self-hosted).

---

## 8. Backend offline — SSEPI-NEXT (fallback)

Cuando el navegador corre en `localhost:3333` o `*.trycloudflare.com`, `supabase-config.js` activa **modo SSEPI-NEXT**:
- Las llamadas Supabase van al proxy local `/proxy` (Express compatible PostgREST) respaldado por **SQLite** (`ssepi-local.db`).
- `window.supabase.auth` se reemplaza por `offlineAuth` (login/session contra `/api/auth/*` en `offline-server.mjs` + `offline-auth.mjs`).
- Realtime desactivado (canales dummy).
- Endpoints extra: `/api/upload` (archivos), `/api/facturar/timbrar` (Finkok), `/api/bom-search`, `/api/inventory-search`.

**Reinicio local:** `reiniciar-ssepi.bat` → mata Node → limpia journal (NO borra `ssepi-local.db`) → seeds → servidor → Chrome limpio → tunnel.

**Importante (feedback del usuario):** validar TODO en proxy local SQLite antes de ejecutar migraciones en Supabase cloud. Nunca borrar `ssepi-local.db`.

---

## 9. Cómo usar el ERP

### Producción (cloud)
1. Abrir URL Vercel → `login.html`.
2. Login con email + password (contraseña provisional del usuario; rotar desde **Configuración → Cambiar contraseña**).
3. El dashboard muestra KPIs según rol; el menú lateral se filtra por rol.

### Local (offline)
1. `E:\SSEPI\reiniciar-ssepi.bat` (doble clic).
2. Acceder `http://localhost:3333/panel/login.html`.

### Perfiles (password provisional — ver `ssepinext/users-catalog.mjs`)
| Email | Rol |
|---|---|
| norbertomoro4@gmail.com | superadmin (modo dual → automatizacion) |
| ventas1@ssepi.org | ventas |
| electronica.ssepi@gmail.com | ventas_sin_compras / laboratorio |
| ivang.ssepi@gmail.com | automatizacion |
| motores1@ssepi.org | motores |
| laboratorio1@ssepi.org | admin (Laboratorio) |
| automatizacion1@ssepi.org | automatizacion |
| compras@ssepi.org | compras |

### Flujo típico de un trabajo
1. **Ventas** crea la cotización (wizard 4 pasos) → genera orden operativa con folio SP-E/M/A.
2. El **técnico** abre su módulo (Taller/Motores/Auto), ve la orden llegada desde Ventas, hace diagnóstico.
3. Si hay refacciones → **Compras** recibe la OC (PO-), cotiza proveedor, recibe material (RPC `recibir_compra` actualiza inventario).
4. El técnico ejecuta, al terminar marca Reparado/Completado → notifica a Ventas.
5. **Facturación** timbra CFDI (Finkok), inserta factura, marca venta Pagada, encola COI.
6. **Contabilidad** ve el balance; el bridge COI procesa la cola de pólizas.
7. Todo queda en `orden_historial` (timeline unificado) y `audit_logs` (auditoría).

---

## 10. Convenciones de código

- Cada módulo = IIFE expuesta en `window.<modulo>Module`/`Mod`, con `init()` llamado desde el HTML.
- Patrón: estado privado + `createDataService(tabla)` + Realtime + `_startClock` + `_cleanup` en `beforeunload`.
- `csrfToken` (sessionStorage) en toda escritura.
- `applyBodyFinancialClass(profile)` controla visibilidad de costos vía clase body.
- Perfiles ocultos (`hidden-profiles.js`) en contactos, actividades, vacaciones.
- Export CSV solo admin (`isAdminExportAllowed`).
- PDFs con membrete por `departamento` (vía `membretes_base64.js`).

---

## Relacionado
- `docs/arquitectura-maestra.md` — arquitectura general.
- `docs/FLUJO-VENTAS-Y-CALCULADORAS.md` — detalle del flujo Ventas.
- `docs/ROLES-Y-VISIBILIDAD.md` — roles.
- `docs/n8n-integration.md` — cerebro IA.
- `CLAUDE.md` — guía del proyecto (roles, flujo, seguridad).
- Memorias en `C:\Users\norbe\.claude\projects\E--SSEPI\memory\` — historial de sesiones.