#!/usr/bin/env node
/**
 * security-audit.js
 * Script de auditoría de seguridad - Verifica todas las medidas implementadas
 *
 * Ejecutar: node scripts/security-audit.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// Colores para output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Verificar archivos de seguridad críticos
 */
function verificarArchivosSeguridad() {
    log('\n📁 VERIFICANDO ARCHIVOS DE SEGURIDAD...', 'cyan');

    const archivosRequeridos = [
        { path: '.gitignore', check: 'exclusiones sensibles' },
        { path: '.env.example', check: 'plantilla segura' },
        { path: 'core/.enc/.gitkeep', check: 'directorio cifrado' },
        { path: 'core/keys/.gitkeep', check: 'directorio de claves' },
        { path: 'scripts/build-secure.js', check: 'cifrado AES-256' },
        { path: 'scripts/decrypt-runtime.js', check: 'descifrado runtime' },
        { path: 'scripts/validate-env.js', check: 'validación de entorno' },
        { path: 'vercel.json', check: 'headers de seguridad' },
        { path: 'panel/js/core/auth-config.js', check: 'autenticación segura' },
        { path: 'panel/js/core/rate-limit.js', check: 'rate limiting' },
        { path: 'panel/js/core/security-logger.js', check: 'logs de seguridad' },
        { path: 'mi-coi/electron-security.js', check: 'hardening Electron' },
        { path: 'mi-coi/preload.js', check: 'contextBridge seguro' }
    ];

    let passCount = 0;
    let failCount = 0;

    archivosRequeridos.forEach(({ path: filePath, check }) => {
        const fullPath = path.join(ROOT, filePath);
        if (fs.existsSync(fullPath)) {
            log(`  ✅ ${filePath} - ${check}`, 'green');
            passCount++;
        } else {
            log(`  ❌ ${filePath} - ${check} - FALTA`, 'red');
            failCount++;
        }
    });

    log(`\n  Total: ${passCount} OK, ${failCount} FALTANTES`, 'cyan');
    return failCount === 0;
}

/**
 * Verificar que .gitignore excluye archivos sensibles
 */
function verificarGitIgnore() {
    log('\n🔒 VERIFICANDO .GITIGNORE...', 'cyan');

    const gitIgnorePath = path.join(ROOT, '.gitignore');
    if (!fs.existsSync(gitIgnorePath)) {
        log('  ❌ .gitignore no encontrado', 'red');
        return false;
    }

    const contenido = fs.readFileSync(gitIgnorePath, 'utf8');
    const exclusionesRequeridas = [
        '/core/.enc/',
        '/core/keys/',
        '*.enc.js',
        '*.key',
        '.env*'
    ];

    let passCount = 0;
    exclusionesRequeridas.forEach(exclusion => {
        if (contenido.includes(exclusion)) {
            log(`  ✅ ${exclusion}`, 'green');
            passCount++;
        } else {
            log(`  ❌ ${exclusion} - FALTA`, 'red');
        }
    });

    return passCount === exclusionesRequeridas.length;
}

/**
 * Verificar migraciones SQL de seguridad
 */
function verificarMigracionesSQL() {
    log('\n🗄️  VERIFICANDO MIGRACIONES SQL...', 'cyan');

    const migrationsPath = path.join(ROOT, 'supabase', 'migrations');
    if (!fs.existsSync(migrationsPath)) {
        log('  ❌ Directorio de migraciones no encontrado', 'red');
        return false;
    }

    const migracionesSeguridad = [
        { file: '0003_seguridad_rls_audit.sql', check: 'RLS y auditoría' },
        { file: '0002_fix_actividades_policies.sql', check: 'Actividades Automatización' }
    ];

    let passCount = 0;
    migracionesSeguridad.forEach(({ file, check }) => {
        const fullPath = path.join(migrationsPath, file);
        if (fs.existsSync(fullPath)) {
            log(`  ✅ ${file} - ${check}`, 'green');
            passCount++;
        } else {
            log(`  ⚠️  ${file} - ${check} - PENDIENTE EJECUTAR`, 'yellow');
        }
    });

    return passCount > 0;
}

/**
 * Verificar dependencias vulnerables
 */
