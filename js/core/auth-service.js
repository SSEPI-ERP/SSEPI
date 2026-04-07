// ================================================
// ARCHIVO: auth-service.js
// DESCRIPCIÓN: Servicio de autenticación y gestión de usuarios
// SEGURIDAD: MFA, rate limiting, bloqueo de cuenta, auditoría
// ================================================

import { sha256, calculateRecordHash } from './encryption-utils.js';
import { checkRateLimit } from './security-middleware.js';

export class AuthService {
  constructor() {}

  get supabase() {
    return window.supabase;
  }

  // ==================== LOGIN CON MFA ====================
  async login(email, password) {
    // Rate limiting por IP
    const ip = await this.getClientIP();
    if (!checkRateLimit(ip)) {
      throw new Error('Demasiados intentos. Intenta más tarde.');
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      // Registrar intento fallido
      await this.logAuthAttempt(email, false, ip, error.message);
      throw error;
    }

  // Verificar si el usuario tiene MFA habilitado
  const { data: mfaFactors } = await this.supabase.auth.mfa.listFactors();
  const hasMFA = mfaFactors?.factors?.some(f => f.status === 'verified');

  // TODO: cuando Supabase Auth exponga WebAuthn/passkeys, añadir aquí:
  // - listado de factores tipo 'webauthn' (passkeys)
  // - flujo de registro: signInWithPassword -> mfa.enroll con factor tipo webauthn
  // - flujo de login: si tiene passkey, challengeAndVerify con factorId del passkey (resistente a phishing)
  // Ver docs/security-architecture.md sección MFA y passkeys.

  if (hasMFA) {
      // Si tiene MFA, la sesión aún no es completa; esperamos segundo factor
      // En este punto, la app debe redirigir a la verificación MFA
      return { requiresMFA: true, userId: data.user.id };
    }

    // Registrar intento exitoso
    await this.logAuthAttempt(email, true, ip, 'Login exitoso');
    return { user: data.user, session: data.session };
  }

  async verifyMFA(factorId, code) {
    const { data, error } = await this.supabase.auth.mfa.challengeAndVerify({
      factorId,
      code
    });
    if (error) throw error;
    return data;
  }

