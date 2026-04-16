# PROMPT PARA CLAUDE EN PC — CIBERSEGURIDAD ERP
## (Copia y pega esto completo en Claude Desktop)

---

Eres un experto en ciberseguridad y desarrollo seguro. Voy a darte una serie de tareas para proteger un ERP que usa:
- **Frontend**: Vercel (Next.js / React)
- **Base de datos**: Supabase (PostgreSQL)
- **App de escritorio**: Electron
- **Asistente IA interno**: Claude API

Ejecuta CADA paso en orden. Antes de cada paso muéstrame el código o comando exacto, y espera mi confirmación antes de continuar. Si algo requiere un archivo nuevo, créalo directamente en la ruta indicada.

---

## PASO 1 — ESTRUCTURA DE CARPETAS SEGURA (Módulo padre-hijo)

Crea la siguiente estructura de directorios en el proyecto. Las carpetas con prefijo `.enc` serán ignoradas por git y contendrán la lógica real cifrada. Solo se expone la capa visual.

```
/src
  /ui              ← Solo componentes visuales (se sube a Vercel)
  /hooks           ← Hooks de React sin lógica de negocio
  /services        ← Interfaces vacías (los tipos, sin implementación)
/core              ← NUNCA se sube. Lógica de negocio real
  /.enc            ← Módulos cifrados con AES-256
  /keys            ← Claves de descifrado (excluidas de git)
/scripts
  /build-secure.js ← Script que cifra /core antes de compilar
  /decrypt-run.js  ← Descifra en tiempo de ejecución (solo en servidor)
```

Crea un `.gitignore` que excluya:
```
/core/
/.enc/
/keys/
*.enc.js
*.key
.env*
/logs/
```

---

## PASO 2 — CIFRADO DE CÓDIGO FUENTE (Módulos padre → hijo)

Crea el script `/scripts/build-secure.js` que haga lo siguiente:
1. Lee cada archivo `.js` / `.ts` en `/core`
2. Lo cifra con **AES-256-GCM** usando una clave maestra (`MASTER_KEY` de variable de entorno)
3. Genera un archivo `.enc.js` en `/core/.enc/`
4. Genera un archivo "hijo" en `/src/services/` que solo contiene la interfaz TypeScript (tipos y firmas de función) sin la implementación real
5. El archivo hijo importa dinámicamente el módulo cifrado SOLO en tiempo de ejecución usando la clave hija derivada de la maestra

La clave padre genera claves hijas únicas por módulo usando HKDF (derivación de claves). Cada módulo tiene su propia clave derivada. Si alguien extrae un módulo hijo, no puede descifrar otro.

Usa esta lógica de cifrado:
```javascript
const crypto = require('crypto');

function cifrarModulo(codigoFuente, claveModulo) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', claveModulo, iv);
  let cifrado = cipher.update(codigoFuente, 'utf8', 'hex');
  cifrado += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    datos: cifrado
  };
}

function derivarClaveHija(claveMaestra, nombreModulo) {
  return crypto.hkdfSync('sha256', claveMaestra, nombreModulo, 'erp-modulo-v1', 32);
}
```

---

## PASO 3 — OBFUSCACIÓN DEL BUNDLE DE VERCEL

En el proyecto Next.js, instala y configura:

```bash
npm install --save-dev javascript-obfuscator @swc/core
```

En `next.config.js`, agrega un webpack plugin que:
1. Aplique obfuscación al bundle de producción
2. Elimine source maps en producción (`productionBrowserSourceMaps: false`)
3. Aplique tree-shaking agresivo para que solo los componentes visuales lleguen al cliente
4. Use `output: 'standalone'` para aislar dependencias

Configuración de obfuscador a usar:
```javascript
{
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  rotateStringArray: true,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
}
```

---

## PASO 4 — SEGURIDAD EN SUPABASE (Row Level Security + cifrado)

Conecta a mi proyecto Supabase y ejecuta estas políticas SQL. Reemplaza `tu_tabla` con las tablas reales cuando te las indique.

### 4a. Habilitar RLS en todas las tablas
```sql
-- Ejecutar para cada tabla del ERP
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_erp ENABLE ROW LEVEL SECURITY;
-- (agregar todas las tablas del esquema)

-- Política: usuario solo ve sus propios datos
CREATE POLICY "solo_propietario" ON clientes
  FOR ALL USING (auth.uid() = user_id);
```

