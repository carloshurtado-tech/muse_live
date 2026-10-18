// @ts-check
// Append-only audit log: KV key `audit:<yyyy-mm-dd>` → JSON array of {t, who, role, action, key, detail}.
// KV has no atomic append, so concurrent writers can race; entries are small and the window
// is short, which is acceptable for an operations audit trail (documented in docs/SECURITY.md).
const MAX_PER_DAY = 5000;

/** @param {any} env @param {{who?:string, role?:string, action:string, key?:string, detail?:any}} e */
export async function audit(env, e) {
  if (!env || !env.MUSE_KV) return;
  const day = new Date().toISOString().slice(0, 10);
  const k = 'audit:' + day;
  try {
    const list = (await env.MUSE_KV.get(k, { type: 'json' })) || [];
    list.push({ t: new Date().toISOString(), who: e.who || 'anonymous', role: e.role || '', action: e.action, key: e.key || '', detail: e.detail === undefined ? '' : e.detail });
    if (list.length > MAX_PER_DAY) list.splice(0, list.length - MAX_PER_DAY);
    await env.MUSE_KV.put(k, JSON.stringify(list), { expirationTtl: 60 * 60 * 24 * 400 });
  } catch (err) { try { console.error('audit:', k, err && err.message || err); } catch (e) {} }
}
