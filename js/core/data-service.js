// ================================================
// ARCHIVO: data-service.js
// DESCRIPCIÓN: Capa de acceso a datos con auditoría y encriptación
// SEGURIDAD: Registro de todas las operaciones, validación de permisos
// ================================================

import { authService } from './auth-service.js';
import { sanitizeObject, validateCSRFToken } from './security-middleware.js';
import { encryptField } from './encryption-utils.js';

export class DataService {
  constructor(tableName) {
    this.tableName = tableName;
  }

  get supabase() {
    return window.supabase;
  }

  // ==================== MÉTODO GENÉRICO PARA REGISTRAR AUDITORÍA ====================
  async logAudit(action, recordId, oldData = null, newData = null, severity = 'info', metadata = {}) {
    try {
      const user = await authService.getCurrentProfile();
      const ip = await authService.getClientIP();

      await this.supabase.from('audit_logs').insert({
        table_name: this.tableName,
        record_id: recordId,
        action,
        user_id: user?.id,
        user_email: user?.email,
        user_role: user?.rol,
        ip,
        user_agent: navigator.userAgent,
        old_data: oldData,
        new_data: newData,
        severity,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
        timestamp: new Date().toISOString()
      });
    } catch {
      // Auditoría opcional: si la tabla audit_logs no existe o falla RLS, no bloquear la app
    }
  }

  // ==================== INSERTAR CON ENCRIPTACIÓN Y AUDITORÍA ====================
  async insert(data, csrfToken) {
    if (!validateCSRFToken(csrfToken)) {
      throw new Error('CSRF token inválido');
    }

    if (!await authService.hasPermission(this.tableName, 'create')) {
      throw new Error('Permiso denegado');
    }

    // Sanitizar entradas
    const sanitized = sanitizeObject(data);

    // Marcar campos sensibles para encriptación (la BD se encarga)
    // Aquí solo preparamos el objeto; la función de la BD hará la encriptación.
    // Ejemplo: si hay campos como 'rfc', 'email', 'telefono', 'direccion'
    // En la tabla, esos campos son de tipo bytea y se encriptan con trigger.

    const { data: inserted, error } = await this.supabase
      .from(this.tableName)
      .insert(sanitized)
      .select()
      .single();

    if (error) throw error;

    // Registrar auditoría
    await this.logAudit('INSERT', inserted.id, null, inserted);

    return inserted;
  }

  // ==================== ACTUALIZAR CON AUDITORÍA ====================
  async update(id, data, csrfToken) {
    if (!validateCSRFToken(csrfToken)) {
      throw new Error('CSRF token inválido');
    }

    if (!await authService.hasPermission(this.tableName, 'update')) {
      throw new Error('Permiso denegado');
    }

    // Obtener datos previos para auditoría
    const { data: oldData, error: fetchError } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const sanitized = sanitizeObject(data);

    const { data: updated, error } = await this.supabase
      .from(this.tableName)
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await this.logAudit('UPDATE', id, oldData, updated);

    return updated;
  }

  // ==================== ELIMINAR CON AUDITORÍA ====================
  async delete(id, csrfToken) {
    if (!validateCSRFToken(csrfToken)) {
      throw new Error('CSRF token inválido');
    }

    if (!await authService.hasPermission(this.tableName, 'delete')) {
      throw new Error('Permiso denegado');
    }

    const { data: oldData, error: fetchError } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) throw error;

    await this.logAudit('DELETE', id, oldData, null);

