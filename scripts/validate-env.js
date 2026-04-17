/**
 * validate-env.js
 * Valida que todas las variables de entorno requeridas estén presentes
 * Ejecutar antes de iniciar el servidor en producción
 */

const fs = require('fs');
const path = require('path');

// Variables requeridas para producción
const VARIABLES_REQUERIDAS = [
    // Supabase
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',

    // Cifrado
    'MASTER_ENCRYPTION_KEY',
    'DATABASE_ENCRYPTION_KEY',

    // JWT
    'JWT_SECRET',

    // Rate Limiting (Upstash Redis)
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',

    // Sentry (monitoreo)
    'SENTRY_DSN'
];

// Variables opcionales pero recomendadas
const VARIABLES_RECOMENDADAS = [
    'CLAUDE_API_KEY',
    'VERCEL_ENV',
    'VERCEL_URL'
];

// Validaciones específicas
const VALIDACIONES_ESPECIALES = {
    MASTER_ENCRYPTION_KEY: {
        validador: (valor) => valor.length >= 64,
        mensaje: 'debe tener al menos 64 caracteres hex (32 bytes)'
    },
    DATABASE_ENCRYPTION_KEY: {
        validador: (valor) => valor.length >= 32,
        mensaje: 'debe tener al menos 32 caracteres hex (16 bytes)'
    },
    JWT_SECRET: {
        validador: (valor) => valor.length >= 32,
        mensaje: 'debe tener al menos 32 caracteres'
    },
    SUPABASE_URL: {
        validador: (valor) => valor.startsWith('https://') && valor.includes('.supabase.co'),
        mensaje: 'debe ser una URL válida de Supabase (https://)'
    }
};

/**
 * Cargar variables desde .env.local
 */
function cargarEnvLocal() {
    const envPath = path.join(__dirname, '..', '.env.local');

    if (!fs.existsSync(envPath)) {
        console.warn('⚠️  .env.local no encontrado');
        return {};
    }

    const contenido = fs.readFileSync(envPath, 'utf8');
    const variables = {};

    contenido.split('\n').forEach(linea => {
        const [clave, ...valorParts] = linea.split('=');
        if (clave && valorParts.length > 0) {
            variables[clave.trim()] = valorParts.join('=').trim();
        }
    });

    return variables;
}

/**
 * Validar variables de entorno
 */
function validarVariablesEntorno() {
    console.log('🔒 Validando variables de entorno...\n');

    const env = {
        ...process.env,
        ...cargarEnvLocal()
    };

    let errores = 0;
    let advertencias = 0;

    // Validar requeridas
    console.log('📋 Variables requeridas:');
    VARIABLES_REQUERIDAS.forEach(varName => {
        const valor = env[varName];

        if (!valor) {
            console.error(`  ❌ ${varName}: FALTA`);
            errores++;
            return;
        }

        // Aplicar validación especial si existe
        const validacion = VALIDACIONES_ESPECIALES[varName];
        if (validacion && !validacion.validador(valor)) {
            console.error(`  ❌ ${varName}: ${validacion.mensaje}`);
            errores++;
            return;
        }

        // Ocultar valor en logs (solo mostrar primeros 4 chars)
        const valorMask = valor.substring(0, 4) + '...' + valor.substring(valor.length - 4);
        console.log(`  ✅ ${varName}: ${valorMask}`);
    });

    // Validar recomendadas
    console.log('\n📋 Variables recomendadas:');
    VARIABLES_RECOMENDADAS.forEach(varName => {
        const valor = env[varName];

        if (!valor) {
            console.warn(`  ⚠️  ${varName}: No establecida (recomendada)`);
            advertencias++;
            return;
        }

        console.log(`  ✅ ${varName}: configurada`);
    });

    // Resumen
    console.log('\n' + '='.repeat(50));

    if (errores > 0) {
        console.error(`❌ VALIDACIÓN FALLIDA: ${errores} error(es) encontrados`);
        console.error('\nCorrige los errores antes de continuar.');
        console.error('Las variables deben estar en .env.local o el entorno del sistema.');
        process.exit(1);
    }

    if (advertencias > 0) {
        console.warn(`⚠️  VALIDACIÓN CON ADVERTENCIAS: ${advertencias} variable(s) recomendadas faltan`);
    }

    console.log('✅ VALIDACIÓN EXITOSA - Todas las variables requeridas están presentes');
    console.log('='.repeat(50) + '\n');

    return true;
}

// Ejecutar validación
validarVariablesEntorno();

module.exports = { validarVariablesEntorno };