### 4b. Cifrado de columnas sensibles con pgcrypto
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Cifrar columnas como RFC, CURP, datos bancarios
ALTER TABLE clientes ADD COLUMN rfc_cifrado BYTEA;
UPDATE clientes SET rfc_cifrado = pgp_sym_encrypt(rfc::text, current_setting('app.encryption_key'));
ALTER TABLE clientes DROP COLUMN rfc;
ALTER TABLE clientes RENAME COLUMN rfc_cifrado TO rfc;
```

### 4c. Crear rol de solo lectura para reportes
```sql
CREATE ROLE erp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO erp_readonly;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM erp_readonly;
```

### 4d. Auditoría de cambios
```sql
CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tabla TEXT,
  operacion TEXT,
  usuario_id UUID,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  ip_origen INET,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log(tabla, operacion, usuario_id, datos_anteriores, datos_nuevos)
  VALUES (TG_TABLE_NAME, TG_OP, auth.uid(), row_to_json(OLD), row_to_json(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## PASO 5 — HEADERS DE SEGURIDAD EN VERCEL

Crea o modifica `vercel.json` con estos headers HTTP de seguridad:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'nonce-{{NONCE}}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        }
      ]
    }
  ]
}
```

---

## PASO 6 — AUTENTICACIÓN Y JWT SEGUROS

En el código de autenticación de Next.js / Supabase:

1. **Configura MFA obligatorio** para todos los usuarios del ERP:
```typescript
// lib/auth.ts
export async function forzarMFA(userId: string) {
  const { data } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  return data;
}

export async function verificarMFA(codigo: string, factorId: string) {
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: codigo
  });
  if (error) throw new Error('MFA inválido');
  return data;
}
```

2. **Tokens con expiración corta + refresh rotation**:
```typescript
// En supabase.ts
const supabase = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce'  // Más seguro que implicit
  }
});
```

3. **Middleware de validación en cada ruta protegida**:
```typescript
// middleware.ts (Next.js)
export async function middleware(request: NextRequest) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.redirect('/login');
  
  // Verificar que el token no esté en lista negra
  const tokenRevocado = await verificarListaNegra(session.access_token);
  if (tokenRevocado) {
    await supabase.auth.signOut();
    return NextResponse.redirect('/login?razon=sesion-expirada');
  }
}
```

---

## PASO 7 — SEGURIDAD EN LA APP ELECTRON (Escritorio)

En el proceso principal de Electron (`main.js`):

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');

app.on('ready', () => {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: false,          // CRÍTICO: desactivar
      contextIsolation: true,          // CRÍTICO: activar
      sandbox: true,                   // Sandboxing del renderer
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Solo cargar URLs propias
  win.loadURL('https://tu-erp.vercel.app');
  
  // Bloquear navegación a URLs externas
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('https://tu-erp.vercel.app')) {
      event.preventDefault();
    }
  });
});

// Validar todos los mensajes IPC
ipcMain.handle('operacion-segura', async (event, datos) => {
  if (!validarOrigen(event.senderFrame)) throw new Error('Origen no autorizado');
  return await procesarOperacion(datos);
});
```

Crea `preload.js` que exponga solo las funciones necesarias via `contextBridge`:
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('erpAPI', {
  // Solo exponer lo mínimo necesario
  ejecutar: (accion, datos) => ipcRenderer.invoke('operacion-segura', { accion, datos })
});
// NUNCA exponer: require, fs, shell, node, process
```

---

## PASO 8 — VARIABLES DE ENTORNO Y SECRETOS

1. Crea un `.env.example` (sin valores reales, solo las claves):
```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
MASTER_ENCRYPTION_KEY=
JWT_SECRET=
CLAUDE_API_KEY=
DATABASE_ENCRYPTION_KEY=
```

2. Instala y configura rotación automática de secretos:
```bash
npm install dotenv-vault
npx dotenv-vault new
npx dotenv-vault push
```

3. Agrega este script de validación que corre al inicio del servidor:
```typescript
function validarVariablesEntorno() {
  const requeridas = ['SUPABASE_URL', 'MASTER_ENCRYPTION_KEY', 'JWT_SECRET'];
  const faltantes = requeridas.filter(k => !process.env[k]);
  if (faltantes.length > 0) {
    throw new Error(`Variables de entorno faltantes: ${faltantes.join(', ')}`);
  }
  if (process.env.MASTER_ENCRYPTION_KEY!.length < 64) {
    throw new Error('MASTER_ENCRYPTION_KEY debe tener al menos 64 caracteres');
  }
}
```

---

## PASO 9 — RATE LIMITING Y PROTECCIÓN CONTRA ATAQUES

En las Edge Functions o API Routes de Next.js:

```typescript
// lib/rateLimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 req cada 10 seg
  analytics: true,
});

