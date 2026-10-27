// @ts-check
// Keyword search across the asset register (D1 binding MUSE_D1).
//   GET /api/assets/search?q=... → [{ kind, id, title, detail }]
// Signed-in users only. 503 with configured:false until MUSE_D1 is bound.
import { json } from '../../_lib/session.js';
import { who } from '../../_lib/who.js';

function ftsQuery(q) {
  const toks = String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2).slice(0, 6);
  if (!toks.length) return null;
  return toks.map((t) => '"' + t + '"*').join(' ');
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.MUSE_D1) return json({ ok: false, configured: false, error: 'Asset database is not configured (MUSE_D1 binding).' }, 503);
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);

  const q = new URL(request.url).searchParams.get('q') || '';
  const match = ftsQuery(q);
  if (!match) return json({ ok: true, q, hits: [] });

  const hits = [];
  try {
    const a = await env.MUSE_D1.prepare(
      "SELECT a.serial, a.name, a.category, a.status, a.location FROM asset_fts f JOIN assets a ON a.serial = f.serial WHERE asset_fts MATCH ? LIMIT 25"
    ).bind(match).all();
    for (const r of (a.results || [])) {
      hits.push({ kind: 'gear', id: r.serial, title: r.name || r.serial, detail: [r.status, r.location].filter(Boolean).join(' · ') });
    }
    const v = await env.MUSE_D1.prepare(
      "SELECT v.id, v.name, v.category FROM vendor_fts f JOIN vendors v ON v.id = f.vid WHERE vendor_fts MATCH ? LIMIT 25"
    ).bind(match).all();
    for (const r of (v.results || [])) {
      hits.push({ kind: 'vendor', id: r.id, title: r.name || r.id, detail: r.category || '' });
    }
  } catch (e) {
    return json({ ok: false, error: 'Search failed' }, 500);
  }
  return json({ ok: true, q, hits: hits.slice(0, 50) });
}