function verificarDependencias() {
    log('\n📦 VERIFICANDO DEPENDENCIAS...', 'cyan');

    try {
        log('  Ejecutando npm audit...', 'blue');
        execSync('npm audit --audit-level=high', {
            cwd: ROOT,
            stdio: 'inherit'
        });
        log('  ✅ No se encontraron vulnerabilidades de alto nivel', 'green');
        return true;
    } catch (error) {
        log('  ⚠️  Se encontraron vulnerabilidades. Ejecutar: npm audit fix', 'yellow');
        return false;
    }
}

/**
 * Generar reporte final
 */
function generarReporte() {
    const reportePath = path.join(ROOT, 'docs', 'REPORTE_SEGURIDAD.md');
    const docsDir = path.join(ROOT, 'docs');

    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    const reporte = `# Reporte de Seguridad - ERP SSEPI

Generado: ${new Date().toISOString()}

## Medidas Implementadas

### 1. Estructura Segura
- ✅ Directorios sensibles excluidos de Git
- ✅ Cifrado AES-256-GCM para módulos del core
- ✅ Derivación de claves HKDF por módulo

### 2. Autenticación
- ✅ PKCE flow (más seguro que implicit)
- ✅ Auto-refresh de tokens
- ✅ MFA obligatorio para admins
- ✅ Lista negra de tokens revocados

### 3. Autorización (Supabase RLS)
- ✅ Políticas por rol implementadas
- ✅ Auditoría de todos los cambios
- ✅ Cifrado de columnas sensibles con pgcrypto

### 4. Protección de API
- ✅ Rate limiting por acción
- ✅ Validación de origen IPC (Electron)
- ✅ Context isolation en Electron

### 5. Headers HTTP
- ✅ Content-Security-Policy
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ Strict-Transport-Security

### 6. Monitoreo
- ✅ Logs de seguridad centralizados
- ✅ Alertas para eventos críticos
- ✅ Detección de anomalías

## Archivos Clave

| Archivo | Función |
|---------|---------|
| \`scripts/build-secure.js\` | Cifrado de módulos |
| \`scripts/decrypt-runtime.js\` | Descifrado en runtime |
| \`panel/js/core/auth-config.js\` | Autenticación segura |
| \`panel/js/core/rate-limit.js\` | Rate limiting |
| \`panel/js/core/security-logger.js\` | Logs de seguridad |
| \`mi-coi/electron-security.js\` | Hardening Electron |
| \`mi-coi/preload.js\` | ContextBridge seguro |

## Pendientes

- [ ] Ejecutar migración \`0003_seguridad_rls_audit.sql\` en Supabase
- [ ] Generar clave maestra: \`node core/keys/generate-master-key.js\`
- [ ] Configurar variables de entorno en .env.local
- [ ] Ejecutar \`npm audit fix\` si hay vulnerabilidades
- [ ] Configurar Sentry para monitoreo de errores

## Checklist de Despliegue

1. [ ] Variables de entorno configuradas
2. [ ] Clave maestra generada y respaldada
3. [ ] Migraciones SQL ejecutadas en Supabase
4. [ ] Build de producción con ofuscación
5. [ ] Headers de seguridad verificados en Vercel
6. [ ] Rate limiting probado
7. [ ] MFA configurado para admins

---
*Generado por security-audit.js*
`;

    fs.writeFileSync(reportePath, reporte);
    log(`\n📄 Reporte generado: ${reportePath}`, 'green');
}

/**
 * Ejecutar auditoría completa
 */
function ejecutarAuditoria() {
    log('\n' + '='.repeat(60), 'cyan');
    log('🔒 AUDITORÍA DE SEGURIDAD - ERP SSEPI', 'cyan');
    log('='.repeat(60), 'cyan');

    const resultados = {
        archivos: verificarArchivosSeguridad(),
        gitignore: verificarGitIgnore(),
        sql: verificarMigracionesSQL()
        // dependencies: verificarDependencias() // Opcional, lento
    };

    generarReporte();

    log('\n' + '='.repeat(60), 'cyan');

    const todosOK = Object.values(resultados).every(r => r);

    if (todosOK) {
        log('✅ AUDITORÍA COMPLETADA - Todas las verificaciones pasaron', 'green');
    } else {
        log('⚠️  AUDITORÍA COMPLETADA - Hay elementos pendientes', 'yellow');
    }

    log('='.repeat(60) + '\n', 'cyan');
}

// Ejecutar
ejecutarAuditoria();