export async function protegerRuta(ip: string) {
  const { success, limit, remaining, reset } = await ratelimit.limit(ip);
  if (!success) {
    throw new Error(`Rate limit excedido. Reintenta en ${reset}ms`);
  }
  return { limit, remaining };
}
```

Protección adicional:
```typescript
// Sanitización de inputs (prevenir SQL injection y XSS)
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

const EsquemaEntrada = z.object({
  nombre: z.string().min(1).max(100).regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/),
  monto: z.number().positive().max(9999999),
  fecha: z.string().datetime()
});

export function validarEntrada(datos: unknown) {
  return EsquemaEntrada.parse(datos); // lanza error si es inválido
}
```

---

## PASO 10 — MONITOREO, LOGS Y ALERTAS

Instala Sentry para monitoreo de errores y seguridad:
```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Crea el sistema de logs de seguridad:
```typescript
// lib/securityLogger.ts
export enum EventoSeguridad {
  LOGIN_EXITOSO = 'auth.login.success',
  LOGIN_FALLIDO = 'auth.login.failed',
  MFA_FALLIDO = 'auth.mfa.failed',
  ACCESO_NEGADO = 'authz.access.denied',
  DATO_EXPORTADO = 'data.export',
  CAMBIO_PERMISO = 'admin.permission.changed',
  ANOMALIA_DETECTADA = 'security.anomaly'
}

export async function registrarEvento(
  evento: EventoSeguridad,
  userId: string,
  detalles: Record<string, unknown>,
  ipOrigen: string
) {
  await supabase.from('audit_log').insert({
    evento,
    user_id: userId,
    detalles,
    ip_origen: ipOrigen,
    timestamp: new Date().toISOString()
  });

  // Alertar si es evento crítico
  if ([EventoSeguridad.MFA_FALLIDO, EventoSeguridad.ANOMALIA_DETECTADA].includes(evento)) {
    await enviarAlerta(evento, userId, detalles);
  }
}
```

---

## PASO 11 — HARDENING FINAL Y CHECKLIST

Ejecuta estas verificaciones y corrígelas si fallan:

```bash
# 1. Auditoría de dependencias
npm audit --audit-level=high
npm audit fix

# 2. Verificar que no haya secretos en el código
npx secretlint "**/*"

# 3. Análisis estático de seguridad
npx semgrep --config=auto src/

# 4. Verificar headers de seguridad en producción
npx security-headers https://tu-erp.vercel.app

# 5. Escaneo de vulnerabilidades en dependencias
npx snyk test

# 6. Verificar que .gitignore excluye todo lo sensible
git status --ignored | grep -E "\.env|\.key|\.enc|/core/"
```

Genera un reporte final en `/docs/REPORTE_SEGURIDAD.md` con:
- Lista de vulnerabilidades encontradas y corregidas
- Políticas RLS activas por tabla
- Módulos cifrados y sus claves hija generadas
- Configuración MFA activa
- Headers HTTP aplicados
- Rate limits configurados

---

## NOTAS IMPORTANTES

- **No subas NUNCA** `/core/`, `*.key`, `.env` a git
- **Rota las claves** cada 90 días usando el script de rotación
- **Prueba el descifrado** antes de hacer deploy a producción
- **Guarda backups** de las claves maestras en un gestor externo (1Password, Bitwarden Business, AWS Secrets Manager)
- Si usas Claude API en el ERP, la clave va SOLO en variables de servidor, nunca en el cliente

---
*Generado para ERP con Supabase + Vercel + Electron — Ciberseguridad en capas*
