/**
 * Script para crear usuarios en Supabase Auth y en public.users.
 * Ejecutar UNA VEZ con: node scripts/create-users-seed.js
 *
 * Requiere variables de entorno:
 *   SUPABASE_URL=https://knzmdwjmrhcoytmebdwa.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<tu Service Role Key del Dashboard>
 *
 * La Service Role Key está en: Project Settings → API → service_role (secret).
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://knzmdwjmrhcoytmebdwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY. Ponla en el entorno o en .env.');
  process.exit(1);
}

// Contraseña provisional para todos (cambiar en primer acceso)
const PASSWORD_PROVISIONAL = 'Ssepi2025!';

const USUARIOS = [
  // Admins (primeros 4)
  { email: 'automatizacion@ssepi.org', nombre: 'Automatización', rol: 'admin' },
  { email: 'administracion@ssepi.org', nombre: 'Administración', rol: 'admin' },
  { email: 'ventas@ssepi.org', nombre: 'Ventas Admin', rol: 'admin' },
  { email: 'electronica@ssepi.org', nombre: 'Electrónica Admin', rol: 'admin' },
  // Usuarios
  { email: 'electronica.ssepi@gmail.com', nombre: 'Electrónica SSEPI', rol: 'ventas_sin_compras' },
  { email: 'ivang.ssepi@gmail.com', nombre: 'Ivan (Automatización)', rol: 'automatizacion' },
  { email: 'ventas1@ssepi.org', nombre: 'Ventas 1', rol: 'ventas' },
];

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('Creando usuarios en Auth y en public.users...\n');

  for (const u of USUARIOS) {
    try {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: PASSWORD_PROVISIONAL,
        email_confirm: true,
      });

      if (authError) {
        if (authError.message && authError.message.includes('already been registered')) {
          console.log('  [YA EXISTE]', u.email, '- omitiendo Auth (añadiendo/actualizando solo public.users si aplica)');
          const { data: existing } = await supabase.auth.admin.listUsers();
          const found = existing?.users?.find(x => x.email === u.email);
          if (found) {
            const { error: insertError } = await supabase.from('users').upsert({
              auth_user_id: found.id,
              email: u.email,
              nombre: u.nombre,
              rol: u.rol,
            }, { onConflict: 'auth_user_id' });
            if (insertError) console.error('    Error en users:', insertError.message);
            else console.log('    Perfil en public.users actualizado.');
          }
          continue;
        }
        throw authError;
      }

      const userId = authUser.user?.id;
      if (!userId) {
        console.error('  [ERROR]', u.email, '- no se obtuvo id de Auth');
        continue;
      }

      const { error: insertError } = await supabase.from('users').upsert({
        auth_user_id: userId,
        email: u.email,
        nombre: u.nombre,
        rol: u.rol,
      }, { onConflict: 'auth_user_id' });

      if (insertError) {
        console.error('  [ERROR]', u.email, '- insert users:', insertError.message);
      } else {
        console.log('  [OK]', u.email, '→', u.rol);
      }
    } catch (err) {
      console.error('  [ERROR]', u.email, err.message || err);
    }
  }

  console.log('\nContraseña provisional para todos:', PASSWORD_PROVISIONAL);
  console.log('Indica a cada usuario que la cambie en: Configuración (perfil) → Cambiar contraseña.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
