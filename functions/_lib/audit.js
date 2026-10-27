// @ts-check
// Append-only audit log.
// Primary: D1 table audit_log (one row per entry — strict ordering, real queries).
// Mirror: KV key `audit:<yyyy-mm-dd>` → JSON array (kept while older builds read it).
const MAX_PER_DAY = 5000;

/** @param {any} env @param {{who?:string, role?:string, action:string, key?:string, detail?:any}} e */
export async function audit(env, e) {
  if (!env) return;
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const entry = {
    t: now, who: e.who || 'anonymous', role: e.role || '',
    action: e.action, key: e.key || '', detail: e.detail === undefined ? '' : e.detail,
  };
  try {
    if (env.MUSE_D1) {
      await env.MUSE_D1.prepare(
        'INSERT INTO audit_log (day, t, who, role, action, key, detail) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(day, entry.t, entry.who, entry.role, entry.action, entry.key, String(entry.detail).slice(0, 4000)).run();
    }
  } catch (err) { try { console.error('audit d1:', err && err.message || err); } catch (e2) {} }
  if (!env.MUSE_KV) return;
  const k = 'audit:' + day;
  try {
    const list = (await env.MUSE_KV.get(k, { type: 'json' })) || [];
    list.push(entry);
    if (list.length > MAX_PER_DAY) list.splice(0, list.length - MAX_PER_DAY);
    await env.MUSE_KV.put(k, JSON.stringify(list), { expirationTtl: 60 * 60 * 24 * 400 });
  } catch (err) { try { console.error('audit:', k, err && err.message || err); } catch (e2) {} }
}
