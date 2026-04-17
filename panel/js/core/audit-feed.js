/**
 * Feed de auditoría (audit_logs) por módulo.
 *
 * Requiere:
 * - Tabla public.audit_logs con RLS/permiso de lectura para authenticated
 * - Elementos DOM: #feedList y #feedCount (por defecto)
 */
export function initAuditFeed({
  tables = [],
  listId = 'feedList',
  countId = 'feedCount',
  limit = 20,
  label = 'SISTEMA',
  accentCssVar = '--module-accent',
} = {}) {
  const listEl = document.getElementById(listId);
  const countEl = document.getElementById(countId);
  const supabase = window.supabase;
  const tableFilter = (tables || []).map((t) => String(t).trim()).filter(Boolean);
  if (!listEl || !countEl || !supabase) return { refresh: async () => {}, cleanup: () => {} };

  function tableFromLog(log) {
    if (!log) return '';
    if (log.table_name) return String(log.table_name);
    if (log.metadata && typeof log.metadata === 'object' && log.metadata.table) return String(log.metadata.table);
    return '';
  }

  const render = (rows) => {
    listEl.innerHTML = '';
    rows.forEach((log) => {
      const item = document.createElement('div');
      item.className = 'feed-item';
      const ts = log.timestamp || log.created_at;
      const when = ts ? new Date(ts) : null;
      const time = when ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
      const tbl = tableFromLog(log);
      const table = (tbl || '').toUpperCase() || 'SISTEMA';
      const action = (log.action || log.accion || '').toUpperCase() || 'EVENTO';
      const rid = (log.record_id || '').toString();
      const who = (log.user_email || log.usuario || log.user_role || '').toString();
      const whoShort = who.length > 22 ? who.slice(0, 20) + '…' : who;
      item.innerHTML = `
        <div class="feed-dot"></div>
        <div class="feed-meta">
          <span style="color:var(${accentCssVar}); font-weight:800;">${label}</span>
          <span>${time}</span>
        </div>
        <div class="feed-body"><strong>${action}</strong> ${table}${rid ? ` <span style="opacity:.7">${rid.slice(0, 8)}…</span>` : ''}${whoShort ? `<br><span style="opacity:.75;font-size:10px;">${whoShort}</span>` : ''}</div>
      `;
      listEl.appendChild(item);
    });
    countEl.innerText = String(rows.length);
  };

  const refresh = async () => {
    const take = Math.min(200, Math.max(limit * 4, limit));
    try {
      // Esquema inglés (init) vs español (accion, usuario, created_at): usar * y orden por columna existente
      let { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(take);
      if (error) {
        ({ data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(take));
      }
      if (error) throw error;
      let rows = data || [];
      if (tableFilter.length) {
        rows = rows.filter((log) => tableFilter.includes(tableFromLog(log)));
      }
      rows = rows.slice(0, limit);
      render(rows);
    } catch (e) {
      listEl.innerHTML = `<div class="feed-item"><div class="feed-dot"></div><div class="feed-body">Bitácora no disponible.</div></div>`;
      countEl.innerText = '0';
    }
  };

  const channel = supabase
    .channel(`audit_feed_${listId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => refresh())
    .subscribe();

  refresh();

  const cleanup = () => {
    try { channel.unsubscribe(); } catch (_) {}
  };
  window.addEventListener('beforeunload', cleanup);

  return { refresh, cleanup };
}

