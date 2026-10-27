// @ts-check
// GET /api/audit?date=YYYY-MM-DD → that day's audit entries (admins only).
// Reads D1 audit_log when bound (strict order, real query); falls back to the
// KV mirror otherwise. Strings from _lib/strings.js (en/es/pt via Accept-Language).
import { json } from '../_lib/session.js';
import { who, isAdmin } from '../_lib/who.js';
import { resolveLang, t } from '../_lib/strings.js';
export async function onRequestGet(context) {
  const { request, env } = context;
  const lang = resolveLang(request);
  if (!isAdmin(await who(context))) return json({ ok: false, error: t(lang, 'adminsOnly') }, 403);
  const date = new URL(request.url).searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: t(lang, 'badDate') }, 400);
  if (env.MUSE_D1) {
    const r = await env.MUSE_D1.prepare(
      'SELECT t, who, role, action, key, detail FROM audit_log WHERE day = ? ORDER BY id ASC LIMIT 5000'
    ).bind(date).all();
    return json({ ok: true, date, source: 'd1', entries: r.results || [] });
  }
  if (!env.MUSE_KV) return json({ ok: false, configured: false, error: t(lang, 'needAuditBinding') }, 503);
  return json({ ok: true, date, source: 'kv', entries: (await env.MUSE_KV.get('audit:' + date, { type: 'json' })) || [] });
}