    return true;
  }

  // ==================== SELECCIONAR CON FILTROS Y PAGINACIÓN ====================
  async select(query = {}, options = {}) {
    if (!await authService.hasPermission(this.tableName, 'read')) {
      throw new Error('Permiso denegado');
    }

    // Paginación: page (desde 0) y pageSize (default 100, max 500)
    const page = options.page || 0;
    const pageSize = Math.min(options.pageSize || 100, 500);
    const rangeStart = page * pageSize;
    const rangeEnd = rangeStart + pageSize - 1;

    // Select con columnas específicas o '*' por defecto
    const columns = options.select || '*';
    let supabaseQuery = this.supabase.from(this.tableName).select(columns, { count: options.count ? 'exact' : undefined });

    // Aplicar filtros
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined) return;

      // null -> IS NULL
      if (value === null) {
        supabaseQuery = supabaseQuery.is(key, null);
        return;
      }

      // Array -> IN (...)
      if (Array.isArray(value)) {
        supabaseQuery = supabaseQuery.in(key, value);
        return;
      }

      // Operadores -> { gte, lte, gt, lt, neq, ilike, like, in, contains, containedBy, overlaps, is }
      if (typeof value === 'object' && !(value instanceof Date)) {
        Object.entries(value).forEach(([op, opVal]) => {
          if (opVal === undefined) return;

          switch (op) {
            case 'gte': supabaseQuery = supabaseQuery.gte(key, opVal); break;
            case 'lte': supabaseQuery = supabaseQuery.lte(key, opVal); break;
            case 'gt': supabaseQuery = supabaseQuery.gt(key, opVal); break;
            case 'lt': supabaseQuery = supabaseQuery.lt(key, opVal); break;
            case 'neq': supabaseQuery = supabaseQuery.neq(key, opVal); break;
            case 'ilike': supabaseQuery = supabaseQuery.ilike(key, opVal); break;
            case 'like': supabaseQuery = supabaseQuery.like(key, opVal); break;
            case 'in':
              supabaseQuery = supabaseQuery.in(key, Array.isArray(opVal) ? opVal : [opVal]);
              break;
            case 'contains': supabaseQuery = supabaseQuery.contains(key, opVal); break;
            case 'containedBy': supabaseQuery = supabaseQuery.containedBy(key, opVal); break;
            case 'overlaps': supabaseQuery = supabaseQuery.overlaps(key, opVal); break;
            case 'is': supabaseQuery = supabaseQuery.is(key, opVal); break;
            default:
              // Fallback: si mandan un objeto no reconocido, no romper; tratar como eq
              supabaseQuery = supabaseQuery.eq(key, value);
              break;
          }
        });
        return;
      }

      // Default -> EQ
      supabaseQuery = supabaseQuery.eq(key, value);
    });

    if (options.orderBy) {
      supabaseQuery = supabaseQuery.order(options.orderBy, { ascending: options.ascending !== false });
    }

    if (options.limit) {
      supabaseQuery = supabaseQuery.limit(options.limit);
    }

    // Aplicar paginación con range
    supabaseQuery = supabaseQuery.range(rangeStart, rangeEnd);

    const { data, error } = await supabaseQuery;

    if (error) throw error;

    // Retornar datos con info de paginación si se solicitó count
    if (options.count) {
      return { data, count: error?.details?.count || data?.length };
    }

    return data;
  }

  // ==================== CONTAR REGISTROS ====================
  async count(query = {}) {
    if (!await authService.hasPermission(this.tableName, 'read')) {
      throw new Error('Permiso denegado');
    }

    let supabaseQuery = this.supabase.from(this.tableName).select('*', { count: 'exact', head: true });

    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined) return;
      if (value === null) {
        supabaseQuery = supabaseQuery.is(key, null);
        return;
      }
      if (Array.isArray(value)) {
        supabaseQuery = supabaseQuery.in(key, value);
        return;
      }
      if (typeof value === 'object') {
        Object.entries(value).forEach(([op, opVal]) => {
          if (opVal === undefined) return;
          switch (op) {
            case 'gte': supabaseQuery = supabaseQuery.gte(key, opVal); break;
            case 'lte': supabaseQuery = supabaseQuery.lte(key, opVal); break;
            case 'gt': supabaseQuery = supabaseQuery.gt(key, opVal); break;
            case 'lt': supabaseQuery = supabaseQuery.lt(key, opVal); break;
            case 'neq': supabaseQuery = supabaseQuery.neq(key, opVal); break;
            case 'eq': supabaseQuery = supabaseQuery.eq(key, opVal); break;
          }
        });
        return;
      }
      supabaseQuery = supabaseQuery.eq(key, value);
    });

    const { count, error } = await supabaseQuery;
    if (error) throw error;
    return count || 0;
  }

  // ==================== OBTENER POR ID ====================
  async getById(id) {
    if (!await authService.hasPermission(this.tableName, 'read')) {
      throw new Error('Permiso denegado');
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }
}

// Fábrica para crear servicios por tabla
export function createDataService(tableName) {
  return new DataService(tableName);
}