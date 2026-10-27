// @ts-check
// Bulk register sync between the client asset register and D1.
//   GET  /api/assets/sync → { assets, vendors } (signed-in; seeds a fresh device)
//   POST /api/assets/sync → upsert { assets: [], vendors: [] } (writers only)
// Last-writer-wins per record by `updated` — the client sends its full
// register; the server keeps whichever version is newer. Conflict surfacing
// (never silent overwrite) ships with the mobile offline queue, Day 9.
import { json, sameOrigin } from '../../_lib/session.js';
import { who, canWrite } from '../../_lib/who.js';
import { audit } from '../../_lib/audit.js';

const CAP = 500;

function cleanAsset(a) {
  if (!a || typeof a.serial !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(a.serial)) return null;
  return {
    serial: a.serial, name: String(a.name || a.serial).slice(0, 120),
    category: String(a.category || 'gear').slice(0, 40),
    status: ['available', 'checked-out', 'maintenance', 'retired'].indexOf(a.status) >= 0 ? a.status : 'available',
    condition: String(a.condition || '').slice(0, 20), firmware: String(a.firmware || '').slice(0, 40),
    location: String(a.location || '').slice(0, 120), maintenance_due: String(a.maintenance_due || '').slice(0, 10),
    checked_out_to: String(a.checked_out_to || '').slice(0, 120), checked_out_at: +a.checked_out_at || 0,
    media_keys: JSON.stringify(Array.isArray(a.media_keys) ? a.media_keys.slice(0, 100).map(String) : []),
    updated: +a.updated || Date.now(), updated_by: String(a.updated_by || '').slice(0, 120),
  };
}

function cleanVendor(v) {
  if (!v || typeof v.id !== 'string' || !v.id) return null;
  return {
    id: String(v.id).slice(0, 64), name: String(v.name || v.id).slice(0, 120),
    category: String(v.category || '').slice(0, 40), contact: String(v.contact || '').slice(0, 120),
    email: String(v.email || '').slice(0, 120), phone: String(v.phone || '').slice(0, 40),
    rate_day: isFinite(+v.rate_day) ? +v.rate_day : null,
    reliability: String(v.reliability || '').slice(0, 500), notes: String(v.notes || '').slice(0, 2000),
    updated: +v.updated || Date.now(), updated_by: String(v.updated_by || '').slice(0, 120),
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.MUSE_D1) return json({ ok: false, configured: false, error: 'Asset database is not configured (MUSE_D1 binding).' }, 503);
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  const db = env.MUSE_D1;

  if (request.method === 'GET') {
    const a = await db.prepare('SELECT * FROM assets LIMIT 1000').all();
    const v = await db.prepare('SELECT * FROM vendors LIMIT 500').all();
    return json({ ok: true, assets: a.results || [], vendors: v.results || [] });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);

  let body = null;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Body must be JSON' }, 400); }
  const assets = ((body && body.assets) || []).slice(0, CAP).map(cleanAsset).filter(Boolean);
  const vendors = ((body && body.vendors) || []).slice(0, CAP).map(cleanVendor).filter(Boolean);

  let kept = 0, skipped = 0;
  for (const a of assets) {
    const cur = await db.prepare('SELECT updated FROM assets WHERE serial = ?').bind(a.serial).first();
    if (cur && (+cur.updated || 0) >= a.updated) { skipped++; continue; }
    await db.prepare('INSERT INTO assets (serial, name, category, status, condition, firmware, location, maintenance_due, checked_out_to, checked_out_at, media_keys, updated, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(serial) DO UPDATE SET name=excluded.name, category=excluded.category, status=excluded.status, condition=excluded.condition, firmware=excluded.firmware, location=excluded.location, maintenance_due=excluded.maintenance_due, checked_out_to=excluded.checked_out_to, checked_out_at=excluded.checked_out_at, media_keys=excluded.media_keys, updated=excluded.updated, updated_by=excluded.updated_by').bind(a.serial, a.name, a.category, a.status, a.condition, a.firmware, a.location, a.maintenance_due, a.checked_out_to, a.checked_out_at, a.media_keys, a.updated, a.updated_by).run();
    await db.prepare('DELETE FROM asset_fts WHERE serial = ?').bind(a.serial).run();
    await db.prepare('INSERT INTO asset_fts (serial, name, category, location) VALUES (?, ?, ?, ?)').bind(a.serial, a.name, a.category, a.location).run();
    kept++;
  }
  for (const v of vendors) {
    const cur = await db.prepare('SELECT updated FROM vendors WHERE id = ?').bind(v.id).first();
    if (cur && (+cur.updated || 0) >= v.updated) { skipped++; continue; }
    await db.prepare('INSERT INTO vendors (id, name, category, contact, email, phone, rate_day, reliability, notes, updated, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, contact=excluded.contact, email=excluded.email, phone=excluded.phone, rate_day=excluded.rate_day, reliability=excluded.reliability, notes=excluded.notes, updated=excluded.updated, updated_by=excluded.updated_by').bind(v.id, v.name, v.category, v.contact, v.email, v.phone, v.rate_day, v.reliability, v.notes, v.updated, v.updated_by).run();
    await db.prepare('DELETE FROM vendor_fts WHERE vid = ?').bind(v.id).run();
    await db.prepare('INSERT INTO vendor_fts (vid, name, category, contact, email) VALUES (?, ?, ?, ?, ?)').bind(v.id, v.name, v.category, v.contact, v.email).run();
    kept++;
  }
  await audit(env, { who: user.u, role: user.r, action: 'assets.sync', key: 'register', detail: kept + ' kept, ' + skipped + ' skipped' });
  return json({ ok: true, kept, skipped });
}
