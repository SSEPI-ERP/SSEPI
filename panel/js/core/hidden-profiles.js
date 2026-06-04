/**
 * Perfiles que no deben aparecer en listas de empleados (vacaciones, nómina,
 * automatización, taller, motores, actividades, etc.). El usuario sigue
 * pudiendo iniciar sesión; solo se excluye de selectores y calendarios.
 */
export const HIDDEN_PROFILE_EMAILS = ['norbertomoro4@gmail.com'];

export const HIDDEN_PROFILE_NAMES = ['norberto moreno', 'norberto moro'];

/** IDs conocidos (offline user-001, Supabase auth, etc.) */
export const HIDDEN_USER_IDS = [
  'user-001',
  '65a2920c-bb4a-4b64-9e31-ccd47545120d',
];

export function normalizeProfileName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isHiddenProfile(record) {
  if (!record) return false;
  const email = String(record.email || '').trim().toLowerCase();
  if (email && HIDDEN_PROFILE_EMAILS.includes(email)) return true;
  const name = normalizeProfileName(record.nombre || record.name);
  if (name && HIDDEN_PROFILE_NAMES.includes(name)) return true;
  const id = record.user_id || record.auth_user_id || record.id;
  if (id && HIDDEN_USER_IDS.includes(id)) return true;
  return false;
}

export function filterVisibleProfiles(list) {
  return (list || []).filter((item) => !isHiddenProfile(item));
}

/** Conjunto de user_id / auth_user_id a excluir de calendarios y balances. */
export function resolveHiddenUserIds(empleados, users) {
  const ids = new Set(HIDDEN_USER_IDS);
  [...(empleados || []), ...(users || [])].forEach((row) => {
    if (!isHiddenProfile(row)) return;
    const uid = row.user_id || row.auth_user_id || row.id;
    if (uid) ids.add(uid);
  });
  return ids;
}

export function isHiddenUserId(userId, hiddenSet) {
  if (!userId) return false;
  if (hiddenSet && typeof hiddenSet.has === 'function') return hiddenSet.has(userId);
  return HIDDEN_USER_IDS.includes(userId);
}
