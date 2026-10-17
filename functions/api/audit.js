// @ts-check
// GET /api/audit?date=YYYY-MM-DD → that day's audit entries (admins only).
import { json } from '../_lib/session.js';
import { who, isAdmin } from '../_lib/who.js';
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.MUSE_KV) return json({ ok: false, configured: false, error: 'Audit log needs the MUSE_KV binding.' }, 503);
  if (!isAdmin(await who(context))) return json({ ok: false, error: 'Admins only' }, 403);
  const date = new URL(request.url).searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'Bad date' }, 400);
  return json({ ok: true, date, entries: (await env.MUSE_KV.get('audit:' + date, { type: 'json' })) || [] });
}
