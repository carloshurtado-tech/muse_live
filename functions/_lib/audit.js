// @ts-check
// Append-only audit log: D1 table audit_log only (one row per entry — strict
// ordering, real queries, concurrent-safe). The old KV mirror kept the day's
// entries in one JSON array capped at 5,000: concurrent writers lost entries
// and anyone who could add entries (for example repeated guest logins) could
// flush the day's evidence. It is gone; without a D1 binding entries are
// dropped rather than written somewhere flushable.
/** @param {any} env @param {{who?:string, role?:string, action:string, key?:string, detail?:any}} e */
export async function audit(env, e) {
  if (!env || !env.MUSE_D1) return;
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  try {
    await env.MUSE_D1.prepare(
      'INSERT INTO audit_log (day, t, who, role, action, key, detail) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(day, now, e.who || 'anonymous', e.role || '', e.action, e.key || '', String(e.detail === undefined ? '' : e.detail).slice(0, 4000)).run();
  } catch (err) { try { console.error('audit d1:', err && err.message || err); } catch (e2) {} }
}