  // ==================== LOGOUT ====================
  async logout() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    sessionStorage.clear();
    localStorage.removeItem('sb-knzmdwjmrhcoytmebdwa-auth-token');
  }

  // ==================== REGISTRO DE INTENTOS DE AUTENTICACIÓN ====================
  async logAuthAttempt(email, success, ip, details) {
    try {
      const hash = await sha256(email + Date.now() + ip);
      await this.supabase.from('auth_logs').insert({
        email_hash: hash,
        success,
        ip,
        user_agent: navigator.userAgent,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error al registrar intento de autenticación:', err);
    }
  }

  // ==================== OBTENER IP DEL CLIENTE (simulado) ====================
  async getClientIP() {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return data.ip;
    } catch {
      return '0.0.0.0';
    }
  }

  // ==================== CAMBIO DE CONTRASEÑA ====================
  async changePassword(currentPassword, newPassword) {
    const { error } = await this.supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
    return true;
  }

  // ==================== SOLICITUD DE RESTABLECIMIENTO ====================
  async resetPassword(email) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });
    if (error) throw error;
  }

  /** Solicitar al usuario que cambie su contraseña: envía correo desde Supabase al email indicado. */
  async requestPasswordResetForUser(email) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/'
    });
    if (error) throw error;
  }

  /** Listar todos los perfiles (requiere que RLS permita a admin leer todos). */
  async listProfiles() {
    // El proyecto puede usar: usuarios, users o profiles (compatibilidad).
    const candidates = [
      { table: 'usuarios', select: 'auth_user_id, email, nombre, rol, telefono, created_at' },
      { table: 'users', select: 'auth_user_id, email, nombre, rol, telefono, created_at' },
      { table: 'profiles', select: 'id, email, nombre, rol, telefono, created_at' },
    ];
    for (const c of candidates) {
      try {
        const { data, error } = await this.supabase
          .from(c.table)
          .select(c.select)
          .order('nombre', { ascending: true });
        if (error) throw error;
        const list = Array.isArray(data) ? data : [];
        // Normalizar salida a {id,email,nombre,rol,...}
        return list.map((row) => ({
          id: row.id || row.auth_user_id,
          email: row.email,
          nombre: row.nombre,
          rol: row.rol,
          telefono: row.telefono ?? null,
          created_at: row.created_at,
          auth_user_id: row.auth_user_id || row.id,
        }));
      } catch (_) {
        // intentar siguiente tabla
      }
    }
    throw new Error("No se encontró tabla de perfiles (usuarios/users/profiles) o no hay permisos.");
  }

  /** Eliminar perfil por id (solo desde backend/admin en producción). La fila en auth.users debe gestionarse desde Dashboard o Admin API. */
  async deleteProfile(profileId) {
    // Intentar borrar por auth_user_id/id dependiendo del esquema.
    const attempts = [
      { table: 'usuarios', col: 'auth_user_id' },
      { table: 'users', col: 'auth_user_id' },
      { table: 'profiles', col: 'id' },
    ];
    let lastErr = null;
    for (const a of attempts) {
      const { error } = await this.supabase.from(a.table).delete().eq(a.col, profileId);
      if (!error) return;
      lastErr = error;
    }
    if (lastErr) throw lastErr;
  }

  /** Lee si el usuario actual puede ver costos (tabla users_ver_costos). Por defecto true. */
  async _getVerCostos(authUserId) {
    try {
      const { data, error } = await this.supabase
        .from('users_ver_costos')
        .select('ver_costos')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (error || !data) return true;
      return data.ver_costos === true;
    } catch {
      return true;
    }
  }

  // ==================== OBTENER PERFIL DEL USUARIO ACTUAL ====================
  async getCurrentProfile() {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;

    // Intentar primero usuarios/users (tu proyecto no usa tabla profiles)
    const { data: usuarioData, error: usuarioError } = await this.supabase
      .from('usuarios')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!usuarioError && usuarioData) {
      const ver_costos = await this._getVerCostos(user.id);
      return {
        id: user.id,
        email: user.email || usuarioData.email,
        nombre: usuarioData.nombre ?? usuarioData.email ?? user.email?.split('@')[0] ?? 'Usuario',
        rol: usuarioData.rol || 'ventas',
        telefono: usuarioData.telefono ?? null,
        auth_user_id: usuarioData.auth_user_id,
        departamento: usuarioData.departamento ?? null,
        sede: usuarioData.sede ?? null,
        nivel_riesgo: usuarioData.nivel_riesgo ?? null,
        ver_costos
      };
    }

    const { data: usersData, error: usersError } = await this.supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!usersError && usersData) {
      const ver_costos = await this._getVerCostos(user.id);
      return {
        id: user.id,
        email: user.email || usersData.email,
        nombre: usersData.nombre ?? usersData.email ?? user.email?.split('@')[0] ?? 'Usuario',
        rol: usersData.rol || 'ventas',
        telefono: usersData.telefono ?? null,
        auth_user_id: usersData.auth_user_id,
        departamento: usersData.departamento ?? null,
        sede: usersData.sede ?? null,
        nivel_riesgo: usersData.nivel_riesgo ?? null,
        ver_costos
      };
    }

    // Solo si no existe usuarios ni users, intentar profiles (por compatibilidad)
    const { data: profileData, error: profileError } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profileError && profileData) {
      const ver_costos = await this._getVerCostos(user.id);
      return { ...profileData, ver_costos };
    }

    // Fallo: priorizar error de users/usuarios (ej. 500) sobre profiles (tabla inexistente)
    if (usersError) throw usersError;
    if (usuarioError) throw usuarioError;
    if (profileError) throw profileError;
    return null;
  }

  // ==================== ACTUALIZAR PERFIL (nombre, teléfono, email) ====================
  async updateProfile({ nombre, telefono, email }) {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('No hay sesión');

    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (telefono !== undefined) updates.telefono = telefono ?? null;
    if (email !== undefined && email !== user.email) {
      const { error: emailError } = await this.supabase.auth.updateUser({ email });
      if (emailError) throw emailError;
      updates.email = email;
    }

    if (Object.keys(updates).length === 0) return await this.getCurrentProfile();

    // Actualizar en la tabla real (usuarios/users/profiles)
    const attempts = [
      { table: 'usuarios', col: 'auth_user_id' },
      { table: 'users', col: 'auth_user_id' },
      { table: 'profiles', col: 'id' },
    ];
    let lastErr = null;
    for (const a of attempts) {
      try {
        const { data, error } = await this.supabase
          .from(a.table)
          .update(updates)
          .eq(a.col, user.id)
          .select()
          .maybeSingle();
        if (!error) return data || (await this.getCurrentProfile());
        lastErr = error;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    return await this.getCurrentProfile();
  }

  // ==================== VERIFICAR PERMISO ====================
  async hasPermission(module, action) {
    const profile = await this.getCurrentProfile();
    if (!profile) return false;
    if (profile.rol === 'admin' || profile.rol === 'superadmin') return true;

    const { data, error } = await this.supabase
      .from('role_permissions')
      .select('id')
      .eq('rol', profile.rol)
      .eq('module', module)
      .eq('action', action)
      .maybeSingle();

    if (data) return true;

    const { data: wildcard } = await this.supabase
      .from('role_permissions')
      .select('id')
      .eq('rol', profile.rol)
      .eq('module', '*')
      .in('action', [action, '*'])
      .limit(1)
      .maybeSingle();

    return !!wildcard;
  }

  /** Devuelve violaciones SoD para el usuario actual (para deshabilitar acciones en UI). Si falla, devuelve []. */
  async getSodViolations() {
    try {
      const { data, error } = await this.supabase.rpc('get_sod_violations_for_current_user');
      if (error) return [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  // ==================== REQUERIR AUTENTICACIÓN (redirige si no hay sesión) ====================
  async requireAuth(redirectTo = '/') {
    if (!this.supabase) {
      console.error('SSEPI: Supabase no inicializado. Comprueba que supabase-config.js se cargue antes.');
      window.location.href = redirectTo;
      return null;
    }
    const { data: { user }, error } = await this.supabase.auth.getUser();
    if (error) {
      console.error('SSEPI: Error al verificar sesión:', error);
      window.location.href = redirectTo;
      return null;
    }
    if (!user) {
      window.location.href = redirectTo;
      return null;
    }
    return user;
  }
}

// Instancia global
export const authService = new AuthService();
window.authService = authService;