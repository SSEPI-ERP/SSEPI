/** Misma regla que panel/js/core/hidden-profiles.js (proxy / seeds locales). */
export const HIDDEN_PROFILE_EMAILS = ['norbertomoro4@gmail.com'];
export const HIDDEN_PROFILE_NAMES = ['norberto moreno', 'norberto moro'];
export const HIDDEN_USER_IDS = ['user-001', '65a2920c-bb4a-4b64-9e31-ccd47545120d'];

function normName(name) {
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
  const name = normName(record.nombre || record.name);
  if (name && HIDDEN_PROFILE_NAMES.includes(name)) return true;
  const id = record.user_id || record.auth_user_id || record.id;
  if (id && HIDDEN_USER_IDS.includes(id)) return true;
  return false;
}

export function filterVisibleProfiles(list) {
  return (list || []).filter((item) => !isHiddenProfile(item));
}
